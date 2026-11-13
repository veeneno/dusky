// Duno: o jogo de cartas da mesa de jogos do mundinho (estilo Uno, com nome e cartas próprios).
// Ver docs/MUNDINHO.md. Tudo é decidido AQUI no servidor: o site só pede "joguei a carta X".
// Cada pessoa recebe uma visão filtrada (viewFor): quem joga só vê a própria mão; quem não joga vê
// todas. Este arquivo não sabe de WebSocket: quem entrega é server/realtime.js.
//
// Mesa (uma por call-mundo e por mesa da cena):
//   occupants  quem está sentado nas cadeiras da mesa: userId -> { role: 'play' | 'watch' | null, seat, at }
//   host       o primeiro que sentou (passa pro próximo se ele levantar antes de começar)
//   game       null (saguão) ou a partida em andamento/terminada
const crypto = require('crypto');

const COLORS = ['red', 'yellow', 'green', 'blue'];
const HAND_SIZE = 7;
const MAX_PLAYERS = 8;
const TURN_MS = 30000;      // tempo de cada jogada
const AFTER_DRAW_MS = 12000; // depois de comprar, tempo pra jogar a carta comprada ou passar

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 108 cartas: por cor um 0, dois de 1 a 9, dois de cada ação; + 4 coringas e 4 coringas +4
function makeDeck() {
  const deck = [];
  let n = 0;
  const add = (color, value) => deck.push({ id: `k${++n}`, color, value });
  for (const c of COLORS) {
    add(c, '0');
    for (let i = 0; i < 2; i++) {
      for (let v = 1; v <= 9; v++) add(c, String(v));
      add(c, 'skip');
      add(c, 'reverse');
      add(c, 'draw2');
    }
  }
  for (let i = 0; i < 4; i++) { add(null, 'wild'); add(null, 'wild4'); }
  return shuffle(deck);
}

const isWild = (card) => card.value === 'wild' || card.value === 'wild4';

