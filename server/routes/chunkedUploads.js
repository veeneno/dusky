// Envio de anexo em partes. O túnel do Cloudflare (plano grátis) recusa qualquer pedido com mais de
// 100 MB (HTTP 413) antes de chegar aqui, então arquivo grande vai em pedaços de ~50 MB, cada um
// num pedido próprio. Também dá pra retomar: a parte que falhar é mandada de novo, sem recomeçar.
//
//   POST   /api/channels/:channelId/uploads                     { name, size, type, content?, reply_to_id? }
//          abre a sessão: confere permissão, cota e limite por arquivo igual ao envio normal
//          (routes/messages.js, /attachment) → { uploadId, chunkSize, totalChunks }
//   PUT    /api/channels/:channelId/uploads/:uploadId/:index    corpo = os bytes da parte (octet-stream)
//   GET    /api/channels/:channelId/uploads/:uploadId           { received: [índices], totalChunks } (retomar)
//   POST   /api/channels/:channelId/uploads/:uploadId/complete  confere o tamanho, move o arquivo pra
//          public/uploads/attachments e cria a mensagem por publishNewMessage, igual ao envio normal
//   DELETE /api/channels/:channelId/uploads/:uploadId           desiste (apaga o temporário)
//
// As partes vão direto pro lugar certo de um arquivo temporário em public/uploads/.parts/ (mesmo
// disco dos anexos, então "mover" é só renomear). Essa pasta nunca é servida: routes/uploads.js só
// entrega as pastas conhecidas. Sessão parada há mais de 1 h expira e o temporário é apagado.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncRoute } = require('../asyncRoute');
const access = require('../access');
const uploadLimits = require('../uploadLimits');
const { UPLOADS_ROOT, extFor, attachmentTypeOf, sanitizeAttachmentName } = require('../upload');
const messages = require('./messages');

// bem abaixo dos 100 MB do Cloudflare. DUSKY_UPLOAD_CHUNK_BYTES só existe pros testes (partes pequenas)
const CHUNK_SIZE = Number(process.env.DUSKY_UPLOAD_CHUNK_BYTES) || 50 * 1024 * 1024;
const SESSION_IDLE_MS = 60 * 60 * 1000; // 1 h sem chegar parte nenhuma = desistiu
const MAX_OPEN_PER_USER = 3; // envios em partes abertos ao mesmo tempo por conta
const PARTS_DIR = path.join(UPLOADS_ROOT, '.parts');
const ATTACH_DIR = path.join(UPLOADS_ROOT, 'attachments');
fs.mkdirSync(PARTS_DIR, { recursive: true });
fs.mkdirSync(ATTACH_DIR, { recursive: true });

// As sessões ficam só em memória: temporário que sobrou de antes de um reinício é lixo. Apaga só os
// parados há mais de 1 h (a pasta pode estar em uso por outro processo agora, ex.: os testes rodando
// com o servidor de pé), e o intervalo lá embaixo pega o resto.
function sweepOrphanParts() {
  let files = [];
  try { files = fs.readdirSync(PARTS_DIR); } catch (_) { return; }
  const now = Date.now();
  for (const f of files) {
    if (sessions.has(f)) continue;
    const file = path.join(PARTS_DIR, f);
    try { if (now - fs.statSync(file).mtimeMs > SESSION_IDLE_MS) fs.rm(file, { force: true }, () => {}); } catch (_) { /* sumiu */ }
  }
}

const sessions = new Map(); // uploadId -> sessão
sweepOrphanParts();

function dropSession(s) {
  sessions.delete(s.id);
  fs.rm(s.tmpPath, { force: true }, () => {});
}

// a cada 5 min, as sessões paradas há mais de 1 h vão embora (unref: não segura o processo aberto)
setInterval(() => {
  const now = Date.now();
  for (const s of [...sessions.values()]) if (!s.writing && now - s.touchedAt > SESSION_IDLE_MS) dropSession(s);
  sweepOrphanParts();
}, 5 * 60 * 1000).unref();

// bytes "reservados" pelas sessões abertas da conta: contam na cota, senão dava pra abrir várias
// sessões que juntas passam do espaço que a pessoa tem
function reservedBytes(userId) {
  let total = 0;
  for (const s of sessions.values()) if (s.userId === userId) total += s.size;
  return total;
}

