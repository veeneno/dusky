// 21 / blackjack (server/games/blackjack.js): apostas, regras, pagamento, tempo e sair da mesa.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBlackjack, handTotal, isBlackjack, START_CHIPS } = require('../server/games/blackjack');

const DEF = { id: 'mesa-21', game: 'blackjack', seats: ['b1', 'b2', 'b3', 'b4', 'b5'] };
const C = (r, s = 's') => ({ id: `${r}${s}${Math.random()}`, r, s });

// sapato "combinado": as cartas saem na ordem da lista (depois, um monte de 2 pra completar)
function setup(order = []) {
  let clock = 1000;
  let timers = [];
  const cards = order.map((r) => C(r));
  const shoe = () => [...Array(200).fill(0).map(() => C('2')), ...[...cards].reverse()];
  const B = createBlackjack({
    now: () => clock,
    newShoe: shoe,
    setTimer: (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return t; },
    clearTimer: (t) => { timers = timers.filter((x) => x !== t); },
  });
  // roda os timers que venceram até `ms` à frente
  const tick = (ms) => {
    const end = clock + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      clock = due.at; // anda até o timer (a banca compra uma carta por vez)
      due.fn();
    }
    clock = end;
  };
  return { B, tick, view: (uid) => B.viewFor(1, DEF, uid) };
}

test('total da mão: Ás vale 11 ou 1; blackjack só com 2 cartas', () => {
  assert.deepEqual(handTotal([C('A'), C('K')]), { total: 21, soft: true });
  assert.deepEqual(handTotal([C('A'), C('A'), C('9')]), { total: 21, soft: true });
  assert.deepEqual(handTotal([C('A'), C('9'), C('5')]), { total: 15, soft: false });
  assert.equal(isBlackjack([C('A'), C('Q')]), true);
  assert.equal(isBlackjack([C('7'), C('7'), C('7')]), false);
});

test('aposta: precisa sentar, limites, sai da carteira; quem levanta recebe de volta', () => {
  const { B, view } = setup();
  assert.match(B.handle(1, DEF, 10, { op: 'bet', amount: 50 }).error, /sente/);
  B.onSeat(1, 10, DEF, 'b1', null);
  B.onSeat(1, 20, DEF, 'b2', null);
  assert.match(B.handle(1, DEF, 10, { op: 'bet', amount: 5 }).error, /de 10 a 500/);
  assert.match(B.handle(1, DEF, 10, { op: 'bet', amount: 5000 }).error, /de 10 a 500/);
  assert.deepEqual(B.handle(1, DEF, 10, { op: 'bet', amount: 100 }), {});
  assert.equal(view(10).you.balance, START_CHIPS - 100);
  assert.equal(view(10).phase, 'betting'); // o 20 ainda não apostou
  B.onSeat(1, 10, null, null, DEF); // levantou
  assert.equal(view(10).you.balance, START_CHIPS);
});

test('todo mundo sentado apostou: dá as cartas; parar e a banca para em 17', () => {
  // ordem: jogador, banca, jogador, banca(escondida), depois o que a banca compra
  const { B, tick, view } = setup(['10', '9', '9', '7']);
  B.onSeat(1, 10, DEF, 'b1', null);
  B.handle(1, DEF, 10, { op: 'bet', amount: 100 });
  let v = view(10);
  assert.equal(v.phase, 'playing');
  assert.equal(v.turn, 10);
  assert.equal(v.dealer.cards[1], null); // carta escondida
  assert.equal(v.hands[0].total, 19);
  assert.deepEqual(B.handle(1, DEF, 10, { op: 'stand' }), {});
  assert.equal(view(10).phase, 'dealer');
  tick(3000); // banca tem 16 (9+7) → compra um 2 (do enchimento) = 18 e para
  v = view(10);
  assert.equal(v.phase, 'results');
  assert.equal(v.dealer.total, 18);
  assert.equal(v.hands[0].result, 'win');
  assert.equal(v.you.balance, START_CHIPS + 100);
  tick(7000);
  assert.equal(view(10).phase, 'betting');
});

test('blackjack paga 3 pra 2; banca com blackjack acaba a rodada na hora', () => {
  let s = setup(['A', '9', 'K', '7']);
  s.B.onSeat(1, 10, DEF, 'b1', null);
  s.B.handle(1, DEF, 10, { op: 'bet', amount: 100 });
  s.tick(3000);
  let v = s.view(10);
  assert.equal(v.hands[0].result, 'blackjack');
  assert.equal(v.you.balance, START_CHIPS + 150);

  s = setup(['9', 'A', '9', 'K']);
  s.B.onSeat(1, 10, DEF, 'b1', null);
  s.B.handle(1, DEF, 10, { op: 'bet', amount: 100 });
  v = s.view(10);
  assert.equal(v.phase, 'results');
  assert.equal(v.log.type, 'dealer-blackjack');
  assert.equal(v.hands[0].result, 'lose');
  assert.equal(v.you.balance, START_CHIPS - 100);
});