function createTables({ onChange, now = () => Date.now(), turnMs = TURN_MS, afterDrawMs = AFTER_DRAW_MS } = {}) {
  const tables = new Map(); // `${channelId}:${tableId}` -> mesa

  const key = (channelId, tableId) => `${channelId}:${tableId}`;
  function getTable(channelId, def, create) {
    const k = key(channelId, def.id);
    if (!tables.has(k) && create) {
      tables.set(k, { channelId, def, occupants: new Map(), host: null, game: null, timer: null, log: null });
    }
    return tables.get(k) || null;
  }
  function changed(t) { if (onChange) onChange(t.channelId, t.def.id); }

  function pickHost(t) {
    if (t.host != null && t.occupants.has(t.host)) return;
    // durante a partida, o host pode estar andando por aí: continua host se ainda joga
    if (t.host != null && t.game && t.game.players.includes(t.host)) return;
    let best = null;
    for (const [uid, o] of t.occupants) if (!best || o.at < best.at) best = { uid, at: o.at };
    t.host = best ? best.uid : (t.game ? t.game.players[0] ?? null : null);
  }

  // ---------- partida ----------
  function topCard(g) { return g.discard[g.discard.length - 1]; }

  function drawCards(g, uid, count) {
    const hand = g.hands.get(uid);
    const got = [];
    for (let i = 0; i < count; i++) {
      if (!g.drawPile.length) {
        // acabou o monte: embaralha o descarte (menos a de cima) e volta a ser monte
        const top = g.discard.pop();
        g.drawPile = shuffle(g.discard.map((c) => (isWild(c) ? { ...c, color: null } : c)));
        g.discard = [top];
        if (!g.drawPile.length) break;
      }
      const c = g.drawPile.pop();
      hand.push(c);
      got.push(c);
    }
    return got;
  }

  function playable(g, card) {
    if (isWild(card)) return true;
    const top = topCard(g);
    return card.color === g.color || card.value === top.value;
  }

  function nextIndex(g, from, steps = 1) {
    const n = g.players.length;
    return ((from + g.dir * steps) % n + n) % n;
  }

  function startTurn(t, index, ms = turnMs) {
    const g = t.game;
    g.turn = index;
    g.drewCard = null;
    g.dunoArmed = null;
    g.turnEndsAt = now() + ms;
    armTimer(t, ms);
  }

  function armTimer(t, ms) {
    clearTimeout(t.timer);
    t.timer = setTimeout(() => onTimeout(t), ms);
    if (t.timer.unref) t.timer.unref();
  }

  // estourou o tempo: compra 1 (se ainda não comprou) e passa
  function onTimeout(t) {
    const g = t.game;
    if (!g || g.phase !== 'playing') return;
    const uid = g.players[g.turn];
    if (!g.drewCard) drawCards(g, uid, 1);
    t.log = { type: 'timeout', userId: uid };
    g.unoPending = null;
    startTurn(t, nextIndex(g, g.turn));
    changed(t);
  }

  function endGame(t, winner) {
    const g = t.game;
    g.phase = 'ended';
    g.winner = winner;
    g.turnEndsAt = null;
    clearTimeout(t.timer);
  }

  function start(t) {
    const players = [...t.occupants.entries()]
      .filter(([, o]) => o.role === 'play')
      .sort((a, b) => t.def.seats.indexOf(a[1].seat) - t.def.seats.indexOf(b[1].seat))
      .map(([uid]) => uid)
      .slice(0, MAX_PLAYERS);
    if (players.length < 2) return 'precisa de pelo menos 2 pessoas jogando';
    const g = { phase: 'playing', players, hands: new Map(), drawPile: makeDeck(), discard: [], color: null, dir: 1, turn: 0, drewCard: null, unoPending: null, winner: null, turnEndsAt: null, startedAt: now() };
    for (const uid of players) { g.hands.set(uid, []); drawCards(g, uid, HAND_SIZE); }
    // primeira carta da mesa: um número (as de ação voltam pro meio do monte)
    let first = g.drawPile.pop();
    while (!/^\d$/.test(first.value)) {
      g.drawPile.splice(crypto.randomInt(g.drawPile.length + 1), 0, first);
      first = g.drawPile.pop();
    }
    g.discard.push(first);
    g.color = first.color;
    t.game = g;
    t.log = { type: 'start' };
    startTurn(t, 0);
    return null;
  }

  // tira alguém da partida (saiu, ou saiu da call). As cartas dele voltam pro fundo do monte.
  function removePlayer(t, uid) {
    const g = t.game;
    if (!g || g.phase !== 'playing') return false;
    const idx = g.players.indexOf(uid);
    if (idx < 0) return false;
    const wasTurn = idx === g.turn;
    g.drawPile.unshift(...shuffle(g.hands.get(uid) || []));
    g.hands.delete(uid);
    g.players.splice(idx, 1);
    if (g.unoPending && g.unoPending.userId === uid) g.unoPending = null;
    t.log = { type: 'left', userId: uid };
    if (g.players.length < 2) { endGame(t, g.players[0] ?? null); return true; }
    if (idx < g.turn) g.turn -= 1;
    if (wasTurn) startTurn(t, g.turn % g.players.length);
    else if (g.turn >= g.players.length) g.turn = 0;
    return true;
  }

  // ---------- pedidos de quem está na call ----------
  // msg.op: role | start | play | draw | pass | duno | catch | leave | reset
  function handle(channelId, def, uid, msg) {
    const t = getTable(channelId, def, true);
    const g = t.game;
    const op = msg && msg.op;
    const occ = t.occupants.get(uid);

    if (op === 'role') {
      if (!occ) return { error: 'sente numa cadeira da mesa primeiro' };
      if (g && g.phase === 'playing') return { error: 'a partida já começou — espere a próxima' };
      occ.role = msg.role === 'play' ? 'play' : 'watch';
      const playing = [...t.occupants.values()].filter((o) => o.role === 'play').length;
      if (occ.role === 'play' && playing > MAX_PLAYERS) { occ.role = 'watch'; return { error: `a mesa aceita até ${MAX_PLAYERS} jogadores` }; }
      changed(t);
      return {};
    }
    if (op === 'start') {
      if (t.host !== uid) return { error: 'só o host começa a partida' };
      if (g && g.phase === 'playing') return { error: 'a partida já está rolando' };
      const err = start(t);
      if (err) return { error: err };
      changed(t);
      return {};
    }
    if (op === 'reset') {
      if (t.host !== uid) return { error: 'só o host pode recomeçar' };
      if (!g || g.phase === 'playing') return { error: 'não tem partida terminada' };
      t.game = null;
      t.log = null;
      // quem levantou durante a partida e não voltou pra mesa sai da lista
      pickHost(t);
      changed(t);
      return {};
    }
    if (!g || g.phase !== 'playing') return { error: 'não tem partida rolando' };
    const me = g.players.indexOf(uid);

    if (op === 'leave') {
      if (me < 0) return { error: 'você não está jogando' };
      removePlayer(t, uid);
      const o = t.occupants.get(uid);
      if (o) o.role = 'watch';
      pickHost(t);
      changed(t);
      return {};
    }
    if (op === 'duno') {
      // gritou DUNO! (antes de alguém pegar)
      if (g.unoPending && g.unoPending.userId === uid) { g.unoPending = null; t.log = { type: 'duno', userId: uid }; changed(t); }
      else if (me >= 0 && me === g.turn && g.hands.get(uid).length === 2) { g.dunoArmed = uid; t.log = { type: 'duno', userId: uid }; changed(t); }
      return {};
    }
    if (op === 'catch') {
      if (me < 0) return { error: 'só quem joga pode pegar' };
      const p = g.unoPending;
      if (!p || p.userId === uid) return { error: 'não tem ninguém pra pegar' };
      drawCards(g, p.userId, 2);
      g.unoPending = null;
      t.log = { type: 'caught', userId: p.userId, by: uid };
      changed(t);
      return {};
    }
    if (me < 0) return { error: 'você não está jogando' };
    if (me !== g.turn) return { error: 'não é a sua vez' };

    if (op === 'draw') {
      if (g.drewCard) return { error: 'você já comprou nessa vez' };
      g.unoPending = null;
      const [card] = drawCards(g, uid, 1);
      g.drewCard = card ? card.id : 'none';
      t.log = { type: 'draw', userId: uid };
      // a carta comprada não serve: passa sozinho
      if (!card || !playable(g, card)) { startTurn(t, nextIndex(g, g.turn)); changed(t); return {}; }
      g.turnEndsAt = now() + afterDrawMs;
      armTimer(t, afterDrawMs);
      changed(t);
      return {};
    }
    if (op === 'pass') {
      if (!g.drewCard) return { error: 'compre uma carta antes de passar' };
      startTurn(t, nextIndex(g, g.turn));
      t.log = { type: 'pass', userId: uid };
      changed(t);
      return {};
    }
    if (op === 'play') {
      const hand = g.hands.get(uid);
      const i = hand.findIndex((c) => c.id === msg.cardId);
      if (i < 0) return { error: 'essa carta não está na sua mão' };
      const card = hand[i];
      if (g.drewCard && g.drewCard !== card.id) return { error: 'depois de comprar, só dá pra jogar a carta que você comprou' };
      if (!playable(g, card)) return { error: 'essa carta não combina com a da mesa' };
      if (isWild(card) && !COLORS.includes(msg.color)) return { error: 'escolha uma cor' };
      hand.splice(i, 1);
      g.discard.push(isWild(card) ? { ...card, color: msg.color } : card);
      g.color = isWild(card) ? msg.color : card.color;
      g.unoPending = null;
      t.log = { type: 'play', userId: uid, card: g.discard[g.discard.length - 1] };
      // ficou com 1 carta: se não gritou DUNO, os outros podem pegar até a próxima jogada
      if (hand.length === 1 && !msg.duno && g.dunoArmed !== uid) g.unoPending = { userId: uid };
      g.dunoArmed = null;
      if (hand.length === 0) { endGame(t, uid); changed(t); return {}; }
      const n = g.players.length;
      let steps = 1;
      if (card.value === 'skip') steps = 2;
      if (card.value === 'reverse') { if (n === 2) steps = 2; else g.dir *= -1; }
      if (card.value === 'draw2' || card.value === 'wild4') {
        const victim = g.players[nextIndex(g, g.turn)];
        drawCards(g, victim, card.value === 'draw2' ? 2 : 4);
        steps = 2;
      }
      startTurn(t, nextIndex(g, g.turn, steps));
      changed(t);
      return {};
    }
    return { error: 'jogada inválida' };
  }

  // ---------- cadeiras ----------
  // alguém sentou/levantou: `def` = mesa da cadeira nova (ou null), `prevDef` = mesa da cadeira antiga
  function onSeat(channelId, uid, def, seatId, prevDef) {
    if (prevDef && (!def || prevDef.id !== def.id)) {
      const t = getTable(channelId, prevDef, false);
      if (t && t.occupants.has(uid)) {
        t.occupants.delete(uid);
        pickHost(t);
        changed(t);
      }
    }
    if (def) {
      const t = getTable(channelId, def, true);
      const prev = t.occupants.get(uid);
      const inGame = t.game && t.game.phase === 'playing';
      // quem joga e volta pra mesa continua jogador; quem chega no meio da partida assiste
      const role = prev ? prev.role : (inGame ? (t.game.players.includes(uid) ? 'play' : 'watch') : null);
      t.occupants.set(uid, { role, seat: seatId, at: prev ? prev.at : now() });
      pickHost(t);
      changed(t);
    }
  }

  // saiu da call: sai da mesa e da partida
  function onLeaveCall(channelId, uid) {
    for (const t of tables.values()) {
      if (t.channelId !== channelId) continue;
      let touched = false;
      if (t.occupants.delete(uid)) touched = true;
      if (removePlayer(t, uid)) touched = true;
      if (touched) { pickHost(t); changed(t); }
    }
  }

  function clearChannel(channelId) {
    for (const [k, t] of tables) {
      if (t.channelId === channelId) { clearTimeout(t.timer); tables.delete(k); }
    }
  }

  // ---------- o que cada um vê ----------
  function viewFor(channelId, def, viewerId) {
    const t = getTable(channelId, def, false);
    if (!t) return { table: def.id, host: null, occupants: [], game: null };
    const g = t.game;
    const isPlayer = !!(g && g.players.includes(viewerId));
    const out = {
      table: def.id,
      host: t.host,
      occupants: [...t.occupants.entries()].map(([userId, o]) => ({ userId, role: o.role, seat: o.seat })),
      log: t.log,
      game: null,
    };
    if (g) {
      out.game = {
        phase: g.phase,
        players: g.players.map((uid) => ({
          userId: uid,
          count: g.hands.get(uid).length,
          // quem joga NÃO vê a mão dos outros; quem não joga vê tudo
          cards: (!isPlayer || uid === viewerId) ? g.hands.get(uid) : null,
        })),
        top: topCard(g),
        color: g.color,
        dir: g.dir,
        turn: g.players[g.turn] ?? null,
        turnEndsAt: g.turnEndsAt,
        drewCard: g.players[g.turn] === viewerId ? g.drewCard : null,
        drawCount: g.drawPile.length,
        unoPending: g.unoPending ? g.unoPending.userId : null,
        winner: g.winner,
        you: isPlayer ? 'player' : 'spectator',
      };
    }
    return out;
  }

  function tablesOf(channelId) {
    return [...tables.values()].filter((t) => t.channelId === channelId).map((t) => t.def);
  }

  return { handle, onSeat, onLeaveCall, clearChannel, viewFor, tablesOf, _tables: tables };
}

module.exports = { createTables, makeDeck, COLORS, TURN_MS, HAND_SIZE };
