// mundinho 3D (ver docs/MUNDINHO.md): regras do servidor pras posições dos bonecos numa call-mundo.
// As cenas ficam em public/world/scenes/<nome>.json e são lidas aqui E pelo site, pra os dois
// concordarem sobre limites, assentos e ponto de nascer. Aqui só se confere o básico — que a pessoa
// não saia da sala e que ninguém sente em cima de ninguém. Colisão com móveis é coisa do site.
const path = require('path');
const fs = require('fs');

const SCENES_DIR = path.join(__dirname, '..', 'public', 'world', 'scenes');
const DEFAULT_SCENE = 'penthouse';
const ACTIONS = new Set(['stand', 'walk', 'sit', 'wave', 'dance']);
const MOVES_PER_SECOND = 20;

const scenes = new Map();
function getScene(id) {
  const key = /^[a-z0-9-]{1,32}$/.test(String(id || '')) ? String(id) : DEFAULT_SCENE;
  if (!scenes.has(key)) {
    try {
      scenes.set(key, JSON.parse(fs.readFileSync(path.join(SCENES_DIR, `${key}.json`), 'utf8')));
    } catch (_) {
      if (key === DEFAULT_SCENE) throw new Error('cena padrão do mundinho não encontrada');
      return getScene(DEFAULT_SCENE);
    }
  }
  return scenes.get(key);
}

function isValidScene(id) {
  return typeof id === 'string' && /^[a-z0-9-]{1,32}$/.test(id) && fs.existsSync(path.join(SCENES_DIR, `${id}.json`));
}

const round2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function normAngle(a) {
  let v = Number(a) || 0;
  v = ((v + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return round2(v);
}

// onde alguém aparece ao entrar: perto do spawn, espalhado pra não nascer todo mundo empilhado
function spawn(sceneId) {
  const s = getScene(sceneId);
  const sp = s.spawn;
  const ang = Math.random() * Math.PI * 2;
  const r = Math.random() * (sp.spread || 1);
  return {
    x: round2(clamp(sp.x + Math.cos(ang) * r, s.bounds.minX, s.bounds.maxX)),
    y: round2(sp.y || 0),
    z: round2(clamp(sp.z + Math.sin(ang) * r, s.bounds.minZ, s.bounds.maxZ)),
    ry: normAngle(sp.ry || 0),
    action: 'stand',
    seat: null,
  };
}

// valida um world_move. `occupied(seatId)` diz se outra pessoa da call já está naquele assento.
// Devolve { state, corrected } — corrected = o servidor mudou algo (o site precisa se ajustar).
function applyMove(sceneId, prev, msg, occupied) {
  const s = getScene(sceneId);
  const b = s.bounds;
  let action = ACTIONS.has(msg.action) ? msg.action : 'stand';
  let corrected = false;
  const x = Number(msg.x);
  const z = Number(msg.z);
  const y = Number(msg.y);
  const next = {
    x: round2(clamp(Number.isFinite(x) ? x : prev.x, b.minX, b.maxX)),
    // altura (andares/escada): o site calcula pelas superfícies da cena; aqui só não deixa voar
    y: round2(clamp(Number.isFinite(y) ? y : (prev.y || 0), 0, b.maxY != null ? b.maxY : 0)),
    z: round2(clamp(Number.isFinite(z) ? z : prev.z, b.minZ, b.maxZ)),
    ry: normAngle(msg.ry),
    action,
    seat: null,
  };
  if (next.x !== round2(x) || next.z !== round2(z)) corrected = true;
  if (action === 'sit') {
    const seat = s.seats.find((st) => st.id === msg.seat);
    if (!seat || (prev.seat !== seat.id && occupied(seat.id))) {
      // assento inválido ou ocupado: fica em pé onde estava
      return { state: { ...prev, action: 'stand', seat: null }, corrected: true };
    }
    // sentado = encaixado no assento (posição e direção do assento, não as que o site mandou)
    if (Math.abs(next.x - seat.x) > 0.05 || Math.abs(next.z - seat.z) > 0.05) corrected = true;
    Object.assign(next, { x: round2(seat.x), y: round2(seat.floor || 0), z: round2(seat.z), ry: normAngle(seat.ry), seat: seat.id });
  }
  return { state: next, corrected };
}

// limite de mensagens por conexão (balde simples por segundo)
function allowMove(ws) {
  const now = Date.now();
  if (!ws.worldBucket || now - ws.worldBucket.t >= 1000) ws.worldBucket = { t: now, n: 0 };
  ws.worldBucket.n++;
  return ws.worldBucket.n <= MOVES_PER_SECOND;
}

// ------------------------------------------------------------------
// TV da cena: cada call-mundo tem uma. Desligada, mostrando a tela de alguém da call, ou um vídeo
// do YouTube que toca sincronizado pra todo mundo (o servidor guarda onde o vídeo estava e quando).
// ------------------------------------------------------------------

// aceita link do YouTube (watch, youtu.be, shorts, embed, live, music) ou o próprio id
function parseYoutubeId(raw) {
  const v = String(raw || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  let u;
  try { u = new URL(v.startsWith('http') ? v : `https://${v}`); } catch (_) { return null; }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

// tempo onde começa (link com ?t=90 ou t=1m30s)
function parseYoutubeStart(raw) {
  try {
    const u = new URL(String(raw).startsWith('http') ? raw : `https://${raw}`);
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
  } catch (_) { return 0; }
}

const TV_OFF = { mode: 'off' };

// aplica um pedido na TV. ctx: { userId, now, screenOn(userId) } -> { tv } ou { error }
function applyTv(prev, msg, ctx) {
  const tv = prev || TV_OFF;
  const op = msg && msg.op;
  const pos = (v) => clamp(Number(v) || 0, 0, 24 * 3600);
  switch (op) {
    case 'off':
      return { tv: TV_OFF };
    case 'screen': {
      const target = Number(msg.userId);
      if (!target || !ctx.screenOn(target)) return { error: 'essa pessoa não está compartilhando a tela' };
      return { tv: { mode: 'screen', userId: target, by: ctx.userId } };
    }
    case 'youtube': {
      const videoId = parseYoutubeId(msg.url);
      if (!videoId) return { error: 'não reconheci esse link do YouTube' };
      return { tv: { mode: 'youtube', videoId, playing: true, position: parseYoutubeStart(msg.url), refAt: ctx.now, by: ctx.userId } };
    }
    case 'play':
    case 'pause':
    case 'seek': {
      if (tv.mode !== 'youtube') return { error: 'a TV não está passando um vídeo' };
      const playing = op === 'seek' ? tv.playing : op === 'play';
      return { tv: { ...tv, playing, position: pos(msg.position), refAt: ctx.now } };
    }
    default:
      return { error: 'pedido inválido' };
  }
}

// mesa de jogos da cadeira `seatId` (ou null)
function tableForSeat(sceneId, seatId) {
  if (!seatId) return null;
  return (getScene(sceneId).tables || []).find((t) => t.seats.includes(seatId)) || null;
}
function tableById(sceneId, tableId) {
  return (getScene(sceneId).tables || []).find((t) => t.id === tableId) || null;
}
function pianoSeat(sceneId) {
  const p = getScene(sceneId).piano;
  return p ? p.seat : null;
}

module.exports = { DEFAULT_SCENE, applyTv, tableForSeat, tableById, pianoSeat, parseYoutubeId, TV_OFF, getScene, isValidScene, spawn, applyMove, allowMove };
