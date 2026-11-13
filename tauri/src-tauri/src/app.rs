//! Janela principal, conexão com o servidor, ponte com o site e ciclo de vida do app.
//! É o equivalente do electron/main.js (menos o que foi pra tray.rs, picker.rs, screencast.rs e audio/).
//!
//! O app não sobe servidor nenhum: abre uma janela nativa apontando pro site hospedado. A tela local
//! ui/loading.html aparece enquanto o site não responde (e pra trocar o endereço do servidor).

use crate::server::{self, log, Prefs};
use crate::{audio, call, deps, picker, screencast, tray, webview_setup};
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::ipc::CapabilityBuilder;
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::webview::{NewWindowResponse, PermissionKind, PermissionResponse};
use tauri::{AppHandle, Manager, RunEvent, Url, Webview, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

pub const BRIDGE_JS: &str = include_str!("bridge.js");

/// a ponte + se a call vai pelo Rust (Linux: o WebKitGTK não tem WebRTC)
pub fn bridge_script() -> String {
    #[allow(unused_mut)]
    let mut s = format!("window.__DIDISCORD_NATIVE_CALL__ = {};\n{BRIDGE_JS}", cfg!(target_os = "linux"));
    // só no modo debug: DIDISCORD_INJECT_JS=arquivo.js roda um script extra em toda página (testes)
    #[cfg(debug_assertions)]
    if let Some(extra) = std::env::var_os("DIDISCORD_INJECT_JS").and_then(|p| std::fs::read_to_string(p).ok()) {
        s.push('\n');
        s.push_str(&extra);
    }
    s
}
pub const MAIN: &str = "main";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectStatus {
    pub phase: String, // setup | change | connecting | loading | idle
    pub url: Option<String>,
    pub attempts: u32,
    pub since: u64,
    pub fixed_by_env: bool,
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub dev: bool,
    pub fixed_by_env: bool,
    pub site_url: Mutex<String>,
    granted_sites: Mutex<HashSet<String>>,
    pub connect: Mutex<ConnectStatus>,
    connect_gen: AtomicU64,
    pub prefs: Mutex<Prefs>,
    pub status: Mutex<String>,
    pub mentions: AtomicI64,
    pub quitting: AtomicBool,
    pub http: reqwest::Client,
    pub picker: picker::PickerSlot,
    pub screencast: screencast::Screencast,
    pub audio: audio::ScreenAudio,
    pub call: call::Call,
    pub deps: deps::Deps,
    pub tray: Mutex<Option<tray::TrayItems>>,
}

impl AppState {
    pub fn site(&self) -> String {
        self.site_url.lock().unwrap().clone()
    }

    /// endereço é do servidor escolhido (ou localhost, no modo dev)?
    pub fn is_site(&self, url: &Url) -> bool {
        if self.dev && url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1")) {
            return true;
        }
        (url.scheme() == "https" || url.scheme() == "http") && url.origin().ascii_serialization() == self.site()
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// páginas do próprio app (pasta ui/): tauri://localhost no Linux, http://tauri.localhost no Windows
pub fn is_local(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

pub fn local_url(path: &str) -> Url {
    let base = if cfg!(windows) { "http://tauri.localhost/" } else { "tauri://localhost/" };
    Url::parse(base).unwrap().join(path).unwrap()
}

/// manda um evento pra página (cai no window.__didiscordEmit do bridge.js)
pub fn emit_js(name: &str, payload: &impl Serialize) -> String {
    let name = serde_json::to_string(name).unwrap();
    let payload = serde_json::to_string(payload).unwrap_or_else(|_| "null".into());
    format!("window.__didiscordEmit&&window.__didiscordEmit({name},{payload})")
}

pub fn emit_to_main(app: &AppHandle, name: &str, payload: &impl Serialize) {
    if let Some(win) = app.get_webview_window(MAIN) {
        let _ = win.eval(emit_js(name, payload));
    }
}

/// o pedido veio do site do didiscord, na janela principal?
pub fn require_site(app: &AppHandle, webview: &Webview) -> Result<(), String> {
    let st = app.state::<AppState>();
    match webview.url() {
        Ok(url) if webview.label() == MAIN && st.is_site(&url) => Ok(()),
        _ => Err("origem não permitida".into()),
    }
}

pub fn require_local(webview: &Webview, label: &str) -> Result<(), String> {
    match webview.url() {
        Ok(url) if webview.label() == label && is_local(&url) => Ok(()),
        _ => Err("não permitido".into()),
    }
}

/// O site é remoto e o endereço muda em tempo de execução, então a permissão de chamar os comandos
/// do app é dada aqui (e não no capabilities/*.json, que é fixo na compilação).
fn grant_site(app: &AppHandle, origin: &str) {
    let st = app.state::<AppState>();
    let mut granted = st.granted_sites.lock().unwrap();
    if !granted.insert(origin.to_string()) {
        return;
    }
    let id = format!("site-{}", granted.len());
    let mut cap = CapabilityBuilder::new(id).remote(format!("{origin}/*")).window(MAIN);
    if st.dev {
        cap = cap.remote("http://localhost:*/*".into()).remote("http://127.0.0.1:*/*".into());
    }
    for p in [
        "allow-desktop-set-badge",
        "allow-desktop-focus",
        "allow-status-report",
        "allow-screen-audio-plan",
        "allow-screen-audio-stop",
        "allow-screencast-available",
        "allow-screencast-start",
        "allow-screencast-command",
        "allow-screencast-stop",
        "allow-call-join",
        "allow-call-leave",
        "allow-call-push-mic",
        "allow-call-pull",
        "allow-call-set-subscribed",
        // window.Notification da página (o plugin de notificação troca pela notificação do sistema)
        "notification:default",
    ] {
        cap = cap.permission(p);
    }
    if let Err(err) = app.add_capability(cap) {
        log::warn(&format!("não consegui liberar o site {origin}: {err}"));
    }
}

// ---------- janela principal ----------

fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let nav_app = app.clone();
    let open_app = app.clone();
    let perm_app = app.clone();

    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("loading.html".into()))
        .title("didiscord")
        .inner_size(1280.0, 800.0)
        .min_inner_size(940.0, 560.0)
        .background_color(tauri::window::Color(30, 31, 34, 255))
        .initialization_script(bridge_script())
        // a call não pode "dormir" com a janela minimizada ou escondida na bandeja
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        // navegação: só as telas locais e o domínio do didiscord; o resto abre no navegador do sistema.
        // No Linux o WebKitGTK passa por aqui também a navegação dos iframes (embeds do YouTube etc.)
        // sem dizer se é a página ou um iframe, então lá só bloqueia o que não é web.
        .on_navigation(move |url| {
            let st = nav_app.state::<AppState>();
            if is_local(url) || st.is_site(url) || matches!(url.scheme(), "about" | "blob" | "data") {
                return true;
            }
            if cfg!(target_os = "linux") {
                return matches!(url.scheme(), "http" | "https");
            }
            if matches!(url.scheme(), "http" | "https") {
                let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        // target=_blank / window.open: sempre no navegador do sistema
        .on_new_window(move |url, _features| {
            if matches!(url.scheme(), "http" | "https") {
                let _ = open_app.opener().open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        // mic, câmera, tela, notificações, pointer lock (mundinho 3D): liberado direto, só pro servidor
        .on_permission_request(move |webview, kind| {
            let st = perm_app.state::<AppState>();
            let from_site = webview.url().map(|u| st.is_site(&u)).unwrap_or(false);
            let wanted = matches!(
                kind,
                PermissionKind::Microphone
                    | PermissionKind::Camera
                    | PermissionKind::DisplayCapture
                    | PermissionKind::Notifications
                    | PermissionKind::PointerLock
                    | PermissionKind::Autoplay
                    | PermissionKind::WindowManagement
            );
            if wanted && from_site {
                PermissionResponse::Allow
            } else {
                PermissionResponse::Default
            }
        });

    #[cfg(windows)]
    {
        // os padrões do wry + áudio da call tocando sem um clique antes (app reaberto direto numa call)
        builder = builder.additional_browser_args(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required",
        );
    }

    let win = builder.build()?;
    webview_setup::configure(&win);
    Ok(win)
}

pub fn show_main(app: &AppHandle) {
    match app.get_webview_window(MAIN) {
        Some(win) => {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
        None => {
            if create_main_window(app).is_ok() {
                spawn_connect(app.clone(), "connect");
            }
        }
    }
}

pub fn quit_for_real(app: &AppHandle) {
    app.state::<AppState>().quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// primeira vez que a janela some: avisa que o app não fechou (senão parece que a call caiu à toa)
fn show_tray_hint_once(app: &AppHandle) {
    let st = app.state::<AppState>();
    {
        let mut prefs = st.prefs.lock().unwrap();
        if prefs.tray_hint_shown {
            return;
        }
        prefs.tray_hint_shown = true;
        server::save_prefs(&st.data_dir, &prefs);
    }
    let _ = app
        .notification()
        .builder()
        .title("didiscord continua aberto")
        .body("Ele continua rodando na bandeja (calls, mensagens e sons seguem funcionando). Pra fechar de vez: botão direito no ícone → Sair do didiscord.")
        .show();
}

// ---------- tela de loading + espera o site responder ----------

fn push_shell_status(app: &AppHandle) {
    let st = app.state::<AppState>();
    let status = st.connect.lock().unwrap().clone();
    if let Some(win) = app.get_webview_window(MAIN) {
        if win.url().map(|u| is_local(&u)).unwrap_or(false) {
            let _ = win.eval(emit_js("shell:status", &status));
        }
    }
}

pub fn spawn_connect(app: AppHandle, mode: &'static str) {
    tauri::async_runtime::spawn(async move { connect_to_site(app, mode).await });
}

/// mode: "connect" (normal), "setup" (nunca configurou) ou "change" (pediu pra trocar)
async fn connect_to_site(app: AppHandle, mode: &str) {
    let st = app.state::<AppState>();
    let gen = st.connect_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let site = st.site();
    let mode = if site.is_empty() { "setup" } else { mode };
    *st.connect.lock().unwrap() = ConnectStatus {
        phase: if mode == "connect" { "connecting".into() } else { mode.into() },
        url: (!site.is_empty()).then(|| site.clone()),
        attempts: 0,
        since: now_ms(),
        fixed_by_env: st.fixed_by_env,
    };
    let Some(win) = app.get_webview_window(MAIN) else { return };
    if !win.url().map(|u| is_local(&u)).unwrap_or(false) {
        let _ = win.navigate(local_url("loading.html"));
    } else {
        push_shell_status(&app);
    }
    if mode != "connect" {
        return; // fica esperando a pessoa digitar o endereço
    }

    let mut delay = 1000u64;
    loop {
        if st.connect_gen.load(Ordering::SeqCst) != gen {
            return;
        }
        if server::site_is_up(&st.http, &site).await {
            if st.connect_gen.load(Ordering::SeqCst) == gen {
                st.connect.lock().unwrap().phase = "loading".into();
                grant_site(&app, &site);
                if let (Some(win), Ok(url)) = (app.get_webview_window(MAIN), Url::parse(&site)) {
                    let _ = win.navigate(url);
                }
            }
            return;
        }
        st.connect.lock().unwrap().attempts += 1;
        push_shell_status(&app);
        tokio::time::sleep(Duration::from_millis(delay)).await;
        delay = (delay as f64 * 1.6).round().min(10_000.0) as u64;
    }
}

// ---------- comandos: tela de "conectando…" ----------

#[tauri::command]
fn shell_get_status(webview: Webview, state: tauri::State<'_, AppState>) -> Option<ConnectStatus> {
    require_local(&webview, MAIN).ok()?;
    Some(state.connect.lock().unwrap().clone())
}

#[derive(Serialize)]
struct SetServerResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
async fn shell_set_server(app: AppHandle, webview: Webview, input: String) -> SetServerResult {
    if require_local(&webview, MAIN).is_err() {
        return SetServerResult { ok: false, error: Some("não permitido".into()) };
    }
    let st = app.state::<AppState>();
    let Some(url) = server::normalize_server_input(&input) else {
        return SetServerResult { ok: false, error: Some("endereço inválido — cole algo como didiscord.veneno.space".into()) };
    };
    if !server::site_is_up(&st.http, &url).await {
        return SetServerResult {
            ok: false,
            error: Some(format!("não consegui falar com {url} — confere se o servidor está ligado e se o endereço é o atual")),
        };
    }
    server::save_server(&st.data_dir, &url);
    log::info(&format!("servidor trocado para {url}"));
    *st.site_url.lock().unwrap() = url;
    spawn_connect(app.clone(), "connect");
    SetServerResult { ok: true, error: None }
}

#[tauri::command]
fn shell_cancel_change(app: AppHandle, webview: Webview) {
    if require_local(&webview, MAIN).is_ok() && !app.state::<AppState>().site().is_empty() {
        spawn_connect(app, "connect");
    }
}

// ---------- comandos: site ----------

/// contador de menções no ícone (e piscar na barra de tarefas quando chega uma nova)
#[tauri::command]
fn desktop_set_badge(app: AppHandle, webview: Webview, count: i64) {
    if require_site(&app, &webview).is_err() {
        return;
    }
    let st = app.state::<AppState>();
    let n = count.clamp(0, 999);
    let before = st.mentions.swap(n, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(MAIN) {
        // Linux (Unity/KDE/GNOME com Dash to Dock) mostra o número; no Windows não existe — fica na bandeja
        let _ = win.set_badge_count(if n > 0 { Some(n) } else { None });
        if n > before && !win.is_focused().unwrap_or(true) {
            let _ = win.request_user_attention(Some(tauri::UserAttentionType::Informational));
        }
    }
    tray::refresh(&app);
}

/// traz a janela pra frente (clique numa notificação) — funciona escondida na bandeja também
#[tauri::command]
fn desktop_focus(app: AppHandle, webview: Webview) {
    if require_site(&app, &webview).is_ok() {
        show_main(&app);
    }
}

/// o site avisa o status atual (ao abrir e a cada troca, inclusive vinda de outro aparelho)
#[tauri::command]
fn status_report(app: AppHandle, webview: Webview, status: String) {
    if require_site(&app, &webview).is_err() || !matches!(status.as_str(), "online" | "idle") {
        return;
    }
    *app.state::<AppState>().status.lock().unwrap() = status;
    tray::refresh(&app);
}

// ---------- ciclo de vida ----------

pub fn run() {
    let dev = std::env::var("DIDISCORD_DEV").as_deref() == Ok("1");
    let env_url = std::env::var("DIDISCORD_URL")
        .ok()
        .or_else(|| dev.then(|| "http://localhost:3000".to_string()))
        .and_then(|u| server::normalize_server_input(&u));

    let app = tauri::Builder::default()
        // abrir o didiscord de novo (atalho, menu de apps) com ele escondido: traz a janela de volta
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // não guarda "escondida": senão, saindo com a janela na bandeja, ela voltaria invisível
                .with_state_flags(tauri_plugin_window_state::StateFlags::all() - tauri_plugin_window_state::StateFlags::VISIBLE)
                .with_denylist(&[picker::LABEL])
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            let site = env_url.clone().unwrap_or_else(|| server::saved_server_or_default(&data_dir));
            let http = reqwest::Client::builder()
                .user_agent(concat!("didiscord-desktop/", env!("CARGO_PKG_VERSION")))
                .build()?;
            app.manage(AppState {
                prefs: Mutex::new(server::load_prefs(&data_dir)),
                deps: deps::Deps::new(&data_dir),
                data_dir,
                dev,
                fixed_by_env: env_url.is_some(),
                site_url: Mutex::new(site),
                granted_sites: Mutex::new(HashSet::new()),
                connect: Mutex::new(ConnectStatus { phase: "idle".into(), url: None, attempts: 0, since: 0, fixed_by_env: false }),
                connect_gen: AtomicU64::new(0),
                status: Mutex::new("online".into()),
                mentions: AtomicI64::new(0),
                quitting: AtomicBool::new(false),
                http,
                picker: picker::PickerSlot::default(),
                screencast: screencast::Screencast::default(),
                audio: audio::ScreenAudio::default(),
                call: call::Call::default(),
                tray: Mutex::new(None),
            });
            let handle = app.handle().clone();
            app.state::<AppState>().audio.set_app(&handle);
            create_main_window(&handle)?;
            if let Err(err) = tray::create(&handle) {
                log::warn(&format!("não deu pra criar o ícone da bandeja: {err}"));
            }
            spawn_connect(handle.clone(), "connect");
            // já descobre o melhor jeito de compartilhar a tela (e baixa o ffmpeg se precisar), pra
            // estar pronto na primeira vez
            if !screencast::is_wayland() {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    let _ = screencast::probe(&handle).await;
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN {
                return;
            }
            let app = window.app_handle();
            let st = app.state::<AppState>();
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let close_to_tray = st.prefs.lock().unwrap().close_to_tray;
                    if st.quitting.load(Ordering::SeqCst) || !close_to_tray {
                        return; // sair de verdade
                    }
                    // só esconde: a página continua viva (call, mensagens, sons, notificações)
                    api.prevent_close();
                    let _ = window.hide();
                    show_tray_hint_once(app);
                }
                WindowEvent::Destroyed => {
                    st.audio.stop();
                    quit_for_real(app);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            shell_get_status,
            shell_set_server,
            shell_cancel_change,
            desktop_set_badge,
            desktop_focus,
            status_report,
            audio::screen_audio_plan,
            audio::screen_audio_stop,
            screencast::screencast_available,
            screencast::screencast_start,
            screencast::screencast_command,
            screencast::screencast_stop,
            call::call_join,
            call::call_leave,
            call::call_push_mic,
            call::call_pull,
            call::call_set_subscribed,
            picker::picker_get_sources,
            picker::picker_choose,
            picker::picker_get_audio_apps,
            picker::picker_choose_audio,
            picker::picker_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o didiscord");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            let st = app.state::<AppState>();
            st.audio.stop();
            st.screencast.stop();
            st.call.leave();
        }
    });
}
