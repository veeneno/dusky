//! Windows: a call roda no próprio WebView2 (Chromium tem WebRTC) — nada de call nativa.
//! Os comandos existem só pra lista do app ficar igual nos dois sistemas.

use tauri::ipc::{Request, Response};

#[derive(Default)]
pub struct Call;

impl Call {
    pub fn leave(&self) {}
    pub fn start_screen_audio(&self) -> bool {
        false
    }
    pub fn push_screen_audio(&self, _bytes: &[u8]) -> bool {
        false
    }
    pub fn stop_screen_audio(&self) {}
}

#[tauri::command]
pub async fn call_join() -> serde_json::Value {
    serde_json::json!({ "ok": false, "reason": "call nativa só no Linux" })
}

#[tauri::command]
pub fn call_leave() {}

#[tauri::command]
pub fn call_push_mic(_request: Request<'_>) {}

#[tauri::command]
pub async fn call_pull() -> Response {
    Response::new(Vec::<u8>::new())
}

#[tauri::command]
pub async fn call_set_subscribed(_user_id: u64, _screen: bool, _on: bool) {}

#[tauri::command]
pub async fn call_pull_video() -> Response {
    Response::new(Vec::<u8>::new())
}

#[tauri::command]
pub async fn call_push_camera(_request: Request<'_>) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub fn call_stop_camera() {}

#[tauri::command]
pub fn call_keyframe(_sid: String) {}

#[tauri::command]
pub fn call_log(_text: String) {}

#[tauri::command]
pub async fn call_screen_fallback(_user_id: u64) {}

#[tauri::command]
pub async fn call_stats(_sid: String) -> Vec<serde_json::Value> {
    Vec::new()
}
