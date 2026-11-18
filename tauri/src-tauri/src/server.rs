//! Endereço do servidor e preferências do app (server.json / prefs.json na pasta de dados).
//! Mesma regra do electron/main.js: endereço fixo por padrão, dá pra trocar pela tela de
//! "conectando…", e DUSKY_URL força um endereço (bom pra teste).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use url::Url;

pub const DEFAULT_URL: &str = "https://dusky.veneno.space";
/// endereço de antes de o projeto virar "dusky" (continua no ar, mas o app passa a usar o novo)
pub const LEGACY_DEFAULT_URL: &str = "https://didiscord.veneno.space";
/// identifier do app Tauri até a 0.6 (a pasta de dados tinha esse nome)
pub const LEGACY_IDENTIFIER: &str = "fun.sambalele.didiscord";

/// variável de ambiente pelo nome novo (DUSKY_X) ou pelo antigo (DIDISCORD_X)
pub fn env_var(name: &str) -> Option<String> {
    std::env::var(format!("DUSKY_{name}"))
        .ok()
        .or_else(|| std::env::var(format!("DIDISCORD_{name}")).ok())
}

/// O que a pessoa digitou -> origem (https://host ou http://ip:porta), ou None se não dá.
pub fn normalize_server_input(input: &str) -> Option<String> {
    let mut s = input.trim().to_string();
    if s.is_empty() {
        return None;
    }
    let has_scheme = s
        .find("://")
        .map(|i| i > 0 && s[..i].chars().all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c)))
        .unwrap_or(false);
    if !has_scheme {
        // sem http(s)://: IP (ou localhost) vira http na porta 3000; nome (ex: túnel) vira https
        let host_port = s.split('/').next().unwrap_or("").to_string();
        let (host, port) = match host_port.rsplit_once(':') {
            Some((h, p)) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => (h.to_string(), Some(p.to_string())),
            _ => (host_port.clone(), None),
        };
        let is_ip = host.eq_ignore_ascii_case("localhost")
            || (host.split('.').count() == 4
                && host.split('.').all(|p| !p.is_empty() && p.len() <= 3 && p.chars().all(|c| c.is_ascii_digit())));
        s = if is_ip {
            format!("http://{}:{}", host, port.unwrap_or_else(|| "3000".into()))
        } else {
            format!("https://{s}")
        };
    }
    let u = Url::parse(&s).ok()?;
    if u.scheme() != "https" && u.scheme() != "http" {
        return None;
    }
    let host = u.host_str()?;
    if host.is_empty()
        || !host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        || (!host.contains('.') && host != "localhost")
    {
        return None;
    }
    Some(u.origin().ascii_serialization())
}

#[derive(Serialize, Deserialize)]
struct ServerFile {
    url: String,
}

fn server_file(dir: &Path) -> PathBuf {
    dir.join("server.json")
}

pub fn load_saved_server(dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(server_file(dir)).ok()?;
    let f: ServerFile = serde_json::from_str(&text).ok()?;
    normalize_server_input(&f.url)
}

pub fn save_server(dir: &Path, url: &str) {
    let _ = std::fs::create_dir_all(dir);
    if let Err(err) = std::fs::write(server_file(dir), serde_json::to_string(&ServerFile { url: url.into() }).unwrap()) {
        log::warn(&format!("não consegui salvar o endereço do servidor: {err}"));
    }
}

/// Endereço salvo (menos túneis rápidos antigos, que mudavam a cada reinício) ou o padrão.
pub fn saved_server_or_default(dir: &Path) -> String {
    match load_saved_server(dir) {
        // o endereço padrão antigo vira o novo (o antigo segue funcionando, mas não é mais o oficial)
        Some(saved) if saved == LEGACY_DEFAULT_URL => DEFAULT_URL.into(),
        Some(saved) if !Url::parse(&saved).ok().and_then(|u| u.host_str().map(|h| h.ends_with(".trycloudflare.com"))).unwrap_or(false) => saved,
        _ => DEFAULT_URL.into(),
    }
}

