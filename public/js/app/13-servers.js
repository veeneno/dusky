// didiscord — Servidores: barra, menu, convites, configurações e conversas diretas
// Parte 13 de 25 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - avisos rápidos (toast)
//   - tela vazia da área principal
//   - não lidas
//   - barra de servidores
//   - menu do servidor (clicar no nome, no topo da lateral)
//   - criar / entrar num servidor
//   - convidar pessoas
//   - configurações do servidor (só dono)
//   - aceitar convite vindo do link (/invite/CODIGO -> /app.html?invite=CODIGO)
//   - mensagens diretas

// ---------- avisos rápidos (toast) ----------

const toastHost = document.getElementById('toastHost');

function toast(text, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'error' ? ' is-error' : '');
  el.textContent = text;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  }, 4000);
}

// ---------- tela vazia da área principal ----------

function setMainEmpty(title, text, actions = []) {
  mainEmpty.innerHTML = '';
  const h = document.createElement('h2');
  h.className = 'display';
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = text;
  mainEmpty.append(h, p);
  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'main-empty-actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`;
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      row.appendChild(b);
    }
    mainEmpty.appendChild(row);
  }
  chatView.hidden = true;
  callView.hidden = true;
  mainEmpty.hidden = false;
}

function showHomeEmpty() {
  if (servers.length === 0) {
    setMainEmpty(
      'bem-vindo ao didiscord',
      'Você ainda não está em nenhum servidor. Crie o seu ou entre com o link de convite que um amigo te mandou.',
      [
        { label: 'criar servidor', primary: true, onClick: () => openAddServerModal('create') },
        { label: 'entrar com convite', onClick: () => openAddServerModal('join') },
      ]
    );
  } else if (dms.length === 0) {
    setMainEmpty(
      'nenhuma conversa ainda',
      'Clique em alguém da lista de membros de um servidor e escolha "mandar mensagem", ou comece por aqui.',
      [{ label: 'nova conversa', primary: true, onClick: openNewDmModal }]
    );
  } else {
    setMainEmpty('suas conversas', 'Escolha uma conversa na lateral pra continuar de onde parou.',
      window.didiscordDesktop ? [] : [{ label: 'baixar o app pro computador', onClick: () => window.open('/baixar', '_blank') }]);
  }
}

// ---------- não lidas ----------
// canal -> { servidor (null = DM), quantas menções }. O ponto lido fica no servidor
// (channel_reads), então sobrevive a recarregar a página e vale em todas as abas/no app.

function markChannelUnread(channelId, serverId, addMentions = 0) {
  const cur = unreadChannels.get(channelId) || { serverId: serverId == null ? null : serverId, mentions: 0 };
  cur.mentions += addMentions;
  unreadChannels.set(channelId, cur);
  updateUnreadTitle();
}

function markChannelRead(channelId) {
  unreadChannels.delete(channelId);
  syncRead(channelId);
  updateUnreadTitle();
}

function serverHasUnread(serverId) {
  for (const u of unreadChannels.values()) if (u.serverId === serverId) return true;
  return false;
}

// na bolinha da tela inicial: quantas mensagens diretas não lidas
function dmUnreadCount() {
  let n = 0;
  for (const u of unreadChannels.values()) if (u.serverId === null) n += Math.max(1, u.mentions || 0);
  return n;
}

function rememberLastChannel(serverId, channelId) {
  try { localStorage.setItem(`didiscord:lastChannel:${serverId}`, String(channelId)); } catch (_) { /* sem storage, sem memória */ }
}

function lastChannelOf(serverId) {
  try { return Number(localStorage.getItem(`didiscord:lastChannel:${serverId}`)) || null; } catch (_) { return null; }
}

// ---------- barra de servidores ----------

const railHomeBtn = document.getElementById('railHomeBtn');
const railHomeBadge = document.getElementById('railHomeBadge');
const railServers = document.getElementById('railServers');
const railAddBtn = document.getElementById('railAddBtn');
const serverHeaderBtn = document.getElementById('serverHeaderBtn');
const serverHeaderName = document.getElementById('serverHeaderName');
const serverMenu = document.getElementById('serverMenu');

