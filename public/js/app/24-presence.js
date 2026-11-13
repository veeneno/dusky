// didiscord — Rich presence ("jogando X")
// Parte 24 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - "jogando X" (rich presence)

// ---------- "jogando X" (rich presence) ----------
// O app desktop descobre o jogo aberto neste computador (electron/presence.js) e avisa aqui; o
// site repassa pro servidor (activity_set), que mostra pros amigos. No navegador não tem detecção.
// A opção e os jogos cadastrados ficam neste aparelho (localStorage): o que está aberto é coisa
// do computador, não da conta.
const PRESENCE_ENABLED_KEY = 'didiscord:presenceEnabled';
const PRESENCE_GAMES_KEY = 'didiscord:presenceGames';
const presenceApi = () => (window.didiscordDesktop && window.didiscordDesktop.presence) || null;
let myActivity = null; // { name, startedAt } — o que o app detectou agora

function getPresenceEnabled() {
  try { return localStorage.getItem(PRESENCE_ENABLED_KEY) !== '0'; } catch (_) { return true; } // ligado por padrão
}
function getPresenceGames() {
  try {
    const list = JSON.parse(localStorage.getItem(PRESENCE_GAMES_KEY) || '[]');
    return Array.isArray(list) ? list.filter((g) => g && typeof g.exe === 'string' && typeof g.name === 'string').slice(0, 100) : [];
  } catch (_) { return []; }
}
function savePresenceGames(list) {
  try { localStorage.setItem(PRESENCE_GAMES_KEY, JSON.stringify(list.slice(0, 100))); } catch (_) { /* vale nesta página */ }
}

// manda o estado atual pro servidor (ele ignora repetição, então dá pra chamar à vontade)
function sendMyActivity() {
  const a = getPresenceEnabled() ? myActivity : null;
  Realtime.send('activity_set', a ? { name: a.name, startedAt: a.startedAt } : { name: '' });
}

function configurePresence() {
  const api = presenceApi();
  if (!api) return;
  const enabled = getPresenceEnabled();
  api.configure({ enabled, custom: getPresenceGames() });
  if (!enabled) { myActivity = null; sendMyActivity(); }
}

function initPresence() {
  renderPresenceSettings();
  const api = presenceApi();
  if (!api) return; // navegador, ou app desktop antigo (antes da 0.5.1)
  api.onActivity((a) => {
    myActivity = a && a.name ? { name: String(a.name), startedAt: Number(a.startedAt) || Date.now() } : null;
    sendMyActivity();
    renderPresenceSettings();
  });
  configurePresence();
  // reenvia de tempos em tempos: cobre reconexão do site e reinício do servidor
  setInterval(sendMyActivity, 60000);
}

function setUserActivity(userId, activity) {
  const value = activity && activity.name ? activity : null;
  const u = usersById.get(userId);
  if (u) u.activity = value;
  if (currentUser && currentUser.id === userId) currentUser.activity = value;
  for (const d of dms) if (d.user && d.user.id === userId) d.user.activity = value;
  renderMembers();
  if (currentChannel && currentChannel.dm && currentChannel.userId === userId) renderDmProfilePanel();
}

