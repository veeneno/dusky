// Duno (server/games/duno.js): mesa, host, jogar/assistir, regras, visão filtrada, tempo e sair.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTables } = require('../server/games/duno');

const DEF = { id: 'mesa', game: 'duno', seats: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] };

function setup() {
  let clock = 1000;
  const events = [];
  const T = createTables({ onChange: (c, t) => events.push(t), now: () => clock });
  return { T, events, tick: (ms) => { clock += ms; } };
}
// deixa a mão e a mesa num estado conhecido pra testar as regras
function rig(T, top, color, hands) {
  const t = T._tables.get('1:mesa');
  const g = t.game;
  g.discard = [top];
  g.color = color;
  for (const [uid, cards] of Object.entries(hands)) g.hands.set(Number(uid), cards);
  return g;
}

test('host é quem senta primeiro; jogar/assistir; só o host começa; mín. 2', () => {
  const { T } = setup();
  T.onSeat(1, 10, DEF, 's1', null);
  T.onSeat(1, 20, DEF, 's2', null);
  T.onSeat(1, 30, DEF, 's3', null);
  let v = T.viewFor(1, DEF, 10);
  assert.equal(v.host, 10);
  assert.deepEqual(v.occupants.map((o) => o.role), [null, null, null]);
  assert.ok(T.handle(1, DEF, 99, { op: 'role', role: 'play' }).error); // não está sentado
  T.handle(1, DEF, 10, { op: 'role', role: 'play' });
  assert.ok(T.handle(1, DEF, 10, { op: 'start' }).error); // só 1 jogador
  T.handle(1, DEF, 20, { op: 'role', role: 'play' });
  T.handle(1, DEF, 30, { op: 'role', role: 'watch' });
  assert.ok(T.handle(1, DEF, 20, { op: 'start' }).error); // não é host
  // host levanta antes de começar: passa pro próximo
  T.onSeat(1, 10, null, null, DEF);
  assert.equal(T.viewFor(1, DEF, 20).host, 20);
  T.onSeat(1, 10, DEF, 's1', null);
  T.handle(1, DEF, 10, { op: 'role', role: 'play' });
  assert.equal(T.handle(1, DEF, 20, { op: 'start' }).error, undefined);
  v = T.viewFor(1, DEF, 20);
  assert.equal(v.game.phase, 'playing');
  assert.equal(v.game.players.length, 2);
  assert.ok(/^\d$/.test(v.game.top.value)); // começa com número
});

test('quem joga não vê a mão dos outros; quem não joga vê todas', () => {
  const { T } = setup();
  for (const [u, s] of [[10, 's1'], [20, 's2'], [30, 's3']]) T.onSeat(1, u, DEF, s, null);
  T.handle(1, DEF, 10, { op: 'role', role: 'play' });
  T.handle(1, DEF, 20, { op: 'role', role: 'play' });
  T.handle(1, DEF, 10, { op: 'start' });
  const p = T.viewFor(1, DEF, 10).game;
  assert.equal(p.you, 'player');
  assert.equal(p.players.find((x) => x.userId === 10).cards.length, 7);
  assert.equal(p.players.find((x) => x.userId === 20).cards, null);
  assert.equal(p.players.find((x) => x.userId === 20).count, 7);
  for (const viewer of [30, 77]) { // sentado assistindo, ou alguém andando pela sala
    const s = T.viewFor(1, DEF, viewer).game;
    assert.equal(s.you, 'spectator');
    assert.ok(s.players.every((x) => x.cards && x.cards.length === 7));
  }
  // jogador levanta e anda: continua jogando
  T.onSeat(1, 20, null, null, DEF);
  assert.equal(T.viewFor(1, DEF, 20).game.you, 'player');
});

test('regras: combinar cor/número, coringa pede cor, +2 pula e faz comprar, vez certa', () => {
  const { T } = setup();
  for (const [u, s] of [[10, 's1'], [20, 's2'], [30, 's3']]) { T.onSeat(1, u, DEF, s, null); T.handle(1, DEF, u, { op: 'role', role: 'play' }); }
  T.handle(1, DEF, 10, { op: 'start' });
  const g = rig(T, { id: 'top', color: 'red', value: '5' }, 'red', {
    10: [{ id: 'a', color: 'blue', value: '7' }, { id: 'b', color: 'blue', value: '5' }, { id: 'c', color: 'red', value: 'draw2' }, { id: 'w', color: null, value: 'wild' }],
    20: [{ id: 'd', color: 'green', value: '1' }, { id: 'e', color: 'green', value: '2' }],
    30: [{ id: 'f', color: 'yellow', value: '3' }, { id: 'h', color: 'yellow', value: '4' }],
  });
  assert.ok(T.handle(1, DEF, 20, { op: 'play', cardId: 'd' }).error); // não é a vez
  assert.ok(T.handle(1, DEF, 10, { op: 'play', cardId: 'a' }).error); // azul 7 em vermelho 5
  assert.ok(T.handle(1, DEF, 10, { op: 'play', cardId: 'w' }).error); // coringa sem cor
  assert.equal(T.handle(1, DEF, 10, { op: 'play', cardId: 'c' }).error, undefined); // +2 vermelho
  assert.equal(g.hands.get(20).length, 4); // 20 comprou 2
  assert.equal(g.players[g.turn], 30); // e foi pulado
  assert.ok(T.handle(1, DEF, 30, { op: 'pass' }).error); // passar sem comprar
});

