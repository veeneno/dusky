// Bloquear e fechar DM: regras em server/access.js, rotas em routes/blocks.js e routes/dms.js.
// HTTP real + SQLite em memória.
process.env.DUSKY_DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../server/db');
const access = require('../server/access');
let server, base;
before(async () => {
  for (let i = 1; i <= 4; i++) db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(i, 'bloq' + i, 'test');
  db.prepare("UPDATE users SET email = username || '@teste.local' WHERE email IS NULL").run();
  db.prepare("INSERT INTO servers (id, name, owner_id) VALUES (1, 'um', 1)").run();
  for (let i = 1; i <= 3; i++) db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (1, ?)').run(i);
  // 4 não divide servidor com ninguém
  db.prepare("INSERT INTO channels (id, name, type, server_id) VALUES (1, 'geral', 'text', 1), (2, 'dm', 'text', NULL)").run();
  db.prepare('INSERT INTO dm_members (channel_id, user_id) VALUES (2, 1), (2, 2)').run();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: Number(req.headers['x-user']), sv: 0 }; next(); });
  app.use('/api/blocks', require('../server/routes/blocks'));
  app.use('/api/dms', require('../server/routes/dms'));
  app.use('/api/channels/:channelId/messages', require('../server/routes/messages'));
  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise((r) => server.close(r)); db.close(); });
async function api(user, method, path, body) {
  const res = await fetch(base + '/api' + path, { method, headers: { 'x-user': String(user), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => null); return { status: res.status, data };
}
const say = (user, channelId, content) => api(user, 'POST', `/channels/${channelId}/messages`, { content });

test('não bloqueia a si mesmo nem conta que não existe', async () => {
  assert.equal((await api(1, 'PUT', '/blocks/1')).status, 400);
  assert.equal((await api(1, 'PUT', '/blocks/999')).status, 404);
});

test('bloquear: lista, DM recusada pros dois lados com mensagem neutra pro bloqueado', async () => {
  assert.equal((await say(2, 2, 'oi antes')).status, 201);
  const r = await api(1, 'PUT', '/blocks/2');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.blockedIds, [2]);
  const list = await api(1, 'GET', '/blocks');
  assert.deepEqual(list.data.blockedIds, [2]);
  assert.equal(list.data.users[0].username, 'bloq2');
  // quem foi bloqueado não recebe a lista de ninguém
  assert.deepEqual((await api(2, 'GET', '/blocks')).data.blockedIds, []);

  const fromBlocked = await say(2, 2, 'oi?');
  assert.equal(fromBlocked.status, 403);
  assert.doesNotMatch(fromBlocked.data.error, /bloque/i, 'a mensagem não pode entregar o bloqueio');
  const fromBlocker = await say(1, 2, 'oi');
  assert.equal(fromBlocker.status, 403);
  assert.match(fromBlocker.data.error, /desbloque/);
  // gif e reação também não passam
  assert.equal((await api(2, 'POST', '/channels/2/messages/gif', { url: 'https://media.giphy.com/media/x/giphy.gif' })).status, 403);
  const msgId = db.prepare('SELECT id FROM messages WHERE channel_id = 2 ORDER BY id DESC LIMIT 1').get().id;
  assert.equal(access.canChannelAction(access.getChannel(2), 2, 'react'), false);
  assert.ok(msgId);
  // o histórico continua legível pros dois
  assert.equal((await api(2, 'GET', '/channels/2/messages')).status, 200);
});

test('em canal de servidor o bloqueado continua escrevendo (o site de quem bloqueou recolhe)', async () => {
  assert.equal((await say(2, 1, 'oi geral')).status, 201);
  assert.equal(access.hasBlocked(1, 2), true);
  assert.equal(access.hasBlocked(2, 1), false);
});

test('o bloqueado não abre DM nova com quem bloqueou; quem bloqueou ainda abre', async () => {
  await api(3, 'PUT', '/blocks/2');
  const r = await api(2, 'POST', '/dms', { user_id: 3 });
  assert.equal(r.status, 403);
  assert.doesNotMatch(r.data.error, /bloque/i);
  const mine = await api(3, 'POST', '/dms', { user_id: 2 });
  assert.equal(mine.status, 201);
  // sem servidor em comum continua recusado do mesmo jeito
  assert.equal((await api(1, 'POST', '/dms', { user_id: 4 })).status, 403);
});

test('desbloquear libera a DM de novo', async () => {
  const r = await api(1, 'DELETE', '/blocks/2');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.blockedIds, []);
  assert.equal((await say(2, 2, 'voltei')).status, 201);
  assert.equal((await say(1, 2, 'oi')).status, 201);
});

test('fechar DM: some da minha lista até chegar mensagem nova, e só da minha', async () => {
  const ids = async (u) => (await api(u, 'GET', '/dms')).data.dms.map((d) => d.id);
  assert.ok((await ids(1)).includes(2));
  assert.equal((await api(1, 'POST', '/dms/2/close')).status, 200);
  assert.equal((await ids(1)).includes(2), false);
  assert.ok((await ids(2)).includes(2), 'a outra pessoa continua vendo');
  // canal de servidor e DM alheia não "fecham"
  assert.equal((await api(1, 'POST', '/dms/1/close')).status, 404);
  assert.equal((await api(4, 'POST', '/dms/2/close')).status, 404);

  assert.equal((await say(2, 2, 'ei')).status, 201);
  assert.ok((await ids(1)).includes(2), 'mensagem nova traz a conversa de volta');

  await api(1, 'POST', '/dms/2/close');
  const reopen = await api(1, 'POST', '/dms', { user_id: 2 });
  assert.equal(reopen.status, 200);
  assert.ok((await ids(1)).includes(2), 'abrir pelo perfil traz de volta');
});
