//! Janela principal, conexão com o servidor, ponte com o site e ciclo de vida do app.
//! É o equivalente do electron/main.js (menos o que foi pra tray.rs, picker.rs, screencast.rs e audio/).
//!
//! O app não sobe servidor nenhum: abre uma janela nativa apontando pro site hospedado. A tela local
//! ui/loading.html aparece enquanto o site não responde (e pra trocar o endereço do servidor).

use crate::server::{self, log, Prefs};
use crate::{audio, call, deps, picker, presence, screencast, shortcuts, tray, updater, webview_setup};
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::ipc::CapabilityBuilder;
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::webview::{NewWindowResponse, PermissionKind, PermissionResponse};
use tauri::{AppHandle, Manager, RunEvent, Url, Webview, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

pub const BRIDGE_JS: &str = include_str!("bridge.js");

/// codinome da versão (1.x = Mist)
pub const CODENAME: &str = "Mist";

/// "dusky Mist 1.0" — o nome que aparece nas configurações e na bandeja
pub fn version_label() -> String {
    let short: Vec<&str> = env!("CARGO_PKG_VERSION").split('.').take(2).collect();
    format!("dusky {CODENAME} {}", short.join("."))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    codename: &'static str,
    label: String,
    shell: &'static str,
    os: &'static str,
    /// aceleração de hardware e variáveis que pesam no WebGL (contador de fps do mundinho)
    gpu: serde_json::Value,
}

fn app_info() -> AppInfo {
    AppInfo {
        name: "dusky",
        version: env!("CARGO_PKG_VERSION"),
        codename: CODENAME,
        label: version_label(),
        shell: "tauri",
        os: std::env::consts::OS,
        gpu: webview_setup::diagnostics(),
    }
}

/// a ponte + se a call vai pelo Rust (Linux: o WebKitGTK não tem WebRTC)
pub fn bridge_script() -> String {
    #[allow(unused_mut)]
    let mut s = format!(
        "window.__DUSKY_NATIVE_CALL__ = {};\nwindow.__DUSKY_LOCAL_ORIGIN__ = {};\nwindow.__DUSKY_APP_INFO__ = {};\n{BRIDGE_JS}",
        cfg!(target_os = "linux"),
        serde_json::to_string(&local_base().origin().ascii_serialization()).unwrap(),
        serde_json::to_string(&app_info()).unwrap()
    );
    // só no modo debug: DUSKY_INJECT_JS=arquivo.js roda um script extra em toda página (testes)
    #[cfg(debug_assertions)]
    if let Some(extra) = server::env_var("INJECT_JS").and_then(|p| std::fs::read_to_string(p).ok()) {
        s.push('\n');
        s.push_str(&extra);
    }
    s
}
pub const MAIN: &str = "main";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectStatus {
    pub phase: String, // setup | change | connecting | loading | idle
    pub url: Option<String>,
    pub attempts: u32,
    pub since: u64,
    pub fixed_by_env: bool,
    /// estava no site e ele caiu (a tela de "conectando…" mostra "o servidor caiu")
    pub lost: bool,
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub dev: bool,
    pub fixed_by_env: bool,
    pub site_url: Mutex<String>,
    granted_sites: Mutex<HashSet<String>>,
    pub connect: Mutex<ConnectStatus>,
    connect_gen: AtomicU64,
    pub prefs: Mutex<Prefs>,
    pub status: Mutex<String>,
    pub mentions: AtomicI64,
    pub quitting: AtomicBool,
    pub http: reqwest::Client,
    pub picker: picker::PickerSlot,
    pub screencast: screencast::Screencast,
    pub audio: audio::ScreenAudio,
    pub call: call::Call,
    pub deps: deps::Deps,
    pub tray: Mutex<Option<tray::TrayItems>>,
}

impl AppState {
    pub fn site(&self) -> String {
        self.site_url.lock().unwrap().clone()
    }

    /// endereço é do servidor escolhido (ou localhost, no modo dev)?
    pub fn is_site(&self, url: &Url) -> bool {
        if self.dev && url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1")) {
            return true;
        }
        (url.scheme() == "https" || url.scheme() == "http") && url.origin().ascii_serialization() == self.site()
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// páginas do próprio app (pasta ui/): tauri://localhost no Linux, http://tauri.localhost no Windows
/// Endereço das páginas locais. No app instalado é tauri://localhost (Linux) ou
/// http://tauri.localhost (Windows); no `npm run dev` o CLI do Tauri serve a pasta ui/ num servidor
/// próprio (devUrl) e as páginas locais vêm de lá.
static LOCAL_BASE: std::sync::OnceLock<Url> = std::sync::OnceLock::new();

fn local_base() -> &'static Url {
    LOCAL_BASE.get_or_init(|| Url::parse(if cfg!(windows) { "http://tauri.localhost/" } else { "tauri://localhost/" }).unwrap())
}

fn init_local_base(app: &AppHandle) {
    #[allow(unused_mut)]
    let mut base = Url::parse(if cfg!(windows) { "http://tauri.localhost/" } else { "tauri://localhost/" }).unwrap();
    #[cfg(dev)]
    if let Some(dev) = app.config().build.dev_url.clone() {
        base = dev;
    }
    let _ = app;
    let _ = LOCAL_BASE.set(base);
}

pub fn is_local(url: &Url) -> bool {
    url.scheme() == "tauri"
        || url.host_str() == Some("tauri.localhost")
        || url.origin().ascii_serialization() == local_base().origin().ascii_serialization()
}

/// abre um link no navegador do sistema. Dentro do AppImage vai pelo xdg-open com o ambiente
/// limpo (screencast::system_child_env): o opener passaria GTK_PATH/GIO_MODULE_DIR/GST_* do
/// pacote pro navegador, que carregaria módulos do Ubuntu empacotados e podia nem abrir.
pub fn open_external(app: &AppHandle, url: &str) {
    if cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_some() {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(url).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        crate::screencast::clean_std_child_env(&mut cmd);
        if let Ok(mut child) = cmd.spawn() {
            // o xdg-open sai logo; espera numa thread pra não ficar processo zumbi
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            return;
        }
    }
    let _ = app.opener().open_url(url, None::<&str>);
}

pub fn local_url(path: &str) -> Url {
    local_base().join(path).unwrap()
}

/// a mesma página local, do jeito que o construtor de janelas quer
pub fn local_webview_url(path: &str) -> WebviewUrl {
    let url = local_url(path);
    if url.scheme() == "http" || url.scheme() == "https" {
        WebviewUrl::External(url)
    } else {
        WebviewUrl::CustomProtocol(url)
    }
}

/// manda um evento pra página (cai no window.__duskyEmit do bridge.js)
pub fn emit_js(name: &str, payload: &impl Serialize) -> String {
    let name = serde_json::to_string(name).unwrap();
    let payload = serde_json::to_string(payload).unwrap_or_else(|_| "null".into());
    format!("window.__duskyEmit&&window.__duskyEmit({name},{payload})")
}

pub fn emit_to_main(app: &AppHandle, name: &str, payload: &impl Serialize) {
    if let Some(win) = app.get_webview_window(MAIN) {
        let _ = win.eval(emit_js(name, payload));
    }
}

/// o pedido veio do site do dusky, na janela principal?
pub fn require_site(app: &AppHandle, webview: &Webview) -> Result<(), String> {
    let st = app.state::<AppState>();
    match webview.url() {
        Ok(url) if webview.label() == MAIN && st.is_site(&url) => Ok(()),
        _ => Err("origem não permitida".into()),
    }
}

pub fn require_local(webview: &Webview, label: &str) -> Result<(), String> {
    match webview.url() {
        Ok(url) if webview.label() == label && is_local(&url) => Ok(()),
        _ => Err("não permitido".into()),
    }
}

/// O site é remoto e o endereço muda em tempo de execução, então a permissão de chamar os comandos
/// do app é dada aqui (e não no capabilities/*.json, que é fixo na compilação).
fn grant_site(app: &AppHandle, origin: &str) {
    let st = app.state::<AppState>();
    let mut granted = st.granted_sites.lock().unwrap();
    if !granted.insert(origin.to_string()) {
        return;
    }
    let id = format!("site-{}", granted.len());
    let mut cap = CapabilityBuilder::new(id).remote(format!("{origin}/*")).window(MAIN);
    if st.dev {
        cap = cap.remote("http://localhost:*/*".into()).remote("http://127.0.0.1:*/*".into());
    }
    for p in [
        "allow-desktop-set-badge",
        "allow-desktop-focus",
        "allow-status-report",
        "allow-update-check",
        "allow-app-set-hardware-acceleration",
        "allow-app-open-logs",
        "allow-perf-snapshot",
        "allow-drop-files",
        "allow-drop-read",
        "allow-presence-configure",
        "allow-presence-candidates",
        "allow-presence-current",
        "allow-screen-audio-plan",
        "allow-screen-audio-stop",
        "allow-screencast-available",
        "allow-screencast-start",
        "allow-screencast-command",
        "allow-screencast-stop",
        "allow-call-join",
        "allow-call-leave",
        "allow-call-push-mic",
        "allow-call-pull",
        "allow-call-set-subscribed",
        "allow-call-pull-video",
        "allow-call-push-camera",
        "allow-call-stop-camera",
        "allow-call-stats",
        "allow-call-keyframe",
        "allow-call-log",
        "allow-call-screen-fallback",
        "allow-shortcuts-configure",
        // window.Notification da página (o plugin de notificação troca pela notificação do sistema)
        "notification:default",
    ] {
        cap = cap.permission(p);
    }
    if let Err(err) = app.add_capability(cap) {
        log::warn(&format!("não consegui liberar o site {origin}: {err}"));
    }
}

// ---------- janela principal ----------

fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let nav_app = app.clone();
    let open_app = app.clone();
    let perm_app = app.clone();

    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("loading.html".into()))
        .title("dusky")
        .inner_size(1280.0, 800.0)
        .min_inner_size(940.0, 560.0)
        .background_color(tauri::window::Color(30, 31, 34, 255))
        .initialization_script(bridge_script())
        // arrastar arquivos pra conversa: quem trata é a PÁGINA (eventos drop do HTML). Com o
        // tratamento nativo do Tauri ligado (o padrão), a janela engole o arquivo e o site nem vê.
        .disable_drag_drop_handler()
        // baixar arquivo: pergunta onde salvar (downloads.rs)
        .on_download(|webview, event| crate::downloads::on_download(webview, event))
        // a call não pode "dormir" com a janela minimizada ou escondida na bandeja
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        // navegação: só as telas locais e o domínio do dusky; o resto abre no navegador do sistema.
        // No Linux o WebKitGTK passa por aqui também a navegação dos iframes (embeds do YouTube etc.)
        // sem dizer se é a página ou um iframe, então lá só bloqueia o que não é web.
        .on_navigation(move |url| {
            let st = nav_app.state::<AppState>();
            if is_local(url) || st.is_site(url) || matches!(url.scheme(), "about" | "blob" | "data") {
                return true;
            }
            if cfg!(target_os = "linux") {
                return matches!(url.scheme(), "http" | "https");
            }
            if matches!(url.scheme(), "http" | "https") {
                open_external(&nav_app, url.as_str());
            }
            false
        })
        // target=_blank / window.open: sempre no navegador do sistema
        .on_new_window(move |url, _features| {
            if matches!(url.scheme(), "http" | "https") {
                open_external(&open_app, url.as_str());
            }
            NewWindowResponse::Deny
        })
        // mic, câmera, tela, notificações, pointer lock (mundinho 3D): liberado direto, só pro servidor
        .on_permission_request(move |webview, kind| {
            let st = perm_app.state::<AppState>();
            let from_site = webview.url().map(|u| st.is_site(&u)).unwrap_or(false);
            let wanted = matches!(
                kind,
                PermissionKind::Microphone
                    | PermissionKind::Camera
                    | PermissionKind::DisplayCapture
                    | PermissionKind::Notifications
                    | PermissionKind::PointerLock
                    | PermissionKind::Autoplay
                    | PermissionKind::WindowManagement
            );
            if wanted && from_site {
                PermissionResponse::Allow
            } else {
                PermissionResponse::Default
            }
        });

    #[cfg(windows)]
    {
        builder = builder.additional_browser_args(&webview_setup::browser_args());
    }

    let win = builder.build()?;
    webview_setup::configure(app, &win);
    Ok(win)
}

