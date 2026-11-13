//! Compartilhamento de tela "nativo": captura + codificação UMA vez, de preferência na placa de vídeo,
//! entregue pra cada pessoa da call (ou pro servidor de mídia) pelo auxiliar didiscord-screencast
//! (electron/native/screencast, em Go). Porte direto do electron/screencast.js.
//!
//! Por que: pelo navegador a tela é codificada no processador, uma vez POR PESSOA assistindo, e o
//! Chromium não usa NVENC no Linux. Aqui o ffmpeg captura e codifica uma vez (NVENC → VAAPI/QSV/AMF →
//! x264, o que existir) e o auxiliar só empacota e manda o mesmo vídeo pra cada um.
//!
//! Wayland: o ffmpeg não lê a tela sem o portal do sistema. O auxiliar abre o portal, recebe o fd do
//! PipeWire e o GStreamer (pipewiresrc) captura e codifica.
//!
//! Conversa com o auxiliar: uma linha JSON por mensagem no stdin/stdout (protocolo em main.go).

use crate::app::{self, AppState};
use crate::audio;
use crate::picker::{self, AudioChoice, Picked};
use crate::server::log;
use crate::sources::{Kind, Source};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, Webview};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex as AsyncMutex};

const IS_WIN: bool = cfg!(windows);
const IS_LINUX: bool = cfg!(target_os = "linux");

