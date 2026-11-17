// dusky — Teclas de atalho (e "apertar para falar")
// Parte 30 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Neste arquivo:
//   - as preferências (localStorage "dusky:shortcuts"): tecla de mutar, de ensurdecer, de falar,
//     modo "apertar para falar" e se os atalhos valem com o dusky em segundo plano;
//   - atalhos com o dusky NA FRENTE (qualquer navegador e o app);
//   - atalhos GLOBAIS no app desktop (funcionam no jogo, com a janela escondida): mutar,
//     ensurdecer e apertar pra falar — o app (tauri/src-tauri/src/shortcuts.rs) avisa
//     window.duskyDesktop.shortcuts.onShortcut({ id, down }) e a lógica é a mesma daqui;
//   - a aba "teclas de atalho" das configurações (gravar uma tecla nova clicando no campo).
//
// Formato de uma tecla: "Ctrl+Shift+KeyM" — modificadores na ordem Ctrl, Alt, Shift, Meta + o
// KeyboardEvent.code (posição física da tecla: não muda com o layout do teclado).

const SHORTCUTS_KEY = 'dusky:shortcuts';
const SHORTCUT_DEFAULTS = {
  mutar: 'Ctrl+Shift+KeyM',
  ensurdecer: 'Ctrl+Shift+KeyD',
  falar: '',            // tecla de apertar pra falar (vazia = sem)
  pttMode: false,       // modo de voz: false = detecção de voz, true = apertar para falar
  global: true,         // app: mutar/ensurdecer funcionam com o dusky em segundo plano
};
const PTT_RELEASE_MS = 150; // segura o microfone aberto um tiquinho depois de soltar (não corta a última sílaba)
const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'AltGraph']);

let shortcutPrefs = loadShortcutPrefs();
let pttHeld = false;
let pttHeldBy = null;       // 'page' | 'global' — quem está segurando agora
let pttReleaseTimer = null;
let globalShortcutStatus = null;
const lastShortcutAt = new Map(); // `${origem}:${id}` -> performance.now() (evita agir duas vezes)

function loadShortcutPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) || 'null');
    return { ...SHORTCUT_DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch (_) {
    return { ...SHORTCUT_DEFAULTS };
  }
}

function saveShortcutPrefs() {
  try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcutPrefs)); } catch (_) { /* vale só agora */ }
}

// ---------- formato das teclas ----------

function comboFromEvent(e) {
  if (!e.code || MODIFIER_CODES.has(e.code)) return null; // só modificador: ainda falta a tecla
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  parts.push(e.code);
  return parts.join('+');
}

const KEY_LABELS = {
  Space: 'Espaço', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: 'Ç/;', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlRo: '/',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Escape: 'Esc',
  Backspace: 'Backspace', Tab: 'Tab', CapsLock: 'Caps Lock', Insert: 'Insert', Delete: 'Delete',
  Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down', Pause: 'Pause', ScrollLock: 'Scroll Lock',
};

function keyLabel(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Mouse/.test(code)) return code;
  return KEY_LABELS[code] || code;
}

function comboLabel(combo) {
  if (!combo) return '';
  return combo.split('+').map((p) => (p === 'Meta' ? 'Super' : (['Ctrl', 'Alt', 'Shift'].includes(p) ? p : keyLabel(p)))).join(' + ');
}

function comboHasModifier(combo) {
  return /^(Ctrl|Alt|Shift|Meta)\+/.test(combo || '');
}

function comboKeyCode(combo) {
  const parts = String(combo || '').split('+');
  return parts[parts.length - 1] || '';
}

// ---------- o que cada atalho faz ----------

// a mesma tecla pode chegar pelo app (global) e pela página quase juntas: age uma vez só
function shortcutDuplicate(origin, id, down) {
  const now = performance.now();
  const other = origin === 'global' ? 'page' : 'global';
  lastShortcutAt.set(`${origin}:${id}:${down}`, now);
  return now - (lastShortcutAt.get(`${other}:${id}:${down}`) || -1e9) < 300;
}