function currentServer() {
  return currentServerId == null ? null : (servers.find((s) => s.id === currentServerId) || null);
}

function renderRail() {
  railHomeBtn.classList.toggle('active', currentServerId == null);
  const dmUnread = dmUnreadCount();
  railHomeBadge.hidden = dmUnread === 0;
  railHomeBadge.textContent = dmUnread > 9 ? '9+' : String(dmUnread);

  railServers.innerHTML = '';
  for (const s of servers) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rail-item rail-server';
    if (s.id === currentServerId) b.classList.add('active');
    if (s.id !== currentServerId && serverHasUnread(s.id)) b.classList.add('has-unread');
    b.title = s.name;
    b.setAttribute('aria-label', s.name);
    b.innerHTML = `<span class="rail-pill"></span><span class="rail-icon">${serverIconInner(s)}</span>`;
    const mentions = serverMentionCount(s.id);
    if (mentions > 0) b.appendChild(mentionBadge(mentions, 'rail-badge'));
    b.addEventListener('click', () => selectServer(s.id));
    railServers.appendChild(b);
  }
}

function renderSidebarHeader() {
  const s = currentServer();
  closeServerMenu();
  if (!s) {
    serverHeaderName.textContent = 'mensagens diretas';
    serverHeaderBtn.classList.add('is-home');
    serverHeaderBtn.disabled = true;
    return;
  }
  serverHeaderName.textContent = s.name;
  serverHeaderBtn.classList.remove('is-home');
  serverHeaderBtn.disabled = false;
}

railHomeBtn.addEventListener('click', () => selectServer(null));
railAddBtn.addEventListener('click', () => openAddServerModal('choose'));

function upsertServer(server) {
  const i = servers.findIndex((s) => s.id === server.id);
  if (i >= 0) servers[i] = { ...servers[i], ...server };
  else servers.push(server);
  renderRail();
  if (server.id === currentServerId) {
    renderSidebarHeader();
    renderMembers(); // coroa do dono pode ter mudado
  }
}

// o servidor sumiu pra mim (apaguei, saí, fui expulso ou alguém apagou) — limpa tudo dele
function removeServerLocally(serverId, message) {
  servers = servers.filter((s) => s.id !== serverId);
  for (const [chId, sid] of [...unreadChannels.entries()]) if (sid === serverId) unreadChannels.delete(chId);
  if (voiceChannel && voiceChannel.server_id === serverId) leaveVoiceCall({ silent: true });
  if (currentServerId === serverId) selectServer(null);
  else renderRail();
  if (message) toast(message);
}

async function selectServer(serverId, opts = {}) {
  closeServerMenu();
  closeViewProfile();
  currentServerId = serverId;
  try { localStorage.setItem('didiscord:lastServer', serverId == null ? 'home' : String(serverId)); } catch (_) { /* ok */ }
  currentChannel = null;
  channels = [];
  channelCategories = [];
  serverRoles = [];
  myServerPerms = { is_admin: false, role_ids: [] };
  renderRail();
  renderSidebarHeader();

  if (serverId == null) {
    members = [];
    renderMembers();
    renderChannels();
    if (opts.dmId) {
      const dm = dms.find((d) => d.id === opts.dmId);
      if (dm) { selectChannel(dmChannel(dm)); return; }
    }
    showHomeEmpty();
    return;
  }

  renderChannels();
  setMainEmpty('', '');
  mainEmpty.hidden = true;

  const sid = serverId;
  let chRes;
  try {
    [chRes] = await Promise.all([fetch(`/api/servers/${sid}/channels`), loadMembers(), loadRoles()]);
  } catch (_) {
    if (sid === currentServerId) setMainEmpty('sem conexão', 'Não deu pra carregar esse servidor. Confere a internet e tenta de novo.');
    return;
  }
  if (sid !== currentServerId) return;
  if (!chRes.ok) {
    removeServerLocally(sid, 'você não tem mais acesso a esse servidor');
    return;
  }
  const chData = await chRes.json();
  channels = chData.channels;
  channelCategories = chData.categories || [];
  myServerPerms = chData.me || { is_admin: false, role_ids: [] };
  renderMembers(); // agora com as cores dos cargos
  renderChannels();

  const wanted = opts.channelId || lastChannelOf(sid);
  const target = channels.find((c) => c.id === wanted && c.type === 'text') || channels.find((c) => c.type === 'text');
  if (target) {
    selectChannel(target, target.id === opts.channelId && opts.aroundId ? { aroundId: opts.aroundId } : {});
  } else if (voiceChannel && voiceChannel.server_id === sid) {
    selectChannel(channels.find((c) => c.id === voiceChannel.id) || voiceChannel);
  } else {
    setMainEmpty('nada por aqui ainda', isAdminOfCurrentServer()
      ? 'Esse servidor ainda não tem canais de texto. Crie um pelo + na lateral.'
      : 'Esse servidor ainda não tem canais de texto.');
  }
}

