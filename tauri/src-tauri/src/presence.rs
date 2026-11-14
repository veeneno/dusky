//! "Jogando X" (rich presence): descobre qual jogo está aberto neste computador e avisa o site, que
//! mostra pros amigos (lista de membros e cartão de perfil). Porte do electron/presence.js — mesma
//! API pro site (window.duskyDesktop.presence) e mesmas regras.
//!
//! Como um jogo é reconhecido, nesta ordem:
//!   1. jogos que a própria pessoa cadastrou (configurações → app → atividade): nome do executável
//!   2. uma lista pequena de jogos conhecidos que não são da Steam (KNOWN, abaixo)
//!   3. qualquer programa rodando de dentro de .../steamapps/common/<pasta>/ — o nome certo vem do
//!      appmanifest da Steam; se não der pra ler, usa o nome da pasta
//!
//! Lista de programas: Linux lê /proc/<pid>/cmdline (inclusive jogos do Wine/Proton, que aparecem
//! com o caminho do .exe); Windows pergunta pro sistema (Toolhelp + caminho completo de cada um) —
//! sem abrir PowerShell como o Electron fazia.
//!
//! Privacidade: a lista de programas abertos nunca sai deste processo. Pro site vai só o NOME do
//! jogo detectado (e, quando a pessoa abre "adicionar jogo", os candidatos pra ela escolher). Com a
//! opção desligada, nada é lido nem enviado.

use crate::app;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Webview};

const SCAN_EVERY: Duration = Duration::from_secs(15);

/// executável (minúsculo, sem .exe) -> nome mostrado
const KNOWN: &[(&str, &str)] = &[
    ("valorant-win64-shipping", "VALORANT"),
    ("league of legends", "League of Legends"),
    ("leagueclientux", "League of Legends"),
    ("fortniteclient-win64-shipping", "Fortnite"),
    ("robloxplayerbeta", "Roblox"),
    ("minecraft.windows", "Minecraft"),
    ("gta5", "Grand Theft Auto V"),
    ("gta5_enhanced", "Grand Theft Auto V"),
    ("overwatch", "Overwatch 2"),
    ("r5apex", "Apex Legends"),
    ("r5apex_dx12", "Apex Legends"),
    ("rocketleague", "Rocket League"),
    ("cs2", "Counter-Strike 2"),
    ("dota2", "Dota 2"),
    ("osu!", "osu!"),
    ("genshinimpact", "Genshin Impact"),
    ("starrail", "Honkai: Star Rail"),
    ("wow", "World of Warcraft"),
    ("diablo iv", "Diablo IV"),
    ("hearthstone", "Hearthstone"),
    ("eldenring", "ELDEN RING"),
    ("rainbowsix", "Rainbow Six Siege"),
    ("cod", "Call of Duty"),
    ("modernwarfare", "Call of Duty"),
    ("eafc25", "EA SPORTS FC 25"),
    ("fc26", "EA SPORTS FC 26"),
    ("pathofexile", "Path of Exile"),
    ("pathofexile_x64", "Path of Exile"),
    ("terraria", "Terraria"),
    ("stardew valley", "Stardew Valley"),
    ("among us", "Among Us"),
];

/// pastas de steamapps/common que não são jogo (começo do nome, minúsculo)
const STEAM_NOT_GAMES: &[&str] = &["proton", "steamlinuxruntime", "steam linux runtime", "steamworks", "steam controller", "steamvr"];

/// nomes de pasta da Steam que não batem com o nome do jogo (só usados se o appmanifest não abrir)
const STEAM_FOLDER_ALIASES: &[(&str, &str)] = &[("counter-strike global offensive", "Counter-Strike 2"), ("dota 2 beta", "Dota 2")];

