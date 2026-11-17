// Página /admin: só admin entra, e as rotas novas (sistema, números, ao vivo, detalhes da conta,
// deslogar, excluir, logs e registro de ações) respondem e registram o que o admin fez.
process.env.DUSKY_DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieSession = require('cookie-session');
const db = require('../server/db');
const mail = require('../server/mail');
mail.sendNotice = async () => ({ ok: true });
const logBuffer = require('../server/logBuffer');

let server, base;
before(async () => {
  logBuffer.install();
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'session', keys: ['teste'], sameSite: 'lax' }));
  app.use('/api/auth', require('../server/routes/auth'));
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
      method, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let data = null;
    try { data = await res.json(); } catch (_) { /* sem corpo */ }
    return { status: res.status, data };
  };
}
async function account(name, admin = false) {
  const bcrypt = require('bcrypt');
  const id = Number(db.prepare("INSERT INTO users (username, password_hash, email, email_verified_at, is_site_admin) VALUES (?, ?, ?, datetime('now'), ?)")
    .run(name, await bcrypt.hash('senha1234', 4), `${name}@teste.local`, admin ? 1 : 0).lastInsertRowid);
  const b = browser();
  assert.equal((await b('POST', '/api/auth/login', { login: name, password: 'senha1234' })).status, 200);
  return { id, b };
}

test('rotas novas do admin: só pra admin e com os dados certos', async () => {
  const adm = await account('chefe', true);
  const ze = await account('ze');
  const s = Number(db.prepare("INSERT INTO servers (name, owner_id) VALUES ('roda', ?)").run(adm.id).lastInsertRowid);
  const ch = Number(db.prepare("INSERT INTO channels (name, type, server_id) VALUES ('geral', 'text', ?)").run(s).lastInsertRowid);
  for (const u of [adm.id, ze.id]) db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(s, u);
  db.prepare('INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)').run(ch, ze.id, 'oi');

  for (const p of ['/system', '/stats', '/live', `/users/${ze.id}/details`, '/logs', '/actions']) {
    assert.equal((await ze.b('GET', `/api/admin${p}`)).status, 403, p);
  }
  const sys = await adm.b('GET', '/api/admin/system');
  assert.equal(sys.status, 200);
  assert.ok(sys.data.host.cpus > 0 && sys.data.process.rssMB > 0);
  assert.equal(typeof sys.data.services.mail, 'boolean');

  const st = await adm.b('GET', '/api/admin/stats?days=7');
  assert.equal(st.data.days.length, 7);
  assert.equal(st.data.days.at(-1).messages, 1);
  assert.equal(st.data.totals.users, 2);
  assert.equal(st.data.topUsers[0].username, 'ze');

  assert.equal((await adm.b('GET', '/api/admin/live')).status, 200);
  const det = await adm.b('GET', `/api/admin/users/${ze.id}/details`);
  assert.equal(det.data.user.email, 'ze@teste.local');
  assert.equal(det.data.servers[0].name, 'roda');
  assert.equal(det.data.messages.total, 1);

  console.log('linha de teste do log [teste-admin]');
  const logs = await adm.b('GET', '/api/admin/logs?q=teste-admin');
  assert.ok(logs.data.lines.some((l) => l.text.includes('[teste-admin]')));
  const after = await adm.b('GET', `/api/admin/logs?after=${logs.data.last}`);
  assert.equal(after.data.lines.length, 0);

  // deslogar de tudo
  assert.equal((await adm.b('POST', `/api/admin/users/${ze.id}/logout`)).status, 200);
  assert.equal((await ze.b('GET', '/api/auth/me')).status, 401);
  // admin não mexe em admin
  assert.equal((await adm.b('POST', `/api/admin/users/${adm.id}/logout`)).status, 403);
  // excluir: precisa do nome certo
  assert.equal((await adm.b('POST', `/api/admin/users/${ze.id}/delete`, { username: 'outro' })).status, 400);
  const del = await adm.b('POST', `/api/admin/users/${ze.id}/delete`, { username: 'ze', deleteMessages: true });
  assert.equal(del.status, 200);
  assert.equal(del.data.removedMessages, 1);
  assert.ok(db.prepare('SELECT deleted_at FROM users WHERE id = ?').get(ze.id).deleted_at);

  const acts = await adm.b('GET', '/api/admin/actions');
  assert.deepEqual(acts.data.actions.map((a) => a.action), ['excluiu a conta (e as mensagens)', 'deslogou de todos os aparelhos']);
  assert.equal(acts.data.actions[0].admin, 'chefe');
});