pub fn is_wayland() -> bool {
    IS_LINUX && (std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland") || std::env::var_os("WAYLAND_DISPLAY").is_some())
}

/// Windows: processos filhos sem abrir janela de terminal
pub fn hide_console(cmd: &mut Command) {
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let _ = cmd;
}

/// ambiente pros programas do sistema: sem o LD_LIBRARY_PATH que o AppImage injeta, senão o
/// gst-launch do sistema carrega bibliotecas do pacote do app e os plugins quebram
pub fn child_command(bin: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(bin);
    if IS_LINUX && std::env::var_os("APPIMAGE").is_some() {
        cmd.env_remove("LD_LIBRARY_PATH");
    }
    hide_console(&mut cmd);
    cmd.kill_on_drop(true);
    cmd
}

/// arquivo que vem junto com o app (pasta native/ dos recursos) — ou, rodando do código-fonte, o
/// de electron/native/bin
pub fn native_bin(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let exe = if IS_WIN { format!("{name}.exe") } else { name.to_string() };
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("native").join(&exe);
        if p.exists() {
            return Some(p);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../electron/native/bin").join(&exe);
    dev.exists().then_some(dev)
}

struct RunOut {
    ok: bool,
    stdout: String,
    stderr: String,
}

async fn run(bin: &str, args: &[String], timeout_ms: u64) -> RunOut {
    let mut cmd = child_command(bin);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    match tokio::time::timeout(Duration::from_millis(timeout_ms), cmd.output()).await {
        Ok(Ok(out)) => RunOut {
            ok: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).into(),
            stderr: String::from_utf8_lossy(&out.stderr).into(),
        },
        Ok(Err(err)) => RunOut { ok: false, stdout: String::new(), stderr: err.to_string() },
        Err(_) => RunOut { ok: false, stdout: String::new(), stderr: "demorou demais".into() },
    }
}

fn last_line(s: &str) -> String {
    s.trim().lines().last().unwrap_or("falhou").to_string()
}

fn sv(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

// ---------------------------------------------------------------- codificadores (ffmpeg)

/// argumentos de cada codificador H.264 (sem B-frames, baixa latência). kbps = alvo, gop = quadros entre quadros-chave
fn encoder_args(enc: &str, kbps: u32, gop: u32) -> Vec<String> {
    let k = format!("{kbps}k");
    let g = gop.to_string();
    match enc {
        "h264_nvenc" => vec![
            "-c:v".into(), "h264_nvenc".into(), "-preset".into(), "p4".into(), "-tune".into(), "ll".into(), "-zerolatency".into(), "1".into(),
            "-rc".into(), "cbr".into(), "-b:v".into(), k.clone(), "-maxrate".into(), k, "-bufsize".into(), format!("{}k", kbps / 2),
            "-g".into(), g, "-bf".into(), "0".into(), "-profile:v".into(), "baseline".into(),
        ],
        "h264_vaapi" => vec![
            "-c:v".into(), "h264_vaapi".into(), "-profile:v".into(), "constrained_baseline".into(), "-b:v".into(), k.clone(),
            "-maxrate".into(), k, "-g".into(), g, "-bf".into(), "0".into(),
        ],
        "h264_qsv" => vec![
            "-c:v".into(), "h264_qsv".into(), "-preset".into(), "veryfast".into(), "-profile:v".into(), "baseline".into(),
            "-b:v".into(), k.clone(), "-maxrate".into(), k, "-g".into(), g, "-bf".into(), "0".into(),
        ],
        "h264_amf" => vec![
            "-c:v".into(), "h264_amf".into(), "-usage".into(), "ultralowlatency".into(), "-quality".into(), "speed".into(), "-rc".into(), "cbr".into(),
            "-profile:v".into(), "constrained_baseline".into(), "-b:v".into(), k.clone(), "-maxrate".into(), k, "-g".into(), g, "-bf".into(), "0".into(),
        ],
        _ => vec![
            "-c:v".into(), "libx264".into(), "-preset".into(), "veryfast".into(), "-tune".into(), "zerolatency".into(), "-profile:v".into(), "baseline".into(),
            "-b:v".into(), k.clone(), "-maxrate".into(), k.clone(), "-bufsize".into(), k, "-g".into(), g,
            "-x264-params".into(), "repeat-headers=1:sliced-threads=0".into(),
        ],
    }
}

/// placa de vídeo primeiro; x264 (processador) é o último recurso
const ORDER: &[&str] = if IS_WIN {
    &["h264_nvenc", "h264_amf", "h264_qsv", "libx264"]
} else {
    &["h264_nvenc", "h264_vaapi", "h264_qsv", "libx264"]
};

fn encoder_name(enc: &str) -> &'static str {
    match enc {
        "h264_nvenc" | "nvh264enc" => "placa de vídeo NVIDIA (NVENC)",
        "h264_vaapi" | "vah264lpenc" | "vah264enc" => "placa de vídeo (VA-API)",
        "h264_qsv" => "placa de vídeo Intel (Quick Sync)",
        "h264_amf" => "placa de vídeo AMD (AMF)",
        _ => "processador (x264)",
    }
}

const VAAPI_DEVICE: &str = "/dev/dri/renderD128";

/// pedaço extra antes da entrada e filtro de vídeo que cada codificador precisa
fn encoder_plumbing(enc: &str, scale_to: Option<(u32, u32)>) -> (Vec<String>, Option<String>) {
    let scale = scale_to.map(|(w, h)| format!("{w}:{h}"));
    match enc {
        // reduz o tamanho DENTRO da placa (scale_cuda), sem gastar processador
        "h264_nvenc" => (vec![], scale.map(|s| format!("hwupload_cuda,scale_cuda={s}"))),
        "h264_vaapi" => (
            sv(&["-vaapi_device", VAAPI_DEVICE]),
            Some(format!("format=nv12,hwupload{}", scale.map(|s| format!(",scale_vaapi={s}")).unwrap_or_default())),
        ),
        "h264_qsv" => (vec![], Some(format!("{}format=nv12", scale.map(|s| format!("scale={s}:flags=fast_bilinear,")).unwrap_or_default()))),
        // x264: a captura chega em BGR0 e o x264 escolheria 4:4:4, que o perfil baseline não aceita
        // ("baseline profile doesn't support 4:4:4") — força 4:2:0. (O electron/screencast.js tem o
        // mesmo problema no X11 sem placa de vídeo.)
        _ => (vec![], Some(format!("{}format=yuv420p", scale.map(|s| format!("scale={s}:flags=fast_bilinear,")).unwrap_or_default()))),
    }
}

// ---------------------------------------------------------------- Wayland: GStreamer

/// cadeia de cada codificador do GStreamer, do quadro cru (BGRx) até H.264
fn gst_encoder(enc: &str, kbps: u32, gop: u32, scale: Option<(u32, u32)>) -> Vec<String> {
    let mut v: Vec<String> = Vec::new();
    match enc {
        "nvh264enc" => {
            match scale {
                Some((w, h)) => v.extend(sv(&["glupload", "!", "glcolorconvert", "!", "glcolorscale", "!"]).into_iter().chain([format!("video/x-raw(memory:GLMemory),width={w},height={h}")])),
                None => v.push("cudaupload".into()),
            }
            v.extend(sv(&["!", "nvh264enc", "preset=p4", "tune=ultra-low-latency", "rc-mode=cbr"]));
            v.extend([format!("bitrate={kbps}"), format!("gop-size={gop}")]);
            v.extend(sv(&["bframes=0", "zerolatency=true", "repeat-sequence-header=true"]));
        }
        "vah264lpenc" | "vah264enc" => {
            let size = scale.map(|(w, h)| format!(",width={w},height={h}")).unwrap_or_default();
            v.extend(sv(&["vapostproc", "!"]));
            v.push(format!("video/x-raw(memory:VAMemory),format=NV12{size}"));
            v.extend(sv(&["!", enc, "rate-control=cbr"]));
            v.extend([format!("bitrate={kbps}"), format!("key-int-max={gop}")]);
            v.extend(sv(&["b-frames=0", "target-usage=7"]));
        }
        _ => {
            // x264 só aceita tamanho par: sempre reescala pra um tamanho fixo (bordas pretas se a proporção mudar)
            let (w, h) = scale.unwrap_or((1280, 720));
            v.extend(sv(&["videoconvert", "!", "videoscale", "add-borders=true", "!"]));
            v.push(format!("video/x-raw,format=I420,width={w},height={h},pixel-aspect-ratio=1/1"));
            v.extend(sv(&["!", "x264enc", "tune=zerolatency", "speed-preset=veryfast"]));
            v.extend([format!("bitrate={kbps}"), format!("key-int-max={gop}")]);
            v.push("bframes=0".into());
        }
    }
    v
}

const GST_ORDER: &[&str] = &["nvh264enc", "vah264lpenc", "vah264enc", "x264enc"];

/// saída comum: H.264 Annex-B com SPS/PPS antes de cada quadro-chave, no stdout pro auxiliar
fn gst_tail(with_sink: bool) -> Vec<String> {
    let mut v = sv(&["!", "video/x-h264,profile=constrained-baseline,stream-format=byte-stream", "!", "h264parse", "config-interval=-1"]);
    if with_sink {
        v.extend(sv(&["!", "fdsink", "fd=1", "sync=false"]));
    }
    v
}

// ---------------------------------------------------------------- detecção

#[derive(Clone, Default, Debug)]
pub struct ProbeInfo {
    pub available: bool,
    pub reason: Option<String>,
    pub downloading: bool,
    pub portal: bool,
    pub ffmpeg: Option<String>,
    pub gst: Option<String>,
    pub encoder: String,
    pub hardware: bool,
    pub can_scale: bool,
}

fn unavailable(reason: &str) -> ProbeInfo {
    ProbeInfo { available: false, reason: Some(reason.into()), ..Default::default() }
}

async fn probe_wayland() -> ProbeInfo {
    if !run("gst-inspect-1.0", &sv(&["pipewiresrc"]), 15_000).await.ok {
        return unavailable("falta o GStreamer com o plugin do PipeWire (gstreamer1.0-pipewire)");
    }
    let test_src = sv(&["-q", "videotestsrc", "num-buffers=15", "!", "video/x-raw,format=BGRx,width=640,height=360,framerate=30/1", "!"]);
    for enc in GST_ORDER {
        let scale = (*enc == "x264enc").then_some((640, 360));
        let mut args = test_src.clone();
        args.extend(gst_encoder(enc, 2000, 30, scale));
        args.extend(gst_tail(false));
        args.extend(sv(&["!", "fakesink"]));
        let r = run("gst-launch-1.0", &args, 20_000).await;
        if !r.ok {
            log::info(&format!("[gstreamer] {enc} indisponível: {}", last_line(if r.stderr.trim().is_empty() { &r.stdout } else { &r.stderr })));
            continue;
        }
        // reduzir o tamanho na NVIDIA passa pelo OpenGL — testa à parte; se falhar, vai no tamanho original
        let mut can_scale = true;
        if *enc == "nvh264enc" {
            let mut a = test_src.clone();
            a.extend(gst_encoder(enc, 2000, 30, Some((320, 180))));
            a.extend(sv(&["!", "fakesink"]));
            can_scale = run("gst-launch-1.0", &a, 20_000).await.ok;
            if !can_scale {
                log::info("[gstreamer] redução de tamanho pelo OpenGL indisponível — vai no tamanho da tela");
            }
        }
        log::info(&format!("compartilhamento nativo (Wayland): {enc} pelo GStreamer"));
        return ProbeInfo {
            available: true,
            portal: true,
            gst: Some("gst-launch-1.0".into()),
            encoder: enc.to_string(),
            hardware: *enc != "x264enc",
            can_scale,
            ..Default::default()
        };
    }
    unavailable("nenhum codificador H.264 funcionou no GStreamer")
}

/// testa de verdade quais codificadores um ffmpeg consegue usar (codificando alguns quadros) —
/// "estar na lista" não garante que a placa/driver aceita
async fn best_encoder_of(ffmpeg: &str) -> Option<&'static str> {
    if !run(ffmpeg, &sv(&["-hide_banner", "-version"]), 15_000).await.ok {
        return None;
    }
    for enc in ORDER {
        let (pre, filter) = encoder_plumbing(enc, None);
        let mut args = sv(&["-hide_banner", "-loglevel", "error"]);
        args.extend(pre);
        args.extend(sv(&["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30", "-frames:v", "15"]));
        if let Some(f) = filter {
            args.extend(["-vf".into(), f]);
        }
        args.extend(encoder_args(enc, 2000, 60));
        args.extend(sv(&["-f", "null", "-"]));
        let r = run(ffmpeg, &args, 20_000).await;
        if r.ok {
            return Some(enc);
        }
        log::info(&format!("[{ffmpeg}] {enc} indisponível: {}", last_line(&r.stderr)));
    }
    None
}