/// O servidor está de pé? (502/530 do túnel do Cloudflare com o servidor desligado = fora do ar)
pub async fn site_is_up(client: &reqwest::Client, url: &str) -> bool {
    match client.get(url).timeout(Duration::from_secs(6)).send().await {
        Ok(res) => res.status().as_u16() < 500,
        Err(_) => false,
    }
}

// ---------- pastas do nome antigo ----------

/// Pastas onde o sistema guarda os dados do app: (base, nome antigo, nome novo).
/// Windows: %APPDATA% e %LOCALAPPDATA% (o WebView2 guarda login/localStorage do site em
/// %LOCALAPPDATA%\<identifier>\EBWebView). Linux: ~/.local/share e ~/.config pelo identifier, e
/// ~/.local/share/<nome do programa>, onde o WebKitGTK guarda cookies/localStorage.
fn legacy_dir_pairs(identifier: &str) -> Vec<(PathBuf, String, String)> {
    let mut out = Vec::new();
    let env_dir = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from);
    #[cfg(windows)]
    {
        for k in ["APPDATA", "LOCALAPPDATA"] {
            if let Some(base) = env_dir(k) {
                out.push((base, LEGACY_IDENTIFIER.to_string(), identifier.to_string()));
            }
        }
    }
    #[cfg(not(windows))]
    {
        let home = env_dir("HOME");
        let data = env_dir("XDG_DATA_HOME").or_else(|| home.as_ref().map(|h| h.join(".local/share")));
        let config = env_dir("XDG_CONFIG_HOME").or_else(|| home.as_ref().map(|h| h.join(".config")));
        if let Some(d) = data {
            out.push((d.clone(), LEGACY_IDENTIFIER.to_string(), identifier.to_string()));
            out.push((d, "didiscord".to_string(), "dusky".to_string()));
        }
        if let Some(c) = config {
            // ~/.config/didiscord é do app Electron: esse não entra (é outro formato)
            out.push((c, LEGACY_IDENTIFIER.to_string(), identifier.to_string()));
        }
    }
    out
}

/// O identifier mudou (fun.sambalele.didiscord -> o atual), então a pasta de dados também. Na
/// primeira vez copia a antiga pra nova: endereço do servidor, preferências, tamanho/posição da
/// janela e o login do site. Copia (não move) pra versão antiga continuar abrindo se ainda estiver
/// instalada. Roda antes de qualquer janela existir.
pub fn migrate_legacy_dirs(identifier: &str) {
    if identifier == LEGACY_IDENTIFIER {
        return;
    }
    for (base, old, new) in legacy_dir_pairs(identifier) {
        let (from, to) = (base.join(&old), base.join(&new));
        if !from.is_dir() || to.exists() {
            continue;
        }
        match copy_dir(&from, &to) {
            Ok(()) => log::info(&format!("dados copiados de {} pra {}", from.display(), to.display())),
            Err(err) => log::warn(&format!("não consegui copiar {} pra {}: {err}", from.display(), to.display())),
        }
    }
}

/// Pasta de dados do app Electron antigo (productName "didiscord"): ~/.config/didiscord no Linux,
/// %APPDATA%\\didiscord no Windows. Ela continua lá depois que o app novo entra no lugar (o
/// desinstalador do Electron não apaga os dados).
fn electron_data_dir() -> Option<PathBuf> {
    let env_dir = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from);
    #[cfg(windows)]
    let base = env_dir("APPDATA");
    #[cfg(not(windows))]
    let base = env_dir("XDG_CONFIG_HOME").or_else(|| env_dir("HOME").map(|h| h.join(".config")));
    base.map(|b| b.join("didiscord"))
}

