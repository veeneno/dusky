// didiscord — Rich presence ("jogando X")
// Parte 24 de 25 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
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