function formatActivitySince(startedAt) {
  const min = Math.max(0, Math.floor((Date.now() - Number(startedAt)) / 60000));
  if (!Number.isFinite(min) || min < 1) return 'começou agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

// configurações → app → atividade
function renderPresenceSettings() {
  const host = document.getElementById('presenceSettings');
  if (!host) return;
  const api = presenceApi();
  const enabled = getPresenceEnabled();
  host.replaceChildren();
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  const toggle = make('label', 'settings-toggle');
  const text = make('span', 'settings-toggle-text');
  text.append(make('strong', null, 'mostrar o que estou jogando'), make('small', null, 'aparece "jogando …" pros seus amigos, na lista de membros e no seu perfil'));
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = enabled;
  box.addEventListener('change', () => {
    try { localStorage.setItem(PRESENCE_ENABLED_KEY, box.checked ? '1' : '0'); } catch (_) { /* vale nesta página */ }
    configurePresence();
    renderPresenceSettings();
  });
  toggle.append(text, box);
  host.append(toggle);

  if (!api) {
    host.append(make('p', 'field-help', window.didiscordDesktop
      ? 'este app é de uma versão antiga: atualize pra 0.5.1 ou mais nova pra ele detectar os jogos.'
      : 'a detecção só funciona no app do computador (o navegador não enxerga os programas abertos).'));
    return;
  }
  if (!enabled) {
    host.append(make('p', 'field-help', 'desligado: o app não olha os programas abertos e nada é enviado.'));
    return;
  }

  host.append(make('p', 'field-help presence-now', myActivity ? `detectado agora: ${myActivity.name}` : 'nenhum jogo detectado agora. Jogos da Steam e os mais conhecidos aparecem sozinhos; os outros você adiciona abaixo.'));

  const games = getPresenceGames();
  if (games.length) {
    const list = make('div', 'presence-games');
    for (const g of games) {
      const row = make('div', 'presence-game');
      const label = make('span', 'presence-game-name', g.name);
      const exe = make('span', 'presence-game-exe', g.exe);
      const del = make('button', 'btn btn-ghost btn-sm', 'remover');
      del.type = 'button';
      del.addEventListener('click', () => {
        savePresenceGames(getPresenceGames().filter((x) => x.exe !== g.exe));
        configurePresence();
        renderPresenceSettings();
      });
      row.append(label, exe, del);
      list.append(row);
    }
    host.append(list);
  }

  const addBtn = make('button', 'btn btn-ghost', 'adicionar jogo');
  addBtn.type = 'button';
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    let found = [];
    try { found = await api.candidates(); } catch (_) { found = []; }
    addBtn.remove();
    const known = new Set(getPresenceGames().map((g) => g.exe));
    found = (found || []).filter((c) => c && c.exe && !known.has(c.exe));
    if (!found.length) {
      host.append(make('p', 'field-help', 'não achei nenhum programa que pareça um jogo aberto agora. Abra o jogo e tente de novo.'));
      return;
    }
    const form = make('div', 'presence-add');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'programa aberto');
    for (const c of found) {
      const opt = document.createElement('option');
      opt.value = c.exe;
      opt.textContent = c.label || c.exe;
      select.append(opt);
    }
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 64;
    name.placeholder = 'nome que aparece (ex: Hollow Knight)';
    name.setAttribute('aria-label', 'nome do jogo');
    const save = make('button', 'btn btn-primary', 'salvar');
    save.type = 'button';
    const commit = () => {
      const label = name.value.trim().replace(/\s+/g, ' ');
      if (!label) { name.focus(); return; }
      savePresenceGames([...getPresenceGames().filter((x) => x.exe !== select.value), { exe: select.value, name: label }]);
      configurePresence();
      renderPresenceSettings();
    };
    save.addEventListener('click', commit);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    form.append(select, name, save);
    host.append(make('p', 'field-help', 'escolha o programa do jogo (ele precisa estar aberto) e o nome que deve aparecer:'), form);
    name.focus();
  });
  host.append(addBtn);
}

// ---------- status: ativo (bolinha verde) / inativo (lua roxa) ----------
// Escolhido clicando no avatar da barra de perfil (ou pelo ícone do app na bandeja). Fica salvo na
// conta (users.presence_status no servidor), então vale em qualquer aparelho.
//   ativo:   toca som de tudo — gente entrando/saindo da call, menções e DMs — e mostra notificação
//   inativo: só os sons da call (gente entrando/saindo); mensagem não toca som nem notificação
// Desconectado continua aparecendo offline, qualquer que seja o status escolhido.
const PRESENCE_STATUS_INFO = {
  online: { label: 'ativo', help: 'sons e notificações de tudo' },
  idle: { label: 'inativo', help: 'só os sons de entrar e sair da call' },
};

// os outros usuários vêm com `status`; eu (/api/auth/me) venho com `presence_status`
function userPresenceStatus(u) {
  const s = u && (u.status || u.presence_status);
  return s === 'idle' ? 'idle' : 'online';
}
function myPresenceStatus() { return userPresenceStatus(currentUser); }

