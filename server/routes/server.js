const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const { serverIconUpload } = require('../upload');

const router = express.Router();

function getSettings() {
  return db.prepare('SELECT name, icon_url FROM server_settings WHERE id = 1').get();
}

// GET /api/server — nome e ícone do "servidor" (sempre uma única linha fixa)
router.get('/', requireAuth, (req, res) => {
  res.json({ server: getSettings() });
});

// PATCH /api/server — troca o nome exibido no topo da sidebar
router.patch('/', requireAuth, (req, res) => {
  const { name } = req.body || {};
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 40) : '';
  if (!cleanName) return res.status(400).json({ error: 'dá um nome pro servidor' });

  db.prepare('UPDATE server_settings SET name = ? WHERE id = 1').run(cleanName);

  const server = getSettings();
  realtime.broadcast({ type: 'server_updated', server });
  res.json({ server });
});

// POST /api/server/icon — troca o ícone (qualquer um dos dois pode trocar)
router.post('/icon', requireAuth, (req, res) => {
  serverIconUpload.single('icon')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'não deu pra enviar essa imagem (máx. 15MB)' });
    if (!req.file) return res.status(400).json({ error: 'arquivo inválido' });

    const previous = getSettings();
    const iconUrl = `/uploads/server/${req.file.filename}`;
    db.prepare('UPDATE server_settings SET icon_url = ? WHERE id = 1').run(iconUrl);

    // limpa o ícone antigo do disco, se tinha um
    if (previous.icon_url && previous.icon_url.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '..', '..', 'public', previous.icon_url), () => {});
    }

    const server = getSettings();
    realtime.broadcast({ type: 'server_updated', server });
    res.json({ server });
  });
});

module.exports = router;
