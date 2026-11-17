//! Áudio do compartilhamento de tela no Linux (PipeWire / pipewire-pulse). Porte do electron/audio/linux.js.
//!
//! Abrimos um `pw-record` que NÃO se conecta a nada sozinho (node.autoconnect = false) e ligamos
//! (pw-link) as saídas dos apps certos nas entradas dele. Ligar uma saída a mais não desvia o som:
//! o app continua tocando normal, a captura é só uma cópia.
//!
//!   janela escolhida -> só os streams do processo dessa janela (e dos filhos dele)
//!   tela inteira     -> todos os streams MENOS os marcados no seletor ("não levar o som de"): o
//!                       próprio dusky por padrão (senão a voz da call voltaria em eco) e os apps
//!                       que a pessoa escolher (pelo executável, igual à lista do seletor)
//!
//! Streams novos (app que abriu depois) são ligados por uma verificação a cada ~0,8 s.

use super::{AudioApp, AudioApps, Running, Target};
use crate::screencast::child_command;
use crate::server::log;
use crate::sources::Kind;
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::io::AsyncReadExt;
use tokio::sync::OnceCell;

const POLL_MS: u64 = 800;

/// quais streams entram
pub enum Plan {
    /// tudo menos: o dusky (e os processos filhos dele, onde roda a página) se `own`, e os apps
    /// dessas chaves (app_key_of)
    AllBut { raw: bool, own: bool, apps: Vec<String> },
    /// só a árvore de processos de quem é dono da janela
    PidTree { pid: u32, raw: bool },
    /// só os streams desse app (Wayland: escolhido pelo nome do executável)
    AppKey { key: String, raw: bool },
}

impl Plan {
    fn raw(&self) -> bool {
        match self {
            Plan::AllBut { raw, .. } | Plan::PidTree { raw, .. } | Plan::AppKey { raw, .. } => *raw,
        }
    }

    fn accepts(&self, stream_pid: Option<u32>, props: &Value, own: u32) -> bool {
        let mine = stream_pid.map(|p| is_in_tree(p, own)).unwrap_or(false);
        match self {
            Plan::AllBut { own, apps, .. } => {
                !(*own && mine) && (apps.is_empty() || !apps.iter().any(|k| *k == app_key_of(props)))
            }
            Plan::PidTree { pid, .. } => stream_pid.map(|p| is_in_tree(p, *pid)).unwrap_or(false),
            Plan::AppKey { key, .. } => !mine && app_key_of(props) == *key,
        }
    }
}

// ---------- árvore de processos (via /proc) ----------

fn parent_pid(pid: u32) -> u32 {
    let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else { return 0 };
    // o nome do processo vem entre parênteses e pode ter espaços — corta depois do último ')'
    let Some(i) = stat.rfind(')') else { return 0 };
    stat[i + 1..].split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0)
}

fn is_in_tree(pid: u32, root: u32) -> bool {
    let mut cur = pid;
    for _ in 0..64 {
        if cur == root {
            return true;
        }
        if cur <= 1 {
            break;
        }
        cur = parent_pid(cur);
    }
    cur == root
}

// ---------- PipeWire ----------

async fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let mut c = child_command(cmd);
    c.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if std::env::var_os("XDG_RUNTIME_DIR").is_none() {
        // SAFETY: getuid não tem efeito colateral
        c.env("XDG_RUNTIME_DIR", format!("/run/user/{}", unsafe { libc_getuid() }));
    }
    let out = tokio::time::timeout(Duration::from_secs(6), c.output()).await.ok()?.ok()?;
    // --help pode sair com código != 0 em algumas versões, mas o texto vem mesmo assim
    let mut s = String::from_utf8_lossy(&out.stdout).into_owned();
    if !out.status.success() {
        if args.first() == Some(&"--help") {
            s.push_str(&String::from_utf8_lossy(&out.stderr));
            return Some(s);
        }
        return None;
    }
    Some(s)
}

extern "C" {
    #[link_name = "getuid"]
    fn libc_getuid() -> u32;
}

async fn has_pipewire() -> bool {
    run("pw-record", &["--version"]).await.is_some() && run("pw-link", &["--version"]).await.is_some()
}

