// mundinho 3D: regras de posição/assento (server/world.js) e criação de canal-mundo.
process.env.DUSKY_DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../server/db');
const access = require('../server/access');
const world = require('../server/world');
let server, base;

before(async () => {
  db.prepare("INSERT INTO users (id, username, password_hash) VALUES (1, 'dono', 'x'), (2, 'membro', 'x')").run();
  db.prepare("INSERT INTO servers (id, name, owner_id) VALUES (1, 'srv', 1)").run();
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (1, 1), (1, 2)').run();
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: Number(req.headers['x-user']), sv: 0 }; next(); });
  app.use('/api/servers', require('../server/routes/servers'));
  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise((r) => server.close(r)); db.close(); });

test('cena padrão carrega e o spawn fica dentro da sala', () => {
  const s = world.getScene('penthouse');
  assert.ok(s.seats.length > 0);
  for (let i = 0; i < 50; i++) {
    const p = world.spawn('penthouse');
    assert.ok(p.x >= s.bounds.minX && p.x <= s.bounds.maxX && p.z >= s.bounds.minZ && p.z <= s.bounds.maxZ);
    assert.equal(p.action, 'stand');
  }
  assert.equal(world.getScene('nao-existe').id, 'penthouse'); // cena desconhecida (ex.: a antiga lounge) cai na padrão
});

test('movimento: preso nos limites, ação inválida vira em pé, sentar encaixa e respeita ocupado', () => {
  const s = world.getScene('penthouse');
  const prev = { x: 0, z: 0, ry: 0, action: 'stand', seat: null };
  const out = world.applyMove('penthouse', prev, { x: 999, z: -999, ry: 1, action: 'voar' }, () => false);
  assert.equal(out.state.x, s.bounds.maxX);
  assert.equal(out.state.z, s.bounds.minZ);
  assert.equal(out.state.action, 'stand');
  assert.equal(out.corrected, true);
  const seat = s.seats[0];
  const sat = world.applyMove('penthouse', prev, { x: 5, z: 5, action: 'sit', seat: seat.id }, () => false);
  assert.deepEqual([sat.state.x, sat.state.z, sat.state.seat], [seat.x, seat.z, seat.id]);
  const taken = world.applyMove('penthouse', prev, { action: 'sit', seat: seat.id }, () => true);
  assert.equal(taken.state.action, 'stand');
  assert.equal(taken.corrected, true);
  const bogus = world.applyMove('penthouse', prev, { action: 'sit', seat: 'nada' }, () => false);
  assert.equal(bogus.state.seat, null);
  const walk = world.applyMove('penthouse', prev, { x: 1, z: 1, ry: 0.5, action: 'walk' }, () => false);
  assert.equal(walk.corrected, false);
});

test('criar canal mundinho: vira canal de voz com cena', async () => {
  const res = await fetch(base + '/api/servers/1/channels', { method: 'POST', headers: { 'x-user': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Mundinho', type: 'world' }) });
  const data = await res.json();
  assert.equal(res.status, 201);
  assert.equal(data.channel.type, 'voice');
  assert.equal(data.channel.world_scene, 'penthouse');
  assert.equal(access.getChannel(data.channel.id).world_scene, 'penthouse');
  const list = await (await fetch(base + '/api/servers/1/channels', { headers: { 'x-user': '2' } })).json();
  assert.equal(list.channels.find((c) => c.id === data.channel.id).world_scene, 'penthouse');
});

test('altura: y fica entre o chão e o mezanino; sentar no mezanino leva pro piso de cima', () => {
  const s = world.getScene('penthouse');
  const prev = { x: 0, y: 0, z: 0, ry: 0, action: 'stand', seat: null };
  assert.equal(world.applyMove('penthouse', prev, { x: 0, y: 99, z: 0, action: 'walk' }, () => false).state.y, s.bounds.maxY);
  const up = s.seats.find((x) => x.floor > 0);
  assert.equal(world.applyMove('penthouse', prev, { action: 'sit', seat: up.id }, () => false).state.y, up.floor);
});

test('TV: YouTube, tela de quem compartilha, play/pause e desligar', () => {
  const ctx = { userId: 1, now: 1000, screenOn: (id) => id === 2 };
  assert.ok(world.applyTv(null, { op: 'youtube', url: 'https://example.com' }, ctx).error);
  const yt = world.applyTv(null, { op: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ?t=42' }, ctx).tv;
  assert.deepEqual([yt.mode, yt.videoId, yt.position, yt.playing], ['youtube', 'dQw4w9WgXcQ', 42, true]);
  const paused = world.applyTv(yt, { op: 'pause', position: 50.5 }, { ...ctx, now: 9000 }).tv;
  assert.deepEqual([paused.playing, paused.position, paused.refAt], [false, 50.5, 9000]);
  assert.ok(world.applyTv(null, { op: 'pause', position: 1 }, ctx).error); // TV desligada não pausa
  assert.ok(world.applyTv(null, { op: 'screen', userId: 3 }, ctx).error); // 3 não está compartilhando
  assert.equal(world.applyTv(yt, { op: 'screen', userId: 2 }, ctx).tv.userId, 2);
  assert.equal(world.applyTv(yt, { op: 'off' }, ctx).tv.mode, 'off');
  assert.ok(world.applyTv(yt, { op: 'hack' }, ctx).error);
});
