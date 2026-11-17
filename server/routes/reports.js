const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const access = require('../access');
const limits = require('../limits');
const realtime = require('../realtime');
const mail = require('../mail');
const { REASONS, keepEvidence, siteAdmins } = require('../reports');

const router = express.Router();
const HOUR = 60 * 60 * 1000;

// GET /api/reports/reasons — motivos (pro formulário)
router.get('/reasons', requireAuth, (req, res) => res.json({ reasons: REASONS }));

// POST /api/reports { messageId | userId, reason, details? }
router.post('/', requireAuth, (req, res) => {
  const body = req.body || {};
  const reason = String(body.reason || '');
  if (!REASONS[reason]) return res.status(400).json({ error: 'escolha um motivo' });
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, 1000) : '';
  if (limits.hit('report', `u${req.user.id}`, 15, HOUR)) {
    return res.status(429).json({ error: 'muitas denúncias seguidas — espera um pouco' });
  }

  let target = null;
  if (body.messageId != null) {
    const id = Number(body.messageId);
    const m = Number.isInteger(id) ? db.prepare(`
      SELECT m.id, m.channel_id, m.user_id, m.bot_name, m.content, m.attachment_url, m.attachment_name,
             m.attachment_type, m.created_at, c.server_id, u.username
      FROM messages m JOIN channels c ON c.id = m.channel_id LEFT JOIN users u ON u.id = m.user_id
      WHERE m.id = ?`).get(id) : null;
    if (!m || !access.canAccessChannel(m.channel_id, req.user.id)) return res.status(404).json({ error: 'mensagem não encontrada' });
    if (m.user_id === req.user.id) return res.status(400).json({ error: 'não dá pra denunciar a própria mensagem' });
    if (!m.user_id) return res.status(400).json({ error: 'mensagens de bot não podem ser denunciadas' });
    target = {
      userId: m.user_id, messageId: m.id, channelId: m.channel_id, serverId: m.server_id,
      snapshot: { author: m.username, content: m.content, attachment_url: m.attachment_url, attachment_name: m.attachment_name, attachment_type: m.attachment_type, created_at: m.created_at },
      attachmentUrl: m.attachment_url,
    };
  } else if (body.userId != null) {
    const uid = Number(body.userId);
    const u = Number.isInteger(uid) ? db.prepare('SELECT id, username, bio, status_text, avatar_url, banner_url FROM users WHERE id = ?').get(uid) : null;
    if (!u || !access.relatedUserIds(req.user.id).includes(u.id)) return res.status(404).json({ error: 'pessoa não encontrada' });
    if (u.id === req.user.id) return res.status(400).json({ error: 'não dá pra denunciar a si mesmo' });
    target = { userId: u.id, snapshot: { username: u.username, bio: u.bio, status_text: u.status_text, avatar_url: u.avatar_url, banner_url: u.banner_url } };
  } else {
    return res.status(400).json({ error: 'denunciar o quê?' });
  }

  // a mesma pessoa denunciando a mesma coisa de novo (ainda aberta): não duplica
  const dup = db.prepare(`SELECT id FROM reports WHERE reporter_id = ? AND status = 'open'
    AND target_user_id IS ? AND message_id IS ?`).get(req.user.id, target.userId, target.messageId ?? null);
  if (dup) return res.json({ ok: true, duplicate: true });

  const r = db.prepare(`INSERT INTO reports (reporter_id, target_user_id, message_id, channel_id, server_id, reason, details, snapshot_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(req.user.id, target.userId, target.messageId ?? null, target.channelId ?? null,
    target.serverId ?? null, reason, details || null, JSON.stringify(target.snapshot));
  const evidence = keepEvidence(r.lastInsertRowid, target.attachmentUrl);
  if (evidence) db.prepare('UPDATE reports SET evidence_file = ? WHERE id = ?').run(evidence, r.lastInsertRowid);

  const admins = siteAdmins();
  realtime.sendToUsers(admins.map((a) => a.id), { type: 'report_new', reason: REASONS[reason] });
  for (const a of admins) {
    if (!a.email) continue;
    Promise.resolve(mail.sendNotice(a.email, `nova denúncia: ${REASONS[reason]}`,
      `Chegou uma denúncia (${REASONS[reason]}) contra ${target.snapshot.author || target.snapshot.username}. Abra o painel de admin do dusky, aba "denúncias", pra ver.`, a.username)).catch(() => {});
  }
  res.status(201).json({ ok: true });
});

module.exports = router;
