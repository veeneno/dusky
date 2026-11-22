const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const limits = require('../limits');

// bloquear alguém (igual ao Discord). As regras do que muda ficam em server/access.js (hasBlocked,
// dmBlockState, openDmDenied); aqui só guarda e lista. Quem foi bloqueado não fica sabendo: nenhum
// evento vai pra ele.
const router = express.Router();
const blockLimit = limits.perUser('block', 60, 10 * 60 * 1000, 'muitos bloqueios seguidos — espera uns minutos');

// minhas outras abas/aparelhos atualizam a lista (mensagens recolhidas, botão do perfil)
function notifyMine(userId) {
  realtime.sendToUsers([userId], { type: 'blocks_updated', blockedIds: access.blockedIds(userId) });
}

// GET /api/blocks — quem eu bloqueei (com o perfil público, pra aba "bloqueados" das configurações)
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT blocked_id, created_at FROM user_blocks WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const users = rows.map((r) => {
    const u = access.getUser(r.blocked_id);
    return u ? { ...u, blocked_at: r.created_at } : null;
  }).filter(Boolean);
  res.json({ blockedIds: rows.map((r) => r.blocked_id), users });
});

// PUT /api/blocks/:userId — bloquear
router.put('/:userId', requireAuth, blockLimit, (req, res) => {
  const targetId = Number(req.params.userId);
  if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'você não pode bloquear você mesmo' });
  if (!access.getUser(targetId)) return res.status(404).json({ error: 'usuário não encontrado' });
  db.prepare('INSERT OR IGNORE INTO user_blocks (user_id, blocked_id) VALUES (?, ?)').run(req.user.id, targetId);
  notifyMine(req.user.id);
  res.json({ ok: true, blockedIds: access.blockedIds(req.user.id) });
});

// DELETE /api/blocks/:userId — desbloquear
router.delete('/:userId', requireAuth, blockLimit, (req, res) => {
  const targetId = Number(req.params.userId);
  if (!targetId) return res.status(400).json({ error: 'usuário inválido' });
  db.prepare('DELETE FROM user_blocks WHERE user_id = ? AND blocked_id = ?').run(req.user.id, targetId);
  notifyMine(req.user.id);
  res.json({ ok: true, blockedIds: access.blockedIds(req.user.id) });
});

module.exports = router;
