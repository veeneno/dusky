// dusky — página do admin do site (/admin). Só abre pra admin (server/index.js) e cada pedido
// passa de novo pela checagem em server/routes/admin.js. Tudo montado com textContent (nada de
// HTML vindo do servidor), porque aqui aparece texto de qualquer pessoa: nomes, bios, denúncias, logs.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const body = $('admBody');
  const title = $('admTitle');
  const drawer = $('admDrawer');
  const drawerBody = $('admDrawerBody');
  let view = 'overview';
  let timer = null;
  let me = null;

  // ---------- utilidades ----------

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  async function api(method, path, data) {
    const res = await fetch(`/api/admin${path}`, {
      method,
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    if (res.status === 401 || res.status === 403) { window.location.replace('/app.html'); throw new Error('sem acesso'); }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'não deu certo');
    return out;
  }

  function toast(msg, kind) {
    const t = h('div', { class: `adm-toast${kind === 'error' ? ' is-error' : ''}`, text: msg });
    $('admToasts').append(t);
    setTimeout(() => t.remove(), 4200);
  }

  const n = (v) => Number(v || 0).toLocaleString('pt-BR');
  function date(iso, withTime = true) {
    if (!iso) return '—';
    const d = new Date(String(iso).includes('T') ? iso : String(iso).replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', withTime ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function ago(iso) {
    if (!iso) return 'nunca';
    const d = new Date(String(iso).includes('T') ? iso : String(iso).replace(' ', 'T') + 'Z');
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return `há ${Math.round(s / 60)} min`;
    if (s < 86400) return `há ${Math.round(s / 3600)} h`;
    return `há ${Math.round(s / 86400)} dias`;
  }
  function dur(sec) {
    const d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return d ? `${d}d ${hh}h` : hh ? `${hh}h ${m}min` : `${m}min`;
  }
  const mb = (v) => (v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${Number(v || 0).toFixed(v < 10 ? 1 : 0)} MB`);

  function avatar(u, size = 28) {
    const el = h('span', { class: 'adm-av', style: `width:${size}px;height:${size}px;${u.accent_color ? `border-color:${u.accent_color}` : ''}` });
    if (u.avatar_url || u.icon_url) el.append(h('img', { src: u.avatar_url || u.icon_url, alt: '' }));
    else el.textContent = String(u.username || u.name || '?').trim().slice(0, 2).toUpperCase();
    return el;
  }

  // replaceChildren que ignora null/false e achata listas (o nativo escreveria "null" na tela)
  function put(el, ...children) {
    el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
  }

  function card(label, value, sub, cls) {
    return h('div', { class: `adm-card${cls ? ` ${cls}` : ''}` },
      h('span', { class: 'adm-card-label', text: label }),
      h('strong', { class: 'adm-card-value', text: String(value) }),
      sub ? h('span', { class: 'adm-card-sub', text: sub }) : null);
  }

  function meter(label, used, total, unit) {
    const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return h('div', { class: 'adm-meter' },
      h('div', { class: 'adm-meter-top' }, h('span', { text: label }), h('span', { text: `${used}${unit} de ${total}${unit} · ${pct}%` })),
      h('div', { class: `adm-meter-bar${pct > 85 ? ' is-hot' : ''}` }, h('i', { style: `width:${pct}%` })));
  }

  // gráfico de barras simples em SVG (uma série por gráfico)
  function bars(days, key, label) {
    const W = 720, H = 150, pad = 22;
    const max = Math.max(1, ...days.map((d) => d[key]));
    const bw = (W - pad) / days.length;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H + 18}`);
    svg.setAttribute('class', 'adm-chart-svg');
    days.forEach((d, i) => {
      const bh = Math.round((d[key] / max) * (H - 10));
      const r = document.createElementNS(svg.namespaceURI, 'rect');
      r.setAttribute('x', pad + i * bw + 1);
      r.setAttribute('y', H - bh);
      r.setAttribute('width', Math.max(1, bw - 3));
      r.setAttribute('height', Math.max(bh, d[key] ? 2 : 0));
      r.setAttribute('rx', 2);
      const t = document.createElementNS(svg.namespaceURI, 'title');
      t.textContent = `${d.day.split('-').reverse().join('/')}: ${d[key]}`;
      r.append(t);
      svg.append(r);
      if (i % 7 === days.length % 7 || i === days.length - 1) {
        const tx = document.createElementNS(svg.namespaceURI, 'text');
        tx.setAttribute('x', pad + i * bw + bw / 2);
        tx.setAttribute('y', H + 14);
        tx.setAttribute('text-anchor', 'middle');
        tx.textContent = d.day.slice(8, 10) + '/' + d.day.slice(5, 7);
        svg.append(tx);
      }
    });
    const top = document.createElementNS(svg.namespaceURI, 'text');
    top.setAttribute('x', 0); top.setAttribute('y', 12); top.textContent = String(max);
    svg.append(top);
    const total = days.reduce((a, d) => a + d[key], 0);
    return h('div', { class: 'adm-chart' }, h('div', { class: 'adm-chart-head' }, h('strong', { text: label }), h('span', { text: `${n(total)} em ${days.length} dias` })), svg);
  }

  function table(cols, rows, rowFn) {
    const t = h('table', { class: 'adm-table' }, h('thead', {}, h('tr', {}, cols.map((c) => h('th', { text: c })))));
    const tb = h('tbody');
    for (const r of rows) tb.append(rowFn(r));
    t.append(tb);
    return h('div', { class: 'adm-table-wrap' }, t);
  }

  function btn(label, cls, fn) {
    const b = h('button', { type: 'button', class: `btn btn-sm ${cls}`, text: label });
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      b.disabled = true;
      try { await fn(); } catch (err) { if (err.message !== 'cancelado') toast(err.message, 'error'); } finally { b.disabled = false; }
    });
    return b;
  }

  function section(titleText, ...children) {
    return h('section', { class: 'adm-section' }, titleText ? h('h2', { text: titleText }) : null, ...children);
  }

  // ---------- navegação ----------

  const VIEWS = {
    overview: ['visão geral', renderOverview, 30000],
    live: ['ao vivo', renderLive, 5000],
    users: ['usuários', renderUsers, 0],
    servers: ['servidores', renderServers, 0],
    reports: ['denúncias', renderReports, 0],
    logs: ['logs do servidor', renderLogs, 0],
    actions: ['registro de ações', renderActions, 0],
    announce: ['aviso geral', renderAnnounce, 0],
  };

  function go(v, { keepHash } = {}) {
    if (!VIEWS[v]) v = 'overview';
    view = v;
    if (!keepHash) history.replaceState(null, '', `#${v}`);
    document.querySelectorAll('#admNav [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    title.textContent = VIEWS[v][0];
    clearInterval(timer);
    logsState.stop();
    closeDrawer();
    body.textContent = '';
    body.append(h('p', { class: 'adm-muted', text: 'carregando…' }));
    load();
    if (VIEWS[v][2]) timer = setInterval(() => { if (!document.hidden) load(true); }, VIEWS[v][2]);
  }

  async function load(quiet) {
    const v = view;
    try {
      await VIEWS[v][1](quiet);
      $('admUpdated').textContent = `atualizado ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch (err) {
      if (v !== view || quiet) return;
      body.textContent = '';
      body.append(h('p', { class: 'adm-error', text: err.message }));
    }
  }

  // ---------- visão geral ----------

  async function renderOverview() {
    const [o, s, sys] = await Promise.all([api('GET', '/overview'), api('GET', '/stats?days=30'), api('GET', '/system')]);
    const t = s.totals;
    setBadge('badgeReports', t.reports_open);
    setBadge('badgeLogs', sys.logs24h.error || 0);
    const memUsed = sys.host.memTotalMB - sys.host.memFreeMB;
    const svc = (label, on, okText, offText) => h('li', { class: on ? 'is-on' : 'is-off' }, h('i'), h('span', { text: label }), h('small', { text: on ? okText : offText }));
    put(body, 
      h('div', { class: 'adm-cards' },
        card('contas', n(t.users), `${n(t.suspended)} suspensa(s) · ${n(t.deleted)} excluída(s)`),
        card('online agora', n(o.online), `${o.inVoice} em call · ${o.voiceChannelsActive} call(s)`),
        card('mensagens 24h', n(t.messages24h), `${n(t.messages)} no total`),
        card('servidores', n(t.servers), `${n(t.dms)} conversa(s) diretas`),
        card('denúncias abertas', n(t.reports_open), t.reports_open ? 'ver na aba denúncias' : 'nada pendente', t.reports_open ? 'is-alert' : ''),
        card('com 2 etapas', n(t.twofa), t.no_email ? `${n(t.no_email)} sem e-mail confirmado` : 'todo mundo com e-mail'),
      ),
      h('div', { class: 'adm-grid2' },
        section('últimos 30 dias', bars(s.days, 'messages', 'mensagens por dia'), bars(s.days, 'active', 'pessoas que mandaram mensagem'), bars(s.days, 'signups', 'contas novas')),
        h('div', {},
          section('máquina',
            meter('memória', Math.round(memUsed / 102.4) / 10, Math.round(sys.host.memTotalMB / 102.4) / 10, ' GB'),
            sys.disk ? meter('disco (onde fica o banco)', +(sys.disk.totalGB - sys.disk.freeGB).toFixed(1), sys.disk.totalGB, ' GB') : null,
            h('dl', { class: 'adm-dl' },
              h('dt', { text: 'carga (1/5/15 min)' }), h('dd', { text: `${sys.host.load.join(' · ')} — ${sys.host.cpus} núcleos` }),
              h('dt', { text: 'processador' }), h('dd', { text: sys.host.cpuModel }),
              h('dt', { text: 'sistema' }), h('dd', { text: `${sys.host.platform} · ligado há ${dur(sys.host.uptimeSec)}` }),
              h('dt', { text: 'servidor do dusky' }), h('dd', { text: `ligado há ${dur(sys.process.uptimeSec)} · ${sys.process.rssMB} MB · Node ${sys.process.node}` }),
              h('dt', { text: 'versão' }), h('dd', { text: `commit ${sys.version.commit || '?'}${sys.version.app ? ` · app ${sys.version.app.codename || ''} ${sys.version.app.version}` : ''}` }),
            )),
          section('serviços',
            h('ul', { class: 'adm-services' },
              svc('envio de e-mail (Resend)', sys.services.mail, 'ligado', 'desligado — códigos só no log'),
              svc('anti-robô no cadastro (Turnstile)', sys.services.turnstile, 'ligado', 'desligado'),
              svc('servidor de calls (LiveKit)', sys.services.sfu, `no ar · UDP ${sys.services.sfuPorts.udp} / TCP ${sys.services.sfuPorts.tcp}`, 'fora do ar ou desligado'),
              svc('erros no log (24h)', !sys.logs24h.error, 'nenhum', `${sys.logs24h.error} erro(s) · ${sys.logs24h.warn} aviso(s)`),
            )),
          section('espaço',
            h('dl', { class: 'adm-dl' },
              h('dt', { text: 'banco de dados' }), h('dd', { text: mb(sys.storage.dbMB) }),
              h('dt', { text: 'anexos do chat' }), h('dd', { text: mb(sys.storage.attachments) }),
              h('dt', { text: 'fotos, banners e ícones' }), h('dd', { text: mb(sys.storage.avatars + sys.storage.banners + sys.storage.server) }),
              h('dt', { text: 'temas, sons e decorações' }), h('dd', { text: mb(sys.storage.themes + sys.storage.sounds + sys.storage.decor) }),
              h('dt', { text: 'provas de denúncias' }), h('dd', { text: mb(sys.storage.evidence) }),
            )),
        ),
      ),
      h('div', { class: 'adm-grid2' },
        section('servidores mais ativos (7 dias)', s.topServers.length ? h('ol', { class: 'adm-rank' }, s.topServers.map((x) => h('li', {}, avatar(x, 24), h('span', { text: x.name }), h('b', { text: `${n(x.n)} msgs` })))) : h('p', { class: 'adm-muted', text: 'sem mensagens' })),
        section('quem mais falou (7 dias)', s.topUsers.length ? h('ol', { class: 'adm-rank' }, s.topUsers.map((x) => h('li', { class: 'is-link', onclick: () => openUser(x.id) }, avatar(x, 24), h('span', { text: x.username }), h('b', { text: `${n(x.n)} msgs` })))) : h('p', { class: 'adm-muted', text: 'sem mensagens' })),
      ),
    );
  }

  // ---------- ao vivo ----------

  async function renderLive() {
    const d = await api('GET', '/live');
    const STATUS = { online: 'online', idle: 'ausente', dnd: 'não perturbe', invisible: 'invisível' };
    put(body, 
      h('div', { class: 'adm-cards' },
        card('pessoas online', d.users.length, d.connections != null ? `${d.connections} conexão(ões) abertas` : ''),
        card('calls ativas', d.calls.length, `${d.calls.reduce((a, c) => a + c.people.length, 0)} pessoa(s) em call`)),
      h('div', { class: 'adm-grid2' },
        section('calls agora', d.calls.length
          ? h('div', { class: 'adm-calls' }, d.calls.map((c) => h('div', { class: 'adm-call' },
            h('strong', { text: c.server_name ? `${c.server_name} › ${c.name}` : 'chamada direta' }),
            h('span', { text: c.people.join(', ') }))))
          : h('p', { class: 'adm-muted', text: 'ninguém em call' })),
        section('online', d.users.length
          ? h('ul', { class: 'adm-people' }, d.users.map((u) => h('li', { class: 'is-link', onclick: () => openUser(u.id) }, avatar(u, 26),
            h('span', { text: u.username }), h('small', { text: [STATUS[u.status] || u.status, u.activity && u.activity.name ? `jogando ${u.activity.name}` : null].filter(Boolean).join(' · ') }))))
          : h('p', { class: 'adm-muted', text: 'ninguém online' })),
      ),
    );
  }

  // ---------- usuários ----------

  let usersFilter = 'all';
  let usersQuery = '';
  let usersCache = null;

  async function renderUsers(quiet) {
    const d = await api('GET', `/users${usersQuery ? `?q=${encodeURIComponent(usersQuery)}` : ''}`);
    usersCache = d;
    const search = h('input', { type: 'search', class: 'adm-search', placeholder: 'procurar pelo nome', value: usersQuery, autocomplete: 'off' });
    let t = null;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { usersQuery = search.value.trim(); load().then(() => { const s = body.querySelector('.adm-search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); }, 300); });
    const FILTERS = { all: 'todas', online: 'online', suspended: 'suspensas', admins: 'admins', deleted: 'excluídas' };
    const isDeleted = (u) => /^conta exclu[ií]da/i.test(u.username);
    const list = d.users.filter((u) => ({
      all: !isDeleted(u), online: u.online, suspended: !!u.banned_at, admins: u.is_site_admin, deleted: isDeleted(u),
    }[usersFilter]));
    const seg = h('div', { class: 'adm-seg' }, Object.entries(FILTERS).map(([k, label]) => h('button', {
      type: 'button', class: k === usersFilter ? 'active' : '', text: label, onclick: () => { usersFilter = k; renderUsers(); },
    })));
    const now = d.users;
    put(body, 
      h('div', { class: 'adm-toolbar' }, search, seg, h('span', { class: 'adm-muted', text: `${list.length} de ${now.length} conta(s)` })),
      table(['conta', 'criada', 'servidores', 'mensagens', 'última mensagem', 'anexos', ''], list, (u) => {
        const tags = [u.is_site_admin && 'admin', u.online && 'online', u.banned_at && 'suspensa'].filter(Boolean);
        const used = (u.upload_used_bytes || 0) / 1048576;
        return h('tr', { class: `is-link${u.banned_at ? ' is-suspended' : ''}`, onclick: () => openUser(u.id) },
          h('td', {}, h('span', { class: 'adm-user' }, avatar(u), h('span', {}, h('strong', { text: u.username }), tags.length ? h('small', { text: tags.join(' · ') }) : null))),
          h('td', { text: date(u.created_at, false) }),
          h('td', { text: n(u.servers) }),
          h('td', { text: n(u.messages) }),
          h('td', { text: u.last_message_at ? ago(u.last_message_at) : '—' }),
          h('td', { text: mb(used) }),
          h('td', { class: 'adm-chev', text: '›' }));
      }),
    );
  }

  async function openUser(id) {
    drawer.hidden = false;
    put(drawerBody, h('p', { class: 'adm-muted', text: 'carregando…' }));
    let d;
    try { d = await api('GET', `/users/${id}/details`); } catch (err) { put(drawerBody, h('p', { class: 'adm-error', text: err.message })); return; }
    const u = d.user;
    const refresh = () => { openUser(id); if (view === 'users') load(true); };
    const actions = [];
    if (!u.is_site_admin && !u.deleted_at) {
      if (u.banned_at) {
        actions.push(btn('reativar', 'btn-ghost', async () => { await api('POST', `/users/${id}/unsuspend`); toast(`${u.username} reativada`); refresh(); }));
      } else {
        actions.push(btn('suspender', 'btn-danger-ghost', async () => {
          const reason = prompt(`suspender ${u.username}? cai de tudo na hora e não entra mais.\n\nmotivo (aparece pra pessoa, opcional):`);
          if (reason === null) throw new Error('cancelado');
          await api('POST', `/users/${id}/suspend`, { reason }); toast(`${u.username} suspensa`); refresh();
        }));
      }
      actions.push(btn('deslogar de tudo', 'btn-ghost', async () => {
        if (!confirm(`derrubar todas as sessões de ${u.username}? ela entra de novo com a mesma senha.`)) throw new Error('cancelado');
        await api('POST', `/users/${id}/logout`); toast('sessões derrubadas'); refresh();
      }));
      actions.push(btn('senha temporária', 'btn-ghost', async () => {
        if (!confirm(`gerar uma senha temporária pra ${u.username}? todas as sessões dela caem.`)) throw new Error('cancelado');
        const r = await api('POST', `/users/${id}/reset-password`);
        prompt(`senha temporária de ${u.username} (aparece só agora — copie e mande pra pessoa):`, r.temporaryPassword);
      }));
      actions.push(btn('limite de anexos', 'btn-ghost', async () => {
        const max = prompt(`tamanho máximo por arquivo (MB) pra ${u.username}\nvazio = padrão`, d.uploads.custom.maxMB ?? '');
        if (max === null) throw new Error('cancelado');
        const quota = prompt('espaço total (MB)\nvazio = padrão', d.uploads.custom.quotaMB ?? '');
        if (quota === null) throw new Error('cancelado');
        await api('PUT', `/users/${id}/upload-limits`, { maxMB: max.trim() || null, quotaMB: quota.trim() || null });
        toast('limite atualizado'); refresh();
      }));
      actions.push(btn('excluir conta', 'btn-danger-ghost', async () => {
        const typed = prompt(`EXCLUIR a conta de ${u.username}? apaga e-mail, senha, fotos e tira de todos os servidores. Não tem volta.\n\ndigite o nome da conta pra confirmar:`);
        if (typed === null) throw new Error('cancelado');
        const wipe = confirm('apagar também TODAS as mensagens e anexos dessa conta?\n\nOK = apagar · Cancelar = manter as mensagens como "conta excluída"');
        const r = await api('POST', `/users/${id}/delete`, { username: typed, deleteMessages: wipe });
        toast(`conta excluída${wipe ? ` (${r.removedMessages} mensagens apagadas)` : ''}`); refresh();
      }));
    }
    const STATUS = { online: 'online', idle: 'ausente', dnd: 'não perturbe', invisible: 'invisível' };
    const REASONS = { spam: 'spam', harassment: 'assédio', violence: 'violência', sexual: 'sexual', child: 'menores', selfharm: 'automutilação', illegal: 'ilegal', other: 'outro' };
    put(drawerBody, 
      h('div', { class: 'adm-profile' },
        u.banner_url ? h('img', { class: 'adm-profile-banner', src: u.banner_url, alt: '' }) : h('div', { class: 'adm-profile-banner', style: u.accent_color ? `background:${u.accent_color}` : '' }),
        h('div', { class: 'adm-profile-id' }, avatar(u, 64), h('div', {}, h('h2', { text: u.username }),
          h('span', { class: 'adm-muted', text: [u.is_site_admin && 'admin do site', u.online ? (STATUS[u.status] || 'online') : 'offline', u.banned_at && 'SUSPENSA', u.deleted_at && 'EXCLUÍDA'].filter(Boolean).join(' · ') })))),
      u.banned_at ? h('p', { class: 'adm-flag', text: `suspensa em ${date(u.banned_at)}${u.ban_reason ? ` — ${u.ban_reason}` : ''}` }) : null,
      h('div', { class: 'adm-actions' }, actions),
      h('dl', { class: 'adm-dl' },
        h('dt', { text: 'id' }), h('dd', { text: `#${u.id}` }),
        h('dt', { text: 'e-mail' }), h('dd', { text: u.email ? `${u.email} (confirmado ${date(u.email_verified_at, false)})` : u.email_pending ? `${u.email_pending} (não confirmado)` : '—' }),
        h('dt', { text: 'conta criada' }), h('dd', { text: `${date(u.created_at)}${u.terms_accepted_at ? ' · aceitou os termos' : ''}` }),
        h('dt', { text: '2 etapas' }), h('dd', { text: [u.totp && 'app autenticador', u.email2fa && 'código por e-mail'].filter(Boolean).join(' + ') || 'desligada' }),
        h('dt', { text: 'mensagens' }), h('dd', { text: `${n(d.messages.total)} no total · ${n(d.messages.week)} nos últimos 7 dias · última ${ago(d.messages.last)}` }),
        h('dt', { text: 'anexos' }), h('dd', { text: d.uploads.unlimited ? `${mb(d.uploads.usedMB)} · sem limite` : `${mb(d.uploads.usedMB)} de ${mb(d.uploads.quotaMB)} · até ${mb(d.uploads.maxMB)} por arquivo${d.uploads.custom.maxMB != null || d.uploads.custom.quotaMB != null ? ' (próprio)' : ''}` }),
        u.activity && u.activity.name ? [h('dt', { text: 'jogando' }), h('dd', { text: u.activity.name })] : null,
        u.status_text ? [h('dt', { text: 'status' }), h('dd', { text: u.status_text })] : null,
        u.bio ? [h('dt', { text: 'bio' }), h('dd', { class: 'adm-pre', text: u.bio })] : null,
        h('dt', { text: 'denúncias' }), h('dd', { text: `${d.reportsAgainst.length} contra · fez ${d.reportsMade}` }),
      ),
      h('h3', { text: `servidores (${d.servers.length})` }),
      d.servers.length ? h('ul', { class: 'adm-people' }, d.servers.map((s) => h('li', {}, avatar(s, 22), h('span', { text: s.name }), h('small', { text: s.owner ? 'dono' : `entrou ${date(s.joined_at, false)}` })))) : h('p', { class: 'adm-muted', text: 'nenhum' }),
      d.reportsAgainst.length ? [h('h3', { text: 'denúncias contra' }),
        h('ul', { class: 'adm-people' }, d.reportsAgainst.map((r) => h('li', {}, h('span', { text: REASONS[r.reason] || r.reason }), h('small', { text: `${date(r.created_at)} · por ${r.reporter || '?'} · ${r.status === 'open' ? 'aberta' : r.status === 'resolved' ? 'resolvida' : 'descartada'}` }))))] : null,
    );
  }
  function closeDrawer() { drawer.hidden = true; }
  $('admDrawerClose').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) closeDrawer(); });

  // ---------- servidores ----------

  async function renderServers() {
    const { servers } = await api('GET', '/servers');
    put(body, 
      h('div', { class: 'adm-toolbar' }, h('span', { class: 'adm-muted', text: `${servers.length} servidor(es)` })),
      table(['servidor', 'dono', 'membros', 'canais', 'mensagens', 'criado', ''], servers, (s) => h('tr', {},
        h('td', {}, h('span', { class: 'adm-user' }, avatar(s), h('strong', { text: s.name }))),
        h('td', { text: s.owner || '—' }), h('td', { text: n(s.members) }), h('td', { text: n(s.channels) }),
        h('td', { text: n(s.messages) }), h('td', { text: date(s.created_at, false) }),
        h('td', {}, btn('apagar', 'btn-danger-ghost', async () => {
          const typed = prompt(`apagar "${s.name}" de vez (${s.messages} mensagens, ${s.members} membros)? não tem volta.\n\ndigite o nome do servidor pra confirmar:`);
          if (typed == null) throw new Error('cancelado');
          if (typed.trim() !== s.name) throw new Error('o nome não bate — nada foi apagado');
          await api('DELETE', `/servers/${s.id}`); toast(`${s.name} apagado`); load();
        })))),
    );
  }

  // ---------- denúncias ----------

  let reportsClosed = false;
  async function renderReports() {
    const d = await api('GET', `/reports${reportsClosed ? '?status=closed' : ''}`);
    setBadge('badgeReports', d.open);
    const seg = h('div', { class: 'adm-seg' },
      h('button', { type: 'button', class: reportsClosed ? '' : 'active', text: `abertas (${d.open})`, onclick: () => { reportsClosed = false; load(); } }),
      h('button', { type: 'button', class: reportsClosed ? 'active' : '', text: 'resolvidas', onclick: () => { reportsClosed = true; load(); } }));
    const STATUS = { resolved: 'resolvida', dismissed: 'descartada', open: 'aberta' };
    const cards = d.reports.map((r) => {
      const s = r.snapshot || {};
      const where = r.server_name ? `${r.server_name} › #${r.channel_name || '?'}` : r.channel_id ? 'mensagem direta' : 'perfil';
      let meta = `${date(r.created_at)} · por ${r.reporter || 'conta excluída'} · ${where}`;
      if (r.status !== 'open') meta += ` · ${STATUS[r.status]}${r.resolver ? ` por ${r.resolver}` : ''} ${date(r.resolved_at)}`;
      const content = r.message_id
        ? h('blockquote', {}, s.content || (s.attachment_name ? '' : '(sem texto)'),
          r.has_evidence ? [h('br'), h('a', { href: `/api/admin/reports/${r.id}/evidence`, download: '', text: `anexo guardado: ${s.attachment_name || 'arquivo'} (baixar — abra com cuidado)` })] : null,
          !r.message_exists ? h('small', { class: 'adm-muted', text: ' (já apagada)' }) : null)
        : h('blockquote', { text: [s.username && `nome: ${s.username}`, s.status_text && `status: ${s.status_text}`, s.bio && `bio: ${s.bio}`].filter(Boolean).join('\n') || '(perfil sem texto)' });
      const acts = [];
      if (r.status === 'open') {
        if (r.message_id && r.message_exists) acts.push(btn('apagar a mensagem', 'btn-danger-ghost', async () => {
          if (!confirm('apagar essa mensagem pra todo mundo? (a cópia da denúncia continua guardada)')) throw new Error('cancelado');
          await api('POST', `/reports/${r.id}/delete-message`); toast('mensagem apagada'); load();
        }));
        if (r.target_user_id && !r.target_banned) acts.push(btn(`suspender ${r.target || 'conta'}`, 'btn-danger-ghost', async () => {
          const reason = prompt(`suspender ${r.target}?\n\nmotivo (aparece pra pessoa, opcional):`, d.reasons[r.reason] || '');
          if (reason === null) throw new Error('cancelado');
          await api('POST', `/users/${r.target_user_id}/suspend`, { reason });
          await api('POST', `/reports/${r.id}`, { status: 'resolved' }); toast(`${r.target} suspensa`); load();
        }));
        acts.push(btn('resolvida', 'btn-primary', async () => { await api('POST', `/reports/${r.id}`, { status: 'resolved' }); load(); }));
        acts.push(btn('descartar', 'btn-ghost', async () => { await api('POST', `/reports/${r.id}`, { status: 'dismissed' }); load(); }));
      } else {
        acts.push(btn('reabrir', 'btn-ghost', async () => { await api('POST', `/reports/${r.id}`, { status: 'open' }); load(); }));
      }
      return h('article', { class: `adm-report${r.reason === 'child' ? ' is-urgent' : ''}` },
        h('header', {}, h('strong', { text: d.reasons[r.reason] || r.reason }), h('small', { text: meta })),
        h('p', {}, 'contra ', h('a', { href: '#users', text: r.target || 'conta excluída', onclick: (e) => { e.preventDefault(); if (r.target_user_id) openUser(r.target_user_id); } }),
          r.target_reports > 1 ? ` — ${r.target_reports} denúncias no total` : '', r.target_banned ? ' (já suspensa)' : ''),
        content,
        r.details ? h('p', { class: 'adm-quote', text: `“${r.details}”` }) : null,
        h('div', { class: 'adm-actions' }, acts));
    });
    put(body, h('div', { class: 'adm-toolbar' }, seg),
      cards.length ? h('div', { class: 'adm-reports' }, cards) : h('p', { class: 'adm-empty', text: reportsClosed ? 'nada por aqui ainda' : 'nenhuma denúncia aberta. Que paz.' }));
  }

  // ---------- logs ----------

  const logsState = {
    last: 0, level: '', q: '', paused: false, timer: null, box: null,
    stop() { clearInterval(this.timer); this.timer = null; },
  };
  async function renderLogs() {
    logsState.last = 0;
    const box = h('div', { class: 'adm-logs' });
    logsState.box = box;
    const level = h('select', {}, h('option', { value: '', text: 'tudo' }), h('option', { value: 'warn', text: 'avisos e erros' }), h('option', { value: 'error', text: 'só erros' }));
    level.value = logsState.level;
    const q = h('input', { type: 'search', class: 'adm-search', placeholder: 'filtrar (ex: [voice], [mail], userId=3)', value: logsState.q });
    const pause = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: logsState.paused ? 'continuar' : 'pausar' });
    const restart = () => { logsState.last = 0; box.textContent = ''; pull(); };
    level.addEventListener('change', () => { logsState.level = level.value; restart(); });
    let t = null;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { logsState.q = q.value.trim(); restart(); }, 300); });
    pause.addEventListener('click', () => { logsState.paused = !logsState.paused; pause.textContent = logsState.paused ? 'continuar' : 'pausar'; });
    put(body, 
      h('div', { class: 'adm-toolbar' }, q, level, pause, h('span', { class: 'adm-muted', text: 'últimas 3000 linhas desde que o servidor ligou · atualiza sozinho' })),
      box);
    await pull();
    logsState.stop();
    logsState.timer = setInterval(() => { if (!logsState.paused && !document.hidden) pull(); }, 2500);
  }
  async function pull() {
    const box = logsState.box;
    if (!box) return;
    const d = await api('GET', `/logs?after=${logsState.last}&level=${logsState.level}&q=${encodeURIComponent(logsState.q)}`);
    logsState.last = d.last;
    if (!d.lines.length) { if (!box.childElementCount) box.append(h('p', { class: 'adm-muted', text: 'nada no log com esse filtro' })); return; }
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const empty = box.querySelector('p.adm-muted');
    if (empty) empty.remove();
    const frag = document.createDocumentFragment();
    for (const l of d.lines) {
      const time = new Date(l.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const day = new Date(l.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      frag.append(h('div', { class: `adm-log is-${l.level}` }, h('time', { text: `${day} ${time}` }), h('span', { text: l.text })));
    }
    box.append(frag);
    while (box.childElementCount > 3000) box.firstChild.remove();
    if (atBottom || box.childElementCount === d.lines.length) box.scrollTop = box.scrollHeight;
  }

  // ---------- registro ----------

  async function renderActions() {
    const { actions } = await api('GET', '/actions');
    put(body, actions.length
      ? table(['quando', 'quem', 'o que', 'em quem / no quê', 'detalhes'], actions, (a) => h('tr', {},
        h('td', { text: date(a.created_at) }), h('td', { text: a.admin || '—' }), h('td', { text: a.action }),
        h('td', {}, a.target_type === 'user' && a.target_id ? h('a', { href: '#users', text: a.target_name || `#${a.target_id}`, onclick: (e) => { e.preventDefault(); openUser(a.target_id); } })
          : a.target_type === 'report' ? `denúncia #${a.target_id}` : a.target_name || '—'),
        h('td', { class: 'adm-pre', text: a.details || '' })))
      : h('p', { class: 'adm-empty', text: 'nenhuma ação registrada ainda' }));
  }

  // ---------- aviso geral ----------

  function renderAnnounce() {
    const ta = h('textarea', { maxlength: 300, rows: 4, placeholder: 'ex: vou reiniciar o servidor em 5 minutos pra atualizar' });
    const count = h('span', { class: 'adm-muted', text: '0/300' });
    ta.addEventListener('input', () => { count.textContent = `${ta.value.length}/300`; });
    const send = btn('mandar aviso', 'btn-primary', async () => {
      if (!ta.value.trim()) throw new Error('escreve o aviso');
      const r = await api('POST', '/announce', { text: ta.value });
      toast(`aviso mandado pra ${r.delivered} pessoa(s) online`);
      ta.value = ''; count.textContent = '0/300';
    });
    put(body, section(null,
      h('p', { class: 'adm-muted', text: 'Aparece em destaque pra todo mundo que estiver com o dusky aberto agora (manutenção, reinício, novidade…).' }),
      ta, h('div', { class: 'adm-actions' }, count, send)));
    ta.focus();
    return Promise.resolve();
  }

  // ---------- começo ----------

  function setBadge(id, v) {
    const b = $(id);
    b.hidden = !v;
    b.textContent = v ? String(v) : '';
  }

  document.querySelectorAll('#admNav [data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $('admRefresh').addEventListener('click', () => (view === 'logs' ? renderLogs() : load()));
  window.addEventListener('hashchange', () => go(location.hash.slice(1), { keepHash: true }));

  fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => {
    me = d && d.user;
    if (!me || !me.is_site_admin) { window.location.replace('/app.html'); return; }
    $('admMe').textContent = `entrou como ${me.username}`;
    go(location.hash.slice(1) || 'overview', { keepHash: true });
    // números das abas, mesmo sem abrir
    api('GET', '/reports').then((r) => setBadge('badgeReports', r.open)).catch(() => {});
    api('GET', '/system').then((s) => setBadge('badgeLogs', s.logs24h.error || 0)).catch(() => {});
  });
})();
