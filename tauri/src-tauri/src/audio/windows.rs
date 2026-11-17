//! Áudio do compartilhamento de tela no Windows, via dusky-audiocap.exe (WASAPI Process Loopback,
//! native/audiocap.cpp). O helper escreve PCM cru no stdout (float32 intercalado, 48 kHz,
//! estéreo) e para sozinho quando o stdin fecha.
//!
//!   janela escolhida -> --capture include <pid da janela>   (só aquele app e os filhos)
//!   tela inteira     -> --capture mix: tudo menos o que foi marcado no seletor ("não levar o som
//!                       de"). O dusky (marcado por padrão) vai como --exclude-pid + --webview-match:
//!                       o audiocap acha também os processos do WebView2 dele, que nem sempre são
//!                       filhos do app. Os outros apps vão como --exclude-exe <nome.exe>.
//!                       Só o dusky e o WebView2 dentro da árvore dele = o exclude de sempre; mais
//!                       que isso = um include por app e a mistura no audiocap.

use super::{AudioApp, AudioApps, Running, Target};
use crate::picker::AudioExclude;
use crate::screencast::{child_command, native_bin};
use crate::server::log;
use crate::sources::Kind;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::AsyncReadExt;

pub struct Plan {
    helper: PathBuf,
    args: Vec<String>,
}

/// --exclude-pid/--webview-match do próprio dusky (pra tirar do som e da lista de apps): o processo
/// do app, o do WebView2 (perguntado pro próprio WebView2) e, por garantia, os msedgewebview2.exe
/// cuja linha de comando tem a pasta de dados do dusky
async fn own_args(app: &AppHandle) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "--exclude-pid".into(),
        std::process::id().to_string(),
        // a pasta de dados do WebView2 tem o identifier do app (ex: ...\fun.sambalele.dusky\EBWebView)
        "--webview-match".into(),
        app.config().identifier.clone(),
    ];
    match crate::webview_setup::browser_pid(app).await {
        Some(pid) => {
            log::info(&format!("áudio da tela: WebView2 do dusky = processo {pid}"));
            args.extend(["--exclude-pid".into(), pid.to_string()]);
        }
        None => log::info("áudio da tela: não consegui perguntar o processo do WebView2"),
    }
    args
}

async fn mix_args(app: &AppHandle, ex: AudioExclude) -> Vec<String> {
    let mut args: Vec<String> = vec!["--capture".into(), "mix".into()];
    if ex.own {
        args.extend(own_args(app).await);
    } else {
        log::info("áudio da tela: o dusky NÃO foi tirado (vai ter eco da call)");
    }
    if !ex.apps.is_empty() {
        log::info(&format!("áudio da tela: sem {}", ex.apps.join(", ")));
    }
    for exe in ex.apps {
        args.push("--exclude-exe".into());
        args.push(exe);
    }
    args
}

pub async fn prepare(target: Target, app: &AppHandle) -> Option<Plan> {
    let Some(helper) = native_bin(app, "dusky-audiocap") else {
        log::info("dusky-audiocap.exe não encontrado — compartilhando sem áudio");
        return None;
    };
    match target {
        Target::Source(src, _) if src.kind == Kind::Window => match src.pid {
            Some(pid) => Some(Plan { helper, args: vec!["--capture".into(), "include".into(), pid.to_string()] }),
            None => {
                log::info("não consegui descobrir o processo dessa janela — compartilhando sem áudio");
                None
            }
        },
        Target::Source(_, ex) => Some(Plan { helper, args: mix_args(app, ex).await }),
        Target::Choice(c) if c.mode == "none" => None,
        Target::Choice(c) => Some(Plan { helper, args: mix_args(app, c.exclude).await }),
    }
}

pub fn start(plan: Plan, app: AppHandle, on_end: Box<dyn FnOnce() + Send>) -> Result<Running, String> {
    log::info(&format!("audiocap {}", plan.args.join(" ")));
    let mut cmd = child_command(&plan.helper);
    cmd.args(&plan.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("falha ao iniciar o audiocap: {e}"))?;
    let stdin = child.stdin.take();
    let mut stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    tauri::async_runtime::spawn(async move {
        use tokio::io::AsyncBufReadExt;
        let mut lines = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            log::info(&format!("[audiocap] {}", l.trim()));
        }
    });

    let app1 = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            match stdout.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => super::send_pcm(&app1, &buf[..n]),
            }
        }
    });

    let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();
    tauri::async_runtime::spawn(async move {
        let mut stdin = stdin;
        tokio::select! {
            _ = child.wait() => {}
            _ = kill_rx => {
                drop(stdin.take()); // fecha o stdin: o helper para sozinho
                if tokio::time::timeout(Duration::from_millis(1500), child.wait()).await.is_err() {
                    let _ = child.kill().await;
                }
            }
        }
        on_end();
    });

    let mut kill = Some(kill_tx);
    Ok(Running {
        stop: Box::new(move || {
            if let Some(k) = kill.take() {
                let _ = k.send(());
            }
        }),
    })
}

/// apps com sessão de áudio agora (menos o dusky), pelo nome do .exe — pro "não levar o som de"
pub async fn list_audio_apps(app: &AppHandle) -> AudioApps {
    let Some(helper) = native_bin(app, "dusky-audiocap") else {
        return AudioApps { available: false, apps: Vec::new() };
    };
    let mut cmd = child_command(&helper);
    cmd.arg("--list-sessions").args(own_args(app).await).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    let out = match tokio::time::timeout(Duration::from_secs(6), cmd.output()).await {
        Ok(Ok(o)) => o,
        _ => {
            log::info("não consegui listar os apps com áudio");
            return AudioApps { available: true, apps: Vec::new() };
        }
    };
    let mut apps: Vec<AudioApp> = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let exe = v["exe"].as_str().unwrap_or("").trim().to_lowercase();
        if exe.is_empty() || apps.iter().any(|a| a.key == exe) {
            continue;
        }
        let name = v["name"].as_str().map(str::trim).filter(|s| !s.is_empty()).unwrap_or(&exe).to_string();
        apps.push(AudioApp { key: exe, name });
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    AudioApps { available: true, apps }
}