async fn probe_uncached(app: &AppHandle) -> ProbeInfo {
    if !IS_LINUX && !IS_WIN {
        return unavailable("só Linux e Windows por enquanto");
    }
    if native_bin(app, "didiscord-screencast").is_none() {
        return unavailable("auxiliar de compartilhamento não encontrado");
    }
    if is_wayland() {
        return probe_wayland().await;
    }
    if IS_LINUX && std::env::var_os("DISPLAY").is_none() {
        return unavailable("sem DISPLAY do X11");
    }
    let st = app.state::<AppState>();
    let mut candidates: Vec<String> = Vec::new();
    if let Ok(p) = std::env::var("FFMPEG_PATH") {
        candidates.push(p);
    }
    candidates.push(if IS_WIN { "ffmpeg.exe".into() } else { "ffmpeg".into() });
    let managed = st.deps.managed_ffmpeg();
    if let Some(m) = &managed {
        candidates.push(m.to_string_lossy().into_owned());
    }

    let mut fallback: Option<ProbeInfo> = None;
    for ffmpeg in candidates {
        let Some(enc) = best_encoder_of(&ffmpeg).await else { continue };
        let info = ProbeInfo { available: true, ffmpeg: Some(ffmpeg.clone()), encoder: enc.into(), hardware: enc != "libx264", ..Default::default() };
        if info.hardware {
            log::info(&format!("compartilhamento nativo: {enc} ({ffmpeg})"));
            return info;
        }
        fallback.get_or_insert(info);
    }

    // nenhum com placa de vídeo: o ffmpeg do app (baixado) pode ter o que falta — baixa em segundo
    // plano e detecta de novo depois
    if managed.is_none() {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let st = handle.state::<AppState>();
            if st.deps.ensure_ffmpeg(&st.http).await.is_some() {
                *st.screencast.probe_cache.lock().await = None;
            }
        });
        if fallback.is_none() {
            return ProbeInfo { downloading: true, ..unavailable("baixando o componente de compartilhamento pela placa de vídeo") };
        }
    }
    match fallback {
        Some(f) => {
            log::info(&format!("compartilhamento nativo: {} no processador ({})", f.encoder, f.ffmpeg.as_deref().unwrap_or("?")));
            f
        }
        None => unavailable("nenhum codificador H.264 funcionou no ffmpeg"),
    }
}