function handleShortcutAction(id, down, origin) {
  if (shortcutDuplicate(origin, id, down)) return;
  if (id === 'falar') { setPushToTalk(down, origin); return; }
  if (!down) return; // mutar/ensurdecer agem ao apertar
  if (!voiceChannel) return; // fora da call não tem o que mutar
  if (id === 'mutar') {
    if (muteBtn.disabled) { toast('nenhum microfone disponível', 'error'); return; }
    setMuted(!isMuted);
  } else if (id === 'ensurdecer') {
    setDeafened(!isDeafened);
  }
}

// ---------- apertar para falar ----------

function pushToTalkActive() {
  return !!shortcutPrefs.pttMode;
}

// 18-call-audio.js (applyLocalTrackState): o microfone só transmite com isso true
function pushToTalkAllowsTransmit() {
  return !pushToTalkActive() || pttHeld;
}

function setPushToTalk(down, origin) {
  if (!pushToTalkActive()) return;
  clearTimeout(pttReleaseTimer);
  if (down) {
    pttHeldBy = origin;
    if (pttHeld) return;
    pttHeld = true;
    applyLocalTrackState();
    updatePushToTalkIndicator();
    return;
  }
  if (pttHeldBy && origin !== pttHeldBy) return; // soltou pelo outro caminho: quem segurou é que solta
  pttReleaseTimer = setTimeout(() => {
    pttHeld = false;
    pttHeldBy = null;
    applyLocalTrackState();
    publishLocalSpeaking(false);
    updatePushToTalkIndicator();
  }, PTT_RELEASE_MS);
}

// o botão de mutar mostra quando o "apertar para falar" está segurando o microfone fechado
function updatePushToTalkIndicator() {
  const waiting = pushToTalkActive() && !pttHeld && !isMuted;
  for (const btn of [muteBtn, callViewMuteBtn]) {
    if (!btn) continue;
    btn.classList.toggle('is-ptt-waiting', waiting);
    if (pushToTalkActive() && !btn.disabled) {
      btn.title = `apertar para falar: segure ${comboLabel(shortcutPrefs.falar) || '(sem tecla — escolha em configurações › teclas de atalho)'}`;
    } else if (!btn.disabled) {
      btn.title = '';
    }
  }
}

// ---------- atalhos com o dusky na frente ----------

// canal de texto anterior/próximo na lista (Alt+↑ / Alt+↓, igual Discord)
function moveTextChannel(step) {
  const items = [...channelGroups.querySelectorAll('.channel-item')].filter((el) => {
    const ch = channels.find((c) => String(c.id) === el.dataset.channelId);
    return ch && ch.type !== 'voice' && !ch.world_scene;
  });
  if (!items.length) return;
  let i = items.findIndex((el) => el.classList.contains('active'));
  i = i < 0 ? (step > 0 ? -1 : 0) : i;
  const next = items[(i + step + items.length) % items.length];
  const ch = channels.find((c) => String(c.id) === next.dataset.channelId);
  if (ch) selectChannel(ch);
}

let shortcutRecording = null; // { id, btn } enquanto grava uma tecla nova nas configurações

