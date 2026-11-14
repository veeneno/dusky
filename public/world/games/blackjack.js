// 21 (blackjack) no site (docs/MUNDINHO.md): as cartas e fichas em cima das mesas de 21 em 3D e o
// painel do jogo. Carregado sob demanda (só quando alguém mexe numa mesa de 21). Quem decide tudo
// é o servidor (server/games/blackjack.js); aqui só se mostra o estado e se mandam os pedidos.
// Um módulo cuida de TODAS as mesas de 21 da cena; o painel mostra a mesa em que estou sentado
// (ou a última que abri).
import * as THREE from '/vendor/three/0.170.0/three.module.min.js';

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED = { h: true, d: true };
const CHIPS = [10, 25, 100, 500];
const CHIP_HEX = { 10: '#e8e2d6', 25: '#d94141', 100: '#2f7de1', 500: '#8d4fd6' };
const BET_MS = 12000;
const TURN_MS = 20000;
const SEAT_ANGLES = [64, 32, 0, -32, -64]; // a mesma ordem das cadeiras da cena (bj?-1..5)
const TOP_Y = 0.785;                      // altura do feltro

const cardLabel = (c) => (c ? `${c.r}${SUIT[c.s]}` : 'carta virada');
const valueOf = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(c.r) ? 10 : Number(c.r));

// carta em HTML (a mesma cara da carta desenhada na mesa 3D)
function cardEl(card) {
  const el = document.createElement('span');
  if (!card) {
    el.className = 'bj-card is-back';
    el.title = 'carta virada';
    return el;
  }
  el.className = 'bj-card' + (RED[card.s] ? ' is-red' : '');
  el.innerHTML = '<span class="bj-card-rank"></span><span class="bj-card-suit"></span>';
  el.querySelector('.bj-card-rank').textContent = card.r;
  el.querySelector('.bj-card-suit').textContent = SUIT[card.s];
  el.title = cardLabel(card);
  return el;
}

// mesma carta num canvas (textura da mesa 3D)
function cardCanvas(card) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 180;
  const g = c.getContext('2d');
  const round = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  g.fillStyle = '#fbfaf7';
  round(0, 0, 128, 180, 14);
  g.fill();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (!card) {
    g.fillStyle = '#8a1f2e';
    round(8, 8, 112, 164, 10);
    g.fill();
    g.save();
    round(8, 8, 112, 164, 10);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 2;
    for (let i = -180; i < 200; i += 14) { g.beginPath(); g.moveTo(0, i + 180); g.lineTo(128, i); g.stroke(); }
    g.restore();
    g.fillStyle = '#f4d58a';
    g.font = '900 40px Georgia, serif';
    g.fillText('21', 64, 92);
    return c;
  }
  g.fillStyle = RED[card.s] ? '#d23a3a' : '#1d1d24';
  g.font = '800 34px system-ui, sans-serif';
  g.fillText(card.r, 26, 28);
  g.font = '30px system-ui, sans-serif';
  g.fillText(SUIT[card.s], 26, 60);
  g.font = '72px system-ui, sans-serif';
  g.fillText(SUIT[card.s], 70, 112);
  return c;
}