/// pw-record antigo não tem --raw: aí ele manda no formato AU (cabeçalho + amostras big-endian)
async fn pw_record_has_raw() -> bool {
    static RAW: OnceCell<bool> = OnceCell::const_new();
    *RAW.get_or_init(|| async { run("pw-record", &["--help"]).await.map(|s| s.contains("--raw")).unwrap_or(false) }).await
}

async fn pw_dump() -> Option<Vec<Value>> {
    let text = run("pw-dump", &[]).await?;
    serde_json::from_str::<Vec<Value>>(&text).ok()
}

fn props(o: &Value) -> &Value {
    &o["info"]["props"]
}

fn num(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

/// "identidade" de um app no PipeWire: o executável (estável entre os vários streams do mesmo app)
fn app_key_of(p: &Value) -> String {
    p["application.process.binary"].as_str().or(p["application.name"].as_str()).unwrap_or("").trim().to_string()
}

fn is_output_stream(o: &Value) -> bool {
    o["type"] == "PipeWire:Interface:Node" && props(o)["media.class"] == "Stream/Output/Audio"
}

struct Port {
    id: u64,
    channel: String,
}

fn ports_of(dump: &[Value], node_id: u64, direction: &str) -> Vec<Port> {
    let mut v: Vec<Port> = dump
        .iter()
        .filter(|o| o["type"] == "PipeWire:Interface:Port" && o["info"]["direction"] == direction && num(&props(o)["node.id"]) == Some(node_id))
        .filter_map(|o| Some(Port { id: num(&o["id"])?, channel: props(o)["audio.channel"].as_str().unwrap_or("").to_string() }))
        .collect();
    v.sort_by_key(|p| p.id);
    v
}

/// apps tocando áudio agora (menos o próprio dusky) — pro seletor do Wayland
pub async fn list_audio_apps(_app: &AppHandle) -> AudioApps {
    if !has_pipewire().await {
        return AudioApps { available: false, apps: Vec::new() };
    }
    let own = std::process::id();
    let mut apps: Vec<AudioApp> = Vec::new();
    for o in pw_dump().await.unwrap_or_default().iter().filter(|o| is_output_stream(o)) {
        let p = props(o);
        if num(&p["application.process.id"]).map(|pid| is_in_tree(pid as u32, own)).unwrap_or(false) {
            continue;
        }
        let key = app_key_of(p);
        if key.is_empty() || apps.iter().any(|a| a.key == key) {
            continue;
        }
        apps.push(AudioApp { name: p["application.name"].as_str().unwrap_or(&key).to_string(), key });
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    AudioApps { available: true, apps }
}

// ---------- API do módulo ----------

pub async fn prepare(target: Target, _app: &AppHandle) -> Option<Plan> {
    if !has_pipewire().await {
        log::info("pw-record/pw-link não encontrados — compartilhando sem áudio");
        return None;
    }
    let raw = pw_record_has_raw().await;
    let all_but = |ex: crate::picker::AudioExclude| {
        if !ex.own || !ex.apps.is_empty() {
            log::info(&format!(
                "áudio da tela: sem {}{}",
                if ex.own { "o dusky" } else { "tirar o dusky (vai ter eco da call)" },
                if ex.apps.is_empty() { String::new() } else { format!(" e sem: {}", ex.apps.join(", ")) }
            ));
        }
        Plan::AllBut { raw, own: ex.own, apps: ex.apps }
    };
    match target {
        Target::Choice(c) => match c.mode.as_str() {
            "none" => None,
            "app" => c.app_key.map(|key| Plan::AppKey { key, raw }),
            _ => Some(all_but(c.exclude)),
        },
        Target::Source(src, _) if src.kind == Kind::Window => match src.pid {
            Some(pid) => Some(Plan::PidTree { pid, raw }),
            None => {
                log::info("não consegui descobrir o processo dessa janela — compartilhando sem áudio");
                None
            }
        },
        Target::Source(_, ex) => Some(all_but(ex)),
    }
}

/// Sem --raw o pw-record PODE mandar no formato AU (".snd" + cabeçalho + amostras big-endian) — lido
/// como float32 little-endian isso vira chiado. Mas nem toda versão faz isso: o pw-record 1.0.x manda
/// cru mesmo sem ter --raw. Então decide pelos 4 primeiros bytes: ".snd" = AU, qualquer outra coisa = cru.
struct AuDecoder {
    /// None = ainda não sabe; Some(false) = cru; Some(true) = AU
    is_au: Option<bool>,
    header_left: Option<u32>,
    pending: Vec<u8>,
}

impl AuDecoder {
    fn new() -> Self {
        Self { is_au: None, header_left: None, pending: Vec::new() }
    }

    fn feed(&mut self, chunk: &[u8]) -> Vec<u8> {
        let mut data = std::mem::take(&mut self.pending);
        data.extend_from_slice(chunk);
        if self.is_au.is_none() {
            if data.len() < 4 {
                self.pending = data;
                return Vec::new();
            }
            self.is_au = Some(&data[..4] == b".snd");
            if self.is_au == Some(false) {
                log::info("pw-record manda PCM cru mesmo sem --raw");
            }
        }
        if self.is_au == Some(false) {
            return data;
        }
        if self.header_left.is_none() {
            if data.len() < 8 {
                self.pending = data;
                return Vec::new();
            }
            self.header_left = Some(u32::from_be_bytes([data[4], data[5], data[6], data[7]]));
        }
        let left = self.header_left.unwrap();
        let skip = (left as usize).min(data.len());
        self.header_left = Some(left - skip as u32);
        let data = &data[skip..];
        let usable = data.len() - data.len() % 4;
        self.pending = data[usable..].to_vec();
        let mut out = data[..usable].to_vec();
        for s in out.chunks_exact_mut(4) {
            s.reverse();
        }
        out
    }
}

pub fn start(plan: Plan, app: AppHandle, on_end: Box<dyn FnOnce() + Send>) -> Result<Running, String> {
    let raw = plan.raw();
    if !raw {
        log::info("pw-record sem --raw: confere se vem no formato AU e converte se precisar");
    }
    let own = std::process::id();
    let node_name = format!("dusky-share-{own}");
    let mut cmd = child_command("pw-record");
    cmd.arg("-P")
        .arg(format!("{{ node.autoconnect = false, node.name = {node_name}, node.description = dusky-share, node.dont-reconnect = true }}"));
    if raw {
        cmd.arg("--raw");
    }
    cmd.args(["--format", "f32", "--rate", "48000", "--channels", "2", "--latency", "20ms", "-"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| format!("falha ao iniciar o pw-record: {e}"))?;
    let mut stdout = child.stdout.take().unwrap();

    let stopped = Arc::new(AtomicBool::new(false));
    let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();

    // PCM -> site
    let s1 = stopped.clone();
    let app1 = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut buf = vec![0u8; 16 * 1024];
        let mut au = (!raw).then(AuDecoder::new);
        loop {
            match stdout.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if s1.load(Ordering::SeqCst) {
                        break;
                    }
                    match au.as_mut() {
                        Some(d) => super::send_pcm(&app1, &d.feed(&buf[..n])),
                        None => super::send_pcm(&app1, &buf[..n]),
                    }
                }
            }
        }
    });

    // vida do pw-record + laço que liga os streams certos
    let s2 = stopped.clone();
    tauri::async_runtime::spawn(async move {
        let mut kill_rx = kill_rx;
        // ligações pedidas há pouco (o pw-link ainda pode estar rodando) — não repete por uns segundos.
        // O que vale é o grafo: a cada volta confere as ligações que EXISTEM (o PipeWire reaproveita ids).
        let mut pending: HashMap<String, Instant> = HashMap::new();
        let mut tick = tokio::time::interval(Duration::from_millis(POLL_MS));
        tokio::time::sleep(Duration::from_millis(300)).await;
        loop {
            tokio::select! {
                _ = child.wait() => break,
                _ = &mut kill_rx => { let _ = child.kill().await; break; }
                _ = tick.tick() => {
                    if let Err(err) = link_streams(&plan, &node_name, own, &mut pending).await {
                        // (pw-dump às vezes falha no meio de uma mudança do grafo — tenta de novo na próxima volta)
                        log::info(&format!("verificação do PipeWire falhou: {err}"));
                    }
                }
            }
        }
        s2.store(true, Ordering::SeqCst);
        on_end();
    });

    let mut kill = Some(kill_tx);
    Ok(Running {
        stop: Box::new(move || {
            stopped.store(true, Ordering::SeqCst);
            if let Some(k) = kill.take() {
                let _ = k.send(());
            }
        }),
    })
}

