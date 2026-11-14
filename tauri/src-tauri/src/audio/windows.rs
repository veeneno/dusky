//! Áudio do compartilhamento de tela no Windows, via dusky-audiocap.exe (WASAPI Process Loopback,
//! electron/native/audiocap.cpp). O helper escreve PCM cru no stdout (float32 intercalado, 48 kHz,
//! estéreo) e para sozinho quando o stdin fecha.
//!
//!   janela escolhida -> --capture include <pid da janela>   (só aquele app e os filhos)
//!   tela inteira     -> --capture exclude <pid do dusky> (tudo menos o dusky — o WebView2
//!                       roda como processo filho do app, então a voz da call fica de fora)

use super::{AudioApps, Running, Target};
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
    mode: &'static str,
    target: u32,
}

pub async fn prepare(target: Target, app: &AppHandle) -> Option<Plan> {
    let Some(helper) = native_bin(app, "dusky-audiocap") else {
        log::info("dusky-audiocap.exe não encontrado — compartilhando sem áudio");
        return None;
    };
    match target {
        Target::Source(src) if src.kind == Kind::Window => match src.pid {
            Some(pid) => Some(Plan { helper, mode: "include", target: pid }),
            None => {
                log::info("não consegui descobrir o processo dessa janela — compartilhando sem áudio");
                None
            }
        },
        Target::Choice(c) if c.mode == "none" => None,
        _ => Some(Plan { helper, mode: "exclude", target: std::process::id() }),
    }
}

pub fn start(plan: Plan, app: AppHandle, on_end: Box<dyn FnOnce() + Send>) -> Result<Running, String> {
    let mut cmd = child_command(&plan.helper);
    cmd.args(["--capture", plan.mode, &plan.target.to_string()])
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

/// a lista de apps só é usada no seletor do Wayland
pub async fn list_audio_apps() -> AudioApps {
    AudioApps { available: false, apps: Vec::new() }
}