export function createBlackjack({ scene, container, api, defs, world }) {
  const states = new Map(); // mesa -> estado (do servidor)
  let focusId = null;       // mesa mostrada no painel
  let open = false;
  let draftBet = 0;         // aposta sendo montada com as fichas (só vai pro servidor no "apostar")
  let timerRaf = 0;

  const me = () => api.myId();
  const name = (id) => world.userName(id);
  const defOf = (id) => defs.find((d) => d.id === id) || null;
  const mySeatTable = () => {
    for (const [id, st] of states) if (st.seated.some((s) => s.userId === me())) return id;
    return null;
  };

  // ==================================================================
  // 3D: cartas e fichas em cima de cada mesa
  // ==================================================================
  const texCache = new Map();
  const matCache = new Map();
  function matFor(card) {
    const k = card ? `${card.r}${card.s}` : 'back';
    if (!matCache.has(k)) {
      const t = new THREE.CanvasTexture(cardCanvas(card));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texCache.set(k, t);
      matCache.set(k, new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, side: THREE.DoubleSide }));
    }
    return matCache.get(k);
  }
  const cardGeo = new THREE.PlaneGeometry(0.1, 0.14);
  const chipGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.009, 18);
  const chipMats = Object.fromEntries(Object.entries(CHIP_HEX).map(([v, hex]) => [v, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45 })]));

  const tableGroups = new Map(); // mesa -> grupo com as coisas da rodada
  for (const def of defs) {
    const g = new THREE.Group();
    g.position.set(def.x, (def.y || 0) + TOP_Y, def.z);
    scene.add(g);
    tableGroups.set(def.id, g);
  }

  // cartas deitadas em leque, com o "pé" da carta virado pra quem está na cadeira
  function cardsRow(cards, spread = 0.055) {
    const row = new THREE.Group();
    cards.forEach((c, i) => {
      const m = new THREE.Mesh(cardGeo, matFor(c));
      m.rotation.x = -Math.PI / 2;
      m.position.set((i - (cards.length - 1) / 2) * spread, 0.001 + i * 0.0015, -i * 0.012);
      row.add(m);
    });
    return row;
  }

  // pilha de fichas: quebra o valor nas fichas maiores primeiro
  function chipStack(amount) {
    const g = new THREE.Group();
    let left = amount;
    let h = 0;
    for (const v of [...CHIPS].reverse()) {
      while (left >= v && h < 14) {
        const c = new THREE.Mesh(chipGeo, chipMats[v]);
        c.position.y = 0.005 + h * 0.0095;
        g.add(c);
        left -= v;
        h++;
      }
    }
    return g;
  }

  function seatAngle(def, seatId) {
    const i = def.seats.indexOf(seatId);
    return i >= 0 ? (SEAT_ANGLES[i] * Math.PI) / 180 : 0;
  }

  function update3d(tableId) {
    const def = defOf(tableId);
    const g = tableGroups.get(tableId);
    const st = states.get(tableId);
    if (!def || !g) return;
    while (g.children.length) g.remove(g.children[0]);
    if (!st) return;
    // banca: cartas na frente dela
    if (st.dealer) {
      const row = cardsRow(st.dealer.cards, 0.075);
      row.position.set(0, 0, 0.24);
      row.rotation.y = Math.PI; // de frente pros jogadores, como no cassino
      g.add(row);
    }
    const seatOf = (uid) => (st.seated.find((s) => s.userId === uid) || {}).seat;
    // mãos e apostas de cada um, na frente da cadeira (mão dividida fica lado a lado)
    const byUser = new Map();
    for (const h of st.hands) {
      if (!byUser.has(h.userId)) byUser.set(h.userId, []);
      byUser.get(h.userId).push(h);
    }
    for (const [uid, hands] of byUser) {
      const seat = seatOf(uid);
      if (!seat) continue;
      const a = seatAngle(def, seat);
      const spot = new THREE.Group();
      spot.position.set(Math.sin(a) * 0.72, 0, Math.cos(a) * 0.72);
      spot.rotation.y = a;
      hands.forEach((h, i) => {
        const x = (i - (hands.length - 1) / 2) * 0.17;
        const row = cardsRow(h.cards);
        row.position.set(x, 0, 0);
        spot.add(row);
        const chips = chipStack(h.bet);
        chips.position.set(x, 0, 0.18);
        spot.add(chips);
      });
      g.add(spot);
    }
    // apostas feitas pra próxima rodada (ainda sem cartas): no círculo da cadeira
    for (const b of st.bets) {
      const seat = seatOf(b.userId);
      if (!seat || byUser.has(b.userId)) continue;
      const a = seatAngle(def, seat);
      const chips = chipStack(b.amount);
      chips.position.set(Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9);
      g.add(chips);
    }
  }

  // ==================================================================
  // painel
  // ==================================================================
  const panel = document.createElement('div');
  panel.className = 'duno-panel bj-panel';
  panel.hidden = true;
  container.appendChild(panel);

  function avatarEl(id) {
    const u = world.user(id);
    const el = document.createElement('span');
    el.className = 'duno-avatar';
    if (u && u.avatar_url) {
      const img = document.createElement('img');
      img.src = u.avatar_url;
      img.alt = '';
      el.appendChild(img);
    } else {
      el.textContent = String((u && u.username) || '?').slice(0, 2).toUpperCase();
    }
    if (u && u.accent_color) el.style.background = u.accent_color;
    return el;
  }

  function send(op, extra) { api.sendGame({ table: focusId, op, ...(extra || {}) }); }

  function btn(label, onClick, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'world-pill-btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  const RESULT_TEXT = { win: 'ganhou', blackjack: 'blackjack!', push: 'empate', lose: 'perdeu', bust: 'estourou' };

  function logText(st) {
    const log = st.log;
    if (!log) return '';
    switch (log.type) {
      case 'deal': return 'cartas na mesa!';
      case 'hit': return `${name(log.userId)} pediu carta`;
      case 'bust': return `${name(log.userId)} estourou!`;
      case 'stand': return `${name(log.userId)} parou`;
      case 'double': return `${name(log.userId)} dobrou a aposta`;
      case 'split': return `${name(log.userId)} dividiu o par`;
      case 'timeout': return `acabou o tempo de ${name(log.userId)} — parou`;
      case 'dealer-reveal': return 'a banca vira a carta…';
      case 'dealer-hit': return 'a banca compra…';
      case 'dealer-blackjack': return 'a banca tem blackjack!';
      case 'results': return 'resultado da rodada';
      default: return '';
    }
  }

  function phaseText(st) {
    if (st.phase === 'betting') return st.bets.length ? 'apostas abertas' : 'esperando apostas';
    if (st.phase === 'playing') return st.turn === me() ? 'sua vez!' : `vez de ${name(st.turn)}`;
    if (st.phase === 'dealer') return 'vez da banca';
    return 'resultado';
  }

  function render() {
    cancelAnimationFrame(timerRaf);
    panel.innerHTML = '';
    const st = states.get(focusId);
    const def = defOf(focusId);
    if (!st || !def) return;
    const seated = st.seated.some((s) => s.userId === me());

    // cabeçalho (+ trocar de mesa pra quem só está olhando)
    const head = document.createElement('div');
    head.className = 'duno-head';
    head.innerHTML = '<span class="duno-head-icon">♠️</span><div class="duno-head-title"><strong></strong><small></small></div>';
    head.querySelector('strong').textContent = def.name || '21';
    head.querySelector('small').textContent = `${phaseText(st)} · 💰 ${st.you.balance} fichas`;
    if (!seated && defs.length > 1) {
      const other = defs[(defs.findIndex((d) => d.id === focusId) + 1) % defs.length];
      const sw = btn(`ver ${other.name || 'outra mesa'}`, () => { focusId = other.id; draftBet = 0; render(); }, 'is-soft bj-switch');
      head.appendChild(sw);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'world-round-btn is-small';
    close.title = 'fechar (o jogo continua)';
    close.textContent = '✕';
    close.addEventListener('click', () => setOpen(false));
    head.appendChild(close);
    panel.appendChild(head);

    // cronômetro (apostas ou vez)
    if (st.endsAt && (st.phase === 'betting' || st.phase === 'playing')) {
      const myTurn = st.phase === 'playing' && st.turn === me();
      const bar = document.createElement('div');
      bar.className = 'duno-turn' + (myTurn ? ' is-me' : '');
      bar.innerHTML = '<span class="duno-turn-text"></span><span class="duno-turn-track"><span class="duno-turn-fill"></span></span><span class="duno-turn-secs"></span>';
      bar.querySelector('.duno-turn-text').textContent = st.phase === 'betting' ? 'cartas em' : phaseText(st);
      panel.appendChild(bar);
      const total = st.phase === 'betting' ? BET_MS : TURN_MS;
      const fill = bar.querySelector('.duno-turn-fill');
      const secs = bar.querySelector('.duno-turn-secs');
      const tick = () => {
        const left = Math.max(0, st.endsAt - api.serverNow());
        fill.style.transform = `scaleX(${Math.min(1, left / total)})`;
        secs.textContent = `${Math.ceil(left / 1000)}s`;
        bar.classList.toggle('is-hurry', left < 5000);
        if (left > 0) timerRaf = requestAnimationFrame(tick);
      };
      tick();
    }

    // banca
    const dealer = document.createElement('div');
    dealer.className = 'bj-row is-dealer';
    dealer.innerHTML = '<span class="bj-who">banca</span><span class="bj-cards"></span><span class="bj-total"></span>';
    if (st.dealer) {
      for (const c of st.dealer.cards) dealer.querySelector('.bj-cards').appendChild(cardEl(c));
      dealer.querySelector('.bj-total').textContent = st.dealer.hidden ? `${st.dealer.total} + ?` : String(st.dealer.total);
    } else {
      dealer.querySelector('.bj-cards').innerHTML = '<span class="bj-muted">esperando a rodada</span>';
    }
    panel.appendChild(dealer);

    // mãos de cada um (ou quem está sentado e o que apostou)
    const list = document.createElement('div');
    list.className = 'bj-hands';
    const seatIndex = (uid) => def.seats.indexOf((st.seated.find((s) => s.userId === uid) || {}).seat);
    if (st.hands.length) {
      for (const h of st.hands) {
        const row = document.createElement('div');
        row.className = 'bj-row' + (h.active ? ' is-active' : '') + (h.userId === me() ? ' is-me' : '');
        row.appendChild(avatarEl(h.userId));
        const who = document.createElement('span');
        who.className = 'bj-who';
        who.textContent = name(h.userId) + (h.split ? ' (dividida)' : '');
        row.appendChild(who);
        const cards = document.createElement('span');
        cards.className = 'bj-cards';
        for (const c of h.cards) cards.appendChild(cardEl(c));
        row.appendChild(cards);
        const total = document.createElement('span');
        total.className = 'bj-total';
        total.textContent = h.blackjack ? 'BJ' : `${h.soft && h.total < 21 ? 'mole ' : ''}${h.total}`;
        row.appendChild(total);
        const badge = document.createElement('span');
        badge.className = 'bj-bet';
        badge.textContent = `🪙 ${h.bet}${h.doubled ? ' (dobrou)' : ''}`;
        row.appendChild(badge);
        if (h.result) {
          const r = document.createElement('span');
          r.className = `bj-result is-${h.result}`;
          const diff = h.payout - h.bet;
          r.textContent = `${RESULT_TEXT[h.result]}${diff > 0 ? ` +${diff}` : diff < 0 ? ` ${diff}` : ''}`;
          row.appendChild(r);
        }
        list.appendChild(row);
      }
    } else if (st.seated.length) {
      for (const s of [...st.seated].sort((a, b) => seatIndex(a.userId) - seatIndex(b.userId))) {
        const row = document.createElement('div');
        row.className = 'bj-row' + (s.userId === me() ? ' is-me' : '');
        row.appendChild(avatarEl(s.userId));
        const who = document.createElement('span');
        who.className = 'bj-who';
        who.textContent = name(s.userId) + (s.userId === me() ? ' (você)' : '');
        row.appendChild(who);
        const bet = st.bets.find((b) => b.userId === s.userId);
        const badge = document.createElement('span');
        badge.className = 'bj-bet' + (bet ? ' is-ready' : '');
        badge.textContent = bet ? `🪙 ${bet.amount} ✓` : 'apostando…';
        row.appendChild(badge);
        list.appendChild(row);
      }
    } else {
      list.innerHTML = '<p class="duno-empty">ninguém na mesa ainda</p>';
    }
    panel.appendChild(list);

    const log = logText(st);
    if (log) {
      const l = document.createElement('p');
      l.className = 'bj-log';
      l.textContent = log;
      panel.appendChild(l);
    }

    panel.appendChild(renderControls(st, seated));
  }

  function renderControls(st, seated) {
    const box = document.createElement('div');
    box.className = 'duno-actions bj-actions';
    if (!seated) {
      box.innerHTML = '<p class="duno-empty">sente numa cadeira da mesa pra jogar</p>';
      return box;
    }
    const myHand = st.phase === 'playing' ? st.hands.find((h) => h.active && h.userId === me()) : null;
    if (myHand) {
      box.appendChild(btn('👆 pedir carta', () => send('hit')));
      box.appendChild(btn('✋ parar', () => send('stand')));
      const canDouble = myHand.cards.length === 2 && st.you.balance >= myHand.bet;
      const d = btn('✖2 dobrar', () => send('double'), 'is-soft');
      d.disabled = !canDouble;
      d.title = canDouble ? 'dobra a aposta, recebe 1 carta e para' : 'só com as 2 primeiras cartas e fichas pra cobrir';
      box.appendChild(d);
      const pair = myHand.cards.length === 2 && valueOf(myHand.cards[0]) === valueOf(myHand.cards[1]);
      if (pair) {
        const mine = st.hands.filter((h) => h.userId === me()).length;
        const sp = btn('✂️ dividir', () => send('split'), 'is-soft');
        sp.disabled = st.you.balance < myHand.bet || mine >= 4;
        box.appendChild(sp);
      }
      return box;
    }
    if (st.phase === 'playing' || st.phase === 'dealer') {
      const inRound = st.hands.some((h) => h.userId === me());
      box.innerHTML = `<p class="duno-empty">${inRound ? 'esperando os outros e a banca…' : 'rodada em andamento — aposte na próxima'}</p>`;
      return box;
    }
    // apostas (também dá pra apostar enquanto o resultado está na mesa)
    if (st.you.bet) {
      const p = document.createElement('p');
      p.className = 'bj-mybet';
      p.textContent = `sua aposta: ${st.you.bet} fichas ✓`;
      box.appendChild(p);
      box.appendChild(btn('tirar aposta', () => send('bet', { amount: 0 }), 'is-soft'));
      if (st.phase === 'betting') box.appendChild(btn('▶ dar as cartas agora', () => send('deal')));
      return box;
    }
    if (st.you.balance < st.you.minBet) {
      box.appendChild(btn('💰 pegar mais 1000 fichas', () => send('refill')));
      return box;
    }
    const chips = document.createElement('div');
    chips.className = 'bj-chips';
    for (const v of CHIPS) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'bj-chip';
      c.style.setProperty('--chip', CHIP_HEX[v]);
      c.textContent = v;
      c.title = `+${v}`;
      c.disabled = draftBet + v > Math.min(st.you.maxBet, st.you.balance);
      c.addEventListener('click', () => { draftBet += v; render(); });
      chips.appendChild(c);
    }
    box.appendChild(chips);
    const amount = document.createElement('span');
    amount.className = 'bj-draft';
    amount.textContent = draftBet ? `${draftBet} fichas` : `aposta de ${st.you.minBet} a ${st.you.maxBet}`;
    box.appendChild(amount);
    if (draftBet) box.appendChild(btn('limpar', () => { draftBet = 0; render(); }, 'is-soft'));
    const go = btn(`🪙 apostar${draftBet ? ` ${draftBet}` : ''}`, () => { send('bet', { amount: draftBet }); draftBet = 0; });
    go.disabled = draftBet < st.you.minBet;
    box.appendChild(go);
    return box;
  }

  function setOpen(v) {
    open = !!v;
    if (open && !focusId) focusId = mySeatTable() || defs[0].id;
    panel.hidden = !open;
    if (open) render(); else cancelAnimationFrame(timerRaf);
    world.onPanelChange();
  }

  // ---------- interface pro mundo ----------
  function setState(next) {
    const prev = states.get(next.table);
    states.set(next.table, next);
    update3d(next.table);
    const iSitHere = next.seated.some((s) => s.userId === me());
    const satNow = iSitHere && !(prev && prev.seated.some((s) => s.userId === me()));
    const myTurnNow = next.turn === me() && !(prev && prev.turn === me() && prev.round === next.round);
    if (iSitHere) focusId = next.table;
    if (satNow) draftBet = 0;
    // abre sozinho quando eu sento e na minha vez
    if (!open && (satNow || (iSitHere && myTurnNow))) setOpen(true);
    else if (open && next.table === focusId) render();
  }

  // sentei numa cadeira de 21 (antes do servidor responder): já abre o painel dessa mesa
  function onMySeat(seatId) {
    const def = defs.find((d) => d.seats.includes(seatId));
    if (!def) return;
    focusId = def.id;
    if (!open && states.has(def.id)) setOpen(true);
  }

  function isActive() {
    return open || [...states.values()].some((st) => st.seated.length || st.hands.length);
  }

  function destroy() {
    cancelAnimationFrame(timerRaf);
    panel.remove();
    for (const g of tableGroups.values()) scene.remove(g);
    for (const t of texCache.values()) t.dispose();
    for (const m of matCache.values()) m.dispose();
    for (const m of Object.values(chipMats)) m.dispose();
    cardGeo.dispose();
    chipGeo.dispose();
  }

  return { setState, setOpen, toggle: () => setOpen(!open), isOpen: () => open, isActive, onMySeat, destroy };
}
