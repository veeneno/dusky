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
//!   tela/câmera dos outros: LiveKit → NativeVideoStream → JPEG (no máx. 30 fps, 1080p) →
//!               call_pull_video → <canvas>.captureStream() → o <video> de sempre do site
//!   minha câmera: getUserMedia → <canvas> → JPEG → call_push_camera → NativeVideoSource → LiveKit
//!   áudio da minha tela: o captador do PipeWire (audio/linux.rs) manda direto pra cá
//!               (push_screen_audio) → faixa "som-da-tela" → LiveKit, sem passar pela página
//!   qualidade:  call_stats(sid) → os números do libwebrtc no formato do getStats() do navegador
//!
//! O servidor não muda: o ingresso vem do mesmo GET /api/rtc/sfu que o navegador usa.

use crate::app::{self, AppState};
use crate::server::log;
use futures_util::StreamExt;
use livekit::options::{AudioEncoding, TrackPublishOptions, VideoEncoding};
use livekit::prelude::*;
use livekit::webrtc::audio_frame::AudioFrame;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use livekit::webrtc::audio_source::{AudioSourceOptions, RtcAudioSource};
use livekit::webrtc::audio_stream::native::NativeAudioStream;
use livekit::webrtc::native::yuv_helper;
use livekit::webrtc::prelude::{I420Buffer, RtcVideoSource, VideoBuffer, VideoFrame, VideoResolution, VideoRotation};
use livekit::webrtc::stats::RtcStats;
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_stream::native::NativeVideoStream;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, Webview};
use tokio::sync::{mpsc, Notify};

const RATE: u32 = 48_000;
/// fila máxima por faixa antes de jogar o começo fora (a página parou de buscar, aba travada…)
const MAX_QUEUE_SECONDS: usize = 1;
/// vídeo que vai pra página: no máximo isso (o resto é reduzido no Rust, antes de virar JPEG)
const MAX_VIDEO_W: u32 = 1920;
const MAX_VIDEO_H: u32 = 1080;
const MIN_VIDEO_INTERVAL: Duration = Duration::from_millis(33); // ~30 fps
const JPEG_QUALITY: u8 = 82;

/// PCM de cada faixa remota esperando a página buscar
#[derive(Default)]
struct Hub {
    queues: Mutex<HashMap<String, (u32, VecDeque<f32>)>>, // sid -> (canais, amostras intercaladas)
    notify: Notify,
}

/// último quadro (JPEG) de cada vídeo remoto; a página só pega quadros novos
struct VideoSlot {
    seq: u64,
    sent: u64,
    width: u32,
    height: u32,
    jpeg: Arc<Vec<u8>>,
}

#[derive(Default)]
struct VideoHub {
    slots: Mutex<HashMap<String, VideoSlot>>,
    notify: Notify,
}

/// uma faixa que eu publico a partir de dados que chegam aos pedaços
struct AudioPub {
    tx: mpsc::UnboundedSender<Vec<i16>>,
    leftover: Vec<u8>,
}

struct CameraPub {
    source: NativeVideoSource,
    sid: Arc<Mutex<Option<TrackSid>>>,
    width: u32,
    height: u32,
}

struct Session {
    id: u64,
    room: Arc<Room>,
    mic_tx: mpsc::UnboundedSender<Vec<i16>>,
    /// faixas remotas assinadas agora (pros números de qualidade)
    tracks: Arc<Mutex<HashMap<String, RemoteTrack>>>,
}

#[derive(Default)]
pub struct Call {
    session: Mutex<Option<Session>>,
    next_id: AtomicU64,
    hub: Arc<Hub>,
    video: Arc<VideoHub>,
    screen_audio: Mutex<Option<AudioPub>>,
    camera: Mutex<Option<CameraPub>>,
}

impl Call {
    fn current_id(&self) -> Option<u64> {
        self.session.lock().unwrap().as_ref().map(|s| s.id)
    }

    fn room(&self) -> Option<Arc<Room>> {
        self.session.lock().unwrap().as_ref().map(|s| s.room.clone())
    }

    /// sai da sala (seguro de chamar sem estar em call)
    pub fn leave(&self) {
        *self.screen_audio.lock().unwrap() = None;
        *self.camera.lock().unwrap() = None;
        let Some(s) = self.session.lock().unwrap().take() else { return };
        self.hub.queues.lock().unwrap().clear();
        self.hub.notify.notify_waiters();
        self.video.slots.lock().unwrap().clear();
        self.video.notify.notify_waiters();
        tauri::async_runtime::spawn(async move {
            let _ = s.room.close().await;
        });
    }

