//! Atalhos GLOBAIS: funcionam com o dusky em segundo plano (no jogo), igual ao Discord.
//!
//! O site (public/js/app/30-shortcuts.js) manda a lista — mutar, ensurdecer, apertar pra falar —
//! com as teclas escolhidas, e recebe de volta `shortcut` { id, down } quando a tecla é apertada
//! (down: true) e solta (down: false). Quem decide o que cada um faz é o site.
//!
//!   - Windows e Linux X11: tauri-plugin-global-shortcut (o sistema reserva a combinação pro dusky).
//!   - Linux Wayland: o Wayland não deixa um app ler o teclado dos outros. O caminho é o portal
//!     GlobalShortcuts do sistema (KDE, GNOME 48+, Hyprland): o app diz QUAIS atalhos existem e a
//!     tecla sugerida; quem liga a tecla é o sistema — no KDE/GNOME aparece uma janela pra
//!     confirmar; no Hyprland a pessoa liga no hyprland.conf
//!     (`bind = CTRL SHIFT, M, global, <nome mostrado em hyprctl globalshortcuts>`).

use crate::app;
use crate::server::log;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Webview};

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutSpec {
    /// mutar | ensurdecer | falar
    pub id: String,
    /// "Ctrl+Shift+KeyM" (modificadores + o `code` da tecla, como no KeyboardEvent)
    pub accel: String,
    /// texto pro sistema mostrar (Wayland)
    #[serde(default)]
    pub description: String,
}

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutsStatus {
    /// hotkey | portal | none
    pub backend: &'static str,
    /// ids ligados de verdade
    pub active: Vec<String>,
    pub errors: Vec<String>,
    /// [id, tecla que o sistema diz que liga] (Wayland)
    pub bound: Vec<(String, String)>,
    /// explicação pra mostrar nas configurações
    pub hint: Option<String>,
}

