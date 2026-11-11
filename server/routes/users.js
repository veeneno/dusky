const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');

const router = express.Router();

// GET /api/users/contacts — todo mundo que divide algum servidor comigo (pra "nova conversa")
router.get('/contacts', requireAuth, (req, res) => {
  const cols = access.PUBLIC_USER_COLUMNS.split(', ').map((c) => 'u.' + c).join(', ');
  const rows = db.prepare(`
    SELECT DISTINCT ${cols} FROM users u
    JOIN server_members theirs ON theirs.user_id = u.id
    JOIN server_members mine ON mine.server_id = theirs.server_id AND mine.user_id = ?
    WHERE u.id != ?
    ORDER BY u.username COLLATE NOCASE
  `).all(req.user.id, req.user.id);
  res.json({ users: rows.map((u) => ({ ...u, online: realtime.isOnline(u.id) })) });
});

// GET /api/users/:id — perfil completo de alguém (pro cartão de perfil). Só de quem divide
// servidor ou DM comigo — o resto responde 404, igual usuário inexistente.
router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const isSelf = id === req.user.id;
  if (!isSelf && !access.sharesServer(req.user.id, id) && !access.sharesDm(req.user.id, id)) {
    return res.status(404).json({ error: 'usuário não encontrado' });
  }
  const user = access.getUser(id);
  if (!user) return res.status(404).json({ error: 'usuário não encontrado' });

  res.json({
    user: {
      ...user,
      online: realtime.isOnline(user.id),
      activity: realtime.activityOf(user.id),
      mutual_servers: isSelf ? [] : access.mutualServers(req.user.id, id),
    },
  });
});

module.exports = router;
