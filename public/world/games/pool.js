// Sinuca "par x ímpar" no site (docs/MUNDINHO.md). Quem decide tudo é o servidor
// (server/games/pool.js): ele simula a tacada e manda os quadros (posição de cada bola a cada 1/30 s);
// aqui a mesa só ANIMA esses quadros — todo mundo vê exatamente a mesma jogada. Um módulo cuida de
// todas as mesas de sinuca da cena.
//
// 3D: bolas numeradas em cima da mesa (desenhada em props.js, poolTable), rolando de verdade, o taco
// que puxa e bate antes de cada tacada e, na sua vez, a linha de mira com a "bola fantasma".
// Painel (dock 🎱 / tecla N): os dois times e as bolas que faltam, a mesa vista de cima pra mirar
// (mexe o mouse pra mirar, clica e puxa pra trás pra dar força e solta pra tacar — ou ←/→, ↑/↓ e
// espaço), a punição (escolher uma bola sua pra derrubar) e o resultado.
import * as THREE from '/vendor/three/0.170.0/three.module.min.js';

// medidas iguais a server/games/pool.js e a props.js (poolTable)
const L = 2.24;
const W = 1.12;
const HX = L / 2;
const HZ = W / 2;
const R = 0.0275;
const Y = 0.8;
const RAIL = 0.05 + 0.13;
const POCKETS = [
  { x: -HX - 0.015, z: -HZ - 0.015 }, { x: 0, z: -HZ - 0.036 }, { x: HX + 0.015, z: -HZ - 0.015 },
  { x: -HX - 0.015, z: HZ + 0.015 }, { x: 0, z: HZ + 0.036 }, { x: HX + 0.015, z: HZ + 0.015 },
];
const CUE_LEAD_MS = 450;   // o servidor deixa esse tempo pro taco puxar e bater antes das bolas andarem
const DROP_MS = 260;
const TEAM_NAME = { impar: 'ímpar', par: 'par' };
const BALL_COLORS = {
  1: '#f2c40c', 2: '#1d4ed8', 3: '#dc2626', 4: '#6d28d9', 5: '#f97316', 6: '#15803d', 7: '#7f1d1d', 8: '#111111',
  9: '#f2c40c', 10: '#1d4ed8', 11: '#dc2626', 12: '#6d28d9', 13: '#f97316', 14: '#15803d', 15: '#7f1d1d',
};
const FOUL_TEXT = {
  nada: 'não acertou nenhuma bola',
  adversaria: 'acertou primeiro a bola do outro time',
  'bola-1': 'acertou a 1 antes da hora',
  'nao-1': 'era a vez da 1 e acertou outra bola',
  branca: 'a branca caiu',
  tempo: 'o tempo acabou',
};
const teamOfBall = (id) => (id >= 2 ? (id % 2 ? 'impar' : 'par') : null);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- texturas das bolas (lisas 1–8, listradas 9–15, número em dois lados) ----------
function ballTexture(id) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  if (id === 0) {
    g.fillStyle = '#f7f3ea';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#d6332b';
    for (const u of [64, 192]) { g.beginPath(); g.arc(u, 64, 6, 0, Math.PI * 2); g.fill(); }
  } else {
    const color = BALL_COLORS[id];
    const stripe = id >= 9;
    g.fillStyle = stripe ? '#f7f3ea' : color;
    g.fillRect(0, 0, 256, 128);
    if (stripe) { g.fillStyle = color; g.fillRect(0, 34, 256, 60); }
    for (const u of [64, 192]) {
      g.fillStyle = '#f7f3ea';
      g.beginPath();
      g.ellipse(u, 64, 19, 23, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = `800 ${id >= 10 ? 22 : 26}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(id), u, 66);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// onde a branca vai bater seguindo `angle` (bola fantasma) — só pra mira, o resultado de verdade é do servidor
function predict(balls, angle) {
  const c = balls.get(0);
  if (!c) return null;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let best = Infinity;
  let hit = null;
  for (const [id, b] of balls) {
    if (id === 0) continue;
    const fx = b.x - c.x;
    const fz = b.z - c.z;
    const t = fx * dx + fz * dz;
    if (t <= 0) continue;
    const perp2 = fx * fx + fz * fz - t * t;
    if (perp2 > 4 * R * R) continue;
    const th = t - Math.sqrt(4 * R * R - perp2);
    if (th < best) { best = th; hit = id; }
  }
  const tx = dx > 0 ? (HX - R - c.x) / dx : dx < 0 ? (-HX + R - c.x) / dx : Infinity;
  const tz = dz > 0 ? (HZ - R - c.z) / dz : dz < 0 ? (-HZ + R - c.z) / dz : Infinity;
  const tw = Math.max(0, Math.min(tx, tz));
  if (hit != null && best <= tw) {
    const gx = c.x + dx * best;
    const gz = c.z + dz * best;
    const b = balls.get(hit);
    const nx = b.x - gx;
    const nz = b.z - gz;
    const nl = Math.hypot(nx, nz) || 1;
    return { from: c, ghost: { x: gx, z: gz }, hit, obj: { x: nx / nl, z: nz / nl }, ball: b };
  }
  return { from: c, ghost: { x: c.x + dx * tw, z: c.z + dz * tw }, hit: null };
}

export function createPool({ scene, container, api, defs, world }) {
  const states = new Map();
  let focusId = null;
  let open = false;
  let aim = { angle: 0, power: 0.45, set: false };
  let drag = null;             // { x0, z0 } arrastando pra dar força
  let dragPower = 0;
  let resignArmed = 0;
  let raf = 0;

  const me = () => api.myId();
  const name = (id) => world.userName(id);
  const defOf = (id) => defs.find((d) => d.id === id) || null;
  const now = () => api.serverNow();

  // ==================================================================
  // 3D
  // ==================================================================
  const ballGeo = new THREE.SphereGeometry(R, 28, 18);
  const ballMats = new Map();
  for (let id = 0; id <= 15; id++) ballMats.set(id, new THREE.MeshStandardMaterial({ map: ballTexture(id), roughness: 0.18, metalness: 0.02 }));

  const cueMat = new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.45 });
  const cueDark = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.5 });
  const cueTip = new THREE.MeshStandardMaterial({ color: 0x3b6fd1, roughness: 0.8 });
  function buildCue() {
    // taco ao longo do -x local, ponta na origem
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0105, 0.95, 12).rotateZ(Math.PI / 2), cueMat);
    shaft.position.x = -0.475 - 0.01;
    g.add(shaft);
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.015, 0.5, 12).rotateZ(Math.PI / 2), cueDark);
    butt.position.x = -0.95 - 0.25 - 0.01;
    g.add(butt);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0065, 0.012, 12).rotateZ(Math.PI / 2), cueTip);
    tip.position.x = -0.004;
    g.add(tip);
    g.visible = false;
    return g;
  }
  const aimMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
  const aimObjMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false });
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  const ghostGeo = new THREE.RingGeometry(R * 0.82, R, 28).rotateX(-Math.PI / 2);

  const tables = new Map();
  for (const def of defs) {
    const group = new THREE.Group();
    group.position.set(def.x, (def.y || 0) + Y + R, def.z);
    scene.add(group);
    const balls = new Map();
    for (let id = 0; id <= 15; id++) {
      const m = new THREE.Mesh(ballGeo, ballMats.get(id));
      // cada bola começa virada pra um lado (números aparecendo em ângulos diferentes)
      m.quaternion.setFromEuler(new THREE.Euler(id * 1.3, id * 2.1, id * 0.7));
      m.visible = false;
      group.add(m);
      balls.set(id, m);
    }
    const cue = buildCue();
    group.add(cue);
    const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), aimMat);
    const objLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), aimObjMat);
    const ghost = new THREE.Mesh(ghostGeo, ghostMat);
    for (const o of [aimLine, objLine, ghost]) { o.visible = false; o.renderOrder = 3; group.add(o); }
    tables.set(def.id, { def, group, balls, cue, aimLine, objLine, ghost, cur: new Map(), play: null, playedSeq: 0 });
  }

  // posições "de agora" de cada mesa (o que está desenhado), usadas pela mira e pelo painel
  function snap(tb, st) {
    tb.cur = new Map();
    const on = new Set();
    for (const [id, x, z] of st.balls) {
      tb.cur.set(id, { x, z });
      on.add(id);
      const m = tb.balls.get(id);
      m.position.set(x, 0, z);
      m.visible = true;
    }
    for (const [id, m] of tb.balls) if (!on.has(id)) m.visible = false;
  }

  // reconstrói os quadros (o servidor manda só quem mexeu em cada quadro)
  function expand(shot) {
    const ids = shot.start.map((s) => s[0]);
    const idx = new Map(ids.map((id, i) => [id, i]));
    const n = ids.length;
    const F = shot.frames.length;
    const pos = new Float32Array(F * n * 2);
    const cur = new Float32Array(n * 2);
    shot.start.forEach(([, x, z], i) => { cur[i * 2] = x; cur[i * 2 + 1] = z; });
    for (let f = 0; f < F; f++) {
      const fr = shot.frames[f];
      for (let k = 0; k < fr.length; k += 3) {
        const i = idx.get(fr[k]);
        if (i == null) continue;
        cur[i * 2] = fr[k + 1] / 1000;
        cur[i * 2 + 1] = fr[k + 2] / 1000;
      }
      pos.set(cur, f * n * 2);
    }
    const drop = new Map(shot.pocketed.map((p) => [p.id, p]));
    return { ids, n, F, pos, drop, frameMs: shot.frameMs, startAt: shot.startAt, endsAt: shot.endsAt, angle: shot.angle, power: shot.power, seq: shot.seq };
  }

  const tmpAxis = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  function stepPlayback(tb, t) {
    const pl = tb.play;
    const fl = t / pl.frameMs;
    const f0 = clamp(Math.floor(fl), 0, pl.F - 1);
    const f1 = Math.min(pl.F - 1, f0 + 1);
    const a = clamp(fl - f0, 0, 1);
    const cur = new Map();
    for (let i = 0; i < pl.n; i++) {
      const id = pl.ids[i];
      const m = tb.balls.get(id);
      const o0 = (f0 * pl.n + i) * 2;
      const o1 = (f1 * pl.n + i) * 2;
      let x = pl.pos[o0] + (pl.pos[o1] - pl.pos[o0]) * a;
      let z = pl.pos[o0 + 1] + (pl.pos[o1 + 1] - pl.pos[o0 + 1]) * a;
      let y = 0;
      const d = pl.drop.get(id);
      if (d && fl >= d.f - 1) {
        // caindo na caçapa: escorrega pro centro dela e afunda
        const k = clamp(((fl - (d.f - 1)) * pl.frameMs) / DROP_MS, 0, 1);
        const p = POCKETS[d.pocket] || { x, z };
        x += (p.x - x) * k;
        z += (p.z - z) * k;
        y = -0.07 * k;
        if (k >= 1) { m.visible = false; continue; }
      } else {
        cur.set(id, { x, z });
      }
      // rolar: gira em volta do eixo perpendicular ao movimento
      const dx = x - m.position.x;
      const dz = z - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-5 && dist < 0.5) {
        tmpAxis.set(dz, 0, -dx).normalize();
        tmpQ.setFromAxisAngle(tmpAxis, dist / R);
        m.quaternion.premultiply(tmpQ);
      }
      m.position.set(x, y, z);
      m.visible = true;
    }
    tb.cur = cur;
  }

  // taco: aparece na sua mira e na batida de cada tacada (puxa e bate)
  function placeCue(tb, angle, back, show) {
    const c = tb.cur.get(0);
    if (!c || !show) { tb.cue.visible = false; return; }
    const gap = R + 0.008 + back;
    tb.cue.position.set(c.x - Math.cos(angle) * gap, 0.004, c.z - Math.sin(angle) * gap);
    tb.cue.rotation.set(0, -angle, 0.07); // levanta um pouquinho o cabo
    tb.cue.visible = true;
  }
  function hideAim(tb) { tb.aimLine.visible = tb.objLine.visible = tb.ghost.visible = false; }
  function setLine(line, a, b) {
    const p = line.geometry.attributes.position;
    p.setXYZ(0, a.x, 0, a.z);
    p.setXYZ(1, b.x, 0, b.z);
    p.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.visible = true;
  }

  function myShot(st) {
    return !!st && st.phase === 'playing' && st.stage === 'aim' && st.shooter === me() && !animating(st);
  }
  function animating(st) {
    const tb = tables.get(st.table);
    return !!(tb && tb.play) || !!(st.shot && now() < st.shot.endsAt);
  }

  function frame() {
    raf = 0;
    let again = false; // só continua rodando com bola andando ou na sua mira
    for (const tb of tables.values()) {
      const st = states.get(tb.def.id);
      if (tb.play) {
        const t = now() - tb.play.startAt;
        if (t < 0) {
          // taco puxando (força maior = puxa mais) e batendo
          const k = clamp(1 + t / CUE_LEAD_MS, 0, 1);
          const pull = 0.04 + 0.22 * tb.play.power;
          const back = k < 0.75 ? pull * (k / 0.75) : pull * (1 - (k - 0.75) / 0.25);
          placeCue(tb, tb.play.angle, back, true);
        } else {
          placeCue(tb, tb.play.angle, 0, t < 180);
          stepPlayback(tb, t);
        }
        hideAim(tb);
        if (t >= tb.play.F * tb.play.frameMs + 120) {
          tb.play = null;
          if (st) snap(tb, st);
          if (open && focusId === tb.def.id) render();
        }
        again = true;
      } else if (st && myShot(st)) {
        // minha vez: linha de mira + bola fantasma + taco na minha mira
        const pr = predict(tb.cur, aim.angle);
        if (pr) {
          setLine(tb.aimLine, pr.from, pr.ghost);
          tb.ghost.position.set(pr.ghost.x, 0, pr.ghost.z);
          tb.ghost.visible = true;
          if (pr.hit != null) setLine(tb.objLine, pr.ball, { x: pr.ball.x + pr.obj.x * 0.35, z: pr.ball.z + pr.obj.z * 0.35 });
          else tb.objLine.visible = false;
        }
        placeCue(tb, aim.angle, 0.02 + 0.22 * (drag ? dragPower : 0), true);
        again = true;
      } else {
        hideAim(tb);
        tb.cue.visible = false;
      }
    }
    if (open) drawTable();
    if (again) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  // ==================================================================
  // painel
  // ==================================================================
  const panel = document.createElement('div');
  panel.className = 'duno-panel pool-panel';
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
  function chip(id, down) {
    const c = document.createElement('span');
    c.className = 'pool-chip' + (id >= 9 ? ' is-stripe' : '') + (down ? ' is-down' : '');
    c.style.setProperty('--ball', BALL_COLORS[id]);
    c.textContent = id;
    return c;
  }

  const mySeatTable = () => {
    for (const [id, st] of states) if (st.seated.some((s) => s.userId === me()) || st.teams.impar.includes(me()) || st.teams.par.includes(me())) return id;
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

  const teamWord = (team) => `time ${TEAM_NAME[team]}`;
  function resultText(st) {
    const r = st.result;
    if (!r) return '';
    const w = teamWord(r.winner);
    const l = teamWord(r.winner === 'impar' ? 'par' : 'impar');
    switch (r.reason) {
      case 'bola-1': return `🏆 ${w} derrubou a 1 e venceu!`;
      case 'bola-1-cedo': return `a 1 caiu antes da hora — ${w} venceu`;
      case 'bola-1-falta': return `a 1 caiu, mas com falta — ${w} venceu`;
      case 'desistencia': return `${l} desistiu — ${w} venceu`;
      case 'abandono': return `${l} saiu — ${w} venceu`;
      default: return `${w} venceu`;
    }
  }
  function lastText(st) {
    const l = st.last;
    if (!l) return '';
    const who = l.userId != null ? name(l.userId) : teamWord(l.team);
    const parts = [];
    const balls = l.pocketed.filter((id) => id !== 0);
    if (balls.length) parts.push(`${balls.length > 1 ? 'caíram' : 'caiu'} a ${balls.join(', a ')}`);
    if (l.foul) parts.push(`falta: ${FOUL_TEXT[l.foul] || 'falta'}`);
    else if (l.cont) parts.push('joga de novo');
    else if (!balls.length) parts.push(l.wasBreak ? 'saída sem bola caída' : 'nada caiu');
    if (l.penaltyBall) parts.push(`punição: o ${teamWord(l.team === 'impar' ? 'par' : 'impar')} derrubou a ${l.penaltyBall}`);
    return `${who}: ${parts.join(' · ')}`;
  }
  function modeText(st) {
    const n = Math.max(st.teams.impar.length, st.teams.par.length);
    return n >= 2 ? '2x2' : n === 1 ? '1x1' : '';
  }
  function statusText(st) {
    if (st.phase === 'playing') {
      if (animating(st)) return st.shot ? `tacada de ${name(st.shot.userId)}…` : 'bolas rolando…';
      if (st.stage === 'penalty') return `falta! o ${teamWord(st.penalty.team)} escolhe uma bola pra derrubar`;
      const mine = st.shooter === me();
      return mine ? `sua vez${st.isBreak ? ' — saída!' : ''}` : `vez de ${name(st.shooter)} (${teamWord(st.turnTeam)})`;
    }
    if (st.phase === 'over' && !animating(st)) return resultText(st);
    const t = st.teams;
    if (!t.impar.length && !t.par.length) return 'mesa livre — sente numa banqueta pra jogar';
    if (t.impar.length !== t.par.length) return 'os times precisam ficar do mesmo tamanho (1x1 ou 2x2)';
    return 'esperando todo mundo ficar pronto';
  }

  function teamCard(st, team) {
    const card = document.createElement('div');
    const playing = st.phase === 'playing';
    card.className = `pool-team is-${team}` + (playing && st.turnTeam === team && !animating(st) ? ' is-turn' : '');
    const head = document.createElement('div');
    head.className = 'pool-team-head';
    head.innerHTML = `<strong>time ${TEAM_NAME[team]}</strong><small>${team === 'impar' ? 'banquetas da esquerda' : 'banquetas da direita'}</small>`;
    card.appendChild(head);
    const people = document.createElement('div');
    people.className = 'pool-team-people';
    const list = st.teams[team];
    if (!list.length) people.innerHTML = '<span class="pool-muted">ninguém</span>';
    for (const uid of list) {
      const row = document.createElement('span');
      row.className = 'pool-person' + (playing && st.shooter === uid ? ' is-shooter' : '') + (uid === me() ? ' is-me' : '');
      row.appendChild(avatarEl(uid));
      const n = document.createElement('span');
      n.textContent = name(uid) + (uid === me() ? ' (você)' : '');
      row.appendChild(n);
      if (st.phase !== 'playing') {
        const b = document.createElement('span');
        b.className = 'duno-badge' + (st.ready.includes(uid) ? ' is-play' : '');
        b.textContent = st.ready.includes(uid) ? 'pronto ✓' : 'não pronto';
        row.appendChild(b);
      }
      people.appendChild(row);
    }
    card.appendChild(people);
    const chips = document.createElement('div');
    chips.className = 'pool-chips';
    const on = new Set(st.balls.map((b) => b[0]));
    for (const id of st.groups[team]) chips.appendChild(chip(id, st.phase !== 'waiting' && !on.has(id)));
    card.appendChild(chips);
    return card;
  }

  // ---------- a mesa vista de cima (canvas) ----------
  const cv = document.createElement('canvas');
  cv.className = 'pool-canvas';
  cv.width = 780;
  cv.height = Math.round(780 * ((W + 2 * RAIL) / (L + 2 * RAIL)));
  cv.tabIndex = 0;
  const cg = cv.getContext('2d');
  const SC = cv.width / (L + 2 * RAIL);
  const toPx = (x, z) => [(x + HX + RAIL) * SC, (z + HZ + RAIL) * SC];
  const toTable = (e) => {
    const r = cv.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * cv.width;
    const py = ((e.clientY - r.top) / r.height) * cv.height;
    return { x: px / SC - HX - RAIL, z: py / SC - HZ - RAIL };
  };

  function drawTable() {
    const tb = tables.get(focusId);
    const st = states.get(focusId);
    if (!tb || !st || !cv.isConnected) return;
    const g = cg;
    g.clearRect(0, 0, cv.width, cv.height);
    // madeira, pano, caçapas
    g.fillStyle = '#5a3522';
    roundRect(g, 0, 0, cv.width, cv.height, 22);
    g.fill();
    const [fx0, fz0] = toPx(-HX - 0.05, -HZ - 0.05);
    const [fx1, fz1] = toPx(HX + 0.05, HZ + 0.05);
    g.fillStyle = '#185c3d';
    g.fillRect(fx0, fz0, fx1 - fx0, fz1 - fz0);
    const [px0, pz0] = toPx(-HX, -HZ);
    const [px1, pz1] = toPx(HX, HZ);
    g.fillStyle = '#1d6a48';
    g.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
    g.fillStyle = '#0b0b0d';
    for (const p of POCKETS) { const [x, y] = toPx(p.x, p.z); g.beginPath(); g.arc(x, y, 0.064 * SC, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (const x of [-HX / 2, HX / 2]) { const [a, b] = toPx(x, 0); g.beginPath(); g.arc(a, b, 3, 0, Math.PI * 2); g.fill(); }
    // mira
    if (myShot(st)) {
      const pr = predict(tb.cur, aim.angle);
      if (pr) {
        const [ax, ay] = toPx(pr.from.x, pr.from.z);
        const [gx, gy] = toPx(pr.ghost.x, pr.ghost.z);
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 2;
        g.setLineDash([8, 6]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(gx, gy); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(gx, gy, R * SC, 0, Math.PI * 2); g.stroke();
        if (pr.hit != null) {
          const [bx, by] = toPx(pr.ball.x, pr.ball.z);
          g.strokeStyle = 'rgba(255,224,138,0.95)';
          g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + pr.obj.x * 0.3 * SC, by + pr.obj.z * 0.3 * SC); g.stroke();
        }
        // taco (puxado conforme a força)
        const pw = drag ? dragPower : 0;
        const back = (0.03 + 0.25 * pw) * SC;
        const ux = Math.cos(aim.angle);
        const uz = Math.sin(aim.angle);
        g.strokeStyle = '#c89a62';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(ax - ux * (R * SC + back), ay - uz * (R * SC + back));
        g.lineTo(ax - ux * (R * SC + back + 0.9 * SC), ay - uz * (R * SC + back + 0.9 * SC));
        g.stroke();
        g.lineCap = 'butt';
      }
    }
    // bolas
    for (const [id, b] of tb.cur) {
      const [x, y] = toPx(b.x, b.z);
      const r = R * SC;
      g.fillStyle = id === 0 ? '#f7f3ea' : id >= 9 ? '#f7f3ea' : BALL_COLORS[id];
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (id >= 9) {
        g.save();
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
        g.fillStyle = BALL_COLORS[id];
        g.fillRect(x - r, y - r * 0.55, 2 * r, r * 1.1);
        g.restore();
      }
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      if (id > 0) {
        g.fillStyle = '#f7f3ea';
        g.beginPath(); g.arc(x, y, r * 0.52, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111';
        g.font = `800 ${Math.round(r * 0.75)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(id), x, y + 0.5);
      }
    }
    // barra de força enquanto puxa
    if (drag) {
      const w = 160;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(g, cv.width / 2 - w / 2 - 6, 8, w + 12, 20, 10);
      g.fill();
      g.fillStyle = dragPower > 0.8 ? '#ff6b4a' : dragPower > 0.5 ? '#ffd166' : '#7be495';
      roundRect(g, cv.width / 2 - w / 2, 13, w * dragPower, 10, 5);
      g.fill();
    }
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function aimAt(e) {
    const tb = tables.get(focusId);
    const c = tb && tb.cur.get(0);
    if (!c) return;
    const p = toTable(e);
    if (Math.hypot(p.x - c.x, p.z - c.z) < 0.01) return;
    aim.angle = Math.atan2(p.z - c.z, p.x - c.x);
    aim.set = true;
  }
  cv.addEventListener('pointermove', (e) => {
    const st = states.get(focusId);
    if (!myShot(st)) return;
    if (drag) {
      // puxar pra trás (contra a mira) dá força; 45 cm de puxada = 100%
      const p = toTable(e);
      const pull = -((p.x - drag.x0) * Math.cos(aim.angle) + (p.z - drag.z0) * Math.sin(aim.angle));
      dragPower = clamp(pull / 0.45, 0, 1);
    } else {
      aimAt(e);
    }
    kick();
  });
  cv.addEventListener('pointerdown', (e) => {
    const st = states.get(focusId);
    if (!myShot(st) || e.button !== 0) return;
    cv.focus();
    aimAt(e);
    const p = toTable(e);
    drag = { x0: p.x, z0: p.z };
    dragPower = 0;
    cv.setPointerCapture(e.pointerId);
    kick();
  });
  const endDrag = (e, cancel) => {
    if (!drag) return;
    const pw = dragPower;
    drag = null;
    dragPower = 0;
    try { cv.releasePointerCapture(e.pointerId); } catch (_) { /* já soltou */ }
    if (!cancel && pw >= 0.03) shoot(pw);
    kick();
  };
  cv.addEventListener('pointerup', (e) => endDrag(e, false));
  cv.addEventListener('pointercancel', (e) => endDrag(e, true));
  // setas e espaço no canvas (sem andar com o boneco: o evento não chega no mundo)
  cv.addEventListener('keydown', (e) => {
    const st = states.get(focusId);
    if (!myShot(st)) return;
    let used = true;
    const fine = e.shiftKey ? 0.03 : 0.004;
    if (e.key === 'ArrowLeft') aim.angle -= fine;
    else if (e.key === 'ArrowRight') aim.angle += fine;
    else if (e.key === 'ArrowUp') aim.power = clamp(aim.power + 0.02, 0.02, 1);
    else if (e.key === 'ArrowDown') aim.power = clamp(aim.power - 0.02, 0.02, 1);
    else if (e.key === ' ' || e.key === 'Enter') shoot(aim.power);
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
      const sl = panel.querySelector('.pool-power input');
      if (sl) { sl.value = Math.round(aim.power * 100); sl.nextSibling.textContent = `${Math.round(aim.power * 100)}%`; }
      kick();
    }
  });

  function shoot(power) {
    const st = states.get(focusId);
    if (!myShot(st)) return;
    send('shoot', { angle: aim.angle, power: clamp(power, 0.02, 1) });
  }

  function controlsEl(st) {
    const box = document.createElement('div');
    box.className = 'duno-actions pool-actions';
    const seated = st.seated.some((s) => s.userId === me());
    const myTeam = st.you.team;
    const anim = animating(st);
    if (st.phase === 'playing' && !anim) {
      if (st.stage === 'penalty') {
        if (myTeam === st.penalty.team) {
          const p = document.createElement('p');
          p.className = 'pool-note';
          p.textContent = 'falta do outro time! escolha uma bola sua pra derrubar:';
          box.appendChild(p);
          const row = document.createElement('div');
          row.className = 'pool-chips is-pick';
          for (const id of st.penalty.options) {
            const b = chip(id, false);
            b.setAttribute('role', 'button');
            b.tabIndex = 0;
            b.title = `derrubar a ${id}`;
            b.addEventListener('click', () => send('penalty', { ball: id }));
            row.appendChild(b);
          }
          box.appendChild(row);
        } else {
          box.innerHTML = `<p class="duno-empty">o ${teamWord(st.penalty.team)} está escolhendo a bola da punição…</p>`;
        }
      } else if (st.shooter === me()) {
        const pw = document.createElement('label');
        pw.className = 'pool-power';
        pw.innerHTML = '<span>força</span><input type="range" min="2" max="100" step="1"><b></b>';
        const input = pw.querySelector('input');
        input.value = Math.round(aim.power * 100);
        pw.querySelector('b').textContent = `${input.value}%`;
        input.addEventListener('input', () => { aim.power = Number(input.value) / 100; pw.querySelector('b').textContent = `${input.value}%`; });
        box.appendChild(pw);
        box.appendChild(btn('🎱 tacar', () => shoot(aim.power)));
      }
      if (myTeam) {
        const armed = Date.now() - resignArmed < 3000;
        box.appendChild(btn(armed ? 'confirmar desistência?' : '🏳 desistir', () => {
          if (Date.now() - resignArmed < 3000) { resignArmed = 0; send('resign'); } else { resignArmed = Date.now(); render(); setTimeout(() => { if (open) render(); }, 3100); }
        }, armed ? 'is-danger' : 'is-soft'));
      }
      return box;
    }
    if (st.phase === 'playing') return box;
    if (!seated) {
      box.innerHTML = '<p class="duno-empty">sente numa banqueta pra jogar: as da esquerda são do time ímpar, as da direita do par</p>';
      return box;
    }
    const ready = st.ready.includes(me());
    const again = st.phase === 'over';
    box.appendChild(btn(ready ? 'cancelar "pronto"' : again ? '🔁 revanche (pronto)' : '✔ pronto', () => send('ready', { on: !ready }), ready ? 'is-soft' : ''));
    return box;
  }

  let renderTimer = 0;
  let tickRaf = 0;
  function render() {
    clearTimeout(renderTimer);
    cancelAnimationFrame(tickRaf);
    const st = states.get(focusId);
    const def = defOf(focusId);
    panel.innerHTML = '';
    if (!st || !def) return;

    const head = document.createElement('div');
    head.className = 'duno-head';
    head.innerHTML = '<span class="duno-head-icon">🎱</span><div class="duno-head-title"><strong></strong><small></small></div>';
    head.querySelector('strong').textContent = def.name || 'sinuca';
    const mode = modeText(st);
    head.querySelector('small').textContent = `par x ímpar${mode ? ` · ${mode}` : ''} · ${statusText(st)}`;
    const timer = document.createElement('span');
    timer.className = 'pool-timer';
    head.appendChild(timer);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'world-round-btn is-small';
    close.title = 'fechar (a partida continua)';
    close.textContent = '✕';
    close.addEventListener('click', () => setOpen(false));
    head.appendChild(close);
    panel.appendChild(head);

    const teams = document.createElement('div');
    teams.className = 'pool-teams';
    teams.appendChild(teamCard(st, 'impar'));
    const one = document.createElement('div');
    one.className = 'pool-final';
    one.appendChild(chip(1, false));
    const small = document.createElement('small');
    small.textContent = 'bola final';
    one.appendChild(small);
    teams.appendChild(one);
    teams.appendChild(teamCard(st, 'par'));
    panel.appendChild(teams);

    // resultado, última jogada e botões ficam ACIMA da mesa (o painel não pode esconder a punição)
    const anim = animating(st);
    if (!anim && st.phase === 'over') {
      const p = document.createElement('p');
      p.className = 'chess-result';
      p.textContent = resultText(st);
      panel.appendChild(p);
    }
    if (!anim && st.last) {
      const p = document.createElement('p');
      p.className = 'pool-last';
      p.textContent = lastText(st);
      panel.appendChild(p);
    }
    panel.appendChild(controlsEl(st));
    panel.appendChild(cv);
    if (myShot(st)) {
      const hint = document.createElement('p');
      hint.className = 'pool-hint';
      hint.textContent = 'mexa o mouse na mesa pra mirar · clique, puxe pra trás e solte pra tacar · ou ←/→ (shift = rápido), ↑/↓ força e espaço';
      panel.appendChild(hint);
    }
    const rules = document.createElement('details');
    rules.className = 'pool-rules';
    rules.innerHTML = `<summary>regras</summary><p>Time ímpar: 3 5 7 9 11 13 15 · time par: 2 4 6 8 10 12 14. A <b>1</b> é a bola final: depois de derrubar as suas, quem derruba a 1 ganha (derrubar antes da hora perde).</p>
      <p>É <b>falta</b> errar todas as bolas, acertar primeiro a do outro time (ou a 1 antes da hora), deixar a branca cair ou estourar o tempo. Na falta, o outro time escolhe uma bola dele pra derrubar e ganha a vez — a punição nunca derruba a 1${st.spareLast ? ' nem a última bolinha do time' : ''}.</p>
      <p>Derrubou bola sua sem falta: joga de novo. Em dupla, os dois de cada time se revezam.</p>`;
    panel.appendChild(rules);
    drawTable();

    // relógio da vez (só depois que as bolas param)
    const tick = () => {
      const s = states.get(focusId);
      if (!s || s.phase !== 'playing' || !s.deadline || animating(s)) { timer.textContent = ''; } else {
        const left = Math.max(0, Math.ceil((s.deadline - now()) / 1000));
        timer.textContent = `${left}s`;
        timer.classList.toggle('is-low', left <= 10);
      }
      if (open) tickRaf = requestAnimationFrame(tick);
    };
    tick();
    // terminou a animação: mostra o resultado/vez certos
    if (anim && st.shot) renderTimer = setTimeout(() => { if (open) render(); }, Math.max(50, st.shot.endsAt - now() + 60));
  }

  function setOpen(v) {
    open = !!v;
    if (open && !focusId) focusId = mySeatTable() || nearestTable();
    panel.hidden = !open;
    if (open) { render(); kick(); } else { clearTimeout(renderTimer); cancelAnimationFrame(tickRaf); drag = null; }
    world.onPanelChange();
  }

  // ---------- interface pro mundo ----------
  function setState(next) {
    const prev = states.get(next.table);
    states.set(next.table, next);
    const tb = tables.get(next.table);
    if (tb) {
      const sh = next.shot;
      if (sh && sh.frames && sh.seq !== tb.playedSeq && now() < sh.endsAt) {
        tb.playedSeq = sh.seq;
        if (!tb.cur.size) snap(tb, { balls: sh.start });
        tb.play = expand(sh);
      } else if (!tb.play) {
        if (sh) tb.playedSeq = Math.max(tb.playedSeq, sh.seq);
        snap(tb, next);
      }
    }
    const inGame = next.phase === 'playing' && !!next.you.team;
    const iSitHere = next.seated.some((s) => s.userId === me());
    const satNow = iSitHere && !(prev && prev.seated.some((s) => s.userId === me()));
    const startedNow = inGame && !(prev && prev.phase === 'playing' && prev.round === next.round);
    const myTurnNow = inGame && next.shooter === me() && !(prev && prev.shooter === me() && prev.phase === 'playing');
    const penaltyMine = inGame && next.stage === 'penalty' && next.penalty.team === next.you.team;
    if (iSitHere || inGame) focusId = next.table;
    // começou a minha vez: a mira começa apontando pro meio da mesa
    if (myTurnNow) { const c = tb && tb.cur.get(0); if (c && Math.hypot(c.x, c.z) > 0.05) aim.angle = Math.atan2(-c.z, -c.x); }
    if (!open && (satNow || startedNow || myTurnNow || penaltyMine)) setOpen(true);
    else if (open && next.table === focusId) render();
    kick();
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
    cancelAnimationFrame(raf);
    cancelAnimationFrame(tickRaf);
    clearTimeout(renderTimer);
    panel.remove();
    for (const tb of tables.values()) {
      scene.remove(tb.group);
      for (const o of [tb.aimLine, tb.objLine]) o.geometry.dispose();
      tb.cue.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    ballGeo.dispose();
    ghostGeo.dispose();
    for (const m of ballMats.values()) { m.map.dispose(); m.dispose(); }
    for (const m of [cueMat, cueDark, cueTip, aimMat, aimObjMat, ghostMat]) m.dispose();
  }

  return { setState, setOpen, toggle, isOpen: () => open, isActive, onMySeat, destroy };
}