pub fn is_wayland() -> bool {
    cfg!(target_os = "linux")
        && (std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland") || std::env::var_os("WAYLAND_DISPLAY").is_some())
}

/// o plugin de atalhos só entra fora do Wayland (lá ele precisaria do X11 e não pegaria as teclas)
pub fn use_hotkey_plugin() -> bool {
    !is_wayland()
}

fn emit(app: &AppHandle, id: &str, down: bool) {
    app::emit_to_main(app, "shortcut", &json!({ "id": id, "down": down }));
}

fn sanitize(list: Vec<ShortcutSpec>) -> Vec<ShortcutSpec> {
    let mut out: Vec<ShortcutSpec> = Vec::new();
    for s in list.into_iter().take(8) {
        let id_ok = !s.id.is_empty() && s.id.len() <= 24 && s.id.chars().all(|c| c.is_ascii_lowercase() || c == '-');
        let accel: String = s.accel.trim().chars().take(64).collect();
        if !id_ok || accel.is_empty() || out.iter().any(|o| o.id == s.id) {
            continue;
        }
        let description: String = s.description.chars().take(80).collect();
        out.push(ShortcutSpec { id: s.id, accel, description });
    }
    out
}

/// troca a lista de atalhos globais (lista vazia = desliga todos)
#[tauri::command]
pub async fn shortcuts_configure(app: AppHandle, webview: Webview, list: Vec<ShortcutSpec>) -> ShortcutsStatus {
    if app::require_site(&app, &webview).is_err() {
        return ShortcutsStatus { backend: "none", ..Default::default() };
    }
    let list = sanitize(list);
    #[cfg(target_os = "linux")]
    if is_wayland() {
        return portal::configure(&app, list).await;
    }
    hotkey::configure(&app, list)
}

// ------------------------------------------------------------------ Windows / X11

mod hotkey {
    use super::*;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    /// "Ctrl+Shift+KeyM" -> o formato do plugin ("control+shift+KeyM")
    fn to_plugin(accel: &str) -> String {
        accel
            .split('+')
            .map(|p| match p.to_ascii_lowercase().as_str() {
                "ctrl" | "control" => "control".to_string(),
                "shift" => "shift".to_string(),
                "alt" => "alt".to_string(),
                "meta" | "super" | "win" => "super".to_string(),
                _ => p.to_string(),
            })
            .collect::<Vec<_>>()
            .join("+")
    }

    pub fn configure(app: &AppHandle, list: Vec<ShortcutSpec>) -> ShortcutsStatus {
        if !use_hotkey_plugin() {
            return ShortcutsStatus { backend: "none", ..Default::default() };
        }
        let gs = app.global_shortcut();
        if let Err(err) = gs.unregister_all() {
            log::warn(&format!("atalhos: não consegui soltar os antigos: {err}"));
        }
        let mut status = ShortcutsStatus { backend: "hotkey", ..Default::default() };
        for spec in list {
            let shortcut: Shortcut = match to_plugin(&spec.accel).parse() {
                Ok(s) => s,
                Err(err) => {
                    status.errors.push(format!("{}: tecla não reconhecida ({err})", spec.accel));
                    continue;
                }
            };
            let handle = app.clone();
            let id = spec.id.clone();
            let registered = gs.on_shortcut(shortcut, move |_app, _shortcut, event| {
                emit(&handle, &id, event.state() == ShortcutState::Pressed);
            });
            match registered {
                Ok(()) => status.active.push(spec.id),
                // normalmente: outro programa já reservou essa combinação
                Err(err) => status.errors.push(format!("{}: em uso por outro programa? ({err})", spec.accel)),
            }
        }
        if !status.active.is_empty() {
            log::info(&format!("atalhos globais: {}", status.active.join(", ")));
        }
        status
    }
}

// ------------------------------------------------------------------ Wayland (portal)

#[cfg(target_os = "linux")]
mod portal {
    use super::*;
    use ashpd::desktop::global_shortcuts::{BindShortcutsOptions, GlobalShortcuts, NewShortcut};
    use ashpd::desktop::{CreateSessionOptions, Session};
    use futures_util::StreamExt;
    use tokio::sync::Mutex;

    struct Active {
        session: Session<GlobalShortcuts>,
        task: tauri::async_runtime::JoinHandle<()>,
    }

    static ACTIVE: Mutex<Option<Active>> = Mutex::const_new(None);

    /// "Ctrl+Shift+KeyM" -> "CTRL+SHIFT+m" (formato da especificação "shortcuts" do XDG)
    fn to_xdg(accel: &str) -> Option<String> {
        let mut out: Vec<String> = Vec::new();
        for p in accel.split('+') {
            let piece = match p.to_ascii_lowercase().as_str() {
                "ctrl" | "control" => "CTRL".to_string(),
                "shift" => "SHIFT".to_string(),
                "alt" => "ALT".to_string(),
                "meta" | "super" | "win" => "LOGO".to_string(),
                _ => {
                    if let Some(k) = p.strip_prefix("Key") {
                        k.to_ascii_lowercase()
                    } else if let Some(d) = p.strip_prefix("Digit") {
                        d.to_string()
                    } else if let Some(n) = p.strip_prefix("Numpad").filter(|n| n.len() == 1) {
                        format!("KP_{n}")
                    } else {
                        match p {
                            "Space" => "space".into(),
                            "Backquote" => "grave".into(),
                            "CapsLock" => "Caps_Lock".into(),
                            "Tab" => "Tab".into(),
                            "Minus" => "minus".into(),
                            "Equal" => "equal".into(),
                            "Insert" | "Home" | "End" | "Pause" => p.into(),
                            "PageUp" => "Prior".into(),
                            "PageDown" => "Next".into(),
                            _ if p.len() <= 3 && p.starts_with('F') => p.into(), // F1..F24
                            _ => return None,
                        }
                    }
                }
            };
            out.push(piece);
        }
        Some(out.join("+"))
    }

    async fn close_active() {
        if let Some(old) = ACTIVE.lock().await.take() {
            old.task.abort();
            let _ = old.session.close().await;
        }
    }

    pub async fn configure(app: &AppHandle, list: Vec<ShortcutSpec>) -> ShortcutsStatus {
        close_active().await;
        let mut status = ShortcutsStatus { backend: "portal", ..Default::default() };
        if list.is_empty() {
            return status;
        }
        match bind(app, &list, &mut status).await {
            Ok(()) => {}
            Err(err) => {
                log::info(&format!("atalhos globais (Wayland): {err}"));
                status.backend = "none";
                status.errors.push(err);
                status.hint = Some(
                    "o seu Wayland não tem o portal de atalhos globais (precisa do xdg-desktop-portal do KDE, GNOME 48+ ou Hyprland) — os atalhos funcionam só com o dusky na frente".into(),
                );
            }
        }
        status
    }

    async fn bind(app: &AppHandle, list: &[ShortcutSpec], status: &mut ShortcutsStatus) -> Result<(), String> {
        let proxy = GlobalShortcuts::new().await.map_err(|e| format!("portal indisponível: {e}"))?;
        let session = proxy.create_session(CreateSessionOptions::default()).await.map_err(|e| format!("não abriu a sessão: {e}"))?;
        let wanted: Vec<NewShortcut> = list
            .iter()
            .map(|s| {
                let desc = if s.description.is_empty() { s.id.clone() } else { s.description.clone() };
                NewShortcut::new(format!("dusky-{}", s.id), desc).preferred_trigger(to_xdg(&s.accel).as_deref())
            })
            .collect();
        let request = proxy
            .bind_shortcuts(&session, &wanted, None, BindShortcutsOptions::default())
            .await
            .map_err(|e| format!("o sistema recusou os atalhos: {e}"))?;
        let response = request.response().map_err(|e| format!("os atalhos não foram confirmados: {e}"))?;
        for s in response.shortcuts() {
            let id = s.id().trim_start_matches("dusky-").to_string();
            status.bound.push((id.clone(), s.trigger_description().to_string()));
            status.active.push(id);
        }
        if std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_ascii_lowercase().contains("hyprland")
            || std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_some()
        {
            status.hint = Some(
                "no Hyprland a tecla é ligada no hyprland.conf: veja os nomes com `hyprctl globalshortcuts` e adicione, por exemplo, `bind = CTRL SHIFT, M, global, <nome do dusky-mutar>`".into(),
            );
        }

        let mut activated = proxy.receive_activated().await.map_err(|e| e.to_string())?;
        let mut deactivated = proxy.receive_deactivated().await.map_err(|e| e.to_string())?;
        let handle = app.clone();
        let task = tauri::async_runtime::spawn(async move {
            let _keep = proxy; // o proxy precisa viver enquanto os sinais chegam
            loop {
                tokio::select! {
                    Some(a) = activated.next() => {
                        if let Some(id) = a.shortcut_id().strip_prefix("dusky-") { emit(&handle, id, true); }
                    }
                    Some(d) = deactivated.next() => {
                        if let Some(id) = d.shortcut_id().strip_prefix("dusky-") { emit(&handle, id, false); }
                    }
                    else => break,
                }
            }
        });
        *ACTIVE.lock().await = Some(Active { session, task });
        log::info(&format!("atalhos globais (portal): {}", status.active.join(", ")));
        Ok(())
    }
}
