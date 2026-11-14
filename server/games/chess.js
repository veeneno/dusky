// Xadrez nas mesas de xadrez do mundinho. Ver docs/MUNDINHO.md. Tudo é decidido AQUI no servidor:
// o site só pede "e2 pra e4", "desisto", "ofereço empate"... Este arquivo não sabe de WebSocket:
// quem entrega é server/realtime.js (mesmo formato do server/games/blackjack.js).
//
// Regras completas: roque, en passant, promoção (escolhe a peça), xeque, xeque-mate e afogamento.
// Empate automático por material insuficiente, 3 repetições da posição e 50 lances sem captura
// nem movimento de peão. Acabou o tempo: perde — a não ser que o outro não tenha como dar mate
// (aí é empate, como no FIDE).
//
// Mesa (uma por call-mundo e por mesa de xadrez da cena; 2 cadeiras):
//   seated   quem está sentado: userId -> { seat }
//   mode     'classico' | 'rapido' | 'blitz' (qualquer um sentado muda antes de começar)
//   ready    quem apertou "pronto" (os dois sentados prontos = começa)
//   phase    'waiting' -> 'playing' -> 'over' -> (prontos de novo) 'playing'...
//   game     a partida: brancas, pretas, posição, lances (SAN), relógios, resultado
// Revanche com as mesmas duas pessoas troca as cores. Levantou ou saiu da call no meio da partida:
// tem ABANDON_MS pra voltar pra mesa, senão perde por abandono (o relógio continua correndo).

const FILES = 'abcdefgh';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ABANDON_MS = 60000;

const MODES = {
  classico: { label: 'clássico', base: 30 * 60000, inc: 20000 },
  rapido: { label: 'rápido', base: 10 * 60000, inc: 5000 },
  blitz: { label: 'blitz', base: 3 * 60000, inc: 2000 },
};
const MODE_LIST = Object.entries(MODES).map(([id, m]) => ({ id, label: m.label, base: m.base, inc: m.inc }));
const DEFAULT_MODE = 'rapido';

// ==================================================================
// regras
// ==================================================================
const fileOf = (i) => i & 7;
const rankOf = (i) => i >> 3;
const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
function parseSq(s) {
  if (typeof s !== 'string' || !/^[a-h][1-8]$/.test(s)) return -1;
  return (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
}
const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
const other = (c) => (c === 'w' ? 'b' : 'w');

function fromFen(fen) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  const rows = placement.split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[7 - r]) {
      if (/\d/.test(ch)) f += Number(ch);
      else { board[r * 8 + f] = ch; f++; }
    }
  }
  return {
    board,
    turn: turn || 'w',
    castling: !castling || castling === '-' ? '' : castling,
    ep: !ep || ep === '-' ? -1 : parseSq(ep),
    half: Number(half) || 0,
    full: Number(full) || 1,
  };
}