async fn link_streams(plan: &Plan, node_name: &str, own: u32, pending: &mut HashMap<String, Instant>) -> Result<(), String> {
    let dump = pw_dump().await.ok_or("pw-dump falhou")?;
    let Some(capture) = dump.iter().find(|o| o["type"] == "PipeWire:Interface:Node" && props(o)["node.name"] == node_name) else {
        return Ok(()); // o pw-record ainda não registrou o node dele
    };
    let Some(capture_id) = num(&capture["id"]) else { return Ok(()) };
    let inputs = ports_of(&dump, capture_id, "input");
    if inputs.is_empty() {
        return Ok(());
    }
    let existing: std::collections::HashSet<String> = dump
        .iter()
        .filter(|o| o["type"] == "PipeWire:Interface:Link")
        .filter_map(|o| Some(format!("{}>{}", num(&o["info"]["output-port-id"])?, num(&o["info"]["input-port-id"])?)))
        .collect();
    let now = Instant::now();
    pending.retain(|k, at| now.duration_since(*at) < Duration::from_secs(3) && !existing.contains(k));

    for stream in dump.iter().filter(|o| is_output_stream(o)) {
        let stream_pid = num(&props(stream)["application.process.id"]).map(|p| p as u32);
        if !plan.accepts(stream_pid, props(stream), own) {
            continue;
        }
        let Some(stream_id) = num(&stream["id"]) else { continue };
        for out in ports_of(&dump, stream_id, "output") {
            // canal por canal (FL→FL, FR→FR); stream mono vai pros dois lados
            let mut dests: Vec<&Port> = inputs.iter().filter(|p| !p.channel.is_empty() && p.channel == out.channel).collect();
            if dests.is_empty() {
                dests = if out.channel == "MONO" || out.channel.is_empty() { inputs.iter().collect() } else { vec![&inputs[0]] };
            }
            for dest in dests {
                let key = format!("{}>{}", out.id, dest.id);
                if existing.contains(&key) || pending.contains_key(&key) {
                    continue;
                }
                pending.insert(key, now);
                let (o, d) = (out.id.to_string(), dest.id.to_string());
                let who = props(stream)["application.name"].as_str().or(props(stream)["node.name"].as_str()).unwrap_or("?").to_string();
                tauri::async_runtime::spawn(async move {
                    // link já existe ou o stream sumiu: tudo bem
                    if run("pw-link", &[&o, &d]).await.is_some() {
                        log::info(&format!("áudio da tela: ligado {who} ({o} → {d})"));
                    }
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodifica_au_em_pedacos() {
        // cabeçalho AU de 28 bytes (tamanho no byte 4) + 2 floats big-endian, chegando picado
        let mut au = vec![0x2e, 0x73, 0x6e, 0x64, 0, 0, 0, 28];
        au.extend(vec![0u8; 20]);
        au.extend(1.5f32.to_be_bytes());
        au.extend((-0.25f32).to_be_bytes());
        let mut d = AuDecoder::new();
        let mut out = Vec::new();
        for piece in au.chunks(5) {
            out.extend(d.feed(piece));
        }
        assert_eq!(out.len(), 8);
        assert_eq!(f32::from_le_bytes(out[0..4].try_into().unwrap()), 1.5);
        assert_eq!(f32::from_le_bytes(out[4..8].try_into().unwrap()), -0.25);
    }

    #[test]
    fn cru_sem_cabecalho_passa_direto() {
        let mut d = AuDecoder::new();
        let mut pcm = Vec::new();
        pcm.extend((-0.02f32).to_le_bytes());
        pcm.extend(0.5f32.to_le_bytes());
        let mut out = d.feed(&pcm[..3]);
        out.extend(d.feed(&pcm[3..]));
        assert_eq!(out, pcm);
    }

    #[test]
    fn arvore_de_processos() {
        let me = std::process::id();
        assert!(is_in_tree(me, me));
        assert!(is_in_tree(me, parent_pid(me)));
        assert!(!is_in_tree(1, me));
    }
}
