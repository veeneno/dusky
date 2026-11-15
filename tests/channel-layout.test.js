// Lateral no estilo do Discord: arrastar pra reordenar (PUT /api/servers/:id/layout), canal privado
// na criação e categorias padrão de servidor novo. HTTP real + SQLite em memória.
process.env.DUSKY_DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../server/db');
const access = require('../server/access');
let server, base;
before(async () => {
  for (let i = 1; i <= 4; i++) db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(i, 'user' + i, 'test');
  db.prepare("INSERT INTO servers (id, name, owner_id) VALUES (1, 'one', 1), (2, 'two', 4)").run();
  for (let i = 1; i <= 3; i++) db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (1, ?)').run(i);
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (2, 4)').run();
  db.prepare(`INSERT INTO channels (id, name, type, server_id, position) VALUES (1,'geral','text',1,0),(2,'memes','text',1,1),(3,'voz','voice',1,0),(4,'alheio','text',2,0)`).run();
  db.prepare("INSERT INTO channel_categories (id, server_id, name, position) VALUES (1,1,'a',0),(2,1,'b',1),(3,2,'alheia',0)").run();
  db.prepare(`INSERT INTO roles (id,server_id,name,is_admin,permissions_json) VALUES (1,1,'mod',0,'{"manage_channels":true}'),(2,1,'membro',0,'{}')`).run();
  db.prepare('INSERT INTO member_roles (server_id,user_id,role_id) VALUES (1,2,1),(1,3,2)').run();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: Number(req.headers['x-user']), sv: 0 }; next(); });
  app.use('/api/servers', require('../server/routes/servers'));
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise(r => server.close(r)); db.close(); });
async function api(user, method, path, body) {
  const res = await fetch(base + '/api' + path, { method, headers: { 'x-user': String(user), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => null); return { status: res.status, data };
}

test('layout: reordena categorias e move canais entre categorias de uma vez', async () => {
  const r = await api(2, 'PUT', '/servers/1/layout', {
    categories: [{ id: 2, position: 0 }, { id: 1, position: 1 }],
    channels: [{ id: 2, category_id: 2, position: 0 }, { id: 1, category_id: null, position: 0 }],
  });
  assert.equal(r.status, 200);
  const cats = db.prepare('SELECT id FROM channel_categories WHERE server_id = 1 ORDER BY position').all().map(c => c.id);
  assert.deepEqual(cats, [2, 1]);
  assert.equal(access.getChannel(2).category_id, 2);
  assert.equal(access.getChannel(1).category_id, null);
});

test('layout: sem permissão, categoria/canal de outro servidor e posição inválida são recusados', async () => {
  assert.equal((await api(3, 'PUT', '/servers/1/layout', { categories: [{ id: 1, position: 0 }] })).status, 403);
  assert.equal((await api(2, 'PUT', '/servers/1/layout', { categories: [{ id: 3, position: 0 }] })).status, 400);
  assert.equal((await api(2, 'PUT', '/servers/1/layout', { channels: [{ id: 4, category_id: null, position: 0 }] })).status, 400);
  assert.equal((await api(2, 'PUT', '/servers/1/layout', { channels: [{ id: 1, category_id: 3, position: 0 }] })).status, 400);
  assert.equal((await api(2, 'PUT', '/servers/1/layout', { channels: [{ id: 1, category_id: null, position: -1 }] })).status, 400);
  assert.equal((await api(2, 'PUT', '/servers/1/layout', { channels: 'x' })).status, 400);
  assert.equal(access.getChannel(4).server_id, 2);
});

test('criar canal: vai pro fim da categoria e "privado" nasce escondido de quem não é admin', async () => {
  const pub = await api(1, 'POST', '/servers/1/channels', { name: 'Novo Canal', type: 'text', category_id: 1 });
  assert.equal(pub.status, 201);
  assert.equal(pub.data.channel.name, 'novo-canal');
  const priv = await api(1, 'POST', '/servers/1/channels', { name: 'segredo', type: 'voice', category_id: 1, private: true });
  assert.equal(priv.status, 201);
  assert.equal(priv.data.channel.private_view, true);
  assert.ok(priv.data.channel.position > pub.data.channel.position);
  const seen = (await api(3, 'GET', '/servers/1/channels')).data.channels.map(c => c.id);
  assert.ok(seen.includes(pub.data.channel.id));
  assert.ok(!seen.includes(priv.data.channel.id));
  // quem gerencia canais mas não vê o privado não consegue movê-lo
  assert.equal((await api(2, 'PUT', '/servers/1/layout', { channels: [{ id: priv.data.channel.id, category_id: null, position: 0 }] })).status, 403);
});

test('servidor novo já vem com as categorias de texto e de voz', async () => {
  const r = await api(3, 'POST', '/servers', { name: 'meu' });
  assert.equal(r.status, 201);
  const cats = db.prepare('SELECT id, name FROM channel_categories WHERE server_id = ? ORDER BY position').all(r.data.server.id);
  assert.deepEqual(cats.map(c => c.name), ['canais de texto', 'canais de voz']);
  const byName = Object.fromEntries(r.data.channels.map(c => [c.name, c.category_id]));
  assert.equal(byName.geral, cats[0].id);
  assert.equal(byName.Geral, cats[1].id);
});
