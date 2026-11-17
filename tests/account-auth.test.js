// Conta: e-mail obrigatório e confirmado, login por nick ou e-mail, 2 etapas (app e e-mail),
// códigos de recuperação e "esqueci minha senha" — pelas rotas de verdade, com sessão em cookie.
process.env.DUSKY_DB_PATH = ':memory:';
process.env.RESEND_API_KEY = 're_teste'; // "configurado" (o envio de verdade é trocado abaixo)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieSession = require('cookie-session');
const db = require('../server/db');
const mail = require('../server/mail');
const totp = require('../server/totp');
const { requireAuth } = require('../server/middleware/auth');

const sent = []; // códigos "mandados" por e-mail
mail.sendCode = async (kind, to, code) => { sent.push({ kind, to, code }); return { ok: true }; };
mail.sendNotice = async () => ({ ok: true });
const lastCode = (kind, to) => [...sent].reverse().find((s) => s.kind === kind && (!to || s.to === to)).code;

let server, base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'session', keys: ['teste'], sameSite: 'lax' }));
  app.use('/api/auth', require('../server/routes/auth'));
  app.use('/api/account', require('../server/routes/account'));
  app.get('/api/x', requireAuth, (req, res) => res.json({ ok: true, user: req.user }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((r) => server.close(r)); db.close(); });

// navegador de mentira: guarda os cookies da sessão
function browser() {
  const jar = new Map();
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* sem corpo */ }
    return { status: res.status, data };
  };
}

// conta já com e-mail confirmado (direto no banco: o cadastro de verdade tem limite de 5 por IP,
// e já é testado logo abaixo), logada num navegador novo
async function newAccount(name, email, password = 'senha123') {
  const bcrypt = require('bcrypt');
  db.prepare("INSERT INTO users (username, password_hash, email, email_verified_at) VALUES (?, ?, ?, datetime('now'))")
    .run(name, await bcrypt.hash(password, 4), email);
  const b = browser();
  assert.equal((await b('POST', '/api/auth/login', { login: name, password })).status, 200);
  return b;
}

test('cadastro pede e-mail e a conta fica presa até confirmar', async () => {
  const b = browser();
  assert.equal((await b('POST', '/api/auth/register', { username: 'ana', password: 'senha123' })).status, 400);
  assert.equal((await b('POST', '/api/auth/register', { username: 'ana', email: 'nao-e-email', password: 'senha123' })).status, 400);
  const r = await b('POST', '/api/auth/register', { username: 'ana', email: 'Ana@Exemplo.com', password: 'senha123', acceptTerms: true });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.password_hash, undefined);
  const blocked = await b('GET', '/api/x');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.needsEmail, true);
  assert.equal((await b('GET', '/api/auth/me')).data.user.needs_email, true);
  assert.equal((await b('POST', '/api/auth/email/confirm', { code: '000000' === lastCode('verify') ? '111111' : '000000' })).status, 400);
  const ok = await b('POST', '/api/auth/email/confirm', { code: lastCode('verify', 'ana@exemplo.com') });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.email, 'ana@exemplo.com');
  const me = await b('GET', '/api/x');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, undefined, 'o e-mail não entra no req.user (vai pra outras pessoas)');
});

test('conta antiga sem e-mail é obrigada a adicionar um', async () => {
  const bcrypt = require('bcrypt');
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('antigo', await bcrypt.hash('senha123', 4));
  const b = browser();
  const l = await b('POST', '/api/auth/login', { login: 'antigo', password: 'senha123' });
  assert.equal(l.status, 200);
  assert.equal(l.data.needsEmail, true);
  assert.equal((await b('GET', '/api/x')).status, 403);
  assert.equal((await b('POST', '/api/auth/email', { email: 'antigo@exemplo.com' })).status, 200);
  assert.equal((await b('POST', '/api/auth/email/confirm', { code: lastCode('verify', 'antigo@exemplo.com') })).status, 200);
  assert.equal((await b('GET', '/api/x')).status, 200);
});

test('login por nick ou por e-mail; e-mail repetido é recusado', async () => {
  await newAccount('bruno', 'bruno@exemplo.com');
  for (const login of ['bruno', 'BRUNO', 'bruno@exemplo.com', 'Bruno@Exemplo.COM']) {
    const r = await browser()('POST', '/api/auth/login', { login, password: 'senha123' });
    assert.equal(r.status, 200, login);
  }
  assert.equal((await browser()('POST', '/api/auth/login', { login: 'bruno@exemplo.com', password: 'errada' })).status, 401);
  const dup = await browser()('POST', '/api/auth/register', { username: 'outro', email: 'BRUNO@exemplo.com', password: 'senha123', acceptTerms: true });
  assert.equal(dup.status, 409);
});