const router = express.Router({ mergeParams: true });

function loadSession(req, res, next) {
  const s = sessions.get(String(req.params.uploadId));
  // sessão de outra pessoa ou de outro canal responde igual sessão inexistente
  if (!s || s.userId !== req.user.id || s.channelId !== Number(req.params.channelId)) {
    return res.status(404).json({ error: 'esse envio não existe mais — mande o arquivo de novo' });
  }
  req.uploadSession = s;
  next();
}

// as mesmas checagens do envio normal: ver o canal, escrever, anexar, canal de texto
function channelDenied(channelId, userId) {
  const channel = access.canAccessChannel(channelId, userId);
  if (!channel) return { status: 404, error: 'canal não encontrado' };
  if (!access.canChannelAction(channel, userId, 'send')) return { status: 403, error: access.sendDeniedMessage(channel, userId) };
  if (channel.type !== 'text') return { status: 400, error: 'esse canal não é de texto' };
  if (!access.canChannelAction(channel, userId, 'attach')) return { status: 403, error: 'você não pode enviar anexos neste canal' };
  return null;
}

// POST / — abre a sessão
router.post('/', requireAuth, messages.attachLimit, (req, res) => {
  const channelId = Number(req.params.channelId);
  const denied = channelDenied(channelId, req.user.id);
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const body = req.body || {};
  const size = Number(body.size);
  if (!Number.isSafeInteger(size) || size <= 0) return res.status(400).json({ error: 'tamanho do arquivo inválido' });
  const type = typeof body.type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(body.type) ? body.type.slice(0, 120).toLowerCase() : 'application/octet-stream';
  const name = sanitizeAttachmentName(body.name) || 'arquivo';

  const lim = uploadLimits.limitsFor(req.user.id);
  if (!lim.unlimited) {
    if (size > lim.maxBytes) return res.status(413).json({ error: `arquivo muito grande (seu limite é ${uploadLimits.formatMB(lim.maxMB)} por arquivo)` });
    if (lim.usedBytes + reservedBytes(req.user.id) + size > lim.quotaBytes) {
      return res.status(413).json({ error: `você chegou no limite de espaço dos seus anexos (${uploadLimits.formatMB(lim.quotaMB)}) — apague anexos antigos ou fale com o admin` });
    }
  }
  const open = [...sessions.values()].filter((s) => s.userId === req.user.id).length;
  if (open >= MAX_OPEN_PER_USER) return res.status(429).json({ error: 'você já tem envios demais em andamento — espera um terminar' });

  const id = crypto.randomBytes(16).toString('hex');
  const tmpPath = path.join(PARTS_DIR, id);
  fs.writeFileSync(tmpPath, ''); // as partes escrevem cada uma na sua posição (flags r+)
  const totalChunks = Math.ceil(size / CHUNK_SIZE);
  sessions.set(id, {
    id, userId: req.user.id, channelId, name, type, size, tmpPath, totalChunks,
    received: new Set(), writing: 0, touchedAt: Date.now(),
    caption: typeof body.content === 'string' ? body.content.trim().slice(0, 4000) : '',
    replyTo: body.reply_to_id,
  });
  res.status(201).json({ uploadId: id, chunkSize: CHUNK_SIZE, totalChunks });
});

// GET /:uploadId — o que já chegou (pra retomar depois de uma queda)
router.get('/:uploadId', requireAuth, loadSession, (req, res) => {
  const s = req.uploadSession;
  res.json({ received: [...s.received].sort((a, b) => a - b), totalChunks: s.totalChunks, chunkSize: CHUNK_SIZE });
});

