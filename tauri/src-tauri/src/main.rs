// Sem janela de terminal no Windows (versão final).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod audio;
#[cfg(target_os = "linux")]
mod call;
#[cfg(not(target_os = "linux"))]
#[path = "call_stub.rs"]
mod call;
mod deps;
mod desktop;
mod downloads;
mod drops;
mod perf;
mod picker;
mod presence;
mod screencast;
mod server;
mod shortcuts;
mod sources;
mod tray;
mod tray_watch;
mod updater;
mod webview_setup;

fn main() {
    // O atualizador do app Electron antigo, ao trocar o AppImage por este (migração, ver
    // tauri/README.md), roda o arquivo novo uma vez com APPIMAGE_EXIT_AFTER_INSTALL=true e ESPERA
    // ele terminar — no AppImage do Electron isso só "instala" e sai. Aqui também: sai na hora.
    if std::env::var("APPIMAGE_EXIT_AFTER_INSTALL").as_deref() == Ok("true") {
        return;
    }
    app::run();
}
