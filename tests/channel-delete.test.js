// Apagar canal leva junto os anexos do disco (antes ficavam lá pra sempre). HTTP real + SQLite
// em memória; os arquivos são criados de verdade em public/uploads/attachments e conferidos.
process.env.DUSKY_DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const express = require('express');
const db = require('../server/db');
const { UPLOADS_ROOT } = require('../server/upload');
let server, base;
const files = [];
function make(body) {
  const name = crypto.randomBytes(16).toString('hex') + '.bin';
  const file = path.join(UPLOADS_ROOT, 'attachments', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  files.push(file);
  return { file, url: '/uploads/attachments/' + name };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
before(async () => {
  for (let i = 1; i <= 2; i++) db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(i, 'chdel' + i, 'test');
  db.prepare("UPDATE users SET email = username || '@teste.local' WHERE email IS NULL").run();
  db.prepare("INSERT INTO servers (id, name, owner_id) VALUES (1, 'um', 1)").run();
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (1, 1), (1, 2)').run();
  db.prepare("INSERT INTO channels (id, name, type, server_id) VALUES (1, 'apagar', 'text', 1), (2, 'fica', 'text', 1)").run();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: Number(req.headers['x-user']), sv: 0 }; next(); });
  app.use('/api/channels', require('../server/routes/channels'));
  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  for (const f of files) fs.rmSync(f, { force: true });
  db.close();
});
const del = (user, id) => fetch(`${base}/api/channels/${id}`, { method: 'DELETE', headers: { 'x-user': String(user) } });

test('quem não administra o canal não apaga (e o arquivo continua)', async () => {
  const a = make('x');
  db.prepare('INSERT INTO messages (channel_id, user_id, content, attachment_url) VALUES (1, 2, ?, ?)').run('', a.url);
  assert.equal((await del(2, 1)).status, 403);
  await wait(50);
  assert.ok(fs.existsSync(a.file));
});

test('apagar o canal apaga os anexos dele, mas não os de outro canal nem os compartilhados', async () => {
  const own = make('meu');
  const other = make('outro canal');
  const shared = make('nos dois');
  db.prepare('INSERT INTO messages (channel_id, user_id, content, attachment_url) VALUES (1, 1, ?, ?), (2, 1, ?, ?), (1, 1, ?, ?), (2, 1, ?, ?)')
    .run('', own.url, '', other.url, '', shared.url, '', shared.url);
  db.prepare("INSERT INTO messages (channel_id, user_id, content, attachment_url, attachment_type) VALUES (1, 1, '', 'https://media.giphy.com/x.gif', 'gif')").run();
  const r = await del(1, 1);
  assert.equal(r.status, 200);
  await wait(100);
  assert.equal(fs.existsSync(own.file), false);
  assert.equal(fs.existsSync(files[0]), false, 'o anexo do primeiro teste também era do canal 1');
  assert.ok(fs.existsSync(other.file));
  assert.ok(fs.existsSync(shared.file));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM messages WHERE channel_id = 1').get().n, 0);
});