/// melhor ffmpeg/GStreamer + codificador disponível (detecta uma vez por sessão)
pub async fn probe(app: &AppHandle) -> ProbeInfo {
    let st = app.state::<AppState>();
    let mut cache = st.screencast.probe_cache.lock().await;
    if let Some(info) = cache.as_ref() {
        return info.clone();
    }
    let info = probe_uncached(app).await;
    // "baixando" não fica guardado: assim que terminar, a próxima chamada detecta de novo
    if !info.downloading {
        *cache = Some(info.clone());
    }
    info
}

// ---------------------------------------------------------------- argumentos de captura

const MAX_KBPS: u32 = 16_000; // teto: 16 Mbps

/// o suficiente pra resolução/fps escolhidos sem desperdiçar internet (cada pessoa recebe uma cópia)
fn auto_bitrate_kbps(w: u32, h: u32, fps: u32) -> u32 {
    let px = w as f64 * h as f64 * fps as f64;
    ((px / 1920.0 / 1080.0 / 60.0 * 8000.0).round() as u32).clamp(2500, MAX_KBPS)
}

fn even_down(n: f64) -> u32 {
    ((n / 2.0).floor() as u32 * 2).max(2)
}

/// tamanho final: cabe dentro do pedido, mantém a proporção, sempre par (o codificador exige)
fn fit_inside(w: u32, h: u32, max_w: Option<u32>, max_h: Option<u32>) -> Option<(u32, u32)> {
    let (mw, mh) = (max_w.filter(|v| *v > 0)?, max_h.filter(|v| *v > 0)?);
    if w <= mw && h <= mh {
        return None;
    }
    let k = (mw as f64 / w as f64).min(mh as f64 / h as f64);
    Some((even_down(w as f64 * k), even_down(h as f64 * k)))
}

#[derive(Deserialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShareOpts {
    pub fps: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub bitrate_kbps: Option<f64>,
    #[serde(default)]
    pub ice_servers: Vec<Value>,
    #[serde(default)]
    pub audio_requested: bool,
}

