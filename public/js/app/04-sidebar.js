// dusky — Barra lateral: canais, categorias, conversas diretas e criar canal
// Parte 4 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - sidebar / canais
//   - lista de mensagens diretas (lateral da tela inicial)
//   - menus de botão direito (espaço vazio, categoria, canal)
//   - arrastar pra reordenar canais e categorias
//   - modal de criar canal

// ---------- sidebar / canais ----------
// Igual ao Discord: os canais sem categoria ficam no topo, sem título (texto e voz juntos); depois
// vem cada categoria com o título em caixa alta, a setinha de recolher e o "+" que aparece ao passar
// o mouse. Dentro de cada lista, os de texto vêm antes dos de voz. Quem gerencia canais arrasta canais
// e categorias pra reordenar e usa o botão direito pra criar, editar e apagar.

const CHEVRON_ICON = '<svg class="category-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const PLUS_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const INVITE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>';

// texto antes de voz; depois a posição salva
function channelSortKey(c) { return c.type === 'voice' ? 1 : 0; }
function sortChannelList(list) {
  return list.sort((a, b) => channelSortKey(a) - channelSortKey(b) || a.position - b.position || a.id - b.id);
}
function channelsInCategory(categoryId) {
  return sortChannelList(channels.filter((c) => (c.category_id || null) === categoryId));
}
function sortedCategories() {
  return [...channelCategories].sort((a, b) => a.position - b.position || a.id - b.id);
}

function categoryCollapseKey(categoryId) { return `dusky:category:${currentServerId}:${categoryId}`; }
function isCategoryCollapsed(categoryId) {
  try { return localStorage.getItem(categoryCollapseKey(categoryId)) === '1'; } catch (_) { return false; }
}
function setCategoryCollapsed(categoryId, collapsed) {
  try { localStorage.setItem(categoryCollapseKey(categoryId), collapsed ? '1' : '0'); } catch (_) {}
}

function renderChannels() {
  channelGroups.innerHTML = '';

  // tela inicial (mensagens diretas): a lateral vira a lista de conversas
  if (currentServerId == null) {
    renderDmList();
    return;
  }

  const canManage = hasCurrentPermission('manage_channels');

  // canais sem categoria: no topo, sem título
  const loose = document.createElement('div');
  loose.className = 'channel-group channel-group-loose';
  loose.dataset.categoryId = '';
  for (const ch of channelsInCategory(null)) {
    loose.appendChild(buildChannelItem(ch, canManage));
    if (ch.type === 'voice') loose.appendChild(buildVoicePreview(ch));
  }
  channelGroups.appendChild(loose);

  for (const cat of sortedCategories()) {
    const items = channelsInCategory(cat.id);
    // quem não gerencia não vê categoria vazia (igual ao Discord)
    if (items.length === 0 && !canManage) continue;
    channelGroups.appendChild(buildCategoryGroup(cat, items, canManage));
  }

  if (canManage && !channels.length && !channelCategories.length) {
    const empty = document.createElement('div');
    empty.className = 'channel-empty';
    empty.textContent = 'nenhum canal ainda — clique com o botão direito aqui pra criar';
    channelGroups.appendChild(empty);
  }

  renderVoicePreviews();
}

function buildCategoryGroup(cat, items, canManage) {
  const wrap = document.createElement('div');
  wrap.className = 'channel-group';
  wrap.dataset.categoryId = cat.id;

  const labelRow = document.createElement('div');
  labelRow.className = 'channel-group-label';
  const heading = document.createElement('button');
  heading.type = 'button'; heading.className = 'category-heading';
  heading.innerHTML = CHEVRON_ICON + '<span class="category-heading-name"></span>';
  heading.querySelector('.category-heading-name').textContent = cat.name;
  let collapsed = isCategoryCollapsed(cat.id);
  const updateCollapse = () => {
    heading.setAttribute('aria-expanded', String(!collapsed));
    wrap.classList.toggle('is-collapsed', collapsed);
  };
  heading.addEventListener('click', () => { collapsed = !collapsed; setCategoryCollapsed(cat.id, collapsed); updateCollapse(); });
  updateCollapse();
  labelRow.appendChild(heading);
  labelRow.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openCategoryContextMenu(e, cat); });

  if (canManage) {
    // no celular (sem mouse) não tem botão direito: o "⋯" abre o mesmo menu
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'channel-add-btn category-more-btn'; more.textContent = '⋯';
    more.title = 'opções da categoria'; more.setAttribute('aria-label', 'opções da categoria ' + cat.name);
    more.addEventListener('click', (e) => { e.stopPropagation(); openCategoryContextMenu(e, cat); });
    labelRow.appendChild(more);

    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'channel-add-btn';
    addBtn.title = 'criar canal'; addBtn.setAttribute('aria-label', 'criar canal em ' + cat.name);
    addBtn.innerHTML = PLUS_ICON;
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); openCreateModal('text', cat.id); });
    labelRow.appendChild(addBtn);

    makeCategoryDraggable(labelRow, cat);
  }
  wrap.appendChild(labelRow);

  for (const ch of items) {
    wrap.appendChild(buildChannelItem(ch, canManage));
    if (ch.type === 'voice') wrap.appendChild(buildVoicePreview(ch));
  }
  return wrap;
}

