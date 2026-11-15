// Sinuca "par x ímpar" nas mesas de sinuca do mundinho (docs/MUNDINHO.md, public/world/games/pool.js).
//
// Regras (combinadas com o dono do projeto):
// - 1x1 ou 2x2. Os times saem das banquetas: as duas primeiras da mesa (`def.seats`) são o time A
//   (da esquerda), as duas últimas o time B (da direita). Começa quando todo mundo sentado está
//   "pronto" e os times têm o mesmo tamanho (1 contra 1 ou 2 contra 2). Em dupla, os parceiros se revezam.
// - 15 bolas numeradas + a branca. Ímpares: 3 5 7 9 11 13 15. Pares: 2 4 6 8 10 12 14. A bola 1 é a
//   FINAL: só pode ser encaçapada depois que o time derrubou todas as dele; quem encaçapa a 1 certo
//   ganha. Derrubar a 1 antes da hora (ou cometendo falta) perde. Na saída, a 1 volta pra mesa.
// - MESA ABERTA: ninguém começa sendo par ou ímpar. O primeiro time que derrubar uma bolinha (saída
//   inclusive, e mesmo numa tacada com falta) fica com o grupo dela — par ou ímpar — e o outro time
//   com o outro. Se caírem várias na mesma tacada, vale a primeira que caiu. Com a mesa aberta,
//   qualquer bola pode ser acertada primeiro (menos a 1).
// - Falta: errar todas as bolas, acertar primeiro uma bola do outro grupo, acertar primeiro a 1 antes
//   da hora (ou outra bola quando já é a vez da 1), encaçapar a branca ou estourar o tempo.
//   Punição: cai (sai da mesa) a bola de MENOR número do grupo do outro time, e ele ganha a vez.
//   A punição nunca derruba a bola 1 e nunca derruba a última bolinha do time (essa tem que ser
//   encaçapada jogando) — ver PENALTY_SPARES_LAST. Sem grupo definido (mesa aberta quando a falta
//   aconteceu) não tem punição: a falta só passa a vez.
// - Encaçapou bola sua sem falta = joga de novo. Bola do outro grupo que cair fica caída (é dele).
//   Na saída, encaçapar qualquer bola (menos a branca) também dá direito de jogar de novo.
//
// A física é do servidor: a tacada (ângulo + força) chega aqui, a mesa é simulada até as bolas
// pararem e todo mundo recebe os quadros (posições a cada 1/30 s) pra animar igual. Ninguém pode
// "ver diferente" nem trapacear mexendo no cliente.

// ---------- mesa (metros; x = comprimento, z = largura; centro da mesa = 0,0) ----------
const L = 2.24;
const W = 1.12;
const HX = L / 2;
const HZ = W / 2;
const R = 0.0275;                // raio da bola (55 mm)
const CORNER_GAP = 0.09;         // tabela que falta perto de cada caçapa do canto (boca)
const MID_GAP = 0.068;           // meia-boca da caçapa do meio
const JAW_R = 0.006;             // quina da tabela na boca da caçapa
const POCKETS = [
  { x: -HX - 0.015, z: -HZ - 0.015, r: 0.062 },
  { x: 0, z: -HZ - 0.036, r: 0.06 },
  { x: HX + 0.015, z: -HZ - 0.015, r: 0.062 },
  { x: -HX - 0.015, z: HZ + 0.015, r: 0.062 },
  { x: 0, z: HZ + 0.036, r: 0.06 },
  { x: HX + 0.015, z: HZ + 0.015, r: 0.062 },
];
// tabelas: trechos retos entre as caçapas (o "nariz" da borracha fica na linha da mesa)
const CUSHIONS = [];
for (const s of [-1, 1]) {
  CUSHIONS.push({ axis: 'z', at: s * HZ, s, from: -HX + CORNER_GAP, to: -MID_GAP });
  CUSHIONS.push({ axis: 'z', at: s * HZ, s, from: MID_GAP, to: HX - CORNER_GAP });
  CUSHIONS.push({ axis: 'x', at: s * HX, s, from: -HZ + CORNER_GAP, to: HZ - CORNER_GAP });
}
// quinas das bocas (um pouquinho pra fora da linha: bola correndo rente à tabela passa pela boca do meio)
const JAWS = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    JAWS.push({ x: sx * (HX - CORNER_GAP), z: sz * (HZ + 0.008) });
    JAWS.push({ x: sx * (HX + 0.008), z: sz * (HZ - CORNER_GAP) });
    JAWS.push({ x: sx * MID_GAP, z: sz * (HZ + 0.008) });
  }
}
const HEAD = { x: -HX / 2, z: 0 };  // marca da branca (cabeceira)
const FOOT = { x: HX / 2, z: 0 };   // ponta do triângulo

