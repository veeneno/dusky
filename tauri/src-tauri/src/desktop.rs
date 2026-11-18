//! Pedidos do site que não cabem em outro lugar: abrir link no navegador do sistema, tela cheia,
//! iniciar com o sistema e "estou numa call" (a bandeja só descarrega a página fora de call, ver
//! tray_watch.rs).

use crate::app::{self, require_site, AppState, MAIN};
use crate::server::log;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, Url, Webview};

// ---------- links ----------

/// O site manda TODO clique em link de fora (e window.open) pra cá, pelo bridge.js. Antes o clique
/// dependia do WebKit pedir uma janela nova (target=_blank → on_new_window) e, no app do Linux, às
/// vezes não chegava nada: o link não abria em lugar nenhum. Aqui não depende do motor web.
#[tauri::command]
pub fn desktop_open_external(app: AppHandle, webview: Webview, url: String) -> Result<(), String> {
    require_site(&app, &webview)?;
    let parsed = Url::parse(&url).map_err(|_| "endereço inválido".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err("só dá pra abrir http, https e mailto".into());
    }
    app::open_external(&app, parsed.as_str());
    Ok(())
}

// ---------- tela cheia ----------

/// on = Some(true/false) liga/desliga, None alterna (F11). Devolve como a janela ESTAVA antes, pro
/// site saber se deve tirar a tela cheia ao sair do vídeo em tela cheia (no F11 continua).
/// Por que existe: no Windows, o requestFullscreen() do WebView2 só ocupa a área da página — a
/// janela continuava com borda e barra de tarefas. No Linux o WebKitGTK já põe a janela em tela
/// cheia sozinho; lá isso só serve pro F11.
#[tauri::command]
pub fn desktop_fullscreen(app: AppHandle, webview: Webview, on: Option<bool>) -> Result<bool, String> {
    require_site(&app, &webview)?;
    let win = app.get_webview_window(MAIN).ok_or_else(|| "sem janela".to_string())?;
    let was = win.is_fullscreen().unwrap_or(false);
    let want = on.unwrap_or(!was);
    if want != was {
        win.set_fullscreen(want).map_err(|e| e.to_string())?;
    }
    Ok(was)
}

// ---------- ocupado (call / tela) ----------

/// o site avisa quando entra e sai de uma call: com a página ocupada, a bandeja não a descarrega
#[tauri::command]
pub fn desktop_set_busy(app: AppHandle, webview: Webview, busy: bool) {
    if require_site(&app, &webview).is_ok() {
        app.state::<AppState>().busy.store(busy, Ordering::SeqCst);
    }
}

/// o site avisa o nível de notificação ("all" | "mentions" | "none"), pra bandeja avisar igual
/// enquanto a página está descarregada
#[tauri::command]
pub fn desktop_tray_config(app: AppHandle, webview: Webview, level: String) {
    if require_site(&app, &webview).is_err() || !matches!(level.as_str(), "all" | "mentions" | "none") {
        return;
    }
    *app.state::<AppState>().notify_level.lock().unwrap() = level;
}

// ---------- iniciar com o sistema ----------
//
// Desligado por padrão. Ligado, o sistema abre o dusky ao entrar na conta, com --autostart: a
// janela não aparece (fica na bandeja) e, nos modos de memória equilibrado/mínimo, a página é
// descarregada logo depois (tray_watch.rs) — o app fica na bandeja gastando pouco.
//   Linux:   ~/.config/autostart/dusky.desktop (padrão XDG: GNOME, KDE, XFCE, Cinnamon… e Hyprland
//            com uwsm/dex). No AppImage aponta pro arquivo .AppImage, não pro caminho temporário
//            de dentro dele.
//   Windows: HKCU\Software\Microsoft\Windows\CurrentVersion\Run, valor "dusky".

pub const AUTOSTART_ARG: &str = "--autostart";

pub fn started_by_autostart() -> bool {
    std::env::args().any(|a| a == AUTOSTART_ARG)
}

/// o executável que o sistema deve abrir (no AppImage, o próprio .AppImage)
fn launch_path() -> Option<String> {
    if cfg!(target_os = "linux") {
        if let Some(p) = std::env::var_os("APPIMAGE").filter(|p| !p.is_empty()) {
            return Some(p.to_string_lossy().into_owned());
        }
    }
    std::env::current_exe().ok().map(|p| p.to_string_lossy().into_owned())
}

#[cfg(target_os = "linux")]
mod autostart_os {
    use std::path::PathBuf;

    fn file() -> Option<PathBuf> {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
        Some(base.join("autostart").join("dusky.desktop"))
    }