// pequena lista de quem está num canal de voz, mostrada embaixo do nome do canal na sidebar
// — igual ao Discord, funciona mesmo que eu não esteja ocupando esse canal agora
function buildVoicePreview(ch) {
  const el = document.createElement('div');
  el.className = 'channel-voice-preview';
  el.dataset.channelId = ch.id;
  el.hidden = true;
  return el;
}

function renderVoicePreviews() {
  channelGroups.querySelectorAll('.channel-voice-preview').forEach((el) => {
    const channelId = Number(el.dataset.channelId);
    const stateMap = channelVoiceState.get(channelId);
    el.innerHTML = '';

    if (!stateMap || stateMap.size === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;

    for (const [userId, state] of stateMap.entries()) {
      const isBot = userId === BOT_USER_ID;
      const user = isBot ? botPseudoUser() : findUser(userId);
      if (!user) continue;
      const isSelfUser = !!(currentUser && currentUser.id === userId);

      const row = document.createElement('div');
      row.className = 'channel-voice-preview-row' + (speakingUsers.has(userId) ? ' is-speaking' : '');
      row.dataset.userId = userId;
      row.innerHTML = `
          <span class="channel-voice-preview-avatar">${memberAvatarInner(user)}</span>
          <span class="channel-voice-preview-name">${escapeHtml(user.username)}${isSelfUser ? ' (você)' : ''}</span>
          <span class="channel-voice-preview-badges">${callParticipantBadges(state)}</span>
        `;
      row.addEventListener('click', () => openViewProfile(userId, row));
      makeVoiceRowDraggable(row, userId);
      if (!isSelfUser) {
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openParticipantContextMenu(e, userId, user.username);
        });
      }
      el.appendChild(row);
    }
  });
}

function buildChannelItem(ch, canManage) {
  const el = document.createElement('div');
  el.className = 'channel-item';
  if (currentChannel && currentChannel.id === ch.id) el.classList.add('active');
  if (unreadChannels.has(ch.id)) el.classList.add('is-unread');
  el.dataset.channelId = ch.id;
  el.innerHTML = `<span class="icon">${ICONS[ch.world_scene ? 'world' : ch.type]}</span><span class="channel-item-name"></span>`;
  if (ch.world_scene) el.title = 'mundinho 3D — call espacial';
  el.querySelector('.channel-item-name').textContent = ch.name;
  const unread = unreadChannels.get(ch.id);
  if (unread && unread.mentions > 0) el.appendChild(mentionBadge(unread.mentions, 'channel-mention-badge'));

  const locked = ch.type === 'voice' && ch.can_connect === false;
  if (ch.private_view || (ch.type === 'voice' && ch.private_connect)) {
    const lock = document.createElement('span');
    lock.className = 'channel-lock';
    lock.innerHTML = LOCK_ICON;
    lock.title = locked
      ? 'você não tem permissão pra entrar nessa call'
      : (ch.private_view ? 'canal privado (só alguns cargos veem)' : 'só alguns cargos entram nessa call');
    el.appendChild(lock);
  }
  if (locked) {
    el.classList.add('is-locked');
    el.title = 'você não tem permissão pra entrar nessa call';
  }
  makeVoiceChannelDropTarget(el, ch);

  // ícones que aparecem ao passar o mouse, igual ao Discord: convidar e editar canal
  const inviteBtn = document.createElement('button');
  inviteBtn.type = 'button';
  inviteBtn.className = 'channel-invite-btn';
  inviteBtn.title = 'criar convite';
  inviteBtn.setAttribute('aria-label', 'criar convite');
  inviteBtn.innerHTML = INVITE_ICON;
  inviteBtn.addEventListener('click', (e) => { e.stopPropagation(); openInviteModal(); });
  el.appendChild(inviteBtn);

  if (canManage) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'channel-edit-btn';
    editBtn.title = 'editar canal';
    editBtn.setAttribute('aria-label', `editar canal ${ch.name}`);
    editBtn.innerHTML = GEAR_ICON;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openChannelEdit(ch);
    });
    el.appendChild(editBtn);
    makeChannelDraggable(el, ch);
  }

  el.addEventListener('click', () => selectChannel(ch));
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openChannelContextMenu(e, ch); });
  return el;
}

