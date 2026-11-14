//! Atualização automática (tauri-plugin-updater, pacote assinado).
//!
//! As versões novas ficam no próprio servidor do dusky, na pasta downloads/ (fora do git), que o
//! `npm run release` da pasta tauri/ preenche: o instalador/AppImage + a assinatura + latest.json.
//! O endereço acompanha o servidor escolhido (https://<servidor>/downloads/latest.json), igual
//! ao app Electron fazia com o latest.yml.
//!
//! Fluxo: confere 20 s depois de abrir e a cada 3 h. Achou versão nova: baixa em segundo plano e
//! pergunta se quer reiniciar agora. "Depois" deixa a versão baixada guardada: no Linux ela é
//! instalada ao sair do app (troca o AppImage, sem perguntar nada); no Windows, na próxima vez que a
//! pessoa escolher reiniciar (bandeja → "Reiniciar pra atualizar"). O botão "procurar atualizações"
//! das configurações do site e o item da bandeja fazem a mesma conferência, mas avisando também
//! quando já está na versão mais nova ou quando deu erro.

use crate::app::{self, AppState};
use crate::server::log;
use crate::tray;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, Url, Webview};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(20);
const EVERY: Duration = Duration::from_secs(3 * 60 * 60);

#[derive(Default)]
pub struct Updates {
    busy: AtomicBool,
    /// versão já baixada esperando o reinício
    pending: Mutex<Option<(Update, Vec<u8>)>>,
}

impl Updates {
    pub fn pending_version(&self) -> Option<String> {
        self.pending.lock().unwrap().as_ref().map(|(u, _)| u.version.clone())
    }
}

/// liga a conferência automática (não roda no modo dev nem com o servidor fixado por variável)
pub fn start(app: &AppHandle) {
    let st = app.state::<AppState>();
    if st.dev || cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            check(app.clone(), false).await;
            tokio::time::sleep(EVERY).await;
        }
    });
}

fn endpoint(app: &AppHandle) -> Option<Url> {
    let site = app.state::<AppState>().site();
    if site.is_empty() {
        return None;
    }
    Url::parse(&format!("{site}/downloads/latest.json")).ok()
}

fn info(app: &AppHandle, text: String) {
    app.dialog().message(text).title("dusky").kind(MessageDialogKind::Info).show(|_| {});
}

/// procura, baixa e pergunta. `manual`: a pessoa clicou em "procurar atualizações".
pub async fn check(app: AppHandle, manual: bool) {
    let updates = app.state::<Updates>();
    if let Some(v) = updates.pending_version() {
        // já tem uma baixada: só pergunta de novo
        ask_restart(&app, &v);
        return;
    }
    if updates.busy.swap(true, Ordering::SeqCst) {
        if manual {
            info(&app, "Já estou procurando atualizações — aguarde um pouco.".into());
        }
        return;
    }
    let result = find_and_download(&app).await;
    updates.busy.store(false, Ordering::SeqCst);
    match result {
        Ok(Some(version)) => {
            tray::refresh(&app);
            ask_restart(&app, &version);
        }
        Ok(None) => {
            if manual {
                info(&app, format!("O dusky já está na versão mais nova.\n\n{} ({})", app::version_label(), env!("CARGO_PKG_VERSION")));
            }
        }
        Err(err) => {
            log::warn(&format!("[atualização] {err}"));
            if manual {
                app.dialog()
                    .message(format!("Não deu pra procurar atualizações agora.\n\n{err}"))
                    .title("dusky")
                    .kind(MessageDialogKind::Warning)
                    .show(|_| {});
            }
        }
    }
}

async fn find_and_download(app: &AppHandle) -> Result<Option<String>, String> {
    let url = endpoint(app).ok_or("nenhum servidor configurado")?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let version = update.version.clone();
    log::info(&format!("[atualização] baixando a versão {version}"));
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    log::info(&format!("[atualização] versão {version} baixada ({} MB)", bytes.len() / 1024 / 1024));
    *app.state::<Updates>().pending.lock().unwrap() = Some((update, bytes));
    Ok(Some(version))
}

fn ask_restart(app: &AppHandle, version: &str) {
    let handle = app.clone();
    app.dialog()
        .message(format!(
            "A versão {version} do dusky está pronta.\n\nReiniciar agora pra atualizar? (Se estiver numa call, ela cai e volta em seguida.)"
        ))
        .title("dusky — atualização")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("Reiniciar agora".into(), "Depois".into()))
        .show(move |now| {
            if now {
                install_and_restart(&handle);
            }
        });
}

/// instala a versão baixada e reabre o app
pub fn install_and_restart(app: &AppHandle) {
    let Some((update, bytes)) = app.state::<Updates>().pending.lock().unwrap().take() else { return };
    let st = app.state::<AppState>();
    st.quitting.store(true, Ordering::SeqCst);
    st.audio.stop();
    st.screencast.stop();
    st.call.leave();
    // Windows: roda o instalador (modo "passive": só uma barra de progresso) e fecha o app; o
    // instalador abre a versão nova no fim. Linux: troca o AppImage (ou o .deb) e reinicia aqui.
    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(err) => {
            st.quitting.store(false, Ordering::SeqCst);
            log::warn(&format!("[atualização] falhou ao instalar: {err}"));
            app.dialog()
                .message(format!("Não deu pra instalar a atualização.\n\n{err}\n\nBaixe a versão nova em {}/baixar", st.site()))
                .title("dusky")
                .kind(MessageDialogKind::Error)
                .show(|_| {});
        }
    }
}

/// Linux: versão baixada e a pessoa saiu sem reiniciar -> instala agora (só troca o arquivo)
pub fn install_on_exit(app: &AppHandle) {
    if !cfg!(target_os = "linux") {
        return;
    }
    if let Some((update, bytes)) = app.state::<Updates>().pending.lock().unwrap().take() {
        if let Err(err) = update.install(bytes) {
            log::warn(&format!("[atualização] não instalou ao sair: {err}"));
        }
    }
}

// ---------- comando do site (botão "procurar atualizações") ----------

#[tauri::command]
pub async fn update_check(app: AppHandle, webview: Webview) -> Result<(), String> {
    app::require_site(&app, &webview)?;
    check(app, true).await;
    Ok(())
}
