// Cloudflare Turnstile: o "não sou robô" do cadastro (de graça, sem aquele quebra-cabeça chato na
// maioria das vezes). Só liga com as duas chaves no .env:
//   TURNSTILE_SITE_KEY=0x...     (pública — vai pro site)
//   TURNSTILE_SECRET_KEY=0x...   (secreta — só o servidor usa)
// Sem elas o cadastro segue sem a verificação (desenvolvimento, testes).
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function siteKey() {
  return process.env.TURNSTILE_SITE_KEY || '';
}

function enabled() {
  return !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

// true = passou. Qualquer falha (token vazio, vencido, repetido, Cloudflare fora do ar) = false.
async function verify(token, ip) {
  if (!enabled()) return true;
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data.success) console.warn('[turnstile] recusado:', (data['error-codes'] || []).join(', '));
    return !!data.success;
  } catch (err) {
    console.warn('[turnstile] não deu pra verificar:', err.message);
    return false;
  }
}

module.exports = { enabled, siteKey, verify };
