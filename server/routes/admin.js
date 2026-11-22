const express = require('express');
const { asyncRoute } = require('../asyncRoute');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const uploadLimits = require('../uploadLimits');
const { REASONS, evidencePath } = require('../reports');
const { unlinkIfUnused } = require('../accountDeletion');

// Painel de admin do SITE (não confundir com admin de um servidor/cargos): quem tem
// users.is_site_admin = 1 — marcado no primeiro boot pra conta definida em SITE_ADMINS (.env,
// padrão "veneno"), ver db/index.js. Gravado no banco, então trocar de nick não tira o admin, e criar
// uma conta com o mesmo nome depois não dá admin pra ninguém.
const router = express.Router();
const startedAt = Date.now();

function requireSiteAdmin(req, res, next) {
  if (!req.user || !req.user.is_site_admin) return res.status(403).json({ error: 'só o admin do site pode ver isso' });
  next();
}

router.use(requireAuth, requireSiteAdmin);

function dirSizeMB(dir) {
  let total = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else { try { total += fs.statSync(full).size; } catch (_) { /* sumiu */ } }
    }
  };
  walk(dir);
  return Math.round((total / 1024 / 1024) * 10) / 10;
}

// GET /api/admin/overview — números gerais do site
router.get('/overview', (req, res) => {
  const count = (sql) => db.prepare(sql).get().c;
  const occupancy = realtime.voiceOccupancyAll();
  const dbFile = db.DB_PATH;
  let dbMB = 0;
  for (const f of [dbFile, dbFile + '-wal']) { try { dbMB += fs.statSync(f).size / 1024 / 1024; } catch (_) { /* ok */ } }
  res.json({
    users: count('SELECT COUNT(*) AS c FROM users'),
    suspended: count('SELECT COUNT(*) AS c FROM users WHERE banned_at IS NOT NULL'),
    servers: count('SELECT COUNT(*) AS c FROM servers'),
    messages: count('SELECT COUNT(*) AS c FROM messages'),
    messagesToday: count("SELECT COUNT(*) AS c FROM messages WHERE created_at >= datetime('now', '-1 day')"),
    online: realtime.onlineUserIds().length,
    inVoice: occupancy.filter((o) => o.userId !== realtime.BOT_USER_ID).length,
    voiceChannelsActive: new Set(occupancy.map((o) => o.channelId)).size,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    node: process.version,
    dbMB: Math.round(dbMB * 10) / 10,
    uploadsMB: dirSizeMB(path.join(__dirname, '..', '..', 'public', 'uploads')),
  });
});

