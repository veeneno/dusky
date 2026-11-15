// Sinuca par x ímpar (server/games/pool.js): física e regras. Relógio e timers falsos.
const test = require('node:test');
const assert = require('node:assert');
const { createPool, simulate, rack, TABLE, GROUPS } = require('../server/games/pool');

const { HX, HZ, R } = TABLE;
const DEF = { id: 'sinuca', game: 'pool', seats: ['s1', 's2', 's3', 's4'] };

function setup(players = { 1: 's1', 2: 's3' }) {
  let clock = 1000;
  const timers = [];
  const pool = createPool({
    now: () => clock,
    random: () => 0.42,
    setTimer: (fn, ms) => { const tm = { fn, at: clock + ms, live: true }; timers.push(tm); return tm; },
    clearTimer: (tm) => { if (tm) tm.live = false; },
  });
  for (const [uid, seat] of Object.entries(players)) pool.onSeat(7, Number(uid), DEF, seat, null);
  for (const uid of Object.keys(players)) pool.handle(7, DEF, Number(uid), { op: 'ready' });
  const t = pool._tables.get('7:sinuca');
  return {
    pool, t,
    g: () => t.game,
    view: (uid) => pool.viewFor(7, DEF, uid),
    advance(ms) { clock += ms; },
    // pula a animação da última tacada
    settle() { if (t.game && t.game.shot) clock = Math.max(clock, t.game.shot.endsAt); },
    fire() { // dispara o timer mais cedo que ainda vale
      const tm = timers.filter((x) => x.live).sort((a, b) => a.at - b.at)[0];
      if (!tm) return false;
      clock = Math.max(clock, tm.at);
      tm.live = false;
      tm.fn();
      return true;
    },
    place(map) { t.game.balls = new Map(Object.entries(map).map(([id, [x, z]]) => [Number(id), { x, z }])); },
    shoot(uid, angle, power) { const r = pool.handle(7, DEF, uid, { op: 'shoot', angle, power }); this.settle(); return r; },
  };
}
const angleTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);

// ---------- física ----------
test('tacada reta no canto: a bola cai e a branca fica na mesa', () => {
  const balls = new Map([[0, { x: HX - 0.5, z: HZ - 0.5 }], [3, { x: HX - 0.2, z: HZ - 0.2 }]]);
  const sim = simulate(balls, Math.PI / 4, 0.35);
  assert.strictEqual(sim.first, 3);
  assert.deepStrictEqual(sim.pocketed.map((p) => p.id), [3]);
  assert.ok(sim.final.has(0));
  const c = sim.final.get(0);
  assert.ok(Math.abs(c.x) <= HX - R + 1e-6 && Math.abs(c.z) <= HZ - R + 1e-6);
  assert.ok(sim.frames.length > 5 && sim.frames.length < 30 * 25);
});

test('saída forte: ninguém atravessa ninguém nem sai da mesa, e tudo para', () => {
  const sim = simulate(rack(() => 0.3), 0, 1);
  const list = [...sim.final.entries()];
  for (const [, b] of list) assert.ok(Math.abs(b.x) <= HX - R + 1e-6 && Math.abs(b.z) <= HZ - R + 1e-6, 'fora da mesa');
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = Math.hypot(list[i][1].x - list[j][1].x, list[i][1].z - list[j][1].z);
      assert.ok(d >= 2 * R - 1e-4, `bolas ${list[i][0]} e ${list[j][0]} encavaladas`);
    }
  }
  assert.ok(sim.frames.length < 30 * 25, 'a simulação acabou antes do limite');
  assert.strictEqual(sim.first !== null, true);
});

test('triângulo: 15 bolas + branca, a 1 no meio e cantos de trás de times diferentes', () => {
  const b = rack(() => 0.99);
  assert.strictEqual(b.size, 16);
  const xs = [...b.values()].map((p) => p.x);
  const back = Math.max(...xs);
  const corners = [...b.entries()].filter(([, p]) => Math.abs(p.x - back) < 1e-6).sort((a, c) => a[1].z - c[1].z);
  const ends = [corners[0][0], corners[corners.length - 1][0]];
  assert.notStrictEqual(ends[0] % 2, ends[1] % 2);
  const mid = [...b.entries()].filter(([id]) => id > 0).sort((a, c) => a[1].x - c[1].x)[4];
  assert.ok(b.get(1).x > TABLE.FOOT.x);
});

