// didiscord — Cargos, permissões de canal e moderação de voz
// Parte 14 de 25 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - cargos e permissões
//   - cargos no cartão de perfil
//   - lista de cargos (configurações do servidor)
//   - editar canal (nome, privado, quem entra na call)
//   - moderação de voz: desconectar e mover

// ===================================================================
// cargos e permissões
// ===================================================================

function isAdminOfCurrentServer() {
  const s = currentServer();
  if (!s || !currentUser) return false;
  return s.owner_id === currentUser.id || !!s.is_admin || !!myServerPerms.is_admin;
}

function hasCurrentPermission(key) { return isAdminOfCurrentServer() || !!(myServerPerms.permissions && myServerPerms.permissions[key]); }
function currentChannelAllows(key) { return !currentChannel || currentChannel.dm || !currentChannel.permissions || currentChannel.permissions[key] !== false; }
function applyComposerPermissions() {
  chatInput.disabled = !currentChannelAllows('send');
  if (chatInput.disabled) chatInput.placeholder = 'você pode ler, mas não escrever neste canal';
  for (const id of ['attachBtn', 'gifBtn']) { const el = document.getElementById(id); if (el) el.disabled = !currentChannelAllows('attach'); }
}

function roleById(id) {
  return serverRoles.find((r) => r.id === id) || null;
}

// cargos de um membro, do mais alto pro mais baixo
function memberRoles(member) {
  return ((member && member.role_ids) || []).map(roleById).filter(Boolean).sort((a, b) => b.position - a.position);
}

function memberIsAdmin(userId) {
  return memberRoles(members.find((m) => m.id === userId)).some((r) => r.is_admin);
}

// cor do nome (lista de membros e chat) = cor do cargo mais alto "mostrado separado" da pessoa;
// quem não tem nenhum desses fica com a cor do cargo mais alto que tem cor
function memberColor(member) {
  const roles = memberRoles(member);
  const r = roles.find((x) => x.hoist && x.color) || roles.find((x) => x.color);
  return r ? r.color : null;
}

// pinta o nome de quem escreveu cada mensagem com a cor do cargo. Chamado ao montar a mensagem e
// de novo quando membros/cargos chegam ou mudam (as mensagens podem aparecer antes deles)
function applyAuthorColors(root) {
  const inServer = currentServerId != null && !(currentChannel && currentChannel.dm);
  (root || document).querySelectorAll('.msg-author[data-user-id]').forEach((el) => {
    const id = Number(el.dataset.userId);
    const color = inServer ? memberColor(members.find((m) => m.id === id)) : null;
    el.style.color = color || '';
  });
}

// mesma regra do servidor (routes/servers.js, canModerate): ninguém mexe no dono, e só o dono
// mexe em outro administrador
function canModerateMember(userId, permission) {
  const s = currentServer();
  if (!s || !currentUser || userId === currentUser.id || userId === BOT_USER_ID) return false;
  if (!(permission ? hasCurrentPermission(permission) : isAdminOfCurrentServer()) || userId === s.owner_id) return false;
  if (s.owner_id === currentUser.id) return true;
  return !memberIsAdmin(userId);
}

async function loadRoles() {
  const sid = currentServerId;
  if (sid == null) { serverRoles = []; return; }
  try {
    const res = await fetch(`/api/servers/${sid}/roles`);
    if (res.ok && sid === currentServerId) serverRoles = (await res.json()).roles;
  } catch (_) { /* fica com a lista anterior */ }
}

async function loadChannelsForCurrent() {
  const sid = currentServerId;
  if (sid == null) return;
  try {
    const res = await fetch(`/api/servers/${sid}/channels`);
    if (!res.ok || sid !== currentServerId) return;
    const data = await res.json();
    channels = data.channels;
  channelCategories = data.categories || [];
    myServerPerms = data.me || { is_admin: false, role_ids: [] };
  } catch (_) { /* fica com a lista anterior */ }
}

