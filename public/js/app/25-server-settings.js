// didiscord — Configurações do servidor (tela cheia, no estilo do Discord)
// Parte 25 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - abrir/fechar a tela, abas e quem vê cada aba (pela permissão do cargo)
//   - barra "alterações não salvas" (perfil do servidor e visão geral)
//   - perfil do servidor: nome, ícone, banner e descrição, com prévia
//   - visão geral: canal de mensagens do sistema e canal AFK
//   - cargos: lista + editor (exibição, permissões, membros), @everyone e cargo de entrada
//   - soundboard (lista; o editor de som fica em 26-soundboard.js)
//   - membros, convites, banimentos e registro de auditoria
//   - caixa de pergunta/confirmação (ssAsk) — window.prompt não existe no app desktop
//
// Toda regra de verdade é do servidor (server/access.js, routes/servers.js): aqui só escondemos o
// que a pessoa não pode usar.

const serverSettingsBackdrop = document.getElementById('serverSettingsBackdrop');
const ssNavServerName = document.getElementById('ssNavServerName');
const ssUnsavedBar = document.getElementById('ssUnsavedBar');
const serverSettingsSaveBtn = document.getElementById('serverSettingsSaveBtn');
const serverSettingsError = document.getElementById('serverSettingsError');
const serverSettingsIcon = document.getElementById('serverSettingsIcon');
const serverSettingsIconBtn = document.getElementById('serverSettingsIconBtn');
const serverSettingsIconRemoveBtn = document.getElementById('serverSettingsIconRemoveBtn');
const serverSettingsIconInput = document.getElementById('serverSettingsIconInput');
const serverSettingsNameInput = document.getElementById('serverSettingsNameInput');
const ssDescriptionInput = document.getElementById('ssDescriptionInput');
const ssBannerInput = document.getElementById('ssBannerInput');
const ssSystemChannel = document.getElementById('ssSystemChannel');
const ssSystemWelcome = document.getElementById('ssSystemWelcome');
const ssAfkChannel = document.getElementById('ssAfkChannel');
const ssAfkTimeout = document.getElementById('ssAfkTimeout');
const rolesList = document.getElementById('rolesList');
const roleCreateBtn = document.getElementById('roleCreateBtn');
const ssRoleEditor = document.getElementById('ssRoleEditor');
const ssJoinRole = document.getElementById('ssJoinRole');

let ssTab = 'profile';
let ssDraft = null;  // o que está nos campos do perfil/visão geral
let ssSaved = null;  // o que está salvo no servidor (pra saber se tem alteração pendente)
let ssSelectedRole = 'everyone'; // 'everyone' ou id do cargo aberto no editor
let ssRoleTab = 'display';
let ssInvites = [];
let ssBans = [];
let ssSounds = [];
let ssSoundMax = 48;
let ssAudit = { entries: [], hasMore: false, loading: false };

// ---------- quem vê cada aba ----------

const SS_TAB_RULES = {
  profile: () => hasCurrentPermission('manage_server'),
  overview: () => hasCurrentPermission('manage_server'),
  roles: () => isAdminOfCurrentServer(),
  categories: () => hasCurrentPermission('manage_channels'),
  soundboard: () => hasCurrentPermission('manage_soundboard'),
  members: () => isAdminOfCurrentServer() || hasCurrentPermission('kick_members') || hasCurrentPermission('ban_members'),
  invites: () => hasCurrentPermission('manage_server'),
  bans: () => hasCurrentPermission('ban_members'),
  audit: () => hasCurrentPermission('view_audit_log'),
};

function ssVisibleTabs() {
  return Object.keys(SS_TAB_RULES).filter((k) => SS_TAB_RULES[k]());
}

function canOpenServerSettings() {
  return !!currentServer() && ssVisibleTabs().length > 0;
}

function ssIsOwner() {
  const s = currentServer();
  return !!(s && currentUser && s.owner_id === currentUser.id);
}

// mostra/esconde as abas e os títulos de grupo que ficaram vazios
function ssApplyTabVisibility() {
  const visible = new Set(ssVisibleTabs());
  serverSettingsBackdrop.querySelectorAll('[data-ss-tab]').forEach((b) => { b.hidden = !visible.has(b.dataset.ssTab); });
  // cada título de grupo (e o separador antes dele) só aparece se algum botão do grupo aparece
  serverSettingsBackdrop.querySelectorAll('[data-ss-group]').forEach((label) => {
    let el = label.nextElementSibling;
    let any = false;
    while (el && el.matches('[data-ss-tab]')) { if (!el.hidden) any = true; el = el.nextElementSibling; }
    label.hidden = !any;
    const sep = label.previousElementSibling;
    if (sep && sep.matches('[data-ss-group-sep]')) sep.hidden = !any;
  });
  document.getElementById('ssDeleteTab').hidden = !ssIsOwner();
  document.getElementById('ssDeleteSep').hidden = !ssIsOwner();
}

// ---------- abrir, fechar, trocar de aba ----------

function openServerSettings(tab) {
  const s = currentServer();
  if (!s || !canOpenServerSettings()) return;
  closeServerMenu();
  ssApplyTabVisibility();
  ssResetDraft();
  const visible = ssVisibleTabs();
  ssTab = tab && visible.includes(tab) ? tab : visible[0];
  ssSelectedRole = 'everyone';
  ssRoleTab = 'display';
  serverSettingsBackdrop.hidden = false;
  selectSsTab(ssTab, { force: true });
  loadRoles().then(() => { if (ssTab === 'roles') renderSsRoles(); });
}

function ssShakeUnsaved() {
  ssUnsavedBar.classList.remove('is-shaking');
  void ssUnsavedBar.offsetWidth; // reinicia a animação
  ssUnsavedBar.classList.add('is-shaking');
}

// igual ao Discord: com alteração pendente, não sai — a barra de baixo treme
function closeServerSettings() {
  if (ssIsDirty()) { ssShakeUnsaved(); return; }
  serverSettingsBackdrop.hidden = true;
  if (typeof stopSoundPreview === 'function') stopSoundPreview();
}

function selectSsTab(key, opts = {}) {
  if (!opts.force && key !== ssTab && ssIsDirty()) { ssShakeUnsaved(); return; }
  ssTab = key;
  serverSettingsBackdrop.querySelectorAll('[data-ss-tab]').forEach((b) => b.classList.toggle('active', b.dataset.ssTab === key));
  serverSettingsBackdrop.querySelectorAll('[data-ss-panel]').forEach((p) => { p.hidden = p.dataset.ssPanel !== key; });
  serverSettingsBackdrop.querySelector('.settings-content').scrollTop = 0;
  renderSsTab();
}

function renderSsTab() {
  const s = currentServer();
  if (!s) return;
  ssNavServerName.textContent = s.name;
  switch (ssTab) {
    case 'profile': return renderSsProfile();
    case 'overview': return renderSsOverview();
    case 'roles': return renderSsRoles();
    case 'categories': return renderCategorySettings();
    case 'soundboard': return loadSsSounds();
    case 'members': return renderSsMembers();
    case 'invites': return loadSsInvites();
    case 'bans': return loadSsBans();
    case 'audit': return loadSsAudit(true);
    default: return undefined;
  }
}