fn fps_of(o: &ShareOpts) -> u32 {
    o.fps.filter(|f| f.is_finite() && *f > 0.0).map(|f| f as u32).unwrap_or(30).clamp(5, 120)
}

fn kbps_of(o: &ShareOpts, w: u32, h: u32, fps: u32) -> u32 {
    match o.bitrate_kbps.filter(|k| k.is_finite() && *k > 0.0) {
        Some(k) => (k as u32).min(MAX_KBPS),
        None => auto_bitrate_kbps(w, h, fps),
    }
}

struct Built {
    args: Vec<String>,
    kbps: u32,
    size: (u32, u32),
}

fn build_ffmpeg_args(info: &ProbeInfo, src: &Source, o: &ShareOpts) -> Built {
    let fps = fps_of(o);
    let f = fps.to_string();
    // (entrada, tamanho conhecido?, vem da placa (Windows ddagrab)?)
    let (input, size, d3d11): (Vec<String>, Option<(u32, u32)>, bool) = if IS_LINUX {
        let display = std::env::var("DISPLAY").unwrap_or_else(|_| ":0".into());
        match src.kind {
            Kind::Window => (
                vec!["-f".into(), "x11grab".into(), "-framerate".into(), f, "-draw_mouse".into(), "1".into(), "-window_id".into(), src.window_id.to_string(), "-i".into(), display],
                None,
                false,
            ),
            Kind::Screen => {
                let (w, h) = (even_down(src.width as f64), even_down(src.height as f64));
                (
                    vec![
                        "-f".into(), "x11grab".into(), "-framerate".into(), f, "-video_size".into(), format!("{w}x{h}"), "-draw_mouse".into(), "1".into(),
                        "-i".into(), format!("{display}+{},{}", src.x, src.y),
                    ],
                    Some((w, h)),
                    false,
                )
            }
        }
    } else {
        // Windows: tela pela Desktop Duplication (na placa), janela pelo gdigrab (título)
        match src.kind {
            Kind::Window => (
                vec!["-f".into(), "gdigrab".into(), "-framerate".into(), f, "-draw_mouse".into(), "1".into(), "-i".into(), format!("title={}", src.name)],
                None,
                false,
            ),
            Kind::Screen => (
                vec!["-f".into(), "lavfi".into(), "-i".into(), format!("ddagrab=output_idx={}:framerate={fps}:draw_mouse=1", src.index)],
                Some((src.width, src.height)),
                true,
            ),
        }
    };
    let target = size.and_then(|(w, h)| fit_inside(w, h, o.width, o.height));
    let final_size = target.or(size).unwrap_or((o.width.unwrap_or(1920), o.height.unwrap_or(1080)));
    let kbps = kbps_of(o, final_size.0, final_size.1, fps);
    let (pre, plumb_filter) = encoder_plumbing(&info.encoder, target);

    let mut filters: Vec<String> = Vec::new();
    if d3d11 {
        filters.extend(sv(&["hwdownload", "format=bgra"])); // traz da placa pra todos os codificadores aceitarem
    }
    if size.is_none() {
        filters.push("crop=trunc(iw/2)*2:trunc(ih/2)*2".into()); // janela: corta 1px se for ímpar
    }
    if let Some(p) = plumb_filter {
        filters.push(p);
    }

    let mut args = sv(&["-hide_banner", "-loglevel", "error"]);
    args.extend(pre);
    args.extend(input);
    if !filters.is_empty() {
        args.extend(["-vf".into(), filters.join(",")]);
    }
    args.extend(encoder_args(&info.encoder, kbps, fps)); // quadro-chave a cada 1s
    // repete SPS/PPS antes de cada quadro-chave: quem entra no meio consegue começar
    args.extend(sv(&["-bsf:v", "dump_extra", "-f", "h264", "pipe:1"]));
    Built { args, kbps, size: final_size }
}

fn build_gst_args(info: &ProbeInfo, picked: &Value, o: &ShareOpts) -> Built {
    let fps = fps_of(o);
    let is_window = picked["sourceType"].as_u64() == Some(2);
    let w = picked["width"].as_u64().map(|v| v as u32).filter(|v| *v > 0).or(o.width).unwrap_or(1920);
    let h = picked["height"].as_u64().map(|v| v as u32).filter(|v| *v > 0).or(o.height).unwrap_or(1080);
    // janela: mantém o tamanho dela (pode mudar no meio); tela: cabe no pedido
    let mut scale = if is_window { None } else { fit_inside(w, h, o.width, o.height) };
    if scale.is_some() && !info.can_scale {
        scale = None;
    }
    if info.encoder == "x264enc" && scale.is_none() {
        scale = Some((even_down(w as f64), even_down(h as f64)));
    }
    let size = scale.unwrap_or((w, h));
    let kbps = kbps_of(o, size.0, size.1, fps);
    let mut args = sv(&["-q", "pipewiresrc", "fd=3", "path={node}", "do-timestamp=true", "keepalive-time=500", "client-name=didiscord"]);
    // o portal só manda quadro quando a tela muda: o videorate repete o último pra manter o fps fixo
    args.extend(sv(&["!", "video/x-raw", "!", "videorate", "!"]));
    args.push(format!("video/x-raw,framerate={fps}/1"));
    args.push("!".into());
    args.extend(gst_encoder(&info.encoder, kbps, fps, scale));
    args.extend(gst_tail(true));
    Built { args, kbps, size }
}

