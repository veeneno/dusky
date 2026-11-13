//! Janelinha de escolher tela/janela (ui/picker.html, a mesma do Electron).
//!
//! mode "sources" (X11/Windows): telas e janelas com miniatura -> devolve a fonte escolhida.
//! mode "audio"   (Wayland): só o SOM — a tela/janela vem depois, pelo seletor do sistema, que não
//!                diz de qual app é a janela escolhida.

use crate::app::{self, AppState};
use crate::audio;
use crate::sources::{self, Source, SourceView};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Webview, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tokio::sync::oneshot;

pub const LABEL: &str = "picker";

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AudioChoice {
    pub mode: String, // system | app | none
    pub app_key: Option<String>,
}

pub enum Picked {
    Source(Source),
    Audio(AudioChoice),
}

struct Active {
    gen: u64,
    tx: oneshot::Sender<Option<Picked>>,
    sources: HashMap<String, Source>,
}

#[derive(Default)]
pub struct PickerSlot(Mutex<Option<Active>>, std::sync::atomic::AtomicU64);

fn resolve(app: &AppHandle, result: Option<Picked>) {
    let st = app.state::<AppState>();
    let active = st.picker.0.lock().unwrap().take();
    if let Some(a) = active {
        let _ = a.tx.send(result);
    }
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.destroy();
    }
}

/// a janela de um seletor fechou: cancela só se ainda for ele o seletor aberto
fn resolve_if_current(app: &AppHandle, gen: u64) {
    let current = app.state::<AppState>().picker.0.lock().unwrap().as_ref().map(|a| a.gen);
    if current == Some(gen) {
        resolve(app, None);
    }
}

/// Abre o seletor e espera a escolha (None = cancelou / fechou).
pub async fn pick(app: &AppHandle, mode: &str) -> Option<Picked> {
    resolve(app, None); // um seletor por vez
    let (tx, rx) = oneshot::channel();
    let st = app.state::<AppState>();
    let gen = st.picker.1.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    *st.picker.0.lock().unwrap() = Some(Active { gen, tx, sources: HashMap::new() });

    let url = app::local_url(&format!("picker.html?mode={mode}"));
    let url = if cfg!(windows) { WebviewUrl::External(url) } else { WebviewUrl::CustomProtocol(url) };
    let audio_mode = mode == "audio";
    let make = || {
        WebviewWindowBuilder::new(app, LABEL, url.clone())
            .title("Compartilhar tela")
            .inner_size(if audio_mode { 560.0 } else { 860.0 }, if audio_mode { 520.0 } else { 620.0 })
            .min_inner_size(if audio_mode { 460.0 } else { 560.0 }, 420.0)
            .background_color(tauri::window::Color(30, 31, 34, 255))
            .initialization_script(app::bridge_script())
            .center()
    };
    // por cima da janela principal (se der); senão, janela solta
    let builder = match app.get_webview_window(app::MAIN) {
        Some(main) => make().parent(&main).unwrap_or_else(|_| make()),
        None => make(),
    };
    match builder.build() {
        Ok(win) => {
            let handle = app.clone();
            win.on_window_event(move |e| {
                if matches!(e, WindowEvent::Destroyed | WindowEvent::CloseRequested { .. }) {
                    resolve_if_current(&handle, gen);
                }
            });
        }
        Err(err) => {
            crate::server::log::warn(&format!("não deu pra abrir o seletor de tela: {err}"));
            resolve(app, None);
        }
    }
    rx.await.unwrap_or(None)
}

#[tauri::command]
pub async fn picker_get_sources(app: AppHandle, webview: Webview) -> Result<Vec<SourceView>, String> {
    app::require_local(&webview, LABEL)?;
    let own = std::process::id();
    let list = tauri::async_runtime::spawn_blocking(move || sources::list(own)).await.map_err(|e| e.to_string())?;
    let st = app.state::<AppState>();
    let mut slot = st.picker.0.lock().unwrap();
    let Some(active) = slot.as_mut() else { return Ok(Vec::new()) };
    active.sources = list.iter().map(|(s, _)| (s.id.clone(), s.clone())).collect();
    Ok(list.into_iter().map(|(_, v)| v).collect())
}

#[tauri::command]
pub fn picker_choose(app: AppHandle, webview: Webview, id: String) {
    if app::require_local(&webview, LABEL).is_err() {
        return;
    }
    let source = app.state::<AppState>().picker.0.lock().unwrap().as_ref().and_then(|a| a.sources.get(&id).cloned());
    resolve(&app, source.map(Picked::Source));
}

#[tauri::command]
pub async fn picker_get_audio_apps(webview: Webview) -> audio::AudioApps {
    if app::require_local(&webview, LABEL).is_err() {
        return audio::AudioApps { available: false, apps: Vec::new() };
    }
    audio::list_audio_apps().await
}

#[tauri::command]
pub fn picker_choose_audio(app: AppHandle, webview: Webview, choice: AudioChoice) {
    if app::require_local(&webview, LABEL).is_err() {
        return;
    }
    let mode = if matches!(choice.mode.as_str(), "system" | "app" | "none") { choice.mode } else { "system".into() };
    let app_key = if mode == "app" { choice.app_key.map(|k| k.chars().take(200).collect::<String>()).filter(|k| !k.is_empty()) } else { None };
    // "só um app" sem app escolhido = som do sistema todo
    let choice = if mode == "app" && app_key.is_none() { AudioChoice { mode: "system".into(), app_key: None } } else { AudioChoice { mode, app_key } };
    resolve(&app, Some(Picked::Audio(choice)));
}

#[tauri::command]
pub fn picker_cancel(app: AppHandle, webview: Webview) {
    if app::require_local(&webview, LABEL).is_ok() {
        resolve(&app, None);
    }
}
