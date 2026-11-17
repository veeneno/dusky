// Envio de e-mail pelo Resend (https://resend.com — API HTTP, sem SMTP).
//   .env: RESEND_API_KEY=re_...   MAIL_FROM="dusky <noreply@veneno.space>"
// Sem a chave o e-mail NÃO sai: o conteúdo (com o código) vai pro log do servidor, pra dar pra
// testar antes de configurar — só quem tem acesso ao servidor vê.
const SITE_NAME = 'dusky';

function configured() {
  return !!process.env.RESEND_API_KEY;
}

async function send({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || `${SITE_NAME} <noreply@veneno.space>`;
  if (!key) {
    console.log(`[mail] RESEND_API_KEY não configurada — e-mail NÃO enviado. Para ${to} | ${subject}\n${text}`);
    return { ok: true, simulated: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[mail] Resend recusou (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[mail] falha ao falar com o Resend:', err.message);
    return { ok: false };
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const KINDS = {
  verify: { subject: 'seu código pra confirmar o e-mail', lead: 'Use este código pra confirmar seu e-mail no dusky:' },
  reset: { subject: 'seu código pra criar uma senha nova', lead: 'Alguém (tomara que você) pediu pra redefinir a senha da sua conta no dusky. Use este código:' },
  login: { subject: 'seu código pra entrar', lead: 'Use este código pra terminar de entrar no dusky:' },
};

// e-mail com um código de 6 dígitos
function codeMessage(kind, code, username) {
  const k = KINDS[kind];
  const hi = username ? `Oi, ${username}!` : 'Oi!';
  const tail = 'O código vale por 15 minutos. Se não foi você, é só ignorar este e-mail.';
  return {
    subject: `${code} — ${k.subject}`,
    text: `${hi}\n\n${k.lead}\n\n${code}\n\n${tail}\n\n— ${SITE_NAME}`,
    html: `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e1f22">
  <p style="font-size:16px">${escapeHtml(hi)}</p>
  <p style="font-size:15px;line-height:1.5">${escapeHtml(k.lead)}</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:24px 0;color:#5865f2">${code}</p>
  <p style="font-size:13px;color:#5c5e66;line-height:1.5">${escapeHtml(tail)}</p>
  <p style="font-size:13px;color:#5c5e66">— ${SITE_NAME}</p>
</div>`,
  };
}

// aviso sem código (ex: "seu e-mail foi trocado", "2 etapas desligadas")
function noticeMessage(subject, body, username) {
  const hi = username ? `Oi, ${username}!` : 'Oi!';
  const tail = 'Se não foi você, troque sua senha agora e fale com o admin do servidor.';
  return {
    subject,
    text: `${hi}\n\n${body}\n\n${tail}\n\n— ${SITE_NAME}`,
    html: `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e1f22">
  <p style="font-size:16px">${escapeHtml(hi)}</p><p style="font-size:15px;line-height:1.5">${escapeHtml(body)}</p>
  <p style="font-size:13px;color:#5c5e66;line-height:1.5">${escapeHtml(tail)}</p><p style="font-size:13px;color:#5c5e66">— ${SITE_NAME}</p></div>`,
  };
}

async function sendCode(kind, to, code, username) {
  return send({ to, ...codeMessage(kind, code, username) });
}

async function sendNotice(to, subject, body, username) {
  return send({ to, ...noticeMessage(subject, body, username) });
}

module.exports = { configured, send, sendCode, sendNotice };
