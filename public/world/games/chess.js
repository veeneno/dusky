// Xadrez no site (docs/MUNDINHO.md): as peças em 3D em cima das mesas de xadrez, o relógio da mesa
// e o painel pra jogar. Quem decide tudo é o servidor (server/games/chess.js); aqui só se mostra o
// estado e se mandam os pedidos. Um módulo cuida de TODAS as mesas de xadrez da cena.
//
// As peças ficam sempre na mesa (posição inicial quando não tem partida) e deslizam de casa em casa
// a cada lance — quem está só olhando vê a partida acontecendo, sem abrir nada. O painel (dock ♟️ /
// tecla K) mostra o tabuleiro em 2D, os relógios e os lances; abre sozinho quando você senta.
import * as THREE from '/vendor/three/0.170.0/three.module.min.js';

const S = 0.065;          // lado de uma casa (m) — o tabuleiro desenhado em props.js (chessTable) é igual
const BOARD_Y = 0.747;    // altura do tabuleiro em cima da mesa
const MOVE_MS = 320;
const FILES = 'abcdefgh';
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PT = { K: 'R', Q: 'D', R: 'T', B: 'B', N: 'C' }; // notação em português
const ptSan = (san) => san.replace(/[KQRBN]/g, (c) => PT[c]);
const sqIndex = (s) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
const colorOf = (p) => (p && p !== '.' ? (p === p.toUpperCase() ? 'w' : 'b') : null);
const COLOR_NAME = { w: 'brancas', b: 'pretas' };

function fmtClock(ms) {
  const v = Math.max(0, ms);
  if (v < 10000) return `0:0${(v / 1000).toFixed(1)}`.replace(/^0:0(\d\d)/, '0:$1');
  const s = Math.ceil(v / 1000);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
const modeTag = (m) => `${m.base / 60000}+${m.inc / 1000}`;

// ==================================================================
// peças (torneadas em código, no estilo Staunton)
// ==================================================================
function lathe(pts, seg = 28) {
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}
function buildGeometries() {
  const base = (r) => [[0, 0], [r, 0], [r, 0.006], [r * 0.8, 0.009], [r * 0.62, 0.014]];
  const g = {};
  g.p = [
    lathe([...base(0.02), [0.008, 0.03], [0.012, 0.032], [0.007, 0.036], [0, 0.036]]),
    new THREE.SphereGeometry(0.0105, 20, 14).translate(0, 0.045, 0),
  ];
  g.r = [lathe([...base(0.022), [0.013, 0.042], [0.016, 0.046], [0.016, 0.06], [0.0115, 0.06], [0.0115, 0.055], [0, 0.055]])];
  // ameias da torre
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    g.r.push(new THREE.BoxGeometry(0.008, 0.007, 0.006).rotateY(a).translate(Math.sin(a) * 0.0135, 0.0635, Math.cos(a) * 0.0135));
  }
  g.b = [
    lathe([...base(0.021), [0.008, 0.05], [0.013, 0.053], [0.008, 0.056], [0.012, 0.064], [0.011, 0.072], [0.0055, 0.079], [0, 0.081]]),
    new THREE.SphereGeometry(0.0042, 12, 10).translate(0, 0.084, 0),
  ];
  g.q = [
    lathe([...base(0.023), [0.009, 0.058], [0.015, 0.062], [0.01, 0.066], [0.0165, 0.079], [0.0125, 0.083], [0, 0.083]]),
    new THREE.SphereGeometry(0.0062, 14, 10).translate(0, 0.089, 0),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.q.push(new THREE.SphereGeometry(0.0028, 8, 6).translate(Math.sin(a) * 0.0145, 0.081, Math.cos(a) * 0.0145));
  }
  g.k = [
    lathe([...base(0.024), [0.0105, 0.064], [0.0165, 0.068], [0.011, 0.071], [0.0155, 0.083], [0.012, 0.087], [0, 0.087]]),
    new THREE.BoxGeometry(0.0045, 0.022, 0.0045).translate(0, 0.098, 0),
    new THREE.BoxGeometry(0.014, 0.0045, 0.0045).translate(0, 0.1, 0),
  ];
  // cavalo: base torneada + cabeça (perfil extrudado, focinho pro +x local)
  const head = new THREE.Shape();
  const pts = [[-0.012, 0.012], [0.011, 0.012], [0.012, 0.028], [0.02, 0.039], [0.0225, 0.048], [0.017, 0.054],
    [0.007, 0.056], [0.002, 0.066], [-0.004, 0.068], [-0.009, 0.06], [-0.0135, 0.047], [-0.0145, 0.03]];
  head.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) head.lineTo(x, y);
  head.closePath();
  const headGeo = new THREE.ExtrudeGeometry(head, { depth: 0.011, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.002, bevelSegments: 2, curveSegments: 6 });
  headGeo.translate(0, 0, -0.0055);
  g.n = [lathe([...base(0.021), [0.011, 0.016], [0, 0.016]]), headGeo];
  return g;
}

