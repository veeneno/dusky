const express = require('express');
const { requireAuth } = require('../middleware/auth');
const wsTickets = require('../wsTickets');

const router = express.Router();

// GET /api/ws/ticket — gera um ticket de uso único pra autenticar o WebSocket
router.get('/ticket', requireAuth, (req, res) => {
  const ticket = wsTickets.issue(req.user.id, req.session.sv || 0);
  res.json({ ticket });
});

module.exports = router;
