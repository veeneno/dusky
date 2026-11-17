// LGPD e moderação: trocar senha derruba os outros aparelhos, exportar dados, excluir conta e
// denúncias (com o painel do admin do site) — pelas rotas de verdade, com sessão em cookie.
process.env.DUSKY_DB_PATH = ':memory:';
process.env.RESEND_API_KEY = 're_teste';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const db = require('../server/db');
const mail = require('../server/mail');
mail.sendCode = async () => ({ ok: true });
mail.sendNotice = async () => ({ ok: true });

let server, base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'session', keys: ['teste'], sameSite: 'lax' }));
  app.use('/api/auth', require('../server/routes/auth'));
  app.use('/api/account', require('../server/routes/account'));
  app.use('/api/profile', require('../server/routes/profile'));
  app.use('/api/reports', require('../server/routes/reports'));
  app.use('/api/admin', require('../server/routes/admin'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((r) => server.close(r)); db.close(); });

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
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}

async function account(name, { admin = false, password = 'senha1234' } = {}) {
  const bcrypt = require('bcrypt');
  const r = db.prepare("INSERT INTO users (username, password_hash, email, email_verified_at, is_site_admin) VALUES (?, ?, ?, datetime('now'), ?)")
    .run(name, await bcrypt.hash(password, 4), `${name}@teste.local`, admin ? 1 : 0);
  const b = browser();
  assert.equal((await b('POST', '/api/auth/login', { login: name, password })).status, 200);
  return { id: Number(r.lastInsertRowid), b };
}

function serverWith(ownerId, memberIds) {
  const s = db.prepare('INSERT INTO servers (name, owner_id) VALUES (?, ?)').run(`srv${ownerId}-${Date.now()}`, ownerId).lastInsertRowid;
  const ch = db.prepare("INSERT INTO channels (name, type, server_id) VALUES ('geral', 'text', ?)").run(s).lastInsertRowid;
  for (const id of [ownerId, ...memberIds]) db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(s, id);
  return { serverId: Number(s), channelId: Number(ch) };
}
const say = (channelId, userId, content, attachment_url = null) =>
  Number(db.prepare('INSERT INTO messages (channel_id, user_id, content, attachment_url, attachment_name) VALUES (?, ?, ?, ?, ?)')
    .run(channelId, userId, content, attachment_url, attachment_url ? 'foto.png' : null).lastInsertRowid);

test('trocar a senha desloga os outros aparelhos e mantém este', async () => {
  const { b } = await account('carla');
  const outro = browser();
  assert.equal((await outro('POST', '/api/auth/login', { login: 'carla', password: 'senha1234' })).status, 200);
  assert.equal((await b('POST', '/api/profile/password', { currentPassword: 'senha1234', newPassword: 'curta' })).status, 400);
  assert.equal((await b('POST', '/api/profile/password', { currentPassword: 'senha1234', newPassword: 'nova-senha-boa' })).status, 200);
  assert.equal((await b('GET', '/api/auth/me')).status, 200);
  assert.equal((await outro('GET', '/api/auth/me')).status, 401);
});