// cargos ou permissões de canal mudaram: recarrega o que eu vejo desse servidor
async function refreshServerData(serverId) {
  await loadServers(); // "sou admin?" de cada servidor pode ter mudado
  if (serverId !== currentServerId) return;
  await Promise.all([loadChannelsForCurrent(), loadMembers(), loadRoles()]);
  if (serverId !== currentServerId) return;
  renderMembers(); // os cargos podem ter chegado depois dos membros: refaz grupos e cores (lista e chat)

  if (currentChannel && !currentChannel.dm) {
    const fresh = channels.find((c) => c.id === currentChannel.id);
    if (!fresh) {
      // perdi acesso ao canal que estava aberto
      currentChannel = null;
      const fallback = channels.find((c) => c.type === 'text');
      if (fallback) selectChannel(fallback);
      else setMainEmpty('você não tem mais acesso a esse canal', 'Escolha outro canal na lateral.');
    } else {
      Object.assign(currentChannel, fresh);
      applyComposerPermissions();
    }
  }
  if (voiceChannel) {
    const fresh = channels.find((c) => c.id === voiceChannel.id);
    if (fresh) Object.assign(voiceChannel, fresh);
  }
  renderChannels();
  renderSidebarHeader();
  renderCategorySettings();
  renderMembers();
  if (!serverSettingsBackdrop.hidden) {
    if (isAdminOfCurrentServer()) renderRolesList();
    else serverSettingsBackdrop.hidden = true;
  }
}

// ---------- cargos no cartão de perfil ----------

