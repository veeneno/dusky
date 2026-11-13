const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const audit = require('../audit');

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
  if (!access.hasServerPermission(channel.server_id, req.user.id, 'manage_channels')) {
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

  const sets = [], values = [];
  if (body.name !== undefined) {
    let name = typeof body.name === 'string' ? body.name.trim().slice(0, CHANNEL_NAME_MAX) : '';
    if (ch.type === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
    if (!name) return res.status(400).json({ error: 'nome do canal é obrigatório' });
    sets.push('name = ?'); values.push(name);
  }
  if (body.category_id !== undefined) {
    const id = body.category_id === null ? null : Number(body.category_id);
    if (id !== null && !db.prepare('SELECT 1 FROM channel_categories WHERE id = ? AND server_id = ?').get(id, ch.server_id)) return res.status(400).json({ error: 'categoria inválida' });
    sets.push('category_id = ?'); values.push(id);
  }
  if (body.position !== undefined) {
    if (!Number.isSafeInteger(body.position) || body.position < 0) return res.status(400).json({ error: 'posição inválida' });
    sets.push('position = ?'); values.push(body.position);
  }
  const actions = ['view', 'connect', 'send', 'attach', 'react', 'pin'];
  const valid = new Set(db.prepare('SELECT id FROM roles WHERE server_id = ?').all(ch.server_id).map(r => r.id));
  for (const key of actions) {
    if (body['private_' + key] !== undefined) {
      if (typeof body['private_' + key] !== 'boolean') return res.status(400).json({ error: 'permissão inválida' });
      sets.push('private_' + key + ' = ?'); values.push(body['private_' + key] ? 1 : 0);
    }
    const ids = body[key + '_role_ids'];
    if (ids !== undefined && (!Array.isArray(ids) || ids.some(id => !valid.has(id)))) return res.status(400).json({ error: 'cargo inválido' });
  }
  db.transaction(() => {
    if (sets.length) db.prepare('UPDATE channels SET ' + sets.join(', ') + ' WHERE id = ?').run(...values, ch.id);
    for (const key of actions) {
      const ids = body[key + '_role_ids'];
      if (ids === undefined) continue;
      db.prepare('UPDATE channel_role_access SET can_' + key + ' = 0 WHERE channel_id = ?').run(ch.id);
      const grant = db.prepare('INSERT INTO channel_role_access (channel_id, role_id, can_' + key + ') VALUES (?, ?, 1) ON CONFLICT(channel_id, role_id) DO UPDATE SET can_' + key + ' = 1');
      for (const id of new Set(ids)) grant.run(ch.id, id);
    }
  })();

  // cada um recarrega a própria lista de canais (quem perdeu acesso para de ver; quem ganhou passa
  // a ver), e quem está numa call que ficou proibida pra ele cai dela
  realtime.broadcastToServer(ch.server_id, { type: 'channels_updated', serverId: ch.server_id });
  realtime.enforceVoicePermissions(ch.server_id);
  const changed = Object.keys(body).filter((k) => k === 'name' || k === 'category_id' || k.startsWith('private_') || k.endsWith('_role_ids'));
  if (changed.length) audit.log(ch.server_id, req.user.id, 'channel_update', { type: 'channel', id: ch.id, name: ch.name }, { changed });
  res.json({ ok: true });
});

// DELETE /api/channels/:id — remove um canal de servidor (e suas mensagens, via cascade). Administradores.
router.delete('/:id', requireAuth, loadAdminChannel, (req, res) => {
  const ch = req.channel;
  realtime.kickFromChannelVoice(ch.id);
  db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
  realtime.broadcastToServer(ch.server_id, { type: 'channel_deleted', serverId: ch.server_id, channelId: ch.id });
  audit.log(ch.server_id, req.user.id, 'channel_delete', { type: 'channel', id: ch.id, name: ch.name }, { channel_type: ch.type });
  res.json({ ok: true });
});

module.exports = router;