    // ---------- áudio da minha tela (vem do captador do PipeWire, não da página) ----------

    /// começa a publicar o áudio da tela compartilhada (estéreo, 48 kHz). false = não estou em call.
    pub fn start_screen_audio(&self) -> bool {
        let Some(room) = self.room() else { return false };
        self.stop_screen_audio();
        let source = NativeAudioSource::new(
            AudioSourceOptions { echo_cancellation: false, noise_suppression: false, auto_gain_control: false },
            RATE,
            2,
            200,
        );
        let track = LocalAudioTrack::create_audio_track("som-da-tela", RtcAudioSource::Native(source.clone()));
        let sid2: Arc<Mutex<Option<TrackSid>>> = Arc::new(Mutex::new(None));
        let (tx, mut rx) = mpsc::unbounded_channel::<Vec<i16>>();
        tauri::async_runtime::spawn(async move {
            let opts = TrackPublishOptions {
                source: TrackSource::ScreenshareAudio,
                dtx: false,
                red: false,
                audio_encoding: Some(AudioEncoding { max_bitrate: 192_000 }),
                ..Default::default()
            };
            match room.local_participant().publish_track(LocalTrack::Audio(track), opts).await {
                Ok(p) => *sid2.lock().unwrap() = Some(p.sid()),
                Err(err) => {
                    log::warn(&format!("call: não consegui publicar o áudio da tela: {err}"));
                    return;
                }
            }
            log::info("call: áudio da tela no ar");
            while let Some(samples) = rx.recv().await {
                let n = samples.len() as u32 / 2;
                let frame = AudioFrame { data: samples.into(), sample_rate: RATE, num_channels: 2, samples_per_channel: n };
                let _ = source.capture_frame(&frame).await;
            }
            // canal fechado = parou: tira do ar
            let sid = sid2.lock().unwrap().take();
            if let Some(sid) = sid {
                let _ = room.local_participant().unpublish_track(&sid).await;
            }
        });
        *self.screen_audio.lock().unwrap() = Some(AudioPub { tx, leftover: Vec::new() });
        true
    }

    /// pedaço de PCM float32 estéreo intercalado. false = não tem áudio da tela no ar (manda pra página)
    pub fn push_screen_audio(&self, bytes: &[u8]) -> bool {
        let mut guard = self.screen_audio.lock().unwrap();
        let Some(p) = guard.as_mut() else { return false };
        p.leftover.extend_from_slice(bytes);
        let usable = p.leftover.len() - p.leftover.len() % 8; // quadro estéreo f32 = 8 bytes
        if usable == 0 {
            return true;
        }
        let samples: Vec<i16> = p.leftover[..usable]
            .chunks_exact(4)
            .map(|b| (f32::from_le_bytes([b[0], b[1], b[2], b[3]]).clamp(-1.0, 1.0) * 32767.0) as i16)
            .collect();
        p.leftover.drain(..usable);
        let _ = p.tx.send(samples);
        true
    }

