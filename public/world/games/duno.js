// Duno no site (docs/MUNDINHO.md): o painel do jogo e as cartas na mesa 3D. Carregado sob demanda
// (só quando alguém mexe na mesa de jogos). Quem decide tudo é o servidor (server/games/duno.js);
// aqui só se mostra o estado que chegou e se mandam os pedidos (api.sendGame).
import * as THREE from '/vendor/three/0.170.0/three.module.min.js';

const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_NAMES = { red: 'vermelho', yellow: 'amarelo', green: 'verde', blue: 'azul' };
const CARD_HEX = { red: '#ef5b5b', yellow: '#f5c84c', green: '#4fbf7a', blue: '#4f8ff0', null: '#2a2730' };
const TURN_MS = 30000;
const AFTER_DRAW_MS = 12000;

function symbolOf(card) {
  switch (card.value) {
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    case 'draw2': return '+2';
    case 'wild': return '✦';
    case 'wild4': return '+4';
    default: return card.value;
  }
}
const isWild = (c) => c.value === 'wild' || c.value === 'wild4';

function cardName(card) {
  const v = { skip: 'pula', reverse: 'inverte', draw2: '+2', wild: 'coringa', wild4: 'coringa +4' }[card.value] || card.value;
  return isWild(card) ? `${v}${card.color ? ` (${COLOR_NAMES[card.color]})` : ''}` : `${v} ${COLOR_NAMES[card.color]}`;
}

// carta em HTML (a mesma cara da carta desenhada na mesa 3D)
function cardEl(card, opts = {}) {
  const el = document.createElement(opts.button ? 'button' : 'div');
  if (opts.button) el.type = 'button';
  el.className = 'duno-card' + (opts.small ? ' is-small' : '') + (opts.back ? ' is-back' : '') + (isWild(card || {}) ? ' is-wild' : '');
  if (opts.back) { el.innerHTML = '<span class="duno-card-oval"><span class="duno-logo">duno</span></span>'; return el; }
  el.style.setProperty('--card', CARD_HEX[card.color] || CARD_HEX.null);
  const sym = symbolOf(card);
  el.innerHTML = `<span class="duno-corner is-tl"></span><span class="duno-card-oval"><span class="duno-sym"></span></span><span class="duno-corner is-br"></span>`;
  el.querySelectorAll('.duno-corner').forEach((c) => { c.textContent = sym; });
  el.querySelector('.duno-sym').textContent = sym;
  if (isWild(card) && !card.color) el.querySelector('.duno-card-oval').classList.add('is-rainbow');
  el.title = cardName(card);
  return el;
}

