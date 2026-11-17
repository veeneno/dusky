//! Ajustes do motor web de cada sistema que o Tauri não expõe direto.
//!
//! Linux (WebKitGTK): liga microfone/câmera (media stream), WebRTC e áudio sem clique antes.
//! Atenção: o WebKitGTK das distros (Ubuntu incluso) costuma vir SEM WebRTC compilado — aí
//! `RTCPeerConnection` não existe; por isso a call no Linux vai pelo Rust (call.rs).
//!
//! Windows (WebView2 = Chromium): as permissões já saem liberadas pelo on_permission_request
//! (app.rs); o resto vai em argumentos do Chromium (browser_args, abaixo).
//!
//! Aceleração de hardware (preferência do app, padrão ligada; mudar reinicia o app porque o motor
//! web só lê isso ao abrir):
//!   ligada    Linux: política "sempre" na placa de vídeo, com o renderizador DMA-BUF do WebKitGTK
//!             (o quadro do WebGL vai direto pro compositor, sem passar pela memória). Windows: o
//!             WebView2 escolhe a placa de alto desempenho (notebook com duas placas usava a
//!             integrada, porque quem pede a placa é o msedgewebview2.exe, não o dusky.exe).
//!   desligada Linux: tudo no processador (sem composição acelerada e sem DMA-BUF). Windows:
//!             --disable-gpu. Pra placa/driver que dá tela preta ou trava.
//!
//! Sobre o Mundinho 3D mais lento no app que no navegador (Linux): ver "Aceleração de hardware" no
//! tauri/README.md — o que mais pesa é o WebKitGTK sem DMA-BUF (variável
//! WEBKIT_DISABLE_DMABUF_RENDERER=1, que muita gente com NVIDIA põe no sistema por causa de tela
//! branca: aí cada quadro do WebGL é copiado da placa pro processador e de volta). O app avisa no
//! terminal e mostra isso no contador de fps do mundinho (F9).

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, WebviewWindow};

static HW_ACCEL: AtomicBool = AtomicBool::new(true);

pub fn hardware_acceleration() -> bool {
    HW_ACCEL.load(Ordering::SeqCst)
}

/// Chamado antes de qualquer janela existir (as variáveis do WebKitGTK só valem se já estiverem
/// no ambiente quando o processo da página nasce).
pub fn init_hardware_acceleration(on: bool) {
    HW_ACCEL.store(on, Ordering::SeqCst);
    #[cfg(target_os = "linux")]
    {
        if on {
            // O app reinicia (app.restart) herdando o ambiente do processo anterior. Se o anterior
            // estava com a aceleração DESLIGADA, ele pôs as variáveis abaixo — e o novo nascia com a
            // placa desligada mesmo com a opção ligada (página toda e WebGL no processador). Só tira
            // o que foi o próprio app que pôs (marca DUSKY_WEBKIT_ENV_SET); a variável que a pessoa
            // pôs no sistema fica.
            clear_own_webkit_env();
            // Versões até a 1.0.4 punham as duas SEM a marca — e o atualizador reinicia o app herdando
            // o ambiente: quem atualizou de uma versão com a aceleração desligada (ou que tinha
            // herdado de outra) continuava com a placa desligada. As DUAS juntas são a assinatura do
            // "desligado" do app (ninguém põe COMPOSITING_MODE=1 querendo aceleração): tira as duas.
            if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").as_deref() == Ok("1")
                && std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").as_deref() == Ok("1")
            {
                std::env::remove_var("WEBKIT_DISABLE_COMPOSITING_MODE");
                std::env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER");
                crate::server::log::info("aceleração ligada: tirei WEBKIT_DISABLE_* herdadas de uma versão antiga do app");
            }
            if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").as_deref() == Ok("1") {
                crate::server::log::warn(
                    "WEBKIT_DISABLE_DMABUF_RENDERER=1 está no ambiente: o WebGL (mundinho, telas) fica bem mais lento. \
                     Se o app abrir normal sem ela, tire do seu ~/.profile / environment.d.",
                );
            }
        } else {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            std::env::set_var(OWN_ENV_MARK, "1");
        }
    }
}

/// marca de que as variáveis WEBKIT_DISABLE_* foram postas pelo app (aceleração desligada)
#[cfg(target_os = "linux")]
const OWN_ENV_MARK: &str = "DUSKY_WEBKIT_ENV_SET";

/// Tira as variáveis WEBKIT_DISABLE_* que o próprio app pôs. Chamado ao abrir com a aceleração
/// ligada e antes de reiniciar pra ligar (o processo novo herda o ambiente deste).
pub fn clear_own_webkit_env() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os(OWN_ENV_MARK).is_some() {
            std::env::remove_var("WEBKIT_DISABLE_COMPOSITING_MODE");
            std::env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER");
            std::env::remove_var(OWN_ENV_MARK);
        }
    }
}