function placementOf(board) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}
function toFen(pos) {
  return `${placementOf(pos.board)} ${pos.turn} ${pos.castling || '-'} ${pos.ep >= 0 ? sqName(pos.ep) : '-'} ${pos.half} ${pos.full}`;
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const inside = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

// a casa `sq` está atacada por alguma peça da cor `by`?
function attacked(board, sq, by) {
  const f = fileOf(sq);
  const r = rankOf(sq);
  const up = by === 'w';
  const pawn = up ? 'P' : 'p';
  const pr = up ? r - 1 : r + 1;
  for (const df of [-1, 1]) if (inside(f + df, pr) && board[pr * 8 + f + df] === pawn) return true;
  const knight = up ? 'N' : 'n';
  for (const [df, dr] of KNIGHT) if (inside(f + df, r + dr) && board[(r + dr) * 8 + f + df] === knight) return true;
  const king = up ? 'K' : 'k';
  for (const [df, dr] of KING) if (inside(f + df, r + dr) && board[(r + dr) * 8 + f + df] === king) return true;
  const slide = (dirs, a, b) => {
    for (const [df, dr] of dirs) {
      let x = f + df;
      let y = r + dr;
      while (inside(x, y)) {
        const p = board[y * 8 + x];
        if (p) { if (p === a || p === b) return true; break; }
        x += df;
        y += dr;
      }
    }
    return false;
  };
  if (slide(ROOK_D, up ? 'R' : 'r', up ? 'Q' : 'q')) return true;
  return slide(BISHOP_D, up ? 'B' : 'b', up ? 'Q' : 'q');
}

function kingSquare(board, color) { return board.indexOf(color === 'w' ? 'K' : 'k'); }
function inCheck(pos) { return attacked(pos.board, kingSquare(pos.board, pos.turn), other(pos.turn)); }

// lances possíveis sem olhar se o próprio rei fica em xeque
function pseudoMoves(pos) {
  const { board, turn } = pos;
  const moves = [];
  const add = (from, to, extra) => moves.push({ from, to, promo: null, flag: null, ...(extra || {}) });
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || colorOf(p) !== turn) continue;
    const f = fileOf(from);
    const r = rankOf(from);
    const t = p.toUpperCase();
    if (t === 'P') {
      const dir = turn === 'w' ? 1 : -1;
      const startRank = turn === 'w' ? 1 : 6;
      const lastRank = turn === 'w' ? 7 : 0;
      const push = (to, extra) => {
        if (rankOf(to) === lastRank) for (const promo of ['q', 'r', 'b', 'n']) add(from, to, { ...extra, promo });
        else add(from, to, extra);
      };
      const one = (r + dir) * 8 + f;
      if (inside(f, r + dir) && !board[one]) {
        push(one);
        const two = (r + 2 * dir) * 8 + f;
        if (r === startRank && !board[two]) add(from, two, { flag: 'double' });
      }
      for (const df of [-1, 1]) {
        if (!inside(f + df, r + dir)) continue;
        const to = (r + dir) * 8 + f + df;
        if (board[to] && colorOf(board[to]) !== turn) push(to);
        else if (to === pos.ep) add(from, to, { flag: 'ep' });
      }
      continue;
    }
    if (t === 'N' || t === 'K') {
      for (const [df, dr] of t === 'N' ? KNIGHT : KING) {
        if (!inside(f + df, r + dr)) continue;
        const to = (r + dr) * 8 + f + df;
        if (!board[to] || colorOf(board[to]) !== turn) add(from, to);
      }
      if (t === 'K') {
        const home = turn === 'w' ? 4 : 60;
        const enemy = other(turn);
        const rook = turn === 'w' ? 'R' : 'r';
        const can = (c) => pos.castling.includes(turn === 'w' ? c : c.toLowerCase());
        if (from === home && !attacked(board, home, enemy)) {
          if (can('K') && board[home + 3] === rook && !board[home + 1] && !board[home + 2]
            && !attacked(board, home + 1, enemy) && !attacked(board, home + 2, enemy)) add(from, home + 2, { flag: 'castleK' });
          if (can('Q') && board[home - 4] === rook && !board[home - 1] && !board[home - 2] && !board[home - 3]
            && !attacked(board, home - 1, enemy) && !attacked(board, home - 2, enemy)) add(from, home - 2, { flag: 'castleQ' });
        }
      }
      continue;
    }
    const dirs = t === 'R' ? ROOK_D : t === 'B' ? BISHOP_D : [...ROOK_D, ...BISHOP_D];
    for (const [df, dr] of dirs) {
      let x = f + df;
      let y = r + dr;
      while (inside(x, y)) {
        const to = y * 8 + x;
        if (board[to]) { if (colorOf(board[to]) !== turn) add(from, to); break; }
        add(from, to);
        x += df;
        y += dr;
      }
    }
  }
  return moves;
}

