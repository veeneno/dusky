//! Call pelo servidor de mídia (LiveKit) feita no Rust — só no Linux.
//!
//! Por que: o WebKitGTK das distros vem sem WebRTC (`RTCPeerConnection` não existe), então a página
//! não consegue falar com o LiveKit. Aqui só o TRANSPORTE sai da página; o resto continua no site:
//!
//!   microfone:  getUserMedia → supressão de ruído/gate/nivelador/limitador (worklets do site)
//!               → worklet "didiscord-pcm-tap" → call_push_mic (PCM float32, 48 kHz mono)
//!               → NativeAudioSource → LiveKit
//!   quem fala:  LiveKit → NativeAudioStream (por faixa) → fila aqui → call_pull (a página busca em laço)
//!               → worklet "didiscord-pcm-player" → MediaStream → o MESMO caminho de sempre do site
//!               (<audio>, volume por pessoa, reforço >100%, áudio espacial, indicador de fala)
//!
//! O servidor não muda: o ingresso vem do mesmo GET /api/rtc/sfu que o navegador usa.

use crate::app::{self, AppState};
use crate::server::log;
use futures_util::StreamExt;
use livekit::options::{AudioEncoding, TrackPublishOptions};
use livekit::prelude::*;
use livekit::webrtc::audio_frame::AudioFrame;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use livekit::webrtc::audio_source::{AudioSourceOptions, RtcAudioSource};
use livekit::webrtc::audio_stream::native::NativeAudioStream;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, Webview};
use tokio::sync::{mpsc, Notify};

const RATE: u32 = 48_000;
/// fila máxima por faixa antes de jogar o começo fora (a página parou de buscar, aba travada…)
const MAX_QUEUE_SECONDS: usize = 1;

/// PCM de cada faixa remota esperando a página buscar
#[derive(Default)]
struct Hub {
    queues: Mutex<HashMap<String, (u32, VecDeque<f32>)>>, // sid -> (canais, amostras intercaladas)
    notify: Notify,
}

struct Session {
    id: u64,
    room: Arc<Room>,
    mic_tx: mpsc::UnboundedSender<Vec<i16>>,
}

#[derive(Default)]
pub struct Call {
    session: Mutex<Option<Session>>,
    next_id: AtomicU64,
    hub: Arc<Hub>,
}

impl Call {
    fn current_id(&self) -> Option<u64> {
        self.session.lock().unwrap().as_ref().map(|s| s.id)
    }

    /// sai da sala (seguro de chamar sem estar em call)
    pub fn leave(&self) {
        let Some(s) = self.session.lock().unwrap().take() else { return };
        self.hub.queues.lock().unwrap().clear();
        self.hub.notify.notify_waiters();
        tauri::async_runtime::spawn(async move {
            let _ = s.room.close().await;
        });
    }
}

fn emit(app: &AppHandle, ev: Value) {
    app::emit_to_main(app, "call:event", &ev);
}

