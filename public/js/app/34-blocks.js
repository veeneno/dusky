// dusky — Bloquear pessoas e fechar conversas
// Parte 34 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - quem eu bloqueei (blockedUserIds, em 01-state.js): carregar, bloquear, desbloquear
//   - mensagens de quem eu bloqueei aparecem recolhidas ("mensagem de alguém bloqueado — mostrar")
//   - aba "bloqueados" das configurações
//   - "fechar conversa" na lista de DMs
//
// A regra de verdade fica no servidor (server/access.js): na DM, ninguém escreve se um dos dois
// bloqueou o outro, e quem foi bloqueado não abre DM nova. Aqui é só a parte que se vê.

async function loadBlocks() {
  try {
    const res = await fetch('/api/blocks');
    if (!res.ok) return;
    setBlockedIds((await res.json()).blockedIds);
  } catch (_) { /* sem conexão: fica a lista anterior */ }
}

function setBlockedIds(ids) {
  blockedUserIds = new Set((ids || []).map(Number));
  refreshBlockedMessages();
  if (currentSettingsTab === 'bloqueados' && !settingsModalBackdrop.hidden) renderBlockedSettings();
}

function isUserBlocked(userId) {
  return blockedUserIds.has(Number(userId));
}

// recolhe (ou solta) uma mensagem já montada, conforme o autor (el.dataset.userId, ver buildMessageEl)
function applyBlockedState(el) {
  const blocked = isUserBlocked(el.dataset.userId);
  let bar = el.querySelector(':scope > .msg-blocked-bar');
  if (!blocked) {
    el.classList.remove('is-blocked', 'is-blocked-open');
    if (bar) bar.remove();
    return;
  }
  el.classList.add('is-blocked');
  if (!bar) {
    bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'msg-blocked-bar';
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      el.classList.toggle('is-blocked-open');
      updateBlockedBarLabel(el, bar);
    });
    el.prepend(bar);
  }
  updateBlockedBarLabel(el, bar);
}

function updateBlockedBarLabel(el, bar) {
  bar.textContent = el.classList.contains('is-blocked-open')
    ? 'mensagem de alguém bloqueado — esconder'
    : 'mensagem de alguém bloqueado — mostrar';
}

function refreshBlockedMessages() {
  document.querySelectorAll('.msg-group[data-user-id]').forEach(applyBlockedState);
}

async function blockUser(user) {
  if (!user || (currentUser && user.id === currentUser.id)) return;
  const ok = await ssAsk({
    title: `bloquear ${user.username}`,
    text: `Vocês não vão mais poder trocar mensagens diretas, e as mensagens de ${user.username} nos servidores aparecem recolhidas pra você. ${user.username} não é avisado.`,
    okLabel: 'bloquear',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/blocks/${user.id}`, { method: 'PUT' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || 'não deu pra bloquear', 'error');
    setBlockedIds(data.blockedIds);
    toast(`${user.username} foi bloqueado`);
  } catch (_) { toast('sem conexão', 'error'); }
}

async function unblockUser(user) {
  if (!user) return;
  try {
    const res = await fetch(`/api/blocks/${user.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || 'não deu pra desbloquear', 'error');
    setBlockedIds(data.blockedIds);
    toast(`${user.username} foi desbloqueado`);
  } catch (_) { toast('sem conexão', 'error'); }
}

// item "bloquear"/"desbloquear" no menu de botão direito de uma pessoa (03-context-menus.js)
function appendBlockMenuItem(menu, userId, username) {
  if (userId === BOT_USER_ID || (currentUser && userId === currentUser.id)) return;
  const blocked = isUserBlocked(userId);
  const section = document.createElement('div');
  section.className = 'participant-context-menu-admin';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'participant-context-menu-item' + (blocked ? '' : ' is-danger');
  b.textContent = blocked ? 'desbloquear' : 'bloquear';
  b.addEventListener('click', () => {
    closeParticipantContextMenu();
    const user = findUser(userId) || { id: userId, username };
    if (blocked) unblockUser(user); else blockUser(user);
  });
  section.appendChild(b);
  menu.appendChild(section);
}

// ---------- aba "bloqueados" das configurações ----------

async function renderBlockedSettings() {
  const list = document.getElementById('blockedList');
  if (!list) return;
  list.textContent = 'carregando...';
  let users = [];
  try {
    const res = await fetch('/api/blocks');
    if (!res.ok) throw new Error();
    const data = await res.json();
    users = data.users || [];
    blockedUserIds = new Set((data.blockedIds || []).map(Number));
  } catch (_) {
    list.textContent = 'não deu pra carregar a lista';
    return;
  }
  list.innerHTML = '';
  if (!users.length) {
    const empty = document.createElement('p');
    empty.className = 'field-help';
    empty.textContent = 'você não bloqueou ninguém.';
    list.appendChild(empty);
    return;
  }
  for (const u of users) {
    rememberUser(u);
    const row = document.createElement('div');
    row.className = 'blocked-row';
    row.innerHTML = `
        <span class="dm-item-avatar">${memberAvatarInner(u)}</span>
        <span class="blocked-row-name"></span>
        <button type="button" class="btn btn-ghost">desbloquear</button>
      `;
    row.querySelector('.blocked-row-name').textContent = u.username;
    row.querySelector('button').addEventListener('click', () => unblockUser(u));
    list.appendChild(row);
  }
}

// ---------- fechar conversa (DM) ----------

// some da MINHA lista até chegar mensagem nova (o servidor guarda em dm_members.hidden_at)
async function closeDmConversation(dm) {
  try {
    const res = await fetch(`/api/dms/${dm.id}/close`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return toast(data.error || 'não deu pra fechar a conversa', 'error');
    }
    removeDmFromList(dm.id);
  } catch (_) { toast('sem conexão', 'error'); }
}

function removeDmFromList(channelId) {
  const i = dms.findIndex((d) => d.id === channelId);
  if (i < 0) return;
  dms.splice(i, 1);
  const wasOpen = currentChannel && currentChannel.id === channelId;
  if (currentServerId == null) {
    if (wasOpen) { currentChannel = null; showHomeEmpty(); }
    renderChannels();
  }
  renderRail();
}

Realtime.on('blocks_updated', ({ blockedIds }) => setBlockedIds(blockedIds));
Realtime.on('dm_closed', ({ channelId }) => removeDmFromList(Number(channelId)));

loadBlocks();
