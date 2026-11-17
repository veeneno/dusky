// dusky — Painel de admin do site
// Parte 16 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - painel de admin do site (só pra quem é admin do SITE — ver server/routes/admin.js)

// ===================================================================
// painel de admin do site (só pra quem é admin do SITE — ver server/routes/admin.js)
// ===================================================================

const railAdminBtn = document.getElementById('railAdminBtn');
const adminBackdrop = document.getElementById('adminBackdrop');
const adminBody = document.getElementById('adminBody');
const adminTabs = document.getElementById('adminTabs');
let adminTab = 'overview';

function setupAdminEntry() {
  railAdminBtn.hidden = !(currentUser && currentUser.is_site_admin);
}

async function adminApi(method, path, body) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'não deu certo');
  return data;
}

function fmtDuration(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function openAdminPanel() {
  if (!currentUser || !currentUser.is_site_admin) return;
  adminBackdrop.hidden = false;
  showAdminTab(adminTab);
}

function showAdminTab(tab) {
  adminTab = tab;
  adminTabs.querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.toggle('active', b.dataset.adminTab === tab));
  adminBody.innerHTML = '<p class="admin-loading">carregando…</p>';
  const render = { overview: renderAdminOverview, users: renderAdminUsers, servers: renderAdminServers, announce: renderAdminAnnounce }[tab];
  render().catch((err) => { adminBody.innerHTML = ''; adminBody.append(Object.assign(document.createElement('p'), { className: 'field-error', textContent: err.message })); });
}

async function renderAdminOverview() {
  const o = await adminApi('GET', '/overview');
  const cards = [
    ['contas', o.users, o.suspended ? `${o.suspended} suspensa(s)` : 'nenhuma suspensa'],
    ['online agora', o.online, `${o.inVoice} em call · ${o.voiceChannelsActive} call(s) ativa(s)`],
    ['servidores', o.servers, ''],
    ['mensagens', o.messages.toLocaleString('pt-BR'), `${o.messagesToday} nas últimas 24h`],
    ['servidor ligado há', fmtDuration(o.uptimeSec), `Node ${o.node} · ${o.memoryMB} MB de memória`],
    ['espaço usado', `${(o.dbMB + o.uploadsMB).toFixed(1)} MB`, `banco ${o.dbMB} MB · anexos ${o.uploadsMB} MB`],
  ];
  adminBody.innerHTML = '<div class="admin-cards"></div>';
  const grid = adminBody.querySelector('.admin-cards');
  for (const [label, value, sub] of cards) {
    const c = document.createElement('div');
    c.className = 'admin-card';
    c.innerHTML = '<span class="admin-card-label"></span><strong class="admin-card-value"></strong><span class="admin-card-sub"></span>';
    c.querySelector('.admin-card-label').textContent = label;
    c.querySelector('.admin-card-value').textContent = String(value);
    c.querySelector('.admin-card-sub').textContent = sub;
    grid.appendChild(c);
  }
}

