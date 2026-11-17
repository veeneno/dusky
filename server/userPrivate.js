// Campos da tabela users que NUNCA saem pra outras pessoas (perfil, membros, broadcast de
// "profile_updated"...). Quem monta um usuário a partir de `SELECT *` passa por aqui.
// O próprio dono vê o e-mail e o estado das 2 etapas por /api/auth/me e /api/account/security.
const PRIVATE_FIELDS = [
  'password_hash',
  'email',
  'email_pending',
  'email_verified_at',
  'totp_secret',
  'totp_pending_secret',
  'totp_enabled',
  'totp_last_step',
  'twofa_email',
  'recovery_codes',
];

function stripPrivate(row) {
  if (!row) return null;
  const out = { ...row };
  for (const f of PRIVATE_FIELDS) delete out[f];
  return out;
}

// "ve****@gmail.com" — pra mostrar pra onde foi um código sem entregar o e-mail inteiro
function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  const keep = name.length <= 2 ? 1 : 2;
  return `${name.slice(0, keep)}${'*'.repeat(Math.max(2, name.length - keep))}@${domain}`;
}

module.exports = { PRIVATE_FIELDS, stripPrivate, maskEmail };