/// "urls" sempre como lista (a Metered manda texto; o auxiliar antigo só aceitava lista)
fn normalize_ice(list: &[Value]) -> Vec<Value> {
    list.iter()
        .filter_map(|srv| {
            let mut srv = srv.as_object()?.clone();
            let urls = match srv.get("urls") {
                Some(Value::Array(a)) => a.clone(),
                Some(Value::String(s)) if !s.is_empty() => vec![Value::String(s.clone())],
                _ => return None,
            };
            srv.insert("urls".into(), Value::Array(urls));
            Some(Value::Object(srv))
        })
        .collect()
}

// ---------------------------------------------------------------- sessão (um compartilhamento)

struct Session {
    id: u64,
    tx: mpsc::UnboundedSender<String>,
    kill: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct Screencast {
    session: Mutex<Option<Session>>,
    next_id: AtomicU64,
    pub probe_cache: AsyncMutex<Option<ProbeInfo>>,
}

impl Screencast {
    fn send(&self, msg: &Value) {
        if let Some(s) = self.session.lock().unwrap().as_ref() {
            let _ = s.tx.send(msg.to_string());
        }
    }

    fn is_current(&self, id: u64) -> bool {
        self.session.lock().unwrap().as_ref().map(|s| s.id) == Some(id)
    }

    pub fn stop(&self) {
        let Some(mut s) = self.session.lock().unwrap().take() else { return };
        let _ = s.tx.send(json!({ "cmd": "stop" }).to_string());
        if let Some(kill) = s.kill.take() {
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(1500)).await;
                let _ = kill.send(());
            });
        }
    }
}

/// Sobe o auxiliar. Devolve (id da sessão, eventos) depois do {"ev":"ready"}.
async fn spawn_helper(app: &AppHandle) -> Result<(u64, broadcast::Receiver<Value>), String> {
    let st = app.state::<AppState>();
    st.screencast.stop();
    let helper = native_bin(app, "didiscord-screencast").ok_or("auxiliar de compartilhamento não encontrado")?;
    let mut cmd = child_command(&helper);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("o auxiliar de compartilhamento não iniciou: {e}"))?;
    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let id = st.screencast.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let (kill_tx, kill_rx) = oneshot::channel::<()>();
    let (ev_tx, ev_rx) = broadcast::channel::<Value>(256);
    *st.screencast.session.lock().unwrap() = Some(Session { id, tx, kill: Some(kill_tx) });

    // stdin: uma linha JSON por comando
    tauri::async_runtime::spawn(async move {
        while let Some(line) = rx.recv().await {
            if stdin.write_all(format!("{line}\n").as_bytes()).await.is_err() {
                break;
            }
            let _ = stdin.flush().await;
        }
    });

    // stderr: só log
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let t = line.trim();
            if !t.is_empty() && !t.contains("non monotonically increasing dts") && !t.contains("Last message repeated") {
                log::info(&format!("[screencast] {t}"));
            }
        }
    });

    // stdout: eventos -> quem estiver esperando (start) e o site
    let handle = app.clone();
    let ev_tx2 = ev_tx.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        let mut ended = false;
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(ev) = serde_json::from_str::<Value>(&line) else { continue };
            if ev["ev"] == "ended" {
                ended = true;
            }
            let _ = ev_tx2.send(ev.clone());
            if handle.state::<AppState>().screencast.is_current(id) && ev["ev"] != "ready" {
                app::emit_to_main(&handle, "screencast:event", &ev);
            }
        }
        // o auxiliar fechou
        let _ = ev_tx2.send(json!({ "ev": "__exit" }));
        let st = handle.state::<AppState>();
        if st.screencast.is_current(id) {
            if !ended {
                app::emit_to_main(&handle, "screencast:event", &json!({ "ev": "ended", "reason": "o auxiliar fechou" }));
            }
            *st.screencast.session.lock().unwrap() = None;
            st.audio.stop();
        }
    });

    // vida do processo: espera sair, ou mata se pedirem
    tauri::async_runtime::spawn(async move {
        tokio::select! {
            _ = child.wait() => {}
            _ = kill_rx => { let _ = child.kill().await; }
        }
    });

    let mut ready_rx = ev_tx.subscribe();
    drop(ev_tx);
    let ready = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            match ready_rx.recv().await {
                Ok(ev) if ev["ev"] == "ready" => return true,
                Ok(ev) if ev["ev"] == "__exit" => return false,
                Err(broadcast::error::RecvError::Closed) => return false,
                _ => {}
            }
        }
    })
    .await
    .unwrap_or(false);
    if !ready {
        st.screencast.stop();
        return Err("o auxiliar de compartilhamento não iniciou".into());
    }
    Ok((id, ev_rx))
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    encoder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    encoder_name: Option<String>,
    hardware: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_type: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_name: Option<String>,
}