async function renderAdminUsers(query = '') {
  const { users, uploadDefaults } = await adminApi('GET', `/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  adminBody.innerHTML = `
      <div class="admin-toolbar">
        <input type="search" class="admin-search" placeholder="procurar pelo nome" autocomplete="off">
        <span class="admin-count"></span>
      </div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>conta</th><th>criada</th><th>servidores</th><th>mensagens</th><th>última mensagem</th><th>anexos</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>`;
  const search = adminBody.querySelector('.admin-search');
  search.value = query;
  let t = null;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => renderAdminUsers(search.value.trim()).then(() => { const s2 = adminBody.querySelector('.admin-search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }), 300); });
  adminBody.querySelector('.admin-count').textContent = `${users.length} conta(s)`;
  const tbody = adminBody.querySelector('tbody');
  for (const u of users) {
    const tr = document.createElement('tr');
    if (u.banned_at) tr.classList.add('is-suspended');
    tr.innerHTML = `
        <td><span class="admin-user"><span class="admin-avatar"></span><span class="admin-user-text"><strong></strong><small></small></span></span></td>
        <td></td><td></td><td></td><td></td><td class="admin-uploads"></td>
        <td class="admin-actions"></td>`;
    tr.querySelector('.admin-avatar').innerHTML = memberAvatarInner(u);
    tr.querySelector('.admin-avatar').style.borderColor = u.accent_color || 'var(--line)';
    tr.querySelector('strong').textContent = u.username;
    const tags = [];
    if (u.is_site_admin) tags.push('admin do site');
    if (u.online) tags.push('online');
    if (u.banned_at) tags.push(`suspensa${u.ban_reason ? `: ${u.ban_reason}` : ''}`);
    tr.querySelector('small').textContent = tags.join(' · ');
    const cells = tr.querySelectorAll('td');
    cells[1].textContent = fmtDate(u.created_at);
    cells[2].textContent = u.servers;
    cells[3].textContent = u.messages.toLocaleString('pt-BR');
    cells[4].textContent = fmtDate(u.last_message_at);
    // anexos: quanto já usa e o limite (por arquivo · total). "(padrão)" quando não tem valor próprio
    const usedMB = (u.upload_used_bytes || 0) / 1024 / 1024;
    if (u.is_site_admin) {
      cells[5].textContent = `${fmtMB(usedMB)} · sem limite`;
    } else {
      const maxMB = u.upload_max_mb ?? uploadDefaults.maxMB;
      const quotaMB = u.upload_quota_mb ?? uploadDefaults.quotaMB;
      cells[5].innerHTML = '<span></span><small></small>';
      cells[5].querySelector('span').textContent = `${fmtMB(usedMB)} de ${fmtMB(quotaMB)}`;
      cells[5].querySelector('small').textContent = `até ${fmtMB(maxMB)} por arquivo${u.upload_max_mb == null && u.upload_quota_mb == null ? ' (padrão)' : ''}`;
    }
    const actions = cells[6];
    if (!u.is_site_admin) {
      const mk = (label, cls, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn btn-sm ${cls}`;
        b.textContent = label;
        b.addEventListener('click', fn);
        actions.appendChild(b);
      };
      if (u.banned_at) {
        mk('reativar', 'btn-ghost', async () => {
          try { await adminApi('POST', `/users/${u.id}/unsuspend`); toast(`${u.username} reativado`); renderAdminUsers(search.value.trim()); } catch (err) { toast(err.message, 'error'); }
        });
      } else {
        mk('suspender', 'btn-danger-ghost', async () => {
          const reason = prompt(`suspender ${u.username}? ela cai de tudo na hora e não consegue mais entrar.\n\nmotivo (aparece pra pessoa, opcional):`);
          if (reason === null) return;
          try { await adminApi('POST', `/users/${u.id}/suspend`, { reason }); toast(`${u.username} suspenso`); renderAdminUsers(search.value.trim()); } catch (err) { toast(err.message, 'error'); }
        });
      }
      mk('limite de anexos', 'btn-ghost', () => editUploadLimits(u, uploadDefaults, () => renderAdminUsers(search.value.trim())));
      mk('nova senha', 'btn-ghost', async () => {
        if (!confirm(`gerar uma senha temporária pra ${u.username}? todas as sessões dela serão desconectadas.`)) return;
        try {
          const r = await adminApi('POST', `/users/${u.id}/reset-password`);
          prompt(`senha temporária de ${u.username} (aparece só agora — copie e mande pra pessoa):`, r.temporaryPassword);
        } catch (err) { toast(err.message, 'error'); }
      });
    }
    tbody.appendChild(tr);
  }
}

function fmtMB(mb) {
  if (mb == null) return 'sem limite';
  if (mb >= 1024) return `${(Math.round((mb / 1024) * 10) / 10).toLocaleString('pt-BR')} GB`;
  return `${(Math.round(mb * 10) / 10).toLocaleString('pt-BR')} MB`;
}

// limite de anexo de UMA conta: tamanho máximo de cada arquivo e espaço total. Vazio = padrão
// do servidor (UPLOAD_MAX_MB / UPLOAD_QUOTA_MB no .env). A sua conta (admin do site) não tem limite.
function editUploadLimits(u, defaults, done) {
  const ask = (label, current, fallback) => {
    const v = prompt(`${label} de ${u.username}, em MB (1 GB = 1024 MB).\n\ndeixe vazio pra usar o padrão (${fmtMB(fallback)}):`, current == null ? '' : String(current));
    if (v === null) return undefined; // cancelou
    const t = v.trim();
    return t === '' ? null : t;
  };
  const maxMB = ask('tamanho máximo de CADA arquivo', u.upload_max_mb, defaults.maxMB);
  if (maxMB === undefined) return;
  const quotaMB = ask('espaço TOTAL pra anexos', u.upload_quota_mb, defaults.quotaMB);
  if (quotaMB === undefined) return;
  adminApi('PUT', `/users/${u.id}/upload-limits`, { maxMB, quotaMB })
    .then((r) => { toast(`${u.username}: até ${fmtMB(r.maxMB)} por arquivo, ${fmtMB(r.quotaMB)} no total`); done(); })
    .catch((err) => toast(err.message, 'error'));
}

