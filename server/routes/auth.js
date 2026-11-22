const express = require('express');
const { asyncRoute } = require('../asyncRoute');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const limits = require('../limits');
const turnstile = require('../turnstile');
const { DELETED_NAME } = require('../accountDeletion');
const codes = require('../authCodes');
const mail = require('../mail');
const totp = require('../totp');
const { stripPrivate, maskEmail } = require('../userPrivate');

// Conta: cadastro (com e-mail), login por nick OU e-mail, verificação em 2 etapas (app
// autenticador e/ou código por e-mail), confirmar/trocar e-mail e "esqueci minha senha".
// Toda conta precisa de um e-mail CONFIRMADO: sem ele o middleware de login (requireAuth) só
// deixa passar /api/auth/* — o site manda a pessoa pra tela de confirmar (login.html).

const router = express.Router();
const SALT_ROUNDS = 12;
const PENDING_2FA_MS = 10 * 60 * 1000;

// limite simples de tentativas por IP (em memória): como o cadastro agora é aberto, isso segura
// ataque de força bruta em senha e criação de conta em massa sem precisar de nada externo
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = { login: 20, register: 5 };
const attempts = new Map(); // `${kind}:${ip}` -> [timestamps]

function rateLimited(kind, req) {
  const key = `${kind}:${req.ip}`;
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  attempts.set(key, list);
  return list.length > RATE_MAX[kind];
}

setInterval(() => {
  const now = Date.now();
  for (const [key, list] of attempts) {
    const fresh = list.filter((t) => now - t < RATE_WINDOW_MS);
    if (fresh.length) attempts.set(key, fresh); else attempts.delete(key);
  }
}, RATE_WINDOW_MS).unref();

// aceita letras (com acento), números, espaço, _ e - (sem @: o login aceita nick OU e-mail)
const USERNAME_RE = /^[\p{L}0-9 _-]+$/u;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

function cleanEmail(v) {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

function emailTaken(email, exceptUserId = 0) {
  return !!db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id != ?').get(email, exceptUserId);
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 8) return 'senha precisa ter pelo menos 8 caracteres';
  if (password.length > 200) return 'senha comprida demais (máximo 200 caracteres)';
  return null;
}

function userById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// nick ou e-mail (e-mail só vale se estiver confirmado)
function findByLogin(login) {
  const ident = String(login || '').trim();
  if (!ident || ident.length > 254) return null;
  if (ident.includes('@')) return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(ident.toLowerCase());
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(ident.replace(/\s+/g, ' '));
}

function twofaMethods(user) {
  const m = [];
  if (user.totp_enabled && user.totp_secret) m.push('totp');
  if (user.twofa_email && user.email) m.push('email');
  return m;
}

// o que o próprio dono vê de si (o resto do site recebe stripPrivate)
function selfView(user) {
  return {
    ...stripPrivate(user),
    email: user.email || null,
    email_pending: user.email_pending || null,
    needs_email: needsEmail(user),
  };
}

// falta confirmar o e-mail? (só cobra com o envio de e-mail configurado — ver middleware/auth.js)
function needsEmail(user) {
  return !user.email && mail.configured();
}

function startSession(req, user) {
  req.session.userId = user.id;
  req.session.sv = user.session_version || 0;
  req.session.pending2fa = null;
}

async function sendEmailCode(kind, user, to) {
  const code = codes.create(user.id, kind === 'verify' ? 'verify' : kind, to);
  const r = await mail.sendCode(kind, to, code, user.username);
  return r.ok;
}

function cooldownError(res, userId, purpose) {
  const wait = codes.secondsUntilResend(userId, purpose);
  if (wait > 0) {
    res.status(429).json({ error: `espera ${wait}s pra pedir outro código`, retryIn: wait });
    return true;
  }
  return false;
}

function hashRecovery(code) {
  return crypto.createHash('sha256').update(String(code).trim().toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
}

// confere (e gasta) um código de recuperação das 2 etapas
function useRecoveryCode(user, code) {
  let list = [];
  try { list = JSON.parse(user.recovery_codes || '[]'); } catch (_) { list = []; }
  const h = hashRecovery(code);
  const i = list.indexOf(h);
  if (i < 0) return false;
  list.splice(i, 1);
  db.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(list), user.id);
  return true;
}