async function setMemberRoles(user, roleIds, anchorEl) {
  const s = currentServer();
  if (!s) return;
  const res = await fetch(`/api/servers/${s.id}/members/${user.id}/roles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role_ids: roleIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra mudar os cargos', 'error'); return; }
  const member = members.find((m) => m.id === user.id);
  if (member) member.role_ids = data.role_ids;
  renderMembers();
  if (!viewProfileBackdrop.hidden) showProfilePopout(findUser(user.id) || user, user.mutual_servers || null, anchorEl);
}

// seção "cargos" do cartão: etiquetas com a cor de cada cargo; quem pode, tira (×) e põe (+)
function fillProfileRoles(wrap, cfg) {
  const list = wrap.querySelector('.pc-roles');
  list.innerHTML = '';
  if (!cfg.roles.length && !cfg.editable) return; // sem cargos e sem poder dar: some
  wrap.hidden = false;

  const currentIds = cfg.roles.map((r) => r.id);
  const canTouch = (role) => cfg.editable && (!role.is_admin || cfg.amOwner);

  for (const role of cfg.roles) {
    const chip = document.createElement('span');
    chip.className = 'pc-role';
    chip.style.setProperty('--role-color', role.color || 'var(--text-faint)');
    chip.innerHTML = '<i class="pc-role-dot"></i><span class="pc-role-name"></span>';
    chip.querySelector('.pc-role-name').textContent = role.name;
    if (role.is_admin) chip.title = 'administrador';
    if (canTouch(role)) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'pc-role-remove';
      x.setAttribute('aria-label', `tirar o cargo ${role.name}`);
      x.textContent = '×';
      x.addEventListener('click', () => cfg.onChange(currentIds.filter((id) => id !== role.id)));
      chip.appendChild(x);
    }
    list.appendChild(chip);
  }

  const addable = cfg.editable ? cfg.available.filter((r) => !currentIds.includes(r.id) && canTouch(r)) : [];
  if (addable.length) {
    const addWrap = document.createElement('span');
    addWrap.className = 'pc-role-add-wrap';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'pc-role-add';
    add.title = 'dar um cargo';
    add.setAttribute('aria-label', 'dar um cargo');
    add.textContent = '+';
    const menu = document.createElement('div');
    menu.className = 'pc-role-menu';
    menu.hidden = true;
    for (const r of addable) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pc-role-menu-item';
      item.style.setProperty('--role-color', r.color || 'var(--text-faint)');
      item.innerHTML = '<i class="pc-role-dot"></i><span></span>';
      item.querySelector('span').textContent = r.name + (r.is_admin ? ' (admin)' : '');
      item.addEventListener('click', () => cfg.onChange([...currentIds, r.id]));
      menu.appendChild(item);
    }
    add.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    addWrap.append(add, menu);
    list.appendChild(addWrap);
  } else if (!cfg.roles.length) {
    const none = document.createElement('span');
    none.className = 'pc-roles-empty';
    none.textContent = serverRoles.length ? 'sem cargos' : 'crie cargos nas configurações do servidor';
    list.appendChild(none);
  }
}

// ---------- lista de cargos (configurações do servidor) ----------

const rolesList = document.getElementById('rolesList');
const roleCreateBtn = document.getElementById('roleCreateBtn');
const serverDangerZone = document.getElementById('serverDangerZone');

async function roleRequest(method, path, body) {
  const s = currentServer();
  if (!s) return null;
  const res = await fetch(`/api/servers/${s.id}/roles${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra salvar o cargo', 'error'); return null; }
  return data;
}

function renderRolesList() {
  const s = currentServer();
  const amOwner = !!(s && currentUser && s.owner_id === currentUser.id);
  const openedRoles = new Set([...rolesList.querySelectorAll('[data-role-id]')].filter(row => row.querySelector('details')?.open).map(row => row.dataset.roleId));
  rolesList.innerHTML = '';
  if (!serverRoles.length) {
    rolesList.innerHTML = '<p class="roles-empty">Nenhum cargo ainda. Crie um pra separar quem vê ou entra em cada canal.</p>';
    return;
  }
  for (const role of serverRoles) {
    const row = document.createElement('div');
    row.className = 'role-row';
    row.dataset.roleId = String(role.id);
    row.innerHTML = `
        <input type="color" class="role-color" title="cor do cargo" aria-label="cor do cargo">
        <input type="text" class="role-name" maxlength="32" aria-label="nome do cargo">
        <label class="role-hoist" title="mostrar quem tem esse cargo num grupo separado na lista de membros (com o nome do cargo em cima)">
          <input type="checkbox"> <span>separado</span>
        </label>
        <label class="role-admin" title="${amOwner ? 'administradores gerenciam o servidor, canais, cargos e calls' : 'só o dono muda quem é administrador'}">
          <input type="checkbox"> <span>admin</span>
        </label>
        <span class="role-move">
          <button type="button" class="role-up" title="subir o cargo" aria-label="subir o cargo">▲</button>
          <button type="button" class="role-down" title="descer o cargo" aria-label="descer o cargo">▼</button>
        </span>
        <button type="button" class="role-delete" title="apagar cargo" aria-label="apagar cargo">${TRASH_ICON}</button>
      `;
    // ordem dos cargos: o de cima vale mais (cor do nome, grupo na lista de membros). Trocar de
    // lugar regrava as posições de cima pra baixo, o que também desempata cargos antigos.
    const index = serverRoles.indexOf(role);
    const moveBy = async (delta) => {
      const order = serverRoles.slice();
      const target = index + delta;
      if (target < 0 || target >= order.length) return;
      [order[index], order[target]] = [order[target], order[index]];
      rolesList.querySelectorAll('.role-move button').forEach((b) => { b.disabled = true; });
      for (let k = 0; k < order.length; k++) {
        const position = order.length - k;
        if (order[k].position !== position) await roleRequest('PATCH', `/${order[k].id}`, { position });
      }
      await loadRoles();
      renderRolesList();
      renderMembers();
    };
    const up = row.querySelector('.role-up');
    const down = row.querySelector('.role-down');
    up.disabled = index === 0;
    down.disabled = index === serverRoles.length - 1;
    up.addEventListener('click', () => moveBy(-1));
    down.addEventListener('click', () => moveBy(1));
    const color = row.querySelector('.role-color');
    const name = row.querySelector('.role-name');
    const admin = row.querySelector('.role-admin input');
    const hoist = row.querySelector('.role-hoist input');
    hoist.checked = !!role.hoist;
    hoist.addEventListener('change', async () => {
      const ok = await roleRequest('PATCH', `/${role.id}`, { hoist: hoist.checked });
      if (!ok) hoist.checked = !!role.hoist;
    });
    const del = row.querySelector('.role-delete');
    color.value = role.color || '#9D5CE8';
    name.value = role.name;
    admin.checked = role.is_admin;
    admin.disabled = !amOwner;
    del.disabled = role.is_admin && !amOwner;

    color.addEventListener('change', () => roleRequest('PATCH', `/${role.id}`, { color: color.value }));
    name.addEventListener('change', async () => {
      const ok = await roleRequest('PATCH', `/${role.id}`, { name: name.value });
      if (!ok) name.value = role.name;
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    admin.addEventListener('change', async () => {
      const ok = await roleRequest('PATCH', `/${role.id}`, { is_admin: admin.checked });
      if (!ok) admin.checked = role.is_admin;
    });
    del.addEventListener('click', async () => {
      if (!confirm(`apagar o cargo "${role.name}"? quem tem esse cargo perde ele.`)) return;
      await roleRequest('DELETE', `/${role.id}`);
    });
    const permissions = document.createElement('details'); permissions.className = 'role-permissions'; permissions.open = openedRoles.has(String(role.id));
    const summary = document.createElement('summary'); summary.textContent = 'permissões deste cargo'; permissions.appendChild(summary);
    for (const [key, title] of Object.entries({ manage_channels: 'gerenciar canais e categorias', manage_messages: 'apagar mensagens de outras pessoas', kick_members: 'expulsar membros', moderate_voice: 'mover e desconectar das calls' })) {
      const label = document.createElement('label'); label.className = 'perm-toggle';
      const text = document.createElement('span'); text.textContent = title;
      const box = document.createElement('input'); box.type = 'checkbox'; box.checked = role.is_admin || !!(role.permissions && role.permissions[key]); box.disabled = role.is_admin;
      box.addEventListener('change', async () => {
        const next = { ...role.permissions, [key]: box.checked }; box.disabled = true;
        try { const saved = await roleRequest('PATCH', `/${role.id}`, { permissions: next }); if (saved) role.permissions = next; else box.checked = !!(role.permissions && role.permissions[key]); }
        catch (_) { box.checked = !!(role.permissions && role.permissions[key]); toast('sem conexão', 'error'); }
        finally { box.disabled = role.is_admin; }
      });
      label.append(text, box); permissions.appendChild(label);
    }
    row.appendChild(permissions);
    rolesList.appendChild(row);
  }
}

roleCreateBtn.addEventListener('click', async () => {
  const color = ACCENT_COLORS[serverRoles.length % ACCENT_COLORS.length];
  const data = await roleRequest('POST', '', { name: 'novo cargo', color });
  if (!data) return;
  await loadRoles();
  renderRolesList();
  const input = rolesList.querySelector('.role-row:first-child .role-name');
  if (input) { input.focus(); input.select(); }
});

// ---------- editar canal (nome, privado, quem entra na call) ----------

const channelEditBackdrop = document.getElementById('channelEditBackdrop');
const channelEditName = document.getElementById('channelEditName');
const channelEditPrivateView = document.getElementById('channelEditPrivateView');
const channelEditViewRoles = document.getElementById('channelEditViewRoles');
const channelEditConnectBlock = document.getElementById('channelEditConnectBlock');
const channelEditPrivateConnect = document.getElementById('channelEditPrivateConnect');
const channelEditConnectRoles = document.getElementById('channelEditConnectRoles');
const channelEditError = document.getElementById('channelEditError');
const channelEditSaveBtn = document.getElementById('channelEditSaveBtn');
const closeChannelEdit = wireModal(channelEditBackdrop);
let editingChannel = null;

function fillRoleChecks(container, checkedIds, enabled) {
  container.innerHTML = '';
  container.classList.toggle('is-disabled', !enabled);
  if (!serverRoles.length) {
    container.innerHTML = '<p class="perm-roles-empty">Crie cargos nas configurações do servidor pra poder escolher.</p>';
    return;
  }
  for (const role of serverRoles) {
    const label = document.createElement('label');
    label.className = 'perm-role';
    label.style.setProperty('--role-color', role.color || 'var(--text-faint)');
    label.innerHTML = '<input type="checkbox"><i class="pc-role-dot"></i><span></span>';
    const box = label.querySelector('input');
    box.value = String(role.id);
    // admin sempre tem acesso — aparece marcado e travado, só pra deixar isso claro
    box.checked = role.is_admin || checkedIds.includes(role.id);
    box.disabled = !enabled || role.is_admin;
    label.querySelector('span').textContent = role.name + (role.is_admin ? ' (admin)' : '');
    container.appendChild(label);
  }
}

function checkedRoleIds(container) {
  return [...container.querySelectorAll('input:checked:not(:disabled)')].map((b) => Number(b.value));
}

function openChannelEdit(ch) {
  if (!hasCurrentPermission('manage_channels')) return;
  editingChannel = ch;
  channelEditName.value = ch.name;
  const select = document.getElementById('channelEditCategory');
  select.replaceChildren(new Option('sem categoria', ''));
  for (const c of channelCategories) select.add(new Option(c.name, c.id));
  select.value = ch.category_id || '';
  document.getElementById('channelEditPosition').value = ch.position;
  const extra = document.getElementById('channelExtraPermissions'); extra.replaceChildren();
  if (ch.type === 'text') for (const [key, title] of Object.entries({ send: 'enviar mensagens', attach: 'enviar anexos e GIFs', react: 'adicionar reações', pin: 'fixar mensagens' })) {
    const block = document.createElement('section'); block.className = 'perm-block';
    block.innerHTML = `<label class="perm-toggle"><span><strong>restringir ${title}</strong><small>desligado: todos que veem o canal; ligado: somente os cargos marcados</small></span><input type="checkbox" data-action="${key}"></label><div class="perm-roles"></div>`;
    const toggle = block.querySelector('input'), list = block.querySelector('.perm-roles');
    toggle.checked = !!ch['private_' + key];
    fillRoleChecks(list, ch[key + '_role_ids'] || [], toggle.checked);
    toggle.addEventListener('change', () => fillRoleChecks(list, [...list.querySelectorAll('input:checked')].map(b => Number(b.value)), toggle.checked));
    extra.appendChild(block);
  }
  channelEditError.textContent = '';
  channelEditPrivateView.checked = !!ch.private_view;
  fillRoleChecks(channelEditViewRoles, ch.view_role_ids || [], !!ch.private_view);
  channelEditConnectBlock.hidden = ch.type !== 'voice';
  channelEditPrivateConnect.checked = !!ch.private_connect;
  fillRoleChecks(channelEditConnectRoles, ch.connect_role_ids || [], !!ch.private_connect);
  channelEditBackdrop.hidden = false;
  channelEditName.focus();
}

channelEditPrivateView.addEventListener('change', () => {
  fillRoleChecks(channelEditViewRoles, checkedRoleIds(channelEditViewRoles), channelEditPrivateView.checked);
});
channelEditPrivateConnect.addEventListener('change', () => {
  fillRoleChecks(channelEditConnectRoles, checkedRoleIds(channelEditConnectRoles), channelEditPrivateConnect.checked);
});

channelEditSaveBtn.addEventListener('click', async () => {
  if (!editingChannel) return;
  const ch = editingChannel;
  const body = {
    name: channelEditName.value,
    category_id: Number(document.getElementById('channelEditCategory').value) || null,
    position: Number(document.getElementById('channelEditPosition').value),
    private_view: channelEditPrivateView.checked,
    view_role_ids: checkedRoleIds(channelEditViewRoles),
  };
  for (const box of document.querySelectorAll('#channelExtraPermissions [data-action]')) {
    body['private_' + box.dataset.action] = box.checked;
    body[box.dataset.action + '_role_ids'] = checkedRoleIds(box.closest('section').querySelector('.perm-roles'));
  }
  if (ch.type === 'voice') {
    body.private_connect = channelEditPrivateConnect.checked;
    body.connect_role_ids = checkedRoleIds(channelEditConnectRoles);
  }
  channelEditSaveBtn.disabled = true;
  try {
    const res = await fetch(`/api/channels/${ch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { channelEditError.textContent = data.error || 'não deu pra salvar'; return; }
    closeChannelEdit();
    // a lista recarrega sozinha pelo evento channels_updated
  } catch (_) {
    channelEditError.textContent = 'sem conexão — tente salvar novamente';
  } finally {
    channelEditSaveBtn.disabled = false;
  }
});

// ---------- moderação de voz: desconectar e mover ----------

async function voiceModeration(userId, action, body) {
  const s = currentServer();
  if (!s) return false;
  const res = await fetch(`/api/servers/${s.id}/voice/${userId}/${action}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'não deu pra fazer isso', 'error'); return false; }
  return true;
}

function moveMemberToChannel(userId, channelId) {
  return voiceModeration(userId, 'move', { channel_id: channelId });
}

async function disconnectMember(userId, username) {
  if (await voiceModeration(userId, 'disconnect')) toast(`${username} foi desconectado da call`);
}

// itens de administrador no menu de clique direito de quem está numa call deste servidor
function appendVoiceModerationItems(menu, userId) {
  if (!canModerateMember(userId, 'moderate_voice')) return;
  const chId = findParticipantChannel(userId);
  const ch = chId != null ? channels.find((c) => c.id === chId) : null;
  if (!ch) return; // não está numa call deste servidor

  const section = document.createElement('div');
  section.className = 'participant-context-menu-admin';
  section.innerHTML = '<div class="participant-context-menu-subtitle">moderação</div>';
  const addItem = (label, onClick, danger) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'participant-context-menu-item' + (danger ? ' is-danger' : '');
    b.textContent = label;
    b.addEventListener('click', () => { closeParticipantContextMenu(); onClick(); });
    section.appendChild(b);
  };
  if (voiceChannel && voiceChannel.server_id === currentServerId && voiceChannel.id !== ch.id) {
    addItem('puxar pra minha call', () => moveMemberToChannel(userId, voiceChannel.id));
  }
  for (const other of channels) {
    if (other.type !== 'voice' || other.id === ch.id) continue;
    if (voiceChannel && other.id === voiceChannel.id) continue; // já tem "puxar pra minha call"
    addItem(`mover para ${other.name}`, () => moveMemberToChannel(userId, other.id));
  }
  addItem('desconectar da call', () => {
    const u = findUser(userId);
    disconnectMember(userId, u ? u.username : 'a pessoa');
  }, true);
  menu.appendChild(section);
}

// arrastar alguém da lista de quem está em call e soltar em outro canal de voz (administradores)
const DRAG_MIME = 'application/x-didiscord-user';

function makeVoiceRowDraggable(row, userId) {
  if (!canModerateMember(userId, 'moderate_voice')) return;
  row.draggable = true;
  row.classList.add('is-draggable');
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData(DRAG_MIME, String(userId));
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('is-dragging');
    channelGroups.classList.add('is-dragging-user');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('is-dragging');
    channelGroups.classList.remove('is-dragging-user');
  });
}

function makeVoiceChannelDropTarget(el, ch) {
  if (ch.type !== 'voice' || !hasCurrentPermission('moderate_voice')) return;
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('is-drop-target');
  });
  el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));
  el.addEventListener('drop', (e) => {
    el.classList.remove('is-drop-target');
    const userId = Number(e.dataTransfer.getData(DRAG_MIME));
    if (!userId) return;
    e.preventDefault();
    if (findParticipantChannel(userId) === ch.id) return;
    moveMemberToChannel(userId, ch.id);
  });
}