// ---------- física ----------
const MAX_SPEED = 9;            // m/s com força 100% (saída forte de bar)
const MIN_POWER = 0.02;
const STEP = 1 / 600;           // passo da simulação
const FRAME_STEPS = 20;         // um quadro a cada 20 passos = 30 quadros/s
const FRAME_MS = 1000 * STEP * FRAME_STEPS;
const MAX_STEPS = 600 * 25;     // nenhuma tacada passa de 25 s
const ROLL_DECEL = 0.28;        // atrito de rolamento (m/s²) — pano rápido de bar
const DRAG = 0.1;               // perda proporcional à velocidade
const BALL_E = 0.95;            // bola com bola
const CUSHION_E = 0.72;         // bola na tabela
const JAW_E = 0.55;
const STOP_SPEED = 0.004;

// ---------- tempos ----------
const AIM_MS = 45000;           // tempo pra tacar
const CUE_MS = 450;             // animação do taco antes das bolas andarem
const PENALTY_SPARES_LAST = true; // punição não derruba a última bolinha do time

const ODD = [3, 5, 7, 9, 11, 13, 15];
const EVEN = [2, 4, 6, 8, 10, 12, 14];
const GROUPS = { impar: ODD, par: EVEN };
const GROUP_NAME = { impar: 'ímpar', par: 'par' };
// grupo (par/ímpar) de uma bola; times são 'a' (banquetas da esquerda) e 'b' (da direita)
const teamOfBall = (id) => (id >= 2 ? (id % 2 ? 'impar' : 'par') : null);
const groupOfBall = teamOfBall;
const otherGroup = (gr) => (gr === 'impar' ? 'par' : 'impar');
const other = (team) => (team === 'a' ? 'b' : 'a');
const round3 = (v) => Math.round(v * 1000) / 1000;

// triângulo: a 1 no meio, o resto embaralhado, os dois cantos de trás de times diferentes
function rack(random = Math.random) {
  const spots = [];
  const dx = 2 * R * Math.cos(Math.PI / 6) + 0.0004;
  for (let row = 0; row < 5; row++) {
    // folguinhas aleatórias de ~1 mm (triângulo de bar nunca fica perfeito): sem isso a tacada passa
    // em fila pelas bolas alinhadas, igual pêndulo de Newton, e o triângulo quase não abre
    for (let j = 0; j <= row; j++) {
      spots.push({ x: FOOT.x + row * dx + random() * 0.0012, z: (j - row / 2) * (2 * R + 0.0004) + (random() - 0.5) * 0.0012, row, j });
    }
  }
  const rest = [...ODD, ...EVEN];
  for (let i = rest.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    [rest[i], rest[k]] = [rest[k], rest[i]];
  }
  const balls = new Map();
  balls.set(0, { x: HEAD.x, z: HEAD.z });
  let n = 0;
  const order = [];
  for (const s of spots) {
    if (s.row === 2 && s.j === 1) { balls.set(1, { x: s.x, z: s.z }); continue; }
    const id = rest[n++];
    order.push({ id, s });
    balls.set(id, { x: s.x, z: s.z });
  }
  // cantos de trás (fileira 5, pontas) com paridades diferentes
  const back = order.filter((o) => o.s.row === 4 && (o.s.j === 0 || o.s.j === 4));
  if (back.length === 2 && teamOfBall(back[0].id) === teamOfBall(back[1].id)) {
    const swap = order.find((o) => o.s.row !== 4 && teamOfBall(o.id) !== teamOfBall(back[1].id));
    if (swap) {
      balls.set(swap.id, { x: back[1].s.x, z: back[1].s.z });
      balls.set(back[1].id, { x: swap.s.x, z: swap.s.z });
    }
  }
  return balls;
}
const IDLE_RACK = (() => { let s = 7; return rack(() => { s = (s * 16807) % 2147483647; return s / 2147483647; }); })();

