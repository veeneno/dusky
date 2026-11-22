const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const { attachmentUpload, attachmentTypeOf, sanitizeAttachmentName } = require('../upload');
const { MESSAGE_COLUMNS, MESSAGE_SELECT_BY_ID } = require('../db/messageQueries');
const musicBot = require('../bots/musicBot');
const extras = require('../chatExtras');
const audit = require('../audit');
const uploadLimits = require('../uploadLimits');
const limits = require('../limits');

// envio de anexo: some se ficar UPLOAD_IDLE_MS sem chegar nenhum byte (conexão pendurada) e, pra
// quem tem limite, se o envio inteiro passar de UPLOAD_MAX_DURATION_MS (100 MB a ~0,5 Mbps cabe)
const UPLOAD_IDLE_MS = 60 * 1000;
const UPLOAD_MAX_DURATION_MS = 30 * 60 * 1000;
function uploadDeadline(req, maxMs) {
  const socket = req.socket;
  socket.setTimeout(UPLOAD_IDLE_MS, () => socket.destroy());
  const total = maxMs ? setTimeout(() => socket.destroy(), maxMs) : null;
  return () => {
    if (total) clearTimeout(total);
    socket.setTimeout(0); // a conexão pode ser reaproveitada (keep-alive) por outros pedidos
  };
}

// frequência por conta (o admin do site não passa por isso — ver server/limits.js)
const sendLimit = limits.perUser('msg', 30, 15 * 1000, 'você está mandando mensagens rápido demais — espera uns segundos');
const attachLimit = limits.perUser('attach', 30, 10 * 60 * 1000, 'muitos anexos seguidos — espera uns minutos');
const editLimit = limits.perUser('edit', 60, 60 * 1000);

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
//   ?after=<id>        só as posteriores (voltando pro presente depois de pular pra uma antiga)
//   ?around=<id>       metade antes e metade depois dessa mensagem (pular pra um resultado da
//                      busca ou pra uma fixada)
// devolve has_more (tem mais antigas?) e has_more_after (tem mais novas?)
function olderThan(channelId, id, limit, inclusive) {
  return db.prepare(`${MESSAGE_COLUMNS} WHERE m.channel_id = ? ${id ? `AND m.id ${inclusive ? '<=' : '<'} ?` : ''} ORDER BY m.id DESC LIMIT ?`)
    .all(...(id ? [channelId, id, limit + 1] : [channelId, limit + 1]));
}
function newerThan(channelId, id, limit) {
  return db.prepare(`${MESSAGE_COLUMNS} WHERE m.channel_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ?`).all(channelId, id, limit + 1);
}

router.get('/', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const before = Number(req.query.before) || null;
  const after = Number(req.query.after) || null;
  const around = Number(req.query.around) || null;

  // sempre busca uma a mais que o pedido só pra saber se ainda tem histórico depois da página.
  // Ordena por id (sempre crescente com o tempo) — é o que os cursores usam.
  let messages; let hasMore = false; let hasMoreAfter = false;
  if (around) {
    const half = Math.floor(limit / 2);
    const older = olderThan(channelId, around, half, true);
    const newer = newerThan(channelId, around, limit - half);
    hasMore = older.length > half;
    hasMoreAfter = newer.length > limit - half;
    messages = [...older.slice(0, half).reverse(), ...newer.slice(0, limit - half)];
  } else if (after) {
    const newer = newerThan(channelId, after, limit);
    hasMoreAfter = newer.length > limit;
    messages = newer.slice(0, limit);
    hasMore = true;
  } else {
    const rows = olderThan(channelId, before, limit, false);
    hasMore = rows.length > limit;
    messages = rows.slice(0, limit).reverse();
  }
  res.json({ messages: extras.decorateMessages(messages), has_more: hasMore, has_more_after: hasMoreAfter });
});