/// Argumentos do Chromium (WebView2). Têm que ser os MESMOS em todas as janelas do app (o
/// WebView2 recusa abrir uma segunda janela com argumentos diferentes da primeira).
#[cfg(windows)]
pub fn browser_args() -> String {
    // os padrões do wry + áudio da call tocando sem um clique antes (app reaberto direto numa call)
    let mut args = String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required");
    if hardware_acceleration() {
        args.push_str(" --force_high_performance_gpu");
    } else {
        args.push_str(" --disable-gpu --disable-gpu-compositing");
    }
    args
}

/// o que vale agora, pro contador de fps do mundinho e pra diagnóstico
pub fn diagnostics() -> serde_json::Value {
    let env = |k: &str| std::env::var(k).ok();
    serde_json::json!({
        "hardwareAcceleration": hardware_acceleration(),
        "session": env("XDG_SESSION_TYPE"),
        "dmabufDisabled": env("WEBKIT_DISABLE_DMABUF_RENDERER").as_deref() == Some("1"),
        "compositingDisabled": env("WEBKIT_DISABLE_COMPOSITING_MODE").as_deref() == Some("1"),
    })
}

#[cfg(target_os = "linux")]
pub fn configure(app: &AppHandle, win: &WebviewWindow) {
    let app = app.clone();
    let _ = win.with_webview(move |pw| {
        use tauri::Manager;
        use webkit2gtk::{SettingsExt, WebViewExt};
        let wv = pw.inner();
        // arrastar arquivo: no Wayland o WebKit não entrega o arquivo pra página — guarda os
        // caminhos que o GTK recebeu pra página pedir na hora do soltar (drops.rs)
        {
            use gtk::prelude::WidgetExt;
            wv.connect_drag_data_received(|_wv, _ctx, _x, _y, data, _info, _time| {
                let uris: Vec<String> = data.uris().iter().map(|u| u.to_string()).collect();
                crate::drops::remember_uris(&uris);
            });
        }
        // navegação pro site falhou (servidor desligado, sem internet): volta pra tela de
        // "conectando…" na hora, em vez de deixar a página de erro do WebKit. Navegação cancelada
        // (trocou de página no meio) ou virou download não conta.
        let lost_app = app.clone();
        wv.connect_load_failed(move |_wv, _event, uri, err| {
            use webkit2gtk::{NetworkError, PolicyError};
            if err.matches(NetworkError::Cancelled) || err.matches(PolicyError::FrameLoadInterruptedByPolicyChange) {
                return false;
            }
            let st = lost_app.state::<crate::app::AppState>();
            let is_site = tauri::Url::parse(uri).map(|u| st.is_site(&u)).unwrap_or(false);
            if is_site {
                let handle = lost_app.clone();
                // fora do sinal do GTK: navegar daqui de dentro confunde o WebKit
                tauri::async_runtime::spawn(async move { crate::app::site_lost(&handle, "a página não carregou") });
                return true; // sem página de erro: a tela de "conectando…" já vem
            }
            false
        });
        if let Some(s) = WebViewExt::settings(&wv) {
            s.set_enable_media_stream(true);
            s.set_enable_webrtc(true);
            s.set_enable_mediasource(true);
            s.set_enable_media(true);
            s.set_enable_webaudio(true);
            s.set_enable_encrypted_media(true);
            s.set_media_playback_requires_user_gesture(false);
            // composição e canvas na placa de vídeo sempre (a tela dos outros é desenhada com WebGL;
            // no modo "sob demanda" o WebKitGTK às vezes compõe a página no processador)
            s.set_hardware_acceleration_policy(if hardware_acceleration() {
                webkit2gtk::HardwareAccelerationPolicy::Always
            } else {
                webkit2gtk::HardwareAccelerationPolicy::Never
            });
            s.set_enable_webgl(true);
            // Ctrl+Shift+I / botão direito → Inspecionar, igual às "ferramentas do desenvolvedor" do Electron
            s.set_enable_developer_extras(true);
        }
    });
}

#[cfg(not(target_os = "linux"))]
pub fn configure(_app: &AppHandle, _win: &WebviewWindow) {}

/// Windows: pid do processo principal do WebView2 da janela do dusky (é ele e os filhos dele que
/// tocam o som da call). Perguntado direto pro WebView2 — não dá pra contar que ele seja filho do
/// dusky.exe na árvore de processos (o "tirar o dusky do som da tela" dependia disso).
#[cfg(windows)]
pub async fn browser_pid(app: &AppHandle) -> Option<u32> {
    use tauri::Manager;
    let win = app.get_webview_window(crate::app::MAIN)?;
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<u32>>();
    win.with_webview(move |pw| {
        // SAFETY: chamadas COM do WebView2, na thread da janela (with_webview roda lá)
        let pid = unsafe {
            pw.controller().CoreWebView2().ok().and_then(|core| {
                let mut pid = 0u32;
                core.BrowserProcessId(&mut pid).ok().map(|_| pid)
            })
        };
        let _ = tx.send(pid);
    })
    .ok()?;
    tokio::time::timeout(std::time::Duration::from_secs(3), rx).await.ok()?.ok()?.filter(|p| *p != 0)
}
