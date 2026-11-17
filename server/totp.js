// Códigos de app autenticador (TOTP, RFC 6238): Google Authenticator, Authy, 2FAS, Aegis…
// Segredo de 20 bytes em base32, código de 6 dígitos a cada 30 s, HMAC-SHA1 (o que todo app aceita).
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_S = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = ((value << 5) | B32.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(key, counter, digits = DIGITS) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

function currentStep(nowMs = Date.now()) {
  return Math.floor(nowMs / 1000 / STEP_S);
}

// confere um código (aceita 30 s pra trás e pra frente, relógio do celular meio torto). Devolve o
// passo usado, ou -1. `lastStep`: o último passo já aceito — o mesmo código não vale duas vezes.
function verify(secret, code, { lastStep = -1, window = 1, nowMs = Date.now() } = {}) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !secret) return -1;
  const key = base32Decode(secret);
  const now = currentStep(nowMs);
  for (let d = -window; d <= window; d++) {
    const step = now + d;
    if (step <= lastStep) continue;
    const expected = hotp(key, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return -1;
}

function otpauthUri(account, secret, issuer = 'dusky') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;
}

module.exports = { generateSecret, verify, otpauthUri, hotp, base32Encode, base32Decode, currentStep };