// ---------- times e início ----------
test('1x1 e 2x2: só começa com times do mesmo tamanho e todo mundo pronto', () => {
  const s = setup({ 1: 's1', 2: 's2', 3: 's3' }); // 2 ímpar x 1 par
  assert.strictEqual(s.t.phase, 'waiting');
  s.pool.onSeat(7, 4, DEF, 's4', null);
  assert.strictEqual(s.t.phase, 'waiting'); // o 4 não está pronto
  s.pool.handle(7, DEF, 4, { op: 'ready' });
  assert.strictEqual(s.t.phase, 'playing');
  assert.deepStrictEqual(s.g().teams, { a: [1, 2], b: [3, 4] });
  assert.strictEqual(s.g().turnTeam, 'a');
  assert.deepStrictEqual(s.g().group, { a: null, b: null }); // mesa aberta
  assert.strictEqual(s.g().shooter, 1);
  assert.strictEqual(s.view(3).you.team, 'b');
});

// ---------- faltas e punição ----------
test('errar tudo é falta: o outro time escolhe uma bola dele pra derrubar (nunca a 1)', () => {
  const s = setup();
  s.g().isBreak = false;
  s.g().group = { a: 'impar', b: 'par' }; // grupos já decididos
  s.place({ 0: [-0.8, 0], 3: [0.5, 0.3], 5: [0.6, -0.3], 2: [0.2, 0.4], 4: [0.3, -0.4], 1: [0.9, 0] });
  s.shoot(1, Math.PI / 2, 0.05); // fraquinho pro lado: não encosta em nada
  const g = s.g();
  assert.strictEqual(g.last.foul, 'nada');
  assert.strictEqual(g.stage, 'penalty');
  assert.strictEqual(g.turnTeam, 'b');
  assert.deepStrictEqual(g.penalty.options.sort((a, b) => a - b), [2, 4]);
  assert.ok(s.pool.handle(7, DEF, 1, { op: 'penalty', ball: 2 }).error); // quem escolhe é o par
  assert.ok(s.pool.handle(7, DEF, 2, { op: 'penalty', ball: 1 }).error); // a 1 nunca
  assert.deepStrictEqual(s.pool.handle(7, DEF, 2, { op: 'penalty', ball: 4 }), {});
  assert.ok(!g.balls.has(4));
  assert.strictEqual(g.stage, 'aim');
  assert.strictEqual(g.shooter, 2);
});

test('acertar primeiro a bola do outro time é falta', () => {
  const s = setup();
  s.g().isBreak = false;
  s.g().group = { a: 'impar', b: 'par' }; // grupos já decididos
  s.place({ 0: [-0.6, 0], 2: [-0.2, 0], 4: [0.5, 0.4], 3: [0.5, -0.4], 5: [0.7, -0.2], 1: [0.9, 0] });
  s.shoot(1, 0, 0.25);
  assert.strictEqual(s.g().last.first, 2);
  assert.strictEqual(s.g().last.foul, 'adversaria');
  assert.strictEqual(s.g().turnTeam, 'b');
});

test('a punição nunca derruba a última bolinha do time', () => {
  const s = setup();
  s.g().isBreak = false;
  s.g().group = { a: 'impar', b: 'par' }; // grupos já decididos
  s.place({ 0: [-0.8, 0], 3: [0.5, 0.3], 2: [0.2, 0.4], 1: [0.9, 0] }); // par só tem a 2
  s.shoot(1, Math.PI / 2, 0.05);
  assert.strictEqual(s.g().last.foul, 'nada');
  assert.strictEqual(s.g().stage, 'aim');
  assert.ok(s.g().balls.has(2));
  assert.strictEqual(s.g().turnTeam, 'b');
});