async function deleteChannel(ch) {
  if (!confirm(`apagar o canal "${ch.name}"? isso apaga o histórico junto.`)) return;
  const res = await fetch(`/api/channels/${ch.id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast(data.error || 'não deu pra apagar o canal', 'error');
  }
  // a atualização da lista chega via broadcast (channel_deleted)
}

function deleteCategory(cat) {
  editingCategoryId = cat.id;
  saveCategory(true);
}

// ---------- menus de botão direito da lateral (espaço vazio, categoria, canal) ----------

let sidebarMenuEl = null;

function closeSidebarMenu() {
  if (!sidebarMenuEl) return;
  sidebarMenuEl.remove();
  sidebarMenuEl = null;
  document.removeEventListener('mousedown', sidebarMenuOutside, true);
  document.removeEventListener('keydown', sidebarMenuKey, true);
  window.removeEventListener('blur', closeSidebarMenu);
  window.removeEventListener('resize', closeSidebarMenu);
}
function sidebarMenuOutside(e) { if (sidebarMenuEl && !sidebarMenuEl.contains(e.target)) closeSidebarMenu(); }
function sidebarMenuKey(e) { if (e.key === 'Escape') closeSidebarMenu(); }

// items: { label, onClick, danger?, checked?, icon? } | { sep: true } | falsy (ignorado)
function openSidebarMenu(e, items) {
  closeSidebarMenu();
  closeParticipantContextMenu();
  const list = items.filter(Boolean);
  // tira separadores sobrando no começo, no fim e repetidos
  const clean = list.filter((it, i) => !it.sep || (i > 0 && i < list.length - 1 && !list[i - 1].sep));
  if (!clean.length) return;

  const menu = document.createElement('div');
  menu.className = 'sidebar-ctx-menu';
  menu.setAttribute('role', 'menu');
  for (const it of clean) {
    if (it.sep) { const s = document.createElement('div'); s.className = 'sidebar-ctx-sep'; menu.appendChild(s); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sidebar-ctx-item' + (it.danger ? ' is-danger' : '');
    b.setAttribute('role', it.checked === undefined ? 'menuitem' : 'menuitemcheckbox');
    const label = document.createElement('span'); label.textContent = it.label; b.appendChild(label);
    if (it.checked !== undefined) {
      const box = document.createElement('span');
      box.className = 'sidebar-ctx-check' + (it.checked ? ' is-checked' : '');
      b.setAttribute('aria-checked', String(!!it.checked));
      b.appendChild(box);
    } else if (it.icon) {
      const ic = document.createElement('span'); ic.className = 'sidebar-ctx-icon'; ic.innerHTML = it.icon; b.appendChild(ic);
    }
    b.addEventListener('click', () => { closeSidebarMenu(); it.onClick(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  sidebarMenuEl = menu;

  // abre onde clicou (ou embaixo do botão "⋯"), sem sair da tela
  let x = e.clientX, y = e.clientY;
  if (!x && !y && e.currentTarget && e.currentTarget.getBoundingClientRect) {
    const r = e.currentTarget.getBoundingClientRect(); x = r.left; y = r.bottom + 4;
  }
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';

  document.addEventListener('mousedown', sidebarMenuOutside, true);
  document.addEventListener('keydown', sidebarMenuKey, true);
  window.addEventListener('blur', closeSidebarMenu);
  window.addEventListener('resize', closeSidebarMenu);
}

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'copiado'); }
  catch (_) { toast('não deu pra copiar', 'error'); }
}

function openSidebarBlankMenu(e) {
  if (currentServerId == null) return;
  const canManage = hasCurrentPermission('manage_channels');
  openSidebarMenu(e, [
    canManage && { label: 'criar canal', icon: PLUS_ICON, onClick: () => openCreateModal('text') },
    canManage && { label: 'criar categoria', icon: PLUS_ICON, onClick: () => editCategory() },
    canManage && { sep: true },
    { label: 'convidar pessoas', icon: INVITE_ICON, onClick: openInviteModal },
  ]);
}

function openCategoryContextMenu(e, cat) {
  const canManage = hasCurrentPermission('manage_channels');
  const collapsed = isCategoryCollapsed(cat.id);
  const allCollapsed = channelCategories.length > 0 && channelCategories.every((c) => isCategoryCollapsed(c.id));
  openSidebarMenu(e, [
    { label: 'recolher categoria', checked: collapsed, onClick: () => { setCategoryCollapsed(cat.id, !collapsed); renderChannels(); } },
    { label: 'recolher todas as categorias', checked: allCollapsed, onClick: () => { for (const c of channelCategories) setCategoryCollapsed(c.id, !allCollapsed); renderChannels(); } },
    canManage && { sep: true },
    canManage && { label: 'criar canal', icon: PLUS_ICON, onClick: () => openCreateModal('text', cat.id) },
    canManage && { label: 'editar categoria', onClick: () => editCategory(cat) },
    canManage && { label: 'apagar categoria', danger: true, onClick: () => deleteCategory(cat) },
    { sep: true },
    { label: 'copiar ID da categoria', onClick: () => copyText(String(cat.id), 'ID copiado') },
  ]);
}

function openChannelContextMenu(e, ch) {
  const canManage = hasCurrentPermission('manage_channels');
  openSidebarMenu(e, [
    { label: 'convidar pessoas', icon: INVITE_ICON, onClick: openInviteModal },
    { sep: true },
    canManage && { label: 'editar canal', onClick: () => openChannelEdit(ch) },
    canManage && { label: 'apagar canal', danger: true, onClick: () => deleteChannel(ch) },
    { sep: true },
    { label: 'copiar ID do canal', onClick: () => copyText(String(ch.id), 'ID copiado') },
  ]);
}

// botão direito no espaço vazio da lateral (fora de canal e de título de categoria)
channelGroups.addEventListener('contextmenu', (e) => {
  if (currentServerId == null) return;
  if (e.target.closest('.channel-item, .channel-group-label, .channel-voice-preview-row')) return;
  e.preventDefault();
  openSidebarBlankMenu(e);
});

// ---------- arrastar pra reordenar canais e categorias (igual ao Discord) ----------
// Canal: solta em cima/embaixo de outro canal, no título de uma categoria (vai pro começo dela) ou no
// espaço da categoria (vai pro fim). Pra tirar da categoria, solta no topo da lista. Categoria: solta
// antes/depois de outra. A ordem nova aparece na hora e vai pro servidor de uma vez (PUT .../layout).

const CHANNEL_DRAG_MIME = 'application/x-dusky-channel';
const CATEGORY_DRAG_MIME = 'application/x-dusky-category';
let sidebarDrag = null; // { kind: 'channel' | 'category', id, el }

function startSidebarDrag(e, kind, id, el) {
  sidebarDrag = { kind, id, el };
  e.dataTransfer.setData(kind === 'channel' ? CHANNEL_DRAG_MIME : CATEGORY_DRAG_MIME, String(id));
  e.dataTransfer.effectAllowed = 'move';
  closeSidebarMenu();
  // deixa o navegador tirar a "foto" do item antes de apagar ele
  requestAnimationFrame(() => {
    el.classList.add('is-dragging');
    channelGroups.classList.add('is-sorting', kind === 'channel' ? 'is-sorting-channel' : 'is-sorting-category');
  });
}

function endSidebarDrag() {
  if (sidebarDrag && sidebarDrag.el) sidebarDrag.el.classList.remove('is-dragging');
  sidebarDrag = null;
  clearSidebarDropMarks();
  channelGroups.classList.remove('is-sorting', 'is-sorting-channel', 'is-sorting-category');
}

function clearSidebarDropMarks() {
  channelGroups.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
}

function makeChannelDraggable(el, ch) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => startSidebarDrag(e, 'channel', ch.id, el));
  el.addEventListener('dragend', endSidebarDrag);
}

function makeCategoryDraggable(labelRow, cat) {
  labelRow.draggable = true;
  labelRow.addEventListener('dragstart', (e) => startSidebarDrag(e, 'category', cat.id, labelRow.parentElement || labelRow));
  labelRow.addEventListener('dragend', endSidebarDrag);
}

function groupCategoryId(group) {
  return group && group.dataset.categoryId ? Number(group.dataset.categoryId) : null;
}

// onde o item arrastado cairia, pela posição do mouse
function sidebarDropTarget(e) {
  if (!sidebarDrag) return null;
  if (sidebarDrag.kind === 'category') {
    const group = e.target.closest('.channel-group[data-category-id]:not(.channel-group-loose)');
    if (!group) return null;
    const refCatId = groupCategoryId(group);
    if (refCatId === sidebarDrag.id) return null;
    const r = group.getBoundingClientRect();
    const before = e.clientY < r.top + Math.min(r.height / 2, 28);
    return { el: group, cls: before ? 'drop-before' : 'drop-after', refCatId, before };
  }

  const preview = e.target.closest('.channel-voice-preview');
  const item = e.target.closest('.channel-item') || (preview && preview.previousElementSibling && preview.previousElementSibling.closest('.channel-item'));
  if (item) {
    const group = item.closest('.channel-group');
    const refId = Number(item.dataset.channelId);
    if (refId === sidebarDrag.id) return null;
    const r = item.getBoundingClientRect();
    const before = !preview && e.clientY < r.top + r.height / 2;
    return { el: item, cls: before ? 'drop-before' : 'drop-after', categoryId: groupCategoryId(group), refId, before };
  }
  const label = e.target.closest('.channel-group-label');
  if (label) return { el: label.parentElement, cls: 'drop-into', categoryId: groupCategoryId(label.parentElement), refId: null, atStart: true };
  const group = e.target.closest('.channel-group');
  if (group) return { el: group, cls: 'drop-into', categoryId: groupCategoryId(group), refId: null, atStart: false };
  return null;
}

channelGroups.addEventListener('dragover', (e) => {
  if (!sidebarDrag) return; // arrastar gente entre calls continua com o código dele (14-roles.js)
  const t = sidebarDropTarget(e);
  clearSidebarDropMarks();
  if (!t) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  t.el.classList.add(t.cls);
});

channelGroups.addEventListener('dragleave', (e) => {
  if (sidebarDrag && !channelGroups.contains(e.relatedTarget)) clearSidebarDropMarks();
});

channelGroups.addEventListener('drop', (e) => {
  if (!sidebarDrag) return;
  const t = sidebarDropTarget(e);
  const drag = sidebarDrag;
  endSidebarDrag();
  if (!t) return;
  e.preventDefault();
  if (drag.kind === 'channel') applyChannelDrop(drag.id, t);
  else applyCategoryDrop(drag.id, t);
});

function applyChannelDrop(channelId, t) {
  const ch = channels.find((c) => c.id === channelId);
  if (!ch) return;
  const fromCat = ch.category_id || null;
  const list = channelsInCategory(t.categoryId).filter((c) => c.id !== channelId);
  let idx = t.atStart ? 0 : list.length;
  if (t.refId != null) {
    idx = list.findIndex((c) => c.id === t.refId);
    if (idx < 0) idx = list.length;
    else if (!t.before) idx++;
  }
  list.splice(idx, 0, ch);
  // texto sempre antes de voz dentro da lista (igual ao Discord)
  const ordered = [...list.filter((c) => c.type !== 'voice'), ...list.filter((c) => c.type === 'voice')];
  const updates = ordered.map((c, i) => ({ id: c.id, category_id: t.categoryId, position: i }));
  if (fromCat !== t.categoryId) {
    channelsInCategory(fromCat).filter((c) => c.id !== channelId)
      .forEach((c, i) => updates.push({ id: c.id, category_id: fromCat, position: i }));
  }
  // só manda o que mudou
  const changed = updates.filter((u) => {
    const c = channels.find((x) => x.id === u.id);
    return c && ((c.category_id || null) !== u.category_id || c.position !== u.position);
  });
  if (!changed.length) return;
  for (const u of changed) {
    const c = channels.find((x) => x.id === u.id);
    c.category_id = u.category_id; c.position = u.position;
  }
  if (t.categoryId != null) setCategoryCollapsed(t.categoryId, false);
  renderChannels();
  saveSidebarLayout({ channels: changed });
}

function applyCategoryDrop(categoryId, t) {
  const cat = channelCategories.find((c) => c.id === categoryId);
  if (!cat) return;
  const list = sortedCategories().filter((c) => c.id !== categoryId);
  let idx = list.findIndex((c) => c.id === t.refCatId);
  if (idx < 0) idx = list.length;
  else if (!t.before) idx++;
  list.splice(idx, 0, cat);
  const changed = list.map((c, i) => ({ id: c.id, position: i })).filter((u) => channelCategories.find((c) => c.id === u.id).position !== u.position);
  if (!changed.length) return;
  for (const u of changed) channelCategories.find((c) => c.id === u.id).position = u.position;
  renderChannels();
  saveSidebarLayout({ categories: changed });
}

async function saveSidebarLayout(body) {
  const sid = currentServerId;
  try {
    const res = await fetch(`/api/servers/${sid}/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw Error(data.error || 'não deu pra salvar a ordem');
    }
    // todo mundo (eu incluso) recarrega pela notificação channels_updated
  } catch (err) {
    toast(err.message === 'Failed to fetch' ? 'sem conexão — a ordem não foi salva' : err.message, 'error');
    refreshServerData(sid);
  }
}

