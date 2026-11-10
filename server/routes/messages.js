const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const { attachmentUpload, attachmentTypeOf } = require('../upload');
const { MESSAGE_COLUMNS, MESSAGE_SELECT_BY_ID } = require('../db/messageQueries');
const musicBot = require('../bots/musicBot');

// mergeParams pra ter acesso a :channelId, já que é montado como sub-rota
const router = express.Router({ mergeParams: true });

const MESSAGE_SELECT = MESSAGE_SELECT_BY_ID;

// canal só "existe" pra quem pode vê-lo (membro do servidor ou participante da DM) — pra quem
// não pode, responde 404 igual canal inexistente, sem revelar que ele existe
function getChannel(channelId, userId) {
  return access.canAccessChannel(channelId, userId);
}

// GET /api/channels/:channelId/messages — histórico em páginas (mais recentes por último)
//   ?limit=50          quantas mensagens (máx. 100)
//   ?before=<id>       só as anteriores a essa mensagem — é assim que o chat carrega o histórico
//                      antigo quando a pessoa rola pro topo
// devolve has_more: ainda existem mensagens mais antigas que essas?
router.get('/', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const before = Number(req.query.before) || null;

  // busca uma a mais que o pedido só pra saber se ainda tem histórico depois desta página.
  // Ordena por id (sempre crescente com o tempo) — é o que o "before" usa como cursor.
  const rows = db.prepare(`
    ${MESSAGE_COLUMNS}
    WHERE m.channel_id = ? ${before ? 'AND m.id < ?' : ''}
    ORDER BY m.id DESC
    LIMIT ?
  `).all(...(before ? [channelId, before, limit + 1] : [channelId, limit + 1]));

  const hasMore = rows.length > limit;
  res.json({ messages: rows.slice(0, limit).reverse(), has_more: hasMore });
});

// POST /api/channels/:channelId/messages — envia mensagem (texto e/ou anexo)
router.post('/', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });
  if (channel.type !== 'text') return res.status(400).json({ error: 'esse canal não é de texto' });

  const { content, reply_to_id } = req.body || {};
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'mensagem vazia' });
  }
  const cleanContent = content.trim().slice(0, 4000);
  const replyToId = resolveReplyToId(channelId, reply_to_id);

  const result = db.prepare(
    'INSERT INTO messages (channel_id, user_id, content, reply_to_id) VALUES (?, ?, ?, ?)'
  ).run(channelId, req.user.id, cleanContent, replyToId);

  const message = db.prepare(MESSAGE_SELECT).get(result.lastInsertRowid);

  realtime.broadcastToChannel(channelId, { type: 'message_created', message });
  res.status(201).json({ message });

  // comandos do bot de música (/play, /stop, /shuffle, /volume, /queue) rodam depois de já
  // ter respondido a request — não trava o envio da mensagem esperando o yt-dlp/spotify.
  // só em canais de servidor: o bot toca em canal de voz, e DM não tem canal de voz.
  if (channel.server_id != null) {
    musicBot.maybeHandleCommand(cleanContent, channelId, req.user).catch((err) => {
      console.error('[musicBot] erro ao processar comando:', err.message);
    });
  }
});

// garante que o id de resposta existe e pertence ao mesmo canal, senão ignora (não quebra o envio)
function resolveReplyToId(channelId, rawId) {
  const id = Number(rawId);
  if (!id) return null;
  const found = db.prepare('SELECT id FROM messages WHERE id = ? AND channel_id = ?').get(id, channelId);
  return found ? id : null;
}

// POST /api/channels/:channelId/messages/attachment — envia imagem/vídeo/arquivo (com legenda opcional)
router.post('/attachment', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });
  if (channel.type !== 'text') return res.status(400).json({ error: 'esse canal não é de texto' });

  attachmentUpload.single('file')(req, res, (err) => {
    if (err) {
      // multer sinaliza limite de tamanho estourado com esse code específico — mensagem
      // separada disso pra pessoa saber exatamente por que falhou, em vez de um erro genérico
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'arquivo muito grande (máximo 2GB)' });
      }
      return res.status(400).json({ error: 'não deu pra enviar esse arquivo' });
    }
    if (!req.file) return res.status(400).json({ error: 'arquivo inválido' });

    const attachmentType = attachmentTypeOf(req.file.mimetype);
    const attachmentUrl = `/uploads/attachments/${req.file.filename}`;
    // nome/tamanho originais só importam de verdade pro chip de arquivo genérico (imagem/vídeo
    // já mostram preview inline, sem precisar do nome do arquivo) — mas guarda sempre, é barato
    const attachmentName = req.file.originalname ? req.file.originalname.slice(0, 255) : null;
    const attachmentSize = req.file.size || null;
    const caption = typeof req.body.content === 'string' ? req.body.content.trim().slice(0, 4000) : '';
    const replyToId = resolveReplyToId(channelId, req.body.reply_to_id);

    const result = db.prepare(
      'INSERT INTO messages (channel_id, user_id, content, attachment_url, attachment_type, attachment_name, attachment_size, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(channelId, req.user.id, caption, attachmentUrl, attachmentType, attachmentName, attachmentSize, replyToId);

    const message = db.prepare(MESSAGE_SELECT).get(result.lastInsertRowid);

    realtime.broadcastToChannel(channelId, { type: 'message_created', message });
    res.status(201).json({ message });
  });
});