export function createChess({ scene, container, api, defs, world }) {
  const states = new Map(); // mesa -> último estado (do servidor)
  const seats = api.scene.seats || [];
  let focusId = null;
  let open = false;
  let selected = null;      // casa escolhida no tabuleiro do painel
  let promoAsk = null;      // { from, to } esperando escolher a peça
  let resignArmed = 0;
  let timerRaf = 0;

  const me = () => api.myId();
  const name = (id) => world.userName(id);
  const defOf = (id) => defs.find((d) => d.id === id) || null;
  const seatPos = (id) => seats.find((s) => s.id === id) || null;

  // ==================================================================
  // 3D
  // ==================================================================
  const geos = buildGeometries();
  const MATS = {
    w: new THREE.MeshStandardMaterial({ color: 0xf2e7cf, roughness: 0.32 }),
    b: new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.28, metalness: 0.08 }),
  };
  const hlMats = {
    last: new THREE.MeshBasicMaterial({ color: 0xf5d64a, transparent: true, opacity: 0.42, depthWrite: false }),
    check: new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.55, depthWrite: false }),
  };
  const hlGeo = new THREE.PlaneGeometry(S * 0.96, S * 0.96).rotateX(-Math.PI / 2);

  function makePiece(ch) {
    const color = colorOf(ch);
    const type = ch.toLowerCase();
    const g = new THREE.Group();
    for (const geo of geos[type]) g.add(new THREE.Mesh(geo, MATS[color]));
    g.userData.piece = ch;
    return g;
  }

  // cada mesa: grupo no centro do tabuleiro; as brancas ficam do lado da cadeira de quem joga de brancas
  const boards = new Map();
  for (const def of defs) {
    const group = new THREE.Group();
    group.position.set(def.x, (def.y || 0) + BOARD_Y, def.z);
    scene.add(group);
    const hl = { from: new THREE.Mesh(hlGeo, hlMats.last), to: new THREE.Mesh(hlGeo, hlMats.last), check: new THREE.Mesh(hlGeo, hlMats.check) };
    for (const m of Object.values(hl)) { m.visible = false; m.renderOrder = 1; group.add(m); }
    const b = { def, group, meshes: new Array(64).fill(null), shown: null, whiteIdx: 0, tweens: [], hl, clock: null };
    boards.set(def.id, b);
    buildClock(b);
  }

  // direção "das brancas" e a direita de quem joga de brancas, no plano da mesa
  function axes(b) {
    const seat = seatPos(b.def.seats[b.whiteIdx]) || seatPos(b.def.seats[0]);
    let dx = seat ? seat.x - b.def.x : -1;
    let dz = seat ? seat.z - b.def.z : 0;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // quem joga de brancas olha pra -dir; a direita dele = frente × cima
    return { dx, dz, rx: dz, rz: -dx };
  }
  function squareLocal(b, i, out = new THREE.Vector3()) {
    const { dx, dz, rx, rz } = axes(b);
    const f = (i & 7) - 3.5;
    const r = 3.5 - (i >> 3);
    return out.set(dx * r * S + rx * f * S, 0, dz * r * S + rz * f * S);
  }
  // cavalos olham pro adversário
  function facePiece(b, mesh) {
    const ch = mesh.userData.piece;
    if (ch.toLowerCase() !== 'n') { mesh.rotation.y = 0; return; }
    const { dx, dz } = axes(b);
    const sx = colorOf(ch) === 'w' ? -dx : dx;
    const sz = colorOf(ch) === 'w' ? -dz : dz;
    mesh.rotation.y = Math.atan2(-sz, sx);
  }

  function snap(b, board) {
    finishTweens(b);
    for (let i = 0; i < 64; i++) {
      const want = board[i] === '.' ? null : board[i];
      const cur = b.meshes[i];
      if (cur && cur.userData.piece !== want) { b.group.remove(cur); b.meshes[i] = null; }
      if (want && !b.meshes[i]) { b.meshes[i] = makePiece(want); b.group.add(b.meshes[i]); }
      if (b.meshes[i]) {
        squareLocal(b, i, b.meshes[i].position);
        b.meshes[i].scale.setScalar(1);
        facePiece(b, b.meshes[i]);
      }
    }
    b.shown = board;
  }

  // ---------- animação dos lances ----------
  let animRaf = 0;
  function tween(b, obj, from, to, hop, onDone, shrink) {
    b.tweens.push({ obj, from: from.clone(), to: to.clone(), hop, onDone, shrink, t0: performance.now() });
    if (!animRaf) animRaf = requestAnimationFrame(stepTweens);
  }
  function stepTweens(now) {
    animRaf = 0;
    let any = false;
    for (const b of boards.values()) {
      for (const tw of [...b.tweens]) {
        if (!b.tweens.includes(tw)) continue; // terminado no meio (snap de um lance novo)
        const k = Math.min(1, (now - tw.t0) / MOVE_MS);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        tw.obj.position.lerpVectors(tw.from, tw.to, e);
        tw.obj.position.y += Math.sin(Math.PI * e) * tw.hop;
        if (tw.shrink) tw.obj.scale.setScalar(Math.max(0.001, 1 - e));
        if (k >= 1) {
          b.tweens.splice(b.tweens.indexOf(tw), 1);
          if (tw.onDone) tw.onDone();
        }
      }
      if (b.tweens.length) any = true;
    }
    if (any) animRaf = requestAnimationFrame(stepTweens);
  }
  function finishTweens(b) {
    for (const tw of b.tweens.splice(0)) {
      tw.obj.position.copy(tw.to);
      if (tw.onDone) tw.onDone();
    }
  }

  // o lance que levou de `prevBoard` pra `next.board`: anda a peça (e a torre no roque), tira a capturada
  function animateMove(b, prevBoard, next) {
    const from = sqIndex(next.lastMove.from);
    const to = sqIndex(next.lastMove.to);
    const p = prevBoard[from];
    const mover = b.meshes[from];
    if (!mover || p === '.') return false;
    let capSq = prevBoard[to] !== '.' ? to : -1;
    if (p.toLowerCase() === 'p' && (from & 7) !== (to & 7) && prevBoard[to] === '.') capSq = to + (colorOf(p) === 'w' ? -8 : 8);
    const captured = capSq >= 0 ? b.meshes[capSq] : null;
    b.meshes[from] = null;
    if (captured) b.meshes[capSq] = null;
    b.meshes[to] = mover;
    const done = () => { snap(b, next.board); };
    const hop = p.toLowerCase() === 'n' ? 0.05 : 0.012;
    if (captured) {
      const lift = captured.position.clone();
      lift.y += 0.02;
      tween(b, captured, captured.position, lift, 0, () => { b.group.remove(captured); }, true);
    }
    // roque: a torre vem junto
    if (p.toLowerCase() === 'k' && Math.abs((to & 7) - (from & 7)) === 2) {
      const rf = to > from ? from + 3 : from - 4;
      const rt = to > from ? from + 1 : from - 1;
      const rook = b.meshes[rf];
      if (rook) {
        b.meshes[rf] = null;
        b.meshes[rt] = rook;
        tween(b, rook, rook.position, squareLocal(b, rt), 0.03, null);
      }
    }
    tween(b, mover, mover.position, squareLocal(b, to), hop, done);
    b.shown = next.board;
    return true;
  }

  function updateHighlights(b, st) {
    const show = (mesh, sq) => {
      if (!sq) { mesh.visible = false; return; }
      squareLocal(b, sqIndex(sq), mesh.position);
      mesh.position.y = 0.0012;
      mesh.visible = true;
    };
    show(b.hl.from, st.lastMove && st.lastMove.from);
    show(b.hl.to, st.lastMove && st.lastMove.to);
    show(b.hl.check, st.phase !== 'waiting' ? st.check : null);
  }

  // quem joga de brancas está em qual cadeira? (revanche troca)
  function whiteIdxOf(b, st) {
    const seatOf = (uid) => (st.seated.find((s) => s.userId === uid) || {}).seat;
    if (st.white != null && seatOf(st.white)) return Math.max(0, b.def.seats.indexOf(seatOf(st.white)));
    if (st.black != null && seatOf(st.black)) return b.def.seats.indexOf(seatOf(st.black)) === 0 ? 1 : 0;
    return st.white != null ? b.whiteIdx : 0;
  }

  function update3d(tableId, prev) {
    const b = boards.get(tableId);
    const st = states.get(tableId);
    if (!b || !st) return;
    const idx = whiteIdxOf(b, st);
    const turned = idx !== b.whiteIdx;
    b.whiteIdx = idx;
    const oneMove = prev && b.shown && !turned && prev.round === st.round && st.lastMove
      && st.moves.length === prev.moves.length + 1 && b.shown === prev.board;
    if (oneMove) {
      finishTweens(b);
      if (!animateMove(b, prev.board, st)) snap(b, st.board);
    } else if (turned || b.shown !== st.board) snap(b, st.board);
    updateHighlights(b, st);
    paintClock(b);
  }

  // ---------- relógio de xadrez em cima da mesa (do lado direito de quem joga de brancas) ----------
  function buildClock(b) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.5 }));
    body.position.y = 0.025;
    g.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), new THREE.MeshBasicMaterial({ map: tex }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.0505;
    g.add(face);
    for (const sx of [-1, 1]) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0xc9a46a, metalness: 0.8, roughness: 0.3 }));
      btn.position.set(sx * 0.05, 0.055, -0.02);
      g.add(btn);
    }
    b.group.add(g);
    b.clock = { g, canvas, tex, last: '' };
    placeClock(b);
  }
  function placeClock(b) {
    const { rx, rz, dx, dz } = axes(b);
    b.clock.g.position.set(rx * 0.36, -0.001, rz * 0.36);
    // o comprido do relógio fica no eixo entre os jogadores; o mostrador se lê de quem está do lado
    // do relógio (fora da mesa), com as brancas à esquerda de quem lê
    b.clock.g.rotation.y = Math.atan2(-dz, dx) + Math.PI;
  }
  function clockTimes(st) {
    if (!st || !st.clock) return null;
    const c = st.clock;
    const spent = c.running ? api.serverNow() - c.since : 0;
    return { w: st.turn === 'w' ? c.w - spent : c.w, b: st.turn === 'b' ? c.b - spent : c.b };
  }
  function paintClock(b) {
    if (!b.clock) return;
    placeClock(b);
    const st = states.get(b.def.id);
    const t = clockTimes(st);
    const mode = st && (st.modes || []).find((m) => m.id === (st.gameMode || st.mode));
    const wTxt = t ? fmtClock(t.w) : mode ? fmtClock(mode.base) : '--:--';
    const bTxt = t ? fmtClock(t.b) : mode ? fmtClock(mode.base) : '--:--';
    const running = st && st.clock && st.clock.running ? st.turn : '';
    const sig = `${wTxt}|${bTxt}|${running}`;
    if (sig === b.clock.last) return;
    b.clock.last = sig;
    const g = b.clock.canvas.getContext('2d');
    g.fillStyle = '#14100d';
    g.fillRect(0, 0, 256, 64);
    g.font = '700 30px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // metade da esquerda = brancas (o -x local do relógio aponta pras brancas)
    const half = (txt, x, on, white) => {
      g.fillStyle = on ? (white ? '#fff6dc' : '#ffd36b') : '#6f6458';
      g.fillText(txt, x, 33);
    };
    half(wTxt, 64, running === 'w', true);
    half(bTxt, 192, running === 'b', false);
    g.fillStyle = '#3a2f26';
    g.fillRect(126, 8, 4, 48);
    b.clock.tex.needsUpdate = true;
  }
  const clockTick = setInterval(() => {
    for (const b of boards.values()) {
      const st = states.get(b.def.id);
      if (st && st.clock && st.clock.running) paintClock(b);
    }
  }, 200);

  for (const b of boards.values()) snap(b, 'RNBQKBNRPPPPPPPP' + '.'.repeat(32) + 'pppppppprnbqkbnr');

  // ==================================================================
  // painel
  // ==================================================================
  const panel = document.createElement('div');
  panel.className = 'duno-panel chess-panel';
  panel.hidden = true;
  container.appendChild(panel);

  function send(op, extra) { api.sendGame({ table: focusId, op, ...(extra || {}) }); }
  function btn(label, onClick, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'world-pill-btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
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

  const mySeatTable = () => {
    for (const [id, st] of states) if (st.seated.some((s) => s.userId === me())) return id;
    return null;
  };
  function nearestTable() {
    const p = world.myPos && world.myPos();
    if (!p) return defs[0].id;
    let best = defs[0];
    let bd = Infinity;
    for (const d of defs) {
      const dist = Math.hypot(d.x - p.x, d.z - p.z) + Math.abs((d.y || 0) - p.y) * 3;
      if (dist < bd) { bd = dist; best = d; }
    }
    return best.id;
  }

  function resultText(st) {
    const r = st.result;
    if (!r) return '';
    const who = (c) => `${name(c === 'w' ? st.white : st.black)} (${COLOR_NAME[c]})`;
    switch (r.reason) {
      case 'checkmate': return `xeque-mate! ${who(r.winner)} venceu`;
      case 'resign': return `${who(r.winner === 'w' ? 'b' : 'w')} desistiu — ${who(r.winner)} venceu`;
      case 'timeout': return `acabou o tempo — ${who(r.winner)} venceu`;
      case 'timeout-draw': return 'acabou o tempo, mas não tinha como dar mate: empate';
      case 'abandon': return `${who(r.winner === 'w' ? 'b' : 'w')} abandonou — ${who(r.winner)} venceu`;
      case 'stalemate': return 'afogamento: empate';
      case 'material': return 'empate por material insuficiente';
      case 'repetition': return 'empate por repetição (3 vezes a mesma posição)';
      case 'fifty': return 'empate pela regra dos 50 lances';
      case 'agreement': return 'empate combinado';
      case 'aborted': return 'partida cancelada';
      default: return 'fim de partida';
    }
  }
  function statusText(st) {
    if (st.phase === 'playing') {
      const mine = st.you.color === st.turn;
      return `${mine ? 'sua vez' : `vez das ${COLOR_NAME[st.turn]}`}${st.check ? ' · xeque!' : ''}`;
    }
    if (st.phase === 'over') return resultText(st);
    if (st.seated.length < 2) return st.seated.length ? 'esperando o adversário sentar' : 'mesa livre — sente pra jogar';
    return 'esperando os dois ficarem prontos';
  }

  function bottomColor(st) {
    if (st.you.color) return st.you.color;
    const mine = st.seated.find((s) => s.userId === me());
    const b = boards.get(st.table);
    if (mine && b) return defOf(st.table).seats.indexOf(mine.seat) === b.whiteIdx ? 'w' : 'b';
    return 'w';
  }

  function playerRow(st, color, times) {
    const row = document.createElement('div');
    const uid = st.phase === 'waiting' ? null : color === 'w' ? st.white : st.black;
    const b = boards.get(st.table);
    // antes da partida: quem está sentado na cadeira dessa cor
    const seatUser = (() => {
      if (uid != null) return uid;
      const seatId = defOf(st.table).seats[color === 'w' ? b.whiteIdx : 1 - b.whiteIdx];
      const s = st.seated.find((x) => x.seat === seatId);
      return s ? s.userId : null;
    })();
    const running = st.phase === 'playing' && st.turn === color;
    row.className = 'chess-player' + (running ? ' is-running' : '') + (seatUser === me() ? ' is-me' : '');
    const dot = document.createElement('span');
    dot.className = `chess-dot is-${color}`;
    row.appendChild(dot);
    if (seatUser != null) row.appendChild(avatarEl(seatUser));
    const who = document.createElement('span');
    who.className = 'chess-who';
    who.textContent = seatUser != null ? name(seatUser) + (seatUser === me() ? ' (você)' : '') : 'cadeira vazia';
    row.appendChild(who);
    if (st.phase !== 'playing' && seatUser != null) {
      const rdy = document.createElement('span');
      rdy.className = 'duno-badge' + (st.ready.includes(seatUser) ? ' is-play' : '');
      rdy.textContent = st.ready.includes(seatUser) ? 'pronto ✓' : 'não pronto';
      row.appendChild(rdy);
    }
    const away = st.away.find((a) => a.userId === uid);
    if (away) {
      const a = document.createElement('span');
      a.className = 'duno-badge chess-away';
      a.dataset.until = String(away.until);
      row.appendChild(a);
    }
    const clock = document.createElement('span');
    clock.className = 'chess-clock';
    clock.dataset.color = color;
    const mode = st.modes.find((m) => m.id === (st.gameMode || st.mode));
    clock.textContent = times ? fmtClock(times[color]) : mode ? fmtClock(mode.base) : '';
    row.appendChild(clock);
    return row;
  }

  function boardEl(st) {
    const wrap = document.createElement('div');
    wrap.className = 'chess-board';
    const flip = bottomColor(st) === 'b';
    const legal = st.you.legal || [];
    const targets = selected ? legal.filter((u) => u.startsWith(selected)).map((u) => u.slice(2, 4)) : [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const f = flip ? 7 - col : col;
        const r = flip ? row : 7 - row;
        const i = r * 8 + f;
        const name2 = sqName(i);
        const p = st.board[i];
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'chess-sq ' + ((f + r) % 2 ? 'is-light' : 'is-dark');
        cell.dataset.sq = name2;
        if (st.lastMove && (st.lastMove.from === name2 || st.lastMove.to === name2)) cell.classList.add('is-last');
        if (st.check === name2) cell.classList.add('is-check');
        if (selected === name2) cell.classList.add('is-sel');
        if (targets.includes(name2)) cell.classList.add(p === '.' ? 'is-target' : 'is-capture');
        if (p !== '.') {
          const pc = document.createElement('span');
          pc.className = `chess-pc is-${colorOf(p)}`;
          pc.textContent = GLYPH[p.toLowerCase()] + '︎';
          cell.appendChild(pc);
        }
        if (col === 0) { const l = document.createElement('i'); l.className = 'chess-coord is-rank'; l.textContent = r + 1; cell.appendChild(l); }
        if (row === 7) { const l = document.createElement('i'); l.className = 'chess-coord is-file'; l.textContent = FILES[f]; cell.appendChild(l); }
        cell.addEventListener('click', () => onSquare(st, name2));
        wrap.appendChild(cell);
      }
    }
    if (promoAsk) {
      const pick = document.createElement('div');
      pick.className = 'chess-promo';
      const c = st.you.color;
      for (const t of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `chess-pc is-${c}`;
        b.textContent = GLYPH[t] + '︎';
        b.title = { q: 'dama', r: 'torre', b: 'bispo', n: 'cavalo' }[t];
        b.addEventListener('click', () => { send('move', { from: promoAsk.from, to: promoAsk.to, promo: t }); promoAsk = null; selected = null; render(); });
        pick.appendChild(b);
      }
      wrap.appendChild(pick);
    }
    return wrap;
  }

  function onSquare(st, sq) {
    const legal = st.you.legal || [];
    if (!legal.length) return;
    if (selected) {
      const moves = legal.filter((u) => u.startsWith(selected + sq));
      if (moves.length > 1 || (moves.length === 1 && moves[0].length === 5)) { promoAsk = { from: selected, to: sq }; render(); return; }
      if (moves.length === 1) { send('move', { from: selected, to: sq }); selected = null; render(); return; }
    }
    selected = legal.some((u) => u.startsWith(sq)) && selected !== sq ? sq : null;
    promoAsk = null;
    render();
  }

  function movesEl(st) {
    const box = document.createElement('div');
    box.className = 'chess-moves';
    if (!st.moves.length) {
      box.innerHTML = `<span class="chess-muted">${st.phase === 'playing' ? 'as brancas começam' : 'os lances aparecem aqui'}</span>`;
      return box;
    }
    for (let i = 0; i < st.moves.length; i += 2) {
      const n = document.createElement('span');
      n.className = 'chess-move-n';
      n.textContent = `${i / 2 + 1}.`;
      box.appendChild(n);
      for (const k of [i, i + 1]) {
        if (k >= st.moves.length) break;
        const m = document.createElement('span');
        m.className = 'chess-move' + (k === st.moves.length - 1 ? ' is-last' : '');
        m.textContent = ptSan(st.moves[k]);
        box.appendChild(m);
      }
    }
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
    return box;
  }

  function controlsEl(st) {
    const box = document.createElement('div');
    box.className = 'duno-actions chess-actions';
    const seated = st.seated.some((s) => s.userId === me());
    if (st.phase === 'playing' && st.you.color) {
      const theirs = st.you.color === 'w' ? 'b' : 'w';
      if (st.drawOffer === theirs) {
        box.appendChild(btn('🤝 aceitar empate', () => send('draw')));
        box.appendChild(btn('recusar', () => send('decline'), 'is-soft'));
      } else {
        const d = btn(st.drawOffer === st.you.color ? 'empate oferecido…' : '½ oferecer empate', () => send('draw'), 'is-soft');
        d.disabled = st.drawOffer === st.you.color;
        box.appendChild(d);
      }
      if (st.moves.length < 2) box.appendChild(btn('cancelar partida', () => send('abort'), 'is-soft'));
      const armed = Date.now() - resignArmed < 3000;
      box.appendChild(btn(armed ? 'confirmar desistência?' : '🏳 desistir', () => {
        if (Date.now() - resignArmed < 3000) { resignArmed = 0; send('resign'); } else { resignArmed = Date.now(); render(); setTimeout(() => { if (open) render(); }, 3100); }
      }, armed ? 'is-danger' : 'is-soft'));
      return box;
    }
    if (st.phase === 'playing') {
      box.innerHTML = '<p class="duno-empty">partida em andamento — assistindo</p>';
      return box;
    }
    if (!seated) {
      box.innerHTML = '<p class="duno-empty">sente numa das cadeiras da mesa pra jogar</p>';
      return box;
    }
    const modes = document.createElement('div');
    modes.className = 'chess-modes';
    for (const m of st.modes) {
      const b = btn(`${m.label} · ${modeTag(m)}`, () => send('mode', { mode: m.id }), st.mode === m.id ? 'is-on' : 'is-soft');
      b.title = `${m.base / 60000} min pra cada um + ${m.inc / 1000} s a cada lance`;
      modes.appendChild(b);
    }
    box.appendChild(modes);
    const ready = st.ready.includes(me());
    const again = st.phase === 'over';
    box.appendChild(btn(ready ? 'cancelar "pronto"' : again ? '🔁 revanche (pronto)' : '✔ pronto', () => send('ready', { on: !ready }), ready ? 'is-soft' : ''));
    return box;
  }

  function render() {
    cancelAnimationFrame(timerRaf);
    panel.innerHTML = '';
    const st = states.get(focusId);
    const def = defOf(focusId);
    if (!st || !def) return;
    const seated = st.seated.some((s) => s.userId === me());

    const head = document.createElement('div');
    head.className = 'duno-head';
    head.innerHTML = '<span class="duno-head-icon">♟️</span><div class="duno-head-title"><strong></strong><small></small></div>';
    head.querySelector('strong').textContent = def.name || 'xadrez';
    const mode = st.modes.find((m) => m.id === (st.phase === 'waiting' ? st.mode : st.gameMode || st.mode));
    head.querySelector('small').textContent = `${mode ? `${mode.label} ${modeTag(mode)} · ` : ''}${statusText(st)}`;
    if (!seated && defs.length > 1) {
      const nextDef = defs[(defs.findIndex((d) => d.id === focusId) + 1) % defs.length];
      head.appendChild(btn(`ver ${nextDef.name || 'outra mesa'}`, () => { focusId = nextDef.id; selected = null; promoAsk = null; render(); }, 'is-soft bj-switch'));
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'world-round-btn is-small';
    close.title = 'fechar (a partida continua)';
    close.textContent = '✕';
    close.addEventListener('click', () => setOpen(false));
    head.appendChild(close);
    panel.appendChild(head);

    const body = document.createElement('div');
    body.className = 'chess-body';
    const left = document.createElement('div');
    left.className = 'chess-left';
    const times = clockTimes(st);
    const bottom = bottomColor(st);
    const top = bottom === 'w' ? 'b' : 'w';
    left.appendChild(playerRow(st, top, times));
    left.appendChild(boardEl(st));
    left.appendChild(playerRow(st, bottom, times));
    body.appendChild(left);
    const right = document.createElement('div');
    right.className = 'chess-right';
    right.appendChild(movesEl(st));
    if (st.drawOffer && st.phase === 'playing' && st.drawOffer !== st.you.color) {
      const p = document.createElement('p');
      p.className = 'chess-note';
      p.textContent = `${COLOR_NAME[st.drawOffer]} ofereceram empate`;
      right.appendChild(p);
    }
    if (st.phase === 'over') {
      const p = document.createElement('p');
      p.className = 'chess-result';
      p.textContent = resultText(st);
      right.appendChild(p);
    }
    right.appendChild(controlsEl(st));
    body.appendChild(right);
    panel.appendChild(body);

    // relógios e "volta em" correndo
    const tick = () => {
      const t = clockTimes(st);
      for (const el of panel.querySelectorAll('.chess-clock')) {
        if (t) el.textContent = fmtClock(t[el.dataset.color]);
        el.classList.toggle('is-low', !!t && t[el.dataset.color] < 20000 && st.phase === 'playing');
      }
      for (const el of panel.querySelectorAll('.chess-away')) {
        el.textContent = `saiu — volta em ${Math.max(0, Math.ceil((Number(el.dataset.until) - api.serverNow()) / 1000))}s`;
      }
      if (st.phase === 'playing') timerRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  function setOpen(v) {
    open = !!v;
    if (open && !focusId) focusId = mySeatTable() || nearestTable();
    if (open && !mySeatTable() && !states.get(focusId)) focusId = defs[0].id;
    panel.hidden = !open;
    if (open) render(); else { cancelAnimationFrame(timerRaf); selected = null; promoAsk = null; }
    world.onPanelChange();
  }

  // ---------- interface pro mundo ----------
  function setState(next) {
    const prev = states.get(next.table);
    states.set(next.table, next);
    update3d(next.table, prev);
    const iSitHere = next.seated.some((s) => s.userId === me());
    const satNow = iSitHere && !(prev && prev.seated.some((s) => s.userId === me()));
    const startedNow = next.phase === 'playing' && next.you.color && !(prev && prev.phase === 'playing' && prev.round === next.round);
    if (iSitHere) focusId = next.table;
    if (!prev || prev.board !== next.board || prev.turn !== next.turn) { selected = null; promoAsk = null; }
    if (!open && (satNow || startedNow)) setOpen(true);
    else if (open && next.table === focusId) render();
  }

  function onMySeat(seatId) {
    const def = defs.find((d) => d.seats.includes(seatId));
    if (!def) return;
    focusId = def.id;
    if (!open && states.has(def.id)) setOpen(true);
  }

  function isActive() {
    return open || [...states.values()].some((st) => st.phase === 'playing' || st.seated.some((s) => s.userId === me()));
  }

  function toggle() {
    if (!open) focusId = mySeatTable() || nearestTable();
    setOpen(!open);
  }

  function destroy() {
    cancelAnimationFrame(timerRaf);
    cancelAnimationFrame(animRaf);
    clearInterval(clockTick);
    panel.remove();
    for (const b of boards.values()) {
      scene.remove(b.group);
      b.clock.tex.dispose();
    }
    for (const list of Object.values(geos)) for (const g of list) g.dispose();
    for (const m of [...Object.values(MATS), ...Object.values(hlMats)]) m.dispose();
    hlGeo.dispose();
  }

  return { setState, setOpen, toggle, isOpen: () => open, isActive, onMySeat, destroy };
}
