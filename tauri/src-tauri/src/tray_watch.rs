//! Página descarregada na bandeja.
//!
//! Com a janela escondida, o motor web continuava inteiro na memória (no Linux, o processo das
//! páginas do WebKit sozinho passava de 400 MB). Nos modos de memória equilibrado e mínimo, depois
//! de um tempo na bandeja e FORA de call, a janela é destruída: os processos do motor web acabam e
//! fica só o app em Rust. Abrir de novo (bandeja, atalho, notificação) recria a janela e o site
//! carrega de novo em 1–2 s.
//!
//! Enquanto a página não existe, este módulo mantém UMA conexão WebSocket leve com o servidor, com
//! a mesma sessão (o cookie que a página usava), só pra avisar: mensagem direta e menção viram
//! notificação do sistema e contador na bandeja, como a página faria (08-notifications.js).

use crate::app::{AppState, MAIN};
use crate::server::log;
use crate::{tray, webview_setup};
use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, Url};
use tauri_plugin_notification::NotificationExt;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, Message};

/// quanto tempo escondida até descarregar (voltar logo — fechou sem querer — não recarrega nada)
const UNLOAD_AFTER: Duration = Duration::from_secs(90);
/// em call: confere de novo a cada tanto (descarrega quando sair)
const RECHECK_EVERY: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct Watch(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

/// a janela acabou de ser escondida na bandeja: agenda o descarregamento
pub fn schedule_unload(app: &AppHandle) {
    if webview_setup::memory_mode() == webview_setup::MemoryMode::Alto {
        return; // "alto desempenho": a página fica viva, como antes
    }
    let st = app.state::<AppState>();
    let gen = st.hide_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut wait = UNLOAD_AFTER;
        loop {
            tokio::time::sleep(wait).await;
            let st = app.state::<AppState>();
            if st.hide_gen.load(Ordering::SeqCst) != gen || st.quitting.load(Ordering::SeqCst) {
                return; // abriram a janela de novo (ou está saindo)
            }
            let Some(win) = app.get_webview_window(MAIN) else { return };
            if win.is_visible().unwrap_or(true) {
                return;
            }
            if st.busy.load(Ordering::SeqCst) || app.get_webview_window(crate::picker::LABEL).is_some() {
                wait = RECHECK_EVERY;
                continue;
            }
            unload(&app).await;
            return;
        }
    });
}

/// a janela vai aparecer: cancela o descarregamento agendado
pub fn cancel_unload(app: &AppHandle) {
    app.state::<AppState>().hide_gen.fetch_add(1, Ordering::SeqCst);
}

