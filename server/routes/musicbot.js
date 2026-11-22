const express = require('express');
const { asyncRoute } = require('../asyncRoute');
const { requireAuth } = require('../middleware/auth');
const stream = require('../bots/musicBot/stream');
const queue = require('../bots/musicBot/queue');
const resolve = require('../bots/musicBot/resolve');
const access = require('../access');

const router = express.Router();

// cada servidor tem o seu bot/stream — ?server=<id> diz qual, e só membros dele podem ouvir
function serverParam(req, res) {
  const serverId = Number(req.query.server);
  if (!serverId || !access.isServerMember(serverId, req.user.id)) {
    res.status(404).json({ error: 'servidor não encontrado' });
    return null;
  }
  return serverId;
}

// GET /api/musicbot/stream?server=<id> — áudio ao vivo do bot desse servidor (mp3), tipo rádio.
// Quem conecta no meio recebe os últimos segundos de uma vez (ver stream.js) pra começar a tocar
// na hora. A conexão fica aberta indefinidamente (chunked, sem Content-Length).
router.get('/stream', requireAuth, (req, res) => {
  const serverId = serverParam(req, res);
  if (serverId == null) return;
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // se tiver um proxy na frente, não segurar o áudio em buffer
  });
  if (res.socket) res.socket.setNoDelay(true);
  stream.addListener(serverId, res);
  req.on('close', () => stream.removeListener(serverId, res));
});

// GET /api/musicbot/state?server=<id> — volume atual e o que está tocando nesse servidor
router.get('/state', requireAuth, (req, res) => {
  const serverId = serverParam(req, res);
  if (serverId == null) return;
  res.json(queue.snapshot(serverId));
});

// GET /api/musicbot/search?q=... — 5 primeiros resultados do YouTube pro autocompletar do /play
router.get('/search', requireAuth, asyncRoute(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (q.length < 2 || /^https?:\/\//i.test(q)) return res.json({ results: [] }); // link não precisa de sugestão
  try {
    res.json({ results: await resolve.suggestYoutube(q, 5) });
  } catch (err) {
    res.status(502).json({ error: err.message, results: [] });
  }
}));

module.exports = router;
