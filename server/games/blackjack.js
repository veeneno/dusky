// 21 (blackjack) nas mesas de 21 do mundinho. Ver docs/MUNDINHO.md. Tudo é decidido AQUI no
// servidor: o site só pede "aposto 50", "pede carta", "para"... Este arquivo não sabe de
// WebSocket: quem entrega é server/realtime.js (mesmo formato do server/games/duno.js).
//
// Regras (as de cassino mais comuns):
//   - sapato com 6 baralhos, embaralhado de novo quando sobra menos de 1/4
//   - aposta de 10 a 500 fichas; cada pessoa começa com 1000 (acabou: pega mais 1000)
//   - blackjack (Ás + carta de 10 nas 2 primeiras) paga 3 pra 2; vitória paga 1 pra 1; empate devolve
//   - a banca (dealer) olha a carta escondida quando mostra Ás ou 10: se tiver blackjack, a rodada
//     acaba na hora (quem também tem blackjack empata)
//   - a banca compra até 17 e PARA em 17 mole (Ás valendo 11)
//   - dobrar: só com as 2 primeiras cartas (recebe 1 carta e para); dividir: par de mesmo valor,
//     até 4 mãos; Ás dividido recebe 1 carta só; 21 depois de dividir não é blackjack
//   - sem seguro e sem desistência
//
// Mesa (uma por call-mundo e por mesa de 21 da cena):
//   seated   quem está sentado nas cadeiras: userId -> { seat, at }
//   bets     apostas da próxima rodada: userId -> fichas (já saíram da carteira)
//   phase    'betting' (apostas) -> 'playing' (vez de cada um) -> 'dealer' -> 'results' -> 'betting'
//   hands    mãos da rodada, na ordem das cadeiras: { userId, cards, bet, doubled, split, done, result, payout }
const crypto = require('crypto');

const DECKS = 6;
const START_CHIPS = 1000;
const MIN_BET = 10;
const MAX_BET = 500;
const MAX_HANDS = 4;          // por pessoa, contando as divididas
const BET_MS = 12000;         // depois da 1ª aposta, tempo pros outros apostarem
const TURN_MS = 20000;        // tempo de cada decisão (estourou = para)
const DEALER_STEP_MS = 800;   // a banca vira/compra uma carta por vez (dá tempo de ver)
const RESULT_MS = 6000;       // resultado na mesa antes da próxima rodada

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['s', 'h', 'd', 'c'];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeShoe() {
  const shoe = [];
  let n = 0;
  for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ id: `c${++n}`, r, s });
  return shuffle(shoe);
}

const cardValue = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(c.r) ? 10 : Number(c.r));

// total da mão: Ás vale 11 enquanto não estourar; `soft` = ainda tem um Ás valendo 11
function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.r === 'A') aces++;
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

const isBlackjack = (cards) => cards.length === 2 && handTotal(cards).total === 21;

