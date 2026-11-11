const router = require('express').Router({ mergeParams: true });
const db = require('../db');
const access = require('../access');
const realtime = require('../realtime');
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth, (req, res, next) => {
  req.sid = Number(req.params.serverId);
  if (!access.isServerMember(req.sid, req.user.id)) return res.sendStatus(404);
  if (!access.hasServerPermission(req.sid, req.user.id, 'manage_channels')) return res.sendStatus(403);
  next();
});
function changed(req) { realtime.broadcastToServer(req.sid, { type: 'channels_updated', serverId: req.sid }); }
router.post('/', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
  if (!name) return res.status(400).json({ error: 'dê um nome para a categoria' });
  if (req.body.position !== undefined && (!Number.isSafeInteger(req.body.position) || req.body.position < 0)) return res.status(400).json({ error: 'posição inválida' });
  const pos = req.body.position ?? db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM channel_categories WHERE server_id = ?').get(req.sid).p;
  const result = db.prepare('INSERT INTO channel_categories (server_id, name, position) VALUES (?, ?, ?)').run(req.sid, name, pos);
  changed(req); res.status(201).json({ id: Number(result.lastInsertRowid) });
});
router.patch('/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM channel_categories WHERE id = ? AND server_id = ?').get(Number(req.params.id), req.sid);
  if (!cat) return res.sendStatus(404);
  const name = req.body.name === undefined ? cat.name : (typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 40) : '');
  const position = req.body.position === undefined ? cat.position : req.body.position;
  if (!name || !Number.isSafeInteger(position) || position < 0) return res.status(400).json({ error: 'nome ou posição inválida' });
  db.prepare('UPDATE channel_categories SET name = ?, position = ? WHERE id = ?').run(name, position, cat.id);
  changed(req); res.json({ ok: true });
});
router.delete('/:id', (req, res) => {
  // ON DELETE SET NULL conserva os canais e seu histórico.
  const result = db.prepare('DELETE FROM channel_categories WHERE id = ? AND server_id = ?').run(Number(req.params.id), req.sid);
  if (!result.changes) return res.sendStatus(404);
  changed(req); res.json({ ok: true });
});
module.exports = router;
