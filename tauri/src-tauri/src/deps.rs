//! Dependências que o app baixa sozinho na primeira vez que precisa — hoje, o ffmpeg do
//! compartilhamento de tela pela placa de vídeo (mesma coisa do electron/deps.js).
//!
//! Segurança: versão FIXA, e o arquivo só é usado se o SHA-256 bater com o valor oficial gravado
//! aqui. Arquivo diferente = descartado.
//! Fonte: builds estáticas do ffmpeg por BtbN (github.com/BtbN/FFmpeg-Builds), com NVENC, AMF,
//! QSV/VA-API e captura de tela. Versão 8.1.3 (a 9.x exige driver NVIDIA 610+).

use crate::server::log;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex as AsyncMutex;

struct Build {
    version: &'static str,
    url: &'static str,
    sha256: &'static str,
    size: u64,
    archive: &'static str,
    exe: &'static str,
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const BUILD: Option<Build> = Some(Build {
    version: "n8.1.3",
    url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-26-13-03/ffmpeg-n8.1.3-linux64-gpl-8.1.tar.xz",
    sha256: "add729675e76163d04ba7e5b7e09c2439a20f66a4eaa23994b20d63f8ad75cb7",
    size: 150_325_156,
    archive: "ffmpeg.tar.xz",
    exe: "ffmpeg",
});

#[cfg(all(windows, target_arch = "x86_64"))]
const BUILD: Option<Build> = Some(Build {
    version: "n8.1.3",
    url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-26-13-03/ffmpeg-n8.1.3-win64-gpl-8.1.zip",
    sha256: "d20ef03f0f4161453b9f46a72471eb5370f56b6410fe8bca14a4b0220c6c924a",
    size: 193_111_781,
    archive: "ffmpeg.zip",
    exe: "ffmpeg.exe",
});

#[cfg(not(any(all(target_os = "linux", target_arch = "x86_64"), all(windows, target_arch = "x86_64"))))]
const BUILD: Option<Build> = None;

/// estado pra mostrar na tela: idle | downloading | ready | failed | unsupported
#[derive(Serialize, Clone)]
pub struct DepsStatus {
    pub state: &'static str,
    pub progress: f64,
    pub error: Option<String>,
}

pub struct Deps {
    dir: Option<PathBuf>,
    status: Arc<Mutex<DepsStatus>>,
    download_lock: Arc<AsyncMutex<()>>,
}

impl Deps {
    pub fn new(data_dir: &Path) -> Self {
        let dir = BUILD.as_ref().map(|b| data_dir.join("deps").join("ffmpeg").join(b.version));
        Self {
            status: Arc::new(Mutex::new(DepsStatus {
                state: if dir.is_some() { "idle" } else { "unsupported" },
                progress: 0.0,
                error: None,
            })),
            dir,
            download_lock: Arc::new(AsyncMutex::new(())),
        }
    }

    fn exe_path(&self) -> Option<PathBuf> {
        Some(self.dir.as_ref()?.join(BUILD.as_ref()?.exe))
    }

    /// ffmpeg que o app já baixou (se tiver)
    pub fn managed_ffmpeg(&self) -> Option<PathBuf> {
        self.exe_path().filter(|p| p.exists())
    }

    pub fn status(&self) -> DepsStatus {
        self.status.lock().unwrap().clone()
    }

    /// Baixa (uma vez) se ainda não tiver. Não falha: em caso de erro devolve None e o estado vira
    /// "failed" (tenta de novo da próxima vez que alguém pedir).
    pub async fn ensure_ffmpeg(&self, http: &reqwest::Client) -> Option<PathBuf> {
        let _guard = self.download_lock.lock().await;
        if let Some(p) = self.managed_ffmpeg() {
            *self.status.lock().unwrap() = DepsStatus { state: "ready", progress: 1.0, error: None };
            return Some(p);
        }
        match self.download(http).await {
            Ok(p) => Some(p),
            Err(err) => {
                log::warn(&format!("falha ao baixar o ffmpeg: {err}"));
                *self.status.lock().unwrap() = DepsStatus { state: "failed", progress: 0.0, error: Some(err) };
                None
            }
        }
    }

    async fn download(&self, http: &reqwest::Client) -> Result<PathBuf, String> {
        let build = BUILD.as_ref().ok_or("sem ffmpeg pronto pra este sistema")?;
        let dir = self.dir.clone().ok_or("sem pasta")?;
        let exe_path = dir.join(build.exe);
        tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
        let archive = dir.join(format!("{}.part", build.archive));
        *self.status.lock().unwrap() = DepsStatus { state: "downloading", progress: 0.0, error: None };
        log::info(&format!("baixando ffmpeg {} ({} MB)", build.version, build.size / 1_000_000));

        let mut res = http.get(build.url).send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("download falhou (HTTP {})", res.status().as_u16()));
        }
        let mut file = tokio::fs::File::create(&archive).await.map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut received: u64 = 0;
        while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
            hash.update(&chunk);
            received += chunk.len() as u64;
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            self.status.lock().unwrap().progress = (received as f64 / build.size as f64).min(0.99);
        }
        file.flush().await.map_err(|e| e.to_string())?;
        drop(file);

        let digest: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if digest != build.sha256 {
            let _ = tokio::fs::remove_file(&archive).await;
            return Err("o arquivo baixado não bate com a verificação oficial — descartado".into());
        }

        extract(&archive, &dir, build.exe).await?;
        let extracted = find_extracted(&dir, build.exe).ok_or("não achei o ffmpeg dentro do pacote baixado")?;
        std::fs::rename(&extracted, &exe_path).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&exe_path, std::fs::Permissions::from_mode(0o755));
        }
        let _ = std::fs::remove_file(&archive);
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for e in entries.flatten() {
                if e.path().is_dir() {
                    let _ = std::fs::remove_dir_all(e.path());
                }
            }
        }
        *self.status.lock().unwrap() = DepsStatus { state: "ready", progress: 1.0, error: None };
        log::info(&format!("ffmpeg {} pronto em {}", build.version, exe_path.display()));
        Ok(exe_path)
    }
}

/// só o executável: o pacote tem também ffprobe/ffplay/docs, que o app não usa
async fn extract(archive: &Path, dir: &Path, exe: &str) -> Result<(), String> {
    let pattern = format!("*/bin/{exe}");
    let mut cmd = if cfg!(windows) {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        let mut c = tokio::process::Command::new(Path::new(&root).join("System32").join("tar.exe")); // Windows 10 1803+
        c.arg("-xf").arg(archive).arg("-C").arg(dir).arg(&pattern);
        c
    } else {
        let mut c = tokio::process::Command::new("tar");
        c.arg("-xJf").arg(archive).arg("-C").arg(dir).arg("--wildcards").arg(&pattern);
        c
    };
    crate::screencast::hide_console(&mut cmd);
    crate::screencast::clean_child_env(&mut cmd); // tar do sistema: sem as variáveis do AppImage
    let out = cmd.output().await.map_err(|e| format!("extração falhou: {e}"))?;
    if !out.status.success() {
        return Err(format!("extração falhou: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(())
}

fn find_extracted(root: &Path, exe: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(root).ok()?.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Some(hit) = find_extracted(&p, exe) {
                return Some(hit);
            }
        } else if p.file_name().and_then(|n| n.to_str()) == Some(exe)
            && p.parent().and_then(|d| d.file_name()).and_then(|n| n.to_str()) == Some("bin")
        {
            return Some(p);
        }
    }
    None
}