// ---------- menu do servidor (clicar no nome, no topo da lateral) ----------

const MENU_ICONS = {
  invite: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
  settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  channel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  leave: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
};

function openServerMenu() {
  const s = currentServer();
  if (!s) return;
  const isOwner = s.owner_id === currentUser.id;
  const items = [
    { label: 'convidar pessoas', icon: 'invite', accent: true, onClick: openInviteModal },
    isAdminOfCurrentServer() && { label: 'configurações do servidor', icon: 'settings', onClick: openServerSettings },
    hasCurrentPermission('manage_channels') && { label: 'criar categoria', icon: 'channel', onClick: () => editCategory() },
    hasCurrentPermission('manage_channels') && { label: 'criar canal', icon: 'channel', onClick: () => openCreateModal('text') },
    !isOwner && { sep: true },
    !isOwner && { label: 'sair do servidor', icon: 'leave', danger: true, onClick: leaveCurrentServer },
  ].filter(Boolean);

  serverMenu.innerHTML = '';
  for (const it of items) {
    if (it.sep) {
      const sep = document.createElement('div');
      sep.className = 'server-menu-sep';
      serverMenu.appendChild(sep);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'server-menu-item' + (it.accent ? ' is-accent' : '') + (it.danger ? ' is-danger' : '');
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `<span></span>${MENU_ICONS[it.icon]}`;
    b.querySelector('span').textContent = it.label;
    b.addEventListener('click', () => { closeServerMenu(); it.onClick(); });
    serverMenu.appendChild(b);
  }
  serverMenu.hidden = false;
  serverHeaderBtn.classList.add('is-open');
  serverHeaderBtn.setAttribute('aria-expanded', 'true');
}

function closeServerMenu() {
  serverMenu.hidden = true;
  serverHeaderBtn.classList.remove('is-open');
  serverHeaderBtn.setAttribute('aria-expanded', 'false');
}

serverHeaderBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (serverMenu.hidden) openServerMenu(); else closeServerMenu();
});
document.addEventListener('click', (e) => {
  if (!serverMenu.hidden && !serverMenu.contains(e.target)) closeServerMenu();
});

