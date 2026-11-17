// distribuição do áudio do bot pros ouvintes — UM stream por servidor (cada servidor tem a sua
// fila e a sua música, ver queue.js). Funciona como uma rádio ao vivo: todo mundo conectado
// recebe os mesmos bytes conforme saem do audioPipeline.js, no ritmo real da música.
//
// Três cuidados pra todo mundo ouvir junto e sem demora:
//
//  1. Rajada pra quem entra no meio: além do "agora", recebe na hora os últimos RING_SECONDS de
//     áudio. Sem isso o navegador recebia o áudio pingando em tempo real e demorava vários segundos
//     juntando dados antes de começar. RING_SECONDS fica perto da reserva que os outros ouvintes
//     já mantêm (BOT_TARGET_LEAD_S no app), então quem entra cai praticamente no mesmo ponto.
//
//  2. Silêncio quando não tem música (entre faixas, pausado, antes do primeiro /play): o stream
//     nunca fica mudo de bytes. Antes ele parava de mandar dados, e o player do navegador (e o
//     túnel) entendiam como conexão travada — quando a música voltava, o player às vezes demorava
//     pra "acordar" e cada um voltava num ponto diferente. Com o silêncio, o player segue tocando
//     ao vivo o tempo todo e a próxima música começa na hora, igual pra todo mundo.
//
//  3. Só quadros de MP3 inteiros saem daqui: o metrônomo do audioPipeline corta os bytes em
//     qualquer ponto, e intercalar silêncio no meio de um quadro cortado daria estalo.
const BITRATE_KBPS = 128; // o mesmo do audioPipeline.js
const BYTES_PER_SEC = (BITRATE_KBPS * 1000) / 8;
const RING_SECONDS = 1.5;
const RING_BYTES = BYTES_PER_SEC * RING_SECONDS;
const SILENCE_AFTER_MS = 250;   // sem música há esse tempo = começa a mandar silêncio
const FILLER_TICK_MS = 100;

const hubs = new Map(); // serverId -> { listeners, ring, ringBytes, lastDataAt, pending, fillAt, fillDebt }

function hub(serverId) {
  let h = hubs.get(serverId);
  if (!h) {
    h = { listeners: new Set(), ring: [], ringBytes: 0, lastDataAt: 0, pending: null, fillAt: 0, fillDebt: 0 };
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

// separa os quadros inteiros do que chegou; o pedaço incompleto do fim fica guardado pro próximo
function takeWholeFrames(h, chunk) {
  const buf = h.pending ? Buffer.concat([h.pending, chunk]) : chunk;
  h.pending = null;
  let start = 0;
  if (frameLengthAt(buf, 0) === 0) {
    start = firstFrameOffset(buf);
    if (start < 0) {
      // nada reconhecível ainda: guarda um pouco (o cabeçalho pode estar dividido), descarta o resto
      h.pending = buf.length > 8192 ? null : Buffer.from(buf);
      return null;
    }
  }
  let i = start;
  for (;;) {
    const len = frameLengthAt(buf, i);
    if (!len || i + len > buf.length) break; // fim, ou quadro incompleto: espera o resto
    i += len;
  }
  if (i < buf.length) h.pending = Buffer.from(buf.subarray(i));
  return i > start ? buf.subarray(start, i) : null;
}

// ---- silêncio ----
// quadro MPEG-1 Layer III 128 kbps 44.1 kHz estéreo, sem padding, com informação lateral toda
// zerada: o decodificador entende como 1152 amostras de silêncio absoluto
const SILENT_FRAME = (() => {
  const f = Buffer.alloc(417);
  f[0] = 0xff; f[1] = 0xfb; f[2] = 0x90; f[3] = 0x00;
  return f;
})();
const FRAME_SEC = 1152 / 44100;
const silence = (frames) => (frames === 1 ? SILENT_FRAME : Buffer.concat(new Array(frames).fill(SILENT_FRAME)));

function writeAll(h, data) {
  for (const res of h.listeners) {
    if (res.writableEnded || res.destroyed) { h.listeners.delete(res); continue; }
    res.write(data);
  }
}

const fillerTimer = setInterval(() => {
  const now = Date.now();
  for (const h of hubs.values()) {
    if (!h.listeners.size || now - h.lastDataAt < SILENCE_AFTER_MS) { h.fillAt = 0; h.fillDebt = 0; continue; }
    if (!h.fillAt) { h.fillAt = now; continue; }
    // manda o silêncio no ritmo real (não adianta mandar a mais: só atrasaria todo mundo)
    h.fillDebt += (now - h.fillAt) / 1000;
    h.fillAt = now;
    const frames = Math.floor(h.fillDebt / FRAME_SEC);
    if (frames <= 0) continue;
    h.fillDebt -= frames * FRAME_SEC;
    writeAll(h, silence(frames));
  }
}, FILLER_TICK_MS);
fillerTimer.unref();

function addListener(serverId, res) {
  const h = hub(serverId);
  if (h.ring.length && Date.now() - h.lastDataAt < SILENCE_AFTER_MS) {
    // música tocando: rajada com os últimos segundos pra começar na hora
    // só os últimos RING_BYTES (um pedaço grande, como a folga inicial da música, não pode virar
    // uma rajada longa), começando num quadro inteiro
    const all = Buffer.concat(h.ring);
    const recent = all.subarray(Math.max(0, all.length - RING_BYTES));
    const offset = firstFrameOffset(recent);
    if (offset >= 0) res.write(recent.subarray(offset));
  } else {
    // sem música agora: um pouquinho de silêncio pro player já começar a tocar (e ficar ao vivo)
    res.write(silence(Math.ceil(RING_SECONDS / FRAME_SEC)));
  }
  h.listeners.add(res);
}

function removeListener(serverId, res) {
  const h = hubs.get(serverId);
  if (h) h.listeners.delete(res);
}

function broadcastChunk(serverId, chunk) {
  const h = hub(serverId);
  const frames = takeWholeFrames(h, chunk);
  if (!frames) return;
  h.lastDataAt = Date.now();
  h.ring.push(frames);
  h.ringBytes += frames.length;
  while (h.ring.length > 1 && h.ringBytes - h.ring[0].length >= RING_BYTES) {
    h.ringBytes -= h.ring.shift().length;
  }
  writeAll(h, frames);
}

// música parou de vez (/stop, fila acabou, call esvaziou): quem entrar depois não deve receber o
// finalzinho da música antiga como "rajada"
function reset(serverId) {
  const h = hubs.get(serverId);
  if (!h) return;
  h.ring = [];
  h.ringBytes = 0;
  h.pending = null;
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

module.exports = { addListener, removeListener, broadcastChunk, reset, isIdle, listenerCount, BYTES_PER_SEC, firstFrameOffset, SILENT_FRAME };