// aplica um lance (já conferido) e devolve a posição nova; não mexe na antiga
function makeMove(pos, m) {
  const b = pos.board.slice();
  const p = b[m.from];
  const white = colorOf(p) === 'w';
  let captured = b[m.to];
  b[m.from] = null;
  if (m.flag === 'ep') {
    const capSq = m.to + (white ? -8 : 8);
    captured = b[capSq];
    b[capSq] = null;
  }
  b[m.to] = m.promo ? (white ? m.promo.toUpperCase() : m.promo) : p;
  if (m.flag === 'castleK') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
  if (m.flag === 'castleQ') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
  // direitos de roque: rei ou torre saiu da casa (ou a torre foi capturada lá)
  let castling = pos.castling;
  const drop = (chars) => { for (const c of chars) castling = castling.replace(c, ''); };
  if (p === 'K') drop('KQ');
  if (p === 'k') drop('kq');
  for (const sq of [m.from, m.to]) {
    if (sq === 0) drop('Q');
    if (sq === 7) drop('K');
    if (sq === 56) drop('q');
    if (sq === 63) drop('k');
  }
  return {
    board: b,
    turn: other(pos.turn),
    castling,
    ep: m.flag === 'double' ? (m.from + m.to) / 2 : -1,
    half: p.toUpperCase() === 'P' || captured ? 0 : pos.half + 1,
    full: pos.turn === 'b' ? pos.full + 1 : pos.full,
  };
}

function legalMoves(pos) {
  return pseudoMoves(pos).filter((m) => {
    const next = makeMove(pos, m);
    return !attacked(next.board, kingSquare(next.board, pos.turn), next.turn);
  });
}

// notação algébrica (inglês, como o PGN: K Q R B N). O site traduz pra R D T B C.
function toSan(pos, m, legal) {
  let san;
  if (m.flag === 'castleK') san = 'O-O';
  else if (m.flag === 'castleQ') san = 'O-O-O';
  else {
    const p = pos.board[m.from];
    const t = p.toUpperCase();
    const capture = !!pos.board[m.to] || m.flag === 'ep';
    if (t === 'P') {
      san = (capture ? `${FILES[fileOf(m.from)]}x` : '') + sqName(m.to) + (m.promo ? `=${m.promo.toUpperCase()}` : '');
    } else {
      const rivals = (legal || legalMoves(pos)).filter((o) => o.to === m.to && o.from !== m.from && pos.board[o.from] === p);
      let dis = '';
      if (rivals.length) {
        const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(m.from));
        const sameRank = rivals.some((o) => rankOf(o.from) === rankOf(m.from));
        if (!sameFile) dis = FILES[fileOf(m.from)];
        else if (!sameRank) dis = String(rankOf(m.from) + 1);
        else dis = sqName(m.from);
      }
      san = t + dis + (capture ? 'x' : '') + sqName(m.to);
    }
  }
  const next = makeMove(pos, m);
  if (inCheck(next)) san += legalMoves(next).length ? '+' : '#';
  return san;
}

// ninguém consegue dar mate: só reis, rei + 1 peça menor, ou bispos todos na mesma cor de casa
function insufficientMaterial(board) {
  const rest = [];
  board.forEach((p, i) => { if (p && p.toUpperCase() !== 'K') rest.push({ t: p.toUpperCase(), i }); });
  if (!rest.length) return true;
  if (rest.length === 1 && (rest[0].t === 'B' || rest[0].t === 'N')) return true;
  if (rest.every((x) => x.t === 'B')) {
    const shade = (i) => (fileOf(i) + rankOf(i)) % 2;
    return rest.every((x) => shade(x.i) === shade(rest[0].i));
  }
  return false;
}

// acabou o tempo do outro: `winner` ainda tem como dar mate? (só o rei, ou uma peça menor
// sozinha contra só o rei, não dá)
function canStillMate(board, winner) {
  const own = [];
  let loserHasMore = false;
  for (const p of board) {
    if (!p || p.toUpperCase() === 'K') continue;
    if (colorOf(p) === winner) own.push(p.toUpperCase()); else loserHasMore = true;
  }
  if (!own.length) return false;
  if (own.length === 1 && (own[0] === 'B' || own[0] === 'N') && !loserHasMore) return false;
  return true;
}

const repKey = (pos) => `${placementOf(pos.board)} ${pos.turn} ${pos.castling} ${pos.ep}`;
const boardString = (board) => board.map((p) => p || '.').join('');
const START_BOARD = boardString(fromFen(START_FEN).board);

