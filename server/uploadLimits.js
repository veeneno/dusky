// Limites de anexo do chat, por conta.
//
// Padrão pra todo mundo (dá pra mudar no .env):
//   UPLOAD_MAX_MB=100      tamanho máximo de um arquivo
//   UPLOAD_QUOTA_MB=5120   soma de todos os anexos que a conta já mandou (5 GB)
// No painel de admin (Usuários → limite de anexos) cada conta pode ganhar valores próprios, que
// ficam em users.upload_max_mb / users.upload_quota_mb (null = usa o padrão).
// O admin do site (users.is_site_admin) não tem limite nenhum.
const db = require('./db');

const envMB = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const DEFAULT_MAX_MB = envMB('UPLOAD_MAX_MB', 100);
const DEFAULT_QUOTA_MB = envMB('UPLOAD_QUOTA_MB', 5120);
const MAX_SETTABLE_MB = 100 * 1024; // teto do que o painel aceita (100 GB), só pra barrar número absurdo
const MB = 1024 * 1024;

// quanto a conta já ocupa com anexos enviados pra este servidor (gif do GIPHY não conta: é link)
function usedBytes(userId) {
  const row = db.prepare(
    "SELECT COALESCE(SUM(attachment_size), 0) AS b FROM messages WHERE user_id = ? AND attachment_url LIKE '/uploads/%'"
  ).get(userId);
  return row ? row.b : 0;
}

// { unlimited, maxMB, quotaMB, custom: { maxMB, quotaMB }, usedMB }
// maxBytes/quotaBytes = Infinity quando não há limite
function limitsFor(userId) {
  const row = db.prepare('SELECT is_site_admin, upload_max_mb, upload_quota_mb FROM users WHERE id = ?').get(userId);
  const used = usedBytes(userId);
  const usedMB = Math.round((used / MB) * 10) / 10;
  if (!row) return { unlimited: false, maxBytes: 0, quotaBytes: 0, maxMB: 0, quotaMB: 0, usedBytes: used, usedMB, custom: {} };
  const custom = { maxMB: row.upload_max_mb ?? null, quotaMB: row.upload_quota_mb ?? null };
  if (row.is_site_admin) {
    return { unlimited: true, maxBytes: Infinity, quotaBytes: Infinity, maxMB: null, quotaMB: null, usedBytes: used, usedMB, custom };
  }
  const maxMB = custom.maxMB ?? DEFAULT_MAX_MB;
  const quotaMB = custom.quotaMB ?? DEFAULT_QUOTA_MB;
  return { unlimited: false, maxBytes: maxMB * MB, quotaBytes: quotaMB * MB, maxMB, quotaMB, usedBytes: used, usedMB, custom };
}

// valor vindo do painel: null/'' = volta pro padrão; senão inteiro entre 1 e MAX_SETTABLE_MB
function parseSetting(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SETTABLE_MB) return { ok: false };
  return { ok: true, value: n };
}

function formatMB(mb) {
  if (mb == null) return 'sem limite';
  return mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`;
}

module.exports = { limitsFor, usedBytes, parseSetting, formatMB, DEFAULT_MAX_MB, DEFAULT_QUOTA_MB, MAX_SETTABLE_MB, MB };