// ---------- lista de mensagens diretas (lateral da tela inicial) ----------

function dmChannel(dm) {
  return { id: dm.id, type: 'text', name: dm.user.username, server_id: null, dm: true, userId: dm.user.id };
}

function renderDmList() {
  const wrap = document.createElement('div');
  wrap.className = 'channel-group';

  const labelRow = document.createElement('div');
  labelRow.className = 'channel-group-label';
  labelRow.innerHTML = '<span>conversas</span>';
  const addBtn = document.createElement('button');
  addBtn.className = 'channel-add-btn';
  addBtn.title = 'nova conversa';
  addBtn.setAttribute('aria-label', 'nova conversa');
  addBtn.textContent = '+';
  addBtn.addEventListener('click', openNewDmModal);
  labelRow.appendChild(addBtn);
  wrap.appendChild(labelRow);

  if (dms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'channel-empty';
    empty.textContent = 'nenhuma conversa ainda';
    wrap.appendChild(empty);
  }

  for (const dm of dms) wrap.appendChild(buildDmItem(dm));
  channelGroups.appendChild(wrap);
}

function buildDmItem(dm) {
  const u = findUser(dm.user.id) || dm.user;
  const el = document.createElement('div');
  el.className = 'dm-item';
  if (currentChannel && currentChannel.id === dm.id) el.classList.add('active');
  if (unreadChannels.has(dm.id)) el.classList.add('is-unread');
  el.innerHTML = `
      <span class="dm-item-avatar">${memberAvatarInner(u)}<span class="presence-dot${presenceDotClass(u)}" title="${presenceLabel(u)}"></span></span>
      <span class="dm-item-text">
        <span class="dm-item-name"></span>
        <span class="dm-item-status"></span>
      </span>
      <span class="unread-pill" aria-label="mensagens novas"></span>
      <button type="button" class="dm-item-close" title="fechar conversa" aria-label="fechar conversa">×</button>
    `;
  // fechar conversa (34-blocks.js): some da lista até chegar mensagem nova
  el.querySelector('.dm-item-close').addEventListener('click', (e) => { e.stopPropagation(); closeDmConversation(dm); });
  el.querySelector('.dm-item-name').textContent = u.username;
  applyNameStyle(el.querySelector('.dm-item-name'), u);
  applyNameplate(el, u);
  applyAvatarDeco(el.querySelector('.dm-item-avatar'), u);
  const dmUnread = unreadChannels.get(dm.id);
  if (dmUnread && dmUnread.mentions > 0) {
    const pill = el.querySelector('.unread-pill');
    pill.textContent = dmUnread.mentions > 99 ? '99+' : String(dmUnread.mentions);
    pill.classList.add('has-count');
  }
  el.querySelector('.dm-item-status').textContent = u.status_text || (u.online ? 'online' : 'offline');
  el.addEventListener('click', () => selectChannel(dmChannel(dm)));
  return el;
}