function createBlackjack({
  onChange,
  now = () => Date.now(),
  newShoe = makeShoe,
  setTimer = (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
  clearTimer = (t) => clearTimeout(t),
  betMs = BET_MS,
  turnMs = TURN_MS,
  dealerStepMs = DEALER_STEP_MS,
  resultMs = RESULT_MS,
} = {}) {
  const tables = new Map();  // `${channelId}:${tableId}` -> mesa
  const wallets = new Map(); // userId -> fichas (vale pra qualquer mesa; some quando o servidor reinicia)

  const key = (channelId, tableId) => `${channelId}:${tableId}`;
  function getTable(channelId, def, create) {
    const k = key(channelId, def.id);
    if (!tables.has(k) && create) {
      tables.set(k, {
        channelId, def, seated: new Map(), bets: new Map(), phase: 'betting', hands: [], dealer: [],
        holeHidden: true, turn: -1, endsAt: null, timer: null, shoe: newShoe(), log: null, round: 0,
      });
    }
    return tables.get(k) || null;
  }
  function changed(t) { if (onChange) onChange(t.channelId, t.def.id); }
  const balanceOf = (uid) => (wallets.has(uid) ? wallets.get(uid) : START_CHIPS);
  const setBalance = (uid, v) => wallets.set(uid, v);

  function arm(t, ms, fn) {
    if (t.timer) clearTimer(t.timer);
    t.timer = setTimer(() => { t.timer = null; fn(); }, ms);
  }
  function disarm(t) {
    if (t.timer) clearTimer(t.timer);
    t.timer = null;
  }

  function draw(t) {
    if (!t.shoe.length) t.shoe = newShoe();
    return t.shoe.pop();
  }

  // ---------- rodada ----------
  function deal(t) {
    disarm(t);
    const order = (uid) => t.def.seats.indexOf(t.seated.get(uid)?.seat);
    const players = [...t.bets.keys()].filter((uid) => t.seated.has(uid)).sort((a, b) => order(a) - order(b));
    // apostou e levantou antes de dar as cartas: devolve
    for (const [uid, bet] of t.bets) if (!players.includes(uid)) setBalance(uid, balanceOf(uid) + bet);
    if (!players.length) { t.bets.clear(); t.endsAt = null; t.phase = 'betting'; return; }
    // sapato acabando: embaralha um novo antes da rodada
    if (t.shoe.length < (DECKS * 52) / 4) t.shoe = newShoe();
    t.round++;
    t.hands = players.map((uid) => ({ userId: uid, cards: [], bet: t.bets.get(uid), doubled: false, split: false, done: false, result: null, payout: 0 }));
    t.bets.clear();
    t.dealer = [];
    t.holeHidden = true;
    for (let i = 0; i < 2; i++) {
      for (const h of t.hands) h.cards.push(draw(t));
      t.dealer.push(draw(t));
    }
    t.log = { type: 'deal' };
    // a banca mostra Ás ou 10: confere se tem blackjack (aí acaba na hora)
    if (cardValue(t.dealer[0]) >= 10 && isBlackjack(t.dealer)) {
      t.log = { type: 'dealer-blackjack' };
      for (const h of t.hands) h.done = true;
      finishRound(t);
      return;
    }
    for (const h of t.hands) if (isBlackjack(h.cards)) h.done = true;
    t.phase = 'playing';
    nextTurn(t, -1);
  }

  // passa pra próxima mão que ainda decide; acabou todo mundo = vez da banca
  function nextTurn(t, from) {
    let i = from + 1;
    while (i < t.hands.length && t.hands[i].done) i++;
    if (i >= t.hands.length) { dealerPlays(t); return; }
    t.turn = i;
    t.endsAt = now() + turnMs;
    arm(t, turnMs, () => {
      // estourou o tempo: para
      const h = t.hands[t.turn];
      if (t.phase !== 'playing' || !h) return;
      h.done = true;
      t.log = { type: 'timeout', userId: h.userId };
      nextTurn(t, t.turn);
      changed(t);
    });
  }

  // a banca vira a carta escondida e compra até 17, uma carta por vez
  function dealerPlays(t) {
    t.phase = 'dealer';
    t.turn = -1;
    t.endsAt = null;
    t.holeHidden = false;
    t.log = { type: 'dealer-reveal' };
    // todo mundo estourou: a banca nem compra
    const anyAlive = t.hands.some((h) => handTotal(h.cards).total <= 21);
    const step = () => {
      const { total } = handTotal(t.dealer);
      if (anyAlive && total < 17) {
        t.dealer.push(draw(t));
        t.log = { type: 'dealer-hit' };
        changed(t);
        arm(t, dealerStepMs, step);
        return;
      }
      finishRound(t);
      changed(t);
    };
    arm(t, dealerStepMs, step);
  }

  function finishRound(t) {
    t.holeHidden = false;
    const dealer = handTotal(t.dealer).total;
    const dealerBj = isBlackjack(t.dealer);
    for (const h of t.hands) {
      const mine = handTotal(h.cards).total;
      const bj = !h.split && isBlackjack(h.cards);
      if (mine > 21) h.result = 'bust';
      else if (bj && !dealerBj) h.result = 'blackjack';
      else if (dealerBj && !bj) h.result = 'lose';
      else if (bj && dealerBj) h.result = 'push';
      else if (dealer > 21 || mine > dealer) h.result = 'win';
      else if (mine === dealer) h.result = 'push';
      else h.result = 'lose';
      // a aposta já saiu da carteira: volta o que ganhou + a própria aposta
      h.payout = h.result === 'blackjack' ? Math.floor(h.bet * 2.5) : h.result === 'win' ? h.bet * 2 : h.result === 'push' ? h.bet : 0;
      if (h.payout) setBalance(h.userId, balanceOf(h.userId) + h.payout);
    }
    t.phase = 'results';
    t.turn = -1;
    t.endsAt = now() + resultMs;
    // "a banca tem blackjack!" continua visível no resultado
    if (!t.log || t.log.type !== 'dealer-blackjack') t.log = { type: 'results' };
    arm(t, resultMs, () => {
      t.phase = 'betting';
      t.hands = [];
      t.dealer = [];
      t.holeHidden = true;
      t.endsAt = null;
      t.log = null;
      // quem já apostou enquanto mostrava o resultado: conta o tempo da próxima
      if (t.bets.size) startBetClock(t);
      changed(t);
    });
  }

  function startBetClock(t) {
    t.endsAt = now() + betMs;
    arm(t, betMs, () => { deal(t); changed(t); });
  }

  // todo mundo sentado já apostou: não precisa esperar o tempo
  function maybeDealNow(t) {
    if (t.phase !== 'betting' || !t.bets.size) return;
    for (const uid of t.seated.keys()) if (!t.bets.has(uid)) return;
    deal(t);
  }

  // ---------- pedidos de quem está na call ----------
  // msg.op: bet (amount: total apostado, 0 = tira) | deal | hit | stand | double | split | refill
  function handle(channelId, def, uid, msg) {
    const t = getTable(channelId, def, true);
    const op = msg && msg.op;

    if (op === 'refill') {
      if (balanceOf(uid) >= MIN_BET) return { error: 'você ainda tem fichas' };
      if (t.bets.has(uid) || t.hands.some((h) => h.userId === uid && !h.result)) return { error: 'espere a rodada acabar' };
      setBalance(uid, START_CHIPS);
      changed(t);
      return {};
    }

    if (op === 'bet') {
      if (!t.seated.has(uid)) return { error: 'sente numa cadeira da mesa de 21 pra apostar' };
      if (t.phase === 'playing' || t.phase === 'dealer') return { error: 'espere a rodada acabar pra apostar' };
      const amount = Math.floor(Number(msg.amount) || 0);
      const prev = t.bets.get(uid) || 0;
      if (amount === 0) {
        if (!prev) return {};
        setBalance(uid, balanceOf(uid) + prev);
        t.bets.delete(uid);
        if (!t.bets.size && t.phase === 'betting') { disarm(t); t.endsAt = null; }
        changed(t);
        return {};
      }
      if (amount < MIN_BET || amount > MAX_BET) return { error: `a aposta vai de ${MIN_BET} a ${MAX_BET} fichas` };
      if (amount - prev > balanceOf(uid)) return { error: 'fichas insuficientes' };
      setBalance(uid, balanceOf(uid) - (amount - prev));
      t.bets.set(uid, amount);
      // 1ª aposta da rodada: começa a contar o tempo pros outros
      if (t.phase === 'betting' && !t.timer) startBetClock(t);
      if (t.phase === 'betting') maybeDealNow(t);
      changed(t);
      return {};
    }

    if (op === 'deal') {
      // "dar as cartas" sem esperar o tempo (qualquer um que apostou)
      if (t.phase !== 'betting') return { error: 'a rodada já está rolando' };
      if (!t.bets.has(uid)) return { error: 'aposte primeiro' };
      deal(t);
      changed(t);
      return {};
    }

    if (t.phase !== 'playing') return { error: 'não é hora de jogar' };
    const h = t.hands[t.turn];
    if (!h || h.userId !== uid) return { error: 'não é a sua vez' };

    if (op === 'hit') {
      h.cards.push(draw(t));
      const { total } = handTotal(h.cards);
      t.log = { type: total > 21 ? 'bust' : 'hit', userId: uid };
      if (total >= 21) { h.done = true; nextTurn(t, t.turn); } else { t.endsAt = now() + turnMs; nextTurnTimer(t); }
      changed(t);
      return {};
    }
    if (op === 'stand') {
      h.done = true;
      t.log = { type: 'stand', userId: uid };
      nextTurn(t, t.turn);
      changed(t);
      return {};
    }
    if (op === 'double') {
      if (h.cards.length !== 2) return { error: 'só dá pra dobrar com as 2 primeiras cartas' };
      if (balanceOf(uid) < h.bet) return { error: 'fichas insuficientes pra dobrar' };
      setBalance(uid, balanceOf(uid) - h.bet);
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(t));
      h.done = true;
      t.log = { type: 'double', userId: uid };
      nextTurn(t, t.turn);
      changed(t);
      return {};
    }
    if (op === 'split') {
      if (h.cards.length !== 2 || cardValue(h.cards[0]) !== cardValue(h.cards[1])) return { error: 'só dá pra dividir um par' };
      if (t.hands.filter((x) => x.userId === uid).length >= MAX_HANDS) return { error: `no máximo ${MAX_HANDS} mãos` };
      if (balanceOf(uid) < h.bet) return { error: 'fichas insuficientes pra dividir' };
      setBalance(uid, balanceOf(uid) - h.bet);
      const aces = h.cards[0].r === 'A';
      const second = { userId: uid, cards: [h.cards.pop()], bet: h.bet, doubled: false, split: true, done: false, result: null, payout: 0 };
      h.split = true;
      h.cards.push(draw(t));
      second.cards.push(draw(t));
      // Ás dividido: uma carta em cada e pronto
      if (aces) { h.done = true; second.done = true; }
      if (handTotal(h.cards).total === 21) h.done = true;
      if (handTotal(second.cards).total === 21) second.done = true;
      t.hands.splice(t.turn + 1, 0, second);
      t.log = { type: 'split', userId: uid };
      if (h.done) nextTurn(t, t.turn); else { t.endsAt = now() + turnMs; nextTurnTimer(t); }
      changed(t);
      return {};
    }
    return { error: 'jogada inválida' };
  }

  // a mesma mão continua decidindo: o relógio recomeça
  function nextTurnTimer(t) {
    const idx = t.turn;
    arm(t, turnMs, () => {
      const h = t.hands[idx];
      if (t.phase !== 'playing' || t.turn !== idx || !h) return;
      h.done = true;
      t.log = { type: 'timeout', userId: h.userId };
      nextTurn(t, idx);
      changed(t);
    });
  }

  // saiu da mesa (levantou ou saiu da call): aposta ainda não jogada volta; mão em jogo para
  function leaveTable(t, uid) {
    let touched = t.seated.delete(uid);
    if (t.bets.has(uid)) {
      setBalance(uid, balanceOf(uid) + t.bets.get(uid));
      t.bets.delete(uid);
      if (!t.bets.size && t.phase === 'betting') { disarm(t); t.endsAt = null; }
      touched = true;
    }
    if (t.phase === 'playing') {
      for (const h of t.hands) if (h.userId === uid && !h.done) { h.done = true; touched = true; }
      const cur = t.hands[t.turn];
      if (cur && cur.userId === uid) nextTurn(t, t.turn);
    }
    if (t.phase === 'betting') maybeDealNow(t);
    return touched;
  }

  // ---------- cadeiras ----------
  function onSeat(channelId, uid, def, seatId, prevDef) {
    if (prevDef && (!def || prevDef.id !== def.id)) {
      const t = getTable(channelId, prevDef, false);
      if (t && leaveTable(t, uid)) changed(t);
    }
    if (def) {
      const t = getTable(channelId, def, true);
      const prev = t.seated.get(uid);
      t.seated.set(uid, { seat: seatId, at: prev ? prev.at : now() });
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
      disarm(t);
      // apostas que não chegaram a ser jogadas voltam pra carteira
      for (const [uid, bet] of t.bets) setBalance(uid, balanceOf(uid) + bet);
      for (const h of t.hands) if (!h.result) setBalance(h.userId, balanceOf(h.userId) + h.bet);
      tables.delete(k);
    }
  }

  // ---------- o que cada um vê ----------
  // tudo é aberto, menos a carta escondida da banca (até ela virar) e o sapato
  function viewFor(channelId, def, viewerId) {
    const t = getTable(channelId, def, false);
    const you = { balance: balanceOf(viewerId), bet: t ? t.bets.get(viewerId) || 0 : 0, minBet: MIN_BET, maxBet: MAX_BET };
    if (!t) return { game: 'blackjack', table: def.id, phase: 'betting', seated: [], bets: [], hands: [], dealer: null, turn: null, endsAt: null, log: null, you };
    const dealerCards = t.dealer.map((c, i) => (i === 1 && t.holeHidden ? null : c));
    const shown = dealerCards.filter(Boolean);
    return {
      game: 'blackjack',
      table: def.id,
      phase: t.phase,
      round: t.round,
      seated: [...t.seated.entries()].map(([userId, s]) => ({ userId, seat: s.seat })),
      bets: [...t.bets.entries()].map(([userId, amount]) => ({ userId, amount })),
      hands: t.hands.map((h, i) => ({
        userId: h.userId, cards: h.cards, total: handTotal(h.cards).total, soft: handTotal(h.cards).soft,
        bet: h.bet, doubled: h.doubled, split: h.split, done: h.done, result: h.result, payout: h.payout,
        blackjack: !h.split && isBlackjack(h.cards), active: t.phase === 'playing' && i === t.turn,
      })),
      dealer: t.dealer.length ? { cards: dealerCards, total: handTotal(shown).total, hidden: t.holeHidden } : null,
      turn: t.phase === 'playing' && t.hands[t.turn] ? t.hands[t.turn].userId : null,
      endsAt: t.endsAt,
      log: t.log,
      you,
    };
  }

  return { handle, onSeat, onLeaveCall, clearChannel, viewFor, _tables: tables, _wallets: wallets };
}

module.exports = { createBlackjack, handTotal, isBlackjack, makeShoe, START_CHIPS, MIN_BET, MAX_BET };