// lugar livre mais perto de (x, z) andando pro lado da cabeceira/pé (pra devolver a branca e a 1)
function freeSpot(balls, x, z, dir = -1) {
  for (let i = 0; i < 200; i++) {
    const px = x + dir * i * 0.01;
    if (Math.abs(px) > HX - R) break;
    let ok = true;
    for (const b of balls.values()) if (Math.hypot(b.x - px, b.z - z) < 2 * R + 0.002) { ok = false; break; }
    if (ok) return { x: px, z };
  }
  for (let i = 1; i < 200; i++) { // sem lugar na linha: procura em volta
    for (const [ox, oz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const px = x + ox * i * 0.01;
      const pz = z + oz * i * 0.01;
      if (Math.abs(px) > HX - R || Math.abs(pz) > HZ - R) continue;
      let ok = true;
      for (const b of balls.values()) if (Math.hypot(b.x - px, b.z - pz) < 2 * R + 0.002) { ok = false; break; }
      if (ok) return { x: px, z: pz };
    }
  }
  return { x, z };
}

// Simula uma tacada. `balls`: Map id -> {x, z} (só as que estão na mesa; 0 = branca).
// Devolve { final, pocketed: [{id, f, pocket}], first, frames, cushionFirst }.
// frames[k] = [id, xmm, zmm, ...] só das bolas que mudaram desde o quadro anterior (o 0 tem todas).
function simulate(balls, angle, power) {
  const p = Math.min(1, Math.max(MIN_POWER, power));
  // curva: o começo da barra de força é bem fininho (tacada de encostar), o fim é a saída
  const speed = MAX_SPEED * Math.pow(p, 1.5);
  const list = [...balls.entries()].map(([id, b]) => ({ id, x: b.x, z: b.z, vx: 0, vz: 0, on: true }));
  const cue = list.find((b) => b.id === 0);
  cue.vx = Math.cos(angle) * speed;
  cue.vz = Math.sin(angle) * speed;
  let first = null;
  const pocketed = [];
  const frames = [];
  const lastMm = new Map();
  const record = (f, all) => {
    const fr = [];
    for (const b of list) {
      if (!b.on) continue;
      const mx = Math.round(b.x * 1000);
      const mz = Math.round(b.z * 1000);
      const prev = lastMm.get(b.id);
      if (all || !prev || prev[0] !== mx || prev[1] !== mz) {
        fr.push(b.id, mx, mz);
        lastMm.set(b.id, [mx, mz]);
      }
    }
    frames[f] = fr;
  };
  record(0, true);

  // passo adaptativo: rápido = passos menores (nada anda mais que ~1/8 do raio por passo, senão o
  // triângulo da saída "engole" a tacada); os contatos encostados são resolvidos em várias passadas
  let step = 0;
  for (; step < MAX_STEPS; step++) {
    let vmax = 0;
    for (const b of list) if (b.on) vmax = Math.max(vmax, Math.abs(b.vx), Math.abs(b.vz));
    if (vmax === 0) break;
    const sub = Math.min(16, Math.max(1, Math.ceil((vmax * STEP) / (R / 8))));
    const dt = STEP / sub;
    for (let k = 0; k < sub; k++) {
      for (const b of list) {
        if (!b.on || (b.vx === 0 && b.vz === 0)) continue;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
      }
      for (let pass = 0; pass < 3; pass++) {
        let hit = false;
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (!a.on) continue;
          for (let j = i + 1; j < list.length; j++) {
            const c = list[j];
            if (!c.on) continue;
            const dx = c.x - a.x;
            const dz = c.z - a.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= 4 * R * R) continue;
            const d = Math.sqrt(d2) || 1e-9;
            const nx = dx / d;
            const nz = dz / d;
            const vrel = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz;
            if (vrel > 0) {
              const jn = ((1 + BALL_E) / 2) * vrel;
              a.vx -= jn * nx; a.vz -= jn * nz;
              c.vx += jn * nx; c.vz += jn * nz;
              if (first === null && (a.id === 0 || c.id === 0)) first = a.id === 0 ? c.id : a.id;
              hit = true;
            }
            const push = (2 * R - d) / 2 + 1e-7;
            a.x -= nx * push; a.z -= nz * push;
            c.x += nx * push; c.z += nz * push;
          }
        }
        if (!hit) break;
      }
    }
    for (const b of list) {
      if (!b.on) continue;
      // tabelas
      for (const c of CUSHIONS) {
        if (c.axis === 'z') {
          if (b.x < c.from || b.x > c.to) continue;
          if (c.s * (b.z - c.at) > -R) {
            b.z = c.at - c.s * R;
            if (c.s * b.vz > 0) { b.vz = -b.vz * CUSHION_E; b.vx *= 0.97; }
          }
        } else {
          if (b.z < c.from || b.z > c.to) continue;
          if (c.s * (b.x - c.at) > -R) {
            b.x = c.at - c.s * R;
            if (c.s * b.vx > 0) { b.vx = -b.vx * CUSHION_E; b.vz *= 0.97; }
          }
        }
      }
      // quinas das bocas
      for (const j of JAWS) {
        const dx = b.x - j.x;
        const dz = b.z - j.z;
        const d = Math.hypot(dx, dz);
        if (d >= R + JAW_R || d === 0) continue;
        const nx = dx / d;
        const nz = dz / d;
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= (1 + JAW_E) * vn * nx; b.vz -= (1 + JAW_E) * vn * nz; }
        b.x = j.x + nx * (R + JAW_R);
        b.z = j.z + nz * (R + JAW_R);
      }
      // caçapas
      let pk = POCKETS.findIndex((pp) => Math.hypot(b.x - pp.x, b.z - pp.z) < pp.r);
      if (pk < 0 && (Math.abs(b.x) > HX + 0.08 || Math.abs(b.z) > HZ + 0.08)) {
        let best = Infinity;
        POCKETS.forEach((pp, k) => { const d = Math.hypot(b.x - pp.x, b.z - pp.z); if (d < best) { best = d; pk = k; } });
      }
      if (pk >= 0) {
        b.on = false;
        b.vx = b.vz = 0;
        pocketed.push({ id: b.id, f: Math.floor(step / FRAME_STEPS) + 1, pocket: pk });
        continue;
      }
      // atrito
      const s = Math.hypot(b.vx, b.vz);
      if (s > 0) {
        const ns = s - (ROLL_DECEL + DRAG * s) * STEP;
        if (ns <= STOP_SPEED) { b.vx = 0; b.vz = 0; } else { b.vx *= ns / s; b.vz *= ns / s; }
      }
    }
    if ((step + 1) % FRAME_STEPS === 0) record((step + 1) / FRAME_STEPS, false);
  }
  const lastF = Math.ceil(step / FRAME_STEPS);
  if (!frames[lastF]) record(lastF, false);
  for (let f = 0; f < frames.length; f++) if (!frames[f]) frames[f] = [];
  const final = new Map();
  for (const b of list) if (b.on) final.set(b.id, { x: b.x, z: b.z });
  return { final, pocketed, first, frames };
}

