// Códigos de 6 dígitos mandados por e-mail: confirmar e-mail, esqueci a senha e 2 etapas por e-mail.
// Guardados só como hash; valem 15 min, aceitam 5 tentativas e um novo substitui o anterior.
const crypto = require('crypto');
const db = require('./db');

const TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 45 * 1000;

function hashCode(userId, purpose, code) {
  return crypto.createHash('sha256').update(`${userId}:${purpose}:${code}`).digest('hex');
}

// purpose: verify | reset | login. target: o e-mail que recebeu (confirmar e-mail: o novo)
function create(userId, purpose, target) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare('DELETE FROM auth_codes WHERE user_id = ? AND purpose = ?').run(userId, purpose);
  db.prepare('INSERT INTO auth_codes (user_id, purpose, target, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, purpose, target || null, hashCode(userId, purpose, code), Date.now() + TTL_MS, Date.now());
  return code;
}

// pode mandar outro? (um a cada 45 s por conta e por tipo)
function secondsUntilResend(userId, purpose) {
  const row = db.prepare('SELECT created_at FROM auth_codes WHERE user_id = ? AND purpose = ?').get(userId, purpose);
  if (!row) return 0;
  return Math.max(0, Math.ceil((row.created_at + RESEND_MS - Date.now()) / 1000));
}

// confere. { ok, target } ou { ok: false, error }. consume=false: só confere (sem apagar)
function check(userId, purpose, code, { consume = true } = {}) {
  const clean = String(code || '').replace(/\s+/g, '');
  const row = db.prepare('SELECT * FROM auth_codes WHERE user_id = ? AND purpose = ?').get(userId, purpose);
  if (!row || row.expires_at < Date.now()) return { ok: false, error: 'código vencido — peça outro' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'muitas tentativas erradas — peça outro código' };
  const given = Buffer.from(hashCode(userId, purpose, clean));
  const stored = Buffer.from(row.code_hash);
  if (!/^\d{6}$/.test(clean) || given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return { ok: false, error: 'código errado' };
  }
  if (consume) db.prepare('DELETE FROM auth_codes WHERE id = ?').run(row.id);
  return { ok: true, target: row.target };
}

function clear(userId, purpose) {
  db.prepare('DELETE FROM auth_codes WHERE user_id = ? AND purpose = ?').run(userId, purpose);
}

// faxina dos vencidos
setInterval(() => {
  try { db.prepare('DELETE FROM auth_codes WHERE expires_at < ?').run(Date.now() - TTL_MS); } catch (_) { /* ok */ }
}, 60 * 60 * 1000).unref();

module.exports = { create, check, clear, secondsUntilResend };