test('cadastro: precisa aceitar os termos (13+) e nome de conta excluída é reservado', async () => {
  const b = browser();
  const base = { username: 'novato', email: 'novato@teste.local', password: 'senha1234' };
  assert.equal((await b('POST', '/api/auth/register', base)).status, 400);
  assert.equal((await b('POST', '/api/auth/register', { ...base, username: 'Conta Excluída 9', acceptTerms: true })).status, 400);
  assert.equal((await b('POST', '/api/auth/register', { ...base, password: 'curta', acceptTerms: true })).status, 400);
  const ok = await b('POST', '/api/auth/register', { ...base, acceptTerms: true });
  assert.equal(ok.status, 201);
  assert.ok(db.prepare('SELECT terms_accepted_at FROM users WHERE username = ?').get('novato').terms_accepted_at);
  const cfg = await browser()('GET', '/api/auth/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.turnstileSiteKey, null);
});

test('exportar dados traz conta, servidores e mensagens', async () => {
  const dani = await account('dani');
  const { channelId } = serverWith(dani.id, []);
  say(channelId, dani.id, 'oi do export');
  const r = await dani.b('GET', '/api/account/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal(r.data.conta.nome, 'dani');
  assert.equal(r.data.conta.email, 'dani@teste.local');
  assert.equal(r.data.servidores.length, 1);
  assert.ok(r.data.mensagens.some((m) => m.content === 'oi do export'));
});

test('excluir conta: pede senha, bloqueia dono de servidor e anonimiza', async () => {
  const dono = await account('edu');
  const fabi = await account('fabi');
  const { serverId, channelId } = serverWith(dono.id, [fabi.id]);
  const msgId = say(channelId, fabi.id, 'mensagem que fica');

  assert.equal((await dono.b('POST', '/api/account/delete', { password: 'senha1234' })).status, 409);
  assert.equal((await fabi.b('POST', '/api/account/delete', { password: 'errada' })).status, 401);
  const r = await fabi.b('POST', '/api/account/delete', { password: 'senha1234' });
  assert.equal(r.status, 200);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(fabi.id);
  assert.equal(row.username, `conta excluída ${fabi.id}`);
  assert.equal(row.email, null);
  assert.ok(row.deleted_at);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM server_members WHERE user_id = ?').get(fabi.id).n, 0);
  assert.ok(db.prepare('SELECT 1 FROM messages WHERE id = ?').get(msgId), 'sem deleteMessages a mensagem fica');
  assert.equal((await fabi.b('GET', '/api/auth/me')).status, 401);
  assert.equal((await browser()('POST', '/api/auth/login', { login: 'fabi', password: 'senha1234' })).status, 401);
  assert.equal((await browser()('POST', '/api/auth/login', { login: 'fabi@teste.local', password: 'senha1234' })).status, 401);

  // com deleteMessages, as mensagens vão junto
  const gabi = await account('gabi');
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(serverId, gabi.id);
  const gMsg = say(channelId, gabi.id, 'some junto');
  assert.equal((await gabi.b('POST', '/api/account/delete', { password: 'senha1234', deleteMessages: true })).status, 200);
  assert.equal(db.prepare('SELECT 1 FROM messages WHERE id = ?').get(gMsg), undefined);
});

test('denúncias: só quem vê a mensagem denuncia, e o admin resolve guardando a prova', async () => {
  const admin = await account('chefe', { admin: true });
  const hugo = await account('hugo');
  const ivo = await account('ivo');
  const estranho = await account('juca');
  const { channelId } = serverWith(hugo.id, [ivo.id]);

  // anexo de verdade no disco, pra conferir a prova
  const name = 'ab'.repeat(16) + '.png';
  const file = path.join(__dirname, '..', 'public', 'uploads', 'attachments', name);
  fs.writeFileSync(file, 'PNGFALSO');
  const msgId = say(channelId, ivo.id, 'mensagem ruim', `/uploads/attachments/${name}`);

  assert.equal((await estranho.b('POST', '/api/reports', { messageId: msgId, reason: 'spam' })).status, 404);
  assert.equal((await ivo.b('POST', '/api/reports', { messageId: msgId, reason: 'spam' })).status, 400);
  assert.equal((await hugo.b('POST', '/api/reports', { messageId: msgId, reason: 'nada' })).status, 400);
  assert.equal((await hugo.b('POST', '/api/reports', { messageId: msgId, reason: 'harassment', details: 'me xingou' })).status, 201);
  assert.equal((await hugo.b('POST', '/api/reports', { messageId: msgId, reason: 'harassment' })).data.duplicate, true);
  assert.equal((await hugo.b('POST', '/api/reports', { userId: estranho.id, reason: 'spam' })).status, 404);
  assert.equal((await hugo.b('POST', '/api/reports', { userId: ivo.id, reason: 'spam' })).status, 201);

  assert.equal((await hugo.b('GET', '/api/admin/reports')).status, 403);
  const list = await admin.b('GET', '/api/admin/reports');
  assert.equal(list.status, 200);
  assert.equal(list.data.open, 2);
  const rep = list.data.reports.find((r) => r.message_id === msgId);
  assert.equal(rep.snapshot.content, 'mensagem ruim');
  assert.equal(rep.has_evidence, true);
  assert.equal(rep.reporter, 'hugo');

  const del = await admin.b('POST', `/api/admin/reports/${rep.id}/delete-message`);
  assert.equal(del.data.deleted, true);
  assert.equal(db.prepare('SELECT 1 FROM messages WHERE id = ?').get(msgId), undefined);
  assert.equal(fs.existsSync(file), false, 'o anexo some do site');
  const ev = await admin.b('GET', `/api/admin/reports/${rep.id}/evidence`);
  assert.equal(ev.status, 200);
  assert.equal(ev.data, 'PNGFALSO', 'mas a prova continua guardada');
  assert.match(ev.headers.get('content-disposition'), /attachment/);

  const other = list.data.reports.find((r) => !r.message_id);
  assert.equal((await admin.b('POST', `/api/admin/reports/${other.id}`, { status: 'dismissed' })).status, 200);
  assert.equal((await admin.b('GET', '/api/admin/reports')).data.open, 0);
  assert.equal((await admin.b('GET', '/api/admin/reports?status=closed')).data.reports.length, 2);
  fs.rmSync(path.join(__dirname, '..', 'server', 'reports-evidence', `${rep.id}-${name}`), { force: true });
});