    /// o que está escrito no Exec= do arquivo (None = não existe)
    pub fn current() -> Option<String> {
        let text = std::fs::read_to_string(file()?).ok()?;
        text.lines().find_map(|l| l.strip_prefix("Exec=")).map(str::to_string)
    }

    pub fn exec_line(path: &str) -> String {
        // Exec= da especificação: entre aspas, com \ " ` $ escapados
        let escaped: String = path
            .chars()
            .flat_map(|c| match c {
                '\\' | '"' | '`' | '$' => vec!['\\', c],
                _ => vec![c],
            })
            .collect();
        format!("\"{escaped}\" {}", super::AUTOSTART_ARG)
    }

    pub fn set(path: Option<&str>) -> Result<(), String> {
        let f = file().ok_or("não achei a pasta de configurações (~/.config)")?;
        match path {
            None => match std::fs::remove_file(&f) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e.to_string()),
            },
            Some(p) => {
                std::fs::create_dir_all(f.parent().unwrap()).map_err(|e| e.to_string())?;
                let text = format!(
                    "[Desktop Entry]\nType=Application\nName=dusky\nComment=Abre o dusky na bandeja ao entrar no computador\nExec={}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
                    exec_line(p)
                );
                std::fs::write(&f, text).map_err(|e| e.to_string())
            }
        }
    }
}

#[cfg(windows)]
mod autostart_os {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ,
    };

    const KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const NAME: &str = "dusky";

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn exec_line(path: &str) -> String {
        format!("\"{path}\" {}", super::AUTOSTART_ARG)
    }

    pub fn current() -> Option<String> {
        let (key, name) = (wide(KEY), wide(NAME));
        let mut buf = vec![0u16; 2048];
        let mut size = (buf.len() * 2) as u32;
        // SAFETY: buffers válidos e com o tamanho em bytes informado
        let r = unsafe {
            RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buf.as_mut_ptr().cast(), &mut size)
        };
        if r != ERROR_SUCCESS {
            return None;
        }
        let len = (size as usize / 2).saturating_sub(1).min(buf.len());
        Some(String::from_utf16_lossy(&buf[..len]))
    }

    pub fn set(path: Option<&str>) -> Result<(), String> {
        let (key, name) = (wide(KEY), wide(NAME));
        // SAFETY: strings terminadas em zero; o valor é REG_SZ com o tamanho em bytes (com o zero)
        let r = unsafe {
            match path {
                None => {
                    let r = RegDeleteKeyValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr());
                    if r == 2 /* ERROR_FILE_NOT_FOUND */ { ERROR_SUCCESS } else { r }
                }
                Some(p) => {
                    let data = wide(&exec_line(p));
                    RegSetKeyValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr(), REG_SZ, data.as_ptr().cast(), (data.len() * 2) as u32)
                }
            }
        };
        if r == ERROR_SUCCESS { Ok(()) } else { Err(format!("o registro do Windows recusou (erro {r})")) }
    }
}

#[cfg(not(any(target_os = "linux", windows)))]
mod autostart_os {
    pub fn current() -> Option<String> { None }
    pub fn exec_line(path: &str) -> String { path.to_string() }
    pub fn set(_path: Option<&str>) -> Result<(), String> { Err("não disponível neste sistema".into()) }
}

pub fn autostart_enabled() -> bool {
    autostart_os::current().is_some()
}

/// ao abrir: se está ligado mas aponta pra outro lugar (o AppImage mudou de pasta, o app foi
/// reinstalado), corrige pro caminho atual
pub fn refresh_autostart() {
    let (Some(cur), Some(path)) = (autostart_os::current(), launch_path()) else { return };
    if cur != autostart_os::exec_line(&path) {
        match autostart_os::set(Some(&path)) {
            Ok(()) => log::info("iniciar com o sistema: caminho do app atualizado"),
            Err(e) => log::warn(&format!("iniciar com o sistema: não atualizei o caminho: {e}")),
        }
    }
}

/// liga/desliga e devolve como ficou
#[tauri::command]
pub fn app_set_autostart(app: AppHandle, webview: Webview, on: bool) -> Result<bool, String> {
    require_site(&app, &webview)?;
    let result = if on {
        let path = launch_path().ok_or_else(|| "não achei o caminho do app".to_string())?;
        autostart_os::set(Some(&path))
    } else {
        autostart_os::set(None)
    };
    match &result {
        Ok(()) => log::info(&format!("iniciar com o sistema: {}", if on { "ligado" } else { "desligado" })),
        Err(e) => log::warn(&format!("iniciar com o sistema: falhou: {e}")),
    }
    result.map(|_| autostart_enabled())
}