    pub fn stop_screen_audio(&self) {
        // soltar o AudioPub fecha o canal; a tarefa dele tira a faixa do ar
        *self.screen_audio.lock().unwrap() = None;
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

// ---------- vídeo remoto -> JPEG ----------

/// I420 -> JPEG (passando pelo YCbCr direto: sem conversão de cor, só repete o croma)
fn i420_to_jpeg(buf: &I420Buffer) -> Option<Vec<u8>> {
    let (w, h) = (buf.width(), buf.height());
    if w == 0 || h == 0 || w > u16::MAX as u32 || h > u16::MAX as u32 {
        return None;
    }
    let (sy, su, sv) = buf.strides();
    let (y, u, v) = buf.data();
    let mut ycc = vec![0u8; (w * h * 3) as usize];
    for row in 0..h {
        let yr = (row * sy) as usize;
        let cr = ((row / 2) * su) as usize;
        let vr = ((row / 2) * sv) as usize;
        let out = &mut ycc[(row * w * 3) as usize..((row + 1) * w * 3) as usize];
        for col in 0..w as usize {
            out[col * 3] = y[yr + col];
            out[col * 3 + 1] = u[cr + col / 2];
            out[col * 3 + 2] = v[vr + col / 2];
        }
    }
    let mut jpeg = Vec::with_capacity((w * h / 4) as usize);
    let mut enc = jpeg_encoder::Encoder::new(&mut jpeg, JPEG_QUALITY);
    enc.set_sampling_factor(jpeg_encoder::SamplingFactor::F_2_2);
    enc.encode(&ycc, w as u16, h as u16, jpeg_encoder::ColorType::Ycbcr).ok()?;
    Some(jpeg)
}

fn spawn_video_reader(track: RemoteVideoTrack, sid: String, video: Arc<VideoHub>) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut stream = NativeVideoStream::new(track.rtc_track());
        let busy = Arc::new(AtomicBool::new(false));
        let mut last = Instant::now() - MIN_VIDEO_INTERVAL;
        let mut seq: u64 = 0;
        while let Some(frame) = stream.next().await {
            // a página ainda não pegou / o anterior ainda está virando JPEG / rápido demais: pula
            if busy.load(Ordering::Acquire) || last.elapsed() < MIN_VIDEO_INTERVAL {
                continue;
            }
            last = Instant::now();
            busy.store(true, Ordering::Release);
            seq += 1;
            let (busy2, video2, sid2, this_seq) = (busy.clone(), video.clone(), sid.clone(), seq);
            tauri::async_runtime::spawn_blocking(move || {
                let mut i420 = frame.buffer.to_i420();
                let (w, h) = (i420.width(), i420.height());
                if w > MAX_VIDEO_W || h > MAX_VIDEO_H {
                    let k = (MAX_VIDEO_W as f64 / w as f64).min(MAX_VIDEO_H as f64 / h as f64);
                    let (nw, nh) = (((w as f64 * k) as i32) & !1, ((h as f64 * k) as i32) & !1);
                    i420 = i420.scale(nw.max(2), nh.max(2));
                }
                if let Some(jpeg) = i420_to_jpeg(&i420) {
                    let mut slots = video2.slots.lock().unwrap();
                    if let Some(slot) = slots.get_mut(&sid2) {
                        slot.seq = this_seq;
                        slot.width = i420.width();
                        slot.height = i420.height();
                        slot.jpeg = Arc::new(jpeg);
                    }
                    drop(slots);
                    video2.notify.notify_waiters();
                }
                busy2.store(false, Ordering::Release);
            });
        }
    })
}

// ---------- números de qualidade ----------

/// relatório do libwebrtc -> objetos no formato do getStats() do navegador (só o que o site lê)
fn stats_to_js(stats: Vec<RtcStats>) -> Vec<Value> {
    let mut out = Vec::new();
    for s in stats {
        match s {
            RtcStats::InboundRtp(r) => out.push(json!({
                "id": r.rtc.id, "type": "inbound-rtp", "timestamp": r.rtc.timestamp as f64 / 1000.0,
                "kind": r.stream.kind, "transportId": r.stream.transport_id,
                "packetsReceived": r.received.packets_received, "packetsLost": r.received.packets_lost,
                "jitter": r.received.jitter, "bytesReceived": r.inbound.bytes_received,
                "packetsDiscarded": r.inbound.packets_discarded,
                "jitterBufferDelay": r.inbound.jitter_buffer_delay,
                "jitterBufferEmittedCount": r.inbound.jitter_buffer_emitted_count,
                "concealedSamples": r.inbound.concealed_samples,
                "totalSamplesReceived": r.inbound.total_samples_received,
                "frameWidth": r.inbound.frame_width, "frameHeight": r.inbound.frame_height,
                "framesPerSecond": r.inbound.frames_per_second, "audioLevel": r.inbound.audio_level,
            })),
            RtcStats::OutboundRtp(r) => out.push(json!({
                "id": r.rtc.id, "type": "outbound-rtp", "timestamp": r.rtc.timestamp as f64 / 1000.0,
                "kind": r.stream.kind, "bytesSent": r.sent.bytes_sent, "packetsSent": r.sent.packets_sent,
                "frameWidth": r.outbound.frame_width, "frameHeight": r.outbound.frame_height,
                "framesPerSecond": r.outbound.frames_per_second,
            })),
            RtcStats::Transport(r) => out.push(json!({
                "id": r.rtc.id, "type": "transport", "timestamp": r.rtc.timestamp as f64 / 1000.0,
                "selectedCandidatePairId": r.transport.selected_candidate_pair_id,
            })),
            RtcStats::CandidatePair(r) => out.push(json!({
                "id": r.rtc.id, "type": "candidate-pair", "timestamp": r.rtc.timestamp as f64 / 1000.0,
                "currentRoundTripTime": r.candidate_pair.current_round_trip_time,
                "localCandidateId": r.candidate_pair.local_candidate_id,
                "remoteCandidateId": r.candidate_pair.remote_candidate_id,
                "nominated": r.candidate_pair.nominated,
            })),
            _ => {}
        }
    }
    out
}

