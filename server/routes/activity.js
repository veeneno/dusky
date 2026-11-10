// não lidas (com contagem de menções) e busca de mensagens
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const access = require('../access');
const realtime = require('../realtime');
const extras = require('../chatExtras');
const { MESSAGE_COLUMNS } = require('../db/messageQueries');

const router = express.Router();

// GET /api/unread — canais (de servidor e DMs) com mensagem que eu ainda não li:
//   [{ channel_id, server_id, last_message_id, last_read_id, mentions }]
// `mentions` = quantas das não lidas me mencionam (ou @everyone). Em DM, toda mensagem conta.
router.get('/unread', requireAuth, (req, res) => {
  const me = req.user.id;
  const rows = db.prepare(`
    SELECT c.id, c.server_id, c.type, c.private_view,
           (SELECT MAX(m.id) FROM messages m WHERE m.channel_id = c.id) AS last_id,
           COALESCE(r.last_read_id, 0) AS last_read
    FROM channels c
    JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = ?
    LEFT JOIN channel_reads r ON r.channel_id = c.id AND r.user_id = ?
    WHERE c.type = 'text'
    UNION ALL
    SELECT c.id, NULL, c.type, 0,
           (SELECT MAX(m.id) FROM messages m WHERE m.channel_id = c.id),
           COALESCE(r.last_read_id, 0)
    FROM channels c
    JOIN dm_members dm ON dm.channel_id = c.id AND dm.user_id = ?
    LEFT JOIN channel_reads r ON r.channel_id = c.id AND r.user_id = ?
    WHERE c.server_id IS NULL
  `).all(me, me, me, me);

  const mentionCount = db.prepare(`
    SELECT COUNT(DISTINCT mm.message_id) AS c FROM message_mentions mm JOIN messages m ON m.id = mm.message_id
    WHERE m.channel_id = ? AND m.id > ? AND mm.user_id IN (?, ${extras.EVERYONE_ID}) AND (m.user_id IS NULL OR m.user_id != ?)
  `);
  const dmCount = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE channel_id = ? AND id > ? AND (user_id IS NULL OR user_id != ?)');
  const othersSince = db.prepare('SELECT 1 FROM messages WHERE channel_id = ? AND id > ? AND (user_id IS NULL OR user_id != ?) LIMIT 1');

  const out = [];
  for (const r of rows) {
    if (!r.last_id || r.last_id <= r.last_read) continue;
    if (r.server_id != null && r.private_view && !access.canAccessChannel(r.id, me)) continue;
    // só as minhas mensagens depois do ponto lido não deixam o canal "não lido"
    if (!othersSince.get(r.id, r.last_read, me)) continue;
    const mentions = r.server_id == null ? dmCount.get(r.id, r.last_read, me).c : mentionCount.get(r.id, r.last_read, me, me).c;
    out.push({ channel_id: r.id, server_id: r.server_id, last_message_id: r.last_id, last_read_id: r.last_read, mentions });
  }
  res.json({ unread: out });
});

// POST /api/unread/:channelId/read { message_id? } — li até aqui (sem message_id = até a última)
router.post('/unread/:channelId/read', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  if (!access.canAccessChannel(channelId, req.user.id)) return res.status(404).json({ error: 'canal não encontrado' });
  const last = extras.lastMessageId(channelId);
  const wanted = Number((req.body || {}).message_id) || last;
  const lastRead = extras.markRead(req.user.id, channelId, Math.min(wanted, last));
  // as outras abas/o app da mesma pessoa tiram o aviso também
  realtime.sendToUsers([req.user.id], { type: 'read_state', channelId, lastReadId: lastRead });
  res.json({ last_read_id: lastRead });
});

// GET /api/search?q=...&server_id=<id> | &channel_id=<id>  [&author_id=<id>] [&offset=0]
// Busca nas mensagens que eu consigo ver: num servidor inteiro, ou num canal/DM específico.
// Sem diferença de acento/maiúscula; cada palavra vale também como começo ("piz" acha "pizza").
const PAGE = 25;

function ftsQuery(q) {
  const words = String(q || '').normalize('NFC').match(/[\p{L}\p{N}_]+/gu) || [];
  return words.slice(0, 8).map((w) => `"${w.replace(/"/g, '')}"*`).join(' ');
}

router.get('/search', requireAuth, (req, res) => {
  const me = req.user.id;
  const match = ftsQuery(req.query.q);
  const authorId = Number(req.query.author_id) || null;
  if (!match && !authorId) return res.status(400).json({ error: 'escreve o que procurar' });

  let channelIds = [];
  const channelId = Number(req.query.channel_id) || null;
  const serverId = Number(req.query.server_id) || null;
  if (channelId) {
    if (!access.canAccessChannel(channelId, me)) return res.status(404).json({ error: 'canal não encontrado' });
    channelIds = [channelId];
  } else if (serverId) {
    if (!access.isServerMember(serverId, me)) return res.status(404).json({ error: 'servidor não encontrado' });
    channelIds = db.prepare("SELECT id FROM channels WHERE server_id = ? AND type = 'text'").all(serverId)
      .map((c) => c.id).filter((id) => access.canAccessChannel(id, me));
  } else {
    return res.status(400).json({ error: 'diz onde procurar (servidor ou canal)' });
  }
  if (!channelIds.length) return res.json({ messages: [], total: 0 });

  const offset = Math.max(0, Number(req.query.offset) || 0);
  const where = [`m.channel_id IN (${channelIds.map(() => '?').join(',')})`];
  const params = [...channelIds];
  if (match) { where.push('m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)'); params.push(match); }
  if (authorId) { where.push('m.user_id = ?'); params.push(authorId); }

  try {
    const total = db.prepare(`SELECT COUNT(*) AS c FROM messages m WHERE ${where.join(' AND ')}`).get(...params).c;
    const rows = db.prepare(`${MESSAGE_COLUMNS} WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT ? OFFSET ?`).all(...params, PAGE, offset);
    const names = new Map(db.prepare(`SELECT id, name FROM channels WHERE id IN (${channelIds.map(() => '?').join(',')})`).all(...channelIds).map((c) => [c.id, c.name]));
    for (const r of rows) r.channel_name = names.get(r.channel_id) || null;
    res.json({ messages: extras.decorateMessages(rows), total, offset, page_size: PAGE, terms: (String(req.query.q || '').match(/[\p{L}\p{N}_]+/gu) || []).slice(0, 8) });
  } catch (err) {
    res.status(400).json({ error: 'não entendi essa busca' });
  }
});

module.exports = router;