async function leaveCurrentServer() {
  const s = currentServer();
  if (!s) return;
  if (!confirm(`sair de "${s.name}"? pra voltar, vai precisar de um convite novo.`)) return;
  const res = await fetch(`/api/servers/${s.id}/leave`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra sair do servidor', 'error'); return; }
  removeServerLocally(s.id, `você saiu de ${s.name}`);
}

async function kickMember(user) {
  const s = currentServer();
  if (!s) return;
  if (!confirm(`expulsar ${user.username} de "${s.name}"? a pessoa só volta com um convite novo.`)) return;
  const res = await fetch(`/api/servers/${s.id}/members/${user.id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra expulsar', 'error'); return; }
  toast(`${user.username} foi removido do servidor`);
}

// fecha um modal clicando fora dele ou em qualquer botão marcado com data-close
function wireModal(backdrop, onClose) {
  const close = () => { backdrop.hidden = true; if (onClose) onClose(); };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });
  return close;
}

// ---------- criar / entrar num servidor ----------

const addServerBackdrop = document.getElementById('addServerBackdrop');
const createServerName = document.getElementById('createServerName');
const createServerError = document.getElementById('createServerError');
const createServerBtn = document.getElementById('createServerBtn');
const joinServerInput = document.getElementById('joinServerInput');
const joinServerError = document.getElementById('joinServerError');
const joinServerBtn = document.getElementById('joinServerBtn');
const closeAddServer = wireModal(addServerBackdrop);

function setAddServerStep(step) {
  addServerBackdrop.querySelectorAll('.add-server-step').forEach((el) => {
    el.hidden = el.dataset.step !== step;
  });
  createServerError.textContent = '';
  joinServerError.textContent = '';
  if (step === 'create') {
    if (!createServerName.value) createServerName.value = `servidor de ${currentUser.username}`;
    createServerName.focus();
    createServerName.select();
  } else if (step === 'join') {
    joinServerInput.focus();
  }
}

function openAddServerModal(step) {
  createServerName.value = '';
  joinServerInput.value = '';
  addServerBackdrop.hidden = false;
  setAddServerStep(step || 'choose');
}

addServerBackdrop.addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]');
  if (go) setAddServerStep(go.dataset.goto);
});

async function submitCreateServer() {
  const name = createServerName.value.trim();
  if (!name) { createServerError.textContent = 'dá um nome pro servidor'; return; }
  createServerBtn.disabled = true;
  try {
    const res = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { createServerError.textContent = data.error || 'não deu pra criar o servidor'; return; }
    upsertServer(data.server);
    closeAddServer();
    await selectServer(data.server.id);
    toast(`${data.server.name} criado. Use "convidar pessoas" no menu do servidor pra chamar a galera.`);
  } finally {
    createServerBtn.disabled = false;
  }
}

createServerBtn.addEventListener('click', submitCreateServer);
createServerName.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCreateServer(); });

// aceita o link inteiro (https://site/invite/CODIGO) ou só o código
function parseInviteCode(value) {
  const v = String(value || '').trim();
  const fromLink = v.match(/invite\/([A-Za-z0-9]{4,32})/);
  if (fromLink) return fromLink[1];
  return /^[A-Za-z0-9]{4,32}$/.test(v) ? v : null;
}

async function acceptInvite(code) {
  const res = await fetch(`/api/invites/${encodeURIComponent(code)}/accept`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || 'não deu pra entrar nesse servidor' };
  upsertServer(data.server);
  await selectServer(data.server.id);
  if (!data.already_member) toast(`você entrou em ${data.server.name}`);
  return { server: data.server };
}

async function submitJoinServer() {
  const code = parseInviteCode(joinServerInput.value);
  if (!code) { joinServerError.textContent = 'isso não parece um link de convite'; return; }
  joinServerBtn.disabled = true;
  try {
    const result = await acceptInvite(code);
    if (result.error) { joinServerError.textContent = result.error; return; }
    closeAddServer();
  } finally {
    joinServerBtn.disabled = false;
  }
}

joinServerBtn.addEventListener('click', submitJoinServer);
joinServerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitJoinServer(); });

// ---------- convidar pessoas ----------

const inviteBackdrop = document.getElementById('inviteBackdrop');
const inviteServerName = document.getElementById('inviteServerName');
const inviteLinkInput = document.getElementById('inviteLinkInput');
const inviteCopyBtn = document.getElementById('inviteCopyBtn');
const inviteHint = document.getElementById('inviteHint');
const inviteExpirySelect = document.getElementById('inviteExpirySelect');
const inviteUsesSelect = document.getElementById('inviteUsesSelect');
wireModal(inviteBackdrop);
let inviteRequestToken = 0;

function describeInvite(inv) {
  const hours = Number(inviteExpirySelect.value);
  const expiry = hours === 0 ? 'Esse link nunca expira'
    : hours === 1 ? 'Esse link expira em 1 hora'
    : hours === 24 ? 'Esse link expira em 1 dia'
    : `Esse link expira em ${hours / 24} dias`;
  const uses = inv.max_uses ? ` e funciona ${inv.max_uses === 1 ? '1 vez' : `${inv.max_uses} vezes`}` : '';
  return `${expiry}${uses}.`;
}

async function generateInvite() {
  const s = currentServer();
  if (!s) return;
  const token = ++inviteRequestToken;
  inviteLinkInput.value = 'gerando link...';
  inviteCopyBtn.disabled = true;
  inviteHint.textContent = '';
  try {
    const res = await fetch(`/api/servers/${s.id}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_age_hours: Number(inviteExpirySelect.value), max_uses: Number(inviteUsesSelect.value) }),
    });
    const data = await res.json().catch(() => ({}));
    if (token !== inviteRequestToken) return;
    if (!res.ok) { inviteLinkInput.value = ''; inviteHint.textContent = data.error || 'não deu pra gerar o link'; return; }
    inviteLinkInput.value = `${window.location.origin}/invite/${data.invite.code}`;
    inviteHint.textContent = describeInvite(data.invite);
    inviteCopyBtn.disabled = false;
    inviteCopyBtn.textContent = 'copiar';
  } catch (_) {
    if (token === inviteRequestToken) inviteHint.textContent = 'sem conexão — tenta de novo';
  }
}

