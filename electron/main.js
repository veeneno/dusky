'use strict';
// App desktop do didiscord (Electron).
//
// Não sobe servidor nenhum: só abre uma janela nativa (Chromium completo) apontando pro site
// hospedado. O que o app adiciona em relação a abrir no navegador:
//   - seletor próprio de tela/janela pro compartilhamento de tela (Electron não traz um no Linux)
//   - áudio da tela compartilhada isolado por app, sem a voz da call voltando em eco (ver audio/)
//   - permissões de mic/câmera/tela liberadas direto, só pro servidor escolhido
//   - pergunta o endereço do servidor (túnel do Cloudflare ou IP) e guarda — ver "endereço do servidor"
//   - fechar a janela só esconde: a call e os avisos continuam, com ícone na bandeja — ver "bandeja"

const { app, BrowserWindow, Menu, ipcMain, session, desktopCapturer, shell, net, screen, Tray, nativeImage, Notification, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const { createScreenAudio } = require('./audio');
const { createDeps } = require('./deps');
const { createScreencast } = require('./screencast');
const { createUpdater } = require('./updater');
const { createPresence } = require('./presence');

const DEV = process.env.DIDISCORD_DEV === '1';

// ---------- endereço do servidor ----------
//
// Endereço fixo: https://didiscord.veneno.space (túnel nomeado do Cloudflare, ver scripts/start.js).
// O app já abre nele. Dá pra trocar pela tela de "conectando…" ou pelo menu Servidor (fica salvo em
// server.json na pasta de dados do app). Endereços antigos de túnel rápido (*.trycloudflare.com,
// que mudavam a cada reinício) salvos de antes são ignorados — voltam pro endereço fixo.
// Também aceita IP (ex: 203.0.113.5:3000) — aí é HTTP puro, e o app marca só esse endereço como
// "seguro" pro Chromium (senão o microfone/câmera/tela ficam bloqueados).
// DIDISCORD_URL (variável de ambiente) força um endereço sem perguntar nada — bom pra teste.

const ENV_URL = process.env.DIDISCORD_URL || (DEV ? 'http://localhost:3000' : '');
const DEFAULT_URL = 'https://didiscord.veneno.space';
const serverFile = () => path.join(app.getPath('userData'), 'server.json');

// o que a pessoa digitou -> URL de origem (https://host ou http://ip:porta), ou null se não dá
function normalizeServerInput(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    // sem http(s)://: IP (ou localhost) vira http na porta 3000; nome (ex: túnel) vira https
    const ip = s.split('/')[0].match(/^(\d{1,3}(?:\.\d{1,3}){3}|localhost)(:\d+)?$/i);
    s = ip ? `http://${ip[1]}${ip[2] || ':3000'}` : `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname || !/^[a-z0-9.-]+$/i.test(u.hostname) || !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.origin; // só esquema + host + porta (caminho/barra no fim são ignorados)
  } catch (_) {
    return null;
  }
}

function loadSavedServer() {
  try {
    return normalizeServerInput(JSON.parse(fs.readFileSync(serverFile(), 'utf8')).url);
  } catch (_) {
    return null;
  }
}

function saveServer(url) {
  try {
    fs.mkdirSync(path.dirname(serverFile()), { recursive: true });
    fs.writeFileSync(serverFile(), JSON.stringify({ url }));
  } catch (err) {
    console.warn('[didiscord] não consegui salvar o endereço do servidor:', err && err.message);
  }
}

function savedServerOrDefault() {
  const saved = loadSavedServer();
  if (saved && !/\.trycloudflare\.com$/i.test(new URL(saved).hostname)) return saved;
  return DEFAULT_URL;
}

let SITE_URL = normalizeServerInput(ENV_URL) || savedServerOrDefault();

// endereço HTTP (IP) marcado como seguro quando o app abriu — o Chromium só aceita isso na
// inicialização, então trocar pra OUTRO endereço HTTP precisa reabrir o app
const INSECURE_SECURE_ORIGIN = SITE_URL && SITE_URL.startsWith('http:') ? SITE_URL : null;

const ICON_PATH = path.join(__dirname, 'build', 'icon.png');
const SHELL_PATH = path.join(__dirname, 'shell', 'loading.html');
const PICKER_PATH = path.join(__dirname, 'picker', 'picker.html');
const PICKER_PRELOAD = path.join(__dirname, 'picker', 'pickerPreload.js');

const log = (...args) => console.log('[didiscord]', ...args);

function isAllowedUrl(url) {
  if (!SITE_URL) return false;
  try {
    const u = new URL(url);
    if (DEV && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    // só o servidor escolhido; HTTP só se for o mesmo endereço que o app já abriu marcado como seguro
    if (u.origin !== SITE_URL) return false;
    return u.protocol === 'https:' || (u.protocol === 'http:' && u.origin === INSECURE_SECURE_ORIGIN);
  } catch (_) {
    return false;
  }
}

function isShellUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('file://')) return false;
  return decodeURI(url.split(/[?#]/)[0]).replace(/\\/g, '/').endsWith('/shell/loading.html');
}

// ---------- flags do Chromium (têm que vir antes do app ficar pronto) ----------

// o áudio da call precisa tocar mesmo sem um clique prévio na página (ex: app reaberto direto numa call)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// servidor por IP (HTTP): sem isso o Chromium bloqueia microfone/câmera/tela (exigem "contexto seguro")
if (INSECURE_SECURE_ORIGIN) app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', INSECURE_SECURE_ORIGIN);
// Wayland (padrão das distros novas com GNOME/KDE): nenhum app pode listar telas/janelas sozinho —
// só a janela do próprio sistema (xdg-desktop-portal) pergunta o que compartilhar. Muda o fluxo do
// seletor de tela, ver setupDisplayMedia.
const IS_WAYLAND = process.platform === 'linux'
  && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);
if (IS_WAYLAND) {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
}
if (process.platform === 'win32') app.setAppUserModelId('fun.sambalele.didiscord');
if (process.platform === 'linux') app.setDesktopName('didiscord.desktop');

// ---------- estado da janela (tamanho/posição) ----------

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  const fallback = { width: 1280, height: 800 };
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const bounds = { width: Math.max(940, s.width | 0), height: Math.max(560, s.height | 0) };
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
      // só reaproveita a posição se ainda cair dentro de algum monitor (monitor pode ter sido tirado)
      const visible = screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return s.x + 80 > a.x && s.x < a.x + a.width - 80 && s.y >= a.y - 8 && s.y < a.y + a.height - 80;
      });
      if (visible) { bounds.x = s.x; bounds.y = s.y; }
    }
    return { ...bounds, maximized: !!s.maximized };
  } catch (_) {
    return fallback;
  }
}

function saveWindowState(win) {
  try {
    const maximized = win.isMaximized();
    const b = maximized ? (win._lastNormalBounds || win.getNormalBounds()) : win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized }));
  } catch (_) { /* não é crítico */ }
}

// ---------- preferências do app (prefs.json na pasta de dados) ----------
//   closeToTray:   fechar a janela só esconde (padrão) — desligado, fechar sai do app como antes
//   trayHintShown: o aviso "continua rodando" já apareceu uma vez

const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');
const prefs = { closeToTray: true, trayHintShown: false };

function loadPrefs() {
  try {
    const p = JSON.parse(fs.readFileSync(prefsFile(), 'utf8'));
    if (typeof p.closeToTray === 'boolean') prefs.closeToTray = p.closeToTray;
    if (typeof p.trayHintShown === 'boolean') prefs.trayHintShown = p.trayHintShown;
  } catch (_) { /* primeira vez: fica no padrão */ }
}

function savePrefs() {
  try {
    fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs));
  } catch (_) { /* não é crítico */ }
}

// ---------- janela principal ----------

// true quando é pra fechar DE VERDADE (Sair na bandeja/menu, desligar o PC, instalar atualização).
// Fora isso, fechar a janela só esconde o app.
let isQuitting = false;
let mainWindow = null;
const screenAudio = createScreenAudio({ log });
// compartilhamento de tela pela placa de vídeo (ver screencast.js) e o que ele baixa sozinho (deps.js)
const deps = createDeps({ log });
const screencast = createScreencast({ log, deps });
// "jogando X": o jogo detectado vai só pra janela do site (ver presence.js)
const presence = createPresence({
  log,
  onChange: (activity) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('presence:activity', activity);
  },
});
const updater = createUpdater({
  log,
  getWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
  getSiteUrl: () => SITE_URL,
  onQuitForUpdate: () => { isQuitting = true; },
});

function createMainWindow() {
  const state = loadWindowState();
  const win = new BrowserWindow({
    ...state,
    minWidth: 940,
    minHeight: 560,
    title: 'didiscord',
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    icon: ICON_PATH,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // a call não pode "dormir" quando a janela fica minimizada ou escondida atrás de outra
      backgroundThrottling: false,
    },
  });
  mainWindow = win;
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  win.on('resize', () => { if (!win.isMaximized() && !win.isMinimized()) win._lastNormalBounds = win.getBounds(); });
  // Windows desligando/saindo da conta: a janela tem que fechar de verdade, senão segura o desligamento
  win.on('session-end', () => { isQuitting = true; });
  win.on('close', (event) => {
    saveWindowState(win);
    if (isQuitting || !prefs.closeToTray) return; // sair de verdade
    // só esconde: a página continua viva (call, mensagens, sons, notificações)
    event.preventDefault();
    win.hide();
    showTrayHintOnce();
  });
  win.on('closed', () => { screenAudio.stop(); presence.stop(); mainWindow = null; });
  win.on('focus', () => { try { win.flashFrame(false); } catch (_) { /* ok */ } });

  const wc = win.webContents;

  // navegação: só o shell local e o domínio do didiscord; o resto abre no navegador do sistema
  wc.on('will-navigate', (event, url) => {
    if (isShellUrl(url) || isAllowedUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // recarregar a página ou o renderer cair não pode deixar uma captura de áudio órfã rodando
  wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) screenAudio.stop(); });
  wc.on('render-process-gone', () => screenAudio.stop());

  // site fora do ar (ou sem internet) -> volta pra tela de loading e fica tentando de novo
  wc.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ABORTED: navegação trocada no meio */) return;
    if (isAllowedUrl(url)) connectToSite(win);
  });

  // menu de contexto básico (recortar/copiar/colar nos campos de texto)
  wc.on('context-menu', (_e, params) => {
    const items = [];
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  connectToSite(win);
  return win;
}

// ---------- tela de loading + espera o site responder ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function siteIsUp(url) {
  try {
    const res = await net.fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    // qualquer resposta que não seja erro de servidor = está de pé. (Túnel do Cloudflare com o
    // servidor desligado responde 502/530, então também conta como fora do ar.)
    return res.status < 500;
  } catch (_) {
    return false;
  }
}

// cada chamada de connectToSite ganha um número; a anterior para sozinha quando vê que não é a última
let connectGeneration = 0;
let connectStatus = { phase: 'idle', url: null, attempts: 0, since: 0 };

function sendShellStatus(win) {
  if (win && !win.isDestroyed() && isShellUrl(win.webContents.getURL())) {
    win.webContents.send('shell:status', { ...connectStatus, fixedByEnv: !!ENV_URL });
  }
}

// mode: 'connect' (normal), 'setup' (nunca configurou), 'change' (pediu pra trocar pelo menu)
async function connectToSite(win, mode = 'connect') {
  const gen = ++connectGeneration;
  if (!SITE_URL) mode = 'setup';
  connectStatus = { phase: mode === 'connect' ? 'connecting' : mode, url: SITE_URL, attempts: 0, since: Date.now() };
  if (win.isDestroyed()) return;
  await win.loadFile(SHELL_PATH).catch(() => {});
  sendShellStatus(win);
  if (mode !== 'connect') return; // fica esperando a pessoa digitar o endereço

  let delay = 1000;
  while (!win.isDestroyed() && gen === connectGeneration) {
    if (await siteIsUp(SITE_URL)) {
      if (!win.isDestroyed() && gen === connectGeneration) {
        connectStatus = { ...connectStatus, phase: 'loading' };
        win.loadURL(SITE_URL).catch(() => {});
      }
      return;
    }
    if (gen !== connectGeneration) return;
    connectStatus = { ...connectStatus, attempts: connectStatus.attempts + 1 };
    sendShellStatus(win);
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.6), 10000);
  }
}

function shellSender(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return isShellUrl(url) && mainWindow && event.sender === mainWindow.webContents;
}

ipcMain.handle('shell:getStatus', (event) => (shellSender(event) ? { ...connectStatus, fixedByEnv: !!ENV_URL } : null));

// a pessoa digitou um endereço novo: valida, testa, salva e conecta
ipcMain.handle('shell:setServer', async (event, input) => {
  if (!shellSender(event)) return { ok: false, error: 'não permitido' };
  const url = normalizeServerInput(input);
  if (!url) return { ok: false, error: 'endereço inválido — cole algo como didiscord.veneno.space' };
  if (!(await siteIsUp(url))) {
    return { ok: false, error: `não consegui falar com ${url} — confere se o servidor está ligado e se o endereço é o atual` };
  }
  saveServer(url);
  log('servidor trocado para', url);
  // HTTP diferente do que o app abriu marcado como seguro: o Chromium só aceita isso reabrindo
  if (url.startsWith('http:') && url !== INSECURE_SECURE_ORIGIN) {
    app.relaunch();
    app.exit(0);
    return { ok: true, relaunching: true };
  }
  SITE_URL = url;
  if (mainWindow && !mainWindow.isDestroyed()) connectToSite(mainWindow);
  return { ok: true };
});

ipcMain.on('shell:cancelChange', (event) => {
  if (shellSender(event) && SITE_URL && mainWindow) connectToSite(mainWindow);
});

// ---------- permissões ----------

function setupPermissions() {
  const allowed = new Set([
    'media', 'audioCapture', 'videoCapture', 'display-capture', 'speaker-selection',
    'notifications', 'fullscreen', 'clipboard-sanitized-write',
  ]);
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowed.has(permission) && isAllowedUrl((details && details.requestingUrl) || _wc.getURL()));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return allowed.has(permission) && isAllowedUrl(requestingOrigin);
  });
}

// ---------- seletor de tela/janela (getDisplayMedia) ----------

let activePicker = null; // { win, sources: Map<id, DesktopCapturerSource>, resolve }

// mode: 'sources' (X11/Windows — escolhe tela/janela com miniaturas) ou 'audio' (Wayland — escolhe
// só o som; a tela/janela vem depois, pela janela do sistema). Resolve com a fonte escolhida
// ('sources'), com { audioChoice } ('audio'), ou null se cancelou.
function pickSource(parent, mode = 'sources') {
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      parent,
      modal: !!parent,
      width: mode === 'audio' ? 560 : 860,
      height: mode === 'audio' ? 520 : 620,
      minWidth: mode === 'audio' ? 460 : 560,
      minHeight: 420,
      title: 'Compartilhar tela',
      backgroundColor: '#1e1f22',
      icon: ICON_PATH,
      show: false,
      autoHideMenuBar: true,
      webPreferences: { preload: PICKER_PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    picker.removeMenu();

    let settled = false;
    const state = { win: picker, sources: new Map(), resolve: null, mode };
    const finish = (source) => {
      if (settled) return;
      settled = true;
      if (activePicker === state) activePicker = null;
      resolve(source || null);
      if (!picker.isDestroyed()) picker.destroy();
    };
    state.resolve = finish;
    activePicker = state;

    picker.once('ready-to-show', () => picker.show());
    picker.on('closed', () => finish(null));
    picker.loadFile(PICKER_PATH, { query: { mode } }).catch(() => finish(null));
  });
}

ipcMain.handle('picker:getSources', async (event) => {
  const p = activePicker;
  if (!p || event.sender !== p.win.webContents) return [];
  const list = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  const ownPickerId = p.win.isDestroyed() ? null : p.win.getMediaSourceId();
  const usable = list.filter((s) => s.id !== ownPickerId && (s.id.startsWith('screen:') || s.name));
  p.sources = new Map(usable.map((s) => [s.id, s]));
  return usable.map((s) => ({
    id: s.id,
    name: s.name || 'Tela',
    type: s.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});

ipcMain.on('picker:choose', (event, id) => {
  const p = activePicker;
  if (!p || event.sender !== p.win.webContents) return;
  p.resolve(p.sources.get(String(id)) || null);
});

// Wayland: apps tocando som agora (pra escolher de qual vem o áudio)
ipcMain.handle('picker:getAudioApps', async (event) => {
  const p = activePicker;
  if (!p || event.sender !== p.win.webContents) return { available: false, apps: [] };
  return screenAudio.listAudioApps();
});

ipcMain.on('picker:chooseAudio', (event, choice) => {
  const p = activePicker;
  if (!p || event.sender !== p.win.webContents || p.mode !== 'audio') return;
  const mode = choice && ['system', 'app', 'none'].includes(choice.mode) ? choice.mode : 'system';
  const appKey = mode === 'app' && choice && typeof choice.appKey === 'string' ? choice.appKey.slice(0, 200) : null;
  p.resolve({ audioChoice: mode === 'app' && !appKey ? { mode: 'system' } : { mode, appKey } });
});

ipcMain.on('picker:cancel', (event) => {
  const p = activePicker;
  if (!p || event.sender !== p.win.webContents) return;
  p.resolve(null);
});

function setupDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isAllowedUrl(request.securityOrigin)) return callback({});
    try {
      const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
      if (IS_WAYLAND) return await shareOnWayland(request, callback, parent);
      const source = await pickSource(parent);
      if (!source) {
        screenAudio.stop();
        return callback({}); // cancelou -> getDisplayMedia rejeita e o site trata como "desistiu"
      }
      await screenAudio.prepare({ source, audioRequested: !!request.audioRequested });
      // só vídeo aqui: o áudio da tela chega à parte, pelo IPC (ver audio/ e preload.js)
      callback({ video: source });
    } catch (err) {
      log('falha no seletor de tela:', err && err.message);
      screenAudio.stop();
      callback({});
    }
  });
}

// Wayland: 1) o nosso seletor pergunta só o SOM (o sistema não deixa a gente listar telas/janelas,
// nem descobrir de qual app é a janela escolhida); 2) getSources abre a janela do sistema, uma vez,
// e devolve exatamente o que a pessoa escolheu ali.
async function shareOnWayland(request, callback, parent) {
  let audioChoice = { mode: 'none' };
  if (request.audioRequested) {
    const picked = await pickSource(parent, 'audio');
    if (!picked) {
      screenAudio.stop();
      return callback({});
    }
    audioChoice = picked.audioChoice;
  }
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
  const source = sources[0];
  if (!source) {
    screenAudio.stop();
    return callback({}); // fechou a janela do sistema sem escolher
  }
  await screenAudio.prepare({ source, audioRequested: !!request.audioRequested, audioChoice });
  callback({ video: source });
}

// ---------- IPC do áudio da tela ----------

function trustedSender(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return !!url && isAllowedUrl(url);
}

ipcMain.handle('didiscord:getScreenAudioPlan', (event) => {
  if (!trustedSender(event)) return { mode: 'none' };
  const sender = event.sender;
  return screenAudio.start((chunk) => {
    if (sender.isDestroyed()) return;
    // cópia com ArrayBuffer próprio: o serializador do IPC mandaria o buffer inteiro por baixo do Buffer
    sender.send('didiscord:pcm', new Uint8Array(chunk));
  });
});

ipcMain.handle('didiscord:stopScreenAudio', (event) => {
  if (trustedSender(event)) screenAudio.stop();
});

// ---------- compartilhamento de tela pela placa de vídeo (screencast.js) ----------

// dá pra usar? (e, se estiver baixando o componente, quanto falta)
ipcMain.handle('screencast:available', async (event) => {
  if (!trustedSender(event)) return { available: false, reason: 'origem não permitida' };
  const info = await screencast.probe();
  return {
    available: !!info.available,
    encoderName: info.encoderName || null,
    hardware: !!info.hardware,
    reason: info.reason || null,
    sfu: true, // este app sabe mandar a tela pelo servidor de mídia (comando "publish")
    deps: deps.getStatus(),
  };
});

// abre o seletor de tela/janela e começa a transmitir. Eventos do auxiliar (ofertas pra cada pessoa,
// estatísticas, fim) chegam no site por 'screencast:event'.
ipcMain.handle('screencast:start', async (event, opts) => {
  if (!trustedSender(event)) return { ok: false, reason: 'origem não permitida' };
  const sender = event.sender;
  const o = opts || {};
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  let source;
  if (IS_WAYLAND) {
    // Wayland: o sistema não diz de qual app é a janela escolhida, então o som é escolhido antes, no
    // nosso seletor; a tela/janela vem depois, pelo seletor do sistema (aberto pelo auxiliar)
    let audioChoice = { mode: 'none' };
    if (o.audioRequested) {
      const picked = await pickSource(parent, 'audio');
      if (!picked) return { ok: false, cancelled: true };
      audioChoice = picked.audioChoice;
    }
    source = { id: 'portal:0', name: 'Tela' };
    await screenAudio.prepare({ source, audioRequested: !!o.audioRequested, audioChoice });
  } else {
    source = await pickSource(parent);
    if (!source) return { ok: false, cancelled: true };
    await screenAudio.prepare({ source, audioRequested: !!o.audioRequested });
  }
  const res = await screencast.start({
    source,
    opts: { fps: o.fps, width: o.width, height: o.height, bitrateKbps: o.bitrateKbps },
    // "urls" sempre como lista (a Metered manda texto; o auxiliar novo aceita os dois, o antigo só lista)
    iceServers: (Array.isArray(o.iceServers) ? o.iceServers : []).map((srv) => ({
      ...srv,
      urls: Array.isArray(srv && srv.urls) ? srv.urls : [srv && srv.urls].filter(Boolean),
    })),
    onEvent: (ev) => { if (!sender.isDestroyed()) sender.send('screencast:event', ev); },
  });
  if (!res.ok) screenAudio.stop();
  return { ...res, sourceName: res.sourceType === 2 ? 'Janela' : source.name };
});

// sinalização de cada pessoa assistindo (o site repassa pelo servidor)
ipcMain.on('screencast:command', (event, msg) => {
  if (!trustedSender(event) || !msg || typeof msg !== 'object') return;
  // tela pelo servidor de mídia: o site manda só o caminho e o ingresso; o endereço é sempre o do
  // servidor em que o app está conectado (um site não consegue apontar o auxiliar pra outro lugar)
  if (msg.cmd === 'publish') {
    const pathOk = typeof msg.path === 'string' && /^\/[A-Za-z0-9/_-]{0,64}$/.test(msg.path);
    if (!pathOk || typeof msg.token !== 'string' || msg.token.length > 4096) return;
    screencast.command({
      cmd: 'publish', url: SITE_URL.replace(/^http/i, 'ws') + msg.path, token: msg.token,
      width: Math.max(0, Math.floor(Number(msg.width) || 0)), height: Math.max(0, Math.floor(Number(msg.height) || 0)),
    });
    return;
  }
  if (msg.cmd === 'unpublish') { screencast.command({ cmd: 'unpublish' }); return; }
  if (!['add', 'answer', 'candidate', 'remove'].includes(msg.cmd)) return;
  screencast.command({
    cmd: msg.cmd, viewer: String(msg.viewer || ''), sdp: msg.sdp, candidate: msg.candidate,
    ...(Array.isArray(msg.iceServers) ? { iceServers: msg.iceServers } : {}),
  });
});

ipcMain.handle('screencast:stop', (event) => {
  if (trustedSender(event)) screencast.stop();
});

// ---------- bandeja (ícone perto do relógio) ----------
//
// Com a janela escondida o app segue vivo: a call continua, as mensagens chegam e os sons tocam
// (backgroundThrottling: false na janela). O ícone traz a janela de volta, troca o status
// (ativo/inativo, o mesmo do menu do avatar no site) e tem o "Sair" de verdade.
// Linux com GNOME: o ícone só aparece com a extensão "AppIndicator" — sem ela, abrir o didiscord de
// novo (pelo menu de apps) traz a janela escondida de volta (ver second-instance).

let tray = null;
let currentStatus = 'online'; // o site avisa por 'status:report' (ver preload.js)
let mentionCount = 0;
const STATUS_LABELS = { online: 'Ativo', idle: 'Inativo' };

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitForReal() {
  isQuitting = true;
  app.quit();
}

function trayIcon() {
  const img = nativeImage.createFromPath(ICON_PATH);
  if (img.isEmpty()) return img;
  // Windows/macOS desenham 16px na bandeja; o Linux (AppIndicator) costuma usar 22-24px
  const size = process.platform === 'linux' ? 24 : 16;
  return img.resize({ width: size, height: size, quality: 'best' });
}

function updateTrayTooltip() {
  if (!tray) return;
  const prefix = mentionCount ? `(${mentionCount > 99 ? '99+' : mentionCount}) ` : '';
  tray.setToolTip(`${prefix}didiscord — ${STATUS_LABELS[currentStatus].toLowerCase()}`);
}

function buildTrayMenu() {
  if (!tray) return;
  const setStatus = (status) => {
    currentStatus = status; // já mostra na bandeja; o site confirma com 'status:report'
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('status:set', status);
    buildTrayMenu();
  };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir didiscord', click: showMainWindow },
    { type: 'separator' },
    { label: '🟢  Ativo', type: 'radio', checked: currentStatus === 'online', click: () => setStatus('online') },
    { label: '🌙  Inativo', type: 'radio', checked: currentStatus === 'idle', click: () => setStatus('idle') },
    { type: 'separator' },
    {
      label: 'Continuar rodando ao fechar a janela',
      type: 'checkbox',
      checked: prefs.closeToTray,
      click: (item) => { prefs.closeToTray = item.checked; savePrefs(); buildMenu(); },
    },
    { type: 'separator' },
    { label: 'Sair do didiscord', click: quitForReal },
  ]));
  updateTrayTooltip();
}

function createTray() {
  if (tray) return;
  try {
    tray = new Tray(trayIcon());
  } catch (err) {
    log('não deu pra criar o ícone da bandeja:', err && err.message);
    tray = null;
    return;
  }
  // Windows/macOS: clique no ícone abre (no Linux o clique abre o menu, que tem "Abrir didiscord")
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  buildTrayMenu();
}

// primeira vez que a janela some: avisa que o app não fechou (senão parece que a call caiu à toa)
function showTrayHintOnce() {
  if (prefs.trayHintShown) return;
  prefs.trayHintShown = true;
  savePrefs();
  const body = tray
    ? 'Ele continua rodando na bandeja (calls, mensagens e sons seguem funcionando). Pra fechar de vez: botão direito no ícone → Sair do didiscord.'
    : 'Ele continua rodando em segundo plano. Abra o didiscord de novo pra ver a janela, ou use o menu didiscord → Sair.';
  try {
    if (Notification.isSupported()) new Notification({ title: 'didiscord continua aberto', body, icon: ICON_PATH, silent: true }).show();
  } catch (_) { /* sem notificação do sistema: tudo bem */ }
}

// o site avisa o status atual (ao abrir e a cada troca, inclusive vinda de outro aparelho)
ipcMain.on('status:report', (event, status) => {
  if (!trustedSender(event) || !STATUS_LABELS[status]) return;
  if (status === currentStatus) return;
  currentStatus = status;
  buildTrayMenu();
});

// ---------- avisos: contador de menções no ícone e trazer a janela pra frente ----------

let lastBadge = 0;
ipcMain.on('didiscord:badge', (event, count) => {
  if (!trustedSender(event)) return;
  const n = Math.max(0, Math.min(999, Number(count) || 0));
  try { app.setBadgeCount(n); } catch (_) { /* nem todo sistema tem contador no ícone */ }
  // menção nova com a janela em segundo plano: pisca na barra de tarefas (Windows/Linux)
  if (n > lastBadge && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
    try { mainWindow.flashFrame(true); } catch (_) { /* ok */ }
  }
  lastBadge = n;
  mentionCount = n;
  updateTrayTooltip();
});

ipcMain.on('didiscord:focus', (event) => {
  if (!trustedSender(event)) return;
  showMainWindow(); // funciona com a janela escondida na bandeja também
});

// ---------- "jogando X" (presence.js) ----------

// { enabled, custom: [{ exe, name }] } — o site manda ao abrir e toda vez que a pessoa muda a opção
ipcMain.on('presence:configure', (event, cfg) => {
  if (trustedSender(event)) presence.configure(cfg || {});
});
// programas abertos que podem ser um jogo, pra tela de "adicionar jogo" (só enquanto ela está aberta)
ipcMain.handle('presence:candidates', async (event) => (trustedSender(event) ? presence.listCandidates() : []));
ipcMain.handle('presence:current', (event) => (trustedSender(event) ? presence.getCurrent() : null));

ipcMain.handle('didiscord:checkUpdates', (event) => {
  if (trustedSender(event)) updater.check(true);
});

// ---------- menu ----------

function buildMenu() {
  const template = [
    {
      label: 'didiscord',
      submenu: [
        {
          label: 'Continuar rodando ao fechar a janela',
          type: 'checkbox',
          checked: prefs.closeToTray,
          click: (item) => { prefs.closeToTray = item.checked; savePrefs(); buildTrayMenu(); },
        },
        { type: 'separator' },
        { label: 'Sair do didiscord', accelerator: 'CmdOrCtrl+Q', click: quitForReal },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'forceReload', label: 'Recarregar (limpando cache)' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom padrão' },
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' },
      ],
    },
    { role: 'editMenu', label: 'Editar' },
    {
      label: 'Servidor',
      submenu: [
        {
          label: 'Mudar endereço do servidor…',
          enabled: !ENV_URL,
          click: () => { if (mainWindow && !mainWindow.isDestroyed()) connectToSite(mainWindow, 'change'); },
        },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: 'Procurar atualizações…', click: () => updater.check(true) },
        { type: 'separator' },
        { label: `didiscord ${app.getVersion()}`, enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- ciclo de vida ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // abrir o didiscord de novo (atalho, menu de apps) com ele escondido: traz a janela de volta
  app.on('second-instance', () => {
    if (app.isReady()) showMainWindow();
  });

  app.whenReady().then(() => {
    loadPrefs();
    buildMenu();
    setupPermissions();
    setupDisplayMedia();
    createMainWindow();
    createTray();
    // Linux/macOS desligando: idem ao session-end do Windows (ver createMainWindow)
    try { powerMonitor.on('shutdown', () => { isQuitting = true; }); } catch (_) { /* sem suporte */ }
    app.on('activate', showMainWindow); // macOS: clique no ícone do Dock
    // já descobre o melhor jeito de compartilhar a tela (e baixa o ffmpeg se precisar) em segundo
    // plano, pra estar pronto na primeira vez que a pessoa compartilhar
    if (!IS_WAYLAND) setTimeout(() => { screencast.probe().catch(() => {}); }, 3000);
    updater.start();
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  // Sair (bandeja/menu/Ctrl+Q), desligar o PC ou instalar atualização: aí a janela fecha de verdade
  app.on('before-quit', () => { isQuitting = true; screenAudio.stop(); screencast.stop(); });
}
