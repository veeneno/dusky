const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');

const router = express.Router();

// uma DM é um canal de texto sem servidor (server_id NULL) com exatamente 2 linhas em dm_members.
// Assim todo o resto (enviar/apagar mensagem, anexo, gif, resposta) reaproveita as mesmas rotas
// de /api/channels/:id/messages, só com a checagem de acesso olhando dm_members.

function dmForViewer(channelId, viewerId) {
  const row = db.prepare(`
    SELECT c.id, c.created_at, other.user_id AS other_id,
           (SELECT MAX(m.created_at) FROM messages m WHERE m.channel_id = c.id) AS last_message_at
    FROM channels c
    JOIN dm_members me ON me.channel_id = c.id AND me.user_id = ?
    JOIN dm_members other ON other.channel_id = c.id AND other.user_id != ?
    WHERE c.id = ? AND c.server_id IS NULL
  `).get(viewerId, viewerId, channelId);
  return row ? decorate(row) : null;
}

function decorate(row) {
  const user = access.getUser(row.other_id);
  return {
    id: row.id,
    created_at: row.created_at,
    last_message_at: row.last_message_at,
    user: user ? { ...user, online: realtime.isOnline(user.id), status: realtime.presenceStatusOf(user.id) } : null,
  };
}

// GET /api/dms — minhas conversas, a mais recente primeiro
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.created_at, other.user_id AS other_id,
           (SELECT MAX(m.created_at) FROM messages m WHERE m.channel_id = c.id) AS last_message_at
    FROM channels c
    JOIN dm_members me ON me.channel_id = c.id AND me.user_id = ?
    JOIN dm_members other ON other.channel_id = c.id AND other.user_id != ?
    WHERE c.server_id IS NULL
    ORDER BY COALESCE(last_message_at, c.created_at) DESC
  `).all(req.user.id, req.user.id);
  res.json({ dms: rows.map(decorate).filter((d) => d.user) });
});

// POST /api/dms { user_id } — abre (ou reaproveita) a conversa com alguém. Só dá pra puxar DM
// com quem divide pelo menos um servidor com você (ou com quem você já tem conversa) — evita
// que qualquer conta aleatória do site mande mensagem pra qualquer outra.
router.post('/', requireAuth, (req, res) => {
  const targetId = Number((req.body || {}).user_id);
  if (!targetId || targetId === req.user.id) {
    return res.status(400).json({ error: 'escolha outra pessoa pra conversar' });
  }
  const target = access.getUser(targetId);
  if (!target) return res.status(404).json({ error: 'usuário não encontrado' });

  const existing = db.prepare(`
    SELECT a.channel_id AS id FROM dm_members a
    JOIN dm_members b ON b.channel_id = a.channel_id
    JOIN channels c ON c.id = a.channel_id AND c.server_id IS NULL
    WHERE a.user_id = ? AND b.user_id = ?
    LIMIT 1
  `).get(req.user.id, targetId);
  if (existing) return res.json({ dm: dmForViewer(existing.id, req.user.id) });

  if (!access.sharesServer(req.user.id, targetId)) {
    return res.status(403).json({ error: 'vocês precisam estar em algum servidor em comum pra conversar' });
  }

  const channelId = db.transaction(() => {
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO channels (name, type, position, created_by, server_id) VALUES ('dm', 'text', 0, ?, NULL)"
    ).run(req.user.id);
    const add = db.prepare('INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?)');
    add.run(lastInsertRowid, req.user.id);
    add.run(lastInsertRowid, targetId);
    return lastInsertRowid;
  })();

  const dm = dmForViewer(channelId, req.user.id);
  // outras abas minhas já mostram a conversa; a outra pessoa só vê quando chegar a 1ª mensagem
  realtime.sendToUsers([req.user.id], { type: 'dm_created', dm });
  res.status(201).json({ dm });
});

module.exports = router;
module.exports.dmForViewer = dmForViewer;