test('DUNO: esqueceu de gritar = os outros pegam (+2); gritando, ninguém pega; zerar a mão ganha', () => {
  const { T } = setup();
  for (const [u, s] of [[10, 's1'], [20, 's2']]) { T.onSeat(1, u, DEF, s, null); T.handle(1, DEF, u, { op: 'role', role: 'play' }); }
  T.handle(1, DEF, 10, { op: 'start' });
  const g = rig(T, { id: 'top', color: 'red', value: '5' }, 'red', {
    10: [{ id: 'a', color: 'red', value: '7' }, { id: 'b', color: 'red', value: '8' }],
    20: [{ id: 'd', color: 'red', value: '1' }, { id: 'e', color: 'red', value: '2' }, { id: 'x', color: 'blue', value: '9' }],
  });
  T.handle(1, DEF, 10, { op: 'play', cardId: 'a' }); // fica com 1 sem gritar
  assert.equal(T.viewFor(1, DEF, 20).game.unoPending, 10);
  assert.ok(T.handle(1, DEF, 10, { op: 'catch' }).error); // não pega a si mesmo
  T.handle(1, DEF, 20, { op: 'catch' });
  assert.equal(g.hands.get(10).length, 3);
  // 20 grita antes de jogar a penúltima
  g.hands.set(20, [{ id: 'd', color: 'red', value: '1' }, { id: 'e', color: 'red', value: '2' }]);
  T.handle(1, DEF, 20, { op: 'duno' });
  T.handle(1, DEF, 20, { op: 'play', cardId: 'd' });
  assert.equal(T.viewFor(1, DEF, 10).game.unoPending, null);
  g.hands.set(10, [{ id: 'z', color: 'blue', value: '3' }]);
  T.handle(1, DEF, 10, { op: 'draw' }); // compra; se a comprada não serve, passa sozinho
  if (g.players[g.turn] === 10) T.handle(1, DEF, 10, { op: 'pass' });
  T.handle(1, DEF, 20, { op: 'play', cardId: 'e' });
  const v = T.viewFor(1, DEF, 10).game;
  assert.equal(v.phase, 'ended');
  assert.equal(v.winner, 20);
});

test('sair da partida devolve as cartas; saiu da call; sozinho = ganhou', () => {
  const { T } = setup();
  for (const [u, s] of [[10, 's1'], [20, 's2'], [30, 's3']]) { T.onSeat(1, u, DEF, s, null); T.handle(1, DEF, u, { op: 'role', role: 'play' }); }
  T.handle(1, DEF, 10, { op: 'start' });
  const g = T._tables.get('1:mesa').game;
  const total = () => g.drawPile.length + g.discard.length + [...g.hands.values()].reduce((n, h) => n + h.length, 0);
  assert.equal(total(), 108);
  assert.equal(T.handle(1, DEF, 30, { op: 'leave' }).error, undefined);
  assert.equal(g.players.includes(30), false);
  assert.equal(total(), 108); // as cartas de quem saiu voltaram pro monte
  assert.ok(T.handle(1, DEF, 30, { op: 'leave' }).error); // já saiu
  T.onLeaveCall(1, 20);
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 10);
  T.clearChannel(1);
});

test('tempo da jogada: estourou, compra 1 e passa a vez', async () => {
  const T = createTables({ turnMs: 30, afterDrawMs: 30 });
  for (const [u, s] of [[10, 's1'], [20, 's2']]) { T.onSeat(1, u, DEF, s, null); T.handle(1, DEF, u, { op: 'role', role: 'play' }); }
  T.handle(1, DEF, 10, { op: 'start' });
  const g = T._tables.get('1:mesa').game;
  const n = g.hands.get(10).length;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(g.hands.get(10).length, n + 1);
  assert.equal(T.viewFor(1, DEF, 10).log.type, 'timeout');
  T.clearChannel(1);
});