pub fn show_main(app: &AppHandle) {
    match app.get_webview_window(MAIN) {
        Some(win) => {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
        None => {
            if create_main_window(app).is_ok() {
                spawn_connect(app.clone(), "connect");
            }
        }
    }
}

pub fn quit_for_real(app: &AppHandle) {
    app.state::<AppState>().quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// primeira vez que a janela some: avisa que o app não fechou (senão parece que a call caiu à toa)
fn show_tray_hint_once(app: &AppHandle) {
    let st = app.state::<AppState>();
    {
        let mut prefs = st.prefs.lock().unwrap();
        if prefs.tray_hint_shown {
            return;
        }
        prefs.tray_hint_shown = true;
        server::save_prefs(&st.data_dir, &prefs);
    }
    let _ = app
        .notification()
        .builder()
        .title("dusky continua aberto")
        .body("Ele continua rodando na bandeja (calls, mensagens e sons seguem funcionando). Pra fechar de vez: botão direito no ícone → Sair do dusky.")
        .show();
}

// ---------- tela de loading + espera o site responder ----------

fn push_shell_status(app: &AppHandle) {
    let st = app.state::<AppState>();
    let status = st.connect.lock().unwrap().clone();
    if let Some(win) = app.get_webview_window(MAIN) {
        if win.url().map(|u| is_local(&u)).unwrap_or(false) {
            let _ = win.eval(emit_js("shell:status", &status));
        }
    }
}

pub fn spawn_connect(app: AppHandle, mode: &'static str) {
    tauri::async_runtime::spawn(async move { connect_to_site(app, mode).await });
}

/// mode: "connect" (normal), "lost" (o site caiu com a página aberta: igual ao connect, mas a tela
/// avisa), "setup" (nunca configurou) ou "change" (pediu pra trocar)
async fn connect_to_site(app: AppHandle, mode: &str) {
    let st = app.state::<AppState>();
    let gen = st.connect_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let site = st.site();
    let lost = mode == "lost";
    let mode = if site.is_empty() { "setup" } else if lost { "connect" } else { mode };
    *st.connect.lock().unwrap() = ConnectStatus {
        phase: if mode == "connect" { "connecting".into() } else { mode.into() },
        url: (!site.is_empty()).then(|| site.clone()),
        attempts: 0,
        since: now_ms(),
        fixed_by_env: st.fixed_by_env,
        lost,
    };
    let Some(win) = app.get_webview_window(MAIN) else { return };
    if !win.url().map(|u| is_local(&u)).unwrap_or(false) {
        let _ = win.navigate(local_url("loading.html"));
    } else {
        push_shell_status(&app);
    }
    if mode != "connect" {
        return; // fica esperando a pessoa digitar o endereço
    }

    let mut delay = 1000u64;
    loop {
        if st.connect_gen.load(Ordering::SeqCst) != gen {
            return;
        }
        if server::site_is_up(&st.http, &site).await {
            if st.connect_gen.load(Ordering::SeqCst) == gen {
                st.connect.lock().unwrap().phase = "loading".into();
                grant_site(&app, &site);
                if let (Some(win), Ok(url)) = (app.get_webview_window(MAIN), Url::parse(&site)) {
                    let _ = win.navigate(url);
                }
            }
            return;
        }
        st.connect.lock().unwrap().attempts += 1;
        push_shell_status(&app);
        tokio::time::sleep(Duration::from_millis(delay)).await;
        delay = (delay as f64 * 1.6).round().min(10_000.0) as u64;
    }
}

// ---------- site caiu com a página aberta ----------
//
// A página carregada não percebe sozinha que o servidor sumiu de vez (o chat fica parado e a call
// cai). Então, enquanto a janela está no site, o app confere o servidor a cada 15 s (um pedido
// pequeno, /api/version). Duas falhas seguidas (uns 30 s fora do ar, pra não piscar por causa de um
// soluço da rede) -> volta pra tela de "conectando…", que fica tentando e abre o site de novo
// quando ele voltar. No Linux o WebKitGTK ainda avisa na hora quando uma navegação pro site falha
// (recarregar com o servidor desligado) — ver webview_setup.rs.

const WATCH_EVERY: Duration = Duration::from_secs(15);
const WATCH_FAILS: u32 = 2;

fn main_on_site(app: &AppHandle) -> bool {
    let st = app.state::<AppState>();
    app.get_webview_window(MAIN).and_then(|w| w.url().ok()).map(|u| st.is_site(&u)).unwrap_or(false)
}

/// o site caiu: volta pra tela de "conectando…" (que reabre o site quando ele voltar)
pub fn site_lost(app: &AppHandle, why: &str) {
    if !main_on_site(app) {
        return;
    }
    log::warn(&format!("servidor fora do ar ({why}) — voltando pra tela de conectando"));
    // a página vai embora: nada do que ela comandava pode ficar rodando sozinho
    let st = app.state::<AppState>();
    st.call.leave();
    st.screencast.stop();
    st.audio.stop();
    spawn_connect(app.clone(), "lost");
}

fn start_watchdog(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut fails = 0u32;
        loop {
            tokio::time::sleep(WATCH_EVERY).await;
            if !main_on_site(&app) {
                fails = 0;
                continue;
            }
            let st = app.state::<AppState>();
            let site = st.site();
            if server::site_is_up(&st.http, &format!("{site}/api/version")).await {
                fails = 0;
                continue;
            }
            fails += 1;
            if fails >= WATCH_FAILS && main_on_site(&app) && st.site() == site {
                fails = 0;
                site_lost(&app, "não respondeu");
            }
        }
    });
}

