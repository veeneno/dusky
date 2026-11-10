// distribuição do áudio do bot pros ouvintes — UM stream por servidor (cada servidor tem a sua
// fila e a sua música, ver queue.js). Funciona como uma rádio ao vivo: todo mundo conectado
// recebe os mesmos bytes conforme saem do audioPipeline.js, no ritmo real da música.
//
// Quem entra no meio da música: além do "agora", recebe na hora os últimos RING_SECONDS de
// áudio que já passaram. Sem isso o navegador recebia o áudio pingando em tempo real e demorava
// vários segundos juntando dados antes de conseguir começar a tocar. Com essa "rajada" inicial
// ele começa na hora, um pouquinho atrás dos outros — e o app (public/js/app.js, botCatchUp)
// acelera de leve até alcançar, pra todo mundo ouvir sincronizado.
const BITRATE_KBPS = 128; // o mesmo do audioPipeline.js
const BYTES_PER_SEC = (BITRATE_KBPS * 1000) / 8;
const RING_SECONDS = 3;
const RING_BYTES = BYTES_PER_SEC * RING_SECONDS;

const hubs = new Map(); // serverId -> { listeners: Set<res>, ring: Buffer[], ringBytes, lastDataAt }

function hub(serverId) {
  let h = hubs.get(serverId);
  if (!h) {
    h = { listeners: new Set(), ring: [], ringBytes: 0, lastDataAt: 0 };
    hubs.set(serverId, h);
  }
  return h;
}

// ---- quadros de MP3 ----
// a rajada inicial precisa começar exatamente no início de um quadro: começar no meio de um
// quadro faz o decodificador do navegador soltar um estalo (ou demorar pra "achar" o áudio).
// O ffmpeg gera MPEG-1 Layer III (44.1 kHz, 128 kbps), então basta reconhecer esse cabeçalho.
const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG1_RATES = [44100, 48000, 32000, 0];

function frameLengthAt(buf, i) {
  if (i + 4 > buf.length) return 0;
  if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return 0; // sync
  if (((buf[i + 1] >> 3) & 3) !== 3) return 0; // MPEG-1
  if (((buf[i + 1] >> 1) & 3) !== 1) return 0; // Layer III
  const kbps = MPEG1_L3_KBPS[(buf[i + 2] >> 4) & 0xf];
  const rate = MPEG1_RATES[(buf[i + 2] >> 2) & 3];
  if (!kbps || !rate) return 0;
  const padding = (buf[i + 2] >> 1) & 1;
  return Math.floor((144000 * kbps) / rate) + padding;
}

// primeiro ponto do buffer onde começa um quadro de verdade (confirmado pelo quadro seguinte)
function firstFrameOffset(buf) {
  for (let i = 0; i + 4 <= buf.length; i++) {
    const len = frameLengthAt(buf, i);
    if (len && (i + len + 4 > buf.length || frameLengthAt(buf, i + len))) return i;
  }
  return -1;
}

function addListener(serverId, res) {
  const h = hub(serverId);
  if (h.ring.length) {
    const recent = Buffer.concat(h.ring);
    const offset = firstFrameOffset(recent);
    if (offset >= 0) res.write(recent.subarray(offset));
  }
  h.listeners.add(res);
}

function removeListener(serverId, res) {
  const h = hubs.get(serverId);
  if (h) h.listeners.delete(res);
}

function broadcastChunk(serverId, chunk) {
  const h = hub(serverId);
  h.lastDataAt = Date.now();
  h.ring.push(chunk);
  h.ringBytes += chunk.length;
  while (h.ring.length > 1 && h.ringBytes - h.ring[0].length >= RING_BYTES) {
    h.ringBytes -= h.ring.shift().length;
  }
  for (const res of h.listeners) {
    if (res.writableEnded || res.destroyed) { h.listeners.delete(res); continue; }
    res.write(chunk);
  }
}

// música parou de vez (/stop, fila acabou, call esvaziou): quem entrar depois não deve receber o
// finalzinho da música antiga como "rajada"
function reset(serverId) {
  const h = hubs.get(serverId);
  if (!h) return;
  h.ring = [];
  h.ringBytes = 0;
}

// o stream estava parado agora há pouco? (aí a próxima faixa começa mandando uma folga inicial —
// ver initialLeadSec em audioPipeline.js)
function isIdle(serverId, ms = 2000) {
  const h = hubs.get(serverId);
  return !h || Date.now() - h.lastDataAt > ms;
}

function listenerCount(serverId) {
  const h = hubs.get(serverId);
  return h ? h.listeners.size : 0;
}

module.exports = { addListener, removeListener, broadcastChunk, reset, isIdle, listenerCount, BYTES_PER_SEC, firstFrameOffset };