test('pedir até estourar perde; empate devolve', () => {
  let s = setup(['10', '10', '6', '8', 'K']);
  s.B.onSeat(1, 10, DEF, 'b1', null);
  s.B.handle(1, DEF, 10, { op: 'bet', amount: 50 });
  s.B.handle(1, DEF, 10, { op: 'hit' }); // 16 + K = 26
  s.tick(5000);
  let v = s.view(10);
  assert.equal(v.hands[0].result, 'bust');
  assert.equal(v.dealer.cards.length, 2); // todo mundo estourou: a banca não compra
  assert.equal(v.you.balance, START_CHIPS - 50);

  s = setup(['10', '10', '8', '8']);
  s.B.onSeat(1, 10, DEF, 'b1', null);
  s.B.handle(1, DEF, 10, { op: 'bet', amount: 50 });
  s.B.handle(1, DEF, 10, { op: 'stand' });
  s.tick(5000);
  v = s.view(10);
  assert.equal(v.hands[0].result, 'push');
  assert.equal(v.you.balance, START_CHIPS);
});

test('dobrar: aposta em dobro, 1 carta e para', () => {
  const s = setup(['6', '10', '5', '8', 'K']);
  s.B.onSeat(1, 10, DEF, 'b1', null);
  s.B.handle(1, DEF, 10, { op: 'bet', amount: 100 });
  assert.deepEqual(s.B.handle(1, DEF, 10, { op: 'double' }), {}); // 11 + K = 21
  s.tick(5000);
  const v = s.view(10);
  assert.equal(v.hands[0].bet, 200);
  assert.equal(v.hands[0].total, 21);
  assert.equal(v.hands[0].result, 'win');
  assert.equal(v.you.balance, START_CHIPS + 200);
  assert.match(s.B.handle(1, DEF, 10, { op: 'double' }).error, /não é hora/);
});

test('dividir um par vira 2 mãos com aposta cada; 21 depois de dividir não é blackjack', () => {
  // 8,8 contra 10 + 7 (banca 17); a 1ª mão recebe 3 (11) e a 2ª recebe K (18)
  const s = setup(['8', '10', '8', '7', '3', 'K']);
  s.B.onSeat(1, 10, DEF, 'b1', null);
  s.B.handle(1, DEF, 10, { op: 'bet', amount: 100 });
  assert.deepEqual(s.B.handle(1, DEF, 10, { op: 'split' }), {});
  let v = s.view(10);
  assert.equal(v.hands.length, 2);
  assert.equal(v.you.balance, START_CHIPS - 200);
  assert.equal(v.hands[0].total, 11);
  s.B.handle(1, DEF, 10, { op: 'stand' }); // 1ª mão para com 11
  s.B.handle(1, DEF, 10, { op: 'stand' }); // 2ª mão para com 18
  s.tick(5000);
  v = s.view(10);
  assert.equal(v.hands[0].result, 'lose'); // 11 x 17
  assert.equal(v.hands[1].result, 'win');  // 18 x 17
  assert.equal(v.you.balance, START_CHIPS); // perdeu 100, ganhou 100
  assert.match(setupSplitError(), /só dá pra dividir um par/);

  function setupSplitError() {
    const x = setup(['8', '10', '9', '7']);
    x.B.onSeat(1, 10, DEF, 'b1', null);
    x.B.handle(1, DEF, 10, { op: 'bet', amount: 100 });
    return x.B.handle(1, DEF, 10, { op: 'split' }).error;
  }
});

test('vez: só quem está na vez joga; tempo estourado = para; 2 jogadores na ordem das cadeiras', () => {
  const s = setup(['10', '9', '10', '9', '7', '8']);
  s.B.onSeat(1, 20, DEF, 'b3', null);
  s.B.onSeat(1, 10, DEF, 'b1', null);
  s.B.handle(1, DEF, 20, { op: 'bet', amount: 10 });
  s.B.handle(1, DEF, 10, { op: 'bet', amount: 10 });
  let v = s.view(10);
  assert.equal(v.phase, 'playing');
  assert.equal(v.turn, 10); // cadeira b1 vem antes da b3
  assert.match(s.B.handle(1, DEF, 20, { op: 'hit' }).error, /não é a sua vez/);
  s.tick(21000); // o 10 não fez nada
  v = s.view(10);
  assert.equal(v.turn, 20);
  assert.equal(v.log.type, 'timeout');
});

test('quem levanta no meio da rodada para; sair da call não trava a mesa', () => {
  const s = setup(['10', '9', '10', '9', '7', '8']);
  s.B.onSeat(1, 10, DEF, 'b1', null);
  s.B.onSeat(1, 20, DEF, 'b2', null);
  s.B.handle(1, DEF, 10, { op: 'bet', amount: 10 });
  s.B.handle(1, DEF, 20, { op: 'bet', amount: 10 });
  s.B.onLeaveCall(1, 10);
  assert.equal(s.view(20).turn, 20);
  s.B.handle(1, DEF, 20, { op: 'stand' });
  s.tick(5000);
  assert.equal(s.view(20).phase, 'results');
});

test('acabaram as fichas: pega mais', () => {
  const { B, view, tick } = setup(['10', '10', '6', '9', 'K']);
  B._wallets.set(10, 10);
  B.onSeat(1, 10, DEF, 'b1', null);
  assert.match(B.handle(1, DEF, 10, { op: 'refill' }).error, /ainda tem fichas/);
  B.handle(1, DEF, 10, { op: 'bet', amount: 10 });
  assert.equal(view(10).you.balance, 0);
  assert.match(B.handle(1, DEF, 10, { op: 'refill' }).error, /espere/);
  B.handle(1, DEF, 10, { op: 'hit' }); // estoura
  tick(5000); // a rodada acaba
  assert.deepEqual(B.handle(1, DEF, 10, { op: 'refill' }), {});
  assert.equal(view(10).you.balance, START_CHIPS);
});