// ---------- comandos: tela de "conectando…" ----------

#[tauri::command]
fn shell_get_status(webview: Webview, state: tauri::State<'_, AppState>) -> Option<ConnectStatus> {
    require_local(&webview, MAIN).ok()?;
    Some(state.connect.lock().unwrap().clone())
}

#[derive(Serialize)]
struct SetServerResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
async fn shell_set_server(app: AppHandle, webview: Webview, input: String) -> SetServerResult {
    if require_local(&webview, MAIN).is_err() {
        return SetServerResult { ok: false, error: Some("não permitido".into()) };
    }
    let st = app.state::<AppState>();
    let Some(url) = server::normalize_server_input(&input) else {
        return SetServerResult { ok: false, error: Some("endereço inválido — cole algo como dusky.veneno.space".into()) };
    };
    if !server::site_is_up(&st.http, &url).await {
        return SetServerResult {
            ok: false,
            error: Some(format!("não consegui falar com {url} — confere se o servidor está ligado e se o endereço é o atual")),
        };
    }
    server::save_server(&st.data_dir, &url);
    log::info(&format!("servidor trocado para {url}"));
    *st.site_url.lock().unwrap() = url;
    spawn_connect(app.clone(), "connect");
    SetServerResult { ok: true, error: None }
}

