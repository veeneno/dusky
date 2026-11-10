'use strict';
// Gera build/icon.png (512x512): quadrado arredondado azul-violeta com um balão de conversa.
// É um ícone provisório — pra trocar, é só colocar outro PNG de 512x512 (ou maior) em build/icon.png.
//   node build/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;
const SS = 3; // supersampling por eixo, pra bordas suaves

function roundRectDist(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

function inTriangle(px, py, a, b, c) {
  const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const p = [px, py];
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function sample(x, y) {
  if (roundRectDist(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return [0, 0, 0, 0];
  const t = (x + y) / 2;
  let rgb = [88 + (59 - 88) * t, 101 + (70 - 101) * t, 242 + (199 - 242) * t]; // #5865F2 -> #3B46C7
  const inBubble =
    roundRectDist(x, y, 0.5, 0.45, 0.29, 0.2, 0.12) <= 0 ||
    inTriangle(x, y, [0.3, 0.6], [0.3, 0.77], [0.47, 0.62]);
  if (inBubble) {
    rgb = [255, 255, 255];
    for (const dx of [-0.12, 0, 0.12]) {
      if (Math.hypot(x - (0.5 + dx), y - 0.45) <= 0.04) rgb = [88, 101, 242];
    }
  }
  return [rgb[0], rgb[1], rgb[2], 255];
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0; // filtro "nenhum"
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const s = sample((px + (sx + 0.5) / SS) / SIZE, (py + (sy + 0.5) / SS) / SIZE);
        r += s[0] * s[3]; g += s[1] * s[3]; b += s[2] * s[3]; a += s[3];
      }
    }
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    if (a > 0) {
      raw[o] = Math.round(r / a); raw[o + 1] = Math.round(g / a); raw[o + 2] = Math.round(b / a);
      raw[o + 3] = Math.round(a / (SS * SS));
    }
  }
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, 'icon.png');
fs.writeFileSync(out, png);
console.log('ok:', out, `(${png.length} bytes)`);