// GET /api/channels/:channelId/messages/pins — mensagens fixadas, a mais recente primeiro
router.get('/pins', requireAuth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });
  const rows = db.prepare(`${MESSAGE_COLUMNS} WHERE m.channel_id = ? AND m.pinned_at IS NOT NULL ORDER BY m.pinned_at DESC, m.id DESC LIMIT 100`).all(channelId);
  res.json({ messages: extras.decorateMessages(rows) });
});

// mensagem nova de uma pessoa: guarda as menções, conta como lida pra quem mandou e avisa todo mundo
function publishNewMessage(channelId, messageId, author) {
  const row = db.prepare(MESSAGE_SELECT).get(messageId);
  extras.saveMentions(messageId, row.content);
  extras.markRead(author.id, channelId, messageId);
  const message = extras.decorateMessage(row);
  realtime.broadcastToChannel(channelId, { type: 'message_created', message });
  require('../push').notifyMessage(message).catch(err => console.error('[push]', err.message));
  return message;
}

// POST /api/channels/:channelId/messages — envia mensagem (texto e/ou anexo)
router.post('/', requireAuth, sendLimit, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });
  if (!access.canChannelAction(channel, req.user.id, 'send')) return res.status(403).json({ error: 'você não pode escrever neste canal' });
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

  const message = publishNewMessage(channelId, result.lastInsertRowid, req.user);
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
router.post('/attachment', requireAuth, attachLimit, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });
  if (!access.canChannelAction(channel, req.user.id, 'send')) return res.status(403).json({ error: 'você não pode escrever neste canal' });
  if (channel.type !== 'text') return res.status(400).json({ error: 'esse canal não é de texto' });

  if (!access.canChannelAction(channel, req.user.id, 'attach')) return res.status(403).json({ error: 'você não pode enviar anexos neste canal' });

  // limite por conta (padrão 100 MB por arquivo e 5 GB no total; o admin do site não tem limite)
  const lim = uploadLimits.limitsFor(req.user.id);
  const tooBig = `arquivo muito grande (seu limite é ${uploadLimits.formatMB(lim.maxMB)} por arquivo)`;
  const overQuota = `você chegou no limite de espaço dos seus anexos (${uploadLimits.formatMB(lim.quotaMB)}) — apague anexos antigos ou fale com o admin`;
  // o tamanho declarado do pedido já diz se não cabe: recusa antes de receber um byte do arquivo
  const declared = Number(req.headers['content-length']) || 0;
  if (!lim.unlimited) {
    if (declared > lim.maxBytes + 64 * 1024) return res.status(413).json({ error: tooBig });
    if (lim.usedBytes >= lim.quotaBytes || lim.usedBytes + declared - 64 * 1024 > lim.quotaBytes) {
      return res.status(413).json({ error: overQuota });
    }
  }
  // prazo do envio: some se ficar 60 s sem chegar nada, ou se passar do teto total (o admin
  // só tem o prazo de inatividade). Ver também server.requestTimeout no index.js.
  const cleanupTimers = uploadDeadline(req, lim.unlimited ? 0 : UPLOAD_MAX_DURATION_MS);

  attachmentUpload(lim.maxBytes).single('file')(req, res, (err) => {
    cleanupTimers();
    if (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      // multer sinaliza limite de tamanho estourado com esse code específico — mensagem
      // separada disso pra pessoa saber exatamente por que falhou, em vez de um erro genérico
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: tooBig });
      return res.status(400).json({ error: 'não deu pra enviar esse arquivo' });
    }
    if (!req.file) return res.status(400).json({ error: 'arquivo inválido' });
    // o Content-Length pode mentir: confere a cota de novo com o tamanho real gravado
    if (!lim.unlimited && uploadLimits.usedBytes(req.user.id) + req.file.size > lim.quotaBytes) {
      fs.unlink(req.file.path, () => {});
      return res.status(413).json({ error: overQuota });
    }
    // Um upload pode levar minutos: revogação durante o envio também deve valer.
    if (!access.canChannelAction(access.getChannel(channelId), req.user.id, 'attach')) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'você perdeu permissão para enviar anexos neste canal' });
    }

    const attachmentType = attachmentTypeOf(req.file.mimetype);
    const attachmentUrl = `/uploads/attachments/${req.file.filename}`;
    // nome/tamanho originais só importam de verdade pro chip de arquivo genérico (imagem/vídeo
    // já mostram preview inline, sem precisar do nome do arquivo) — mas guarda sempre, é barato
    const attachmentName = sanitizeAttachmentName(req.file.originalname);
    const attachmentSize = req.file.size || null;
    const caption = typeof req.body.content === 'string' ? req.body.content.trim().slice(0, 4000) : '';
    const replyToId = resolveReplyToId(channelId, req.body.reply_to_id);

    const result = db.prepare(
      'INSERT INTO messages (channel_id, user_id, content, attachment_url, attachment_type, attachment_name, attachment_size, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(channelId, req.user.id, caption, attachmentUrl, attachmentType, attachmentName, attachmentSize, replyToId);

    const message = publishNewMessage(channelId, result.lastInsertRowid, req.user);
    res.status(201).json({ message });
  });
});

