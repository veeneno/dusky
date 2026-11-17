//! Arrastar arquivo pra conversa no app do LINUX.
//!
//! No Wayland o WebKitGTK avisa a página que tem algo sendo solto ("text/uri-list") mas NÃO entrega
//! o arquivo (DataTransfer.files vem vazio e o endereço vem em branco) — a página não tinha como
//! anexar. O GTK, por baixo, recebe os caminhos: o webview_setup.rs escuta o drag-data-received do
//! WebView e guarda aqui os arquivos do arrastar mais recente.
//!
//! Na hora do soltar, a página (09-panels-attachments.js) vê que não veio arquivo e pede pra cá:
//!   drop_files -> [{ id, name, size, type }] dos arquivos ARRASTADOS AGORA (nada de caminho que a
//!                 página escolha: só o que a pessoa acabou de soltar, e só nos últimos segundos)
//!   drop_read  -> o conteúdo de um deles (binário cru, sem virar JSON)
//! No Windows o WebView2 entrega o arquivo direto pra página e isto nem é usado.

use crate::app;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::Response;
use tauri::{AppHandle, Webview};

/// arquivo grande demais pra passar pela memória de uma vez (anexo maior: botão de anexo)
const MAX_BYTES: u64 = 512 * 1024 * 1024;
const FRESH: Duration = Duration::from_secs(15);

static LAST_DRAG: Mutex<Option<(Instant, Vec<PathBuf>)>> = Mutex::new(None);
static OFFERED: Mutex<Option<HashMap<u64, (Instant, PathBuf)>>> = Mutex::new(None);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// webview_setup.rs: o GTK recebeu os itens de um arrastar (vem várias vezes durante o movimento)
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn remember_uris(uris: &[String]) {
    let paths: Vec<PathBuf> = uris
        .iter()
        .filter_map(|u| tauri::Url::parse(u.trim()).ok())
        .filter(|u| u.scheme() == "file")
        .filter_map(|u| u.to_file_path().ok())
        .collect();
    if !paths.is_empty() {
        *LAST_DRAG.lock().unwrap() = Some((Instant::now(), paths));
    }
}

fn mime_of(name: &str) -> &'static str {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "txt" | "log" => "text/plain",
        _ => "application/octet-stream",
    }
}

#[derive(Serialize)]
pub struct DropFile {
    id: u64,
    name: String,
    size: u64,
    #[serde(rename = "type")]
    mime: &'static str,
    /// grande demais pra vir por aqui
    too_big: bool,
}

#[tauri::command]
pub fn drop_files(app: AppHandle, webview: Webview) -> Vec<DropFile> {
    if app::require_site(&app, &webview).is_err() {
        return Vec::new();
    }
    let Some((at, paths)) = LAST_DRAG.lock().unwrap().take() else { return Vec::new() };
    if at.elapsed() > FRESH {
        return Vec::new();
    }
    let mut offered = OFFERED.lock().unwrap();
    let map = offered.get_or_insert_with(HashMap::new);
    map.retain(|_, (t, _)| t.elapsed() < Duration::from_secs(120));
    let mut out = Vec::new();
    for path in paths.into_iter().take(10) {
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        if !meta.is_file() {
            continue; // pasta não
        }
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "arquivo".into());
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        let too_big = meta.len() > MAX_BYTES;
        if !too_big {
            map.insert(id, (Instant::now(), path));
        }
        out.push(DropFile { id, mime: mime_of(&name), name, size: meta.len(), too_big });
    }
    out
}

#[tauri::command]
pub fn drop_read(app: AppHandle, webview: Webview, id: u64) -> Response {
    if app::require_site(&app, &webview).is_err() {
        return Response::new(Vec::<u8>::new());
    }
    let path = OFFERED.lock().unwrap().as_mut().and_then(|m| m.remove(&id)).map(|(_, p)| p);
    match path.map(std::fs::read) {
        Some(Ok(bytes)) => Response::new(bytes),
        _ => Response::new(Vec::<u8>::new()),
    }
}