// chamado quando os dados do servidor mudam por fora (cargos, canais, server_updated)
function refreshServerSettingsView() {
  if (serverSettingsBackdrop.hidden) return;
  if (!canOpenServerSettings()) { serverSettingsBackdrop.hidden = true; return; }
  ssApplyTabVisibility();
  if (!ssVisibleTabs().includes(ssTab)) { selectSsTab(ssVisibleTabs()[0], { force: true }); return; }
  if (!ssIsDirty()) ssResetDraft();
  // listas que vêm de outra rota se recarregam sozinhas quando a aba é aberta de novo
  if (['profile', 'overview', 'roles', 'categories', 'members'].includes(ssTab)) renderSsTab();
}

serverSettingsBackdrop.querySelectorAll('[data-ss-tab]').forEach((b) => b.addEventListener('click', () => selectSsTab(b.dataset.ssTab)));
serverSettingsBackdrop.querySelector('[data-ss-close]').addEventListener('click', closeServerSettings);

// ---------- rascunho (perfil + visão geral) e barra de alterações não salvas ----------

const SS_DRAFT_KEYS = ['name', 'description', 'system_channel_id', 'system_welcome', 'afk_channel_id', 'afk_timeout'];

function ssResetDraft() {
  const s = currentServer();
  if (!s) return;
  ssSaved = {
    name: s.name || '',
    description: s.description || '',
    system_channel_id: s.system_channel_id || null,
    system_welcome: s.system_welcome !== false,
    afk_channel_id: s.afk_channel_id || null,
    afk_timeout: s.afk_timeout || 300,
  };
  ssDraft = { ...ssSaved };
  ssUpdateUnsavedBar();
}

function ssChangedKeys() {
  if (!ssDraft || !ssSaved) return [];
  return SS_DRAFT_KEYS.filter((k) => (k === 'name' || k === 'description' ? String(ssDraft[k]).trim() !== String(ssSaved[k]).trim() : ssDraft[k] !== ssSaved[k]));
}
function ssIsDirty() { return !serverSettingsBackdrop.hidden && ssChangedKeys().length > 0; }

function ssUpdateUnsavedBar() {
  ssUnsavedBar.hidden = !(ssDraft && ssChangedKeys().length);
}

function ssSetDraft(key, value) {
  ssDraft[key] = value;
  ssUpdateUnsavedBar();
  if (ssTab === 'profile') renderSsPreview();
}

document.getElementById('ssUnsavedReset').addEventListener('click', () => {
  ssResetDraft();
  renderSsTab();
});

