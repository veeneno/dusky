const test = require('node:test');
const assert = require('node:assert');
const {
  createChess, fromFen, legalMoves, makeMove, toSan, insufficientMaterial, canStillMate, START_FEN, START_BOARD, MODES,
} = require('../server/games/chess');

// perft: conta as posições depois de n lances — confere o gerador inteiro (roque, en passant, promoção)
function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(pos, m), depth - 1);
  return n;
}

test('perft da posição inicial', () => {
  const pos = fromFen(START_FEN);
  assert.strictEqual(perft(pos, 1), 20);
  assert.strictEqual(perft(pos, 2), 400);
  assert.strictEqual(perft(pos, 3), 8902);
});

test('perft "kiwipete" (roque, en passant, promoção, cravadas)', () => {
  const pos = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.strictEqual(perft(pos, 1), 48);
  assert.strictEqual(perft(pos, 2), 2039);
  assert.strictEqual(perft(pos, 3), 97862);
});

test('perft posição 3 (en passant que descobre xeque)', () => {
  const pos = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.strictEqual(perft(pos, 3), 2812);
  assert.strictEqual(perft(pos, 4), 43238);
});

test('perft posição 5 (promoção com roque)', () => {
  const pos = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  assert.strictEqual(perft(pos, 1), 44);
  assert.strictEqual(perft(pos, 2), 1486);
  assert.strictEqual(perft(pos, 3), 62379);
});

function play(pos, uci) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci[4] || null;
  const legal = legalMoves(pos);
  const sq = (s) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
  const m = legal.find((x) => x.from === sq(from) && x.to === sq(to) && (x.promo || null) === promo);
  assert.ok(m, `lance ${uci} deveria ser legal`);
  return { san: toSan(pos, m, legal), pos: makeMove(pos, m) };
}

test('SAN: mate do pastor, roque, en passant, promoção e desambiguação', () => {
  let pos = fromFen(START_FEN);
  const sans = [];
  for (const u of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']) {
    const r = play(pos, u);
    sans.push(r.san);
    pos = r.pos;
  }
  assert.deepStrictEqual(sans, ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
  assert.strictEqual(legalMoves(pos).length, 0);

  assert.strictEqual(play(fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'e1g1').san, 'O-O');
  assert.strictEqual(play(fromFen('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1'), 'e8c8').san, 'O-O-O');
  const ep = play(fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), 'e5d6');
  assert.strictEqual(ep.san, 'exd6');
  assert.strictEqual(ep.pos.board[35], null, 'o peão capturado en passant some');
  const promo = play(fromFen('8/4P3/8/8/8/8/k7/4K3 w - - 0 1'), 'e7e8n');
  assert.strictEqual(promo.san, 'e8=N');
  assert.strictEqual(promo.pos.board[60], 'N');
  assert.strictEqual(play(fromFen('6k1/8/8/8/8/8/8/R4RK1 w - - 0 1'), 'a1d1').san, 'Rad1');
  assert.strictEqual(play(fromFen('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1'), 'a1a3').san, 'R1a3');
});

test('roque proibido passando por casa atacada e direitos perdidos quando a torre é capturada', () => {
  const blocked = fromFen('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1'); // torre preta ataca f1
  const uci = legalMoves(blocked).map((m) => m.flag);
  assert.ok(!uci.includes('castleK'));
  assert.ok(uci.includes('castleQ'));
  const after = makeMove(fromFen('4k3/8/8/8/8/8/6b1/R3K2R b KQ - 0 1'), legalMoves(fromFen('4k3/8/8/8/8/8/6b1/R3K2R b KQ - 0 1')).find((m) => m.to === 7));
  assert.strictEqual(after.castling, 'Q');
});