// ---------- modal de criar canal (igual ao Discord) ----------

const channelTypePicker = document.getElementById('channelTypePicker');
const newChannelPrefix = document.getElementById('newChannelPrefix');
const newChannelPrivate = document.getElementById('newChannelPrivate');
const modalSubtitle = document.getElementById('modalSubtitle');

// canal de texto: minúsculo e com hífen no lugar de espaço, já enquanto digita (o servidor faz igual)
function normalizeNewChannelName() {
  if (pendingCreateType !== 'text') return;
  const v = newChannelName.value;
  const next = v.toLowerCase().replace(/\s/g, '-');
  if (next === v) return;
  const pos = newChannelName.selectionStart;
  newChannelName.value = next;
  try { newChannelName.setSelectionRange(pos, pos); } catch (_) {}
}

function updateCreateButton() {
  modalCreateBtn.disabled = !newChannelName.value.trim();
  modalCreateBtn.textContent = newChannelPrivate.checked ? 'próximo' : 'criar canal';
}

function setCreateType(type) {
  pendingCreateType = type;
  channelTypePicker.querySelectorAll('.channel-type-option').forEach((b) => {
    const on = b.dataset.type === type;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
  newChannelPrefix.innerHTML = type === 'text' ? '#' : ICONS[type];
  newChannelName.placeholder = type === 'text' ? 'novo-canal' : type === 'world' ? 'Mundinho' : 'Sala de Chamada';
  normalizeNewChannelName();
  updateCreateButton();
}

channelTypePicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.channel-type-option');
  if (btn) { setCreateType(btn.dataset.type); newChannelName.focus(); }
});

