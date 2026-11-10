const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');

const router = express.Router();

const CHANNEL_NAME_MAX = 40;

// listar e criar canais é por servidor: GET/POST /api/servers/:id/channels (routes/servers.js)

// GET /api/channels/voice-state — quem está em qual canal de voz agora, nos canais que eu consigo
// ver (pra pré-visualização na sidebar, mesmo em canais que não estou ocupando)
router.get('/voice-state', requireAuth, (req, res) => {
  res.json({ occupancy: realtime.voiceOccupancy(req.user.id) });
});

// carrega um canal de servidor e exige que quem pediu seja administrador dele
function loadAdminChannel(req, res, next) {
  const id = Number(req.params.id);
  const channel = access.canAccessChannel(id, req.user.id);
  if (!channel || channel.server_id == null) {
    return res.status(404).json({ error: 'canal não encontrado' });
  }
  if (!access.isServerAdmin(channel.server_id, req.user.id)) {
    return res.status(403).json({ error: 'só administradores podem mexer nos canais' });
  }
  req.channel = channel;
  next();
}

// PATCH /api/channels/:id — editar canal (administradores)
// body (tudo opcional):
//   name
//   private_view: true/false      — só alguns cargos veem o canal
//   view_role_ids: [ids]          — quais cargos veem (quando private_view)
//   private_connect: true/false   — (voz) só alguns cargos entram na call
//   connect_role_ids: [ids]       — quais cargos entram (quando private_connect)
router.patch('/:id', requireAuth, loadAdminChannel, (req, res) => {
  const ch = req.channel;
  const body = req.body || {};

  if (body.name !== undefined) {
    let name = typeof body.name === 'string' ? body.name.trim().slice(0, CHANNEL_NAME_MAX) : '';
    if (ch.type === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
    if (!name) return res.status(400).json({ error: 'nome do canal é obrigatório' });
    db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, ch.id);
  }

  const validRoleIds = new Set(
    db.prepare('SELECT id FROM roles WHERE server_id = ?').all(ch.server_id).map((r) => r.id)
  );
  const cleanIds = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number))].filter((id) => validRoleIds.has(id));

  db.transaction(() => {
    if (body.private_view !== undefined) {
      db.prepare('UPDATE channels SET private_view = ? WHERE id = ?').run(body.private_view ? 1 : 0, ch.id);
    }
    if (body.private_connect !== undefined && ch.type === 'voice') {
      db.prepare('UPDATE channels SET private_connect = ? WHERE id = ?').run(body.private_connect ? 1 : 0, ch.id);
    }
    if (body.view_role_ids !== undefined || body.connect_role_ids !== undefined) {
      const current = db.prepare('SELECT role_id, can_view, can_connect FROM channel_role_access WHERE channel_id = ?').all(ch.id);
      const view = body.view_role_ids !== undefined
        ? new Set(cleanIds(body.view_role_ids))
        : new Set(current.filter((r) => r.can_view).map((r) => r.role_id));
      const connect = body.connect_role_ids !== undefined
        ? new Set(cleanIds(body.connect_role_ids))
        : new Set(current.filter((r) => r.can_connect).map((r) => r.role_id));
      db.prepare('DELETE FROM channel_role_access WHERE channel_id = ?').run(ch.id);
      const insert = db.prepare('INSERT INTO channel_role_access (channel_id, role_id, can_view, can_connect) VALUES (?, ?, ?, ?)');
      for (const roleId of new Set([...view, ...connect])) {
        insert.run(ch.id, roleId, view.has(roleId) ? 1 : 0, connect.has(roleId) ? 1 : 0);
      }
    }
  })();

  // cada um recarrega a própria lista de canais (quem perdeu acesso para de ver; quem ganhou passa
  // a ver), e quem está numa call que ficou proibida pra ele cai dela
  realtime.broadcastToServer(ch.server_id, { type: 'channels_updated', serverId: ch.server_id });
  realtime.enforceVoicePermissions(ch.server_id);
  res.json({ ok: true });
});

// DELETE /api/channels/:id — remove um canal de servidor (e suas mensagens, via cascade). Administradores.
router.delete('/:id', requireAuth, loadAdminChannel, (req, res) => {
  const ch = req.channel;
  realtime.kickFromChannelVoice(ch.id);
  db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
  realtime.broadcastToServer(ch.server_id, { type: 'channel_deleted', serverId: ch.server_id, channelId: ch.id });
  res.json({ ok: true });
});

module.exports = router;
