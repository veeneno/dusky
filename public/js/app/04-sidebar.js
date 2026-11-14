// dusky — Barra lateral: canais, conversas diretas e criar canal
// Parte 4 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - sidebar / canais
//   - lista de mensagens diretas (lateral da tela inicial)
//   - modal de criar canal

// ---------- sidebar / canais ----------


function renderChannels() {
  channelGroups.innerHTML = '';

  // tela inicial (mensagens diretas): a lateral vira a lista de conversas
  if (currentServerId == null) {
    renderDmList();
    return;
  }

  const canManage = hasCurrentPermission('manage_channels');
  const groups = [
    // servidor sem nenhuma categoria continua com os títulos de sempre; "sem categoria" só faz
    // sentido quando existe alguma pra comparar
    { type: 'text', label: channelCategories.length ? 'texto · sem categoria' : 'canais de texto' },
    { type: 'voice', label: channelCategories.length ? 'voz · sem categoria' : 'canais de voz' },
    ...channelCategories.map(c => ({ id: c.id, label: c.name })),
  ];

  for (const group of groups) {
    const items = channels.filter(c => group.id ? c.category_id === group.id : !c.category_id && c.type === group.type).sort((a, b) => a.position - b.position || a.id - b.id);
    if (items.length === 0 && !canManage) continue;

    const wrap = document.createElement('div');
    wrap.className = 'channel-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'channel-group-label';
    const heading = document.createElement('button');
    heading.type = 'button'; heading.className = 'category-heading';
    const collapseKey = `dusky:category:${currentServerId}:${group.id || group.type}`;
    let collapsed = false; try { collapsed = localStorage.getItem(collapseKey) === '1'; } catch (_) {}
    const updateCollapse = () => {
      heading.textContent = (collapsed ? '▸ ' : '▾ ') + group.label;
      heading.setAttribute('aria-expanded', String(!collapsed));
      wrap.classList.toggle('is-collapsed', collapsed);
    };
    heading.addEventListener('click', () => { collapsed = !collapsed; try { localStorage.setItem(collapseKey, collapsed ? '1' : '0'); } catch (_) {} updateCollapse(); });
    updateCollapse(); labelRow.appendChild(heading);
    if (group.id && canManage) {
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'channel-add-btn'; edit.textContent = '⋯'; edit.title = 'editar categoria';
      edit.addEventListener('click', () => editCategory(channelCategories.find(c => c.id === group.id))); labelRow.appendChild(edit);
    }
    if (canManage) {
      const addBtn = document.createElement('button');
      addBtn.className = 'channel-add-btn';
      addBtn.title = group.type === 'text' ? 'criar canal de texto' : 'criar canal de voz';
      addBtn.setAttribute('aria-label', addBtn.title);
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => openCreateModal(group.type, group.id || null));
      labelRow.appendChild(addBtn);
    }
    wrap.appendChild(labelRow);

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'channel-empty';
      empty.textContent = 'nenhum canal ainda';
      wrap.appendChild(empty);
    } else {
      for (const ch of items) {
        wrap.appendChild(buildChannelItem(ch, canManage));
        if (ch.type === 'voice') wrap.appendChild(buildVoicePreview(ch));
      }
    }

    channelGroups.appendChild(wrap);
  }

  renderVoicePreviews();
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

  if (canManage) {
    const editBtn = document.createElement('button');
    editBtn.className = 'channel-edit-btn';
    editBtn.title = 'editar canal';
    editBtn.setAttribute('aria-label', `editar canal ${ch.name}`);
    editBtn.innerHTML = GEAR_ICON;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openChannelEdit(ch);
    });
    el.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'channel-delete-btn';
    delBtn.title = 'apagar canal';
    delBtn.setAttribute('aria-label', `apagar canal ${ch.name}`);
    delBtn.innerHTML = TRASH_ICON;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChannel(ch);
    });
    el.appendChild(delBtn);
  }

  el.addEventListener('click', () => selectChannel(ch));
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
    `;
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

// ---------- modal de criar canal ----------

const channelTypePicker = document.getElementById('channelTypePicker');

function setCreateType(type) {
  pendingCreateType = type;
  channelTypePicker.querySelectorAll('.channel-type-option').forEach((b) => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  newChannelName.placeholder = type === 'text' ? 'novo-canal' : type === 'world' ? 'Mundinho' : 'Sala de Chamada';
}

channelTypePicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.channel-type-option');
  if (btn) setCreateType(btn.dataset.type);
});

function openCreateModal(type, categoryId = null) {
  pendingCategoryId = categoryId;
  if (!hasCurrentPermission('manage_channels')) return;
  modalTitle.textContent = 'criar canal';
  setCreateType(type || 'text');
  newChannelName.value = '';
  modalError.textContent = '';
  modalBackdrop.hidden = false;
  newChannelName.focus();
}

function closeModal() {
  modalBackdrop.hidden = true;
}

modalCancelBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

async function submitCreateChannel() {
  const name = newChannelName.value.trim();
  if (!name) {
    modalError.textContent = 'dá um nome pro canal';
    return;
  }
  if (currentServerId == null) return;
  modalCreateBtn.disabled = true;
  try {
    const res = await fetch(`/api/servers/${currentServerId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: pendingCreateType, category_id: pendingCategoryId }),
    });
    const data = await res.json();
    if (!res.ok) {
      modalError.textContent = data.error || 'não deu pra criar o canal';
      return;
    }
    closeModal();
    // a lista atualiza sozinha via broadcast (channel_created); se for de texto, já abre
    if (data.channel && data.channel.type === 'text') {
      if (!channels.some((c) => c.id === data.channel.id)) channels.push(data.channel);
      selectChannel(data.channel);
    }
  } finally {
    modalCreateBtn.disabled = false;
  }
}

modalCreateBtn.addEventListener('click', submitCreateChannel);
newChannelName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitCreateChannel();
  if (e.key === 'Escape') closeModal();
});