fn fail(reason: impl Into<String>) -> StartResult {
    StartResult { ok: false, reason: Some(reason.into()), ..Default::default() }
}

fn cancelled() -> StartResult {
    StartResult { ok: false, cancelled: Some(true), ..Default::default() }
}

// ---------------------------------------------------------------- comandos do site

/// dá pra usar? (e, se estiver baixando o componente, quanto falta)
#[tauri::command]
pub async fn screencast_available(app: AppHandle, webview: Webview) -> Value {
    if app::require_site(&app, &webview).is_err() {
        return json!({ "available": false, "reason": "origem não permitida" });
    }
    let info = probe(&app).await;
    let st = app.state::<AppState>();
    json!({
        "available": info.available,
        "encoderName": info.available.then(|| encoder_name(&info.encoder)),
        "hardware": info.hardware,
        "reason": info.reason,
        "sfu": true, // este app sabe mandar a tela pelo servidor de mídia (comando "publish")
        "deps": st.deps.status(),
    })
}

/// abre o seletor e começa a transmitir. Os eventos do auxiliar chegam no site por "screencast:event".
#[tauri::command]
pub async fn screencast_start(app: AppHandle, webview: Webview, opts: ShareOpts) -> StartResult {
    if app::require_site(&app, &webview).is_err() {
        return fail("origem não permitida");
    }
    let st = app.state::<AppState>();
    let info = probe(&app).await;
    if !info.available {
        return fail(info.reason.unwrap_or_else(|| "indisponível".into()));
    }
    let ice = normalize_ice(&opts.ice_servers);

    if info.portal {
        // Wayland: o sistema não diz de qual app é a janela escolhida, então o som é escolhido antes,
        // no nosso seletor; a tela/janela vem depois, pelo seletor do sistema (aberto pelo auxiliar)
        let mut choice = AudioChoice { mode: "none".into(), app_key: None };
        if opts.audio_requested {
            match picker::pick(&app, "audio").await {
                Some(Picked::Audio(c)) => choice = c,
                _ => return cancelled(),
            }
        }
        st.audio.prepare(audio::Target::Choice(choice)).await;

        let (id, mut events) = match spawn_helper(&app).await {
            Ok(v) => v,
            Err(e) => {
                st.audio.stop();
                return fail(e);
            }
        };
        st.screencast.send(&json!({ "cmd": "portal", "sourceTypes": 3, "cursor": true }));
        let picked = loop {
            match events.recv().await {
                Ok(ev) if matches!(ev["ev"].as_str(), Some("source" | "cancelled" | "ended" | "error" | "__exit")) => break ev,
                Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) => {}
                Err(_) => break json!({ "ev": "__exit" }),
            }
        };
        if picked["ev"] == "cancelled" {
            st.screencast.stop();
            st.audio.stop();
            return cancelled();
        }
        if picked["ev"] != "source" || !st.screencast.is_current(id) {
            st.screencast.stop();
            st.audio.stop();
            let why = picked["message"].as_str().or(picked["reason"].as_str()).unwrap_or("o seletor de tela falhou");
            return fail(why);
        }
        let built = build_gst_args(&info, &picked, &opts);
        log::info(&format!(
            "compartilhamento nativo (Wayland): {}x{} · {} fps · {} kbps · {}",
            built.size.0, built.size.1, fps_of(&opts), built.kbps, info.encoder
        ));
        st.screencast.send(&json!({ "cmd": "start", "bin": info.gst, "portal": true, "args": built.args, "iceServers": ice }));
        let source_type = picked["sourceType"].as_u64();
        return StartResult {
            ok: true,
            encoder: Some(info.encoder.clone()),
            encoder_name: Some(encoder_name(&info.encoder).into()),
            hardware: info.hardware,
            width: Some(built.size.0),
            height: Some(built.size.1),
            kbps: Some(built.kbps),
            source_type,
            source_name: Some(if source_type == Some(2) { "Janela".into() } else { "Tela".into() }),
            ..Default::default()
        };
    }

    // X11 / Windows: o nosso seletor com miniaturas
    let source = match picker::pick(&app, "sources").await {
        Some(Picked::Source(s)) => s,
        _ => return cancelled(),
    };
    if opts.audio_requested {
        st.audio.prepare(audio::Target::Source(source.clone())).await;
    } else {
        st.audio.stop();
    }
    let built = build_ffmpeg_args(&info, &source, &opts);
    log::info(&format!(
        "compartilhamento nativo: {} · {}x{} · {} fps · {} kbps · {}",
        source.name, built.size.0, built.size.1, fps_of(&opts), built.kbps, info.encoder
    ));
    if let Err(e) = spawn_helper(&app).await {
        st.audio.stop();
        return fail(e);
    }
    st.screencast.send(&json!({ "cmd": "start", "ffmpeg": info.ffmpeg, "args": built.args, "iceServers": ice }));
    StartResult {
        ok: true,
        encoder: Some(info.encoder.clone()),
        encoder_name: Some(encoder_name(&info.encoder).into()),
        hardware: info.hardware,
        width: Some(built.size.0),
        height: Some(built.size.1),
        kbps: Some(built.kbps),
        source_name: Some(source.name.clone()),
        ..Default::default()
    }
}

