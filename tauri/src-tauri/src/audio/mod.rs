//! Áudio do compartilhamento de tela (porte do electron/audio/).
//!
//! O navegador só sabe pegar o áudio do sistema inteiro, o que devolveria a voz de quem está na call
//! pra própria call. Então cada sistema usa um captador próprio que entrega PCM cru (float32
//! intercalado, 48 kHz, estéreo), e o Rust repassa pro site (window.didiscordDesktop.onPcmChunk).
//! O site (public/js/app/23-call-media.js, capturePcmAudioTrack) monta uma MediaStreamTrack com isso.
//!
//! Fluxo:
//!   1. o seletor devolve a fonte escolhida      -> prepare()  (decide o plano, não inicia nada)
//!   2. o site pede o plano (screen_audio_plan)  -> start()    (começa a mandar PCM)
//!   3. parou de compartilhar / saiu da call     -> stop()

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows as platform;
#[cfg(not(any(target_os = "linux", windows)))]
mod platform {
    pub struct Plan;
    pub async fn prepare(_t: super::Target, _app: &tauri::AppHandle) -> Option<Plan> {
        None
    }
    pub fn start(_p: Plan, _app: tauri::AppHandle, _on_end: Box<dyn FnOnce() + Send>) -> Result<super::Running, String> {
        Err("sem captura de áudio neste sistema".into())
    }
    pub async fn list_audio_apps() -> super::AudioApps {
        super::AudioApps { available: false, apps: Vec::new() }
    }
}

use crate::app::{self, AppState};
use crate::picker::AudioChoice;
use crate::sources::Source;
use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Webview};

/// o que vai ter áudio
pub enum Target {
    /// X11/Windows: a fonte escolhida no nosso seletor (janela = só aquele app; tela = tudo menos o didiscord)
    Source(Source),
    /// Wayland: o som escolhido à parte no seletor (system | app | none)
    Choice(AudioChoice),
}

#[derive(Serialize)]
pub struct AudioApp {
    pub key: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct AudioApps {
    pub available: bool,
    pub apps: Vec<AudioApp>,
}

/// captura em andamento (stop é seguro de chamar mais de uma vez)
pub struct Running {
    pub stop: Box<dyn FnOnce() + Send>,
}

#[derive(Default)]
pub struct ScreenAudio {
    pending: Mutex<Option<platform::Plan>>,
    running: Mutex<Option<(u64, Running)>>,
    next_id: AtomicU64,
    app: Mutex<Option<AppHandle>>,
}

pub const PCM_FORMAT: (u32, u32) = (48_000, 2);

fn pcm_plan() -> Value {
    json!({ "mode": "pcm", "sampleRate": PCM_FORMAT.0, "channels": PCM_FORMAT.1, "isFloat": true, "bitsPerSample": 32 })
}

impl ScreenAudio {
    pub async fn prepare(&self, target: Target) {
        self.stop();
        let Some(app) = self.app.lock().unwrap().clone() else { return };
        let plan = platform::prepare(target, &app).await;
        *self.pending.lock().unwrap() = plan;
    }

    fn start(&self, app: &AppHandle) -> Value {
        if self.running.lock().unwrap().is_some() {
            return pcm_plan();
        }
        let Some(plan) = self.pending.lock().unwrap().take() else { return json!({ "mode": "none" }) };
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        let handle = app.clone();
        let on_end = Box::new(move || {
            let st = handle.state::<AppState>();
            let mut running = st.audio.running.lock().unwrap();
            if running.as_ref().map(|(i, _)| *i) == Some(id) {
                *running = None;
            }
        });
        // Linux com a call pelo Rust: o áudio da tela vai direto pra sala (faixa "som-da-tela"),
        // sem passar pela página — o WebKitGTK nem tem como montar uma faixa com ele
        let to_call = app.state::<AppState>().call.start_screen_audio();
        match platform::start(plan, app.clone(), on_end) {
            Ok(r) => {
                *self.running.lock().unwrap() = Some((id, r));
                if to_call {
                    json!({ "mode": "none", "native": true })
                } else {
                    pcm_plan()
                }
            }
            Err(err) => {
                app.state::<AppState>().call.stop_screen_audio();
                crate::server::log::warn(&format!("falha ao iniciar a captura de áudio da tela: {err}"));
                json!({ "mode": "none" })
            }
        }
    }

    pub fn stop(&self) {
        *self.pending.lock().unwrap() = None;
        if let Some(app) = self.app.lock().unwrap().clone() {
            app.state::<AppState>().call.stop_screen_audio();
        }
        let running = self.running.lock().unwrap().take();
        if let Some((_, r)) = running {
            (r.stop)();
        }
    }

    pub fn set_app(&self, app: &AppHandle) {
        *self.app.lock().unwrap() = Some(app.clone());
    }
}

/// manda um pedaço de PCM pro site (base64 — o bridge.js converte de volta pra Uint8Array)
pub fn send_pcm(app: &AppHandle, bytes: &[u8]) {
    if bytes.is_empty() {
        return;
    }
    if app.state::<AppState>().call.push_screen_audio(bytes) {
        return; // foi pra call nativa
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    app::emit_to_main(app, "pcm", &b64);
}

pub async fn list_audio_apps() -> AudioApps {
    platform::list_audio_apps().await
}

// ---------- comandos do site ----------

/// depois de começar o compartilhamento: como o áudio da tela vai ser obtido
// async: roda no runtime do tokio (iniciar o captador abre um processo filho)
#[tauri::command]
pub async fn screen_audio_plan(app: AppHandle, webview: Webview) -> Value {
    if app::require_site(&app, &webview).is_err() {
        return json!({ "mode": "none" });
    }
    app.state::<AppState>().audio.start(&app)
}

#[tauri::command]
pub fn screen_audio_stop(app: AppHandle, webview: Webview) {
    if app::require_site(&app, &webview).is_ok() {
        app.state::<AppState>().audio.stop();
    }
}
