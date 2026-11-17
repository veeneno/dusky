const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const limits = require('../limits');
const totp = require('../totp');
const mail = require('../mail');
const { helpers } = require('./auth');
const { deleteAccount } = require('../accountDeletion');

// Segurança da conta (configurações → senha e sessão): verificação em 2 etapas pelo app
// autenticador e/ou por código no e-mail, e os códigos de recuperação do app.

const router = express.Router();
router.use(requireAuth, limits.perUser('account-security', 30, 15 * 60 * 1000, 'muitas tentativas — espera uns minutos'));

function me(req) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
}

async function passwordOk(user, password) {
  return typeof password === 'string' && password.length <= 200 && bcrypt.compare(password, user.password_hash);
}

function newRecoveryCodes() {
  const plain = [];
  for (let i = 0; i < 8; i++) {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 caracteres
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { plain, hashed: plain.map((c) => helpers.hashRecovery(c)) };
}

function securityView(user) {
  let left = 0;
  try { left = JSON.parse(user.recovery_codes || '[]').length; } catch (_) { left = 0; }
  return {
    email: user.email || null,
    emailPending: user.email_pending || null,
    totp: !!user.totp_enabled,
    email2fa: !!user.twofa_email,
    recoveryLeft: user.totp_enabled ? left : 0,
    mailConfigured: mail.configured(),
  };
}

// GET /api/account/security
router.get('/security', (req, res) => res.json(securityView(me(req))));

// POST /api/account/totp/setup { password } -> { secret, uri, qr } (ainda não liga)
router.post('/totp/setup', async (req, res) => {
  const user = me(req);
  if (!(await passwordOk(user, (req.body || {}).password))) return res.status(401).json({ error: 'senha incorreta' });
  if (user.totp_enabled) return res.status(400).json({ error: 'o app autenticador já está ligado' });
  const secret = totp.generateSecret();
  db.prepare('UPDATE users SET totp_pending_secret = ? WHERE id = ?').run(secret, user.id);
  const uri = totp.otpauthUri(user.username, secret);
  const svg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.json({ secret: secret.replace(/(.{4})/g, '$1 ').trim(), uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` });
});

// POST /api/account/totp/enable { code } -> { recoveryCodes } (mostrados UMA vez)
router.post('/totp/enable', (req, res) => {
  const user = me(req);
  if (!user.totp_pending_secret) return res.status(400).json({ error: 'comece de novo: clique em "ligar" outra vez' });
  const step = totp.verify(user.totp_pending_secret, (req.body || {}).code);
  if (step < 0) return res.status(400).json({ error: 'código errado — confere se a hora do celular está certa' });
  const rc = newRecoveryCodes();
  db.prepare('UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled = 1, totp_last_step = ?, recovery_codes = ? WHERE id = ?')
    .run(step, JSON.stringify(rc.hashed), user.id);
  if (user.email) mail.sendNotice(user.email, 'verificação em 2 etapas ligada', 'O app autenticador foi ligado na sua conta do dusky.', user.username);
  res.json({ recoveryCodes: rc.plain, ...securityView(me(req)) });
});

// POST /api/account/totp/disable { password, code, method? (totp|recovery) }
router.post('/totp/disable', async (req, res) => {
  const user = me(req);
  const body = req.body || {};
  if (!user.totp_enabled) return res.status(400).json({ error: 'o app autenticador não está ligado' });
  if (!(await passwordOk(user, body.password))) return res.status(401).json({ error: 'senha incorreta' });
  const f = helpers.checkSecondFactor(user, body.method === 'recovery' ? 'recovery' : 'totp', body.code);
  if (!f.ok) return res.status(400).json({ error: f.error });
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_pending_secret = NULL, totp_last_step = NULL, recovery_codes = NULL WHERE id = ?').run(user.id);
  if (user.email) mail.sendNotice(user.email, 'app autenticador desligado', 'O app autenticador foi desligado da sua conta do dusky.', user.username);
  res.json(securityView(me(req)));
});

// POST /api/account/recovery { password, code } -> novos códigos (os antigos param de valer)
router.post('/recovery', async (req, res) => {
  const user = me(req);
  const body = req.body || {};
  if (!user.totp_enabled) return res.status(400).json({ error: 'ligue o app autenticador primeiro' });
  if (!(await passwordOk(user, body.password))) return res.status(401).json({ error: 'senha incorreta' });
  const f = helpers.checkSecondFactor(user, 'totp', body.code);
  if (!f.ok) return res.status(400).json({ error: f.error });
  const rc = newRecoveryCodes();
  db.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(rc.hashed), user.id);
  res.json({ recoveryCodes: rc.plain, ...securityView(me(req)) });
});

// POST /api/account/email2fa { enabled, password }
router.post('/email2fa', async (req, res) => {
  const user = me(req);
  const body = req.body || {};
  if (!user.email) return res.status(400).json({ error: 'confirme um e-mail primeiro' });
  if (!(await passwordOk(user, body.password))) return res.status(401).json({ error: 'senha incorreta' });
  const on = !!body.enabled;
  db.prepare('UPDATE users SET twofa_email = ? WHERE id = ?').run(on ? 1 : 0, user.id);
  mail.sendNotice(user.email, on ? 'código por e-mail ligado' : 'código por e-mail desligado',
    on ? 'A partir de agora, entrar no dusky pede um código mandado pra este e-mail.' : 'Entrar no dusky não pede mais o código por e-mail.', user.username);
  res.json(securityView(me(req)));
});

// ------------------------------------------------------------------ seus dados (LGPD)

// GET /api/account/export — tudo que a conta tem aqui, num JSON pra baixar
router.get('/export', (req, res) => {
  if (limits.hit('account-export', String(req.user.id), 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'você já baixou várias vezes — espera um pouco' });
  }
  const u = me(req);
  const servers = db.prepare(`SELECT s.id, s.name, sm.joined_at, (s.owner_id = ?) AS owner
    FROM server_members sm JOIN servers s ON s.id = sm.server_id WHERE sm.user_id = ? ORDER BY s.id`).all(u.id, u.id)
    .map((s) => ({ ...s, owner: !!s.owner }));
  const messages = db.prepare(`
    SELECT m.id, m.created_at, m.edited, m.content, m.attachment_name, m.attachment_url, m.reply_to_id,
           c.id AS channel_id, c.name AS channel, s.name AS server,
           CASE WHEN c.server_id IS NULL THEN (
             SELECT group_concat(u2.username, ', ') FROM dm_members dm JOIN users u2 ON u2.id = dm.user_id
             WHERE dm.channel_id = c.id AND dm.user_id != m.user_id) END AS dm_with
    FROM messages m JOIN channels c ON c.id = m.channel_id LEFT JOIN servers s ON s.id = c.server_id
    WHERE m.user_id = ? ORDER BY m.id`).all(u.id);
  const reactions = db.prepare('SELECT message_id, emoji, created_at FROM message_reactions WHERE user_id = ? ORDER BY created_at').all(u.id);
  let theme = null;
  try { theme = u.theme_json ? JSON.parse(u.theme_json) : null; } catch (_) { theme = null; }
  const data = {
    exportado_em: new Date().toISOString(),
    conta: {
      id: u.id, nome: u.username, email: u.email, criada_em: u.created_at, termos_aceitos_em: u.terms_accepted_at,
      bio: u.bio, status: u.status_text, foto: u.avatar_url, banner: u.banner_url,
      cores: [u.accent_color, u.accent_color_2].filter(Boolean),
      verificacao_2_etapas: { app: !!u.totp_enabled, email: !!u.twofa_email },
    },
    tema: theme,
    servidores: servers,
    mensagens: messages,
    reacoes: reactions,
  };
  res.attachment('dusky-meus-dados.json');
  res.type('application/json');
  res.send(JSON.stringify(data, null, 2));
});

// POST /api/account/delete { password, code?, method? (totp|recovery), deleteMessages? }
router.post('/delete', async (req, res) => {
  const user = me(req);
  const body = req.body || {};
  if (limits.hit('account-delete', String(user.id), 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'muitas tentativas — espera um pouco' });
  }
  if (user.is_site_admin) return res.status(400).json({ error: 'a conta de admin do site não pode ser excluída por aqui' });
  if (!(await passwordOk(user, body.password))) return res.status(401).json({ error: 'senha incorreta' });
  if (user.totp_enabled) {
    const f = helpers.checkSecondFactor(user, body.method === 'recovery' ? 'recovery' : 'totp', body.code);
    if (!f.ok) return res.status(400).json({ error: f.error, needTotp: true });
  }
  const owned = db.prepare('SELECT name FROM servers WHERE owner_id = ? ORDER BY id').all(user.id);
  if (owned.length) {
    return res.status(409).json({ error: `você ainda é dono de: ${owned.map((s) => s.name).join(', ')}. Apague esses servidores antes de excluir a conta.` });
  }
  const email = user.email;
  const result = deleteAccount(user, { deleteMessages: !!body.deleteMessages });
  if (email) {
    Promise.resolve(mail.sendNotice(email, 'sua conta foi excluída',
      'Sua conta do dusky foi excluída, como você pediu. Seus dados pessoais foram apagados' +
      (body.deleteMessages ? ', junto com as suas mensagens.' : '; as mensagens que você mandou ficam nas conversas como "conta excluída".'),
      user.username)).catch(() => {});
  }
  req.session = null;
  res.json({ ok: true, ...result });
});

module.exports = router;