// GET /api/admin/users?q= — todo mundo (ou quem bate com a busca)
router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 50);
  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, u.accent_color, u.created_at, u.banned_at, u.ban_reason, u.is_site_admin,
      u.upload_max_mb, u.upload_quota_mb,
      (SELECT COALESCE(SUM(m.attachment_size), 0) FROM messages m WHERE m.user_id = u.id AND m.attachment_url LIKE '/uploads/%') AS upload_used_bytes,
      (SELECT COUNT(*) FROM server_members sm WHERE sm.user_id = u.id) AS servers,
      (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS messages,
      (SELECT MAX(created_at) FROM messages m WHERE m.user_id = u.id) AS last_message_at
    FROM users u
    ${q ? 'WHERE u.username LIKE ? COLLATE NOCASE' : ''}
    ORDER BY u.created_at DESC
    LIMIT 500
  `).all(...(q ? [`%${q}%`] : []));
  res.json({
    users: rows.map((u) => ({ ...u, is_site_admin: !!u.is_site_admin, online: realtime.isOnline(u.id) })),
    uploadDefaults: { maxMB: uploadLimits.DEFAULT_MAX_MB, quotaMB: uploadLimits.DEFAULT_QUOTA_MB, maxSettableMB: uploadLimits.MAX_SETTABLE_MB },
  });
});

function loadTarget(req, res, next) {
  const target = db.prepare('SELECT id, username, is_site_admin, banned_at FROM users WHERE id = ?').get(Number(req.params.id));
  if (!target) return res.status(404).json({ error: 'usuário não encontrado' });
  if (target.is_site_admin) return res.status(403).json({ error: 'não dá pra fazer isso com um admin do site' });
  req.target = target;
  next();
}

// POST /api/admin/users/:id/suspend { reason } — conta suspensa: cai de tudo na hora e não entra mais
router.post('/users/:id/suspend', loadTarget, (req, res) => {
  const reason = String((req.body || {}).reason || '').trim().slice(0, 200) || null;
  db.prepare("UPDATE users SET banned_at = datetime('now'), ban_reason = ?, session_version = session_version + 1 WHERE id = ?")
    .run(reason, req.target.id);
  realtime.disconnectUser(req.target.id); // tira da call, se estiver
  realtime.dropUserConnections(req.target.id, { type: 'account_suspended', reason });
  require('../adminLog').record(req, 'suspendeu', { type: 'user', id: req.target.id, name: req.target.username, details: reason });
  res.json({ ok: true });
});

// PUT /api/admin/users/:id/upload-limits { maxMB, quotaMB } — limite de anexo dessa conta.
// null (ou vazio) = volta pro padrão do .env. A conta do admin do site não tem limite (loadTarget
// nem deixa mexer nela).
router.put('/users/:id/upload-limits', loadTarget, (req, res) => {
  const body = req.body || {};
  const max = uploadLimits.parseSetting(body.maxMB);
  const quota = uploadLimits.parseSetting(body.quotaMB);
  if (!max.ok || !quota.ok) {
    return res.status(400).json({ error: `use um número inteiro de MB entre 1 e ${uploadLimits.MAX_SETTABLE_MB} (ou deixe vazio pro padrão)` });
  }
  db.prepare('UPDATE users SET upload_max_mb = ?, upload_quota_mb = ? WHERE id = ?').run(max.value, quota.value, req.target.id);
  require('../adminLog').record(req, 'mudou o limite de anexos', { type: 'user', id: req.target.id, name: req.target.username, details: `${max.value ?? 'padrão'} MB por arquivo, ${quota.value ?? 'padrão'} MB no total` });
  const l = uploadLimits.limitsFor(req.target.id);
  res.json({ ok: true, maxMB: l.maxMB, quotaMB: l.quotaMB, usedMB: l.usedMB, custom: l.custom });
});

// POST /api/admin/users/:id/unsuspend
router.post('/users/:id/unsuspend', loadTarget, (req, res) => {
  db.prepare('UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = ?').run(req.target.id);
  require('../adminLog').record(req, 'reativou', { type: 'user', id: req.target.id, name: req.target.username });
  res.json({ ok: true });
});

// POST /api/admin/users/:id/reset-password — gera uma senha temporária (mostrada uma vez só) e
// desconecta todas as sessões da conta
router.post('/users/:id/reset-password', loadTarget, asyncRoute(async (req, res) => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let temp = '';
  for (const b of bytes) temp += alphabet[b % alphabet.length];
  const hash = await bcrypt.hash(temp, 12);
  db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?').run(hash, req.target.id);
  realtime.disconnectUser(req.target.id);
  realtime.dropUserConnections(req.target.id, { type: 'session_revoked' });
  require('../adminLog').record(req, 'gerou senha temporária', { type: 'user', id: req.target.id, name: req.target.username });
  res.json({ ok: true, temporaryPassword: temp });
}));

// GET /api/admin/servers — todos os servidores do site
router.get('/servers', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.icon_url, s.created_at, u.username AS owner,
      (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) AS members,
      (SELECT COUNT(*) FROM channels c WHERE c.server_id = s.id) AS channels,
      (SELECT COUNT(*) FROM messages m JOIN channels c ON c.id = m.channel_id WHERE c.server_id = s.id) AS messages
    FROM servers s LEFT JOIN users u ON u.id = s.owner_id
    ORDER BY s.created_at DESC
  `).all();
  res.json({ servers: rows });
});

// DELETE /api/admin/servers/:id — apaga um servidor (mesmo efeito de o dono apagar)
router.delete('/servers/:id', (req, res) => {
  const server = access.getServer(Number(req.params.id));
  if (!server) return res.status(404).json({ error: 'servidor não encontrado' });
  const memberIds = access.serverMemberIds(server.id);
  realtime.kickFromServerVoice(server.id);
  const attachments = db.prepare(`
    SELECT m.attachment_url FROM messages m JOIN channels c ON c.id = m.channel_id
    WHERE c.server_id = ? AND m.attachment_url LIKE '/uploads/%'
  `).all(server.id).map((r) => r.attachment_url);
  const sounds = db.prepare('SELECT file_url FROM soundboard_sounds WHERE server_id = ?').all(server.id).map((r) => r.file_url);
  db.prepare('DELETE FROM servers WHERE id = ?').run(server.id);
  for (const url of [server.icon_url, server.banner_url, ...attachments, ...sounds]) {
    if (url && url.startsWith('/uploads/')) fs.unlink(path.join(__dirname, '..', '..', 'public', url), () => {});
  }
  require('../adminLog').record(req, 'apagou o servidor', { type: 'server', id: server.id, name: server.name });
  realtime.sendToUsers(memberIds, { type: 'server_deleted', serverId: server.id });
  res.json({ ok: true });
});

