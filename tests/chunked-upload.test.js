// Envio de anexo em partes (routes/chunkedUploads.js), pra passar do limite de 100 MB do Cloudflare.
// Partes de 1 KB aqui (DUSKY_UPLOAD_CHUNK_BYTES) pra não precisar de arquivo grande. HTTP real +
// SQLite em memória; o arquivo final é conferido byte a byte no disco.
process.env.DUSKY_DB_PATH = ':memory:';
process.env.DUSKY_UPLOAD_CHUNK_BYTES = '1024';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const express = require('express');
const db = require('../server/db');
const { UPLOADS_ROOT } = require('../server/upload');
let server, base;
const created = [];
before(async () => {
  for (let i = 1; i <= 3; i++) db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(i, 'partes' + i, 'test');
  db.prepare("UPDATE users SET email = username || '@teste.local' WHERE email IS NULL").run();
  db.prepare("INSERT INTO servers (id, name, owner_id) VALUES (1, 'um', 1)").run();
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (1, 1), (1, 2)').run();
  db.prepare("INSERT INTO channels (id, name, type, server_id) VALUES (1, 'geral', 'text', 1), (2, 'voz', 'voice', 1)").run();
  // conta 2 com limite de 1 MB por arquivo
  db.prepare('UPDATE users SET upload_max_mb = 1 WHERE id = 2').run();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: Number(req.headers['x-user']), sv: 0 }; next(); });
  app.use('/api/channels/:channelId/uploads', require('../server/routes/chunkedUploads'));
  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  for (const f of created) fs.rmSync(f, { force: true });
  db.close();
});
async function api(user, method, p, body, raw) {
  const headers = { 'x-user': String(user) };
  if (raw) headers['Content-Type'] = 'application/octet-stream';
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + '/api/channels' + p, { method, headers, body: raw || (body === undefined ? undefined : JSON.stringify(body)) });
  const data = await res.json().catch(() => null); return { status: res.status, data };
}

test('envia em partes (fora de ordem, com uma parte repetida) e vira mensagem com o arquivo certo', async () => {
  const bytes = crypto.randomBytes(2500); // 3 partes: 1024 + 1024 + 452
  const open = await api(1, 'POST', '/1/uploads', { name: 'video "grande".mp4', size: bytes.length, type: 'video/mp4', content: 'olha isso' });
  assert.equal(open.status, 201);
  assert.equal(open.data.totalChunks, 3);
  const id = open.data.uploadId;
  const part = (i) => bytes.subarray(i * 1024, Math.min(bytes.length, (i + 1) * 1024));
  assert.equal((await api(1, 'PUT', `/1/uploads/${id}/2`, undefined, part(2))).status, 200);
  assert.equal((await api(1, 'PUT', `/1/uploads/${id}/0`, undefined, part(0))).status, 200);
  // faltando a parte 1: não fecha
  const early = await api(1, 'POST', `/1/uploads/${id}/complete`);
  assert.equal(early.status, 400);
  assert.deepEqual(early.data.missing, [1]);
  // retomar: o servidor diz o que já tem
  assert.deepEqual((await api(1, 'GET', `/1/uploads/${id}`)).data.received, [0, 2]);
  assert.equal((await api(1, 'PUT', `/1/uploads/${id}/1`, undefined, part(1))).status, 200);
  assert.equal((await api(1, 'PUT', `/1/uploads/${id}/1`, undefined, part(1))).status, 200, 'mandar de novo só sobrescreve');
  const done = await api(1, 'POST', `/1/uploads/${id}/complete`);
  assert.equal(done.status, 201);
  const m = done.data.message;
  assert.equal(m.content, 'olha isso');
  assert.equal(m.attachment_type, 'video');
  assert.equal(m.attachment_name, 'video grande.mp4', 'nome limpo como no envio normal');
  assert.equal(m.attachment_size, bytes.length);
  assert.match(m.attachment_url, /^\/uploads\/attachments\/[a-f0-9]{32}\.mp4$/);
  const file = path.join(UPLOADS_ROOT, m.attachment_url.slice('/uploads/'.length));
  created.push(file);
  assert.ok(fs.readFileSync(file).equals(bytes));
  assert.equal(fs.existsSync(path.join(UPLOADS_ROOT, '.parts', id)), false, 'o temporário sumiu');
  // a sessão acabou
  assert.equal((await api(1, 'GET', `/1/uploads/${id}`)).status, 404);
});

test('parte com tamanho errado é recusada', async () => {
  const open = await api(1, 'POST', '/1/uploads', { name: 'a.bin', size: 2000, type: 'application/octet-stream' });
  const id = open.data.uploadId;
  assert.equal((await api(1, 'PUT', `/1/uploads/${id}/0`, undefined, crypto.randomBytes(500))).status, 400);
  assert.equal((await api(1, 'PUT', `/1/uploads/${id}/5`, undefined, crypto.randomBytes(10))).status, 400);
  assert.equal((await api(1, 'DELETE', `/1/uploads/${id}`)).status, 200);
  await new Promise((r) => setTimeout(r, 50)); // o temporário é apagado em segundo plano
  assert.equal(fs.existsSync(path.join(UPLOADS_ROOT, '.parts', id)), false);
});

test('mesmas regras do envio normal: limite por arquivo, permissão e canal de texto', async () => {
  assert.equal((await api(2, 'POST', '/1/uploads', { name: 'x', size: 2 * 1024 * 1024, type: 'x/y' })).status, 413);
  assert.equal((await api(3, 'POST', '/1/uploads', { name: 'x', size: 10, type: 'x/y' })).status, 404, 'quem não é membro nem vê o canal');
  assert.equal((await api(1, 'POST', '/2/uploads', { name: 'x', size: 10, type: 'x/y' })).status, 400);
  assert.equal((await api(1, 'POST', '/1/uploads', { name: 'x', size: -1, type: 'x/y' })).status, 400);
});

test('sessão é só de quem abriu', async () => {
  const open = await api(1, 'POST', '/1/uploads', { name: 'b.bin', size: 10, type: 'application/octet-stream' });
  const id = open.data.uploadId;
  assert.equal((await api(2, 'PUT', `/1/uploads/${id}/0`, undefined, crypto.randomBytes(10))).status, 404);
  assert.equal((await api(2, 'POST', `/1/uploads/${id}/complete`)).status, 404);
  await api(1, 'DELETE', `/1/uploads/${id}`);
});
