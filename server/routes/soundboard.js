// soundboard: GET /api/soundboard (tudo que eu posso escolher, de todos os meus servidores) e o
// CRUD dos sons de cada servidor em /api/servers/:serverId/soundboard. Tocar um som é pelo
// WebSocket (soundboard_play, ver server/realtime.js). Regras e ffmpeg: server/soundboard.js.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const audit = require('../audit');
const sb = require('../soundboard');
const { soundUpload } = require('../upload');

const router = express.Router();
const serverRouter = express.Router({ mergeParams: true });

// GET /api/soundboard — sons de todos os servidores da pessoa, com as permissões de cada um
router.get('/', requireAuth, (req, res) => {
  res.json({ servers: sb.soundsForUser(req.user.id), max_sound_ms: sb.MAX_SOUND_MS });
});

function loadServer(req, res, next) {
  const server = access.getServer(Number(req.params.serverId));
  if (!server || !access.isServerMember(server.id, req.user.id)) return res.status(404).json({ error: 'servidor não encontrado' });
  req.server = server;
  next();
}
function requireManage(req, res, next) {
  if (!access.hasServerPermission(req.server.id, req.user.id, 'manage_soundboard')) return res.status(403).json({ error: 'seu cargo não pode mexer no soundboard' });
  next();
}
function loadSound(req, res, next) {
  const sound = sb.getSound(req.params.soundId);
  if (!sound || sound.server_id !== req.server.id) return res.status(404).json({ error: 'som não encontrado' });
  req.sound = sound;
  next();
}
function changed(serverId) {
  realtime.broadcastToServer(serverId, { type: 'soundboard_updated', serverId });
}

// GET /api/servers/:serverId/soundboard — sons deste servidor (aba "soundboard" das configurações)
serverRouter.get('/', requireAuth, loadServer, (req, res) => {
  res.json({ sounds: sb.serverSounds(req.server.id), max: sb.MAX_SOUNDS_PER_SERVER, max_sound_ms: sb.MAX_SOUND_MS });
});

// POST /api/servers/:serverId/soundboard (multipart) — sound: arquivo; name, emoji, volume, start, end
serverRouter.post('/', requireAuth, loadServer, requireManage, (req, res) => {
  if (sb.countSounds(req.server.id) >= sb.MAX_SOUNDS_PER_SERVER) {
    return res.status(400).json({ error: `o soundboard deste servidor já tem ${sb.MAX_SOUNDS_PER_SERVER} sons — apague algum antes` });
  }
  soundUpload.single('sound')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'arquivo grande demais (máx. 25MB)' });
    if (!req.file) return res.status(400).json({ error: 'escolha um arquivo de áudio ou vídeo' });
    const body = req.body || {};
    const name = sb.cleanName(body.name);
    if (name.length < 2) {
      require('fs').unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'dá um nome pro som (2 a 32 letras)' });
    }
    let processed;
    try {
      processed = await sb.processUpload(req.file.path, body.start, body.end);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'não deu pra processar esse áudio' });
    }
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO soundboard_sounds (server_id, name, emoji, volume, file_url, duration_ms, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.server.id, name, sb.cleanEmoji(body.emoji), sb.cleanVolume(body.volume), processed.fileUrl, processed.durationMs, req.user.id);
    audit.log(req.server.id, req.user.id, 'sound_create', { type: 'sound', id: lastInsertRowid, name });
    changed(req.server.id);
    res.status(201).json({ sound: sb.getSound(lastInsertRowid) });
  });
});

// PATCH /api/servers/:serverId/soundboard/:soundId { name?, emoji?, volume? }
serverRouter.patch('/:soundId', requireAuth, loadServer, requireManage, loadSound, (req, res) => {
  const body = req.body || {};
  const sets = [];
  const vals = [];
  if (body.name !== undefined) {
    const name = sb.cleanName(body.name);
    if (name.length < 2) return res.status(400).json({ error: 'dá um nome pro som (2 a 32 letras)' });
    sets.push('name = ?'); vals.push(name);
  }
  if (body.emoji !== undefined) { sets.push('emoji = ?'); vals.push(sb.cleanEmoji(body.emoji)); }
  if (body.volume !== undefined) { sets.push('volume = ?'); vals.push(sb.cleanVolume(body.volume)); }
  if (sets.length) {
    db.prepare(`UPDATE soundboard_sounds SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.sound.id);
    audit.log(req.server.id, req.user.id, 'sound_update', { type: 'sound', id: req.sound.id, name: req.sound.name }, { changed: Object.keys(body).filter((k) => ['name', 'emoji', 'volume'].includes(k)) });
    changed(req.server.id);
  }
  res.json({ sound: sb.getSound(req.sound.id) });
});

// DELETE /api/servers/:serverId/soundboard/:soundId
serverRouter.delete('/:soundId', requireAuth, loadServer, requireManage, loadSound, (req, res) => {
  db.prepare('DELETE FROM soundboard_sounds WHERE id = ?').run(req.sound.id);
  sb.removeSoundFile(req.sound.url);
  audit.log(req.server.id, req.user.id, 'sound_delete', { type: 'sound', id: req.sound.id, name: req.sound.name });
  changed(req.server.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.serverRouter = serverRouter;