// POST /api/admin/announce { text } — aviso que aparece pra todo mundo conectado agora
router.post('/announce', (req, res) => {
  const text = String((req.body || {}).text || '').trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: 'escreve o aviso' });
  realtime.broadcast({ type: 'site_announcement', text, by: req.user.username });
  require('../adminLog').record(req, 'mandou aviso geral', { details: text });
  res.json({ ok: true, delivered: realtime.onlineUserIds().length });
});

// ------------------------------------------------------------------ denúncias

// GET /api/admin/reports?status=open|closed
router.get('/reports', (req, res) => {
  const closed = req.query.status === 'closed';
  const rows = db.prepare(`
    SELECT r.*, rp.username AS reporter, t.username AS target, t.banned_at AS target_banned,
           s.name AS server_name, c.name AS channel_name, rb.username AS resolver,
           (SELECT COUNT(*) FROM reports r2 WHERE r2.target_user_id = r.target_user_id) AS target_reports,
           EXISTS(SELECT 1 FROM messages m WHERE m.id = r.message_id) AS message_exists
    FROM reports r
      LEFT JOIN users rp ON rp.id = r.reporter_id
      LEFT JOIN users t ON t.id = r.target_user_id
      LEFT JOIN servers s ON s.id = r.server_id
      LEFT JOIN channels c ON c.id = r.channel_id
      LEFT JOIN users rb ON rb.id = r.resolved_by
    WHERE ${closed ? "r.status != 'open'" : "r.status = 'open'"}
    ORDER BY r.id DESC LIMIT 200`).all();
  const open = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").get().n;
  res.json({
    open,
    reasons: REASONS,
    reports: rows.map((r) => {
      let snapshot = {};
      try { snapshot = JSON.parse(r.snapshot_json || '{}'); } catch (_) { snapshot = {}; }
      const { snapshot_json, evidence_file, ...rest } = r;
      return { ...rest, snapshot, has_evidence: !!evidence_file, message_exists: !!r.message_exists, target_banned: !!r.target_banned };
    }),
  });
});

// POST /api/admin/reports/:id { status: 'resolved' | 'dismissed' | 'open' }
router.post('/reports/:id', (req, res) => {
  const status = String((req.body || {}).status || '');
  if (!['resolved', 'dismissed', 'open'].includes(status)) return res.status(400).json({ error: 'status inválido' });
  const r = db.prepare('UPDATE reports SET status = ?, resolved_by = ?, resolved_at = CASE WHEN ? = \'open\' THEN NULL ELSE datetime(\'now\') END WHERE id = ?')
    .run(status, status === 'open' ? null : req.user.id, status, Number(req.params.id));
  if (r.changes) require('../adminLog').record(req, { resolved: 'resolveu a denúncia', dismissed: 'descartou a denúncia', open: 'reabriu a denúncia' }[status], { type: 'report', id: Number(req.params.id) });
  if (!r.changes) return res.status(404).json({ error: 'denúncia não encontrada' });
  res.json({ ok: true });
});

// POST /api/admin/reports/:id/delete-message — apaga a mensagem denunciada (a prova continua guardada)
router.post('/reports/:id/delete-message', (req, res) => {
  const rep = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.params.id));
  if (!rep || !rep.message_id) return res.status(404).json({ error: 'denúncia sem mensagem' });
  const m = db.prepare('SELECT id, channel_id, attachment_url FROM messages WHERE id = ?').get(rep.message_id);
  if (m) {
    db.prepare('DELETE FROM messages WHERE id = ?').run(m.id);
    if (m.attachment_url) unlinkIfUnused(m.attachment_url, 0);
    realtime.broadcastToChannel(m.channel_id, { type: 'message_deleted', channelId: m.channel_id, messageId: m.id });
  }
  db.prepare("UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now') WHERE message_id = ? AND status = 'open'")
    .run(req.user.id, rep.message_id);
  require('../adminLog').record(req, 'apagou a mensagem denunciada', { type: 'report', id: rep.id, details: m ? `mensagem ${m.id}` : 'já tinha sido apagada' });
  res.json({ ok: true, deleted: !!m });
});

