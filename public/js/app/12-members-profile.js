// didiscord — Usuários, painel de membros e perfil
// Parte 12 de 25 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - cache de usuários
//   - painel de membros
//   - cartão de perfil
//   - popout de perfil (clicar no avatar/nome de alguém, em qualquer lugar do app)
//   - painel de perfil na DM
//   - edição do próprio perfil

// ---------- cache de usuários ----------
// todo mundo que já apareceu na tela (membros de qualquer servidor aberto, pessoas das DMs,
// contatos) fica aqui, por id — assim avatar/nome funcionam em qualquer lugar (call de outro
// servidor, lista de DMs, popout) sem depender de qual servidor está aberto agora.
function rememberUser(u) {
  if (!u || u.id == null) return null;
  const prev = usersById.get(u.id);
  if (prev) { Object.assign(prev, u); return prev; }
  const copy = { ...u };
  usersById.set(u.id, copy);
  return copy;
}

function findUser(id) {
  if (currentUser && id === currentUser.id) return currentUser;
  return usersById.get(id) || null;
}

function escapeAttr(str) {
  return String(str == null ? '' : str).replace(/[&"'<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ---------- painel de membros ----------

let memberPanelCollapsed = false;
membersToggleBtn.addEventListener('click', () => {
  memberPanelCollapsed = !memberPanelCollapsed;
  memberPanel.hidden = memberPanelCollapsed;
});

const CROWN_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>';

function memberAvatarInner(m) {
  return m.avatar_url
    ? `<img src="${escapeAttr(m.avatar_url)}" alt="${escapeAttr(m.username)}">`
    : escapeHtml(initials(m.username));
}

function renderMembers() {
  const server = currentServer();
  const online = members.filter((m) => m.online);
  const offline = members.filter((m) => !m.online);

  function fillSection(section, list, label) {
    const labelEl = section.querySelector('.member-section-label');
    labelEl.textContent = `${label} (${list.length})`;
    section.hidden = list.length === 0;
    section.querySelectorAll('.member-item, .member-empty').forEach((n) => n.remove());

    for (const m of list) {
      const isOwner = !!(server && server.owner_id === m.id);
      const item = document.createElement('div');
      item.className = 'member-item' + (m.online ? '' : ' is-offline');
      item.style.setProperty('--member-accent', m.accent_color || 'var(--amethyst)');
      item.innerHTML = `
          <div class="member-item-avatar">
            ${memberAvatarInner(m)}
            <span class="member-presence-dot"></span>
          </div>
          <div class="member-item-text">
            <span class="member-item-name"><span class="member-item-name-text"></span>${isOwner ? `<span class="member-owner" title="dono do servidor">${CROWN_ICON}</span>` : ''}</span>
            <span class="member-item-status"></span>
          </div>
        `;
      item.querySelector('.member-item-name-text').textContent = m.username;
      const roleColor = memberColor(m);
      if (roleColor) item.querySelector('.member-item-name-text').style.color = roleColor;
      const statusEl = item.querySelector('.member-item-status');
      if (m.activity && m.online) {
        // "jogando X" (rich presence) ocupa o lugar do status enquanto a pessoa está no jogo
        const game = document.createElement('strong');
        game.textContent = m.activity.name;
        statusEl.replaceChildren('jogando ', game);
        statusEl.classList.add('is-activity');
        statusEl.title = `${m.activity.name} — ${formatActivitySince(m.activity.startedAt)}`;
        statusEl.hidden = false;
      } else {
        statusEl.textContent = m.status_text || '';
        statusEl.hidden = !m.status_text;
      }
      item.addEventListener('click', () => openViewProfile(m.id, item));
      if (!currentUser || currentUser.id !== m.id) {
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openParticipantContextMenu(e, m.id, m.username);
        });
      }
      section.appendChild(item);
    }
  }

  // cargos "mostrados separado" (igual ao Discord): quem está online e tem um desses cargos aparece
  // no grupo do cargo MAIS ALTO dele, com o nome do cargo em cima; o resto fica em "online" e quem
  // está offline fica sempre junto em "offline"
  const hoisted = serverRoles.filter((r) => r.hoist); // já vem do mais alto pro mais baixo
  const groups = new Map(hoisted.map((r) => [r.id, []]));
  const plainOnline = [];
  for (const m of online) {
    const top = memberRoles(m).find((r) => r.hoist);
    if (top) groups.get(top.id).push(m);
    else plainOnline.push(m);
  }
  memberPanel.querySelectorAll('.member-section.is-role').forEach((n) => n.remove());
  for (const role of hoisted) {
    const list = groups.get(role.id);
    if (!list.length) continue;
    const section = document.createElement('div');
    section.className = 'member-section is-role';
    section.style.setProperty('--role-color', role.color || 'var(--text-faint)');
    section.innerHTML = '<div class="member-section-label"></div>';
    memberPanel.insertBefore(section, memberSectionOnline);
    fillSection(section, list, role.name);
  }

  fillSection(memberSectionOnline, plainOnline, 'online');
  fillSection(memberSectionOffline, offline, 'offline');

  const botsLabel = memberSectionBots.querySelector('.member-section-label');
  botsLabel.textContent = `bots (${bots.length})`;
  memberSectionBots.hidden = bots.length === 0 || currentServerId == null;
  memberSectionBots.querySelectorAll('.member-item, .member-empty').forEach((n) => n.remove());
  for (const b of bots) {
    const item = document.createElement('div');
    item.className = 'member-item is-bot';
    item.innerHTML = `
        <div class="member-item-avatar">
          ${b.avatar_url ? `<img src="${escapeAttr(b.avatar_url)}" alt="">` : escapeHtml(initials(b.name))}
        </div>
        <div class="member-item-text">
          <span class="member-item-name"><span class="member-item-name-text"></span><span class="member-bot-tag">bot</span></span>
        </div>
      `;
    item.querySelector('.member-item-name-text').textContent = b.name;
    item.title = b.description || '';
    memberSectionBots.appendChild(item);
  }
  applyAuthorColors(); // membros/cargos mudaram: os nomes no chat acompanham
}

async function loadMembers() {
  const sid = currentServerId;
  if (sid == null) { members = []; renderMembers(); return; }
  try {
    const res = await fetch(`/api/servers/${sid}/members`);
    if (sid !== currentServerId) return; // trocou de servidor enquanto carregava
    if (res.ok) {
      const data = await res.json();
      members = data.members.map(rememberUser);
    }
    if (!bots.length) {
      const botsRes = await fetch('/api/bots');
      if (botsRes.ok) bots = (await botsRes.json()).bots;
    }
  } catch (_) { /* lista fica como estava */ }
  if (sid === currentServerId) renderMembers();
}

// ---------- cartão de perfil ----------
// um componente só, usado em 3 lugares: popout (clicar em alguém), prévia ao vivo na edição do
// próprio perfil e painel lateral das DMs. O cartão inteiro é pintado com as cores da pessoa
// (cor de destaque + segunda cor opcional pro degradê), e o conteúdo fica numa placa escura por
// cima — é o que faz cada perfil ter cara própria.

function formatMemberSince(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function serverInitials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2);
  return words.slice(0, 3).map((w) => w[0]).join('');
}

