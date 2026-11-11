const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const push = require('../push');
router.use(requireAuth);
router.get('/key', (req, res) => {
  const keys = push.getKeys();
  if (!keys) return res.status(503).json({ error: 'notificações com o site fechado estão desligadas neste servidor' });
  res.json({ publicKey: keys.publicKey });
});
router.post('/subscription', (req, res) => {
  const { subscription, level } = req.body || {};
  try {
    const url = new URL(subscription.endpoint);
    // Somente provedores conhecidos: endpoint arbitrário viraria uma requisição SSRF.
    const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com'];
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !allowed.includes(url.hostname)) throw Error();
    if (subscription.endpoint.length > 2048 || !/^[A-Za-z0-9_-]{87}=?$/.test(subscription.keys.p256dh) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(subscription.keys.auth)) throw Error();
    if (!['mentions', 'all', 'none'].includes(level)) throw Error();
  } catch (_) { return res.status(400).json({ error: 'assinatura push inválida ou provedor não suportado' }); }
  const count = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(req.user.id).n;
  if (count >= 20 && !db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(subscription.endpoint)) return res.status(400).json({ error: 'limite de aparelhos atingido' });
  db.prepare(`INSERT INTO push_subscriptions (endpoint, user_id, subscription, level, session_version) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, subscription=excluded.subscription, level=excluded.level, session_version=excluded.session_version`)
    .run(subscription.endpoint, req.user.id, JSON.stringify(subscription), level, req.session.sv || 0);
  res.json({ ok: true });
});
router.delete('/subscription', (req, res) => {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(String(req.body.endpoint || ''), req.user.id);
  res.json({ ok: true });
});
router.get('/message/:id', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const message = db.prepare(`SELECT m.*, c.server_id, c.name AS channel_name, u.username FROM messages m
    JOIN channels c ON c.id = m.channel_id LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?`).get(Number(req.params.id));
  const sub = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').get(req.user.id, String(req.query.endpoint || ''));
  if (!message || !sub || !push.eligible(sub, message)) return res.sendStatus(404);
  // no texto salvo, menção é <@id>: na notificação vira @nome, como no chat
  const names = db.prepare('SELECT username FROM users WHERE id = ?');
  const content = String(message.content || '').replace(/<@(\d{1,10})>/g, (all, id) => {
    const mentioned = names.get(Number(id));
    return mentioned ? '@' + mentioned.username : '@alguém';
  }).replace(/\s+/g, ' ').trim();
  const author = message.username || message.bot_name || 'didiscord'; // mensagem de bot não tem usuário
  res.json({ title: author + (message.server_id == null ? ' · mensagem direta' : ' · #' + message.channel_name),
    body: (content || (message.attachment_url ? 'enviou um anexo' : 'nova mensagem')).slice(0, 220),
    channelId: message.channel_id, serverId: message.server_id, messageId: message.id, userId: req.user.id });
});
module.exports = router;