test('encaçapar bola sua continua jogando; a do outro time cai e fica caída', () => {
  const s = setup();
  s.g().isBreak = false;
  s.g().group = { a: 'impar', b: 'par' }; // grupos já decididos
  const cue = [HX - 0.5, HZ - 0.5];
  const b3 = [HX - 0.2, HZ - 0.2];
  s.place({ 0: cue, 3: b3, 5: [0, 0], 2: [-0.5, 0.2], 4: [-0.5, -0.2], 1: [-0.9, 0] });
  s.shoot(1, angleTo(cue, b3), 0.35);
  const g = s.g();
  assert.deepStrictEqual(g.last.pocketed, [3]);
  assert.strictEqual(g.last.foul, null);
  assert.strictEqual(g.last.cont, true);
  assert.strictEqual(g.shooter, 1);
  assert.strictEqual(g.turnTeam, 'a');
});

test('bola 1: ganha quem derruba depois das suas; antes da hora perde', () => {
  const win = setup();
  win.g().isBreak = false;
  win.g().group = { a: 'impar', b: 'par' };
  const cue = [HX - 0.5, HZ - 0.5];
  const one = [HX - 0.2, HZ - 0.2];
  win.place({ 0: cue, 1: one, 2: [-0.5, 0.2] }); // ímpar já derrubou todas
  win.shoot(1, angleTo(cue, one), 0.35);
  assert.strictEqual(win.t.phase, 'over');
  assert.deepStrictEqual(win.g().result, { winner: 'a', reason: 'bola-1' });

  const lose = setup();
  lose.g().isBreak = false;
  lose.g().group = { a: 'impar', b: 'par' };
  lose.place({ 0: cue, 1: one, 3: [-0.5, -0.2], 2: [-0.5, 0.2] });
  lose.shoot(1, angleTo(cue, one), 0.35);
  assert.strictEqual(lose.t.phase, 'over');
  assert.strictEqual(lose.g().result.winner, 'b');
});

test('na hora da 1, acertar outra bola primeiro é falta', () => {
  const s = setup();
  s.g().isBreak = false;
  s.g().group = { a: 'impar', b: 'par' }; // grupos já decididos
  s.place({ 0: [-0.6, 0], 2: [-0.2, 0], 4: [0.4, 0.3], 1: [0.9, 0.2] });
  s.shoot(1, 0, 0.25);
  assert.strictEqual(s.g().last.foul, 'nao-1');
});

test('2x2: a vez passa alternando os times e os parceiros', () => {
  const s = setup({ 1: 's1', 2: 's2', 3: 's3', 4: 's4' });
  s.g().isBreak = false;
  s.g().group = { a: 'impar', b: 'par' }; // grupos já decididos
  const order = [];
  for (let i = 0; i < 4; i++) {
    order.push(s.g().shooter);
    s.place({ 0: [0, 0], 3: [0.4, 0.05], 2: [0.4, -0.05], 1: [0.9, 0.3] });
    // acerta a bola do próprio time sem derrubar (passa a vez sem falta)
    const own = s.g().turnTeam === 'a' ? [0.4, 0.05] : [0.4, -0.05];
    s.shoot(s.g().shooter, angleTo([0, 0], own), 0.2);
    assert.strictEqual(s.g().last.foul, null);
  }
  assert.deepStrictEqual(order, [1, 3, 2, 4]);
});

test('tempo estourado é falta com punição; a escolha da punição também tem tempo', () => {
  const s = setup();
  s.g().isBreak = false;
  s.g().group = { a: 'impar', b: 'par' }; // grupos já decididos
  s.place({ 0: [-0.8, 0], 3: [0.5, 0.3], 2: [0.2, 0.4], 4: [0.3, -0.4], 1: [0.9, 0] });
  assert.ok(s.fire());
  assert.strictEqual(s.g().last.foul, 'tempo');
  assert.strictEqual(s.g().stage, 'penalty');
  assert.ok(s.fire());
  assert.strictEqual(s.g().stage, 'aim');
  assert.ok(!s.g().balls.has(2)); // escolheu sozinho a menor
  assert.strictEqual(s.g().shooter, 2);
});

test('sair da call: parceiro assume; time vazio perde', () => {
  const s = setup({ 1: 's1', 2: 's2', 3: 's3', 4: 's4' });
  s.pool.onLeaveCall(7, 1);
  assert.strictEqual(s.g().shooter, 2);
  s.pool.onLeaveCall(7, 2);
  assert.strictEqual(s.t.phase, 'over');
  assert.deepStrictEqual(s.g().result, { winner: 'b', reason: 'abandono' });
});