// GET /api/admin/reports/:id/evidence — o anexo guardado da mensagem denunciada (sempre como download)
router.get('/reports/:id/evidence', (req, res) => {
  const rep = db.prepare('SELECT evidence_file, snapshot_json FROM reports WHERE id = ?').get(Number(req.params.id));
  const file = rep && evidencePath(rep.evidence_file);
  if (!file) return res.sendStatus(404);
  let name = 'anexo';
  try { name = JSON.parse(rep.snapshot_json).attachment_name || name; } catch (_) { /* fica "anexo" */ }
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" });
  res.download(file, name, (err) => { if (err && !res.headersSent) res.sendStatus(404); });
});

// ------------------------------------------------------------------ página /admin (mais informações)

const os = require('os');
const logBuffer = require('../logBuffer');
const adminLog = require('../adminLog');
const sfu = require('../sfu/livekit');
const mail = require('../mail');
const turnstile = require('../turnstile');
const { deleteAccount } = require('../accountDeletion');
const ROOT = path.join(__dirname, '..', '..');

function gitCommit() {
  try {
    const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head.slice(0, 8);
    const ref = head.slice(5);
    try { return fs.readFileSync(path.join(ROOT, '.git', ref), 'utf8').trim().slice(0, 8); } catch (_) { /* packed */ }
    const packed = fs.readFileSync(path.join(ROOT, '.git', 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(` ${ref}`));
    return line ? line.slice(0, 8) : null;
  } catch (_) { return null; }
}

function appRelease() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'downloads', 'latest.json'), 'utf8'));
    return { version: j.version, codename: j.codename || null, date: j.pub_date || null };
  } catch (_) { return null; }
}

let sizeCache = { at: 0, data: null };
function folderSizes() {
  if (sizeCache.data && Date.now() - sizeCache.at < 5 * 60 * 1000) return sizeCache.data;
  const up = (d) => dirSizeMB(path.join(ROOT, 'public', 'uploads', d));
  const data = {
    attachments: up('attachments'), avatars: up('avatars'), banners: up('banners'), server: up('server'),
    themes: up('themes'), sounds: up('sounds'), decor: up('decor'),
    evidence: dirSizeMB(path.join(ROOT, 'server', 'reports-evidence')),
  };
  sizeCache = { at: Date.now(), data };
  return data;
}

// GET /api/admin/system — a máquina e o processo
router.get('/system', (req, res) => {
  const dbFile = db.DB_PATH;
  let dbMB = 0;
  for (const f of [dbFile, dbFile + '-wal']) { try { dbMB += fs.statSync(f).size / 1024 / 1024; } catch (_) { /* ok */ } }
  let disk = null;
  try {
    const s = fs.statfsSync(path.dirname(dbFile));
    disk = { totalGB: +(s.blocks * s.bsize / 1e9).toFixed(1), freeGB: +(s.bavail * s.bsize / 1e9).toFixed(1) };
  } catch (_) { /* sem statfs */ }
  const mem = process.memoryUsage();
  res.json({
    host: { load: os.loadavg().map((n) => +n.toFixed(2)), cpus: os.cpus().length, cpuModel: (os.cpus()[0] || {}).model || '',
      memTotalMB: Math.round(os.totalmem() / 1048576), memFreeMB: Math.round(os.freemem() / 1048576),
      uptimeSec: Math.round(os.uptime()), platform: `${os.type()} ${os.release()}`, hostname: os.hostname() },
    process: { uptimeSec: Math.round((Date.now() - startedAt) / 1000), rssMB: Math.round(mem.rss / 1048576),
      heapMB: Math.round(mem.heapUsed / 1048576), node: process.version, pid: process.pid },
    disk,
    storage: { dbMB: +dbMB.toFixed(1), ...folderSizes() },
    services: { mail: mail.configured(), turnstile: turnstile.enabled(), sfu: sfu.isReady(), sfuPorts: sfu.ports },
    version: { commit: gitCommit(), app: appRelease() },
    logs24h: logBuffer.counts(24 * 60 * 60 * 1000),
    uploadDefaults: { maxMB: uploadLimits.DEFAULT_MAX_MB, quotaMB: uploadLimits.DEFAULT_QUOTA_MB },
  });
});

