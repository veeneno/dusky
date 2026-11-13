//! Ícone na bandeja (perto do relógio).
//!
//! Com a janela escondida o app segue vivo: a call continua, as mensagens chegam e os sons tocam.
//! O menu traz a janela de volta, troca o status (ativo/inativo, o mesmo do menu do avatar no site),
//! liga/desliga "continuar rodando ao fechar", troca o servidor e tem o "Sair" de verdade.
//! Linux com GNOME: o ícone só aparece com a extensão "AppIndicator" — sem ela, abrir o didiscord
//! de novo (pelo menu de apps) traz a janela escondida de volta (plugin single-instance).

use crate::app::{self, AppState};
use crate::server;
use std::sync::atomic::Ordering;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

pub struct TrayItems {
    icon: TrayIcon<Wry>,
    online: CheckMenuItem<Wry>,
    idle: CheckMenuItem<Wry>,
    close_to_tray: CheckMenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let st = app.state::<AppState>();
    let close_to_tray_on = st.prefs.lock().unwrap().close_to_tray;

    let open = MenuItem::with_id(app, "open", "Abrir didiscord", true, None::<&str>)?;
    let online = CheckMenuItem::with_id(app, "online", "🟢  Ativo", true, true, None::<&str>)?;
    let idle = CheckMenuItem::with_id(app, "idle", "🌙  Inativo", true, false, None::<&str>)?;
    let close_to_tray = CheckMenuItem::with_id(app, "closeToTray", "Continuar rodando ao fechar a janela", true, close_to_tray_on, None::<&str>)?;
    let reload = MenuItem::with_id(app, "reload", "Recarregar", true, None::<&str>)?;
    let change = MenuItem::with_id(app, "changeServer", "Mudar endereço do servidor…", !st.fixed_by_env, None::<&str>)?;
    let version = MenuItem::with_id(app, "version", format!("didiscord {} (Tauri)", env!("CARGO_PKG_VERSION")), false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair do didiscord", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::with_items(
        app,
        &[&open, &sep()?, &online, &idle, &sep()?, &close_to_tray, &reload, &change, &sep()?, &version, &quit],
    )?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("didiscord")
        .menu(&menu)
        // Windows: clique esquerdo abre a janela, direito abre o menu (no Linux o clique sempre abre o menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                app::show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let icon = builder.build(app)?;

    *st.tray.lock().unwrap() = Some(TrayItems { icon, online, idle, close_to_tray });
    refresh(app);
    Ok(())
}

fn on_menu(app: &AppHandle, id: &str) {
    let st = app.state::<AppState>();
    match id {
        "open" => app::show_main(app),
        "online" | "idle" => {
            // já mostra na bandeja; o site confirma com status_report
            *st.status.lock().unwrap() = id.to_string();
            app::emit_to_main(app, "status:set", &id);
            refresh(app);
        }
        "closeToTray" => {
            let mut prefs = st.prefs.lock().unwrap();
            prefs.close_to_tray = !prefs.close_to_tray;
            server::save_prefs(&st.data_dir, &prefs);
            drop(prefs);
            refresh(app);
        }
        "reload" => {
            if let Some(win) = app.get_webview_window(app::MAIN) {
                let _ = win.reload();
            }
        }
        "changeServer" => {
            app::show_main(app);
            app::spawn_connect(app.clone(), "change");
        }
        "quit" => app::quit_for_real(app),
        _ => {}
    }
}

/// atualiza as marcas do menu e o texto do ícone (status + menções)
pub fn refresh(app: &AppHandle) {
    let st = app.state::<AppState>();
    let status = st.status.lock().unwrap().clone();
    let close_to_tray = st.prefs.lock().unwrap().close_to_tray;
    let mentions = st.mentions.load(Ordering::SeqCst);
    let guard = st.tray.lock().unwrap();
    let Some(t) = guard.as_ref() else { return };
    let _ = t.online.set_checked(status == "online");
    let _ = t.idle.set_checked(status == "idle");
    let _ = t.close_to_tray.set_checked(close_to_tray);
    let prefix = match mentions {
        0 => String::new(),
        n if n > 99 => "(99+) ".into(),
        n => format!("({n}) "),
    };
    let label = if status == "idle" { "inativo" } else { "ativo" };
    let _ = t.icon.set_tooltip(Some(format!("{prefix}didiscord — {label}")));
}