/// Quem vem do app Electron (atualizado direto pro app novo, ver tauri/README.md) mantém o endereço
/// do servidor e as preferências da bandeja: server.json e prefs.json têm o mesmo formato nos dois.
/// Só copia o que ainda não existe na pasta nova.
pub fn migrate_from_electron(data_dir: &Path) {
    let Some(old) = electron_data_dir() else { return };
    for name in ["server.json", "prefs.json"] {
        let (from, to) = (old.join(name), data_dir.join(name));
        if from.is_file() && !to.exists() {
            let _ = std::fs::create_dir_all(data_dir);
            match std::fs::copy(&from, &to) {
                Ok(_) => log::info(&format!("{name} trazido do app antigo ({})", from.display())),
                Err(err) => log::warn(&format!("não consegui trazer {name} do app antigo: {err}")),
            }
        }
    }
}

/// Windows: fecha o app Electron antigo (didiscord.exe) se ele ainda estiver aberto. Os dois juntos
/// dão problema: o som do Electron (a call inteira, se ele também estiver nela) entrava no áudio
/// da tela — a captura da tela inteira só consegue deixar de fora UM programa (o dusky), ver
/// audio/windows.rs. Ele sobra aberto quando a desinstalação silenciosa falhou (estava aberto na
/// hora) e volta sozinho ao ligar o PC ("abrir com o Windows"). Confere agora e mais duas vezes
/// (os dois podem abrir juntos com o Windows, em qualquer ordem).
#[cfg(windows)]
pub fn close_electron_app() {
    std::thread::spawn(|| {
        for wait in [0u64, 30, 90] {
            std::thread::sleep(std::time::Duration::from_secs(wait));
            let n = kill_by_exe_name("didiscord.exe");
            if n > 0 {
                log::info(&format!("fechei o app antigo (didiscord.exe, {n} processo(s)) — desinstale ele em Configurações > Aplicativos se ainda aparecer lá"));
            }
        }
    });
}

#[cfg(windows)]
fn kill_by_exe_name(name: &str) -> usize {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    let me = std::process::id();
    let mut killed = 0;
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE || snap.is_null() {
            return 0;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap, &mut entry) != 0;
        while ok {
            let n = entry.szExeFile.iter().position(|c| *c == 0).unwrap_or(entry.szExeFile.len());
            let exe = String::from_utf16_lossy(&entry.szExeFile[..n]);
            if entry.th32ProcessID != me && exe.eq_ignore_ascii_case(name) {
                let h = OpenProcess(PROCESS_TERMINATE, 0, entry.th32ProcessID);
                if !h.is_null() {
                    if TerminateProcess(h, 0) != 0 {
                        killed += 1;
                    }
                    CloseHandle(h);
                }
            }
            ok = Process32NextW(snap, &mut entry) != 0;
        }
        CloseHandle(snap);
    }
    killed
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    // cache do motor web: grande e refeito sozinho
    const SKIP: &[&str] = &["Cache", "Code Cache", "GPUCache", "ShaderCache", "GrShaderCache", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "Crashpad"];
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let name = entry.file_name();
        if SKIP.iter().any(|s| name == *s) {
            continue;
        }
        let ty = entry.file_type()?;
        let dest = to.join(&name);
        if ty.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else if ty.is_file() {
            // arquivo travado (o app antigo aberto) não impede o resto
            if let Err(err) = std::fs::copy(entry.path(), &dest) {
                log::warn(&format!("pulei {}: {err}", entry.path().display()));
            }
        }
    }
    Ok(())
}

// ---------- preferências ----------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Prefs {
    /// fechar a janela só esconde (padrão) — desligado, fechar sai do app
    pub close_to_tray: bool,
    /// o aviso "continua rodando" já apareceu uma vez
    pub tray_hint_shown: bool,
    /// desenhar a página na placa de vídeo (padrão). Mudar reinicia o app: o motor web só lê isso
    /// ao abrir (ver webview_setup.rs)
    pub hardware_acceleration: bool,
    /// uso de memória: "alto" | "equilibrado" (padrão) | "minimo". Mudar reinicia o app (ver
    /// webview_setup::MemoryMode)
    pub memory_mode: String,
}

impl Default for Prefs {
    fn default() -> Self {
        Self { close_to_tray: true, tray_hint_shown: false, hardware_acceleration: true, memory_mode: "equilibrado".into() }
    }
}