// POST /api/channels/:channelId/messages/gif — envia um gif escolhido no seletor do GIPHY
// (não é upload — só guarda a URL direto do CDN do GIPHY, então precisa validar o host)
router.post('/gif', requireAuth, sendLimit, (req, res) => {
  const channelId = Number(req.params.channelId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) return res.status(404).json({ error: 'canal não encontrado' });
  if (!access.canChannelAction(channel, req.user.id, 'send')) return res.status(403).json({ error: 'você não pode escrever neste canal' });
  if (channel.type !== 'text') return res.status(400).json({ error: 'esse canal não é de texto' });

  if (!access.canChannelAction(channel, req.user.id, 'attach')) return res.status(403).json({ error: 'você não pode enviar anexos neste canal' });
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

  const message = publishNewMessage(channelId, result.lastInsertRowid, req.user);
  res.status(201).json({ message });
});

// PATCH /api/channels/:channelId/messages/:messageId — edita o texto de uma mensagem. Só o autor
// (mensagem de bot e gif não têm o que editar). Em mensagem com anexo, edita a legenda e ela pode
// ficar vazia; em mensagem só de texto, não pode ficar vazia. Não reexecuta comando de bot.
router.patch('/:messageId', requireAuth, editLimit, (req, res) => {
  if (!access.canChannelAction(getChannel(Number(req.params.channelId), req.user.id), req.user.id, 'send')) return res.status(403).json({ error: 'você não pode editar neste canal' });
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
    extras.saveMentions(messageId, cleanContent);
  }

  const updated = extras.decorateMessage(db.prepare(MESSAGE_SELECT).get(messageId));
  realtime.broadcastToChannel(channelId, { type: 'message_edited', channelId, message: updated });
  res.json({ message: updated });
});

// DELETE /api/channels/:channelId/messages/:messageId — apaga uma mensagem. Pode apagar: quem
// escreveu, ou quem tem a permissão de moderar mensagens (inclusive mensagens do bot).
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
  const server = channel.server_id != null ? access.getServer(channel.server_id) : null;
  const isServerAdmin = !!(server && access.hasServerPermission(server.id, req.user.id, 'manage_messages'));
  if (!isAuthor && !isServerAdmin) {
    return res.status(403).json({ error: 'você só pode apagar as suas mensagens' });
  }

  db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);

  if (message.attachment_url && message.attachment_url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '..', '..', 'public', message.attachment_url);
    fs.unlink(filePath, () => {});
  }

  realtime.broadcastToChannel(channelId, { type: 'message_deleted', channelId, messageId });
  // moderador apagando mensagem de outra pessoa: vai pro registro (sem o conteúdo)
  if (server && !isAuthor) {
    const author = message.user_id ? access.getUser(message.user_id) : null;
    audit.log(server.id, req.user.id, 'message_delete', { type: 'user', id: message.user_id, name: author ? author.username : 'bot' }, { channel: channel.name });
  }
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// reações
// ------------------------------------------------------------------