// confere um segundo fator (app, e-mail ou recuperação). { ok } ou { ok: false, error }
function checkSecondFactor(user, method, code) {
  if (method === 'totp') {
    if (!user.totp_enabled) return { ok: false, error: 'app autenticador não está ligado nessa conta' };
    const step = totp.verify(user.totp_secret, code, { lastStep: user.totp_last_step ?? -1 });
    if (step < 0) return { ok: false, error: 'código do app errado (ou já usado) — confere a hora do celular' };
    db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id);
    return { ok: true };
  }
  if (method === 'email') {
    if (!user.twofa_email || !user.email) return { ok: false, error: 'código por e-mail não está ligado nessa conta' };
    return codes.check(user.id, 'login', code);
  }
  if (method === 'recovery') {
    if (!user.totp_enabled) return { ok: false, error: 'essa conta não tem códigos de recuperação' };
    return useRecoveryCode(user, code) ? { ok: true } : { ok: false, error: 'código de recuperação errado ou já usado' };
  }
  return { ok: false, error: 'método inválido' };
}

// ------------------------------------------------------------------ cadastro e login

// GET /api/auth/config — o que a tela de entrar precisa saber (público)
router.get('/config', (req, res) => {
  res.json({ turnstileSiteKey: turnstile.enabled() ? turnstile.siteKey() : null, contactEmail: process.env.CONTACT_EMAIL || null });
});

// POST /api/auth/register { username, email, password, acceptTerms, turnstileToken? }
router.post('/register', asyncRoute(async (req, res) => {
  if (rateLimited('register', req)) {
    return res.status(429).json({ error: 'muitas contas criadas daqui — tenta de novo daqui a pouco' });
  }
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'usuário, e-mail e senha são obrigatórios' });
  }
  const cleanUsername = username.trim().replace(/\s+/g, ' ');
  if (cleanUsername.length < 2 || cleanUsername.length > 32) {
    return res.status(400).json({ error: 'usuário deve ter entre 2 e 32 caracteres' });
  }
  if (!USERNAME_RE.test(cleanUsername)) {
    return res.status(400).json({ error: 'usuário só pode ter letras, números, espaço, _ ou -' });
  }
  if (DELETED_NAME.test(cleanUsername)) return res.status(400).json({ error: 'esse nome é reservado' });
  const email = cleanEmail(req.body.email);
  if (!email) return res.status(400).json({ error: 'coloque um e-mail válido' });
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (req.body.acceptTerms !== true) {
    return res.status(400).json({ error: 'pra criar a conta, confirme que tem 13 anos ou mais e aceita os termos' });
  }
  if (emailTaken(email)) return res.status(409).json({ error: 'esse e-mail já está em uso' });
  if (!(await turnstile.verify(req.body.turnstileToken, req.ip))) {
    return res.status(400).json({ error: 'a verificação anti-robô falhou — tenta de novo', turnstile: true });
  }

  // sem limite de contas: qualquer um pode se cadastrar. O que controla quem vê o quê agora são
  // os servidores — uma conta nova não enxerga nada até entrar num servidor por convite.
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername)) {
    return res.status(409).json({ error: 'esse usuário já existe' });
  }

  // assíncrono: o cálculo (proposital, ~250 ms) roda fora da thread principal e não trava o site
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // enquanto o hash era calculado, outro pedido pode ter criado o mesmo nome: confere de novo
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername)) {
    return res.status(409).json({ error: 'esse usuário já existe' });
  }
  let result;
  try {
    result = db.prepare("INSERT INTO users (username, password_hash, email_pending, terms_accepted_at) VALUES (?, ?, ?, datetime('now'))").run(cleanUsername, passwordHash, email);
  } catch (_) {
    return res.status(409).json({ error: 'esse usuário já existe' });
  }
  const user = userById(result.lastInsertRowid);
  startSession(req, user);
  const sent = await sendEmailCode('verify', user, email);
  res.status(201).json({ user: selfView(user), needsEmail: needsEmail(user), codeSent: sent });
}));

// POST /api/auth/login { login (nick ou e-mail), password } — `username` ainda vale (app antigo)
router.post('/login', asyncRoute(async (req, res) => {
  if (rateLimited('login', req)) {
    return res.status(429).json({ error: 'muitas tentativas — espera uns minutos e tenta de novo' });
  }
  const body = req.body || {};
  const login = typeof body.login === 'string' ? body.login : body.username;
  const { password } = body;
  if (typeof login !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'nick (ou e-mail) e senha são obrigatórios' });
  }
  // além do limite por IP: limite por CONTA, pra quem tenta a senha de alguém a partir de vários IPs
  if (limits.hit('login-user', login.trim().toLowerCase(), 30, RATE_WINDOW_MS)) {
    return res.status(429).json({ error: 'muitas tentativas nessa conta — espera uns minutos e tenta de novo' });
  }
  if (password.length > 200 || login.length > 254) {
    return res.status(401).json({ error: 'nick/e-mail ou senha incorretos' });
  }

  const user = findByLogin(login);
  // mensagem genérica de propósito, não dá pra saber se a conta existe ou não
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'nick/e-mail ou senha incorretos' });
  }
  if (user.banned_at) {
    return res.status(403).json({ error: user.ban_reason ? `sua conta foi suspensa: ${user.ban_reason}` : 'sua conta foi suspensa' });
  }

  const methods = twofaMethods(user);
  if (methods.length) {
    // senha certa, falta o 2º passo: a sessão ainda NÃO vale
    req.session.userId = null;
    req.session.pending2fa = { uid: user.id, sv: user.session_version || 0, exp: Date.now() + PENDING_2FA_MS };
    let codeSent = false;
    if (methods.length === 1 && methods[0] === 'email' && !codes.secondsUntilResend(user.id, 'login')) {
      codeSent = await sendEmailCode('login', user, user.email);
    }
    return res.json({ twofa: { methods, emailHint: methods.includes('email') ? maskEmail(user.email) : null, codeSent } });
  }
  startSession(req, user);
  res.json({ user: selfView(user), needsEmail: needsEmail(user) });
}));

