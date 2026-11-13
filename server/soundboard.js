// soundboard: sons curtos de cada servidor que qualquer um numa call toca pra todo mundo da call.
// Igual ao Discord, um som de um servidor pode ser tocado na call de OUTRO servidor (se as duas
// pontas deixarem: a pessoa precisa ser membro do servidor do som, e o servidor da call precisa
// dar "usar sons externos" pra ela).
//
// O áudio não passa pela call (WebRTC): o servidor só avisa "fulano tocou o som X" pra cada pessoa
// da call (realtime.js, soundboard_play) e o navegador de cada um baixa o mp3 e toca sozinho. Por
// isso funciona igual em malha e no servidor de mídia, e cada um controla o volume do soundboard.
//
// No envio, o arquivo (qualquer áudio ou vídeo) passa pelo ffmpeg: corta o trecho escolhido no
// editor (no máximo MAX_SOUND_MS), tira o vídeo e vira mp3 — o que fica no disco já é o som final.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const db = require('./db');
const access = require('./access');
const { UPLOADS_ROOT } = require('./upload');

const MAX_SOUND_MS = 5200;          // mesmo limite do Discord (~5 s)
const MAX_SOUNDS_PER_SERVER = 48;
const NAME_MAX = 32;
const PLAY_COOLDOWN_MS = 1500;      // por pessoa: evita metralhadora de som
const SOUNDS_DIR = path.join(UPLOADS_ROOT, 'sounds');

const SOUND_COLUMNS = 's.id, s.server_id, s.name, s.emoji, s.volume, s.file_url AS url, s.duration_ms, s.created_by, s.created_at';

function cleanName(raw) {
  return typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
}

// um emoji só (ou nada). Aceita sequências com ZWJ/tom de pele, mas nada de letras/números soltos.
function cleanEmoji(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().slice(0, 16);
  if (!v) return null;
  if (/[\p{L}\p{N}\s]/u.test(v.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ''))) return null; // bandeiras usam letras regionais
  return v;
}

function cleanVolume(raw) {
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(1, Math.max(0.05, Math.round(v * 100) / 100)) : 1;
}

function getSound(soundId) {
  return db.prepare(`SELECT ${SOUND_COLUMNS} FROM soundboard_sounds s WHERE s.id = ?`).get(Number(soundId)) || null;
}

function serverSounds(serverId) {
  return db.prepare(`
    SELECT ${SOUND_COLUMNS}, u.username AS created_by_username
    FROM soundboard_sounds s LEFT JOIN users u ON u.id = s.created_by
    WHERE s.server_id = ? ORDER BY s.id
  `).all(serverId);
}

function countSounds(serverId) {
  return db.prepare('SELECT COUNT(*) AS c FROM soundboard_sounds WHERE server_id = ?').get(serverId).c;
}

// tudo que `userId` pode escolher no seletor: os sons de cada servidor de que ela é membro, com o
// que ela pode fazer em cada um (o front decide o que fica apagado conforme a call em que está)
function soundsForUser(userId) {
  const servers = db.prepare(`
    SELECT s.id, s.name, s.icon_url FROM servers s JOIN server_members sm ON sm.server_id = s.id
    WHERE sm.user_id = ? ORDER BY sm.joined_at, s.id
  `).all(userId);
  const out = [];
  for (const s of servers) {
    const perms = access.serverPermissions(s.id, userId);
    out.push({
      ...s,
      permissions: {
        manage_soundboard: perms.manage_soundboard,
        use_soundboard: perms.use_soundboard,
        use_external_sounds: perms.use_external_sounds,
      },
      sounds: db.prepare(`SELECT ${SOUND_COLUMNS} FROM soundboard_sounds s WHERE s.server_id = ? ORDER BY s.id`).all(s.id),
    });
  }
  return out;
}

// pode `userId`, numa call do servidor `callServerId`, tocar `sound`? Devolve null (pode) ou o motivo.
function playDenied(userId, callServerId, sound) {
  if (!sound) return 'esse som não existe mais';
  if (!access.isServerMember(sound.server_id, userId)) return 'você não está no servidor desse som';
  const perms = access.serverPermissions(callServerId, userId);
  if (!perms.use_soundboard) return 'seu cargo não pode usar o soundboard nessa call';
  if (sound.server_id !== callServerId && !perms.use_external_sounds) return 'esse servidor não deixa usar sons de outros servidores';
  return null;
}

const lastPlayAt = new Map(); // userId -> horário do último som
function takeCooldown(userId) {
  const now = Date.now();
  if (now - (lastPlayAt.get(userId) || 0) < PLAY_COOLDOWN_MS) return false;
  lastPlayAt.set(userId, now);
  return true;
}

// ------------------------------------------------------------------
// ffmpeg: corta e converte o arquivo enviado
// ------------------------------------------------------------------

function parseTime(raw, fallback) {
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

// inputPath = arquivo temporário do upload; start/end em segundos (o editor do site manda).
// Devolve { fileUrl, durationMs }. Sempre apaga o temporário.
async function processUpload(inputPath, startRaw, endRaw) {
  const { ensureFfmpeg } = require('./bots/musicBot/binaries');
  try {
    const ffmpeg = await ensureFfmpeg();
    const start = parseTime(startRaw, 0);
    let end = parseTime(endRaw, start + MAX_SOUND_MS / 1000);
    if (end <= start) end = start + MAX_SOUND_MS / 1000;
    const length = Math.min(MAX_SOUND_MS / 1000, end - start);

    fs.mkdirSync(SOUNDS_DIR, { recursive: true });
    const name = crypto.randomBytes(16).toString('hex') + '.mp3';
    const outPath = path.join(SOUNDS_DIR, name);
    const args = [
      '-hide_banner', '-nostdin', '-y',
      '-ss', start.toFixed(3), '-t', length.toFixed(3), '-i', inputPath,
      '-vn', '-sn', '-dn', '-map_metadata', '-1',
      // fade bem curtinho nas pontas: o corte no meio de uma onda dá um "tec" no começo/fim
      '-af', `afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, length - 0.03).toFixed(3)}:d=0.03`,
      '-ac', '2', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '160k',
      outPath,
    ];
    const stderr = await new Promise((resolve, reject) => {
      execFile(ffmpeg, args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (err, _out, errOut) => {
        if (err) return reject(new Error('não deu pra ler esse arquivo de áudio'));
        resolve(String(errOut || ''));
      });
    });
    // duração real = último "time=" do progresso do ffmpeg
    const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    const last = times[times.length - 1];
    const durationMs = last ? Math.round(((+last[1]) * 3600 + (+last[2]) * 60 + (+last[3])) * 1000) : Math.round(length * 1000);
    const size = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
    if (!size || durationMs < 50) {
      fs.unlink(outPath, () => {});
      throw new Error('esse arquivo não tem som nesse trecho');
    }
    return { fileUrl: `/uploads/sounds/${name}`, durationMs: Math.min(durationMs, MAX_SOUND_MS) };
  } finally {
    fs.unlink(inputPath, () => {});
  }
}

function removeSoundFile(url) {
  if (!url || !url.startsWith('/uploads/sounds/')) return;
  fs.unlink(path.join(UPLOADS_ROOT, 'sounds', path.basename(url)), () => {});
}

module.exports = {
  MAX_SOUND_MS, MAX_SOUNDS_PER_SERVER, NAME_MAX,
  cleanName, cleanEmoji, cleanVolume,
  getSound, serverSounds, countSounds, soundsForUser,
  playDenied, takeCooldown, processUpload, removeSoundFile,
};