fn source_name(s: TrackSource) -> &'static str {
    match s {
        TrackSource::Microphone => "microphone",
        TrackSource::ScreenshareAudio => "screen_share_audio",
        TrackSource::Screenshare => "screen_share",
        TrackSource::Camera => "camera",
        _ => "unknown",
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinOpts {
    path: String,
    token: String,
    mic_bitrate: Option<u64>,
}

/// Entra na sala do canal. O endereço é sempre o do servidor em que o app está conectado
/// (o site só manda o caminho e o ingresso).
#[tauri::command]
pub async fn call_join(app: AppHandle, webview: Webview, opts: JoinOpts) -> Value {
    if app::require_site(&app, &webview).is_err() {
        return json!({ "ok": false, "reason": "origem não permitida" });
    }
    let path_ok = opts.path.starts_with('/')
        && opts.path.len() <= 65
        && opts.path[1..].chars().all(|c| c.is_ascii_alphanumeric() || "/_-".contains(c));
    if !path_ok || opts.token.is_empty() || opts.token.len() > 4096 {
        return json!({ "ok": false, "reason": "pedido inválido" });
    }
    let st = app.state::<AppState>();
    st.call.leave();

    let site = st.site();
    let ws = if let Some(rest) = site.strip_prefix("https") { format!("wss{rest}") } else { site.replacen("http", "ws", 1) };
    let url = format!("{ws}{}", opts.path);
    let mut options = RoomOptions::default();
    options.auto_subscribe = true;
    options.adaptive_stream = false;
    options.dynacast = false;

    let (room, mut events) = match Room::connect(&url, &opts.token, options).await {
        Ok(v) => v,
        Err(err) => {
            log::warn(&format!("não consegui entrar na sala do servidor de mídia: {err}"));
            return json!({ "ok": false, "reason": err.to_string() });
        }
    };
    let room = Arc::new(room);
    let id = st.call.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    log::info(&format!("call: entrei na sala ({url})"));

    // ---------- microfone: fonte nativa + faixa publicada já de cara ----------
    let source = NativeAudioSource::new(
        // o site já tratou o áudio (supressão de ruído, gate, ganho): aqui não mexe em nada
        AudioSourceOptions { echo_cancellation: false, noise_suppression: false, auto_gain_control: false },
        RATE,
        1,
        100,
    );
    let track = LocalAudioTrack::create_audio_track("mic", RtcAudioSource::Native(source.clone()));
    let publish = room
        .local_participant()
        .publish_track(
            LocalTrack::Audio(track),
            TrackPublishOptions {
                source: TrackSource::Microphone,
                // voz: sem DTX (cortava começo de palavra), com RED — igual ao site
                dtx: false,
                red: true,
                audio_encoding: opts.mic_bitrate.filter(|b| *b > 0).map(|max_bitrate| AudioEncoding { max_bitrate }),
                ..Default::default()
            },
        )
        .await;
    if let Err(err) = publish {
        log::warn(&format!("call: não consegui publicar o microfone: {err}"));
        emit(&app, json!({ "ev": "error", "message": format!("não consegui publicar o microfone: {err}") }));
    }

    let (mic_tx, mut mic_rx) = mpsc::unbounded_channel::<Vec<i16>>();
    tauri::async_runtime::spawn(async move {
        while let Some(samples) = mic_rx.recv().await {
            let n = samples.len() as u32;
            let frame = AudioFrame { data: samples.into(), sample_rate: RATE, num_channels: 1, samples_per_channel: n };
            if let Err(err) = source.capture_frame(&frame).await {
                log::warn(&format!("call: falha ao mandar o microfone: {err}"));
            }
        }
    });

    *st.call.session.lock().unwrap() = Some(Session { id, room: room.clone(), mic_tx });

    // ---------- eventos da sala ----------
    let handle = app.clone();
    let hub = st.call.hub.clone();
    tauri::async_runtime::spawn(async move {
        let mut readers: HashMap<String, tauri::async_runtime::JoinHandle<()>> = HashMap::new();
        // quem já estava na sala antes de eu entrar
        for (_, p) in room.remote_participants() {
            emit(&handle, json!({ "ev": "participant", "identity": p.identity().to_string() }));
        }
        while let Some(event) = events.recv().await {
            if handle.state::<AppState>().call.current_id() != Some(id) {
                break;
            }
            match event {
                RoomEvent::TrackSubscribed { track, publication, participant } => {
                    let identity = participant.identity().to_string();
                    let source = publication.source();
                    let sid = publication.sid().to_string();
                    match track {
                        RemoteTrack::Audio(audio) => {
                            let channels: u32 = if source == TrackSource::ScreenshareAudio { 2 } else { 1 };
                            hub.queues.lock().unwrap().insert(sid.clone(), (channels, VecDeque::new()));
                            let mut stream = NativeAudioStream::new(audio.rtc_track(), RATE as i32, channels as i32);
                            let hub2 = hub.clone();
                            let sid2 = sid.clone();
                            let reader = tauri::async_runtime::spawn(async move {
                                let cap = RATE as usize * channels as usize * MAX_QUEUE_SECONDS;
                                while let Some(frame) = stream.next().await {
                                    {
                                        let mut queues = hub2.queues.lock().unwrap();
                                        let Some((_, q)) = queues.get_mut(&sid2) else { break };
                                        q.extend(frame.data.iter().map(|s| *s as f32 / 32768.0));
                                        if q.len() > cap {
                                            let drop = q.len() - cap / 4;
                                            q.drain(..drop);
                                        }
                                    }
                                    hub2.notify.notify_waiters();
                                }
                            });
                            if let Some(old) = readers.insert(sid.clone(), reader) {
                                old.abort();
                            }
                            emit(&handle, json!({ "ev": "track", "sid": sid, "identity": identity, "source": source_name(source), "kind": "audio", "channels": channels, "sampleRate": RATE }));
                        }
                        RemoteTrack::Video(_) => {
                            // assistir tela/câmera pelo app Linux é a próxima etapa
                            emit(&handle, json!({ "ev": "track", "sid": sid, "identity": identity, "source": source_name(source), "kind": "video" }));
                        }
                    }
                }
                RoomEvent::TrackUnsubscribed { publication, participant, .. } => {
                    let sid = publication.sid().to_string();
                    if let Some(r) = readers.remove(&sid) {
                        r.abort();
                    }
                    hub.queues.lock().unwrap().remove(&sid);
                    emit(&handle, json!({ "ev": "trackEnded", "sid": sid, "identity": participant.identity().to_string(), "source": source_name(publication.source()) }));
                }
                RoomEvent::ParticipantConnected(p) => emit(&handle, json!({ "ev": "participant", "identity": p.identity().to_string() })),
                RoomEvent::ParticipantDisconnected(p) => emit(&handle, json!({ "ev": "participantLeft", "identity": p.identity().to_string() })),
                RoomEvent::Reconnecting => emit(&handle, json!({ "ev": "reconnecting" })),
                RoomEvent::Reconnected => emit(&handle, json!({ "ev": "reconnected" })),
                RoomEvent::Disconnected { reason } => {
                    log::warn(&format!("call: conexão com o servidor de mídia caiu: {reason:?}"));
                    emit(&handle, json!({ "ev": "disconnected", "reason": format!("{reason:?}") }));
                    let st = handle.state::<AppState>();
                    let mut s = st.call.session.lock().unwrap();
                    if s.as_ref().map(|s| s.id) == Some(id) {
                        *s = None;
                    }
                    break;
                }
                _ => {}
            }
        }
        for (_, r) in readers {
            r.abort();
        }
    });

    json!({ "ok": true })
}

#[tauri::command]
pub fn call_leave(app: AppHandle, webview: Webview) {
    if app::require_site(&app, &webview).is_ok() {
        app.state::<AppState>().call.leave();
        log::info("call: saí da sala");
    }
}

/// microfone já tratado pelo site: float32 little-endian, 48 kHz, mono (corpo cru do invoke)
#[tauri::command]
pub fn call_push_mic(app: AppHandle, webview: Webview, request: Request<'_>) {
    if app::require_site(&app, &webview).is_err() {
        return;
    }
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(v) => {
            log::warn(&format!("call: microfone chegou como JSON em vez de bytes ({} chars)", v.to_string().len()));
            return;
        }
    };
    #[cfg(debug_assertions)]
    {
        static N: AtomicU64 = AtomicU64::new(0);
        static QUIET: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::Relaxed);
        let (sum, cnt) = bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).fold((0.0f32, 0u32), |(s, c), x| (s + x * x, c + 1));
        if (sum / cnt.max(1) as f32).sqrt() < 0.005 {
            QUIET.fetch_add(1, Ordering::Relaxed);
        }
        // a cada ~30 s (modo debug): quantos blocos chegaram e quantos vieram quase mudos
        if n % 1500 == 0 {
            log::info(&format!("call: microfone bloco {n} ({} bytes), {} blocos quase mudos até aqui", bytes.len(), QUIET.load(Ordering::Relaxed)));
        }
    }
    let samples: Vec<i16> = bytes
        .chunks_exact(4)
        .map(|b| (f32::from_le_bytes([b[0], b[1], b[2], b[3]]).clamp(-1.0, 1.0) * 32767.0) as i16)
        .collect();
    if samples.is_empty() {
        return;
    }
    if let Some(s) = app.state::<AppState>().call.session.lock().unwrap().as_ref() {
        let _ = s.mic_tx.send(samples);
    }
}

