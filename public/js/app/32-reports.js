// dusky — Denúncias
// Parte 32 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Neste arquivo:
//   - janela de denunciar (mensagem ou pessoa) — server/routes/reports.js
//   - aba "denúncias" do painel de admin do site — server/routes/admin.js (/api/admin/reports)

const FLAG_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>';
let reportReasons = null;

// target: { messageId, name } (mensagem de `name`) ou { userId, name }
async function openReportDialog(target) {
  if (!reportReasons) {
    try { reportReasons = (await (await fetch('/api/reports/reasons')).json()).reasons; } catch (_) { toast('não consegui abrir a denúncia', 'error'); return; }
  }
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal card report-modal" role="dialog" aria-labelledby="reportTitle">
      <h3 class="display" id="reportTitle"></h3>
      <p class="modal-lead">A denúncia vai pro admin do site, que pode apagar o conteúdo e suspender a conta. A pessoa denunciada não fica sabendo quem denunciou.</p>
      <div class="report-reasons" role="radiogroup" aria-label="motivo"></div>
      <p class="report-urgent" hidden>Se alguém está em perigo agora, ligue <strong>190</strong>. Abuso contra crianças e adolescentes também pode ser denunciado no <strong>Disque 100</strong> ou na SaferNet Brasil (safernet.org.br).</p>
      <div class="field">
        <label for="reportDetails">detalhes (opcional)</label>
        <textarea id="reportDetails" maxlength="1000" rows="3" placeholder="conte o que aconteceu"></textarea>
      </div>
      <div class="field-error" hidden></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close>cancelar</button>
        <button type="button" class="btn btn-danger report-send" disabled>denunciar</button>
      </div>
    </div>`;
  backdrop.querySelector('#reportTitle').textContent = target.messageId
    ? `denunciar mensagem${target.name ? ` de ${target.name}` : ''}`
    : `denunciar ${target.name || 'essa pessoa'}`;
  const list = backdrop.querySelector('.report-reasons');
  const send = backdrop.querySelector('.report-send');
  const urgent = backdrop.querySelector('.report-urgent');
  const errEl = backdrop.querySelector('.field-error');
  let reason = null;
  for (const [key, label] of Object.entries(reportReasons)) {
    const row = document.createElement('label');
    row.className = 'report-reason';
    row.innerHTML = '<input type="radio" name="reportReason"><span></span>';
    row.querySelector('input').value = key;
    row.querySelector('span').textContent = label;
    row.querySelector('input').addEventListener('change', () => {
      reason = key;
      send.disabled = false;
      urgent.hidden = !['child', 'violence', 'selfharm'].includes(key);
    });
    list.appendChild(row);
  }
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('[data-close]')) close(); });
  send.addEventListener('click', async () => {
    send.disabled = true;
    errEl.hidden = true;
    const body = { reason, details: backdrop.querySelector('#reportDetails').value };
    if (target.messageId) body.messageId = target.messageId; else body.userId = target.userId;
    try {
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'não deu pra mandar');
      close();
      toast('denúncia enviada — obrigado por avisar');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
      send.disabled = false;
    }
  });
  document.body.appendChild(backdrop);
  const first = list.querySelector('input');
  if (first) first.focus();
}

// ---------- painel de admin: aba "denúncias" ----------

let adminReportsClosed = false;

function setAdminReportsBadge(n) {
  const tab = adminTabs && adminTabs.querySelector('[data-admin-tab="reports"]');
  if (!tab) return;
  let badge = tab.querySelector('.admin-tab-badge');
  if (!n) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'admin-tab-badge'; tab.appendChild(badge); }
  badge.textContent = String(n);
}

async function renderAdminReports() {
  const d = await adminApi('GET', `/reports${adminReportsClosed ? '?status=closed' : ''}`);
  setAdminReportsBadge(d.open);
  adminBody.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-seg">
        <button type="button" data-seg="open">abertas</button>
        <button type="button" data-seg="closed">resolvidas</button>
      </div>
      <span class="admin-count"></span>
    </div>
    <div class="admin-reports"></div>`;
  adminBody.querySelectorAll('[data-seg]').forEach((b) => {
    b.classList.toggle('active', (b.dataset.seg === 'closed') === adminReportsClosed);
    b.addEventListener('click', () => { adminReportsClosed = b.dataset.seg === 'closed'; showAdminTab('reports'); });
  });
  adminBody.querySelector('.admin-count').textContent = adminReportsClosed ? `${d.reports.length} resolvida(s)` : `${d.open} aberta(s)`;
  const box = adminBody.querySelector('.admin-reports');
  if (!d.reports.length) {
    box.innerHTML = `<p class="admin-empty">${adminReportsClosed ? 'nada por aqui ainda' : 'nenhuma denúncia aberta. Que paz.'}</p>`;
    return;
  }
  const STATUS = { resolved: 'resolvida', dismissed: 'descartada', open: 'aberta' };
  for (const r of d.reports) {
    const card = document.createElement('article');
    card.className = `admin-report${r.reason === 'child' ? ' is-urgent' : ''}`;
    card.innerHTML = `
      <header><strong class="admin-report-reason"></strong><small class="admin-report-meta"></small></header>
      <p class="admin-report-target"></p>
      <blockquote class="admin-report-content"></blockquote>
      <p class="admin-report-details"></p>
      <div class="admin-actions"></div>`;
    card.querySelector('.admin-report-reason').textContent = d.reasons[r.reason] || r.reason;
    const where = r.server_name ? `${r.server_name} › #${r.channel_name || '?'}` : r.channel_id ? 'mensagem direta' : 'perfil';
    let meta = `${fmtDate(r.created_at)} · denunciado por ${r.reporter || 'conta excluída'} · ${where}`;
    if (r.status !== 'open') meta += ` · ${STATUS[r.status] || r.status}${r.resolver ? ` por ${r.resolver}` : ''} em ${fmtDate(r.resolved_at)}`;
    card.querySelector('.admin-report-meta').textContent = meta;
    const t = card.querySelector('.admin-report-target');
    t.textContent = `contra ${r.target || 'conta excluída'}${r.target_reports > 1 ? ` — ${r.target_reports} denúncias contra essa conta no total` : ''}${r.target_banned ? ' (já suspensa)' : ''}`;
    const q = card.querySelector('.admin-report-content');
    const s = r.snapshot || {};
    if (r.message_id) {
      q.textContent = s.content || (s.attachment_name ? '' : '(mensagem sem texto)');
      if (s.attachment_name || r.has_evidence) {
        const a = document.createElement(r.has_evidence ? 'a' : 'span');
        a.className = 'admin-report-file';
        a.textContent = r.has_evidence ? `anexo guardado: ${s.attachment_name || 'arquivo'} (baixar — abra com cuidado)` : `anexo: ${s.attachment_name} (não foi possível guardar)`;
        if (r.has_evidence) { a.href = `/api/admin/reports/${r.id}/evidence`; a.setAttribute('download', ''); }
        q.appendChild(document.createElement('br'));
        q.appendChild(a);
      }
      if (!r.message_exists) {
        const gone = document.createElement('small');
        gone.className = 'admin-report-gone';
        gone.textContent = ' (a mensagem já foi apagada)';
        q.appendChild(gone);
      }
    } else {
      q.textContent = [s.username && `nome: ${s.username}`, s.status_text && `status: ${s.status_text}`, s.bio && `bio: ${s.bio}`].filter(Boolean).join('\n') || '(perfil sem texto)';
    }
    const det = card.querySelector('.admin-report-details');
    if (r.details) det.textContent = `“${r.details}”`; else det.remove();

    const actions = card.querySelector('.admin-actions');
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn-sm ${cls}`;
      b.textContent = label;
      b.addEventListener('click', async () => {
        b.disabled = true;
        try { await fn(); } catch (err) { toast(err.message, 'error'); b.disabled = false; }
      });
      actions.appendChild(b);
    };
    if (r.status === 'open') {
      if (r.message_id && r.message_exists) {
        mk('apagar a mensagem', 'btn-danger-ghost', async () => {
          if (!confirm('apagar essa mensagem pra todo mundo? (a cópia da denúncia continua guardada)')) throw new Error('cancelado');
          await adminApi('POST', `/reports/${r.id}/delete-message`);
          toast('mensagem apagada');
          showAdminTab('reports');
        });
      }
      if (r.target_user_id && !r.target_banned) {
        mk(`suspender ${r.target || 'conta'}`, 'btn-danger-ghost', async () => {
          const reason = prompt(`suspender ${r.target}? cai de tudo na hora e não entra mais.\n\nmotivo (aparece pra pessoa, opcional):`, d.reasons[r.reason] || '');
          if (reason === null) throw new Error('cancelado');
          await adminApi('POST', `/users/${r.target_user_id}/suspend`, { reason });
          await adminApi('POST', `/reports/${r.id}`, { status: 'resolved' });
          toast(`${r.target} suspenso`);
          showAdminTab('reports');
        });
      }
      mk('resolvida', 'btn-primary', async () => { await adminApi('POST', `/reports/${r.id}`, { status: 'resolved' }); showAdminTab('reports'); });
      mk('descartar', 'btn-ghost', async () => { await adminApi('POST', `/reports/${r.id}`, { status: 'dismissed' }); showAdminTab('reports'); });
    } else {
      mk('reabrir', 'btn-ghost', async () => { await adminApi('POST', `/reports/${r.id}`, { status: 'open' }); showAdminTab('reports'); });
    }
    box.appendChild(card);
  }
}

// número de denúncias abertas na aba, assim que o admin entra
async function refreshAdminReportsBadge() {
  if (!currentUser || !currentUser.is_site_admin) return;
  try { setAdminReportsBadge((await adminApi('GET', '/reports')).open); } catch (_) { /* sem badge */ }
}