function openInviteModal() {
  const s = currentServer();
  if (!s) return;
  inviteServerName.textContent = s.name;
  inviteBackdrop.hidden = false;
  generateInvite();
}

inviteExpirySelect.addEventListener('change', generateInvite);
inviteUsesSelect.addEventListener('change', generateInvite);
inviteLinkInput.addEventListener('focus', () => inviteLinkInput.select());

inviteCopyBtn.addEventListener('click', async () => {
  const link = inviteLinkInput.value;
  let copied = false;
  try { await navigator.clipboard.writeText(link); copied = true; } catch (_) {
    inviteLinkInput.select();
    try { copied = document.execCommand('copy'); } catch (__) { copied = false; }
  }
  inviteCopyBtn.textContent = copied ? 'copiado' : 'copie manualmente';
  setTimeout(() => { inviteCopyBtn.textContent = 'copiar'; }, 1800);
});

// ---------- configurações do servidor (só dono) ----------

const serverSettingsBackdrop = document.getElementById('serverSettingsBackdrop');
const serverSettingsIcon = document.getElementById('serverSettingsIcon');
const serverSettingsIconBtn = document.getElementById('serverSettingsIconBtn');
const serverSettingsIconRemoveBtn = document.getElementById('serverSettingsIconRemoveBtn');
const serverSettingsIconInput = document.getElementById('serverSettingsIconInput');
const serverSettingsNameInput = document.getElementById('serverSettingsNameInput');
const serverSettingsError = document.getElementById('serverSettingsError');
const serverSettingsSaveBtn = document.getElementById('serverSettingsSaveBtn');
const serverSettingsDeleteBtn = document.getElementById('serverSettingsDeleteBtn');
const closeServerSettings = wireModal(serverSettingsBackdrop);

function refreshServerSettingsIcon() {
  const s = currentServer();
  if (!s) return;
  serverSettingsIcon.innerHTML = serverIconInner(s);
  serverSettingsIconRemoveBtn.hidden = !s.icon_url;
}

function openServerSettings() {
  const s = currentServer();
  if (!s || !isAdminOfCurrentServer()) return;
  serverSettingsNameInput.value = s.name;
  serverSettingsError.textContent = '';
  serverSettingsError.classList.remove('is-success');
  refreshServerSettingsIcon();
  serverDangerZone.hidden = s.owner_id !== currentUser.id;
  renderRolesList();
  loadRoles().then(renderRolesList);
  selectServerSettingsTab('overview');
  renderCategorySettings();
  serverSettingsBackdrop.hidden = false;
}