function openCreateModal(type, categoryId = null) {
  if (!hasCurrentPermission('manage_channels')) return;
  pendingCategoryId = categoryId;
  const cat = categoryId != null ? channelCategories.find((c) => c.id === categoryId) : null;
  modalTitle.textContent = 'criar canal';
  modalSubtitle.hidden = !cat;
  modalSubtitle.textContent = cat ? 'em ' + cat.name : '';
  newChannelName.value = '';
  newChannelPrivate.checked = false;
  setCreateType(type || 'text');
  modalError.textContent = '';
  modalBackdrop.hidden = false;
  newChannelName.focus();
}

function closeModal() {
  modalBackdrop.hidden = true;
}

modalCancelBtn.addEventListener('click', closeModal);
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});
newChannelName.addEventListener('input', () => { normalizeNewChannelName(); updateCreateButton(); });
newChannelPrivate.addEventListener('change', updateCreateButton);

async function submitCreateChannel() {
  const name = newChannelName.value.trim();
  if (!name) {
    modalError.textContent = 'dá um nome pro canal';
    return;
  }
  if (currentServerId == null) return;
  const isPrivate = newChannelPrivate.checked;
  modalCreateBtn.disabled = true;
  try {
    const res = await fetch(`/api/servers/${currentServerId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: pendingCreateType, category_id: pendingCategoryId, private: isPrivate }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      modalError.textContent = data.error || 'não deu pra criar o canal';
      return;
    }
    closeModal();
    if (isPrivate) {
      // segundo passo do canal privado (igual ao Discord): escolher quem vê
      if (data.channel) {
        if (!channels.some((c) => c.id === data.channel.id)) channels.push(data.channel);
        renderChannels();
        openChannelEdit(data.channel);
      } else {
        toast('canal privado criado — só o dono e os administradores veem até liberarem cargos');
      }
      return;
    }
    // a lista atualiza sozinha via broadcast (channel_created); se for de texto, já abre
    if (data.channel && data.channel.type === 'text') {
      if (!channels.some((c) => c.id === data.channel.id)) channels.push(data.channel);
      selectChannel(data.channel);
    }
  } catch (_) {
    modalError.textContent = 'sem conexão — tente de novo';
  } finally {
    updateCreateButton();
  }
}

modalCreateBtn.addEventListener('click', submitCreateChannel);
newChannelName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitCreateChannel();
  if (e.key === 'Escape') closeModal();
});