// GET /api/admin/stats?days=30 — números por dia (horário de Brasília)
router.get('/stats', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
  const since = `-${days} days`;
  const perDay = (sql) => Object.fromEntries(db.prepare(sql).all(since).map((r) => [r.d, r.n]));
  const messages = perDay("SELECT date(created_at, '-3 hours') AS d, COUNT(*) AS n FROM messages WHERE created_at >= datetime('now', ?) GROUP BY d");
  const signups = perDay("SELECT date(created_at, '-3 hours') AS d, COUNT(*) AS n FROM users WHERE created_at >= datetime('now', ?) GROUP BY d");
  const active = perDay("SELECT date(created_at, '-3 hours') AS d, COUNT(DISTINCT user_id) AS n FROM messages WHERE user_id IS NOT NULL AND created_at >= datetime('now', ?) GROUP BY d");
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - 3 * 3600 * 1000 - i * 86400 * 1000).toISOString().slice(0, 10);
    out.push({ day: d, messages: messages[d] || 0, signups: signups[d] || 0, active: active[d] || 0 });
  }
  const topServers = db.prepare(`SELECT s.id, s.name, s.icon_url, COUNT(m.id) AS n FROM messages m
    JOIN channels c ON c.id = m.channel_id JOIN servers s ON s.id = c.server_id
    WHERE m.created_at >= datetime('now', '-7 days') GROUP BY s.id ORDER BY n DESC LIMIT 5`).all();
  const topUsers = db.prepare(`SELECT u.id, u.username, u.avatar_url, u.accent_color, COUNT(m.id) AS n FROM messages m
    JOIN users u ON u.id = m.user_id WHERE m.created_at >= datetime('now', '-7 days') GROUP BY u.id ORDER BY n DESC LIMIT 5`).all();
  const totals = db.prepare(`SELECT
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
      (SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL) AS suspended,
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL) AS deleted,
      (SELECT COUNT(*) FROM users WHERE email IS NULL AND deleted_at IS NULL) AS no_email,
      (SELECT COUNT(*) FROM users WHERE totp_enabled = 1 OR twofa_email = 1) AS twofa,
      (SELECT COUNT(*) FROM servers) AS servers,
      (SELECT COUNT(*) FROM channels WHERE server_id IS NULL) AS dms,
      (SELECT COUNT(*) FROM messages) AS messages,
      (SELECT COUNT(*) FROM messages WHERE created_at >= datetime('now', '-1 day')) AS messages24h,
      (SELECT COUNT(*) FROM messages WHERE attachment_url LIKE '/uploads/%') AS attachments,
      (SELECT COUNT(*) FROM reports WHERE status = 'open') AS reports_open`).get();
  res.json({ days: out, topServers, topUsers, totals });
});

// GET /api/admin/live — quem está online e as calls agora
router.get('/live', (req, res) => {
  const online = realtime.onlineUserIds();
  const users = online.length ? db.prepare(`SELECT id, username, avatar_url, accent_color FROM users WHERE id IN (${online.map(() => '?').join(',')})`).all(...online) : [];
  const occ = realtime.voiceOccupancyAll();
  const channelIds = [...new Set(occ.map((o) => o.channelId))];
  const chans = channelIds.length ? db.prepare(`SELECT c.id, c.name, c.server_id, s.name AS server_name FROM channels c LEFT JOIN servers s ON s.id = c.server_id
    WHERE c.id IN (${channelIds.map(() => '?').join(',')})`).all(...channelIds) : [];
  const names = new Map(users.map((u) => [u.id, u.username]));
  const calls = chans.map((c) => ({
    ...c,
    people: occ.filter((o) => o.channelId === c.id).map((o) => (o.userId === realtime.BOT_USER_ID ? 'DJ dusky (bot)' : names.get(o.userId) || `#${o.userId}`)),
  }));
  res.json({
    connections: realtime.connectionCount ? realtime.connectionCount() : null,
    users: users.map((u) => ({ ...u, status: realtime.presenceStatusOf(u.id), activity: realtime.activityOf(u.id) }))
      .sort((a, b) => a.username.localeCompare(b.username)),
    calls,
  });
});