serverSettingsIcon.addEventListener('click', () => serverSettingsIconInput.click());
serverSettingsIconBtn.addEventListener('click', () => serverSettingsIconInput.click());

serverSettingsIconInput.addEventListener('change', async () => {
  const s = currentServer();
  const file = serverSettingsIconInput.files[0];
  if (!s || !file) return;
  const formData = new FormData();
  formData.append('icon', file);
  serverSettingsIconBtn.disabled = true;
  try {
    const res = await fetch(`/api/servers/${s.id}/icon`, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { serverSettingsError.textContent = data.error || 'não deu pra trocar o ícone'; return; }
    upsertServer(data.server);
    refreshServerSettingsIcon();
  } finally {
    serverSettingsIconBtn.disabled = false;
    serverSettingsIconInput.value = '';
  }
});

serverSettingsIconRemoveBtn.addEventListener('click', async () => {
  const s = currentServer();
  if (!s) return;
  const res = await fetch(`/api/servers/${s.id}/icon`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { serverSettingsError.textContent = data.error || 'não deu pra remover o ícone'; return; }
  upsertServer(data.server);
  refreshServerSettingsIcon();
});

serverSettingsSaveBtn.addEventListener('click', async () => {
  const s = currentServer();
  if (!s) return;
  serverSettingsError.classList.remove('is-success');
  const name = serverSettingsNameInput.value.trim();
  if (!name) { serverSettingsError.textContent = 'dá um nome pro servidor'; return; }
  serverSettingsSaveBtn.disabled = true;
  try {
    const res = await fetch(`/api/servers/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { serverSettingsError.textContent = data.error || 'não deu pra salvar'; return; }
    upsertServer(data.server);
    serverSettingsError.textContent = 'salvo';
    serverSettingsError.classList.add('is-success');
  } finally {
    serverSettingsSaveBtn.disabled = false;
  }
});

serverSettingsDeleteBtn.addEventListener('click', async () => {
  const s = currentServer();
  if (!s) return;
  const typed = prompt(`pra apagar "${s.name}" de vez, digite o nome do servidor:`);
  if (typed == null) return;
  if (typed.trim() !== s.name) { serverSettingsError.textContent = 'o nome não bate — nada foi apagado'; return; }
  const res = await fetch(`/api/servers/${s.id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { serverSettingsError.textContent = data.error || 'não deu pra apagar'; return; }
  closeServerSettings();
  removeServerLocally(s.id, `${s.name} foi apagado`);
});

// ---------- aceitar convite vindo do link (/invite/CODIGO -> /app.html?invite=CODIGO) ----------

const joinInviteBackdrop = document.getElementById('joinInviteBackdrop');
const joinInviteIcon = document.getElementById('joinInviteIcon');
const joinInviteLead = document.getElementById('joinInviteLead');
const joinInviteName = document.getElementById('joinInviteName');
const joinInviteCounts = document.getElementById('joinInviteCounts');
const joinInviteError = document.getElementById('joinInviteError');
const joinInviteAcceptBtn = document.getElementById('joinInviteAcceptBtn');
const closeJoinInvite = wireModal(joinInviteBackdrop);
let pendingInviteCode = null;

async function handleInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = parseInviteCode(params.get('invite'));
  if (!params.has('invite')) return;
  // tira o ?invite= da barra de endereço — recarregar a página não deve reabrir o convite
  window.history.replaceState(null, '', window.location.pathname);
  if (!code) return;

  pendingInviteCode = code;
  joinInviteError.textContent = '';
  joinInviteAcceptBtn.disabled = true;
  joinInviteAcceptBtn.hidden = false;
  joinInviteIcon.innerHTML = '';
  joinInviteLead.textContent = 'carregando convite...';
  joinInviteName.textContent = '';
  joinInviteCounts.innerHTML = '';
  joinInviteBackdrop.hidden = false;

  let invite = null;
  try {
    const res = await fetch(`/api/invites/${encodeURIComponent(code)}`);
    if (res.ok) invite = (await res.json()).invite;
  } catch (_) { /* tratado abaixo */ }

  if (!invite) {
    joinInviteLead.textContent = 'esse convite não funciona mais';
    joinInviteName.textContent = 'convite inválido';
    joinInviteError.textContent = 'Ele pode ter expirado ou sido apagado. Peça um link novo pra quem te convidou.';
    joinInviteAcceptBtn.hidden = true;
    return;
  }

  joinInviteIcon.innerHTML = serverIconInner({ name: invite.server.name, icon_url: invite.server.icon_url });
  joinInviteLead.textContent = invite.inviter ? `${invite.inviter} te convidou pra entrar em` : 'você foi convidado pra entrar em';
  joinInviteName.textContent = invite.server.name;
  joinInviteCounts.innerHTML = `
      <span><i class="dot is-online"></i>${invite.server.online_count} online</span>
      <span><i class="dot"></i>${invite.server.member_count} ${invite.server.member_count === 1 ? 'membro' : 'membros'}</span>
    `;

  if (invite.already_member) {
    joinInviteAcceptBtn.textContent = 'abrir servidor';
    joinInviteAcceptBtn.disabled = false;
  } else if (!invite.usable) {
    joinInviteError.textContent = `${invite.problem}. Peça um link novo pra quem te convidou.`;
    joinInviteAcceptBtn.hidden = true;
  } else {
    joinInviteAcceptBtn.textContent = 'entrar no servidor';
    joinInviteAcceptBtn.disabled = false;
  }
}

joinInviteAcceptBtn.addEventListener('click', async () => {
  if (!pendingInviteCode) return;
  joinInviteAcceptBtn.disabled = true;
  const result = await acceptInvite(pendingInviteCode);
  if (result.error) {
    joinInviteError.textContent = result.error;
    joinInviteAcceptBtn.disabled = false;
    return;
  }
  pendingInviteCode = null;
  closeJoinInvite();
});

// ---------- mensagens diretas ----------

const newDmBackdrop = document.getElementById('newDmBackdrop');
const newDmSearch = document.getElementById('newDmSearch');
const newDmList = document.getElementById('newDmList');
wireModal(newDmBackdrop);
let contacts = [];

function sortDms() {
  const key = (d) => d.last_message_at || d.created_at || '';
  dms.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
}

function upsertDm(dm) {
  if (!dm || !dm.user) return;
  rememberUser(dm.user);
  const i = dms.findIndex((d) => d.id === dm.id);
  if (i >= 0) dms[i] = { ...dms[i], ...dm };
  else dms.push(dm);
  sortDms();
  if (currentServerId == null) renderChannels();
  renderRail();
}

async function loadDms() {
  try {
    const res = await fetch('/api/dms');
    if (!res.ok) return;
    dms = (await res.json()).dms;
    dms.forEach((d) => rememberUser(d.user));
    sortDms();
  } catch (_) { /* fica com a lista anterior */ }
}

async function openDm(userId) {
  if (currentUser && userId === currentUser.id) return;
  const res = await fetch('/api/dms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra abrir a conversa', 'error'); return; }
  upsertDm(data.dm);
  if (currentServerId != null) await selectServer(null, { dmId: data.dm.id });
  else selectChannel(dmChannel(data.dm));
}

function renderContacts() {
  const q = newDmSearch.value.trim().toLowerCase();
  const list = contacts.filter((u) => !q || u.username.toLowerCase().includes(q));
  newDmList.innerHTML = '';
  if (contacts.length === 0) {
    newDmList.innerHTML = '<p class="new-dm-empty">Quando você estiver num servidor com outras pessoas, elas aparecem aqui.</p>';
    return;
  }
  if (list.length === 0) {
    newDmList.innerHTML = '<p class="new-dm-empty">Ninguém com esse nome.</p>';
    return;
  }
  for (const u of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'new-dm-row';
    b.innerHTML = `
        <span class="dm-item-avatar">${memberAvatarInner(u)}<span class="presence-dot${presenceDotClass(u)}" title="${presenceLabel(u)}"></span></span>
        <span class="dm-item-text"><span class="dm-item-name"></span><span class="dm-item-status"></span></span>
      `;
    b.querySelector('.dm-item-name').textContent = u.username;
    b.querySelector('.dm-item-status').textContent = u.status_text || (u.online ? 'online' : 'offline');
    b.addEventListener('click', () => { newDmBackdrop.hidden = true; openDm(u.id); });
    newDmList.appendChild(b);
  }
}

async function openNewDmModal() {
  newDmSearch.value = '';
  newDmList.innerHTML = '<p class="new-dm-empty">carregando...</p>';
  newDmBackdrop.hidden = false;
  newDmSearch.focus();
  try {
    const res = await fetch('/api/users/contacts');
    contacts = res.ok ? (await res.json()).users.map(rememberUser) : [];
  } catch (_) { contacts = []; }
  renderContacts();
}

newDmSearch.addEventListener('input', renderContacts);

const LOCK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const GEAR_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// Abas mantêm a identidade, os cargos e a organização em áreas separadas.
function selectServerSettingsTab(key) {
  document.querySelectorAll('[data-server-panel]').forEach(p => { p.hidden = p.dataset.serverPanel !== key; });
  document.querySelectorAll('[data-server-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.serverTab === key)));
  serverDangerZone.hidden = key !== 'overview' || !currentServer() || currentServer().owner_id !== currentUser.id;
}
document.querySelectorAll('[data-server-tab]').forEach(b => b.addEventListener('click', () => selectServerSettingsTab(b.dataset.serverTab)));
const categoryBackdrop = document.getElementById('categoryBackdrop');
const closeCategoryEditor = wireModal(categoryBackdrop);
let editingCategoryId = null;
function editCategory(category = null) {
  if (!hasCurrentPermission('manage_channels')) return;
  editingCategoryId = category ? category.id : null;
  document.getElementById('categoryName').value = category ? category.name : '';
  document.getElementById('categoryPosition').value = category ? category.position : channelCategories.length;
  document.getElementById('categoryDelete').hidden = !category;
  document.getElementById('categoryError').textContent = '';
  categoryBackdrop.hidden = false; document.getElementById('categoryName').focus();
}
function renderCategorySettings() {
  const list = document.getElementById('categorySettingsList'); list.replaceChildren();
  for (const category of channelCategories) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'category-settings-row';
    const name = document.createElement('strong'); name.textContent = category.name;
    const count = document.createElement('span'); count.textContent = channels.filter(c => c.category_id === category.id).length + ' canais · editar';
    row.append(name, count); row.addEventListener('click', () => editCategory(category)); list.appendChild(row);
  }
  if (!channelCategories.length) { const p = document.createElement('p'); p.className = 'field-help'; p.textContent = 'Ainda sem categorias. Crie uma para organizar seus canais.'; list.appendChild(p); }
}
document.getElementById('categoryCreateBtn').addEventListener('click', () => editCategory());
async function saveCategory(remove = false) {
  if (remove && !confirm('Apagar esta categoria? Os canais e as mensagens serão mantidos, sem categoria.')) return;
  const sid = currentServerId;
  const save = document.getElementById('categorySave'), del = document.getElementById('categoryDelete'); save.disabled = del.disabled = true;
  try {
    const res = await fetch(`/api/servers/${sid}/categories${editingCategoryId ? '/' + editingCategoryId : ''}`, {
      method: remove ? 'DELETE' : editingCategoryId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: document.getElementById('categoryName').value, position: Number(document.getElementById('categoryPosition').value) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(data.error || 'não deu pra salvar a categoria');
    closeCategoryEditor(); await refreshServerData(sid);
  } catch (err) { document.getElementById('categoryError').textContent = err.message; }
  finally { save.disabled = del.disabled = false; }
}
document.getElementById('categorySave').addEventListener('click', () => saveCategory());
document.getElementById('categoryDelete').addEventListener('click', () => saveCategory(true));
