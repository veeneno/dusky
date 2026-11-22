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
    WHERE c.server_id IS NULL AND me.hidden_at IS NULL
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
  if (existing) {
    // abrir de novo uma conversa que eu tinha fechado: ela volta pra minha lista
    db.prepare('UPDATE dm_members SET hidden_at = NULL WHERE channel_id = ? AND user_id = ?').run(existing.id, req.user.id);
    return res.json({ dm: dmForViewer(existing.id, req.user.id) });
  }

  // DM nova: precisa de servidor em comum, e quem foi bloqueado não abre com quem bloqueou
  const denied = access.openDmDenied(req.user.id, targetId);
  if (denied) return res.status(403).json({ error: denied });

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

// POST /api/dms/:id/close — "fechar conversa": some da MINHA lista (a outra pessoa não vê nada
// mudar) até chegar mensagem nova nela ou eu abrir de novo pelo perfil. O histórico fica.
// Fica guardado por pessoa em dm_members.hidden_at; quem limpa é publishNewMessage
// (routes/messages.js) e o POST /api/dms acima.
router.post('/:id/close', requireAuth, (req, res) => {
  const channelId = Number(req.params.id);
  const ch = channelId ? access.canAccessChannel(channelId, req.user.id) : null;
  if (!ch || ch.server_id != null) return res.status(404).json({ error: 'conversa não encontrada' });
  db.prepare("UPDATE dm_members SET hidden_at = datetime('now') WHERE channel_id = ? AND user_id = ?").run(channelId, req.user.id);
  // minhas outras abas tiram a conversa da lista também
  realtime.sendToUsers([req.user.id], { type: 'dm_closed', channelId });
  res.json({ ok: true });
});

module.exports = router;
module.exports.dmForViewer = dmForViewer;