/// A página busca o áudio de quem fala em laço. Espera até ~100 ms por novidade e devolve tudo
/// o que juntou, em binário:
///   repetido: [u16 tamanho do sid][sid][u8 canais][u32 nº de amostras][f32 LE × amostras]
#[tauri::command]
pub async fn call_pull(app: AppHandle, webview: Webview) -> Response {
    if app::require_site(&app, &webview).is_err() {
        return Response::new(Vec::<u8>::new());
    }
    let hub = app.state::<AppState>().call.hub.clone();
    let has_data = || hub.queues.lock().unwrap().values().any(|(_, q)| !q.is_empty());
    if !has_data() {
        let _ = tokio::time::timeout(Duration::from_millis(100), hub.notify.notified()).await;
    }
    let mut out: Vec<u8> = Vec::new();
    let mut queues = hub.queues.lock().unwrap();
    for (sid, (channels, q)) in queues.iter_mut() {
        if q.is_empty() {
            continue;
        }
        let sid_bytes = sid.as_bytes();
        out.extend((sid_bytes.len() as u16).to_le_bytes());
        out.extend(sid_bytes);
        out.push(*channels as u8);
        out.extend((q.len() as u32).to_le_bytes());
        out.reserve(q.len() * 4);
        for s in q.drain(..) {
            out.extend(s.to_le_bytes());
        }
    }
    Response::new(out)
}

/// parar de assistir / voltar a assistir a tela de alguém (identidade "<id>" ou "tela-<id>")
#[tauri::command]
pub fn call_set_subscribed(app: AppHandle, webview: Webview, user_id: u64, screen: bool, on: bool) {
    if app::require_site(&app, &webview).is_err() {
        return;
    }
    let st = app.state::<AppState>();
    let guard = st.call.session.lock().unwrap();
    let Some(s) = guard.as_ref() else { return };
    let ids = [user_id.to_string(), format!("tela-{user_id}")];
    for (identity, p) in s.room.remote_participants() {
        if !ids.contains(&identity.to_string()) {
            continue;
        }
        for (_, publication) in p.track_publications() {
            let is_screen = matches!(publication.source(), TrackSource::Screenshare | TrackSource::ScreenshareAudio);
            if is_screen == screen {
                publication.set_subscribed(on);
            }
        }
    }
}
