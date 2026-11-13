//! Ajustes do motor web de cada sistema que o Tauri não expõe direto.
//!
//! Linux (WebKitGTK): liga microfone/câmera (media stream), WebRTC e áudio sem clique antes.
//! Atenção: o WebKitGTK das distros (Ubuntu incluso) costuma vir SEM WebRTC compilado — aí
//! `RTCPeerConnection` não existe e a call não funciona dentro da janela. Isso é resolvido levando
//! a voz pro lado Rust (próxima etapa). O chat e o resto do site funcionam normalmente.
//!
//! Windows (WebView2 = Chromium): as permissões já saem liberadas pelo on_permission_request
//! (app.rs) e o autoplay pelo argumento --autoplay-policy; nada a fazer aqui.

use tauri::WebviewWindow;

#[cfg(target_os = "linux")]
pub fn configure(win: &WebviewWindow) {
    let _ = win.with_webview(|pw| {
        use webkit2gtk::{SettingsExt, WebViewExt};
        let wv = pw.inner();
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
            s.set_hardware_acceleration_policy(webkit2gtk::HardwareAccelerationPolicy::Always);
            s.set_enable_webgl(true);
            // Ctrl+Shift+I / botão direito → Inspecionar, igual às "ferramentas do desenvolvedor" do Electron
            s.set_enable_developer_extras(true);
        }
    });
}

#[cfg(not(target_os = "linux"))]
pub fn configure(_win: &WebviewWindow) {}