// GET /api/admin/users/:id — tudo sobre uma conta (pra página /admin)
router.get('/users/:id/details', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'usuário não encontrado' });
  const servers = db.prepare(`SELECT s.id, s.name, s.icon_url, (s.owner_id = ?) AS owner, sm.joined_at FROM server_members sm
    JOIN servers s ON s.id = sm.server_id WHERE sm.user_id = ? ORDER BY sm.joined_at`).all(u.id, u.id).map((s) => ({ ...s, owner: !!s.owner }));
  const msg = db.prepare(`SELECT COUNT(*) AS n, MAX(created_at) AS last,
      SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week FROM messages WHERE user_id = ?`).get(u.id);
  const reportsAgainst = db.prepare(`SELECT r.id, r.reason, r.status, r.created_at, rp.username AS reporter FROM reports r
    LEFT JOIN users rp ON rp.id = r.reporter_id WHERE r.target_user_id = ? ORDER BY r.id DESC LIMIT 20`).all(u.id);
  const reportsMade = db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ?').get(u.id).n;
  const l = uploadLimits.limitsFor(u.id);
  res.json({
    user: {
      id: u.id, username: u.username, avatar_url: u.avatar_url, banner_url: u.banner_url, accent_color: u.accent_color,
      bio: u.bio, status_text: u.status_text, created_at: u.created_at, email: u.email, email_pending: u.email_pending,
      email_verified_at: u.email_verified_at, totp: !!u.totp_enabled, email2fa: !!u.twofa_email,
      is_site_admin: !!u.is_site_admin, banned_at: u.banned_at, ban_reason: u.ban_reason, deleted_at: u.deleted_at,
      terms_accepted_at: u.terms_accepted_at, online: realtime.isOnline(u.id), status: realtime.presenceStatusOf(u.id),
      activity: realtime.activityOf(u.id), voice: realtime.voiceChannelOf ? realtime.voiceChannelOf(u.id) : null,
    },
    servers, messages: { total: msg.n, last: msg.last, week: msg.week || 0 },
    reportsAgainst, reportsMade,
    uploads: { usedMB: l.usedMB, maxMB: l.maxMB, quotaMB: l.quotaMB, unlimited: l.unlimited, custom: l.custom },
  });
});

// POST /api/admin/users/:id/logout — derruba todas as sessões (a pessoa entra de novo com a mesma senha)
router.post('/users/:id/logout', loadTarget, (req, res) => {
  db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(req.target.id);
  realtime.disconnectUser(req.target.id);
  realtime.dropUserConnections(req.target.id, { type: 'session_revoked' });
  adminLog.record(req, 'deslogou de todos os aparelhos', { type: 'user', id: req.target.id, name: req.target.username });
  res.json({ ok: true });
});

// POST /api/admin/users/:id/delete { username, deleteMessages } — exclui a conta (mesmo efeito de a
// pessoa excluir). Pede o nome digitado de novo, pra não ser sem querer.
router.post('/users/:id/delete', loadTarget, (req, res) => {
  const body = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.target.id);
  if (user.deleted_at) return res.status(400).json({ error: 'essa conta já foi excluída' });
  if (String(body.username || '') !== user.username) return res.status(400).json({ error: 'o nome não bate' });
  const owned = db.prepare('SELECT name FROM servers WHERE owner_id = ?').all(user.id);
  if (owned.length) return res.status(409).json({ error: `a conta é dona de: ${owned.map((s) => s.name).join(', ')} — apague esses servidores antes` });
  const r = deleteAccount(user, { deleteMessages: !!body.deleteMessages });
  adminLog.record(req, body.deleteMessages ? 'excluiu a conta (e as mensagens)' : 'excluiu a conta', { type: 'user', id: user.id, name: user.username, details: `${r.removedMessages} mensagens apagadas` });
  res.json({ ok: true, ...r });
});

// GET /api/admin/logs?after=&level=&q= — últimas linhas do log do servidor (em memória)
router.get('/logs', (req, res) => {
  res.json(logBuffer.entries({ after: Number(req.query.after) || 0, level: String(req.query.level || ''), q: String(req.query.q || '').slice(0, 100), limit: 800 }));
});

// GET /api/admin/actions — o que os admins fizeram
router.get('/actions', (req, res) => res.json({ actions: adminLog.list() }));

module.exports = router;