// carrega canal + mensagem (os dois precisam existir e a pessoa precisa ver o canal)
function loadChannelMessage(req, res) {
  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);
  const channel = getChannel(channelId, req.user.id);
  if (!channel) { res.status(404).json({ error: 'canal não encontrado' }); return null; }
  const message = db.prepare('SELECT id, channel_id, user_id, pinned_at FROM messages WHERE id = ? AND channel_id = ?').get(messageId, channelId);
  if (!message) { res.status(404).json({ error: 'mensagem não encontrada' }); return null; }
  return { channel, message, channelId, messageId };
}

function broadcastReactions(channelId, messageId) {
  const reactions = extras.reactionsFor([messageId]).get(messageId) || [];
  realtime.broadcastToChannel(channelId, { type: 'reactions_updated', channelId, messageId, reactions });
  return reactions;
}

// PUT /api/channels/:channelId/messages/:messageId/reactions/:emoji — reage
router.put('/:messageId/reactions/:emoji', requireAuth, editLimit, (req, res) => {
  if (!access.canChannelAction(getChannel(Number(req.params.channelId), req.user.id), req.user.id, 'react')) return res.status(403).json({ error: 'você não pode reagir neste canal' });
  const ctx = loadChannelMessage(req, res);
  if (!ctx) return;
  const emoji = String(req.params.emoji || '');
  if (!extras.isEmoji(emoji)) return res.status(400).json({ error: 'isso não é um emoji' });
  const distinct = db.prepare('SELECT COUNT(DISTINCT emoji) AS c FROM message_reactions WHERE message_id = ? AND emoji != ?').get(ctx.messageId, emoji).c;
  if (distinct >= extras.MAX_REACTIONS_PER_MESSAGE) return res.status(400).json({ error: `no máximo ${extras.MAX_REACTIONS_PER_MESSAGE} emojis diferentes por mensagem` });
  db.prepare('INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(ctx.messageId, req.user.id, emoji);
  res.json({ reactions: broadcastReactions(ctx.channelId, ctx.messageId) });
});

// DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji — tira a minha reação
router.delete('/:messageId/reactions/:emoji', requireAuth, editLimit, (req, res) => {
  const ctx = loadChannelMessage(req, res);
  if (!ctx) return;
  db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(ctx.messageId, req.user.id, String(req.params.emoji || ''));
  res.json({ reactions: broadcastReactions(ctx.channelId, ctx.messageId) });
});

// ------------------------------------------------------------------
// fixadas — qualquer um que vê o canal pode fixar/desafixar (servidor de amigos)
// ------------------------------------------------------------------

const MAX_PINS_PER_CHANNEL = 100;

function setPinned(req, res, pinned) {
  if (!access.canChannelAction(getChannel(Number(req.params.channelId), req.user.id), req.user.id, 'pin')) return res.status(403).json({ error: 'você não pode fixar neste canal' });
  const ctx = loadChannelMessage(req, res);
  if (!ctx) return;
  if (pinned && !ctx.message.pinned_at) {
    const count = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE channel_id = ? AND pinned_at IS NOT NULL').get(ctx.channelId).c;
    if (count >= MAX_PINS_PER_CHANNEL) return res.status(400).json({ error: `esse canal já tem ${MAX_PINS_PER_CHANNEL} mensagens fixadas` });
    db.prepare("UPDATE messages SET pinned_at = datetime('now'), pinned_by = ? WHERE id = ?").run(req.user.id, ctx.messageId);
  } else if (!pinned) {
    db.prepare('UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ?').run(ctx.messageId);
  }
  const message = extras.decorateMessage(db.prepare(MESSAGE_SELECT).get(ctx.messageId));
  realtime.broadcastToChannel(ctx.channelId, { type: 'message_pinned', channelId: ctx.channelId, message, pinned, by: { id: req.user.id, username: req.user.username } });
  res.json({ message });
}

router.put('/:messageId/pin', requireAuth, (req, res) => setPinned(req, res, true));
router.delete('/:messageId/pin', requireAuth, (req, res) => setPinned(req, res, false));

module.exports = router;