/// sinalização de cada pessoa assistindo (o site repassa pelo servidor), ou publicar no servidor de mídia
#[tauri::command]
pub fn screencast_command(app: AppHandle, webview: Webview, msg: Value) {
    if app::require_site(&app, &webview).is_err() || !msg.is_object() {
        return;
    }
    let st = app.state::<AppState>();
    let cmd = msg["cmd"].as_str().unwrap_or("");
    let dim = |v: &Value| v.as_f64().filter(|f| f.is_finite()).map(|f| f.max(0.0).floor() as u64).unwrap_or(0);
    match cmd {
        // o site manda só o caminho e o ingresso; o endereço é sempre o do servidor em que o app está
        // conectado (um site não consegue apontar o auxiliar pra outro lugar)
        "publish" => {
            let path = msg["path"].as_str().unwrap_or("");
            let path_ok = path.starts_with('/') && path.len() <= 65 && path[1..].chars().all(|c| c.is_ascii_alphanumeric() || "/_-".contains(c));
            let token = msg["token"].as_str().unwrap_or("");
            if !path_ok || token.is_empty() || token.len() > 4096 {
                return;
            }
            let site = st.site();
            let ws = if let Some(rest) = site.strip_prefix("https") { format!("wss{rest}") } else { site.replacen("http", "ws", 1) };
            st.screencast.send(&json!({
                "cmd": "publish", "url": format!("{ws}{path}"), "token": token,
                "width": dim(&msg["width"]), "height": dim(&msg["height"]),
            }));
        }
        "unpublish" => st.screencast.send(&json!({ "cmd": "unpublish" })),
        "add" | "answer" | "candidate" | "remove" => {
            let viewer = match &msg["viewer"] {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                _ => String::new(),
            };
            let mut out = json!({ "cmd": cmd, "viewer": viewer });
            if !msg["sdp"].is_null() {
                out["sdp"] = msg["sdp"].clone();
            }
            if !msg["candidate"].is_null() {
                out["candidate"] = msg["candidate"].clone();
            }
            if let Value::Array(list) = &msg["iceServers"] {
                out["iceServers"] = Value::Array(normalize_ice(list));
            }
            st.screencast.send(&out);
        }
        _ => {}
    }
}

#[tauri::command]
pub fn screencast_stop(app: AppHandle, webview: Webview) {
    if app::require_site(&app, &webview).is_ok() {
        app.state::<AppState>().screencast.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tamanhos() {
        assert_eq!(fit_inside(2560, 1440, Some(1920), Some(1080)), Some((1920, 1080)));
        assert_eq!(fit_inside(1920, 1080, Some(1920), Some(1080)), None);
        assert_eq!(fit_inside(1921, 1081, Some(1280), Some(720)), Some((1278, 720)));
        assert_eq!(auto_bitrate_kbps(1920, 1080, 60), 8000);
        assert_eq!(auto_bitrate_kbps(640, 360, 30), 2500);
    }

    #[test]
    fn ice_vira_lista() {
        let v = normalize_ice(&[json!({ "urls": "turn:x", "username": "a" }), json!({ "urls": [] }), json!(1)]);
        assert_eq!(v[0]["urls"], json!(["turn:x"]));
        assert_eq!(v.len(), 2);
    }
}