/// programas que não são jogo (pra lista de "adicionar jogo" e pra Steam)
const NOT_GAME_EXACT: &[&str] = &[
    "steam", "steamwebhelper", "steamservice", "wineserver", "wine", "wine64", "wine-preloader", "wine64-preloader", "services",
    "explorer", "winedevice", "plugplay", "rpcss", "svchost", "conhost", "start", "cmd", "electron", "dusky", "didiscord", "chrome",
    "chromium", "firefox", "code", "node", "bash", "zsh", "fish", "sh", "python", "python3", "java", "javaw", "discord", "spotify",
    "gamescope", "mangohud", "gamemoded", "reaper", "steam-launch-wrapper", "crashhandler", "crashpad_handler", "riotclientservices",
    "riotclientux", "riotclientuxrender", "riotclientcrashhandler", "epicgameslauncher", "epicwebhelper", "unitycrashhandler64",
    "msedgewebview2", "webkitwebprocess", "webkitnetworkprocess",
];
const NOT_GAME_PREFIX: &[&str] = &[
    "pressure-vessel", "easyanticheat", "battleye", "gldriverquery", "vulkandriverquery", "xdg-", "dbus-", "dusky-", "didiscord-",
];

fn not_game(key: &str) -> bool {
    NOT_GAME_EXACT.contains(&key)
        || NOT_GAME_PREFIX.iter().any(|p| key.starts_with(p))
        || (key.starts_with("python") && key[6..].chars().all(|c| c.is_ascii_digit() || c == '.'))
}

/// caminho do executável -> chave: nome do arquivo, minúsculo, sem .exe
pub fn exe_key(p: &str) -> String {
    let p = p.replace('\\', "/");
    let base = p.rsplit('/').next().unwrap_or("").to_lowercase();
    base.strip_suffix(".exe").map(str::to_string).unwrap_or(base)
}

/// caminho como o processo escreveu -> caminho que dá pra abrir aqui (no Wine, Z:\home\x vira /home/x)
fn to_local_path(p: &str) -> String {
    let s = p.replace('\\', "/");
    if cfg!(windows) {
        return s;
    }
    if s.len() >= 2 && s.as_bytes()[1] == b':' && (s.starts_with('z') || s.starts_with('Z')) {
        return s[2..].to_string();
    }
    s
}

fn clean_name(name: &str) -> String {
    let s: String = name.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    s.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(64).collect()
}

// ---------- programas abertos ----------

#[derive(Clone)]
struct Proc {
    exe: String,
    /// resto da linha de comando (só no Linux)
    args: String,
}

#[cfg(target_os = "linux")]
fn list_processes() -> Vec<Proc> {
    let mut out = Vec::new();
    let Ok(dir) = std::fs::read_dir("/proc") else { return out };
    for entry in dir.flatten() {
        let name = entry.file_name();
        let Some(pid) = name.to_str() else { continue };
        if !pid.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let Ok(raw) = std::fs::read(format!("/proc/{pid}/cmdline")) else { continue }; // acabou no meio
        if raw.is_empty() {
            continue; // thread do kernel
        }
        let argv: Vec<String> = raw.split(|b| *b == 0).filter(|a| !a.is_empty()).map(|a| String::from_utf8_lossy(a).into_owned()).collect();
        if let Some(first) = argv.first() {
            out.push(Proc { exe: first.clone(), args: argv[1..argv.len().min(12)].join(" ") });
        }
    }
    out
}

#[cfg(windows)]
fn list_processes() -> Vec<Proc> {
    use std::collections::HashSet;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE || snap.is_null() {
            return out;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap, &mut entry) != 0;
        while ok {
            let pid = entry.th32ProcessID;
            let mut path = None;
            if pid != 0 {
                let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if !h.is_null() {
                    let mut buf = [0u16; 1024];
                    let mut len = buf.len() as u32;
                    if QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len) != 0 {
                        path = Some(String::from_utf16_lossy(&buf[..len as usize]));
                    }
                    CloseHandle(h);
                }
            }
            // sem permissão pro caminho (processo de sistema/elevado): fica só o nome do executável
            let exe = path.unwrap_or_else(|| {
                let n = entry.szExeFile.iter().position(|c| *c == 0).unwrap_or(entry.szExeFile.len());
                String::from_utf16_lossy(&entry.szExeFile[..n])
            });
            if !exe.is_empty() && seen.insert(exe.to_lowercase()) {
                out.push(Proc { exe, args: String::new() });
            }
            ok = Process32NextW(snap, &mut entry) != 0;
        }
        CloseHandle(snap);
    }
    out
}