function serverIconInner(s) {
  return s.icon_url
    ? `<img src="${escapeAttr(s.icon_url)}" alt="">`
    : `<span class="server-initials">${escapeHtml(serverInitials(s.name))}</span>`;
}

// opts: { online, mutuals: [{id,name,icon_url}] | null, actions: [{label, kind, onClick}], isPreview }
function renderProfileCard(el, user, opts = {}) {
  const c1 = user.accent_color || ACCENT_COLORS[0];
  const c2 = user.accent_color_2 || null;
  el.style.setProperty('--card-c1', c1);
  el.style.setProperty('--card-c2', c2 || c1);
  el.classList.toggle('has-gradient', !!c2);
  el.classList.toggle('has-banner', !!user.banner_url);

  const online = opts.online != null ? opts.online : !!user.online;
  const avatar = user.avatar_url
    ? `<img src="${escapeAttr(user.avatar_url)}" alt="">`
    : `<span class="pc-initials">${escapeHtml(initials(user.username))}</span>`;

  el.innerHTML = `
      <div class="pc-banner"${user.banner_url ? ` style="background-image:url('${escapeAttr(user.banner_url)}')"` : ''}></div>
      <div class="pc-avatar-row">
        <div class="pc-avatar">${avatar}<span class="pc-dot${online ? ' is-online' : ''}" title="${online ? 'online' : 'offline'}"></span></div>
      </div>
      <div class="pc-body">
        <div class="pc-identity">
          <h3 class="pc-name display"></h3>
          <p class="pc-status"></p>
        </div>
        <div class="pc-section pc-activity-wrap" hidden>
          <h4>jogando</h4>
          <p class="pc-activity"></p>
          <p class="pc-activity-time"></p>
        </div>
        <div class="pc-section pc-about">
          <h4>sobre mim</h4>
          <p class="pc-bio"></p>
        </div>
        <div class="pc-section pc-since-wrap">
          <h4>no didiscord desde</h4>
          <p class="pc-since"></p>
        </div>
        <div class="pc-section pc-roles-wrap" hidden>
          <h4>cargos</h4>
          <div class="pc-roles"></div>
        </div>
        <div class="pc-section pc-mutuals-wrap" hidden>
          <h4>servidores em comum</h4>
          <div class="pc-mutuals"></div>
        </div>
        <div class="pc-actions"></div>
      </div>
    `;

  el.querySelector('.pc-name').textContent = user.username || '';

  const statusEl = el.querySelector('.pc-status');
  statusEl.textContent = user.status_text || '';
  statusEl.hidden = !user.status_text;

  if (user.activity && user.activity.name && online) {
    el.querySelector('.pc-activity-wrap').hidden = false;
    el.querySelector('.pc-activity').textContent = user.activity.name;
    el.querySelector('.pc-activity-time').textContent = formatActivitySince(user.activity.startedAt);
  }

  const bioEl = el.querySelector('.pc-bio');
  if (user.bio) {
    bioEl.textContent = user.bio;
  } else if (opts.isPreview) {
    bioEl.textContent = 'escreva algo sobre você';
    bioEl.classList.add('is-empty');
  } else {
    el.querySelector('.pc-about').hidden = true;
  }

  const since = formatMemberSince(user.created_at);
  el.querySelector('.pc-since').textContent = since;
  el.querySelector('.pc-since-wrap').hidden = !since;

  if (Array.isArray(opts.mutuals) && opts.mutuals.length) {
    const wrap = el.querySelector('.pc-mutuals-wrap');
    const list = el.querySelector('.pc-mutuals');
    wrap.hidden = false;
    for (const s of opts.mutuals) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pc-mutual';
      b.title = s.name;
      b.innerHTML = serverIconInner(s);
      b.addEventListener('click', () => {
        closeViewProfile();
        if (servers.some((x) => x.id === s.id)) selectServer(s.id);
      });
      list.appendChild(b);
    }
  }

  if (opts.roles) fillProfileRoles(el.querySelector('.pc-roles-wrap'), opts.roles);

  const actionsEl = el.querySelector('.pc-actions');
  for (const a of opts.actions || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${a.kind === 'danger' ? 'btn-danger-ghost' : a.kind === 'ghost' ? 'btn-ghost' : 'btn-primary'}`;
    b.textContent = a.label;
    b.addEventListener('click', a.onClick);
    actionsEl.appendChild(b);
  }
  actionsEl.hidden = !(opts.actions && opts.actions.length);
}

// ---------- popout de perfil (clicar no avatar/nome de alguém, em qualquer lugar do app) ----------

const viewProfileBackdrop = document.getElementById('viewProfileBackdrop');
const viewProfileCard = document.getElementById('viewProfileCard');
let viewProfileToken = 0;

// userId: quem mostrar. anchorEl: o elemento em que a pessoa clicou — o popout nasce colado
// nele, igual ao Discord. Mostra na hora com o que já está em cache e completa (servidores em
// comum, dados frescos) quando a resposta do servidor chegar.
async function openViewProfile(userId, anchorEl) {
  if (userId === BOT_USER_ID) return;
  const token = ++viewProfileToken;
  const cached = findUser(userId);
  if (cached) showProfilePopout(cached, cached.mutual_servers || null, anchorEl);

  try {
    const res = await fetch(`/api/users/${userId}`);
    if (!res.ok || token !== viewProfileToken) return;
    const { user } = await res.json();
    const merged = user.id === currentUser.id ? Object.assign(currentUser, user) : rememberUser(user);
    if (cached && viewProfileBackdrop.hidden) return; // fechou enquanto carregava
    showProfilePopout(merged, user.mutual_servers, anchorEl);
  } catch (_) { /* fica com a versão em cache */ }
}

function showProfilePopout(user, mutuals, anchorEl) {
  const isSelf = !!(currentUser && user.id === currentUser.id);
  const actions = [];
  if (isSelf) {
    actions.push({ label: 'editar perfil', kind: 'primary', onClick: () => { closeViewProfile(); openProfileModal(); } });
  } else {
    actions.push({ label: 'mandar mensagem', kind: 'primary', onClick: () => { closeViewProfile(); openDm(user.id); } });
    const s = currentServer();
    if (s && canModerateMember(user.id, 'kick_members') && members.some((m) => m.id === user.id)) {
      const inCallHere = channels.some((c) => c.id === findParticipantChannel(user.id));
      if (inCallHere) {
        actions.push({ label: 'desconectar da call', kind: 'ghost', onClick: () => { closeViewProfile(); disconnectMember(user.id, user.username); } });
      }
      actions.push({ label: `expulsar de ${s.name}`, kind: 'danger', onClick: () => { closeViewProfile(); kickMember(user); } });
    }
  }
  // cargos (só quando estou olhando um servidor e a pessoa é membro dele)
  const member = currentServer() ? members.find((m) => m.id === user.id) : null;
  let roles = null;
  if (member) {
    roles = {
      roles: memberRoles(member),
      editable: isAdminOfCurrentServer() && (isSelf || canModerateMember(user.id)),
      amOwner: currentServer().owner_id === currentUser.id,
      available: serverRoles,
      onChange: (ids) => setMemberRoles(user, ids, anchorEl),
    };
  }
  renderProfileCard(viewProfileCard, user, { mutuals: isSelf ? null : mutuals, actions, roles });
  viewProfileBackdrop.hidden = false;
  positionProfilePopout(anchorEl);
}

// encosta o popout perto do elemento clicado, sem deixar vazar pra fora da janela — tenta
// primeiro à direita do elemento (como o Discord), e vira pra esquerda se não couber
function positionProfilePopout(anchorEl) {
  const popout = viewProfileCard;
  const w = popout.offsetWidth || 340;
  const h = popout.offsetHeight || 420;
  let left;
  let top;

  if (anchorEl && anchorEl.isConnected) {
    const a = anchorEl.getBoundingClientRect();
    left = a.right + 12;
    top = a.top;
    if (left + w > window.innerWidth - 8) left = a.left - w - 12;
    if (left < 8) left = Math.min(window.innerWidth - w - 8, Math.max(8, a.left));
  } else {
    left = (window.innerWidth - w) / 2;
    top = (window.innerHeight - h) / 2;
  }
  if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
  if (top < 8) top = 8;

  popout.style.left = Math.round(left) + 'px';
  popout.style.top = Math.round(top) + 'px';
}

function closeViewProfile() {
  viewProfileBackdrop.hidden = true;
}

viewProfileBackdrop.addEventListener('click', (e) => {
  if (e.target === viewProfileBackdrop) closeViewProfile();
});
window.addEventListener('resize', () => {
  if (!viewProfileBackdrop.hidden) closeViewProfile();
});

// ---------- painel de perfil na DM ----------

const dmProfilePanel = document.getElementById('dmProfilePanel');
const dmProfileCard = document.getElementById('dmProfileCard');

async function renderDmProfilePanel() {
  if (!currentChannel || !currentChannel.dm) return;
  const channelId = currentChannel.id;
  const userId = currentChannel.userId;
  const u = findUser(userId);
  if (u) renderProfileCard(dmProfileCard, u, { mutuals: u.mutual_servers || null });

  if (!u || u.mutual_servers === undefined) {
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) return;
      const { user } = await res.json();
      const merged = rememberUser(user);
      if (currentChannel && currentChannel.id === channelId) {
        renderProfileCard(dmProfileCard, merged, { mutuals: merged.mutual_servers || null });
      }
    } catch (_) { /* painel fica como está */ }
  }
}

// ---------- edição do próprio perfil ----------

const profileModalBackdrop = document.getElementById('profileModalBackdrop');
const profileTabs = document.getElementById('profileTabs');
const profileCloseBtn = document.getElementById('profileCloseBtn');
const profileEditBanner = document.getElementById('profileEditBanner');
const profileEditAvatar = document.getElementById('profileEditAvatar');
const profileLivePreview = document.getElementById('profileLivePreview');
const avatarUploadBtn = document.getElementById('avatarUploadBtn');
const bannerUploadBtn = document.getElementById('bannerUploadBtn');
const bannerRemoveBtn = document.getElementById('bannerRemoveBtn');
const avatarInput = document.getElementById('avatarInput');
const bannerInput = document.getElementById('bannerInput');
const profileUsernameInput = document.getElementById('profileUsernameInput');
const profileStatusInput = document.getElementById('profileStatusInput');
const profileBioInput = document.getElementById('profileBioInput');
const profileBioCount = document.getElementById('profileBioCount');
const colorSwatches = document.getElementById('colorSwatches');
const colorSwatches2 = document.getElementById('colorSwatches2');
const profileInfoError = document.getElementById('profileInfoError');
const profileInfoSaveBtn = document.getElementById('profileInfoSaveBtn');
const currentPasswordInput = document.getElementById('currentPasswordInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const profilePasswordError = document.getElementById('profilePasswordError');
const profilePasswordSaveBtn = document.getElementById('profilePasswordSaveBtn');
const profileStatusLine = document.getElementById('profileStatus');

function applyUserToProfileBar(user) {
  profileName.textContent = user.username;
  profileStatusLine.textContent = user.status_text || 'online';
  profileStatusLine.classList.toggle('has-custom', !!user.status_text);
  profileAvatar.style.setProperty('--pfp-ring', user.accent_color || 'var(--amethyst)');
  if (user.avatar_url) {
    profileAvatar.innerHTML = `<img src="${escapeAttr(user.avatar_url)}" alt="">`;
  } else {
    profileAvatar.textContent = initials(user.username);
  }
}

function buildColorSwatches(selected) {
  colorSwatches.innerHTML = '';
  for (const color of ACCENT_COLORS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch' + (color.toLowerCase() === (selected || '').toLowerCase() ? ' active' : '');
    btn.style.background = color;
    btn.title = color;
    btn.addEventListener('click', () => {
      colorSwatches.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
      btn.classList.add('active');
      colorSwatches.dataset.selected = color;
      refreshLivePreview();
    });
    colorSwatches.appendChild(btn);
  }
  colorSwatches.dataset.selected = selected || ACCENT_COLORS[0];

  const custom = document.createElement('input');
  custom.type = 'color';
  custom.className = 'color-swatch-custom';
  custom.value = selected || ACCENT_COLORS[0];
  custom.title = 'escolher outra cor';
  custom.addEventListener('input', () => {
    colorSwatches.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
    colorSwatches.dataset.selected = custom.value;
    refreshLivePreview();
  });
  colorSwatches.appendChild(custom);
}

function buildColorSwatches2(selected2) {
  colorSwatches2.innerHTML = '';

  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.className = 'color-swatch-none' + (!selected2 ? ' active' : '');
  noneBtn.title = 'sem degradê';
  noneBtn.addEventListener('click', () => {
    colorSwatches2.querySelectorAll('.color-swatch, .color-swatch-none').forEach((s) => s.classList.remove('active'));
    noneBtn.classList.add('active');
    colorSwatches2.dataset.selected2 = '';
    refreshLivePreview();
  });
  colorSwatches2.appendChild(noneBtn);

  for (const color of ACCENT_COLORS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch' + (color.toLowerCase() === (selected2 || '').toLowerCase() ? ' active' : '');
    btn.style.background = color;
    btn.title = color;
    btn.addEventListener('click', () => {
      colorSwatches2.querySelectorAll('.color-swatch, .color-swatch-none').forEach((s) => s.classList.remove('active'));
      btn.classList.add('active');
      colorSwatches2.dataset.selected2 = color;
      refreshLivePreview();
    });
    colorSwatches2.appendChild(btn);
  }
  colorSwatches2.dataset.selected2 = selected2 || '';

  const custom = document.createElement('input');
  custom.type = 'color';
  custom.className = 'color-swatch-custom';
  custom.value = selected2 || ACCENT_COLORS[1];
  custom.title = 'escolher outra cor';
  custom.addEventListener('input', () => {
    colorSwatches2.querySelectorAll('.color-swatch, .color-swatch-none').forEach((s) => s.classList.remove('active'));
    colorSwatches2.dataset.selected2 = custom.value;
    refreshLivePreview();
  });
  colorSwatches2.appendChild(custom);
}

// o perfil como está no formulário agora (ainda não salvo) — alimenta a prévia ao vivo
function draftUser() {
  return {
    ...currentUser,
    username: profileUsernameInput.value.trim() || currentUser.username,
    status_text: profileStatusInput.value.trim() || null,
    bio: profileBioInput.value.trim() || null,
    accent_color: colorSwatches.dataset.selected || currentUser.accent_color,
    accent_color_2: colorSwatches2.dataset.selected2 || null,
  };
}

function refreshImagePreviews() {
  const d = draftUser();
  profileEditBanner.style.setProperty('--card-c1', d.accent_color || ACCENT_COLORS[0]);
  profileEditBanner.style.setProperty('--card-c2', d.accent_color_2 || d.accent_color || ACCENT_COLORS[0]);
  profileEditBanner.style.backgroundImage = currentUser.banner_url ? `url('${escapeAttr(currentUser.banner_url)}')` : '';
  profileEditBanner.classList.toggle('has-image', !!currentUser.banner_url);
  profileEditAvatar.innerHTML = currentUser.avatar_url
    ? `<img src="${escapeAttr(currentUser.avatar_url)}" alt="">`
    : `<span>${escapeHtml(initials(d.username))}</span>`;
  profileEditAvatar.style.borderColor = d.accent_color || ACCENT_COLORS[0];
  bannerRemoveBtn.hidden = !currentUser.banner_url;
}

function refreshLivePreview() {
  renderProfileCard(profileLivePreview, draftUser(), { online: true, isPreview: true });
  profileBioCount.textContent = `${profileBioInput.value.length}/190`;
  refreshImagePreviews();
}

function switchProfileTab(tabName) {
  profileTabs.querySelectorAll('.profile-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  profileModalBackdrop.querySelectorAll('.profile-tab-panel').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabName;
  });
}

profileTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.profile-tab');
  if (btn) switchProfileTab(btn.dataset.tab);
});

profileUsernameInput.addEventListener('input', refreshLivePreview);
profileStatusInput.addEventListener('input', refreshLivePreview);
profileBioInput.addEventListener('input', refreshLivePreview);

function openProfileModal() {
  profileInfoError.textContent = '';
  profileInfoError.classList.remove('is-success');
  profilePasswordError.textContent = '';
  profilePasswordError.classList.remove('is-success');
  currentPasswordInput.value = '';
  newPasswordInput.value = '';
  profileUsernameInput.value = currentUser.username;
  profileStatusInput.value = currentUser.status_text || '';
  profileBioInput.value = currentUser.bio || '';
  switchProfileTab('perfil');
  buildColorSwatches(currentUser.accent_color);
  buildColorSwatches2(currentUser.accent_color_2);
  refreshLivePreview();
  profileModalBackdrop.hidden = false;
  profileUsernameInput.focus();
}

function closeProfileModal() {
  profileModalBackdrop.hidden = true;
}

profileBar.addEventListener('click', (e) => {
  if (e.target.closest('.profile-actions')) return; // botões de mudo/config/sair não abrem o perfil
  openProfileModal();
});
profileCloseBtn.addEventListener('click', closeProfileModal);
profileModalBackdrop.addEventListener('click', (e) => {
  if (e.target === profileModalBackdrop) closeProfileModal();
});

avatarUploadBtn.addEventListener('click', () => avatarInput.click());
bannerUploadBtn.addEventListener('click', () => bannerInput.click());

async function uploadProfileImage(kind, input) {
  const file = input.files[0];
  if (!file) return;
  profileInfoError.textContent = '';
  profileInfoError.classList.remove('is-success');
  const btn = kind === 'avatar' ? avatarUploadBtn : bannerUploadBtn;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'enviando...';
  try {
    const formData = new FormData();
    formData.append(kind, file);
    const res = await fetch(`/api/profile/${kind}`, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      currentUser = { ...currentUser, ...data.user };
      applyUserToProfileBar(currentUser);
      refreshLivePreview();
    } else {
      profileInfoError.textContent = data.error || (kind === 'avatar' ? 'não deu pra trocar o avatar' : 'não deu pra trocar o banner');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = original;
    input.value = '';
  }
}

avatarInput.addEventListener('change', () => uploadProfileImage('avatar', avatarInput));
bannerInput.addEventListener('change', () => uploadProfileImage('banner', bannerInput));

bannerRemoveBtn.addEventListener('click', async () => {
  const res = await fetch('/api/profile/banner', { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    currentUser = { ...currentUser, ...data.user };
    refreshLivePreview();
  } else {
    profileInfoError.textContent = data.error || 'não deu pra remover o banner';
  }
});

profileInfoSaveBtn.addEventListener('click', async () => {
  profileInfoError.textContent = '';
  profileInfoError.classList.remove('is-success');
  const d = draftUser();

  profileInfoSaveBtn.disabled = true;
  try {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: profileUsernameInput.value.trim(),
        status_text: d.status_text || '',
        bio: d.bio || '',
        accent_color: d.accent_color,
        accent_color_2: d.accent_color_2,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      profileInfoError.textContent = data.error || 'não deu pra salvar';
      return;
    }
    currentUser = { ...currentUser, ...data.user };
    applyUserToProfileBar(currentUser);
    profileInfoError.textContent = 'perfil salvo';
    profileInfoError.classList.add('is-success');
  } finally {
    profileInfoSaveBtn.disabled = false;
  }
});

profilePasswordSaveBtn.addEventListener('click', async () => {
  profilePasswordError.textContent = '';
  profilePasswordError.classList.remove('is-success');
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  if (!currentPassword || !newPassword) {
    profilePasswordError.textContent = 'preencha a senha atual e a nova';
    return;
  }

  profilePasswordSaveBtn.disabled = true;
  try {
    const res = await fetch('/api/profile/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      profilePasswordError.textContent = data.error || 'não deu pra trocar a senha';
      return;
    }
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    profilePasswordError.textContent = 'senha trocada';
    profilePasswordError.classList.add('is-success');
  } finally {
    profilePasswordSaveBtn.disabled = false;
  }
});
