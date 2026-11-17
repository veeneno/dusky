//! Baixar arquivo no app: pergunta onde salvar ("Salvar como"), igual ao Discord — antes ia direto
//! pra pasta Downloads.
//!
//! O WebView decide o destino de um download na hora, dentro do on_download (síncrono, na thread da
//! interface). Cada sistema resolve de um jeito:
//!   - Windows: o "Salvar como" do próprio Windows abre ali mesmo (diálogo modal na thread da
//!     janela, que é o normal no Windows) e o download já vai pro lugar escolhido.
//!   - Linux: ali não dá pra abrir diálogo (o GTK da janela está no meio do evento e o diálogo
//!     travaria/derrubaria o app). Então o pedido é cancelado, o "Salvar como" abre pelo plugin de
//!     diálogo do Tauri (assíncrono) e, escolhido o lugar, a página baixa o MESMO endereço de novo —
//!     o on_download reconhece esse pedido como aprovado e manda pro caminho escolhido.
//! blob:/data: (gerados na própria página) vão direto pra Downloads, como antes: esses não dá pra
//! pedir de novo.

use crate::server::log;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::webview::DownloadEvent;
use tauri::{Runtime, Url, Webview};

/// última pasta escolhida — o próximo "Salvar como" já abre nela
static LAST_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

fn start_dir(default_dir: Option<PathBuf>) -> Option<PathBuf> {
    LAST_DIR.lock().unwrap().clone().filter(|d| d.is_dir()).or(default_dir)
}

fn remember_dir(path: &Path) {
    if let Some(dir) = path.parent() {
        *LAST_DIR.lock().unwrap() = Some(dir.to_path_buf());
    }
}

/// nome sugerido: o que o WebView já calculou (atributo download / Content-Disposition) ou o fim da URL
fn suggested_name(url: &Url, destination: &Path) -> String {
    destination
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.trim().is_empty())
        .or_else(|| url.path_segments().and_then(|mut s| s.next_back().map(str::to_string)).filter(|n| !n.is_empty()))
        .unwrap_or_else(|| "arquivo".into())
}

pub fn on_download<R: Runtime>(webview: Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            if !matches!(url.scheme(), "http" | "https") {
                return true; // blob:/data: — direto pra Downloads
            }
            platform::requested(webview, url, destination)
        }
        DownloadEvent::Finished { url, path, success } => {
            if success {
                log::info(&format!("download salvo: {}", path.map(|p| p.display().to_string()).unwrap_or_else(|| url.to_string())));
            } else {
                log::info(&format!("download não terminou: {url}"));
            }
            true
        }
        _ => true,
    }
}

#[cfg(windows)]
mod platform {
    use super::*;

    pub fn requested<R: Runtime>(webview: Webview<R>, url: Url, destination: &mut PathBuf) -> bool {
        let name = suggested_name(&url, destination);
        let mut dialog = rfd::FileDialog::new().set_title("Salvar arquivo").set_file_name(&name);
        if let Some(dir) = start_dir(destination.parent().map(Path::to_path_buf)) {
            dialog = dialog.set_directory(dir);
        }
        let window = webview.window();
        dialog = dialog.set_parent(&window);
        match dialog.save_file() {
            Some(path) => {
                remember_dir(&path);
                *destination = path;
                true
            }
            None => false, // cancelou: não baixa
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    use std::collections::HashMap;
    use std::time::{Duration, Instant};
    use tauri::Manager;
    use tauri_plugin_dialog::DialogExt;

    /// endereço -> (onde salvar, quando a pessoa escolheu): o pedido repetido pela página vai pra lá
    static APPROVED: Mutex<Option<HashMap<String, (PathBuf, Instant)>>> = Mutex::new(None);

    pub fn requested<R: Runtime>(webview: Webview<R>, url: Url, destination: &mut PathBuf) -> bool {
        let key = url.to_string();
        let approved = APPROVED.lock().unwrap().get_or_insert_with(HashMap::new).remove(&key);
        if let Some((path, at)) = approved {
            if at.elapsed() < Duration::from_secs(60) {
                *destination = path;
                return true;
            }
        }
        let name = suggested_name(&url, destination);
        let mut dialog = webview.app_handle().dialog().file().set_title("Salvar arquivo").set_file_name(name);
        if let Some(dir) = start_dir(destination.parent().map(Path::to_path_buf)) {
            dialog = dialog.set_directory(dir);
        }
        let window = webview.window();
        dialog = dialog.set_parent(&window);
        let wv = webview.clone();
        dialog.save_file(move |picked| {
            let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return }; // cancelou
            remember_dir(&path);
            let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            {
                let mut guard = APPROVED.lock().unwrap();
                let map = guard.get_or_insert_with(HashMap::new);
                map.retain(|_, (_, at)| at.elapsed() < Duration::from_secs(60));
                map.insert(key.clone(), (path, Instant::now()));
            }
            // a página pede o mesmo endereço de novo (mesma sessão/cookies) — agora já aprovado
            let js = format!(
                "(()=>{{const a=document.createElement('a');a.href={};a.download={};a.style.display='none';document.body.appendChild(a);a.click();a.remove();}})()",
                serde_json::to_string(&key).unwrap_or_default(),
                serde_json::to_string(&file_name).unwrap_or_default(),
            );
            if let Err(err) = wv.eval(js) {
                log::warn(&format!("não consegui começar o download depois do \"Salvar como\": {err}"));
            }
        });
        false // este pedido não: o da página, depois do diálogo
    }
}