function pendingUser(req) {
  const p = req.session && req.session.pending2fa;
  if (!p || !p.uid || p.exp < Date.now()) return null;
  const user = userById(p.uid);
  if (!user || (user.session_version || 0) !== p.sv || user.banned_at) return null;
  return user;
}

// POST /api/auth/login/2fa { method: totp|email|recovery, code }
router.post('/login/2fa', (req, res) => {
  const user = pendingUser(req);
  if (!user) return res.status(401).json({ error: 'o login expirou — entre de novo', restart: true });
  if (limits.hit('2fa-login', String(user.id), 10, RATE_WINDOW_MS)) {
    return res.status(429).json({ error: 'muitas tentativas — espera uns minutos' });
  }
  const { method, code } = req.body || {};
  const r = checkSecondFactor(user, method, code);
  if (!r.ok) return res.status(401).json({ error: r.error });
  startSession(req, user);
  res.json({ user: selfView(user), needsEmail: needsEmail(user) });
});

// POST /api/auth/login/2fa/email — manda (de novo) o código de login pro e-mail
router.post('/login/2fa/email', asyncRoute(async (req, res) => {
  const user = pendingUser(req);
  if (!user) return res.status(401).json({ error: 'o login expirou — entre de novo', restart: true });
  if (!twofaMethods(user).includes('email')) return res.status(400).json({ error: 'código por e-mail não está ligado nessa conta' });
  if (cooldownError(res, user.id, 'login')) return;
  const ok = await sendEmailCode('login', user, user.email);
  res.json({ ok, emailHint: maskEmail(user.email) });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// GET /api/auth/me — o próprio usuário, com e-mail e se ainda falta confirmar
router.get('/me', requireAuth, (req, res) => {
  const row = userById(req.user.id);
  res.json({ user: { ...req.user, email: row.email || null, email_pending: row.email_pending || null, needs_email: needsEmail(row) } });
});

// ------------------------------------------------------------------ e-mail da conta

// POST /api/auth/email { email, password? } — põe/troca o e-mail e manda o código pro novo.
// Trocar um e-mail JÁ confirmado pede a senha.
router.post('/email', requireAuth, asyncRoute(async (req, res) => {
  const user = userById(req.user.id);
  const email = cleanEmail((req.body || {}).email);
  if (!email) return res.status(400).json({ error: 'coloque um e-mail válido' });
  if (user.email && user.email.toLowerCase() === email) return res.status(400).json({ error: 'esse já é o seu e-mail' });
  if (user.email) {
    const pw = (req.body || {}).password;
    if (typeof pw !== 'string' || !(await bcrypt.compare(pw, user.password_hash))) {
      return res.status(401).json({ error: 'senha incorreta' });
    }
  }
  if (emailTaken(email, user.id)) return res.status(409).json({ error: 'esse e-mail já está em uso' });
  if (limits.hit('email-code', String(user.id), 8, 30 * 60 * 1000)) {
    return res.status(429).json({ error: 'muitos e-mails pedidos — espera um pouco' });
  }
  if (user.email_pending === email && cooldownError(res, user.id, 'verify')) return;
  db.prepare('UPDATE users SET email_pending = ? WHERE id = ?').run(email, user.id);
  const ok = await sendEmailCode('verify', user, email);
  if (!ok) return res.status(502).json({ error: 'não consegui mandar o e-mail agora — tenta de novo daqui a pouco' });
  res.json({ ok: true, emailPending: email });
}));

// POST /api/auth/email/resend — manda de novo o código pro e-mail pendente
router.post('/email/resend', requireAuth, asyncRoute(async (req, res) => {
  const user = userById(req.user.id);
  if (!user.email_pending) return res.status(400).json({ error: 'nenhum e-mail esperando confirmação' });
  if (cooldownError(res, user.id, 'verify')) return;
  if (limits.hit('email-code', String(user.id), 8, 30 * 60 * 1000)) {
    return res.status(429).json({ error: 'muitos e-mails pedidos — espera um pouco' });
  }
  const ok = await sendEmailCode('verify', user, user.email_pending);
  if (!ok) return res.status(502).json({ error: 'não consegui mandar o e-mail agora — tenta de novo daqui a pouco' });
  res.json({ ok: true });
}));

// POST /api/auth/email/confirm { code }
router.post('/email/confirm', requireAuth, asyncRoute(async (req, res) => {
  const user = userById(req.user.id);
  if (!user.email_pending) return res.status(400).json({ error: 'nenhum e-mail esperando confirmação' });
  const r = codes.check(user.id, 'verify', (req.body || {}).code);
  if (!r.ok) return res.status(400).json({ error: r.error });
  if (r.target !== user.email_pending) return res.status(400).json({ error: 'esse código é de outro e-mail — peça um novo' });
  if (emailTaken(user.email_pending, user.id)) return res.status(409).json({ error: 'esse e-mail acabou de ser usado por outra conta' });
  const old = user.email;
  try {
    db.prepare("UPDATE users SET email = email_pending, email_pending = NULL, email_verified_at = datetime('now') WHERE id = ?").run(user.id);
  } catch (_) {
    return res.status(409).json({ error: 'esse e-mail já está em uso' });
  }
  if (old && old.toLowerCase() !== user.email_pending.toLowerCase()) {
    mail.sendNotice(old, 'o e-mail da sua conta foi trocado', `O e-mail da sua conta no dusky (${user.username}) agora é ${maskEmail(user.email_pending)}.`, user.username);
  }
  res.json({ user: selfView(userById(user.id)) });
}));

// ------------------------------------------------------------------ esqueci minha senha

// POST /api/auth/forgot { login } — sempre responde igual (não entrega se a conta existe)
router.post('/forgot', asyncRoute(async (req, res) => {
  const login = (req.body || {}).login;
  if (limits.hit('forgot-ip', req.ip, 10, 30 * 60 * 1000)) {
    return res.status(429).json({ error: 'muitos pedidos — espera um pouco' });
  }
  const generic = { ok: true, message: 'se essa conta tiver um e-mail confirmado, mandamos um código pra ele' };
  const user = findByLogin(login);
  if (!user || !user.email || user.banned_at) return res.json(generic);
  if (limits.hit('forgot-user', String(user.id), 5, 30 * 60 * 1000) || codes.secondsUntilResend(user.id, 'reset') > 0) {
    return res.json(generic);
  }
  await sendEmailCode('reset', user, user.email);
  res.json(generic);
}));

// POST /api/auth/reset { login, code, password, twofaMethod?, twofaCode? }
// Com app autenticador ligado, a senha nova também pede o código do app (ou um de recuperação):
// só o e-mail não basta pra passar por cima das 2 etapas.
router.post('/reset', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (limits.hit('reset-ip', req.ip, 20, 30 * 60 * 1000)) {
    return res.status(429).json({ error: 'muitas tentativas — espera um pouco' });
  }
  const user = findByLogin(body.login);
  if (!user || !user.email) return res.status(400).json({ error: 'código vencido — peça outro' });
  const pwErr = passwordError(body.password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const r = codes.check(user.id, 'reset', body.code, { consume: false });
  if (!r.ok) return res.status(400).json({ error: r.error });
  if (user.totp_enabled) {
    if (!body.twofaCode) return res.status(400).json({ error: 'essa conta tem app autenticador: coloque o código dele', needTotp: true });
    const f = checkSecondFactor(user, body.twofaMethod === 'recovery' ? 'recovery' : 'totp', body.twofaCode);
    if (!f.ok) return res.status(400).json({ error: f.error, needTotp: true });
  }
  codes.check(user.id, 'reset', body.code); // agora gasta o código
  const hash = await bcrypt.hash(body.password, SALT_ROUNDS);
  // senha nova derruba todas as sessões abertas (session_version)
  db.prepare('UPDATE users SET password_hash = ?, session_version = COALESCE(session_version, 0) + 1 WHERE id = ?').run(hash, user.id);
  require('../realtime').dropUserConnections(user.id, { type: 'session_revoked' });
  mail.sendNotice(user.email, 'sua senha foi trocada', `A senha da sua conta no dusky (${user.username}) acabou de ser redefinida.`, user.username);
  const fresh = userById(user.id);
  startSession(req, fresh);
  res.json({ user: selfView(fresh), needsEmail: false });
}));

module.exports = router;
module.exports.helpers = { cleanEmail, checkSecondFactor, hashRecovery, selfView, twofaMethods };