document.addEventListener('keydown', (e) => {
  if (shortcutRecording) return; // quem trata é o gravador (lá embaixo)
  const combo = comboFromEvent(e);
  // apertar pra falar: a tecla escolhida (sem repetir enquanto segura)
  if (pushToTalkActive() && shortcutPrefs.falar && e.code === comboKeyCode(shortcutPrefs.falar)
      && (combo === shortcutPrefs.falar || pttHeld)) {
    if (!e.repeat) handleShortcutAction('falar', true, 'page');
    if (comboHasModifier(shortcutPrefs.falar)) e.preventDefault();
    return;
  }
  if (!combo) return;
  if (combo === shortcutPrefs.mutar) { e.preventDefault(); handleShortcutAction('mutar', true, 'page'); return; }
  if (combo === shortcutPrefs.ensurdecer) { e.preventDefault(); handleShortcutAction('ensurdecer', true, 'page'); return; }
  if (combo === 'Alt+ArrowUp' || combo === 'Alt+ArrowDown') {
    e.preventDefault();
    moveTextChannel(combo === 'Alt+ArrowUp' ? -1 : 1);
    return;
  }
  if (combo === 'Ctrl+KeyF' && !chatView.hidden && typeof chatSearchInput !== 'undefined' && chatSearchInput) {
    e.preventDefault();
    chatSearchInput.focus();
    chatSearchInput.select();
    return;
  }
  if (combo === 'Ctrl+Slash' || combo === 'Ctrl+Shift+Slash' || combo === 'Ctrl+IntlRo') {
    e.preventDefault();
    openSettingsModal('atalhos');
  }
}, true);

document.addEventListener('keyup', (e) => {
  if (shortcutRecording || !pushToTalkActive() || !shortcutPrefs.falar) return;
  if (e.code === comboKeyCode(shortcutPrefs.falar)) handleShortcutAction('falar', false, 'page');
}, true);

// a janela perdeu o foco com a tecla de falar apertada pela página: o keyup não vai chegar
window.addEventListener('blur', () => {
  if (pttHeld && pttHeldBy === 'page') handleShortcutAction('falar', false, 'page');
});

// ---------- atalhos globais (app desktop) ----------

function desktopShortcutsApi() {
  return (window.duskyDesktop && window.duskyDesktop.shortcuts) || null;
}

async function configureGlobalShortcuts() {
  const api = desktopShortcutsApi();
  if (!api) return;
  const list = [];
  if (shortcutPrefs.global) {
    if (shortcutPrefs.mutar) list.push({ id: 'mutar', accel: shortcutPrefs.mutar, description: 'mutar/desmutar o microfone no dusky' });
    if (shortcutPrefs.ensurdecer) list.push({ id: 'ensurdecer', accel: shortcutPrefs.ensurdecer, description: 'ensurdecer/desensurdecer no dusky' });
  }
  // apertar pra falar no app é sempre global (senão não funcionaria no jogo)
  if (shortcutPrefs.pttMode && shortcutPrefs.falar) list.push({ id: 'falar', accel: shortcutPrefs.falar, description: 'segure pra falar no dusky' });
  try {
    globalShortcutStatus = await api.configure(list);
  } catch (err) {
    globalShortcutStatus = { backend: 'none', active: [], errors: [String((err && err.message) || err)] };
  }
  renderShortcutSettings();
}

if (desktopShortcutsApi()) {
  desktopShortcutsApi().onShortcut((ev) => {
    if (ev && typeof ev.id === 'string') handleShortcutAction(ev.id, !!ev.down, 'global');
  });
  configureGlobalShortcuts();
}

// ---------- aba "teclas de atalho" das configurações ----------

const shortcutsPanel = document.querySelector('[data-settings-panel="atalhos"]');