// PUT /:uploadId/:index — uma parte. Mandar a mesma parte de novo só sobrescreve (é assim que
// a parte que falhou é refeita).
router.put('/:uploadId/:index', requireAuth, loadSession, asyncRoute(async (req, res) => {
  const s = req.uploadSession;
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= s.totalChunks) return res.status(400).json({ error: 'parte inválida' });
  const start = index * CHUNK_SIZE;
  const expected = Math.min(CHUNK_SIZE, s.size - start);
  const declared = Number(req.headers['content-length']);
  if (req.headers['content-length'] != null && declared !== expected) {
    return res.status(400).json({ error: `parte ${index} com tamanho errado` });
  }

  s.touchedAt = Date.now();
  s.writing++;
  // 60 s sem chegar nada derruba a conexão (igual o envio normal); sem teto total: cada parte é pequena
  const cleanupTimers = messages.uploadDeadline(req, 0);
  let count = 0;
  const counter = new Transform({
    transform(chunk, enc, cb) {
      count += chunk.length;
      if (count > expected) return cb(Object.assign(new Error('parte maior que o esperado'), { tooBig: true }));
      s.touchedAt = Date.now();
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, counter, fs.createWriteStream(s.tmpPath, { flags: 'r+', start }));
    if (count !== expected) return res.status(400).json({ error: `parte ${index} chegou incompleta` });
    // a sessão pode ter sido cancelada enquanto esta parte chegava
    if (!sessions.has(s.id)) return res.status(404).json({ error: 'esse envio foi cancelado' });
    s.received.add(index);
    res.json({ ok: true, received: s.received.size, totalChunks: s.totalChunks });
  } catch (err) {
    s.received.delete(index); // escrita pela metade: essa parte precisa vir de novo
    if (!res.headersSent) {
      if (err.tooBig) res.status(413).json({ error: 'parte maior que o esperado' });
      else res.status(400).json({ error: 'a parte não chegou inteira — tente de novo' });
    }
  } finally {
    s.writing--;
    s.touchedAt = Date.now();
    cleanupTimers();
  }
}));

// POST /:uploadId/complete — junta tudo e cria a mensagem
router.post('/:uploadId/complete', requireAuth, loadSession, (req, res) => {
  const s = req.uploadSession;
  if (s.writing) return res.status(409).json({ error: 'ainda tem parte chegando' });
  const missing = [];
  for (let i = 0; i < s.totalChunks; i++) if (!s.received.has(i)) missing.push(i);
  if (missing.length) return res.status(400).json({ error: 'faltam partes do arquivo', missing });

  let realSize = 0;
  try { realSize = fs.statSync(s.tmpPath).size; } catch (_) { /* sumiu */ }
  if (realSize !== s.size) {
    dropSession(s);
    return res.status(400).json({ error: 'o arquivo chegou com o tamanho errado — mande de novo' });
  }

  // o envio pode ter levado muito tempo: permissão e cota valem de novo agora, com o tamanho real
  const denied = channelDenied(s.channelId, req.user.id);
  if (denied) { dropSession(s); return res.status(denied.status).json({ error: denied.error }); }
  const lim = uploadLimits.limitsFor(req.user.id);
  if (!lim.unlimited && uploadLimits.usedBytes(req.user.id) + realSize > lim.quotaBytes) {
    dropSession(s);
    return res.status(413).json({ error: `você chegou no limite de espaço dos seus anexos (${uploadLimits.formatMB(lim.quotaMB)})` });
  }

  const filename = crypto.randomBytes(16).toString('hex') + extFor(s.type, s.name);
  try {
    fs.renameSync(s.tmpPath, path.join(ATTACH_DIR, filename));
  } catch (err) {
    console.error('[uploads] não consegui mover o envio em partes:', err.message);
    dropSession(s);
    return res.status(500).json({ error: 'não deu pra guardar o arquivo' });
  }
  sessions.delete(s.id);

  const attachmentUrl = `/uploads/attachments/${filename}`;
  const replyToId = messages.resolveReplyToId(s.channelId, s.replyTo);
  const result = db.prepare(
    'INSERT INTO messages (channel_id, user_id, content, attachment_url, attachment_type, attachment_name, attachment_size, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(s.channelId, req.user.id, s.caption, attachmentUrl, attachmentTypeOf(s.type), s.name, realSize, replyToId);
  const message = messages.publishNewMessage(s.channelId, result.lastInsertRowid, req.user);
  res.status(201).json({ message });
});

// DELETE /:uploadId — desistiu (botão "cancelar envio")
router.delete('/:uploadId', requireAuth, loadSession, (req, res) => {
  dropSession(req.uploadSession);
  res.json({ ok: true });
});

module.exports = router;
module.exports.CHUNK_SIZE = CHUNK_SIZE;
module.exports._sessions = sessions; // só pros testes
