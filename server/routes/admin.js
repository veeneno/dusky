const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');

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
  const dbFile = path.join(__dirname, '..', 'db', 'didiscord.db');
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
      (SELECT COUNT(*) FROM server_members sm WHERE sm.user_id = u.id) AS servers,
      (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS messages,
      (SELECT MAX(created_at) FROM messages m WHERE m.user_id = u.id) AS last_message_at
    FROM users u
    ${q ? 'WHERE u.username LIKE ? COLLATE NOCASE' : ''}
    ORDER BY u.created_at DESC
    LIMIT 500
  `).all(...(q ? [`%${q}%`] : []));
  res.json({ users: rows.map((u) => ({ ...u, is_site_admin: !!u.is_site_admin, online: realtime.isOnline(u.id) })) });
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
  res.json({ ok: true });
});

// POST /api/admin/users/:id/unsuspend
router.post('/users/:id/unsuspend', loadTarget, (req, res) => {
  db.prepare('UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = ?').run(req.target.id);
  res.json({ ok: true });
});

// POST /api/admin/users/:id/reset-password — gera uma senha temporária (mostrada uma vez só) e
// desconecta todas as sessões da conta
router.post('/users/:id/reset-password', loadTarget, async (req, res) => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let temp = '';
  for (const b of bytes) temp += alphabet[b % alphabet.length];
  const hash = await bcrypt.hash(temp, 12);
  db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?').run(hash, req.target.id);
  realtime.disconnectUser(req.target.id);
  realtime.dropUserConnections(req.target.id, { type: 'session_revoked' });
  res.json({ ok: true, temporaryPassword: temp });
});

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
  realtime.sendToUsers(memberIds, { type: 'server_deleted', serverId: server.id });
  res.json({ ok: true });
});

// POST /api/admin/announce { text } — aviso que aparece pra todo mundo conectado agora
router.post('/announce', (req, res) => {
  const text = String((req.body || {}).text || '').trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: 'escreve o aviso' });
  realtime.broadcast({ type: 'site_announcement', text, by: req.user.username });
  res.json({ ok: true, delivered: realtime.onlineUserIds().length });
});

module.exports = router;