serverSettingsSaveBtn.addEventListener('click', async () => {
  const s = currentServer();
  if (!s) return;
  const keys = ssChangedKeys();
  if (!keys.length) return;
  if (keys.includes('name') && !ssDraft.name.trim()) { toast('dá um nome pro servidor', 'error'); return; }
  const body = {};
  for (const k of keys) body[k] = typeof ssDraft[k] === 'string' ? ssDraft[k].trim() : ssDraft[k];
  serverSettingsSaveBtn.disabled = true;
  try {
    const res = await fetch(`/api/servers/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra salvar', 'error'); return; }
    upsertServer(data.server);
    ssResetDraft();
    renderSsTab();
    toast('alterações salvas');
  } catch (_) {
    toast('sem conexão — tente de novo', 'error');
  } finally {
    serverSettingsSaveBtn.disabled = false;
  }
});

// ---------- perfil do servidor ----------

function renderSsProfile() {
  const s = currentServer();
  serverSettingsNameInput.value = ssDraft.name;
  ssDescriptionInput.value = ssDraft.description;
  serverSettingsIconRemoveBtn.hidden = !s.icon_url;
  document.getElementById('ssBannerRemoveBtn').hidden = !s.banner_url;
  serverSettingsError.textContent = '';
  renderSsPreview();
}

function renderSsPreview() {
  const s = currentServer();
  if (!s) return;
  const preview = { ...s, name: ssDraft.name || s.name };
  serverSettingsIcon.innerHTML = serverIconInner(preview);
  document.getElementById('ssPreviewName').textContent = preview.name;
  const desc = document.getElementById('ssPreviewDesc');
  desc.textContent = ssDraft.description.trim();
  desc.hidden = !ssDraft.description.trim();
  document.getElementById('ssDescriptionCount').textContent = `${ssDraft.description.length}/190`;
  const banner = document.getElementById('ssPreviewBanner');
  banner.style.backgroundImage = s.banner_url ? `url("${s.banner_url.replace(/"/g, '%22')}")` : '';
  banner.classList.toggle('has-image', !!s.banner_url);
  const online = members.filter((m) => m.online).length;
  document.getElementById('ssPreviewCounts').innerHTML =
    `<span class="ss-dot is-online"></span>${online} online <span class="ss-dot"></span>${members.length} ${members.length === 1 ? 'membro' : 'membros'}`;
}

serverSettingsNameInput.addEventListener('input', () => ssSetDraft('name', serverSettingsNameInput.value));
ssDescriptionInput.addEventListener('input', () => ssSetDraft('description', ssDescriptionInput.value));

// ícone e banner sobem na hora (não passam pela barra de "salvar")
async function ssUploadImage(kind, file) {
  const s = currentServer();
  if (!s || !file) return;
  const form = new FormData();
  form.append(kind, file);
  try {
    const res = await fetch(`/api/servers/${s.id}/${kind}`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra enviar a imagem', 'error'); return; }
    upsertServer(data.server);
    renderSsProfile();
  } catch (_) { toast('sem conexão — tente de novo', 'error'); }
}
async function ssRemoveImage(kind) {
  const s = currentServer();
  if (!s) return;
  const res = await fetch(`/api/servers/${s.id}/${kind}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra remover', 'error'); return; }
  upsertServer(data.server);
  renderSsProfile();
}

serverSettingsIcon.addEventListener('click', () => serverSettingsIconInput.click());
serverSettingsIconBtn.addEventListener('click', () => serverSettingsIconInput.click());
serverSettingsIconInput.addEventListener('change', async () => {
  serverSettingsIconBtn.disabled = true;
  await ssUploadImage('icon', serverSettingsIconInput.files[0]);
  serverSettingsIconBtn.disabled = false;
  serverSettingsIconInput.value = '';
});
serverSettingsIconRemoveBtn.addEventListener('click', () => ssRemoveImage('icon'));
document.getElementById('ssBannerBtn').addEventListener('click', () => ssBannerInput.click());
ssBannerInput.addEventListener('change', async () => {
  await ssUploadImage('banner', ssBannerInput.files[0]);
  ssBannerInput.value = '';
});
document.getElementById('ssBannerRemoveBtn').addEventListener('click', () => ssRemoveImage('banner'));

// ---------- visão geral ----------

function ssFillChannelSelect(select, type, value, noneLabel) {
  select.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = noneLabel;
  select.appendChild(none);
  for (const ch of channels.filter((c) => c.type === type)) {
    const o = document.createElement('option');
    o.value = String(ch.id);
    o.textContent = (type === 'text' ? '# ' : '🔊 ') + ch.name;
    select.appendChild(o);
  }
  select.value = value ? String(value) : '';
}

function renderSsOverview() {
  ssFillChannelSelect(ssSystemChannel, 'text', ssDraft.system_channel_id, 'sem mensagens do sistema');
  ssSystemWelcome.checked = !!ssDraft.system_welcome;
  ssSystemWelcome.disabled = !ssDraft.system_channel_id;
  ssFillChannelSelect(ssAfkChannel, 'voice', ssDraft.afk_channel_id, 'sem canal AFK');
  ssAfkTimeout.value = String(ssDraft.afk_timeout);
  ssAfkTimeout.disabled = !ssDraft.afk_channel_id;
}

ssSystemChannel.addEventListener('change', () => { ssSetDraft('system_channel_id', Number(ssSystemChannel.value) || null); renderSsOverview(); });
ssSystemWelcome.addEventListener('change', () => ssSetDraft('system_welcome', ssSystemWelcome.checked));
ssAfkChannel.addEventListener('change', () => { ssSetDraft('afk_channel_id', Number(ssAfkChannel.value) || null); renderSsOverview(); });
ssAfkTimeout.addEventListener('change', () => ssSetDraft('afk_timeout', Number(ssAfkTimeout.value)));

// ---------- cargos ----------

// permissões em grupos, com explicação — a mesma lista vale pro @everyone e pros cargos
const SS_PERMISSION_GROUPS = [
  { title: 'servidor', items: [
    ['manage_server', 'gerenciar servidor', 'mudar nome, ícone, banner, mensagens do sistema, canal AFK e ver/revogar convites'],
    ['manage_channels', 'gerenciar canais e categorias', 'criar, editar, organizar e apagar canais e categorias'],
    ['view_audit_log', 'ver registro de auditoria', 'ver quem mudou o quê no servidor'],
  ] },
  { title: 'membros', items: [
    ['kick_members', 'expulsar membros', 'tirar alguém do servidor (a pessoa volta com convite)'],
    ['ban_members', 'banir membros', 'tirar alguém e impedir que volte por convite'],
  ] },
  { title: 'chat', items: [
    ['manage_messages', 'gerenciar mensagens', 'apagar mensagens de outras pessoas'],
  ] },
  { title: 'voz', items: [
    ['moderate_voice', 'moderar calls', 'mover e desconectar pessoas das calls'],
  ] },
  { title: 'soundboard', items: [
    ['use_soundboard', 'usar soundboard', 'tocar sons nas calls deste servidor'],
    ['use_external_sounds', 'usar sons externos', 'tocar, nas calls daqui, sons de outros servidores em que a pessoa está'],
    ['manage_soundboard', 'gerenciar soundboard', 'enviar, editar e apagar os sons deste servidor'],
  ] },
];

async function roleRequest(method, path, body) {
  const s = currentServer();
  if (!s) return null;
  try {
    const res = await fetch(`/api/servers/${s.id}/roles${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra salvar o cargo', 'error'); return null; }
    return data;
  } catch (_) { toast('sem conexão', 'error'); return null; }
}

function ssRoleMemberCount(roleId) {
  return members.filter((m) => (m.role_ids || []).includes(roleId)).length;
}

function renderSsRoles() {
  renderSsJoinRole();
  renderRolesList();
  renderSsRoleEditor();
}

function renderSsJoinRole() {
  const s = currentServer();
  ssJoinRole.innerHTML = '<option value="">nenhum</option>';
  for (const r of serverRoles.filter((x) => !x.is_admin)) {
    const o = document.createElement('option');
    o.value = String(r.id);
    o.textContent = r.name;
    ssJoinRole.appendChild(o);
  }
  ssJoinRole.value = s && s.join_role_id ? String(s.join_role_id) : '';
  document.getElementById('ssJoinRoleApply').disabled = !ssJoinRole.value;
}

ssJoinRole.addEventListener('change', async () => {
  const s = currentServer();
  const res = await fetch(`/api/servers/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ join_role_id: Number(ssJoinRole.value) || null }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra salvar', 'error'); renderSsJoinRole(); return; }
  upsertServer(data.server);
  renderSsJoinRole();
  toast(ssJoinRole.value ? 'quem entrar agora ganha esse cargo' : 'cargo de entrada desligado');
});

document.getElementById('ssJoinRoleApply').addEventListener('click', async () => {
  const s = currentServer();
  const role = roleById(s.join_role_id);
  if (!role) return;
  const ok = await ssAsk({ title: 'dar pra quem já está', text: `Todo mundo que já está no servidor ganha o cargo "${role.name}".`, okLabel: 'dar o cargo' });
  if (!ok) return;
  const res = await fetch(`/api/servers/${s.id}/join-role/apply`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu', 'error'); return; }
  toast(data.given ? `${data.given} ${data.given === 1 ? 'pessoa ganhou' : 'pessoas ganharam'} o cargo` : 'todo mundo já tinha esse cargo');
});

// lista da esquerda: @everyone em cima, depois os cargos do mais alto pro mais baixo
function renderRolesList() {
  rolesList.innerHTML = '';
  const everyone = document.createElement('button');
  everyone.type = 'button';
  everyone.className = 'ss-role-item is-everyone' + (ssSelectedRole === 'everyone' ? ' active' : '');
  everyone.innerHTML = '<span class="ss-role-dot"></span><span class="ss-role-item-name">@everyone</span><span class="ss-role-item-count">todo mundo</span>';
  everyone.addEventListener('click', () => { ssSelectedRole = 'everyone'; renderRolesList(); renderSsRoleEditor(); });
  rolesList.appendChild(everyone);

  serverRoles.forEach((role, index) => {
    const item = document.createElement('div');
    item.className = 'ss-role-item' + (ssSelectedRole === role.id ? ' active' : '');
    item.tabIndex = 0;
    item.dataset.roleId = String(role.id);
    item.style.setProperty('--role-color', role.color || 'var(--text-faint)');
    item.innerHTML = `
      <span class="ss-role-dot"></span>
      <span class="ss-role-item-name"></span>
      ${role.is_admin ? '<span class="ss-role-badge">admin</span>' : ''}
      <span class="ss-role-item-count">${ssRoleMemberCount(role.id)}</span>
      <span class="ss-role-move">
        <button type="button" class="ss-role-up" title="subir" aria-label="subir o cargo">▲</button>
        <button type="button" class="ss-role-down" title="descer" aria-label="descer o cargo">▼</button>
      </span>`;
    item.querySelector('.ss-role-item-name').textContent = role.name;
    const up = item.querySelector('.ss-role-up');
    const down = item.querySelector('.ss-role-down');
    up.disabled = index === 0;
    down.disabled = index === serverRoles.length - 1;
    up.addEventListener('click', (e) => { e.stopPropagation(); ssMoveRole(index, -1); });
    down.addEventListener('click', (e) => { e.stopPropagation(); ssMoveRole(index, 1); });
    const open = () => { ssSelectedRole = role.id; renderRolesList(); renderSsRoleEditor(); };
    item.addEventListener('click', open);
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    rolesList.appendChild(item);
  });
}

// o de cima vale mais (cor do nome, grupo na lista). Trocar de lugar regrava as posições de cima
// pra baixo, o que também desempata cargos antigos.
async function ssMoveRole(index, delta) {
  const order = serverRoles.slice();
  const target = index + delta;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  rolesList.querySelectorAll('.ss-role-move button').forEach((b) => { b.disabled = true; });
  for (let k = 0; k < order.length; k++) {
    const position = order.length - k;
    if (order[k].position !== position) await roleRequest('PATCH', `/${order[k].id}`, { position });
  }
  await loadRoles();
  renderRolesList();
  renderMembers();
}

roleCreateBtn.addEventListener('click', async () => {
  const color = ACCENT_COLORS[serverRoles.length % ACCENT_COLORS.length];
  const data = await roleRequest('POST', '', { name: 'novo cargo', color });
  if (!data) return;
  await loadRoles();
  ssSelectedRole = data.role.id;
  ssRoleTab = 'display';
  renderSsRoles();
  const input = ssRoleEditor.querySelector('.ss-role-name-input');
  if (input) { input.focus(); input.select(); }
});

function ssPermissionToggles(grants, { locked, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'ss-perms';
  for (const group of SS_PERMISSION_GROUPS) {
    const h = document.createElement('h3');
    h.className = 'settings-section-title ss-perm-group';
    h.textContent = group.title;
    wrap.appendChild(h);
    for (const [key, title, desc] of group.items) {
      const label = document.createElement('label');
      label.className = 'settings-toggle';
      label.innerHTML = '<span class="settings-toggle-text"><strong></strong><small></small></span><input type="checkbox">';
      label.querySelector('strong').textContent = title;
      label.querySelector('small').textContent = desc;
      const box = label.querySelector('input');
      box.checked = locked || !!grants[key];
      box.disabled = !!locked;
      box.addEventListener('change', async () => {
        box.disabled = true;
        const ok = await onChange(key, box.checked);
        if (!ok) box.checked = !box.checked;
        box.disabled = false;
      });
      wrap.appendChild(label);
    }
  }
  return wrap;
}

function renderSsRoleEditor() {
  ssRoleEditor.innerHTML = '';
  const s = currentServer();
  if (!s) return;

  if (ssSelectedRole === 'everyone') {
    const head = document.createElement('div');
    head.className = 'ss-role-editor-head';
    head.innerHTML = '<h3>@everyone</h3><p class="settings-section-help">Permissões padrão: valem pra todo mundo do servidor, até quem não tem cargo nenhum. Os cargos só acrescentam.</p>';
    ssRoleEditor.appendChild(head);
    const grants = { ...(s.everyone_permissions || {}) };
    ssRoleEditor.appendChild(ssPermissionToggles(grants, {
      onChange: async (key, value) => {
        const next = { ...grants, [key]: value };
        const res = await fetch(`/api/servers/${s.id}/everyone`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: next }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast(data.error || 'não deu pra salvar', 'error'); return false; }
        grants[key] = value;
        upsertServer(data.server);
        return true;
      },
    }));
    return;
  }

  const role = roleById(ssSelectedRole);
  if (!role) { ssSelectedRole = 'everyone'; renderSsRoleEditor(); return; }
  const amOwner = ssIsOwner();

  const head = document.createElement('div');
  head.className = 'ss-role-editor-head';
  head.innerHTML = '<h3></h3>';
  head.querySelector('h3').textContent = `editar cargo — ${role.name}`;
  const tabs = document.createElement('div');
  tabs.className = 'ss-subtabs';
  for (const [key, label] of [['display', 'exibição'], ['permissions', 'permissões'], ['members', `membros (${ssRoleMemberCount(role.id)})`]]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.classList.toggle('active', ssRoleTab === key);
    b.addEventListener('click', () => { ssRoleTab = key; renderSsRoleEditor(); });
    tabs.appendChild(b);
  }
  head.appendChild(tabs);
  ssRoleEditor.appendChild(head);

  const body = document.createElement('div');
  body.className = 'ss-role-editor-body';
  ssRoleEditor.appendChild(body);

  if (ssRoleTab === 'display') {
    body.innerHTML = `
      <div class="field"><label>nome do cargo</label><input type="text" class="ss-role-name-input" maxlength="32"></div>
      <div class="field"><label>cor do cargo</label><div class="ss-color-row"></div></div>
      <label class="settings-toggle"><span class="settings-toggle-text"><strong>mostrar separado na lista de membros</strong><small>quem tem esse cargo aparece num grupo próprio, com o nome do cargo em cima</small></span><input type="checkbox" class="ss-role-hoist"></label>
      <label class="settings-toggle"><span class="settings-toggle-text"><strong>administrador</strong><small></small></span><input type="checkbox" class="ss-role-admin"></label>
      <div class="ss-role-danger"><button type="button" class="btn btn-danger btn-sm ss-role-delete">apagar cargo</button></div>`;
    const name = body.querySelector('.ss-role-name-input');
    name.value = role.name;
    name.addEventListener('change', async () => { if (!(await roleRequest('PATCH', `/${role.id}`, { name: name.value }))) name.value = role.name; });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

    const colors = body.querySelector('.ss-color-row');
    const setColor = async (c) => { if (await roleRequest('PATCH', `/${role.id}`, { color: c })) { role.color = c; renderRolesList(); renderSsRoleEditor(); } };
    for (const c of ACCENT_COLORS) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'ss-color-swatch' + ((role.color || '').toLowerCase() === c.toLowerCase() ? ' active' : '');
      sw.style.setProperty('--swatch', c);
      sw.setAttribute('aria-label', `cor ${c}`);
      sw.addEventListener('click', () => setColor(c));
      colors.appendChild(sw);
    }
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.className = 'ss-color-custom';
    custom.title = 'outra cor';
    custom.value = role.color || '#9D5CE8';
    custom.addEventListener('change', () => setColor(custom.value));
    colors.appendChild(custom);

    const hoist = body.querySelector('.ss-role-hoist');
    hoist.checked = !!role.hoist;
    hoist.addEventListener('change', async () => { if (!(await roleRequest('PATCH', `/${role.id}`, { hoist: hoist.checked }))) hoist.checked = !!role.hoist; });

    const admin = body.querySelector('.ss-role-admin');
    const isJoinRole = s.join_role_id === role.id;
    admin.checked = role.is_admin;
    admin.disabled = !amOwner || (isJoinRole && !role.is_admin);
    admin.closest('label').querySelector('small').textContent = !amOwner
      ? 'só o dono do servidor muda quem é administrador'
      : isJoinRole ? 'esse é o cargo de entrada — ele não pode ser de administrador'
        : 'pode tudo no servidor: canais, cargos, calls, membros e soundboard';
    admin.addEventListener('change', async () => { if (!(await roleRequest('PATCH', `/${role.id}`, { is_admin: admin.checked }))) admin.checked = role.is_admin; });

    const del = body.querySelector('.ss-role-delete');
    del.disabled = role.is_admin && !amOwner;
    del.addEventListener('click', async () => {
      const ok = await ssAsk({ title: 'apagar cargo', text: `Apagar o cargo "${role.name}"? Quem tem esse cargo perde ele.`, okLabel: 'apagar', danger: true });
      if (!ok) return;
      if (await roleRequest('DELETE', `/${role.id}`)) { ssSelectedRole = 'everyone'; await loadRoles(); renderSsRoles(); }
    });
  } else if (ssRoleTab === 'permissions') {
    if (role.is_admin) {
      const note = document.createElement('p');
      note.className = 'settings-section-help ss-note';
      note.textContent = 'Administradores podem tudo — as permissões abaixo já vêm todas ligadas.';
      body.appendChild(note);
    }
    const grants = { ...(role.permissions || {}) };
    body.appendChild(ssPermissionToggles(grants, {
      locked: role.is_admin,
      onChange: async (key, value) => {
        const next = { ...grants, [key]: value };
        const saved = await roleRequest('PATCH', `/${role.id}`, { permissions: next });
        if (!saved) return false;
        grants[key] = value;
        role.permissions = next;
        return true;
      },
    }));
  } else {
    renderSsRoleMembers(body, role);
  }
}

async function ssSetRoles(userId, roleIds) {
  const s = currentServer();
  const res = await fetch(`/api/servers/${s.id}/members/${userId}/roles`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role_ids: roleIds }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra mudar os cargos', 'error'); return false; }
  const m = members.find((x) => x.id === userId);
  if (m) m.role_ids = data.role_ids;
  return true;
}

function renderSsRoleMembers(body, role) {
  const canTouch = !role.is_admin || ssIsOwner();
  const add = document.createElement('div');
  add.className = 'settings-row ss-row-gap';
  add.innerHTML = '<select class="ss-role-add-select"></select><button type="button" class="btn btn-primary btn-sm">adicionar</button>';
  const select = add.querySelector('select');
  const without = members.filter((m) => !(m.role_ids || []).includes(role.id)).sort((a, b) => a.username.localeCompare(b.username));
  select.innerHTML = '<option value="">escolher membro…</option>';
  for (const m of without) {
    const o = document.createElement('option');
    o.value = String(m.id);
    o.textContent = m.username;
    select.appendChild(o);
  }
  add.querySelector('button').disabled = !canTouch;
  select.disabled = !canTouch;
  add.querySelector('button').addEventListener('click', async () => {
    const m = members.find((x) => x.id === Number(select.value));
    if (!m) return;
    if (await ssSetRoles(m.id, [...(m.role_ids || []), role.id])) { renderSsRoleEditor(); renderRolesList(); }
  });
  body.appendChild(add);

  const list = document.createElement('div');
  list.className = 'ss-table';
  const withRole = members.filter((m) => (m.role_ids || []).includes(role.id));
  if (!withRole.length) list.innerHTML = '<p class="ss-empty">Ninguém tem esse cargo ainda.</p>';
  for (const m of withRole) {
    const row = document.createElement('div');
    row.className = 'ss-row';
    row.innerHTML = `<span class="ss-avatar">${memberAvatarInner(m)}</span><span class="ss-row-main"><strong></strong></span>`;
    row.querySelector('strong').textContent = m.username;
    if (canTouch) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'ss-icon-btn';
      x.title = 'tirar o cargo';
      x.setAttribute('aria-label', `tirar o cargo de ${m.username}`);
      x.textContent = '×';
      x.addEventListener('click', async () => {
        if (await ssSetRoles(m.id, (m.role_ids || []).filter((id) => id !== role.id))) { renderSsRoleEditor(); renderRolesList(); }
      });
      row.appendChild(x);
    }
    list.appendChild(row);
  }
  body.appendChild(list);
}

// ---------- soundboard (lista; o editor do som é o de 26-soundboard.js) ----------

async function loadSsSounds() {
  const s = currentServer();
  const grid = document.getElementById('ssSoundGrid');
  try {
    const res = await fetch(`/api/servers/${s.id}/soundboard`);
    if (!res.ok) return;
    const data = await res.json();
    if (currentServerId !== s.id) return;
    ssSounds = data.sounds;
    ssSoundMax = data.max;
  } catch (_) { grid.innerHTML = '<p class="ss-empty">sem conexão</p>'; return; }
  renderSsSounds();
}

function renderSsSounds() {
  const s = currentServer();
  const grid = document.getElementById('ssSoundGrid');
  document.getElementById('ssSoundCount').textContent = `${ssSounds.length} de ${ssSoundMax} sons`;
  document.getElementById('ssSoundUploadBtn').disabled = ssSounds.length >= ssSoundMax;
  grid.innerHTML = '';
  if (!ssSounds.length) {
    grid.innerHTML = '<p class="ss-empty">Nenhum som ainda. Envie o primeiro — dá pra cortar o trecho certinho antes de salvar.</p>';
    return;
  }
  for (const sound of ssSounds) {
    const card = document.createElement('div');
    card.className = 'ss-sound-card';
    card.innerHTML = `
      <button type="button" class="ss-sound-play" title="ouvir (só você)" aria-label="ouvir"><span class="ss-sound-emoji"></span></button>
      <div class="ss-sound-info"><strong></strong><small></small></div>
      <div class="ss-sound-actions">
        <button type="button" class="ss-icon-btn ss-sound-edit" title="editar" aria-label="editar som">✎</button>
        <button type="button" class="ss-icon-btn is-danger ss-sound-del" title="apagar" aria-label="apagar som">${TRASH_ICON}</button>
      </div>`;
    card.querySelector('.ss-sound-emoji').textContent = sound.emoji || '🔊';
    card.querySelector('strong').textContent = sound.name;
    card.querySelector('small').textContent = `${(sound.duration_ms / 1000).toFixed(1).replace('.', ',')} s · ${sound.created_by_username || 'alguém'}`;
    card.querySelector('.ss-sound-play').addEventListener('click', () => previewSound(sound));
    card.querySelector('.ss-sound-edit').addEventListener('click', () => openSoundEditor({ serverId: s.id, sound }));
    card.querySelector('.ss-sound-del').addEventListener('click', async () => {
      const ok = await ssAsk({ title: 'apagar som', text: `Apagar "${sound.name}" do soundboard?`, okLabel: 'apagar', danger: true });
      if (!ok) return;
      const res = await fetch(`/api/servers/${s.id}/soundboard/${sound.id}`, { method: 'DELETE' });
      if (!res.ok) { toast('não deu pra apagar', 'error'); return; }
      loadSsSounds();
    });
    grid.appendChild(card);
  }
}

document.getElementById('ssSoundUploadBtn').addEventListener('click', () => openSoundEditor({ serverId: currentServerId }));

// ---------- membros ----------

const ssMemberSearch = document.getElementById('ssMemberSearch');
ssMemberSearch.addEventListener('input', () => renderSsMembers());

function renderSsMembers() {
  const s = currentServer();
  const list = document.getElementById('ssMemberList');
  const q = ssMemberSearch.value.trim().toLowerCase();
  const shown = members.filter((m) => !q || m.username.toLowerCase().includes(q)).sort((a, b) => a.username.localeCompare(b.username));
  document.getElementById('ssMemberCount').textContent = `${members.length} ${members.length === 1 ? 'membro' : 'membros'}`;
  list.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'ss-row is-head';
  head.innerHTML = '<span class="ss-col-name">nome</span><span class="ss-col-date">membro desde</span><span class="ss-col-roles">cargos</span><span class="ss-col-actions"></span>';
  list.appendChild(head);
  for (const m of shown) {
    const row = document.createElement('div');
    row.className = 'ss-row';
    row.innerHTML = `
      <span class="ss-col-name"><span class="ss-avatar">${memberAvatarInner(m)}</span><button type="button" class="ss-link"></button></span>
      <span class="ss-col-date"></span>
      <span class="ss-col-roles"></span>
      <span class="ss-col-actions"></span>`;
    const nameBtn = row.querySelector('.ss-link');
    nameBtn.textContent = m.username;
    if (m.id === s.owner_id) nameBtn.insertAdjacentHTML('beforeend', ` <span class="ss-crown" title="dono">${CROWN_ICON}</span>`);
    nameBtn.addEventListener('click', (e) => openViewProfile(m.id, e.currentTarget));
    row.querySelector('.ss-col-date').textContent = formatMemberSince(m.joined_at);
    const roles = row.querySelector('.ss-col-roles');
    for (const r of memberRoles(m)) {
      const chip = document.createElement('span');
      chip.className = 'pc-role';
      chip.style.setProperty('--role-color', r.color || 'var(--text-faint)');
      chip.innerHTML = '<i class="pc-role-dot"></i><span class="pc-role-name"></span>';
      chip.querySelector('.pc-role-name').textContent = r.name;
      roles.appendChild(chip);
    }
    const actions = row.querySelector('.ss-col-actions');
    if (canModerateMember(m.id, 'kick_members')) {
      const kick = document.createElement('button');
      kick.type = 'button';
      kick.className = 'btn btn-ghost btn-sm';
      kick.textContent = 'expulsar';
      kick.addEventListener('click', () => kickMember(m));
      actions.appendChild(kick);
    }
    if (canModerateMember(m.id, 'ban_members')) {
      const ban = document.createElement('button');
      ban.type = 'button';
      ban.className = 'btn btn-danger btn-sm';
      ban.textContent = 'banir';
      ban.addEventListener('click', () => banMember(m));
      actions.appendChild(ban);
    }
    list.appendChild(row);
  }
  if (!shown.length) list.insertAdjacentHTML('beforeend', '<p class="ss-empty">Ninguém com esse nome.</p>');
}

// banir (também usado pelo cartão de perfil, 12-members-profile.js)
async function banMember(user) {
  const s = currentServer();
  if (!s) return;
  const reason = await ssAsk({
    title: `banir ${user.username}`,
    text: `${user.username} sai de "${s.name}" e não consegue voltar por convite até ser desbanido.`,
    label: 'motivo (opcional — só a moderação vê)', input: true, okLabel: 'banir', danger: true,
  });
  if (reason === null) return;
  const res = await fetch(`/api/servers/${s.id}/bans/${user.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra banir', 'error'); return; }
  toast(`${user.username} foi banido`);
}

// ---------- convites ----------

function ssRelativeTime(iso, future) {
  if (!iso) return '';
  const t = new Date(String(iso).replace(' ', 'T') + 'Z').getTime();
  const diff = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (abs < 60) return future ? 'em instantes' : 'agora há pouco';
  if (abs < 3600) return fmt.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return fmt.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return fmt.format(Math.round(diff / 86400), 'day');
  return new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ssFullDate(iso) {
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR');
}

async function loadSsInvites() {
  const s = currentServer();
  try {
    const res = await fetch(`/api/servers/${s.id}/invites`);
    if (!res.ok) return;
    ssInvites = (await res.json()).invites;
  } catch (_) { return; }
  renderSsInvites();
}

function renderSsInvites() {
  const s = currentServer();
  const list = document.getElementById('ssInviteList');
  const active = ssInvites.filter((i) => !i.expired);
  document.getElementById('ssInviteCount').textContent = `${active.length} ${active.length === 1 ? 'convite ativo' : 'convites ativos'}`;
  list.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'ss-row is-head';
  head.innerHTML = '<span class="ss-col-name">criado por</span><span class="ss-col-code">código</span><span class="ss-col-uses">usos</span><span class="ss-col-date">expira</span><span class="ss-col-actions"></span>';
  list.appendChild(head);
  for (const inv of ssInvites) {
    const row = document.createElement('div');
    row.className = 'ss-row' + (inv.expired ? ' is-faded' : '');
    row.innerHTML = `
      <span class="ss-col-name"><span class="ss-avatar"></span><span class="ss-name"></span></span>
      <span class="ss-col-code"><code></code></span>
      <span class="ss-col-uses"></span>
      <span class="ss-col-date"></span>
      <span class="ss-col-actions"></span>`;
    row.querySelector('.ss-avatar').innerHTML = memberAvatarInner({ username: inv.created_by_username || '?', avatar_url: inv.created_by_avatar_url });
    row.querySelector('.ss-name').textContent = inv.created_by_username || 'conta apagada';
    row.querySelector('code').textContent = inv.code;
    row.querySelector('.ss-col-uses').textContent = inv.max_uses ? `${inv.uses} / ${inv.max_uses}` : String(inv.uses);
    const date = row.querySelector('.ss-col-date');
    date.textContent = inv.expired ? 'expirado' : inv.expires_at ? ssRelativeTime(inv.expires_at, true) : 'nunca';
    if (inv.expires_at) date.title = ssFullDate(inv.expires_at);
    const actions = row.querySelector('.ss-col-actions');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ss-icon-btn';
    copy.title = 'copiar link';
    copy.setAttribute('aria-label', 'copiar link do convite');
    copy.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    copy.hidden = inv.expired;
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`${location.origin}/invite/${inv.code}`); toast('link copiado'); } catch (_) { toast('não deu pra copiar', 'error'); }
    });
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.className = 'ss-icon-btn is-danger';
    revoke.title = 'revogar convite';
    revoke.setAttribute('aria-label', 'revogar convite');
    revoke.textContent = '×';
    revoke.addEventListener('click', async () => {
      const res = await fetch(`/api/servers/${s.id}/invites/${encodeURIComponent(inv.code)}`, { method: 'DELETE' });
      if (!res.ok) { toast('não deu pra revogar', 'error'); return; }
      ssInvites = ssInvites.filter((x) => x.code !== inv.code);
      renderSsInvites();
    });
    actions.append(copy, revoke);
    list.appendChild(row);
  }
  if (!ssInvites.length) list.insertAdjacentHTML('beforeend', '<p class="ss-empty">Nenhum convite. Crie um pra chamar o pessoal.</p>');
}

document.getElementById('ssInviteCreateBtn').addEventListener('click', () => openInviteModal());
// fechou o modal de convite com a aba de convites aberta: recarrega (o convite novo aparece)
new MutationObserver(() => {
  if (inviteBackdrop.hidden && !serverSettingsBackdrop.hidden && ssTab === 'invites') loadSsInvites();
}).observe(inviteBackdrop, { attributes: true, attributeFilter: ['hidden'] });

// ---------- banimentos ----------

const ssBanSearch = document.getElementById('ssBanSearch');
ssBanSearch.addEventListener('input', () => renderSsBans());

async function loadSsBans() {
  const s = currentServer();
  try {
    const res = await fetch(`/api/servers/${s.id}/bans`);
    if (!res.ok) return;
    ssBans = (await res.json()).bans;
  } catch (_) { return; }
  renderSsBans();
}

function renderSsBans() {
  const s = currentServer();
  const list = document.getElementById('ssBanList');
  const q = ssBanSearch.value.trim().toLowerCase();
  const shown = ssBans.filter((b) => !q || b.username.toLowerCase().includes(q));
  document.getElementById('ssBanCount').textContent = `${ssBans.length} ${ssBans.length === 1 ? 'banido' : 'banidos'}`;
  list.innerHTML = '';
  for (const b of shown) {
    const row = document.createElement('div');
    row.className = 'ss-row';
    row.innerHTML = `
      <span class="ss-avatar">${memberAvatarInner({ username: b.username, avatar_url: b.avatar_url })}</span>
      <span class="ss-row-main"><strong></strong><small></small></span>
      <span class="ss-col-actions"><button type="button" class="btn btn-ghost btn-sm">desbanir</button></span>`;
    row.querySelector('strong').textContent = b.username;
    row.querySelector('small').textContent = `${b.reason ? `"${b.reason}"` : 'sem motivo'} · por ${b.banned_by_username || '?'} ${ssRelativeTime(b.created_at)}`;
    row.querySelector('button').addEventListener('click', async () => {
      const res = await fetch(`/api/servers/${s.id}/bans/${b.user_id}`, { method: 'DELETE' });
      if (!res.ok) { toast('não deu pra desbanir', 'error'); return; }
      toast(`${b.username} pode voltar com um convite`);
      ssBans = ssBans.filter((x) => x.user_id !== b.user_id);
      renderSsBans();
    });
    list.appendChild(row);
  }
  if (!shown.length) list.innerHTML = `<p class="ss-empty">${ssBans.length ? 'Ninguém com esse nome.' : 'Ninguém banido. Que paz.'}</p>`;
}

// ---------- registro de auditoria ----------

const ssAuditActor = document.getElementById('ssAuditActor');
const ssAuditAction = document.getElementById('ssAuditAction');

const SS_AUDIT_ACTIONS = {
  server_update: 'mudou o servidor', server_icon: 'ícone do servidor', server_banner: 'banner do servidor',
  everyone_permissions: 'permissões do @everyone',
  channel_create: 'criou canal', channel_update: 'editou canal', channel_delete: 'apagou canal',
  category_create: 'criou categoria', category_update: 'editou categoria', category_delete: 'apagou categoria',
  role_create: 'criou cargo', role_update: 'editou cargo', role_delete: 'apagou cargo', member_roles: 'cargos de membro',
  member_kick: 'expulsou', member_ban: 'baniu', member_unban: 'desbaniu',
  invite_create: 'criou convite', invite_delete: 'revogou convite',
  voice_disconnect: 'desconectou da call', voice_move: 'moveu de call',
  sound_create: 'adicionou som', sound_update: 'editou som', sound_delete: 'apagou som',
  message_delete: 'apagou mensagem',
};

const SS_SERVER_FIELDS = {
  name: 'o nome', description: 'a descrição', system_channel_id: 'o canal de mensagens do sistema',
  system_welcome: 'as boas-vindas', afk_channel_id: 'o canal AFK', afk_timeout: 'o tempo de AFK', join_role_id: 'o cargo de entrada',
};

function ssJoinList(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' e ' + items[items.length - 1];
}

// texto de uma linha do registro. Nomes vão com <b> — sempre escapados.
function ssAuditText(e) {
  const t = `<b>${escapeHtml(e.target_name || '?')}</b>`;
  const d = e.details || {};
  switch (e.action) {
    case 'server_update': return `mudou ${ssJoinList((d.changed || []).map((k) => SS_SERVER_FIELDS[k] || k)) || 'as configurações'} do servidor`;
    case 'server_icon': return d.removed ? 'removeu o ícone do servidor' : 'trocou o ícone do servidor';
    case 'server_banner': return d.removed ? 'removeu o banner do servidor' : 'trocou o banner do servidor';
    case 'everyone_permissions': return 'mudou as permissões do <b>@everyone</b>';
    case 'channel_create': return `criou o canal ${d.channel_type === 'voice' ? '🔊' : '#'}${t}`;
    case 'channel_update': return `editou o canal ${t}`;
    case 'channel_delete': return `apagou o canal ${d.channel_type === 'voice' ? '🔊' : '#'}${t}`;
    case 'category_create': return `criou a categoria ${t}`;
    case 'category_update': return d.renamed_to ? `renomeou a categoria ${t} pra <b>${escapeHtml(d.renamed_to)}</b>` : `editou a categoria ${t}`;
    case 'category_delete': return `apagou a categoria ${t}`;
    case 'role_create': return `criou o cargo ${t}`;
    case 'role_update': return `editou o cargo ${t}`;
    case 'role_delete': return `apagou o cargo ${t}`;
    case 'member_roles': {
      if (d.bulk) return `deu o cargo ${t} pra ${d.bulk} ${d.bulk === 1 ? 'pessoa' : 'pessoas'}`;
      const parts = [];
      if ((d.added || []).length) parts.push(`deu ${ssJoinList(d.added.map((n) => `<b>${escapeHtml(n)}</b>`))} pra ${t}`);
      if ((d.removed || []).length) parts.push(`tirou ${ssJoinList(d.removed.map((n) => `<b>${escapeHtml(n)}</b>`))} de ${t}`);
      return parts.join(' e ') || `mudou os cargos de ${t}`;
    }
    case 'member_kick': return `expulsou ${t}`;
    case 'member_ban': return `baniu ${t}`;
    case 'member_unban': return `desbaniu ${t}`;
    case 'invite_create': return `criou o convite <b>${escapeHtml(e.target_name || '')}</b>`;
    case 'invite_delete': return `revogou o convite <b>${escapeHtml(e.target_name || '')}</b>`;
    case 'voice_disconnect': return `desconectou ${t} da call`;
    case 'voice_move': return `levou ${t} pra 🔊<b>${escapeHtml(d.channel || '')}</b>`;
    case 'sound_create': return `adicionou o som ${t} ao soundboard`;
    case 'sound_update': return `editou o som ${t}`;
    case 'sound_delete': return `apagou o som ${t} do soundboard`;
    case 'message_delete': return `apagou uma mensagem de ${t} em <b>#${escapeHtml(d.channel || '')}</b>`;
    default: return escapeHtml(e.action);
  }
}

function ssAuditKind(action) {
  if (/_create$|_unban$/.test(action)) return 'is-create';
  if (/_delete$|_kick$|_ban$|_disconnect$/.test(action)) return 'is-delete';
  return 'is-update';
}

function ssFillAuditFilters() {
  const keepActor = ssAuditActor.value;
  const keepAction = ssAuditAction.value;
  ssAuditActor.innerHTML = '<option value="">todo mundo</option>';
  for (const m of members.slice().sort((a, b) => a.username.localeCompare(b.username))) {
    const o = document.createElement('option'); o.value = String(m.id); o.textContent = m.username; ssAuditActor.appendChild(o);
  }
  ssAuditAction.innerHTML = '<option value="">todas as ações</option>';
  for (const [k, label] of Object.entries(SS_AUDIT_ACTIONS)) {
    const o = document.createElement('option'); o.value = k; o.textContent = label; ssAuditAction.appendChild(o);
  }
  ssAuditActor.value = keepActor;
  ssAuditAction.value = keepAction;
}

async function loadSsAudit(reset) {
  const s = currentServer();
  if (ssAudit.loading) return;
  if (reset) { ssAudit = { entries: [], hasMore: false, loading: false }; ssFillAuditFilters(); }
  ssAudit.loading = true;
  const params = new URLSearchParams();
  const last = ssAudit.entries[ssAudit.entries.length - 1];
  if (last) params.set('before', String(last.id));
  if (ssAuditActor.value) params.set('actor', ssAuditActor.value);
  if (ssAuditAction.value) params.set('action', ssAuditAction.value);
  try {
    const res = await fetch(`/api/servers/${s.id}/audit-log?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    ssAudit.entries.push(...data.entries);
    ssAudit.hasMore = data.has_more;
  } catch (_) { /* fica com o que tinha */ } finally { ssAudit.loading = false; }
  renderSsAudit();
}

function renderSsAudit() {
  const list = document.getElementById('ssAuditList');
  list.innerHTML = '';
  for (const e of ssAudit.entries) {
    const row = document.createElement('div');
    row.className = `ss-audit-entry ${ssAuditKind(e.action)}`;
    row.innerHTML = `
      <span class="ss-audit-mark"></span>
      <span class="ss-avatar">${memberAvatarInner({ username: e.actor_username || '?', avatar_url: e.actor_avatar_url })}</span>
      <span class="ss-audit-text"><span><b>${escapeHtml(e.actor_username || 'alguém')}</b> ${ssAuditText(e)}</span><small></small></span>`;
    const when = row.querySelector('small');
    when.textContent = ssRelativeTime(e.created_at);
    when.title = ssFullDate(e.created_at);
    if (e.details && e.details.reason) when.textContent += ` · motivo: ${e.details.reason}`;
    list.appendChild(row);
  }
  if (!ssAudit.entries.length) list.innerHTML = '<p class="ss-empty">Nada registrado ainda.</p>';
  document.getElementById('ssAuditMore').hidden = !ssAudit.hasMore;
}

ssAuditActor.addEventListener('change', () => { ssAudit = { entries: [], hasMore: false, loading: false }; loadSsAudit(false); });
ssAuditAction.addEventListener('change', () => { ssAudit = { entries: [], hasMore: false, loading: false }; loadSsAudit(false); });
document.getElementById('ssAuditMore').addEventListener('click', () => loadSsAudit(false));

// ---------- apagar servidor ----------

document.getElementById('ssDeleteTab').addEventListener('click', async () => {
  const s = currentServer();
  if (!s || !ssIsOwner()) return;
  const typed = await ssAsk({
    title: `apagar "${s.name}"`,
    text: 'Apaga todos os canais, mensagens e sons pra sempre. Não dá pra desfazer.',
    label: 'pra confirmar, digite o nome do servidor', input: true, mustMatch: s.name, okLabel: 'apagar servidor', danger: true,
  });
  if (typed === null) return;
  const res = await fetch(`/api/servers/${s.id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra apagar', 'error'); return; }
  ssDraft = null;
  ssUpdateUnsavedBar();
  serverSettingsBackdrop.hidden = true;
  removeServerLocally(s.id, `${s.name} foi apagado`);
});

// ---------- caixa de pergunta/confirmação ----------
// ssAsk({ title, text, label?, input?, mustMatch?, okLabel?, danger? }) -> Promise:
//   sem input: true (ok) ou null (cancelou); com input: o texto digitado ou null

const ssDialogBackdrop = document.getElementById('ssDialogBackdrop');
const ssDialogInput = document.getElementById('ssDialogInput');
const ssDialogOk = document.getElementById('ssDialogOk');
let ssDialogState = null;

function ssAsk(opts) {
  if (ssDialogState) closeSsDialog(null);
  document.getElementById('ssDialogTitle').textContent = opts.title || '';
  document.getElementById('ssDialogText').textContent = opts.text || '';
  document.getElementById('ssDialogField').hidden = !opts.input;
  document.getElementById('ssDialogLabel').textContent = opts.label || '';
  document.getElementById('ssDialogError').textContent = '';
  ssDialogInput.value = '';
  ssDialogOk.textContent = opts.okLabel || 'ok';
  ssDialogOk.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
  ssDialogBackdrop.hidden = false;
  (opts.input ? ssDialogInput : ssDialogOk).focus();
  return new Promise((resolve) => { ssDialogState = { opts, resolve }; });
}

function closeSsDialog(value) {
  const st = ssDialogState;
  ssDialogState = null;
  ssDialogBackdrop.hidden = true;
  if (st) st.resolve(value);
}

function confirmSsDialog() {
  if (!ssDialogState) return;
  const { opts } = ssDialogState;
  const value = ssDialogInput.value.trim();
  if (opts.mustMatch != null && value !== opts.mustMatch.trim()) {
    document.getElementById('ssDialogError').textContent = 'o nome não bate';
    return;
  }
  closeSsDialog(opts.input ? value : true);
}

ssDialogOk.addEventListener('click', confirmSsDialog);
document.getElementById('ssDialogCancel').addEventListener('click', () => closeSsDialog(null));
ssDialogInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmSsDialog(); });
ssDialogBackdrop.addEventListener('click', (e) => { if (e.target === ssDialogBackdrop) closeSsDialog(null); });