#[cfg(not(any(target_os = "linux", windows)))]
fn list_processes() -> Vec<Proc> {
    Vec::new() // macOS: por enquanto sem detecção
}

// ---------- Steam ----------

/// pasta steamapps -> (quando leu, installdir minúsculo -> nome)
type SteamCache = HashMap<String, (Instant, HashMap<String, String>)>;

fn steam_library_names(cache: &mut SteamCache, steamapps: &str) -> HashMap<String, String> {
    if let Some((at, names)) = cache.get(steamapps) {
        if at.elapsed() < Duration::from_secs(600) {
            return names.clone();
        }
    }
    let mut names = HashMap::new();
    if let Ok(dir) = std::fs::read_dir(steamapps) {
        for entry in dir.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            if !(file.starts_with("appmanifest_") && file.ends_with(".acf")) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(entry.path()) else { continue };
            if let (Some(name), Some(dir)) = (acf_value(&text, "name"), acf_value(&text, "installdir")) {
                names.insert(dir.to_lowercase(), name);
            }
        }
    }
    cache.insert(steamapps.to_string(), (Instant::now(), names.clone()));
    names
}

/// "chave"   "valor" de um appmanifest da Steam
fn acf_value(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    for line in text.lines() {
        let l = line.trim();
        if let Some(rest) = l.strip_prefix(&needle) {
            let rest = rest.trim();
            if let Some(v) = rest.strip_prefix('"').and_then(|r| r.split('"').next()) {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn steam_game_of(cache: &mut SteamCache, exe: &str) -> Option<String> {
    let local = to_local_path(exe);
    let lower = local.to_lowercase();
    let idx = lower.find("/steamapps/common/")?;
    let steamapps = &local[..idx + "/steamapps".len()];
    let rest = &local[idx + "/steamapps/common/".len()..];
    let folder = rest.split('/').next()?;
    if folder.is_empty() || !rest.contains('/') {
        return None;
    }
    let folder_l = folder.to_lowercase();
    if STEAM_NOT_GAMES.iter().any(|p| folder_l.starts_with(p)) {
        return None;
    }
    let names = steam_library_names(cache, steamapps);
    Some(
        names
            .get(&folder_l)
            .cloned()
            .or_else(|| STEAM_FOLDER_ALIASES.iter().find(|(k, _)| *k == folder_l).map(|(_, v)| v.to_string()))
            .unwrap_or_else(|| folder.to_string()),
    )
}

// ---------- detecção ----------

struct Found {
    rank: u8,
    name: String,
}

fn detect(procs: &[Proc], custom: &HashMap<String, String>, steam: &mut SteamCache) -> Vec<Found> {
    let mut found = Vec::new();
    for p in procs {
        let key = exe_key(&p.exe);
        if key.is_empty() {
            continue;
        }
        if let Some(name) = custom.get(&key) {
            found.push(Found { rank: 0, name: clean_name(name) });
            continue;
        }
        if let Some((_, name)) = KNOWN.iter().find(|(k, _)| *k == key) {
            found.push(Found { rank: 1, name: name.to_string() });
            continue;
        }
        // Minecraft (Java): o executável é só "java"; o que entrega é a linha de comando / o caminho
        if (key == "java" || key == "javaw") && format!("{} {}", p.exe, p.args).to_lowercase().contains("minecraft") {
            found.push(Found { rank: 1, name: "Minecraft".into() });
            continue;
        }
        if !not_game(&key) {
            if let Some(name) = steam_game_of(steam, &p.exe) {
                found.push(Found { rank: 2, name: clean_name(&name) });
            }
        }
    }
    found.retain(|f| !f.name.is_empty());
    found.sort_by_key(|f| f.rank);
    found
}

#[derive(Serialize, Clone)]
pub struct Candidate {
    exe: String,
    label: String,
}

/// programas que PODEM ser um jogo, pra pessoa escolher em "adicionar jogo"
fn candidates(procs: &[Proc]) -> Vec<Candidate> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default().replace('\\', "/").to_lowercase();
    let mut seen: HashMap<String, Candidate> = HashMap::new();
    for p in procs {
        let key = exe_key(&p.exe);
        if key.is_empty() || not_game(&key) || seen.contains_key(&key) {
            continue;
        }
        let local = to_local_path(&p.exe).to_lowercase();
        let plausible = if cfg!(windows) {
            // precisa do caminho completo (processos sem permissão vêm só com o nome)
            local.contains('/')
                && !(local.len() > 3 && local[1..].starts_with(":/windows/"))
                && !["/microsoft/", "/windowsapps/", "/common files/"].iter().any(|d| local.contains(d))
        } else {
            // Linux: programa do Windows (Wine/Proton) ou algo rodando fora das pastas do sistema
            let ok = p.exe.to_lowercase().ends_with(".exe")
                || (!home.is_empty() && local.starts_with(&format!("{home}/")))
                || ["/opt/", "/mnt/", "/media/", "/run/media/", "/games/"].iter().any(|d| local.starts_with(d));
            let noise = ["/.cache/", "/.config/", "/.local/share/applications/", "/.local/share/icons/", "/node_modules/", "/.vscode/", "/.cargo/", "/.rustup/", "/.nvm/"];
            ok && !noise.iter().any(|d| local.contains(d))
        };
        if !plausible {
            continue;
        }
        let label = p.exe.replace('\\', "/").rsplit('/').next().unwrap_or("").to_string();
        seen.insert(key.clone(), Candidate { exe: key, label });
    }
    let mut list: Vec<Candidate> = seen.into_values().collect();
    list.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    list.truncate(80);
    list
}

// ---------- ciclo ----------

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    name: String,
    started_at: u64,
}

#[derive(Default)]
pub struct Presence {
    gen: AtomicU64,
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    enabled: bool,
    custom: HashMap<String, String>,
    current: Option<Activity>,
    steam: SteamCache,
}

impl Presence {
    pub fn stop(&self) {
        self.gen.fetch_add(1, Ordering::SeqCst);
        let mut inner = self.inner.lock().unwrap();
        inner.enabled = false;
        inner.current = None;
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn publish(app: &AppHandle, next: Option<Activity>) {
    let presence = app.state::<Presence>();
    let changed = {
        let mut inner = presence.inner.lock().unwrap();
        let same = match (&inner.current, &next) {
            (Some(a), Some(b)) => a.name == b.name,
            (None, None) => true,
            _ => false,
        };
        inner.current = next.clone();
        !same
    };
    if changed {
        app::emit_to_main(app, "presence:activity", &next);
    }
}

async fn scan(app: &AppHandle) {
    let procs = tauri::async_runtime::spawn_blocking(list_processes).await.unwrap_or_default();
    let presence = app.state::<Presence>();
    let (found, current) = {
        let mut inner = presence.inner.lock().unwrap();
        if !inner.enabled {
            return;
        }
        let custom = inner.custom.clone();
        let found = detect(&procs, &custom, &mut inner.steam);
        (found, inner.current.clone())
    };
    // o jogo que já estava sendo mostrado continua enquanto estiver aberto (não fica trocando
    // quando tem dois abertos); senão vale o primeiro achado
    if let Some(cur) = &current {
        if found.iter().any(|f| f.name == cur.name) {
            return;
        }
    }
    publish(app, found.first().map(|f| Activity { name: f.name.clone(), started_at: now_ms() }));
}

#[derive(Deserialize, Default)]
pub struct PresenceConfig {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    custom: Vec<CustomGame>,
}

#[derive(Deserialize)]
struct CustomGame {
    #[serde(default)]
    exe: String,
    #[serde(default)]
    name: String,
}

// ---------- comandos do site ----------

/// { enabled, custom: [{ exe, name }] } — desligado = não lê nem envia nada
#[tauri::command]
pub fn presence_configure(app: AppHandle, webview: Webview, cfg: PresenceConfig) {
    if app::require_site(&app, &webview).is_err() {
        return;
    }
    let presence = app.state::<Presence>();
    let gen = presence.gen.fetch_add(1, Ordering::SeqCst) + 1;
    let enabled = cfg.enabled;
    {
        let mut inner = presence.inner.lock().unwrap();
        inner.custom = cfg
            .custom
            .iter()
            .take(100)
            .filter_map(|g| {
                let key = exe_key(&g.exe);
                let name = clean_name(&g.name);
                (!key.is_empty() && !name.is_empty()).then_some((key, name))
            })
            .collect();
        inner.enabled = enabled;
        // reavalia do zero: a lista de jogos pode ter mudado
        if enabled {
            inner.current = None;
        }
    }
    if !enabled {
        publish(&app, None);
        return;
    }
    tauri::async_runtime::spawn(async move {
        let presence = app.state::<Presence>();
        while presence.gen.load(Ordering::SeqCst) == gen {
            scan(&app).await;
            tokio::time::sleep(SCAN_EVERY).await;
        }
    });
}

/// [{ exe, label }] programas abertos que podem ser um jogo (pra "adicionar jogo")
#[tauri::command]
pub async fn presence_candidates(app: AppHandle, webview: Webview) -> Result<Vec<Candidate>, String> {
    app::require_site(&app, &webview)?;
    let procs = tauri::async_runtime::spawn_blocking(list_processes).await.unwrap_or_default();
    Ok(candidates(&procs))
}

/// { name, startedAt } | null
#[tauri::command]
pub fn presence_current(app: AppHandle, webview: Webview) -> Option<Activity> {
    app::require_site(&app, &webview).ok()?;
    app.state::<Presence>().inner.lock().unwrap().current.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chaves_e_caminhos() {
        assert_eq!(exe_key("C:\\Games\\VALORANT-Win64-Shipping.exe"), "valorant-win64-shipping");
        assert_eq!(exe_key("/usr/bin/java"), "java");
        assert!(not_game("python3.12"));
        assert!(not_game("dusky-screencast"));
        assert!(!not_game("hl2_linux"));
    }

    #[test]
    fn steam_e_conhecidos() {
        let dir = std::env::temp_dir().join(format!("dusky-presence-{}", std::process::id()));
        let common = dir.join("steamapps/common/Hollow Knight");
        std::fs::create_dir_all(&common).unwrap();
        std::fs::write(dir.join("steamapps/appmanifest_367520.acf"), "\"AppState\"\n{\n\t\"name\"\t\t\"Hollow Knight\"\n\t\"installdir\"\t\t\"Hollow Knight\"\n}\n").unwrap();
        let exe = format!("{}/hollow_knight.x86_64", common.display());
        let procs = vec![
            Proc { exe: exe.clone(), args: String::new() },
            Proc { exe: "/usr/bin/java".into(), args: "-cp net.minecraft.client.Main".into() },
        ];
        let mut cache = SteamCache::new();
        let found = detect(&procs, &HashMap::new(), &mut cache);
        assert_eq!(found[0].name, "Minecraft"); // conhecido vem antes da Steam
        assert_eq!(found[1].name, "Hollow Knight");
        let mut custom = HashMap::new();
        custom.insert("hollow_knight.x86_64".to_string(), "HK".to_string());
        assert_eq!(detect(&procs, &custom, &mut cache)[0].name, "HK");
        let _ = std::fs::remove_dir_all(dir);
    }
}