async fn unload(app: &AppHandle) {
    let st = app.state::<AppState>();
    let Some(win) = app.get_webview_window(MAIN) else { return };
    let site = st.site();
    let on_site = win.url().map(|u| st.is_site(&u)).unwrap_or(false);
    // a sessão da página, pra conexão leve usar a mesma conta (fica só na memória)
    let cookie = match (on_site, Url::parse(&site)) {
        (true, Ok(url)) => win
            .cookies_for_url(url)
            .map(|list| list.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; "))
            .unwrap_or_default(),
        _ => String::new(),
    };
    log::info("bandeja: descarregando a página pra liberar memória (abre de novo ao clicar no ícone)");
    st.unloaded.store(true, Ordering::SeqCst);
    let _ = win.destroy();
    if !cookie.is_empty() {
        start(app, site, cookie);
    }
}

/// a janela foi recriada: para a conexão leve (a página assume)
pub fn stop(app: &AppHandle) {
    let st = app.state::<AppState>();
    st.unloaded.store(false, Ordering::SeqCst);
    if let Some(h) = app.state::<Watch>().0.lock().unwrap().take() {
        h.abort();
    }
}

fn start(app: &AppHandle, site: String, cookie: String) {
    let handle = tauri::async_runtime::spawn(run(app.clone(), site, cookie));
    if let Some(old) = app.state::<Watch>().0.lock().unwrap().replace(handle) {
        old.abort();
    }
}

async fn get_json(app: &AppHandle, url: &str, cookie: &str) -> Result<serde_json::Value, u16> {
    let st = app.state::<AppState>();
    let res = st.http.get(url).header("cookie", cookie).timeout(Duration::from_secs(15)).send().await.map_err(|_| 0u16)?;
    if !res.status().is_success() {
        return Err(res.status().as_u16());
    }
    res.json().await.map_err(|_| 0u16)
}

async fn run(app: AppHandle, site: String, cookie: String) {
    let base = site.trim_end_matches('/').to_string();
    let mut delay = 2u64;
    loop {
        match connect_once(&app, &base, &cookie).await {
            Ok(true) => delay = 2, // ficou conectada e caiu: tenta de novo logo
            Ok(false) => {}
            Err(Stop) => {
                log::warn("bandeja: a sessão expirou; os avisos voltam quando a janela abrir de novo");
                return;
            }
        }
        tokio::time::sleep(Duration::from_secs(delay)).await;
        delay = (delay * 2).min(60);
    }
}

/// erro que não adianta tentar de novo (sessão inválida)
struct Stop;

/// Ok(true) = conectou (e caiu depois); Ok(false) = nem conectou
async fn connect_once(app: &AppHandle, base: &str, cookie: &str) -> Result<bool, Stop> {
    let me = match get_json(app, &format!("{base}/api/auth/me"), cookie).await {
        Ok(v) => v["user"]["id"].as_i64().unwrap_or(0),
        Err(401 | 403) => return Err(Stop),
        Err(_) => return Ok(false),
    };
    if me == 0 {
        return Err(Stop);
    }
    let ticket = match get_json(app, &format!("{base}/api/ws/ticket"), cookie).await {
        Ok(v) => v["ticket"].as_str().unwrap_or_default().to_string(),
        Err(401 | 403) => return Err(Stop),
        Err(_) => return Ok(false),
    };
    let ws_url = format!("{}/ws?ticket={ticket}", base.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1));
    let Ok(mut req) = ws_url.as_str().into_client_request() else { return Ok(false) };
    if let Ok(v) = HeaderValue::from_str(cookie) {
        req.headers_mut().insert("cookie", v);
    }
    let Ok(Ok((stream, _))) = tokio::time::timeout(Duration::from_secs(20), tokio_tungstenite::connect_async(req)).await else {
        return Ok(false);
    };
    log::info("bandeja: conexão leve com o servidor aberta (avisos de DM e menção)");
    let (mut tx, mut rx) = stream.split();
    // sem nada do servidor por 70 s (ele manda ping a cada 20 s) = conexão morta, reconecta
    while let Ok(Some(Ok(msg))) = tokio::time::timeout(Duration::from_secs(70), rx.next()).await {
        match msg {
            Message::Text(t) => {
                let Ok(ev) = serde_json::from_str::<serde_json::Value>(t.as_str()) else { continue };
                match ev["type"].as_str() {
                    Some("ping") => {
                        let _ = tx.send(Message::text(r#"{"type":"pong"}"#)).await;
                    }
                    Some("message_created") => on_message(app, me, &ev["message"]),
                    _ => {}
                }
            }
            Message::Ping(p) => {
                let _ = tx.send(Message::Pong(p)).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    Ok(true)
}

/// a mesma regra da página (messageMentionsMe em 06-message-content.js)
fn mentions_me(m: &serde_json::Value, me: i64) -> bool {
    let text = m["content"].as_str().unwrap_or_default();
    if text.contains(&format!("<@{me}>")) || m["mentions_everyone"].as_bool().unwrap_or(false) {
        return true;
    }
    ["@everyone", "@here"].iter().any(|tag| {
        text.match_indices(tag).any(|(i, _)| {
            let before = text[..i].chars().next_back();
            let after = text[i + tag.len()..].chars().next();
            !before.is_some_and(|c| c.is_alphanumeric() || c == '_' || c == '`')
                && !after.is_some_and(|c| c.is_alphanumeric() || c == '_')
        })
    })
}

/// texto curto pra notificação: menções viram "@…", anexo vira "mandou uma imagem"…
fn plain(m: &serde_json::Value) -> String {
    let text = m["content"].as_str().unwrap_or_default();
    let mut out = String::new();
    let mut rest = text;
    while let Some(i) = rest.find("<@") {
        out.push_str(&rest[..i]);
        let tail = &rest[i + 2..];
        match tail.find('>') {
            Some(j) if j > 0 && tail[..j].chars().all(|c| c.is_ascii_digit()) => {
                out.push_str("@alguém");
                rest = &tail[j + 1..];
            }
            _ => {
                out.push_str("<@");
                rest = tail;
            }
        }
    }
    out.push_str(rest);
    let out = out.trim().to_string();
    if !out.is_empty() {
        return out.chars().take(220).collect();
    }
    match m["attachment_type"].as_str() {
        Some("gif") => "mandou um gif".into(),
        Some("image") => "mandou uma imagem".into(),
        Some("video") => "mandou um vídeo".into(),
        Some("file") => "mandou um arquivo".into(),
        _ => "mensagem nova".into(),
    }
}

fn on_message(app: &AppHandle, me: i64, m: &serde_json::Value) {
    let author_id = m["user_id"].as_i64();
    if author_id == Some(me) || author_id.is_none() && m["bot_name"].is_null() {
        return; // minha, ou aviso do sistema
    }
    let st = app.state::<AppState>();
    let is_dm = m["server_id"].is_null();
    let mention = is_dm || mentions_me(m, me);
    if mention {
        st.mentions.fetch_add(1, Ordering::SeqCst);
        tray::refresh(app);
    }
    let level = st.notify_level.lock().unwrap().clone();
    let idle = st.status.lock().unwrap().as_str() == "idle";
    let notify = match level.as_str() {
        "none" => false,
        "all" => true,
        _ => mention,
    };
    if !notify || idle {
        return;
    }
    let author = m["username"].as_str().or(m["bot_name"].as_str()).unwrap_or("alguém");
    let title = match (is_dm, m["channel_name"].as_str()) {
        (true, _) => author.to_string(),
        (false, Some(ch)) => format!("{author} (#{ch})"),
        (false, None) => author.to_string(),
    };
    let _ = app.notification().builder().title(title).body(plain(m)).show();
}

/// usado por app.rs: a janela foi destruída de propósito (não é pra sair do app)
pub fn is_unloaded(app: &AppHandle) -> bool {
    app.state::<AppState>().unloaded.load(Ordering::SeqCst)
}
