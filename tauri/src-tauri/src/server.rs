//! Endereço do servidor e preferências do app (server.json / prefs.json na pasta de dados).
//! Mesma regra do electron/main.js: endereço fixo por padrão, dá pra trocar pela tela de
//! "conectando…", e DIDISCORD_URL força um endereço (bom pra teste).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use url::Url;

pub const DEFAULT_URL: &str = "https://didiscord.veneno.space";

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

// ---------- preferências ----------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    /// fechar a janela só esconde (padrão) — desligado, fechar sai do app
    pub close_to_tray: bool,
    /// o aviso "continua rodando" já apareceu uma vez
    pub tray_hint_shown: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self { close_to_tray: true, tray_hint_shown: false }
    }
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

pub mod log {
    pub fn info(msg: &str) {
        eprintln!("[didiscord] {msg}");
    }
    pub fn warn(msg: &str) {
        eprintln!("[didiscord] aviso: {msg}");
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_server_input as n;

    #[test]
    fn normaliza_enderecos() {
        assert_eq!(n("didiscord.veneno.space").as_deref(), Some("https://didiscord.veneno.space"));
        assert_eq!(n(" https://didiscord.veneno.space/canal/1 ").as_deref(), Some("https://didiscord.veneno.space"));
        assert_eq!(n("203.0.113.5").as_deref(), Some("http://203.0.113.5:3000"));
        assert_eq!(n("203.0.113.5:8080").as_deref(), Some("http://203.0.113.5:8080"));
        assert_eq!(n("localhost").as_deref(), Some("http://localhost:3000"));
        assert_eq!(n("ftp://x.com"), None);
        assert_eq!(n("semponto"), None);
        assert_eq!(n(""), None);
    }
}