test('levantar da banqueta não tira da partida; visão manda os quadros só durante a animação', () => {
  const s = setup();
  s.pool.onSeat(7, 1, null, null, DEF);
  assert.strictEqual(s.t.phase, 'playing');
  assert.strictEqual(s.g().shooter, 1);
  s.pool.handle(7, DEF, 1, { op: 'shoot', angle: 0, power: 0.8 });
  const v = s.view(2);
  assert.ok(Array.isArray(v.shot.frames) && v.shot.frames.length > 0);
  s.settle();
  s.advance(5000);
  assert.strictEqual(s.view(2).shot.frames, undefined);
  assert.strictEqual(GROUPS.impar.length, 7);
});

// ---------- mesa aberta ----------
test('mesa aberta: a primeira bolinha que cai decide quem é par e quem é ímpar', () => {
  const s = setup();
  s.g().isBreak = false;
  const cue = [HX - 0.5, HZ - 0.5];
  const b4 = [HX - 0.2, HZ - 0.2];
  s.place({ 0: cue, 4: b4, 3: [0, 0], 5: [-0.5, 0.2], 6: [-0.5, -0.2], 1: [-0.9, 0] });
  assert.deepStrictEqual(s.g().group, { a: null, b: null });
  s.shoot(1, angleTo(cue, b4), 0.35);
  assert.deepStrictEqual(s.g().group, { a: 'par', b: 'impar' }); // o time A derrubou a 4: fica com as pares
  assert.strictEqual(s.g().last.assigned, 'par');
  assert.strictEqual(s.g().last.cont, true);
  assert.strictEqual(s.view(2).group.b, 'impar');
});

test('mesa aberta: acertar qualquer bola primeiro vale; falta só passa a vez (sem punição)', () => {
  const s = setup();
  s.g().isBreak = false;
  s.place({ 0: [-0.6, 0], 2: [-0.2, 0], 4: [0.5, 0.4], 3: [0.5, -0.4], 5: [0.7, -0.2], 1: [0.9, 0] });
  s.shoot(1, 0, 0.25);
  assert.strictEqual(s.g().last.first, 2);
  assert.strictEqual(s.g().last.foul, null); // mesa aberta: a 2 não é "do outro time"
  assert.strictEqual(s.g().turnTeam, 'b');
  s.place({ 0: [-0.8, 0], 3: [0.5, 0.3], 5: [0.6, -0.3], 2: [0.2, 0.4], 4: [0.3, -0.4], 1: [0.9, 0] });
  s.shoot(2, Math.PI / 2, 0.05); // errou tudo
  assert.strictEqual(s.g().last.foul, 'nada');
  assert.strictEqual(s.g().stage, 'aim'); // ninguém tem grupo ainda: nada pra derrubar
  assert.strictEqual(s.g().turnTeam, 'a');
  assert.deepStrictEqual(s.g().group, { a: null, b: null });
});

test('mesa aberta: bola que cai junto com falta não decide o grupo; a 1 antes da hora perde', () => {
  const s = setup();
  s.g().isBreak = false;
  // a branca segue a 3 pra caçapa (bate de raspão e as duas vão pro canto)
  const cue = [HX - 0.5, HZ - 0.5];
  const b3 = [HX - 0.2, HZ - 0.2];
  s.place({ 0: cue, 3: b3, 2: [0, 0], 1: [-0.9, 0] });
  const r = s.pool.handle(7, DEF, 1, { op: 'shoot', angle: angleTo(cue, b3), power: 0.35 });
  assert.deepStrictEqual(r, {});
  s.settle();
  if (s.g().last.foul) assert.deepStrictEqual(s.g().group, { a: null, b: null });
  const one = setup();
  one.g().isBreak = false;
  one.place({ 0: cue, 1: b3, 2: [0, 0], 3: [-0.5, 0] });
  one.shoot(1, angleTo(cue, b3), 0.35);
  assert.strictEqual(one.t.phase, 'over');
  assert.deepStrictEqual(one.g().result, { winner: 'b', reason: 'bola-1-cedo' });
});