// ---------- comandos ----------

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

    let tracks: Arc<Mutex<HashMap<String, RemoteTrack>>> = Arc::default();
    *st.call.session.lock().unwrap() = Some(Session { id, room: room.clone(), mic_tx, tracks: tracks.clone() });

    // ---------- eventos da sala ----------
    let handle = app.clone();
    let hub = st.call.hub.clone();
    let video = st.call.video.clone();
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
                    // a minha própria tela (o auxiliar entra como "tela-<meu id>"): não assina —
                    // seria decodificar e converter o próprio vídeo à toa
                    if identity == format!("tela-{}", room.local_participant().identity()) {
                        publication.set_subscribed(false);
                        continue;
                    }
                    let source = publication.source();
                    let sid = publication.sid().to_string();
                    tracks.lock().unwrap().insert(sid.clone(), track.clone());
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
                        RemoteTrack::Video(v) => {
                            video.slots.lock().unwrap().insert(
                                sid.clone(),
                                VideoSlot { seq: 0, sent: 0, width: 0, height: 0, jpeg: Arc::new(Vec::new()) },
                            );
                            let reader = spawn_video_reader(v, sid.clone(), video.clone());
                            if let Some(old) = readers.insert(sid.clone(), reader) {
                                old.abort();
                            }
                            emit(&handle, json!({ "ev": "track", "sid": sid, "identity": identity, "source": source_name(source), "kind": "video" }));
                        }
                    }
                }
                RoomEvent::TrackUnsubscribed { publication, participant, .. } => {
                    let sid = publication.sid().to_string();
                    if let Some(r) = readers.remove(&sid) {
                        r.abort();
                    }
                    tracks.lock().unwrap().remove(&sid);
                    hub.queues.lock().unwrap().remove(&sid);
                    video.slots.lock().unwrap().remove(&sid);
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

fn raw_body<'a>(request: &'a Request<'_>, what: &str) -> Option<&'a [u8]> {
    match request.body() {
        InvokeBody::Raw(bytes) => Some(bytes),
        InvokeBody::Json(_) => {
            log::warn(&format!("call: {what} chegou como JSON em vez de bytes"));
            None
        }
    }
}

/// microfone já tratado pelo site: float32 little-endian, 48 kHz, mono (corpo cru do invoke)
#[tauri::command]
pub fn call_push_mic(app: AppHandle, webview: Webview, request: Request<'_>) {
    if app::require_site(&app, &webview).is_err() {
        return;
    }
    let Some(bytes) = raw_body(&request, "o microfone") else { return };
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

/// Quadros novos de vídeo (tela/câmera dos outros), em laço como o áudio. Espera até ~250 ms.
///   repetido: [u16 tamanho do sid][sid][u32 largura][u32 altura][u32 bytes][JPEG]
#[tauri::command]
pub async fn call_pull_video(app: AppHandle, webview: Webview) -> Response {
    if app::require_site(&app, &webview).is_err() {
        return Response::new(Vec::<u8>::new());
    }
    let video = app.state::<AppState>().call.video.clone();
    let has_new = || video.slots.lock().unwrap().values().any(|s| s.seq > s.sent);
    if !has_new() {
        let _ = tokio::time::timeout(Duration::from_millis(250), video.notify.notified()).await;
    }
    let mut out: Vec<u8> = Vec::new();
    let mut slots = video.slots.lock().unwrap();
    for (sid, slot) in slots.iter_mut() {
        if slot.seq <= slot.sent || slot.jpeg.is_empty() {
            continue;
        }
        slot.sent = slot.seq;
        let sid_bytes = sid.as_bytes();
        out.extend((sid_bytes.len() as u16).to_le_bytes());
        out.extend(sid_bytes);
        out.extend(slot.width.to_le_bytes());
        out.extend(slot.height.to_le_bytes());
        out.extend((slot.jpeg.len() as u32).to_le_bytes());
        out.extend(slot.jpeg.iter());
    }
    Response::new(out)
}

/// Minha câmera: um quadro em JPEG (a página desenha o <video> num canvas e manda). A faixa é
/// publicada no primeiro quadro e republicada se o tamanho mudar.
#[tauri::command]
pub async fn call_push_camera(app: AppHandle, webview: Webview, request: Request<'_>) -> Result<bool, String> {
    if app::require_site(&app, &webview).is_err() {
        return Ok(false);
    }
    let Some(bytes) = raw_body(&request, "a câmera") else { return Ok(false) };
    Ok(push_camera_frame(&app, bytes).await)
}

async fn push_camera_frame(app: &AppHandle, bytes: &[u8]) -> bool {
    let Ok(img) = image::load_from_memory_with_format(bytes, image::ImageFormat::Jpeg) else { return false };
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width() & !1, rgba.height() & !1);
    if w < 2 || h < 2 {
        return false;
    }
    let mut i420 = I420Buffer::new(w, h);
    {
        let (sy, su, sv) = i420.strides();
        let (y, u, v) = i420.data_mut();
        // "ABGR" no libyuv = bytes R,G,B,A na memória (o RGBA do image)
        yuv_helper::abgr_to_i420(rgba.as_raw(), rgba.width() * 4, y, sy, u, su, v, sv, w as i32, h as i32);
    }
    let st = app.state::<AppState>();
    let Some(room) = st.call.room() else { return false };
    let needs_publish = st.call.camera.lock().unwrap().as_ref().map(|c| c.width != w || c.height != h).unwrap_or(true);
    if needs_publish {
        stop_camera(app);
        let source = NativeVideoSource::new(VideoResolution { width: w, height: h }, false);
        let track = LocalVideoTrack::create_video_track("camera", RtcVideoSource::Native(source.clone()));
        let sid = Arc::new(Mutex::new(None));
        *st.call.camera.lock().unwrap() = Some(CameraPub { source: source.clone(), sid: sid.clone(), width: w, height: h });
        let opts = TrackPublishOptions {
            source: TrackSource::Camera,
            simulcast: false,
            video_encoding: Some(VideoEncoding { max_bitrate: 1_500_000, max_framerate: 30.0 }),
            ..Default::default()
        };
        match room.local_participant().publish_track(LocalTrack::Video(track), opts).await {
            Ok(p) => *sid.lock().unwrap() = Some(p.sid()),
            Err(err) => {
                log::warn(&format!("call: não consegui publicar a câmera: {err}"));
                *st.call.camera.lock().unwrap() = None;
                return false;
            }
        }
        log::info(&format!("call: câmera no ar ({w}x{h})"));
    }
    let guard = st.call.camera.lock().unwrap();
    let Some(cam) = guard.as_ref() else { return false };
    cam.source.capture_frame(&VideoFrame::new(VideoRotation::VideoRotation0, i420));
    true
}

fn stop_camera(app: &AppHandle) {
    let st = app.state::<AppState>();
    let Some(cam) = st.call.camera.lock().unwrap().take() else { return };
    let sid = cam.sid.lock().unwrap().take();
    if let (Some(sid), Some(room)) = (sid, st.call.room()) {
        tauri::async_runtime::spawn(async move {
            let _ = room.local_participant().unpublish_track(&sid).await;
        });
    }
}

#[tauri::command]
pub fn call_stop_camera(app: AppHandle, webview: Webview) {
    if app::require_site(&app, &webview).is_ok() {
        stop_camera(&app);
    }
}

/// números de qualidade de uma faixa remota, no formato do getStats() do navegador
#[tauri::command]
pub async fn call_stats(app: AppHandle, webview: Webview, sid: String) -> Vec<Value> {
    if app::require_site(&app, &webview).is_err() {
        return Vec::new();
    }
    let track = {
        let st = app.state::<AppState>();
        let guard = st.call.session.lock().unwrap();
        guard.as_ref().and_then(|s| s.tracks.lock().unwrap().get(&sid).cloned())
    };
    let Some(track) = track else { return Vec::new() };
    match track.get_stats().await {
        Ok(stats) => stats_to_js(stats),
        Err(_) => Vec::new(),
    }
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