// mesma carta desenhada num canvas (textura da mesa 3D)
function cardCanvas(card) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 184;
  const g = c.getContext('2d');
  const round = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  g.fillStyle = '#fff';
  round(0, 0, 128, 184, 16);
  g.fill();
  g.fillStyle = card ? (CARD_HEX[card.color] || CARD_HEX.null) : '#2a2730';
  round(7, 7, 114, 170, 12);
  g.fill();
  g.save();
  g.translate(64, 92);
  g.rotate(-0.5);
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(0, 0, 44, 70, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = card ? (CARD_HEX[card.color] || '#2a2730') : '#e85c9d';
  g.font = `900 ${card ? 54 : 30}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(card ? symbolOf(card) : 'duno', 64, 94);
  return c;
}

export function createDuno({ scene, container, api, def, world }) {
  let state = null;
  let open = false;
  let pendingWild = null; // carta coringa esperando a escolha da cor
  let timerRaf = 0;

  // ---------- 3D: monte, descarte e as pilhas de cada jogador na mesa ----------
  const tableGroup = new THREE.Group();
  tableGroup.position.set(def.x, def.y + 0.79, def.z);
  scene.add(tableGroup);
  const backTex = new THREE.CanvasTexture(cardCanvas(null));
  backTex.colorSpace = THREE.SRGBColorSpace;
  const cardGeo = new THREE.PlaneGeometry(0.16, 0.23);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.23), [
    new THREE.MeshStandardMaterial({ color: 0xffffff }), new THREE.MeshStandardMaterial({ color: 0xffffff }),
    new THREE.MeshStandardMaterial({ map: backTex }), new THREE.MeshStandardMaterial({ color: 0xffffff }),
    new THREE.MeshStandardMaterial({ color: 0xffffff }), new THREE.MeshStandardMaterial({ color: 0xffffff }),
  ]);
  deck.position.set(-0.16, 0.03, 0);
  tableGroup.add(deck);
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, side: THREE.DoubleSide, roughness: 0.6 });
  const discardMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const discard = new THREE.Mesh(cardGeo, discardMat);
  discard.rotation.x = -Math.PI / 2;
  discard.position.set(0.14, 0.005, 0);
  tableGroup.add(discard);
  const stacks = new Map(); // userId -> mesh
  let lastTopId = null;

  function update3d() {
    const g = state && state.game;
    deck.visible = !!g;
    discard.visible = !!g;
    if (g && g.top && g.top.id + g.top.color !== lastTopId) {
      lastTopId = g.top.id + g.top.color;
      if (discardMat.map) discardMat.map.dispose();
      discardMat.map = new THREE.CanvasTexture(cardCanvas(g.top));
      discardMat.map.colorSpace = THREE.SRGBColorSpace;
      discardMat.needsUpdate = true;
      discard.rotation.z = (Math.random() - 0.5) * 0.6;
    }
    // uma pilhinha de cartas viradas na frente de cada cadeira de quem joga
    const seen = new Set();
    if (g && g.phase === 'playing') {
      for (const p of g.players) {
        const occ = state.occupants.find((o) => o.userId === p.userId);
        const seatId = occ ? occ.seat : null;
        const seat = seatId && api.scene.seats.find((s) => s.id === seatId);
        if (!seat) continue;
        seen.add(p.userId);
        // um leque de cartas viradas "na mão" de cada jogador, na frente da cadeira dele
        if (p.userId === me()) continue;
        let m = stacks.get(p.userId);
        if (!m) {
          m = new THREE.Group();
          tableGroup.add(m);
          stacks.set(p.userId, m);
        }
        const shown = Math.min(p.count, 12);
        if (m.userData.count !== shown) {
          m.userData.count = shown;
          while (m.children.length) m.remove(m.children[0]);
          for (let i = 0; i < shown; i++) {
            const c = new THREE.Mesh(cardGeo, backMat);
            const x = (i - (shown - 1) / 2) * 0.035;
            c.position.set(x, 0.12 - Math.abs(x) * 0.25, i * 0.002);
            c.rotation.set(0, Math.PI, -x * 1.2);
            m.add(c);
          }
        }
        const dx = seat.x - def.x;
        const dz = seat.z - def.z;
        const len = Math.hypot(dx, dz) || 1;
        m.position.set((dx / len) * 0.82, 0.05, (dz / len) * 0.82);
        m.rotation.set(-0.35, Math.atan2(dx, dz) + Math.PI, 0, 'YXZ');
      }
    }
    for (const [uid, m] of stacks) if (!seen.has(uid) || uid === me()) { tableGroup.remove(m); stacks.delete(uid); }
  }

  // ---------- painel ----------
  const panel = document.createElement('div');
  panel.className = 'duno-panel';
  panel.hidden = true;
  container.appendChild(panel);

  const me = () => api.myId();
  const name = (id) => world.userName(id);
  const myOcc = () => state && state.occupants.find((o) => o.userId === me());

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

  function send(op, extra) { api.sendGame({ table: def.id, op, ...(extra || {}) }); }

  function logText(log) {
    if (!log) return '';
    switch (log.type) {
      case 'start': return 'a partida começou!';
      case 'play': return `${name(log.userId)} jogou ${cardName(log.card)}`;
      case 'draw': return `${name(log.userId)} comprou uma carta`;
      case 'pass': return `${name(log.userId)} passou`;
      case 'timeout': return `acabou o tempo de ${name(log.userId)} — comprou e passou`;
      case 'duno': return `${name(log.userId)} gritou DUNO!`;
      case 'caught': return `${name(log.by)} pegou ${name(log.userId)} sem gritar DUNO! (+2)`;
      case 'left': return `${name(log.userId)} saiu da partida`;
      default: return '';
    }
  }

  function canPlay(card) {
    const g = state.game;
    if (g.drewCard && g.drewCard !== card.id) return false;
    if (isWild(card)) return true;
    return card.color === g.color || card.value === g.top.value;
  }

  function render() {
    cancelAnimationFrame(timerRaf);
    panel.innerHTML = '';
    if (!state) return;
    const g = state.game;
    const occ = myOcc();
    const head = document.createElement('div');
    head.className = 'duno-head';
    head.innerHTML = '<span class="duno-head-icon">🃏</span><div class="duno-head-title"><strong>Duno</strong><small></small></div>';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'world-round-btn is-small';
    close.title = 'fechar (o jogo continua)';
    close.textContent = '✕';
    close.addEventListener('click', () => setOpen(false));
    head.appendChild(close);
    panel.appendChild(head);
    const sub = head.querySelector('small');

    if (!g) { sub.textContent = state.host ? `host: ${name(state.host)}` : 'sente na mesa de jogos pra começar'; renderLobby(occ); return; }
    if (g.phase === 'ended') { sub.textContent = 'fim de jogo'; renderEnded(g); return; }
    sub.textContent = g.you === 'player' ? 'você está jogando' : 'você está assistindo (vê as cartas de todo mundo)';
    renderGame(g);
  }

  function renderLobby(occ) {
    const list = document.createElement('div');
    list.className = 'duno-lobby';
    if (!state.occupants.length) list.innerHTML = '<p class="duno-empty">ninguém na mesa ainda</p>';
    for (const o of state.occupants) {
      const row = document.createElement('div');
      row.className = 'duno-lobby-row';
      row.appendChild(avatarEl(o.userId));
      const n = document.createElement('span');
      n.className = 'duno-lobby-name';
      n.textContent = name(o.userId) + (o.userId === me() ? ' (você)' : '');
      row.appendChild(n);
      if (o.userId === state.host) row.insertAdjacentHTML('beforeend', '<span class="duno-badge is-host">👑 host</span>');
      const role = document.createElement('span');
      role.className = 'duno-badge' + (o.role === 'play' ? ' is-play' : '');
      role.textContent = o.role === 'play' ? '🎮 joga' : o.role === 'watch' ? '👀 assiste' : '🤔 escolhendo';
      row.appendChild(role);
      list.appendChild(row);
    }
    panel.appendChild(list);
    const actions = document.createElement('div');
    actions.className = 'duno-actions';
    if (occ) {
      for (const [role, label] of [['play', '🎮 jogar'], ['watch', '👀 só assistir']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'world-pill-btn' + (occ.role === role ? '' : ' is-soft');
        b.textContent = label;
        b.addEventListener('click', () => send('role', { role }));
        actions.appendChild(b);
      }
      if (state.host === me()) {
        const players = state.occupants.filter((o) => o.role === 'play').length;
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'world-pill-btn duno-start';
        start.textContent = players >= 2 ? `▶ começar (${players} jogando)` : 'precisa de 2 jogando';
        start.disabled = players < 2;
        start.addEventListener('click', () => send('start'));
        actions.appendChild(start);
      }
    } else {
      actions.innerHTML = '<p class="duno-empty">sente numa cadeira da mesa de jogos (no mezanino) pra entrar</p>';
    }
    panel.appendChild(actions);
  }

  function renderEnded(g) {
    const box = document.createElement('div');
    box.className = 'duno-end';
    box.innerHTML = `<span class="duno-trophy">🏆</span><strong></strong>`;
    box.querySelector('strong').textContent = g.winner != null ? `${name(g.winner)} ganhou!` : 'partida encerrada';
    if (state.host === me()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'world-pill-btn';
      b.textContent = '🔁 jogar de novo';
      b.addEventListener('click', () => send('reset'));
      box.appendChild(b);
    } else {
      box.insertAdjacentHTML('beforeend', `<small>esperando ${name(state.host)} recomeçar</small>`);
    }
    panel.appendChild(box);
  }

  function renderGame(g) {
    const myTurn = g.turn === me() && g.you === 'player';
    // cronômetro da jogada
    const turnBar = document.createElement('div');
    turnBar.className = 'duno-turn' + (myTurn ? ' is-me' : '');
    turnBar.innerHTML = '<span class="duno-turn-text"></span><span class="duno-turn-track"><span class="duno-turn-fill"></span></span><span class="duno-turn-secs"></span>';
    turnBar.querySelector('.duno-turn-text').textContent = myTurn ? 'sua vez!' : `vez de ${name(g.turn)}`;
    panel.appendChild(turnBar);
    const total = g.drewCard ? AFTER_DRAW_MS : TURN_MS;
    const tick = () => {
      const left = Math.max(0, (g.turnEndsAt || 0) - api.serverNow());
      turnBar.querySelector('.duno-turn-fill').style.transform = `scaleX(${Math.min(1, left / total)})`;
      turnBar.querySelector('.duno-turn-secs').textContent = `${Math.ceil(left / 1000)}s`;
      turnBar.classList.toggle('is-hurry', left < 6000);
      timerRaf = requestAnimationFrame(tick);
    };
    tick();

    // os outros jogadores
    const others = document.createElement('div');
    others.className = 'duno-players';
    for (const p of g.players) {
      if (p.userId === me()) continue;
      const chip = document.createElement('div');
      chip.className = 'duno-player' + (p.userId === g.turn ? ' is-turn' : '');
      chip.appendChild(avatarEl(p.userId));
      const info = document.createElement('div');
      info.className = 'duno-player-info';
      info.innerHTML = '<strong></strong><small></small>';
      info.querySelector('strong').textContent = name(p.userId);
      info.querySelector('small').textContent = `${p.count} ${p.count === 1 ? 'carta' : 'cartas'}${p.count === 1 ? ' · DUNO!' : ''}`;
      chip.appendChild(info);
      if (p.cards) {
        // quem não joga vê a mão de todo mundo
        const mini = document.createElement('div');
        mini.className = 'duno-mini-hand';
        for (const c of p.cards) mini.appendChild(cardEl(c, { small: true }));
        chip.appendChild(mini);
      }
      others.appendChild(chip);
    }
    panel.appendChild(others);

    // mesa: monte + descarte + cor atual
    const table = document.createElement('div');
    table.className = 'duno-table';
    const deckBtn = cardEl(null, { back: true, button: true });
    deckBtn.classList.add('duno-deck');
    deckBtn.title = 'comprar uma carta';
    deckBtn.disabled = !myTurn || !!g.drewCard;
    deckBtn.addEventListener('click', () => send('draw'));
    const deckWrap = document.createElement('div');
    deckWrap.className = 'duno-pile';
    deckWrap.appendChild(deckBtn);
    deckWrap.insertAdjacentHTML('beforeend', `<small>${g.drawCount} no monte</small>`);
    const topWrap = document.createElement('div');
    topWrap.className = 'duno-pile';
    topWrap.appendChild(cardEl(g.top));
    topWrap.insertAdjacentHTML('beforeend', `<small><i class="duno-dot" style="background:${CARD_HEX[g.color]}"></i>${COLOR_NAMES[g.color]} · ${g.dir === 1 ? '↻' : '↺'}</small>`);
    table.append(deckWrap, topWrap);
    panel.appendChild(table);

    const log = document.createElement('div');
    log.className = 'duno-log';
    log.textContent = logText(state.log);
    panel.appendChild(log);

    // minha mão
    const mine = g.players.find((p) => p.userId === me());
    if (mine && mine.cards) {
      const hand = document.createElement('div');
      hand.className = 'duno-hand';
      mine.cards.forEach((c, i) => {
        const ok = myTurn && canPlay(c);
        const el = cardEl(c, { button: true });
        el.classList.toggle('is-playable', ok);
        el.disabled = !ok;
        el.style.setProperty('--i', String(i));
        el.addEventListener('click', () => {
          if (isWild(c)) { pendingWild = c; renderColorPicker(); return; }
          send('play', { cardId: c.id, duno: mine.cards.length === 2 && dunoArmed });
          dunoArmed = false;
        });
        hand.appendChild(el);
      });
      panel.appendChild(hand);
    }

    // botões
    const actions = document.createElement('div');
    actions.className = 'duno-actions';
    if (g.you === 'player') {
      if (myTurn && g.drewCard && g.drewCard !== 'none') {
        const pass = document.createElement('button');
        pass.type = 'button';
        pass.className = 'world-pill-btn is-soft';
        pass.textContent = '⏭ passar';
        pass.addEventListener('click', () => send('pass'));
        actions.appendChild(pass);
      }
      const canDuno = (myTurn && mine && mine.cards.length === 2) || g.unoPending === me();
      if (canDuno) {
        const d = document.createElement('button');
        d.type = 'button';
        d.className = 'duno-shout' + (dunoArmed ? ' is-armed' : '');
        d.textContent = 'DUNO!';
        d.addEventListener('click', () => { dunoArmed = true; send('duno'); d.classList.add('is-armed'); });
        actions.appendChild(d);
      }
      if (g.unoPending != null && g.unoPending !== me()) {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'duno-shout is-catch';
        c.textContent = `pegar ${name(g.unoPending)}!`;
        c.addEventListener('click', () => send('catch'));
        actions.appendChild(c);
      }
      const leave = document.createElement('button');
      leave.type = 'button';
      leave.className = 'world-pill-btn is-ghost';
      leave.textContent = 'sair da partida';
      leave.addEventListener('click', () => { if (window.confirm('sair da partida? suas cartas voltam pro monte.')) send('leave'); });
      actions.appendChild(leave);
    }
    panel.appendChild(actions);
  }

  let dunoArmed = false;

  function renderColorPicker() {
    container.querySelector('.duno-colors')?.remove();
    const box = document.createElement('div');
    box.className = 'duno-colors is-pop';
    box.innerHTML = '<strong>escolha a cor</strong>';
    const row = document.createElement('div');
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = CARD_HEX[c];
      b.title = COLOR_NAMES[c];
      b.setAttribute('aria-label', COLOR_NAMES[c]);
      b.addEventListener('click', () => {
        const card = pendingWild;
        pendingWild = null;
        const mine = state.game.players.find((p) => p.userId === me());
        send('play', { cardId: card.id, color: c, duno: !!(mine && mine.cards.length === 2 && dunoArmed) });
        dunoArmed = false;
        box.remove();
      });
      row.appendChild(b);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'duno-colors-cancel';
    cancel.textContent = '✕';
    cancel.addEventListener('click', () => { pendingWild = null; box.remove(); });
    row.appendChild(cancel);
    box.appendChild(row);
    container.appendChild(box);
  }

  function setOpen(v) {
    open = !!v;
    panel.hidden = !open;
    if (open) render(); else cancelAnimationFrame(timerRaf);
    world.onPanelChange();
  }

  // ==================================================================
  // modo cartas na mão: jogando e sentado na mesa, o mundo fica em 1ª pessoa e a minha mão aparece
  // em 3D na frente da câmera. Passar o mouse levanta a carta; clicar joga. Clicar no monte compra.
  // A interface vira só uma barrinha (de quem é a vez + tempo + DUNO!/pegar/passar/sair).
  // ==================================================================
  let cardMode = false;
  let camera = null;
  const hand = new THREE.Group();          // filho da câmera
  hand.position.set(0, -0.1, -0.5); // logo acima dos botões da call
  const texCache = new Map();               // id+cor -> textura
  const handMeshes = new Map();             // id da carta -> mesh
  const raycaster = new THREE.Raycaster();
  let hoverId = null;
  const CARD_W = 0.06;
  const CARD_H = 0.087;
  const handGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);

  function texFor(card) {
    const k = `${card.id}:${card.color}`;
    if (!texCache.has(k)) {
      const t = new THREE.CanvasTexture(cardCanvas(card));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texCache.set(k, t);
    }
    return texCache.get(k);
  }

  const bar = document.createElement('div');
  bar.className = 'duno-bar';
  bar.hidden = true;
  container.appendChild(bar);

  function wantsCardMode(seatId) {
    const g = state && state.game;
    return !!(g && g.phase === 'playing' && g.you === 'player' && seatId && def.seats.includes(seatId));
  }

  function setCardMode(on, cam) {
    if (on === cardMode) return;
    cardMode = on;
    camera = cam;
    if (on) {
      camera.add(hand);
      if (open) { panel.hidden = true; open = false; }
      renderBar();
      layoutHand();
    } else {
      if (hand.parent) hand.parent.remove(hand);
      bar.hidden = true;
      hoverId = null;
    }
    world.onPanelChange();
  }

  function myCards() {
    const g = state && state.game;
    const mine = g && g.players.find((p) => p.userId === me());
    return (mine && mine.cards) || [];
  }

  // monta/atualiza o leque de cartas
  function layoutHand() {
    if (!cardMode) return;
    const cards = myCards();
    const ids = new Set(cards.map((c) => c.id));
    for (const [id, m] of handMeshes) if (!ids.has(id)) { hand.remove(m); m.material.dispose(); handMeshes.delete(id); }
    const n = cards.length;
    const spread = Math.min(0.046, 0.5 / Math.max(1, n));
    const g = state.game;
    const myTurn = g.turn === me();
    cards.forEach((c, i) => {
      let m = handMeshes.get(c.id);
      if (!m) {
        m = new THREE.Mesh(handGeo, new THREE.MeshBasicMaterial({ map: texFor(c), transparent: true, depthTest: false, depthWrite: false }));
        m.userData.card = c;
        hand.add(m);
        handMeshes.set(c.id, m);
      }
      const x = (i - (n - 1) / 2) * spread;
      m.userData.base = { x, y: -Math.abs(x) * 0.22, z: i * 0.0008, rz: -x * 0.9 };
      m.userData.playable = myTurn && canPlay(c);
      m.renderOrder = 1000 + i;
      m.material.color.setScalar(m.userData.playable || !myTurn ? 1 : 0.55);
    });
  }

  function updateCards(dt) {
    if (!cardMode) return;
    for (const [id, m] of handMeshes) {
      const b = m.userData.base;
      if (!b) continue;
      const lift = id === hoverId ? 1 : 0;
      m.userData.lift = (m.userData.lift || 0) + (lift - (m.userData.lift || 0)) * Math.min(1, dt * 14);
      const l = m.userData.lift;
      m.position.set(b.x, b.y + l * 0.035, b.z + l * 0.03);
      m.rotation.set(0, 0, b.rz * (1 - l));
      m.scale.setScalar(1 + l * 0.25);
      m.renderOrder = id === hoverId ? 2000 : 1000 + Math.round(b.z / 0.0008);
    }
  }

  function pickCard(ndc) {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([...handMeshes.values()], false)[0];
    return hit ? hit.object : null;
  }

  // mouse por cima: levanta a carta (mesmo as que não dá pra jogar — pra ver o que tem)
  function pointerMove(ndc) {
    if (!cardMode) return false;
    const m = pickCard(ndc);
    hoverId = m ? m.userData.card.id : null;
    raycaster.setFromCamera(ndc, camera);
    const overDeck = !!raycaster.intersectObject(deck, false)[0];
    return { cursor: (m && m.userData.playable) || (overDeck && canDraw()) ? 'pointer' : '' };
  }

  function canDraw() {
    const g = state && state.game;
    return !!(g && g.turn === me() && !g.drewCard);
  }

  function click(ndc) {
    if (!cardMode) return false;
    const m = pickCard(ndc);
    if (m) {
      const c = m.userData.card;
      if (!m.userData.playable) { api.toast(state.game.turn === me() ? 'essa não combina com a da mesa' : 'espere a sua vez'); return true; }
      if (isWild(c)) { pendingWild = c; renderColorPicker(); return true; }
      send('play', { cardId: c.id, duno: myCards().length === 2 && dunoArmed });
      dunoArmed = false;
      return true;
    }
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(deck, false)[0]) {
      if (canDraw()) send('draw'); else api.toast(state.game.turn === me() ? 'você já comprou' : 'espere a sua vez');
      return true;
    }
    return false;
  }

  // barrinha de cima: de quem é a vez + tempo (+ os botões que precisam existir)
  let barRaf = 0;
  function renderBar() {
    cancelAnimationFrame(barRaf);
    const g = state && state.game;
    if (!cardMode || !g) { bar.hidden = true; return; }
    bar.hidden = false;
    const myTurn = g.turn === me();
    bar.className = 'duno-bar' + (myTurn ? ' is-me' : '');
    bar.innerHTML = '';
    bar.appendChild(avatarEl(g.turn));
    const txt = document.createElement('span');
    txt.className = 'duno-bar-text';
    txt.textContent = myTurn ? 'sua vez!' : `vez de ${name(g.turn)}`;
    bar.appendChild(txt);
    const color = document.createElement('i');
    color.className = 'duno-dot';
    color.style.background = CARD_HEX[g.color];
    color.title = `cor: ${COLOR_NAMES[g.color]}`;
    bar.appendChild(color);
    const ring = document.createElement('span');
    ring.className = 'duno-bar-time';
    bar.appendChild(ring);
    const total = g.drewCard ? AFTER_DRAW_MS : TURN_MS;
    const tick = () => {
      const left = Math.max(0, (g.turnEndsAt || 0) - api.serverNow());
      ring.textContent = `${Math.ceil(left / 1000)}s`;
      ring.style.setProperty('--p', String(Math.min(1, left / total)));
      ring.classList.toggle('is-hurry', left < 6000);
      barRaf = requestAnimationFrame(tick);
    };
    tick();
    const mine = myCards();
    const btn = (label, cls, fn, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      if (title) b.title = title;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    if (myTurn && g.drewCard && g.drewCard !== 'none') btn('⏭ passar', 'duno-bar-btn', () => send('pass'));
    if ((myTurn && mine.length === 2) || g.unoPending === me()) {
      btn('DUNO!', 'duno-bar-btn is-shout' + (dunoArmed ? ' is-armed' : ''), () => { dunoArmed = true; send('duno'); renderBar(); });
    }
    if (g.unoPending != null && g.unoPending !== me()) btn(`pegar ${name(g.unoPending)}!`, 'duno-bar-btn is-catch', () => send('catch'));
    btn('☰', 'duno-bar-btn is-icon', () => { setCardModeHidden(); }, 'ver a mesa toda (cartas de cada um, log)');
    btn('sair', 'duno-bar-btn is-ghost', () => { if (window.confirm('sair da partida? suas cartas voltam pro monte.')) send('leave'); }, 'sair da partida');
    const log = logText(state.log);
    if (log) { const l = document.createElement('span'); l.className = 'duno-bar-log'; l.textContent = log; bar.appendChild(l); }
  }
  // ☰: abre o painel completo por cima (sem sair do modo cartas)
  function setCardModeHidden() {
    open = true;
    panel.hidden = false;
    render();
    world.onPanelChange();
  }

  // ---------- interface pro mundo ----------
  function setState(next) {
    const prev = state;
    state = next;
    if (!state.game || state.game.phase !== 'playing') { pendingWild = null; dunoArmed = false; }
    const iAmIn = !!myOcc() || !!(state.game && state.game.you === 'player' && state.game.phase === 'playing');
    // abre sozinho quando eu sento na mesa, quando a partida começa (se eu jogo) e na minha vez
    const startedNow = state.game && state.game.phase === 'playing' && !(prev && prev.game && prev.game.phase === 'playing');
    const myTurnNow = state.game && state.game.turn === me() && state.game.you === 'player' && !(prev && prev.game && prev.game.turn === me());
    const endedNow = state.game && state.game.phase === 'ended' && prev && prev.game && prev.game.phase === 'playing';
    if (cardMode) {
      // no modo cartas, a barrinha e o leque fazem o papel do painel
      layoutHand();
      renderBar();
      if (open) render();
    } else if (!open && (endedNow || (myOcc() && !(prev && prev.occupants.some((o) => o.userId === me()))) || (iAmIn && (startedNow || myTurnNow)))) setOpen(true);
    else if (open) render();
    if (endedNow && !open) setOpen(true);
    update3d();
  }

  function isActive() {
    return !!(state && (state.game || state.occupants.length));
  }

  function destroy() {
    cancelAnimationFrame(timerRaf);
    cancelAnimationFrame(barRaf);
    setCardMode(false, camera);
    for (const t of texCache.values()) t.dispose();
    bar.remove();
    container.querySelector('.duno-colors')?.remove();
    panel.remove();
    scene.remove(tableGroup);
    tableGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    backTex.dispose();
    if (discardMat.map) discardMat.map.dispose();
  }

  return {
    setState, setOpen, toggle: () => setOpen(!open), isOpen: () => open, isActive, destroy,
    wantsCardMode, setCardMode, isCardMode: () => cardMode, updateCards, pointerMove, click,
  };
}