// classes da bolinha: '' = offline, ' is-online' = ativo, ' is-online is-idle' = inativo (lua)
function presenceDotClass(u, online = !!(u && u.online)) {
  if (!online) return '';
  return userPresenceStatus(u) === 'idle' ? ' is-online is-idle' : ' is-online';
}
function presenceLabel(u, online = !!(u && u.online)) {
  return online ? PRESENCE_STATUS_INFO[userPresenceStatus(u)].label : 'offline';
}

// a bolinha do meu avatar na barra de perfil (lá embaixo, à esquerda)
function applyMyPresenceDot() {
  const dot = document.getElementById('profilePresenceDot');
  if (!dot || !currentUser) return;
  const idle = myPresenceStatus() === 'idle';
  dot.classList.add('is-online');
  dot.classList.toggle('is-idle', idle);
  dot.title = PRESENCE_STATUS_INFO[idle ? 'idle' : 'online'].label;
}

// alguém (inclusive eu, por outro aparelho) mudou de status
function setUserPresenceStatus(userId, status) {
  const value = status === 'idle' ? 'idle' : 'online';
  const u = usersById.get(userId);
  if (u) u.status = value;
  for (const d of dms) if (d.user && d.user.id === userId) d.user.status = value;
  if (currentUser && currentUser.id === userId) {
    currentUser.presence_status = value;
    currentUser.status = value;
    applyUserToProfileBar(currentUser);
    reportStatusToDesktop();
  }
  renderMembers();
  if (currentServerId == null) renderChannels();
  if (currentChannel && currentChannel.dm && currentChannel.userId === userId) renderDmProfilePanel();
}

function setMyPresenceStatus(status) {
  if (!currentUser || !PRESENCE_STATUS_INFO[status]) return;
  if (myPresenceStatus() === status) return;
  Realtime.send('status_set', { status }); // sem conexão agora: reenviado ao reconectar (ver abaixo)
  setUserPresenceStatus(currentUser.id, status);
}

// o servidor ignora repetição, então dá pra reenviar à vontade (cobre mudar o status sem conexão)
function sendMyPresenceStatus() {
  if (currentUser) Realtime.send('status_set', { status: myPresenceStatus() });
}

// app desktop: a bandeja mostra o status e deixa trocar por lá (electron/main.js)
function reportStatusToDesktop() {
  const api = window.didiscordDesktop && window.didiscordDesktop.status;
  if (api && typeof api.report === 'function') {
    try { api.report(myPresenceStatus()); } catch (_) { /* app antigo */ }
  }
}

function initPresenceStatus() {
  applyMyPresenceDot();
  reportStatusToDesktop();
  const api = window.didiscordDesktop && window.didiscordDesktop.status;
  if (api && typeof api.onSetRequest === 'function') api.onSetRequest((s) => setMyPresenceStatus(s));
}

// menu que abre acima do avatar da barra de perfil
const MOON_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--idle)" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg>';
const ONLINE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="var(--online)"/></svg>';

function openStatusMenu() {
  closeParticipantContextMenu(); // reaproveita o mesmo "um menu aberto por vez" dos menus de contexto
  const menu = document.createElement('div');
  menu.className = 'participant-context-menu status-menu';
  const current = myPresenceStatus();
  for (const status of ['online', 'idle']) {
    const info = PRESENCE_STATUS_INFO[status];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'participant-context-menu-item status-menu-item' + (status === current ? ' is-current' : '');
    btn.innerHTML = `<span class="status-menu-icon">${status === 'idle' ? MOON_ICON : ONLINE_ICON}</span><span class="status-menu-text"><strong></strong><small></small></span>`;
    btn.querySelector('strong').textContent = info.label;
    btn.querySelector('small').textContent = info.help;
    btn.addEventListener('click', () => { setMyPresenceStatus(status); closeParticipantContextMenu(); });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  openContextMenuEl = menu;

  // logo acima da barra de perfil, alinhado com o avatar
  const anchor = document.getElementById('profileAvatarWrap').getBoundingClientRect();
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8)) + 'px';
  menu.style.top = Math.max(8, anchor.top - rect.height - 10) + 'px';

  setTimeout(() => {
    document.addEventListener('mousedown', handleContextMenuOutsideClick, true);
    document.addEventListener('keydown', handleContextMenuEscape, true);
  }, 0);
}