test('material insuficiente e quem ainda pode dar mate quando o tempo acaba', () => {
  assert.ok(insufficientMaterial(fromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1').board));
  assert.ok(insufficientMaterial(fromFen('4k3/8/8/8/8/8/8/3NK3 w - - 0 1').board));
  assert.ok(insufficientMaterial(fromFen('4k3/8/8/8/8/8/8/2B1K1b1 w - - 0 1').board)); // bispos na mesma cor
  assert.ok(!insufficientMaterial(fromFen('4k3/8/8/8/8/8/8/2B1Kb2 w - - 0 1').board));
  assert.ok(!insufficientMaterial(fromFen('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1').board));
  assert.ok(!canStillMate(fromFen('4k3/8/8/8/8/8/8/3NK3 w - - 0 1').board, 'w'));
  assert.ok(canStillMate(fromFen('4k3/4p3/8/8/8/8/8/3NK3 w - - 0 1').board, 'w'));
  assert.ok(!canStillMate(fromFen('4k3/8/8/8/8/8/8/3QK3 w - - 0 1').board, 'b'));
});

// ---------- mesa ----------
const DEF = { id: 'xadrez-1', game: 'chess', seats: ['x1-a', 'x1-b'] };

function setup() {
  let clock = 1000;
  const timers = [];
  const events = [];
  const chess = createChess({
    onChange: (c, t) => events.push(t),
    now: () => clock,
    setTimer: (fn, ms) => { const h = { fn, at: clock + ms, done: false }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.done = true; },
    abandonMs: 60000,
  });
  const advance = (ms) => {
    clock += ms;
    for (const h of [...timers]) if (!h.done && h.at <= clock) { h.done = true; h.fn(); }
  };
  return { chess, advance, events, view: (uid) => chess.viewFor(1, DEF, uid) };
}

function seatBoth(chess) {
  chess.onSeat(1, 10, DEF, 'x1-a', null);
  chess.onSeat(1, 20, DEF, 'x1-b', null);
}

test('mesa vazia mostra a posição inicial', () => {
  const { view } = setup();
  const v = view(10);
  assert.strictEqual(v.game, 'chess');
  assert.strictEqual(v.board, START_BOARD);
  assert.strictEqual(v.phase, 'waiting');
});

test('os dois prontos começa; cadeira 1 = brancas; só quem tem a vez joga; lances inválidos recusados', () => {
  const { chess, view } = setup();
  seatBoth(chess);
  assert.ok(chess.handle(1, DEF, 30, { op: 'ready' }).error, 'quem não está sentado não fica pronto');
  chess.handle(1, DEF, 10, { op: 'mode', mode: 'blitz' });
  chess.handle(1, DEF, 10, { op: 'ready' });
  assert.strictEqual(view(10).phase, 'waiting');
  chess.handle(1, DEF, 20, { op: 'ready' });
  const v = view(10);
  assert.strictEqual(v.phase, 'playing');
  assert.strictEqual(v.white, 10);
  assert.strictEqual(v.black, 20);
  assert.strictEqual(v.gameMode, 'blitz');
  assert.strictEqual(v.clock.w, MODES.blitz.base);
  assert.strictEqual(v.you.color, 'w');
  assert.strictEqual(v.you.legal.length, 20);
  assert.strictEqual(view(20).you.legal.length, 0, 'pretas não têm lances na vez das brancas');
  assert.strictEqual(view(30).you.color, null, 'quem assiste vê tudo, mas não joga');
  assert.ok(chess.handle(1, DEF, 20, { op: 'move', from: 'e7', to: 'e5' }).error);
  assert.ok(chess.handle(1, DEF, 10, { op: 'move', from: 'e2', to: 'e5' }).error);
  assert.ok(!chess.handle(1, DEF, 10, { op: 'move', from: 'e2', to: 'e4' }).error);
  const v2 = view(30);
  assert.deepStrictEqual(v2.lastMove, { from: 'e2', to: 'e4' });
  assert.deepStrictEqual(v2.moves, ['e4']);
  assert.strictEqual(v2.turn, 'b');
  assert.strictEqual(v2.board[28], 'P');
});

test('relógio: desconta o tempo usado, soma o acréscimo e quem zera perde', () => {
  const { chess, view, advance } = setup();
  seatBoth(chess);
  chess.handle(1, DEF, 10, { op: 'mode', mode: 'blitz' });
  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' });
  advance(10000);
  chess.handle(1, DEF, 10, { op: 'move', from: 'e2', to: 'e4' });
  assert.strictEqual(view(10).clock.w, MODES.blitz.base - 10000 + MODES.blitz.inc);
  advance(MODES.blitz.base + 100); // as pretas não jogam
  const v = view(10);
  assert.strictEqual(v.phase, 'over');
  assert.deepStrictEqual(v.result, { winner: 'w', reason: 'timeout' });
  assert.strictEqual(v.clock.b, 0);
});

test('mate termina a partida; revanche troca as cores', () => {
  const { chess, view } = setup();
  seatBoth(chess);
  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' });
  const moves = [[10, 'f2', 'f3'], [20, 'e7', 'e5'], [10, 'g2', 'g4'], [20, 'd8', 'h4']];
  for (const [uid, from, to] of moves) assert.ok(!chess.handle(1, DEF, uid, { op: 'move', from, to }).error);
  const v = view(10);
  assert.strictEqual(v.phase, 'over');
  assert.deepStrictEqual(v.result, { winner: 'b', reason: 'checkmate' });
  assert.deepStrictEqual(v.moves, ['f3', 'e5', 'g4', 'Qh4#']);
  assert.strictEqual(v.check, 'e1');
  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' });
  const r = view(10);
  assert.strictEqual(r.phase, 'playing');
  assert.strictEqual(r.white, 20);
  assert.strictEqual(r.black, 10);
  assert.strictEqual(r.moves.length, 0);
});

test('promoção escolhe a peça (sem escolher vira dama)', () => {
  const { chess, view } = setup();
  seatBoth(chess);
  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' });
  const t = chess._tables.get('1:xadrez-1');
  t.game.pos = fromFen('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  t.game.legal = legalMoves(t.game.pos);
  assert.ok(!chess.handle(1, DEF, 10, { op: 'move', from: 'b7', to: 'b8', promo: 'n' }).error);
  assert.strictEqual(view(10).board[57], 'N');
  assert.strictEqual(view(10).moves.at(-1), 'b8=N');
});

test('empate combinado, desistência e cancelar no começo', () => {
  const { chess, view } = setup();
  seatBoth(chess);
  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' });
  assert.ok(!chess.handle(1, DEF, 10, { op: 'abort' }).error);
  assert.deepStrictEqual(view(10).result, { winner: null, reason: 'aborted' });

  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' }); // agora 20 = brancas
  chess.handle(1, DEF, 20, { op: 'move', from: 'd2', to: 'd4' });
  chess.handle(1, DEF, 10, { op: 'move', from: 'd7', to: 'd5' });
  assert.ok(chess.handle(1, DEF, 10, { op: 'abort' }).error, 'depois de 2 lances não cancela');
  chess.handle(1, DEF, 20, { op: 'draw' });
  assert.strictEqual(view(10).drawOffer, 'w');
  chess.handle(1, DEF, 10, { op: 'decline' });
  assert.strictEqual(view(10).drawOffer, null);
  chess.handle(1, DEF, 20, { op: 'draw' });
  chess.handle(1, DEF, 10, { op: 'draw' }); // aceita
  assert.deepStrictEqual(view(10).result, { winner: null, reason: 'agreement' });

  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'resign' });
  const v = view(10);
  assert.strictEqual(v.result.reason, 'resign');
  assert.strictEqual(v.result.winner, v.black === 20 ? 'w' : 'b');
});

test('levantou no meio da partida: volta a tempo continua, senão perde por abandono', () => {
  const { chess, view, advance } = setup();
  seatBoth(chess);
  chess.handle(1, DEF, 10, { op: 'mode', mode: 'classico' });
  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' });
  chess.onSeat(1, 20, null, null, DEF);
  assert.strictEqual(view(10).away.length, 1);
  advance(30000);
  chess.onSeat(1, 20, DEF, 'x1-b', null);
  assert.strictEqual(view(10).away.length, 0);
  advance(60000);
  assert.strictEqual(view(10).phase, 'playing');
  chess.onLeaveCall(1, 20);
  advance(60001);
  assert.deepStrictEqual(view(10).result, { winner: 'w', reason: 'abandon' });
});

test('mudar o modo tira o "pronto" e não vale no meio da partida', () => {
  const { chess, view } = setup();
  seatBoth(chess);
  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'mode', mode: 'classico' });
  assert.deepStrictEqual(view(10).ready, []);
  chess.handle(1, DEF, 10, { op: 'ready' });
  chess.handle(1, DEF, 20, { op: 'ready' });
  assert.ok(chess.handle(1, DEF, 10, { op: 'mode', mode: 'blitz' }).error);
});