function createPool({
  onChange,
  now = Date.now,
  random = Math.random,
  setTimer = (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
  clearTimer = (t) => clearTimeout(t),
  aimMs = AIM_MS,
  simulateFn = simulate, // os testes trocam por um resultado combinado
} = {}) {
  const tables = new Map();
  const key = (channelId, tableId) => `${channelId}:${tableId}`;
  function getTable(channelId, def, create) {
    const k = key(channelId, def.id);
    if (!tables.has(k) && create) {
      tables.set(k, { channelId, def, seated: new Map(), ready: new Set(), phase: 'waiting', game: null, round: 0, log: null, timer: null });
    }
    return tables.get(k) || null;
  }
  function changed(t) { if (onChange) onChange(t.channelId, t.def.id); }
  const teamOfSeat = (def, seat) => {
    const i = def.seats.indexOf(seat);
    return i < 0 ? null : i < def.seats.length / 2 ? 'a' : 'b';
  };
  function lobbyTeams(t) {
    const out = { a: [], b: [] };
    const idx = (uid) => t.def.seats.indexOf(t.seated.get(uid).seat);
    for (const uid of [...t.seated.keys()].sort((a, b) => idx(a) - idx(b))) {
      const team = teamOfSeat(t.def, t.seated.get(uid).seat);
      if (team) out[team].push(uid);
    }
    return out;
  }
  const teamOfUser = (g, uid) => (g.teams.a.includes(uid) ? 'a' : g.teams.b.includes(uid) ? 'b' : null);
  // bolas do grupo do time que ainda estão na mesa (null = mesa aberta, o time ainda não tem grupo)
  const groupLeft = (g, balls, team) => (g.group[team] ? GROUPS[g.group[team]].filter((id) => balls.has(id)) : null);

  function disarm(t) { if (t.timer) clearTimer(t.timer); t.timer = null; }
  function arm(t, at) {
    disarm(t);
    t.timer = setTimer(() => { t.timer = null; onTimeout(t); }, Math.max(0, at - now()) + 20);
  }

  function nextShooter(g, team) {
    const list = g.teams[team];
    const uid = list[g.rot[team] % list.length];
    g.rot[team]++;
    return uid;
  }

  function startGame(t) {
    const teams = lobbyTeams(t);
    t.round++;
    const breaker = t.round % 2 ? 'a' : 'b';
    const g = {
      teams, group: { a: null, b: null }, rot: { a: 0, b: 0 }, turnTeam: breaker, shooter: null, balls: rack(random), down: [],
      stage: 'aim', deadline: 0, shot: null, seq: 0, last: null, penalty: null, isBreak: true, result: null,
    };
    g.shooter = nextShooter(g, breaker);
    g.deadline = now() + aimMs;
    t.game = g;
    t.phase = 'playing';
    t.ready.clear();
    t.log = { type: 'start', team: breaker, userId: g.shooter };
    arm(t, g.deadline);
  }

  function maybeStart(t) {
    if (t.phase === 'playing') return;
    const teams = lobbyTeams(t);
    if (!teams.a.length || teams.a.length !== teams.b.length) return;
    for (const uid of t.seated.keys()) if (!t.ready.has(uid)) return;
    startGame(t);
  }

  function finish(t, winner, reason) {
    const g = t.game;
    disarm(t);
    g.result = { winner, reason };
    g.stage = 'over';
    g.penalty = null;
    t.phase = 'over';
    t.ready.clear();
    t.log = { type: 'end', winner, reason };
  }

  // depois da falta: o outro time ganha a vez e cai a bola de menor número do grupo dele (se o grupo
  // já estava definido quando a falta aconteceu e não for a última bolinha dele)
  function passTurnWithPenalty(t, foulTeam, from, withPenalty) {
    const g = t.game;
    const ben = other(foulTeam);
    g.turnTeam = ben;
    g.shooter = nextShooter(g, ben);
    const options = withPenalty ? groupLeft(g, g.balls, ben) || [] : [];
    const canRemove = PENALTY_SPARES_LAST ? options.length >= 2 : options.length >= 1;
    if (canRemove) {
      const id = Math.min(...options);
      g.balls.delete(id);
      g.down.push({ id, by: 'punicao' });
      if (g.last) g.last.penaltyBall = id;
    }
    g.stage = 'aim';
    g.penalty = null;
    g.deadline = from + aimMs;
    arm(t, g.deadline);
    return canRemove;
  }

  // aplica as regras ao resultado da simulação (exportado pra teste via _resolve)
  function resolve(t, uid, sim, endsAt) {
    const g = t.game;
    const team = g.turnTeam;
    const opp = other(team);
    const before = g.balls;
    const open = !g.group[team];
    const mine = groupLeft(g, before, team);
    const onFinal = !open && mine.length === 0;
    // pela ordem em que caíram (a primeira que cai decide o grupo com a mesa aberta)
    const ids = [...sim.pocketed].sort((x, y) => x.f - y.f).map((p) => p.id);
    const cueIn = ids.includes(0);
    const oneIn = ids.includes(1);
    let foul = null;
    if (cueIn) foul = 'branca';
    else if (sim.first == null) foul = 'nada';
    else if (!g.isBreak) {
      if (onFinal) { if (sim.first !== 1) foul = 'nao-1'; } else if (sim.first === 1) foul = 'bola-1';
      else if (!open && groupOfBall(sim.first) !== g.group[team]) foul = 'adversaria';
    }
    g.balls = sim.final;
    for (const id of ids) if (id !== 0) g.down.push({ id, by: 'tacada' });
    if (cueIn) g.balls.set(0, freeSpot(g.balls, HEAD.x, HEAD.z, -1));
    const last = { seq: g.seq, team, userId: uid, foul, first: sim.first, pocketed: ids, penaltyBall: null, cont: false, wasBreak: g.isBreak, assigned: null, wasGroup: !open };
    g.last = last;

    if (oneIn) {
      if (g.isBreak) {
        g.down = g.down.filter((d) => d.id !== 1);
        g.balls.set(1, freeSpot(g.balls, FOOT.x, FOOT.z, 1));
      } else if (onFinal && !foul) {
        g.isBreak = false;
        finish(t, team, 'bola-1');
        return;
      } else {
        g.isBreak = false;
        finish(t, opp, onFinal ? 'bola-1-falta' : 'bola-1-cedo');
        return;
      }
    }
    // mesa aberta: a primeira bolinha que caiu decide quem é par e quem é ímpar (mesmo com falta)
    if (open) {
      const firstDown = ids.find((id) => id > 1);
      if (firstDown) {
        g.group[team] = groupOfBall(firstDown);
        g.group[opp] = otherGroup(g.group[team]);
        last.assigned = g.group[team];
      }
    }
    const ownIn = g.group[team] ? ids.filter((id) => groupOfBall(id) === g.group[team]) : [];
    const cont = !foul && (g.isBreak ? ids.some((id) => id > 1) : ownIn.length > 0);
    g.isBreak = false;
    last.cont = cont;
    if (cont) {
      g.stage = 'aim';
      g.deadline = endsAt + aimMs;
      arm(t, g.deadline);
    } else if (foul) {
      passTurnWithPenalty(t, team, endsAt, !open); // grupo ainda não definido na hora da falta: sem punição
    } else {
      g.turnTeam = opp;
      g.shooter = nextShooter(g, opp);
      g.stage = 'aim';
      g.deadline = endsAt + aimMs;
      arm(t, g.deadline);
    }
  }

  function shoot(t, uid, msg) {
    const g = t.game;
    if (t.phase !== 'playing' || !g) return { error: 'não tem partida em andamento' };
    if (uid !== g.shooter) return { error: 'não é a sua vez' };
    if (g.shot && now() < g.shot.endsAt - 150) return { error: 'espere as bolas pararem' };
    const angle = Number(msg.angle);
    const power = Number(msg.power);
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return { error: 'tacada inválida' };
    const start = [...g.balls.entries()].map(([id, b]) => [id, round3(b.x), round3(b.z)]);
    const sim = simulateFn(g.balls, angle, Math.min(1, Math.max(MIN_POWER, power)));
    g.seq++;
    const startAt = now() + CUE_MS;
    const endsAt = startAt + sim.frames.length * FRAME_MS + 250;
    g.shot = {
      seq: g.seq, userId: uid, team: g.turnTeam, angle: round3(angle), power: round3(power), startAt, endsAt,
      frameMs: FRAME_MS, start, frames: sim.frames, pocketed: sim.pocketed,
    };
    resolve(t, uid, sim, endsAt);
    t.log = { type: 'shot', seq: g.seq };
    changed(t);
    return {};
  }

  function onTimeout(t) {
    const g = t.game;
    if (t.phase !== 'playing' || !g) return;
    if (now() < g.deadline - 50) { arm(t, g.deadline); return; }
    const team = g.turnTeam;
    g.last = { seq: g.seq, team, userId: g.shooter, foul: 'tempo', first: null, pocketed: [], penaltyBall: null, cont: false, wasBreak: g.isBreak, assigned: null, wasGroup: !!g.group[team] };
    g.isBreak = false;
    passTurnWithPenalty(t, team, now(), !!g.group[team]);
    t.log = { type: 'timeout', team };
    changed(t);
  }

  // ---------- pedidos ----------
  // msg.op: ready (on) | shoot (angle, power) | resign
  function handle(channelId, def, uid, msg) {
    const t = getTable(channelId, def, true);
    const op = msg && msg.op;
    if (op === 'ready') {
      if (!t.seated.has(uid)) return { error: 'sente numa banqueta da sinuca pra jogar' };
      if (t.phase === 'playing') return {};
      if (msg.on === false) t.ready.delete(uid); else t.ready.add(uid);
      maybeStart(t);
      changed(t);
      return {};
    }
    if (op === 'shoot') return shoot(t, uid, msg);
    if (op === 'resign') {
      const g = t.game;
      if (t.phase !== 'playing' || !g) return { error: 'não tem partida em andamento' };
      const team = teamOfUser(g, uid);
      if (!team) return { error: 'você não está jogando' };
      finish(t, other(team), 'desistencia');
      changed(t);
      return {};
    }
    return { error: 'jogada inválida' };
  }

  // levantar não tira ninguém da partida (dá pra andar em volta da mesa); só sair da call tira
  function onSeat(channelId, uid, def, seatId, prevDef) {
    if (prevDef && (!def || prevDef.id !== def.id)) {
      const t = getTable(channelId, prevDef, false);
      if (t && t.seated.delete(uid)) { t.ready.delete(uid); changed(t); }
    }
    if (def) {
      const t = getTable(channelId, def, true);
      const prev = t.seated.get(uid);
      if (prev && prev.seat !== seatId) t.ready.delete(uid); // trocou de banqueta (pode ter trocado de time)
      t.seated.set(uid, { seat: seatId });
      changed(t);
    }
  }

  function leaveGame(t, uid) {
    let touched = t.seated.delete(uid);
    t.ready.delete(uid);
    const g = t.game;
    if (t.phase !== 'playing' || !g) return touched;
    const team = teamOfUser(g, uid);
    if (!team) return touched;
    g.teams[team] = g.teams[team].filter((x) => x !== uid);
    if (!g.teams[team].length) { finish(t, other(team), 'abandono'); return true; }
    if (g.shooter === uid) {
      g.shooter = nextShooter(g, team);
      if (g.stage === 'aim') { g.deadline = Math.max(now(), g.shot ? g.shot.endsAt : 0) + aimMs; arm(t, g.deadline); }
    }
    t.log = { type: 'left', userId: uid };
    return true;
  }
  function onLeaveCall(channelId, uid) {
    for (const t of tables.values()) if (t.channelId === channelId && leaveGame(t, uid)) changed(t);
  }
  function clearChannel(channelId) {
    for (const [k, t] of tables) {
      if (t.channelId !== channelId) continue;
      disarm(t);
      tables.delete(k);
    }
  }

  // ---------- o que cada um vê (tudo é aberto) ----------
  const ballList = (balls) => [...balls.entries()].map(([id, b]) => [id, round3(b.x), round3(b.z)]);
  function viewFor(channelId, def, viewerId) {
    const t = getTable(channelId, def, false);
    const base = { game: 'pool', table: def.id, groups: GROUPS, spareLast: PENALTY_SPARES_LAST };
    const g0 = t && t.game;
    const seatedList = t ? [...t.seated.entries()].map(([userId, s]) => ({ userId, seat: s.seat, team: teamOfSeat(def, s.seat) })) : [];
    const g = t && t.game;
    const nowMs = now();
    const shot = g && g.shot
      ? (nowMs < g.shot.endsAt + 2000 ? g.shot : { seq: g.shot.seq, userId: g.shot.userId, team: g.shot.team, startAt: g.shot.startAt, endsAt: g.shot.endsAt })
      : null;
    return {
      ...base,
      phase: t ? t.phase : 'waiting',
      round: t ? t.round : 0,
      seated: seatedList,
      ready: t ? [...t.ready] : [],
      teams: g ? g.teams : t ? lobbyTeams(t) : { a: [], b: [] },
      group: g0 ? g0.group : { a: null, b: null },
      balls: ballList(g ? g.balls : IDLE_RACK),
      down: g ? g.down : [],
      turnTeam: g ? g.turnTeam : null,
      shooter: g && t.phase === 'playing' ? g.shooter : null,
      stage: g ? g.stage : null,
      deadline: g && t.phase === 'playing' ? g.deadline : null,
      penalty: g && g.penalty ? g.penalty : null,
      isBreak: g ? g.isBreak : false,
      shot,
      last: g ? g.last : null,
      result: g ? g.result : null,
      log: t ? t.log : null,
      you: { team: g && t.phase === 'playing' ? teamOfUser(g, viewerId) : (t && t.seated.has(viewerId) ? teamOfSeat(def, t.seated.get(viewerId).seat) : null) },
    };
  }

  return { handle, onSeat, onLeaveCall, clearChannel, viewFor, _tables: tables };
}

module.exports = {
  createPool, simulate, rack, freeSpot, teamOfBall,
  TABLE: { L, W, HX, HZ, R, CORNER_GAP, MID_GAP, POCKETS, HEAD, FOOT },
  GROUPS, GROUP_NAME, FRAME_MS, AIM_MS, PENALTY_SPARES_LAST,
};
