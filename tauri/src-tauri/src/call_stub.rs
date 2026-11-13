//! Windows: a call roda no próprio WebView2 (Chromium tem WebRTC) — nada de call nativa.
//! Os comandos existem só pra lista do app ficar igual nos dois sistemas.

use tauri::ipc::{Request, Response};

#[derive(Default)]
pub struct Call;

impl Call {
    pub fn leave(&self) {}
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
pub fn call_set_subscribed(_user_id: u64, _screen: bool, _on: bool) {}