test('2 etapas pelo app autenticador, com código de recuperação', async () => {
  const b = await newAccount('carla', 'carla@exemplo.com');
  assert.equal((await b('POST', '/api/account/totp/setup', { password: 'errada' })).status, 401);
  const setup = await b('POST', '/api/account/totp/setup', { password: 'senha123' });
  assert.equal(setup.status, 200);
  assert.match(setup.data.uri, /^otpauth:\/\/totp\//);
  assert.match(setup.data.qr, /^data:image\/svg\+xml;base64,/);
  const secret = setup.data.secret.replace(/\s/g, '');
  const step = totp.currentStep();
  const en = await b('POST', '/api/account/totp/enable', { code: totp.hotp(totp.base32Decode(secret), step) });
  assert.equal(en.status, 200);
  assert.equal(en.data.recoveryCodes.length, 8);

  const c = browser();
  const l = await c('POST', '/api/auth/login', { login: 'carla', password: 'senha123' });
  assert.deepEqual(l.data.twofa.methods, ['totp']);
  assert.equal((await c('GET', '/api/x')).status, 401, 'só a senha não abre a sessão');
  assert.equal((await c('POST', '/api/auth/login/2fa', { method: 'totp', code: totp.hotp(totp.base32Decode(secret), step) })).status, 401, 'código já usado');
  const ok = await c('POST', '/api/auth/login/2fa', { method: 'totp', code: totp.hotp(totp.base32Decode(secret), step + 1) });
  assert.equal(ok.status, 200);
  assert.equal((await c('GET', '/api/x')).status, 200);

  const d = browser();
  await d('POST', '/api/auth/login', { login: 'carla@exemplo.com', password: 'senha123' });
  const rc = en.data.recoveryCodes[0];
  assert.equal((await d('POST', '/api/auth/login/2fa', { method: 'recovery', code: rc.toUpperCase() })).status, 200);
  const e = browser();
  await e('POST', '/api/auth/login', { login: 'carla', password: 'senha123' });
  assert.equal((await e('POST', '/api/auth/login/2fa', { method: 'recovery', code: rc })).status, 401, 'recuperação vale uma vez só');
});

test('2 etapas por e-mail', async () => {
  const b = await newAccount('davi', 'davi@exemplo.com');
  assert.equal((await b('POST', '/api/account/email2fa', { enabled: true, password: 'senha123' })).status, 200);
  const c = browser();
  const l = await c('POST', '/api/auth/login', { login: 'davi', password: 'senha123' });
  assert.deepEqual(l.data.twofa.methods, ['email']);
  assert.equal(l.data.twofa.codeSent, true);
  assert.equal((await c('POST', '/api/auth/login/2fa', { method: 'email', code: lastCode('login', 'davi@exemplo.com') })).status, 200);
  assert.equal((await c('GET', '/api/x')).status, 200);
});

test('esqueci a senha: código no e-mail, app autenticador junto, sessões antigas caem', async () => {
  const old = await newAccount('eva', 'eva@exemplo.com');
  const generic = await browser()('POST', '/api/auth/forgot', { login: 'ninguem-aqui' });
  assert.equal(generic.status, 200);
  const r = browser();
  assert.equal((await r('POST', '/api/auth/forgot', { login: 'eva' })).status, 200);
  const code = lastCode('reset', 'eva@exemplo.com');
  assert.equal((await r('POST', '/api/auth/reset', { login: 'eva', code: '999999' === code ? '888888' : '999999', password: 'novasenha' })).status, 400);
  const ok = await r('POST', '/api/auth/reset', { login: 'eva', code, password: 'novasenha' });
  assert.equal(ok.status, 200);
  assert.equal((await r('GET', '/api/x')).status, 200, 'já entra com a senha nova');
  assert.equal((await old('GET', '/api/x')).status, 401, 'a sessão de antes cai');
  assert.equal((await browser()('POST', '/api/auth/login', { login: 'eva', password: 'senha123' })).status, 401);
  assert.equal((await browser()('POST', '/api/auth/login', { login: 'eva', password: 'novasenha' })).status, 200);

  // com app autenticador, só o e-mail não basta
  const b = await newAccount('fabio', 'fabio@exemplo.com');
  const setup = await b('POST', '/api/account/totp/setup', { password: 'senha123' });
  const key = totp.base32Decode(setup.data.secret.replace(/\s/g, ''));
  const step = totp.currentStep();
  await b('POST', '/api/account/totp/enable', { code: totp.hotp(key, step) });
  const f = browser();
  await f('POST', '/api/auth/forgot', { login: 'fabio@exemplo.com' });
  const fcode = lastCode('reset', 'fabio@exemplo.com');
  const need = await f('POST', '/api/auth/reset', { login: 'fabio', code: fcode, password: 'novasenha' });
  assert.equal(need.status, 400);
  assert.equal(need.data.needTotp, true);
  const done = await f('POST', '/api/auth/reset', { login: 'fabio', code: fcode, password: 'novasenha', twofaCode: totp.hotp(key, step + 1) });
  assert.equal(done.status, 200);
});