async function renderAdminServers() {
  const { servers: list } = await adminApi('GET', '/servers');
  adminBody.innerHTML = `
      <div class="admin-toolbar"><span class="admin-count"></span></div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>servidor</th><th>dono</th><th>membros</th><th>canais</th><th>mensagens</th><th>criado</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>`;
  adminBody.querySelector('.admin-count').textContent = `${list.length} servidor(es)`;
  const tbody = adminBody.querySelector('tbody');
  for (const sv of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><span class="admin-user"><span class="admin-avatar is-server"></span><strong></strong></span></td><td></td><td></td><td></td><td></td><td></td><td class="admin-actions"></td>';
    tr.querySelector('.admin-avatar').innerHTML = serverIconInner(sv);
    tr.querySelector('strong').textContent = sv.name;
    const cells = tr.querySelectorAll('td');
    cells[1].textContent = sv.owner || '—';
    cells[2].textContent = sv.members;
    cells[3].textContent = sv.channels;
    cells[4].textContent = sv.messages.toLocaleString('pt-BR');
    cells[5].textContent = fmtDate(sv.created_at);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-sm btn-danger-ghost';
    del.textContent = 'apagar';
    del.addEventListener('click', async () => {
      const typed = prompt(`apagar "${sv.name}" de vez (${sv.messages} mensagens, ${sv.members} membros)? isso não tem volta.\n\ndigite o nome do servidor pra confirmar:`);
      if (typed == null) return;
      if (typed.trim() !== sv.name) { toast('o nome não bate — nada foi apagado', 'error'); return; }
      try { await adminApi('DELETE', `/servers/${sv.id}`); toast(`${sv.name} apagado`); renderAdminServers(); } catch (err) { toast(err.message, 'error'); }
    });
    cells[6].appendChild(del);
    tbody.appendChild(tr);
  }
}

async function renderAdminAnnounce() {
  adminBody.innerHTML = `
      <div class="admin-announce">
        <p class="modal-lead">O aviso aparece em destaque pra todo mundo que estiver com o dusky aberto agora (manutenção, reinício do servidor, novidade…).</p>
        <textarea maxlength="300" rows="4" placeholder="ex: vou reiniciar o servidor em 5 minutos pra atualizar"></textarea>
        <div class="modal-actions"><span class="field-help admin-announce-count">0/300</span><button type="button" class="btn btn-primary">mandar aviso</button></div>
      </div>`;
  const ta = adminBody.querySelector('textarea');
  const count = adminBody.querySelector('.admin-announce-count');
  ta.addEventListener('input', () => { count.textContent = `${ta.value.length}/300`; });
  adminBody.querySelector('.btn-primary').addEventListener('click', async () => {
    if (!ta.value.trim()) return;
    try {
      const r = await adminApi('POST', '/announce', { text: ta.value });
      toast(`aviso mandado pra ${r.delivered} pessoa(s) online`);
      ta.value = '';
      count.textContent = '0/300';
    } catch (err) { toast(err.message, 'error'); }
  });
  ta.focus();
}

railAdminBtn.addEventListener('click', openAdminPanel);
adminTabs.addEventListener('click', (e) => {
  const b = e.target.closest('[data-admin-tab]');
  if (b) showAdminTab(b.dataset.adminTab);
});
wireModal(adminBackdrop);

// aviso geral do admin: um banner em destaque no topo, que fica até a pessoa fechar
function showSiteAnnouncement(text, by) {
  const el = document.createElement('div');
  el.className = 'site-announcement';
  el.setAttribute('role', 'alert');
  el.innerHTML = '<span class="site-announcement-icon">📣</span><span class="site-announcement-text"></span><button type="button" aria-label="fechar">×</button>';
  el.querySelector('.site-announcement-text').textContent = by ? `${by}: ${text}` : text;
  el.querySelector('button').addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  playMessageSound();
}

// Esc fecha o que estiver aberto por cima (popout, menu, modais novos)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (window.DuskyEmoji && DuskyEmoji.isOpen()) return;
  if (!viewProfileBackdrop.hidden) { closeViewProfile(); return; }
  if (!settingsModalBackdrop.hidden) { closeSettingsModal(); return; }
  if (!serverMenu.hidden) { closeServerMenu(); return; }
  if (!soundboardPopup.hidden) { closeSoundboardPicker(); return; }
  if (!ssDialogBackdrop.hidden) { closeSsDialog(null); return; }
  if (!soundEditorBackdrop.hidden) { closeSoundEditor(); return; }
  // modais que abrem POR CIMA das configurações do servidor fecham antes delas
  for (const bd of [categoryBackdrop, adminBackdrop, channelEditBackdrop, newDmBackdrop, inviteBackdrop]) {
    if (!bd.hidden) { bd.hidden = true; return; }
  }
  if (!serverSettingsBackdrop.hidden) { closeServerSettings(); return; }
  for (const bd of [addServerBackdrop, joinInviteBackdrop, profileModalBackdrop]) {
    if (!bd.hidden) { bd.hidden = true; return; }
  }
});