function renderShortcutSettings() {
  if (!shortcutsPanel) return;
  for (const btn of shortcutsPanel.querySelectorAll('[data-shortcut]')) {
    const id = btn.dataset.shortcut;
    const recording = shortcutRecording && shortcutRecording.id === id;
    btn.classList.toggle('is-recording', !!recording);
    btn.textContent = recording ? 'aperte as teclas… (Esc cancela)' : (comboLabel(shortcutPrefs[id]) || 'sem tecla — clique pra escolher');
  }
  const ptt = document.getElementById('pttModeToggle');
  if (ptt) ptt.checked = !!shortcutPrefs.pttMode;
  const glob = document.getElementById('globalShortcutsToggle');
  const globRow = document.getElementById('globalShortcutsRow');
  if (globRow) globRow.hidden = !desktopShortcutsApi();
  if (glob) glob.checked = !!shortcutPrefs.global;

  const statusEl = document.getElementById('shortcutStatus');
  if (!statusEl) return;
  const lines = [];
  if (!desktopShortcutsApi()) {
    lines.push('no navegador os atalhos só funcionam com o dusky aberto na frente. No app pro computador eles funcionam até no jogo.');
  } else if (globalShortcutStatus) {
    const st = globalShortcutStatus;
    const names = { mutar: 'mutar', ensurdecer: 'ensurdecer', falar: 'falar' };
    if (st.active && st.active.length) lines.push(`funcionando em segundo plano: ${st.active.map((id) => names[id] || id).join(', ')}.`);
    for (const [id, trig] of st.bound || []) if (trig) lines.push(`${names[id] || id}: o sistema ligou em ${trig}.`);
    for (const err of st.errors || []) lines.push(`⚠ ${err}`);
    if (st.hint) lines.push(st.hint);
  }
  if (shortcutPrefs.pttMode && !shortcutPrefs.falar) lines.push('⚠ escolha a tecla de falar — sem ela o microfone fica fechado.');
  if (desktopShortcutsApi() && shortcutPrefs.pttMode && shortcutPrefs.falar && !comboHasModifier(shortcutPrefs.falar)) {
    lines.push('a tecla de falar sem Ctrl/Alt/Shift fica reservada pro dusky enquanto ele estiver aberto (nos outros programas ela não digita).');
  }
  statusEl.textContent = lines.join('\n');
  statusEl.hidden = !lines.length;
}

function applyShortcutChange() {
  saveShortcutPrefs();
  renderShortcutSettings();
  applyLocalTrackState();
  updatePushToTalkIndicator();
  configureGlobalShortcuts();
}

function startShortcutRecording(id, btn) {
  shortcutRecording = { id, btn };
  renderShortcutSettings();
  btn.focus();
}

// gravando: a próxima combinação vira a tecla (Esc cancela, Backspace/Delete apaga)
document.addEventListener('keydown', (e) => {
  if (!shortcutRecording) return;
  e.preventDefault();
  e.stopPropagation();
  const { id } = shortcutRecording;
  if (e.code === 'Escape') { shortcutRecording = null; renderShortcutSettings(); return; }
  if ((e.code === 'Backspace' || e.code === 'Delete') && !e.ctrlKey && !e.altKey) {
    shortcutRecording = null;
    shortcutPrefs[id] = '';
    applyShortcutChange();
    return;
  }
  const combo = comboFromEvent(e);
  if (!combo) return; // só modificador até agora — espera a tecla
  const clash = ['mutar', 'ensurdecer', 'falar'].find((other) => other !== id && shortcutPrefs[other] === combo);
  if (clash) {
    toast(`essa tecla já é a de ${clash}`, 'error');
    return;
  }
  shortcutRecording = null;
  shortcutPrefs[id] = combo;
  applyShortcutChange();
}, true);

if (shortcutsPanel) {
  shortcutsPanel.addEventListener('click', (e) => {
    const rec = e.target.closest('[data-shortcut]');
    if (rec) { startShortcutRecording(rec.dataset.shortcut, rec); return; }
    const reset = e.target.closest('[data-shortcut-reset]');
    if (reset) {
      const id = reset.dataset.shortcutReset;
      shortcutPrefs[id] = SHORTCUT_DEFAULTS[id];
      applyShortcutChange();
    }
  });
  const ptt = document.getElementById('pttModeToggle');
  if (ptt) ptt.addEventListener('change', () => {
    shortcutPrefs.pttMode = ptt.checked;
    pttHeld = false;
    pttHeldBy = null;
    applyShortcutChange();
    if (ptt.checked && !shortcutPrefs.falar) startShortcutRecording('falar', shortcutsPanel.querySelector('[data-shortcut="falar"]'));
  });
  const glob = document.getElementById('globalShortcutsToggle');
  if (glob) glob.addEventListener('change', () => {
    shortcutPrefs.global = glob.checked;
    applyShortcutChange();
  });
  renderShortcutSettings();
}
updatePushToTalkIndicator();
