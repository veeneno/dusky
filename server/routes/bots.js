const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// registro estático dos bots do servidor.
// pra adicionar um bot no futuro, basta empurrar um objeto aqui:
// { id: 'meu-bot', name: 'nome do bot', avatar_url: '/uploads/bots/x.png', description: '...' }
const BOTS = [
  {
    id: 'musicbot',
    name: 'DJ didiscord',
    avatar_url: null, // sem avatar customizado ainda — cai no fallback de iniciais da UI
    description: 'toca música na call. comandos: /play /stop /shuffle /volume /queue',
  },
];

// GET /api/bots — lista os bots do servidor
router.get('/', requireAuth, (req, res) => {
  res.json({ bots: BOTS });
});

module.exports = router;