// POST /api/channels/:channelId/messages/gif — envia um gif escolhido no seletor do GIPHY
// (não é upload — só guarda a URL direto do CDN do GIPHY, então precisa validar o host)
router.post('/gif', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });
  if (channel.type !== 'text') return res.status(400).json({ error: 'esse canal não é de texto' });

  const { url, reply_to_id } = req.body || {};
  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'url do gif é obrigatória' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return res.status(400).json({ error: 'url inválida' });
  }
  // só aceita URLs do próprio GIPHY — senão isso vira um jeito de mandar qualquer link como "anexo"
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('giphy.com')) {
    return res.status(400).json({ error: 'só aceito gifs vindos do giphy' });
  }

  const replyToId = resolveReplyToId(channelId, reply_to_id);

  const result = db.prepare(
    'INSERT INTO messages (channel_id, user_id, content, attachment_url, attachment_type, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(channelId, req.user.id, '', url, 'gif', replyToId);

  const message = db.prepare(MESSAGE_SELECT).get(result.lastInsertRowid);

  realtime.broadcastToChannel(channelId, { type: 'message_created', message });
  res.status(201).json({ message });
});

// PATCH /api/channels/:channelId/messages/:messageId — edita o texto de uma mensagem. Só o autor
// (mensagem de bot e gif não têm o que editar). Em mensagem com anexo, edita a legenda e ela pode
// ficar vazia; em mensagem só de texto, não pode ficar vazia. Não reexecuta comando de bot.
router.patch('/:messageId', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);

  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });

  const message = db.prepare(
    'SELECT id, user_id, content, attachment_url, attachment_type FROM messages WHERE id = ? AND channel_id = ?'
  ).get(messageId, channelId);
  if (!message) return res.status(404).json({ error: 'mensagem não encontrada' });
  if (message.user_id !== req.user.id) {
    return res.status(403).json({ error: 'você só pode editar as suas mensagens' });
  }
  if (message.attachment_type === 'gif') {
    return res.status(400).json({ error: 'gif não pode ser editado' });
  }

  const { content } = req.body || {};
  if (typeof content !== 'string') return res.status(400).json({ error: 'texto inválido' });
  const cleanContent = content.trim().slice(0, 4000);
  if (!cleanContent && !message.attachment_url) {
    return res.status(400).json({ error: 'mensagem vazia' });
  }

  if (cleanContent !== message.content) {
    db.prepare('UPDATE messages SET content = ?, edited = 1 WHERE id = ?').run(cleanContent, messageId);
  }

  const updated = db.prepare(MESSAGE_SELECT).get(messageId);
  realtime.broadcastToChannel(channelId, { type: 'message_edited', channelId, message: updated });
  res.json({ message: updated });
});

// DELETE /api/channels/:channelId/messages/:messageId — apaga uma mensagem. Pode apagar: quem
// escreveu, ou o dono do servidor (moderar). Mensagens de bot: qualquer membro do canal.
router.delete('/:messageId', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);

  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });

  const message = db.prepare(
    'SELECT id, channel_id, user_id, attachment_url FROM messages WHERE id = ? AND channel_id = ?'
  ).get(messageId, channelId);

  if (!message) return res.status(404).json({ error: 'mensagem não encontrada' });

  const isAuthor = message.user_id === req.user.id;
  const isBotMessage = message.user_id == null;
  const server = channel.server_id != null ? access.getServer(channel.server_id) : null;
  const isServerAdmin = !!(server && access.isServerAdmin(server.id, req.user.id));
  if (!isAuthor && !isBotMessage && !isServerAdmin) {
    return res.status(403).json({ error: 'você só pode apagar as suas mensagens' });
  }

  db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);

  if (message.attachment_url && message.attachment_url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '..', '..', 'public', message.attachment_url);
    fs.unlink(filePath, () => {});
  }

  realtime.broadcastToChannel(channelId, { type: 'message_deleted', channelId, messageId });
  res.json({ ok: true });
});

module.exports = router;
