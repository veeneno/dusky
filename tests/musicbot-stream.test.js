// stream do bot de música: só quadros de MP3 inteiros saem, silêncio quando não tem música (o
// player nunca "dorme") e quem entra no meio recebe uma rajada curta (fica junto dos outros).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const stream = require('../server/bots/musicBot/stream');

// quadro MPEG-1 L3 128 kbps 44.1 kHz com um byte marcador no corpo (pra saber de onde veio)
function frame(mark) {
  const f = Buffer.alloc(417, 0);
  f[0] = 0xff; f[1] = 0xfb; f[2] = 0x90; f[3] = 0x00; f[100] = mark;
  return f;
}
function listener() {
  const out = [];
  return { out, res: { writableEnded: false, destroyed: false, write: (b) => out.push(Buffer.from(b)) } };
}
// confere que o fluxo é uma sequência de quadros inteiros, do início ao fim
function framesOf(buf) {
  const marks = [];
  for (let i = 0; i < buf.length; i += 417) {
    assert.equal(buf[i], 0xff, `quadro quebrado no byte ${i}`);
    assert.equal(buf[i + 1], 0xfb);
    marks.push(buf[i + 100]);
  }
  assert.equal(buf.length % 417, 0, 'sobrou pedaço de quadro');
  return marks;
}

test('pedaços cortados no meio do quadro saem como quadros inteiros', () => {
  const l = listener();
  stream.addListener(9001, l.res);
  const prelude = Buffer.concat(l.out).length; // silêncio inicial (nada tocando ainda)
  const music = Buffer.concat([frame(1), frame(2), frame(3), frame(4)]);
  stream.broadcastChunk(9001, music.subarray(0, 500));   // 1 quadro e um pedaço
  stream.broadcastChunk(9001, music.subarray(500, 1300)); // termina o 2º, começa o 4º
  stream.broadcastChunk(9001, music.subarray(1300));
  const all = Buffer.concat(l.out);
  const marks = framesOf(all);
  assert.deepEqual(marks.slice(prelude / 417), [1, 2, 3, 4]);
  stream.removeListener(9001, l.res);
});

test('sem música: manda silêncio no ritmo real (o player não para)', async () => {
  const l = listener();
  stream.addListener(9002, l.res);
  const start = Buffer.concat(l.out).length;
  assert.ok(start > 0, 'quem entra sem música já recebe um pouco de silêncio');
  await new Promise((r) => setTimeout(r, 1300));
  const got = Buffer.concat(l.out);
  const marks = framesOf(got);
  assert.ok(marks.every((m) => m === 0), 'só silêncio');
  const extraSec = ((got.length - start) / 417) * (1152 / 44100);
  assert.ok(extraSec > 0.6 && extraSec < 1.6, `silêncio no ritmo real (veio ${extraSec.toFixed(2)} s em ~1,3 s)`);
  stream.removeListener(9002, l.res);
});

test('quem entra com música tocando recebe rajada curta (no máximo ~1,5 s)', () => {
  const frames = [];
  for (let i = 0; i < 200; i++) frames.push(frame(7)); // ~5 s de música
  stream.broadcastChunk(9003, Buffer.concat(frames));
  const l = listener();
  stream.addListener(9003, l.res);
  const sec = (Buffer.concat(l.out).length / 417) * (1152 / 44100);
  assert.ok(sec > 0.5 && sec <= 1.6, `rajada de ${sec.toFixed(2)} s`);
  framesOf(Buffer.concat(l.out));
  stream.removeListener(9003, l.res);
});