/// Pasta de dados do app (a mesma do app.path().app_data_dir() do Tauri), pra quem precisa dela
/// antes do Tauri subir: ~/.local/share/<identifier> no Linux, %APPDATA%\\<identifier> no Windows.
pub fn data_dir_for(identifier: &str) -> Option<PathBuf> {
    let env_dir = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from);
    #[cfg(windows)]
    let base = env_dir("APPDATA");
    #[cfg(not(windows))]
    let base = env_dir("XDG_DATA_HOME").or_else(|| env_dir("HOME").map(|h| h.join(".local/share")));
    base.map(|b| b.join(identifier))
}

pub fn load_prefs(dir: &Path) -> Prefs {
    std::fs::read_to_string(dir.join("prefs.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save_prefs(dir: &Path, prefs: &Prefs) {
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(dir.join("prefs.json"), serde_json::to_string(prefs).unwrap());
}

/// Log do app: vai pro terminal E pra um arquivo (<pasta de dados>/logs/dusky.log). No Windows a
/// versão final nem tem terminal — sem o arquivo não existia log nenhum pra mandar quando algo dá
/// errado. Configurações → app e versão → "abrir pasta do log". Passou de 2 MB: o atual vira
/// dusky.old.log e começa outro.
pub mod log {
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    const MAX_BYTES: u64 = 2 * 1024 * 1024;
    static FILE: Mutex<Option<(PathBuf, std::fs::File, u64)>> = Mutex::new(None);

    pub fn dir(data_dir: &Path) -> PathBuf {
        data_dir.join("logs")
    }

    /// chamado uma vez, no começo (app.rs, setup)
    pub fn init(data_dir: &Path) {
        let dir = dir(data_dir);
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let path = dir.join("dusky.log");
        rotate_if_big(&path);
        if let Ok(f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let len = f.metadata().map(|m| m.len()).unwrap_or(0);
            *FILE.lock().unwrap() = Some((path, f, len));
        }
        info(&format!(
            "---- dusky {} ({} {}) iniciando ----",
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            std::env::consts::ARCH
        ));
    }

    fn rotate_if_big(path: &Path) {
        if std::fs::metadata(path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
            let _ = std::fs::rename(path, path.with_file_name("dusky.old.log"));
        }
    }

    /// "2026-11-17 06:50:01Z" sem depender de crate de data (UTC)
    fn now_utc() -> String {
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
        let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
        // dias desde 1970 -> data civil (algoritmo de Howard Hinnant)
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
        format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
    }

    fn write(line: &str) {
        eprintln!("{line}");
        let mut guard = FILE.lock().unwrap();
        let Some((path, file, len)) = guard.as_mut() else { return };
        let text = format!("{} {line}\n", now_utc());
        if file.write_all(text.as_bytes()).is_ok() {
            *len += text.len() as u64;
        }
        if *len > MAX_BYTES {
            let path = path.clone();
            *guard = None;
            rotate_if_big(&path);
            if let Ok(f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
                *guard = Some((path, f, 0));
            }
        }
    }

    pub fn info(msg: &str) {
        write(&format!("[dusky] {msg}"));
    }
    pub fn warn(msg: &str) {
        write(&format!("[dusky] aviso: {msg}"));
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_server_input as n;

    #[test]
    fn normaliza_enderecos() {
        assert_eq!(n("dusky.veneno.space").as_deref(), Some("https://dusky.veneno.space"));
        assert_eq!(n(" https://dusky.veneno.space/canal/1 ").as_deref(), Some("https://dusky.veneno.space"));
        assert_eq!(n("203.0.113.5").as_deref(), Some("http://203.0.113.5:3000"));
        assert_eq!(n("203.0.113.5:8080").as_deref(), Some("http://203.0.113.5:8080"));
        assert_eq!(n("localhost").as_deref(), Some("http://localhost:3000"));
        assert_eq!(n("ftp://x.com"), None);
        assert_eq!(n("semponto"), None);
        assert_eq!(n(""), None);
    }
}
