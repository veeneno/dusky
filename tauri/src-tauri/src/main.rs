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
mod picker;
mod screencast;
mod server;
mod sources;
mod tray;
mod webview_setup;

fn main() {
    app::run();
}
