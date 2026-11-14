// configurações do servidor (estilo Discord), banimentos, cargo de entrada, auditoria e soundboard.
// HTTP real + SQLite em memória: nunca lê ou altera o banco do servidor em uso.
process.env.DUSKY_DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const express = require('express');
const db = require('../server/db');
const access = require('../server/access');
const sb = require('../server/soundboard');
let server, base;
const createdSounds = [];

before(async () => {
  for (let i = 1; i <= 5; i++) db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(i, 'user' + i, 'test');
  db.prepare("INSERT INTO servers (id, name, owner_id) VALUES (1, 'one', 1), (2, 'two', 5)").run();
  for (const u of [1, 2, 3]) db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (1, ?)').run(u);
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (2, 5), (2, 3)').run();
  db.prepare(`INSERT INTO channels (id, name, type, server_id) VALUES (1,'geral','text',1),(2,'voz','voice',1),(3,'outro','text',2),(4,'afk','voice',1)`).run();
  db.prepare(`INSERT INTO roles (id,server_id,name,is_admin,permissions_json) VALUES (1,1,'admin',1,'{}'),(2,1,'mod',0,'{"ban_members":true,"view_audit_log":true,"manage_soundboard":true}'),(3,1,'novato',0,'{}')`).run();
  db.prepare('INSERT INTO member_roles (server_id,user_id,role_id) VALUES (1,2,2)').run();
  db.prepare("INSERT INTO invites (code, server_id, created_by) VALUES ('abcd1234', 1, 1)").run();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: Number(req.headers['x-user']), sv: 0 }; next(); });
  app.use('/api/servers/:serverId/soundboard', require('../server/routes/soundboard').serverRouter);
  app.use('/api/soundboard', require('../server/routes/soundboard'));
  app.use('/api/servers', require('../server/routes/servers'));
  app.use('/api/invites', require('../server/routes/invites'));
  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  for (const url of createdSounds) sb.removeSoundFile(url);
  await new Promise((r) => server.close(r)); db.close();
});
async function api(user, method, p, body) {
  const res = await fetch(base + '/api' + p, { method, headers: { 'x-user': String(user), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('configurações: validação de canais, AFK e permissão manage_server', async () => {
  assert.equal((await api(3, 'PATCH', '/servers/1', { description: 'x' })).status, 403);
  assert.equal((await api(1, 'PATCH', '/servers/1', { system_channel_id: 2 })).status, 400); // voz não serve
  assert.equal((await api(1, 'PATCH', '/servers/1', { system_channel_id: 3 })).status, 400); // canal de outro servidor
  assert.equal((await api(1, 'PATCH', '/servers/1', { afk_channel_id: 1 })).status, 400);
  assert.equal((await api(1, 'PATCH', '/servers/1', { afk_timeout: 7 })).status, 400);
  const ok = await api(1, 'PATCH', '/servers/1', { description: '  servidor  legal ', system_channel_id: 1, afk_channel_id: 4, afk_timeout: 60 });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.server.description, 'servidor  legal');
  assert.equal(ok.data.server.afk_channel_id, 4);
  // @everyone dá manage_server pra todo mundo
  assert.equal((await api(1, 'PATCH', '/servers/1/everyone', { permissions: { manage_server: true, use_soundboard: true } })).status, 200);
  assert.equal((await api(3, 'PATCH', '/servers/1', { description: 'pode' })).status, 200);
  assert.equal((await api(3, 'PATCH', '/servers/1', { join_role_id: 3 })).status, 403); // cargo de entrada é coisa de admin
  assert.equal(access.hasServerPermission(1, 3, 'use_external_sounds'), false);
  assert.equal((await api(1, 'PATCH', '/servers/1/everyone', { permissions: { use_soundboard: true, use_external_sounds: true } })).status, 200);
});

test('cargo de entrada: nunca admin, vai pra quem entra e pra quem já estava', async () => {
  assert.equal((await api(1, 'PATCH', '/servers/1', { join_role_id: 1 })).status, 400);
  assert.equal((await api(1, 'PATCH', '/servers/1', { join_role_id: 3 })).status, 200);
  assert.equal((await api(1, 'PATCH', '/servers/1/roles/3', { is_admin: true })).status, 400);
  const accepted = await api(4, 'POST', '/invites/abcd1234/accept');
  assert.equal(accepted.status, 200);
  assert.deepEqual(access.memberRoleIds(1, 4), [3]);
  // boas-vindas no canal do sistema
  const welcome = db.prepare("SELECT * FROM messages WHERE system_type = 'member_join'").get();
  assert.equal(welcome.system_user_id, 4);
  assert.equal(welcome.channel_id, 1);
  const applied = await api(1, 'POST', '/servers/1/join-role/apply');
  assert.equal(applied.status, 200);
  assert.ok(access.memberRoleIds(1, 3).includes(3));
});

test('banimento: tira do servidor, bloqueia convite e respeita hierarquia', async () => {
  assert.equal((await api(3, 'PUT', '/servers/1/bans/4', {})).status, 403);
  assert.equal((await api(2, 'PUT', '/servers/1/bans/1', {})).status, 403); // ninguém bane o dono
  assert.equal((await api(2, 'PUT', '/servers/1/bans/4', { reason: 'spam' })).status, 200);
  assert.equal(access.isServerMember(1, 4), false);
  assert.equal((await api(4, 'POST', '/invites/abcd1234/accept')).status, 403);
  const list = await api(2, 'GET', '/servers/1/bans');
  assert.equal(list.data.bans[0].reason, 'spam');
  assert.equal((await api(2, 'DELETE', '/servers/1/bans/4')).status, 200);
  assert.equal((await api(4, 'POST', '/invites/abcd1234/accept')).status, 200);
});

test('convites: lista e revogação', async () => {
  assert.equal((await api(2, 'GET', '/servers/1/invites')).status, 403);
  const list = await api(1, 'GET', '/servers/1/invites');
  assert.equal(list.status, 200);
  assert.equal(list.data.invites[0].code, 'abcd1234');
  const mine = await api(4, 'POST', '/servers/1/invites', {});
  assert.equal((await api(4, 'DELETE', '/servers/1/invites/' + mine.data.invite.code)).status, 200); // quem criou revoga
  assert.equal((await api(4, 'DELETE', '/servers/1/invites/abcd1234')).status, 403); // convite dos outros, sem permissão
});

test('registro de auditoria: só quem pode vê, e as ações aparecem', async () => {
  assert.equal((await api(4, 'GET', '/servers/1/audit-log')).status, 403);
  const log = await api(2, 'GET', '/servers/1/audit-log');
  assert.equal(log.status, 200);
  const actions = log.data.entries.map((e) => e.action);
  for (const a of ['server_update', 'everyone_permissions', 'member_ban', 'member_unban', 'invite_create']) assert.ok(actions.includes(a), a);
  const filtered = await api(2, 'GET', '/servers/1/audit-log?action=member_ban');
  assert.ok(filtered.data.entries.every((e) => e.action === 'member_ban'));
});

test('soundboard: envio cortado pelo ffmpeg, permissões e sons externos', async () => {
  const tmp = path.join(os.tmpdir(), 'dusky-teste-som.wav');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', tmp]);
  const send = async (user, serverId, fields) => {
    const form = new FormData();
    form.append('sound', new Blob([fs.readFileSync(tmp)], { type: 'audio/wav' }), 'som.wav');
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    const res = await fetch(`${base}/api/servers/${serverId}/soundboard`, { method: 'POST', headers: { 'x-user': String(user) }, body: form });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  assert.equal((await send(3, 1, { name: 'buzina' })).status, 403);
  const created = await send(2, 1, { name: 'buzina', emoji: '📯', volume: 0.8, start: 2, end: 20 });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  createdSounds.push(created.data.sound.url);
  assert.ok(created.data.sound.duration_ms <= sb.MAX_SOUND_MS && created.data.sound.duration_ms > 4000);
  assert.equal(created.data.sound.emoji, '📯');
  const other = await send(5, 2, { name: 'do outro', start: 0, end: 1 });
  assert.equal(other.status, 201);
  createdSounds.push(other.data.sound.url);
  assert.ok(other.data.sound.duration_ms < 1500);

  // regras de tocar (o realtime usa playDenied)
  const s1 = sb.getSound(created.data.sound.id);
  const s2 = sb.getSound(other.data.sound.id);
  assert.equal(sb.playDenied(3, 1, s1), null);
  assert.equal(sb.playDenied(3, 1, s2), null); // user3 está nos dois servidores: som externo liberado
  assert.ok(sb.playDenied(1, 1, s2)); // user1 não está no servidor 2
  await api(1, 'PATCH', '/servers/1/everyone', { permissions: { use_soundboard: true, use_external_sounds: false } });
  assert.ok(sb.playDenied(3, 1, s2));
  assert.equal(sb.playDenied(3, 1, s1), null);
  assert.equal(sb.playDenied(1, 1, s1), null); // dono sempre pode

  const all = await api(3, 'GET', '/soundboard');
  assert.equal(all.data.servers.length, 2);
  assert.equal(all.data.servers.find((s) => s.id === 1).permissions.use_external_sounds, false);
  assert.equal((await api(3, 'PATCH', `/servers/1/soundboard/${s1.id}`, { name: 'x2' })).status, 403);
  assert.equal((await api(2, 'PATCH', `/servers/1/soundboard/${s2.id}`, { name: 'roubo' })).status, 404);
  assert.equal((await api(2, 'PATCH', `/servers/1/soundboard/${s1.id}`, { name: 'buzinão', emoji: 'abc' })).data.sound.emoji, null);
  assert.equal((await api(2, 'DELETE', `/servers/1/soundboard/${s1.id}`)).status, 200);
  fs.unlinkSync(tmp);
});
