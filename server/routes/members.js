const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');

const router = express.Router();

// GET /api/members — os membros do servidor (no máx. 2) com status online/offline
router.get('/', requireAuth, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, avatar_url, banner_url, accent_color, accent_color_2, bio, status_text FROM users ORDER BY id'
  ).all();

  const members = users.map((u) => ({ ...u, online: realtime.isOnline(u.id), status: realtime.presenceStatusOf(u.id) }));
  res.json({ members });
});

module.exports = router;