#[tauri::command]
fn shell_cancel_change(app: AppHandle, webview: Webview) {
    if require_local(&webview, MAIN).is_ok() && !app.state::<AppState>().site().is_empty() {
        spawn_connect(app, "connect");
    }
}

// ---------- comandos: site ----------

/// contador de menções no ícone (e piscar na barra de tarefas quando chega uma nova)
#[tauri::command]
fn desktop_set_badge(app: AppHandle, webview: Webview, count: i64) {
    if require_site(&app, &webview).is_err() {
        return;
    }
    let st = app.state::<AppState>();
    let n = count.clamp(0, 999);
    let before = st.mentions.swap(n, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(MAIN) {
        // Linux (Unity/KDE/GNOME com Dash to Dock) mostra o número; no Windows não existe — fica na bandeja
        let _ = win.set_badge_count(if n > 0 { Some(n) } else { None });
        if n > before && !win.is_focused().unwrap_or(true) {
            let _ = win.request_user_attention(Some(tauri::UserAttentionType::Informational));
        }
    }
    tray::refresh(&app);
}

/// traz a janela pra frente (clique numa notificação) — funciona escondida na bandeja também
#[tauri::command]
fn desktop_focus(app: AppHandle, webview: Webview) {
    if require_site(&app, &webview).is_ok() {
        show_main(&app);
    }
}

/// o site avisa o status atual (ao abrir e a cada troca, inclusive vinda de outro aparelho)
#[tauri::command]
fn status_report(app: AppHandle, webview: Webview, status: String) {
    if require_site(&app, &webview).is_err() || !matches!(status.as_str(), "online" | "idle") {
        return;
    }
    *app.state::<AppState>().status.lock().unwrap() = status;
    tray::refresh(&app);
}

/// liga/desliga a aceleração de hardware e reinicia o app (o motor web só lê isso ao abrir)
pub fn set_hardware_acceleration(app: &AppHandle, on: bool) {
    let st = app.state::<AppState>();
    {
        let mut prefs = st.prefs.lock().unwrap();
        if prefs.hardware_acceleration == on {
            return;
        }
        prefs.hardware_acceleration = on;
        server::save_prefs(&st.data_dir, &prefs);
    }
    log::info(&format!("aceleração de hardware {} — reiniciando", if on { "ligada" } else { "desligada" }));
    if on {
        // o app reiniciado herda o ambiente deste, que (com a aceleração desligada) tem as
        // WEBKIT_DISABLE_* — sem isso o novo abria com a placa desligada até fechar de vez
        webview_setup::clear_own_webkit_env();
    }
    st.quitting.store(true, Ordering::SeqCst);
    st.audio.stop();
    st.screencast.stop();
    st.call.leave();
    app.restart();
}

/// configurações → app e versão → "abrir pasta do log"
#[tauri::command]
fn app_open_logs(app: AppHandle, webview: Webview) {
    if require_site(&app, &webview).is_err() {
        return;
    }
    let dir = server::log::dir(&app.state::<AppState>().data_dir);
    let _ = std::fs::create_dir_all(&dir);
    match Url::from_directory_path(&dir) {
        Ok(url) => open_external(&app, url.as_str()),
        Err(_) => server::log::warn(&format!("não consegui abrir a pasta do log: {}", dir.display())),
    }
}

/// a página pede pra mudar (configurações → app). Reinicia na hora.
#[tauri::command]
fn app_set_hardware_acceleration(app: AppHandle, webview: Webview, on: bool) {
    if require_site(&app, &webview).is_ok() {
        set_hardware_acceleration(&app, on);
    }
}

// ---------- ciclo de vida ----------

pub fn run() {
    let dev = server::env_var("DEV").as_deref() == Some("1");
    let env_url = server::env_var("URL")
        .or_else(|| dev.then(|| "http://localhost:3000".to_string()))
        .and_then(|u| server::normalize_server_input(&u));

    let context = tauri::generate_context!();
    // identifier novo = pasta de dados nova: traz o que estava na antiga antes de abrir qualquer coisa
    server::migrate_legacy_dirs(&context.config().identifier);
    // aceleração de hardware: precisa estar decidida antes da primeira janela
    let hw = server::data_dir_for(&context.config().identifier)
        .map(|d| server::load_prefs(&d).hardware_acceleration)
        .unwrap_or(true);
    webview_setup::init_hardware_acceleration(hw);

    // atalhos globais (shortcuts.rs): o plugin só fora do Wayland — lá ele precisaria do X11 (e,
    // sem XWayland, nem iniciaria); no Wayland os atalhos vão pelo portal do sistema
    let mut builder = tauri::Builder::default();
    if shortcuts::use_hotkey_plugin() {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }
    let app = builder
        // abrir o dusky de novo (atalho, menu de apps) com ele escondido: traz a janela de volta
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // não guarda "escondida": senão, saindo com a janela na bandeja, ela voltaria invisível
                .with_state_flags(tauri_plugin_window_state::StateFlags::all() - tauri_plugin_window_state::StateFlags::VISIBLE)
                .with_denylist(&[picker::LABEL])
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            server::log::init(&data_dir);
            server::migrate_from_electron(&data_dir);
            #[cfg(windows)]
            server::close_electron_app();
            let site = env_url.clone().unwrap_or_else(|| server::saved_server_or_default(&data_dir));
            let http = reqwest::Client::builder()
                .user_agent(concat!("dusky-desktop/", env!("CARGO_PKG_VERSION")))
                .build()?;
            app.manage(AppState {
                prefs: Mutex::new(server::load_prefs(&data_dir)),
                deps: deps::Deps::new(&data_dir),
                data_dir,
                dev,
                fixed_by_env: env_url.is_some(),
                site_url: Mutex::new(site),
                granted_sites: Mutex::new(HashSet::new()),
                connect: Mutex::new(ConnectStatus { phase: "idle".into(), url: None, attempts: 0, since: 0, fixed_by_env: false, lost: false }),
                connect_gen: AtomicU64::new(0),
                status: Mutex::new("online".into()),
                mentions: AtomicI64::new(0),
                quitting: AtomicBool::new(false),
                http,
                picker: picker::PickerSlot::default(),
                screencast: screencast::Screencast::default(),
                audio: audio::ScreenAudio::default(),
                call: call::Call::default(),
                tray: Mutex::new(None),
            });
            app.manage(updater::Updates::default());
            app.manage(presence::Presence::default());
            let handle = app.handle().clone();
            init_local_base(&handle);
            app.state::<AppState>().audio.set_app(&handle);
            create_main_window(&handle)?;
            if let Err(err) = tray::create(&handle) {
                log::warn(&format!("não deu pra criar o ícone da bandeja: {err}"));
            }
            spawn_connect(handle.clone(), "connect");
            start_watchdog(handle.clone());
            updater::start(&handle);
            // já descobre o melhor jeito de compartilhar a tela (e baixa o ffmpeg se precisar), pra
            // estar pronto na primeira vez
            if !screencast::is_wayland() {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    let _ = screencast::probe(&handle).await;
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN {
                return;
            }
            let app = window.app_handle();
            let st = app.state::<AppState>();
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let close_to_tray = st.prefs.lock().unwrap().close_to_tray;
                    if st.quitting.load(Ordering::SeqCst) || !close_to_tray {
                        return; // sair de verdade
                    }
                    // só esconde: a página continua viva (call, mensagens, sons, notificações)
                    api.prevent_close();
                    let _ = window.hide();
                    show_tray_hint_once(app);
                }
                WindowEvent::Destroyed => {
                    st.audio.stop();
                    app.state::<presence::Presence>().stop();
                    quit_for_real(app);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            shell_get_status,
            shell_set_server,
            shell_cancel_change,
            desktop_set_badge,
            desktop_focus,
            status_report,
            app_set_hardware_acceleration,
            app_open_logs,
            crate::perf::perf_snapshot,
            crate::drops::drop_files,
            crate::drops::drop_read,
            updater::update_check,
            presence::presence_configure,
            presence::presence_candidates,
            presence::presence_current,
            audio::screen_audio_plan,
            audio::screen_audio_stop,
            screencast::screencast_available,
            screencast::screencast_start,
            screencast::screencast_command,
            screencast::screencast_stop,
            call::call_join,
            call::call_leave,
            call::call_push_mic,
            call::call_pull,
            call::call_set_subscribed,
            call::call_pull_video,
            call::call_push_camera,
            call::call_stop_camera,
            call::call_stats,
            call::call_keyframe,
            call::call_log,
            call::call_screen_fallback,
            shortcuts::shortcuts_configure,
            picker::picker_get_sources,
            picker::picker_choose,
            picker::picker_get_audio_apps,
            picker::picker_choose_audio,
            picker::picker_cancel,
        ])
        .build(context)
        .expect("falha ao iniciar o dusky");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            let st = app.state::<AppState>();
            st.audio.stop();
            st.screencast.stop();
            st.call.leave();
            updater::install_on_exit(app);
        }
    });
}