// ==================================================================
// mesas
// ==================================================================
function createChess({
  onChange,
  now = () => Date.now(),
  setTimer = (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
  clearTimer = (t) => clearTimeout(t),
  abandonMs = ABANDON_MS,
} = {}) {
  const tables = new Map(); // `${channelId}:${tableId}` -> mesa

  const key = (channelId, tableId) => `${channelId}:${tableId}`;
  function getTable(channelId, def, create) {
    const k = key(channelId, def.id);
    if (!tables.has(k) && create) {
      tables.set(k, {
        channelId, def, seated: new Map(), mode: DEFAULT_MODE, ready: new Set(), phase: 'waiting',
        game: null, last: null, log: null, clockTimer: null, away: new Map(), round: 0,
      });
    }
    return tables.get(k) || null;
  }
  function changed(t) { if (onChange) onChange(t.channelId, t.def.id); }
  const colorFor = (g, uid) => (g && uid === g.white ? 'w' : g && uid === g.black ? 'b' : null);

  function disarmClock(t) {
    if (t.clockTimer) clearTimer(t.clockTimer);
    t.clockTimer = null;
  }
  function clearAway(t) {
    for (const a of t.away.values()) clearTimer(a.handle);
    t.away.clear();
  }
  // relógio de quem joga agora: zerou = perde (ou empata, se o outro não tem como dar mate)
  function armClock(t) {
    disarmClock(t);
    const g = t.game;
    const left = g.clock[g.pos.turn] - (now() - g.since);
    t.clockTimer = setTimer(() => { t.clockTimer = null; onFlag(t); }, Math.max(0, left) + 20);
  }
  function timeoutResult(t, side) {
    const g = t.game;
    const winner = other(side);
    const mate = canStillMate(g.pos.board, winner);
    finish(t, mate ? winner : null, mate ? 'timeout' : 'timeout-draw');
  }
  function onFlag(t) {
    const g = t.game;
    if (t.phase !== 'playing' || !g) return;
    const side = g.pos.turn;
    const left = g.clock[side] - (now() - g.since);
    if (left > 0) { armClock(t); return; } // o timer disparou cedo: ainda tem tempo
    g.clock[side] = 0;
    g.since = now();
    g.frozen = true;
    timeoutResult(t, side);
    changed(t);
  }

  function finish(t, winner, reason) {
    const g = t.game;
    disarmClock(t);
    clearAway(t);
    if (!g.frozen) {
      g.clock[g.pos.turn] = Math.max(0, g.clock[g.pos.turn] - (now() - g.since));
      g.since = now();
      g.frozen = true;
    }
    g.result = { winner, reason };
    g.drawOffer = null;
    t.phase = 'over';
    t.ready.clear();
    t.last = { white: g.white, black: g.black };
    t.log = { type: 'end', winner, reason };
  }

  function seatOrder(t) {
    const idx = (uid) => t.def.seats.indexOf(t.seated.get(uid).seat);
    return [...t.seated.keys()].sort((a, b) => idx(a) - idx(b));
  }

  function startGame(t) {
    const [a, b] = seatOrder(t);
    let white = a;
    let black = b;
    // revanche com as mesmas duas pessoas: troca as cores
    if (t.last && new Set([t.last.white, t.last.black, a, b]).size === 2) { white = t.last.black; black = t.last.white; }
    const mode = MODES[t.mode];
    const pos = fromFen(START_FEN);
    t.round++;
    t.game = {
      white, black, mode: t.mode, pos, moves: [], reps: new Map([[repKey(pos), 1]]),
      clock: { w: mode.base, b: mode.base }, inc: mode.inc, since: now(), frozen: false,
      lastMove: null, result: null, drawOffer: null, legal: legalMoves(pos),
    };
    t.phase = 'playing';
    t.ready.clear();
    t.log = { type: 'start' };
    armClock(t);
  }

  function maybeStart(t) {
    if (t.phase === 'playing' || t.seated.size !== 2) return;
    for (const uid of t.seated.keys()) if (!t.ready.has(uid)) return;
    startGame(t);
  }

  function playMove(t, uid, msg) {
    const g = t.game;
    if (t.phase !== 'playing') return { error: 'não tem partida em andamento' };
    const color = colorFor(g, uid);
    if (!color) return { error: 'você não está jogando essa partida' };
    if (g.pos.turn !== color) return { error: 'não é a sua vez' };
    if (!t.seated.has(uid)) return { error: 'sente na mesa pra jogar' };
    const from = parseSq(msg.from);
    const to = parseSq(msg.to);
    const promo = ['q', 'r', 'b', 'n'].includes(msg.promo) ? msg.promo : null;
    const mv = g.legal.find((m) => m.from === from && m.to === to && (m.promo ? m.promo === (promo || 'q') : true));
    if (!mv) return { error: 'lance inválido' };
    const at = now();
    g.clock[color] -= at - g.since;
    g.since = at;
    if (g.clock[color] <= 0) { // jogou depois do tempo acabar (o timer ainda não tinha disparado)
      g.clock[color] = 0;
      g.frozen = true;
      timeoutResult(t, color);
      changed(t);
      return {};
    }
    g.clock[color] += g.inc;
    const san = toSan(g.pos, mv, g.legal);
    g.pos = makeMove(g.pos, mv);
    g.moves.push(san);
    g.lastMove = { from: sqName(from), to: sqName(to) };
    g.legal = legalMoves(g.pos);
    g.drawOffer = null;
    const rk = repKey(g.pos);
    g.reps.set(rk, (g.reps.get(rk) || 0) + 1);
    t.log = { type: 'move', userId: uid, san };
    if (!g.legal.length) finish(t, inCheck(g.pos) ? color : null, inCheck(g.pos) ? 'checkmate' : 'stalemate');
    else if (insufficientMaterial(g.pos.board)) finish(t, null, 'material');
    else if (g.reps.get(rk) >= 3) finish(t, null, 'repetition');
    else if (g.pos.half >= 100) finish(t, null, 'fifty');
    else armClock(t);
    changed(t);
    return {};
  }

  // ---------- pedidos de quem está na call ----------
  // msg.op: mode (mode) | ready (on) | move (from, to, promo) | resign | draw | decline | abort
  function handle(channelId, def, uid, msg) {
    const t = getTable(channelId, def, true);
    const op = msg && msg.op;
    const g = t.game;

    if (op === 'mode') {
      if (!t.seated.has(uid)) return { error: 'sente na mesa de xadrez pra escolher o modo' };
      if (t.phase === 'playing') return { error: 'espere a partida acabar' };
      if (!MODES[msg.mode]) return { error: 'modo inválido' };
      if (t.mode !== msg.mode) { t.mode = msg.mode; t.ready.clear(); t.log = { type: 'mode', userId: uid, mode: msg.mode }; }
      changed(t);
      return {};
    }
    if (op === 'ready') {
      if (!t.seated.has(uid)) return { error: 'sente na mesa de xadrez pra jogar' };
      if (t.phase === 'playing') return {};
      if (msg.on === false) t.ready.delete(uid); else t.ready.add(uid);
      maybeStart(t);
      changed(t);
      return {};
    }
    if (op === 'move') return playMove(t, uid, msg || {});

    if (t.phase !== 'playing' || !g) return { error: 'não tem partida em andamento' };
    const color = colorFor(g, uid);
    if (!color) return { error: 'você não está jogando essa partida' };
    if (op === 'resign') {
      finish(t, other(color), 'resign');
      changed(t);
      return {};
    }
    if (op === 'abort') {
      if (g.moves.length >= 2) return { error: 'depois do primeiro lance de cada um não dá mais pra cancelar — dá pra desistir ou oferecer empate' };
      finish(t, null, 'aborted');
      changed(t);
      return {};
    }
    if (op === 'draw') {
      if (g.drawOffer === other(color)) finish(t, null, 'agreement');
      else if (!g.drawOffer) { g.drawOffer = color; t.log = { type: 'draw-offer', userId: uid }; }
      changed(t);
      return {};
    }
    if (op === 'decline') {
      if (g.drawOffer !== other(color)) return {};
      g.drawOffer = null;
      t.log = { type: 'draw-declined', userId: uid };
      changed(t);
      return {};
    }
    return { error: 'jogada inválida' };
  }

  // ---------- cadeiras ----------
  // saiu da mesa no meio da partida: tem abandonMs pra voltar
  function leaveTable(t, uid) {
    const was = t.seated.delete(uid);
    t.ready.delete(uid);
    const g = t.game;
    if (t.phase === 'playing' && colorFor(g, uid) && !t.away.has(uid)) {
      const until = now() + abandonMs;
      const handle = setTimer(() => {
        t.away.delete(uid);
        if (t.phase !== 'playing' || t.game !== g || t.seated.has(uid)) return;
        finish(t, other(colorFor(g, uid)), 'abandon');
        changed(t);
      }, abandonMs);
      t.away.set(uid, { until, handle });
      t.log = { type: 'away', userId: uid };
      return true;
    }
    return was;
  }

  function onSeat(channelId, uid, def, seatId, prevDef) {
    if (prevDef && (!def || prevDef.id !== def.id)) {
      const t = getTable(channelId, prevDef, false);
      if (t && leaveTable(t, uid)) changed(t);
    }
    if (def) {
      const t = getTable(channelId, def, true);
      t.seated.set(uid, { seat: seatId });
      const away = t.away.get(uid);
      if (away) { clearTimer(away.handle); t.away.delete(uid); t.log = { type: 'back', userId: uid }; }
      changed(t);
    }
  }

  function onLeaveCall(channelId, uid) {
    for (const t of tables.values()) {
      if (t.channelId === channelId && leaveTable(t, uid)) changed(t);
    }
  }

  function clearChannel(channelId) {
    for (const [k, t] of tables) {
      if (t.channelId !== channelId) continue;
      disarmClock(t);
      clearAway(t);
      tables.delete(k);
    }
  }

  // ---------- o que cada um vê: tudo é aberto (xadrez não tem segredo) ----------
  function viewFor(channelId, def, viewerId) {
    const t = getTable(channelId, def, false);
    const base = { game: 'chess', table: def.id, modes: MODE_LIST };
    if (!t) {
      return {
        ...base, phase: 'waiting', mode: DEFAULT_MODE, gameMode: null, round: 0, seated: [], ready: [], board: START_BOARD,
        turn: 'w', white: null, black: null, clock: null, lastMove: null, check: null, moves: [], result: null,
        drawOffer: null, away: [], log: null, you: { color: null, legal: [] },
      };
    }
    const g = t.game;
    const playing = t.phase === 'playing';
    const color = playing ? colorFor(g, viewerId) : null;
    const checked = g && inCheck(g.pos) ? sqName(kingSquare(g.pos.board, g.pos.turn)) : null;
    return {
      ...base,
      phase: t.phase,
      mode: t.mode,
      gameMode: g ? g.mode : null,
      round: t.round,
      seated: [...t.seated.entries()].map(([userId, s]) => ({ userId, seat: s.seat })),
      ready: [...t.ready],
      board: g ? boardString(g.pos.board) : START_BOARD,
      turn: g ? g.pos.turn : 'w',
      white: g ? g.white : null,
      black: g ? g.black : null,
      clock: g ? { w: g.clock.w, b: g.clock.b, since: g.since, running: playing, inc: g.inc } : null,
      lastMove: g ? g.lastMove : null,
      check: checked,
      moves: g ? g.moves : [],
      result: g ? g.result : null,
      drawOffer: g ? g.drawOffer : null,
      away: [...t.away.entries()].map(([userId, a]) => ({ userId, until: a.until })),
      log: t.log,
      you: {
        color,
        legal: color && g.pos.turn === color ? g.legal.map((m) => sqName(m.from) + sqName(m.to) + (m.promo || '')) : [],
      },
    };
  }

  return { handle, onSeat, onLeaveCall, clearChannel, viewFor, _tables: tables };
}

module.exports = {
  createChess, fromFen, toFen, legalMoves, makeMove, toSan, inCheck, insufficientMaterial, canStillMate,
  parseSq, sqName, MODES, START_FEN, START_BOARD, ABANDON_MS,
};
