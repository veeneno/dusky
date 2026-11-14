// mundinho 3D (docs/MUNDINHO.md) — o renderizador. Este módulo SÓ é baixado quando a pessoa abre
// uma call-mundo (import() em public/js/app/27-world.js), junto com o Three.js de public/vendor/.
//
// createWorld(container, api) monta a cena e devolve:
//   setParticipants(list)  quem está na call (id, user, muted, deafened, isSelf)
//   applyRemote(id, st)    posição/ação nova de alguém (chega do servidor)
//   applySelf(st, snap)    meu estado (início da call, ou correção do servidor)
//   removePerson(id)       alguém saiu
//   setTv(tv, serverNow)   estado da TV (desligada, tela de alguém, YouTube)
//   screensChanged()       alguém começou/parou de compartilhar a tela
//   setVisible(bool)       a tela da call está aparecendo? (escondido = não desenha nada)
//   destroy()              desmonta tudo e devolve a memória da placa de vídeo
//
// Convenções: ry = 0 olha pro +z, a frente de quem tem ry é (sin ry, cos ry). Estado de cada boneco:
// { x, y, z, ry, action, seat } — y é a altura do PISO onde ele está (andar de baixo 0, mezanino 3.6).
import * as THREE from '/vendor/three/0.170.0/three.module.min.js';
import { createAvatar, AVATAR_HEAD_TOP } from './avatar.js?v=7';
import { buildRoom, buildProps } from './props.js?v=8';
import { createTv } from './tv.js?v=7';

const WALK_SPEED = 3.0;
const RUN_SPEED = 5.4;
const BODY_RADIUS = 0.28;
const STEP_UP = 0.6;        // diferença máxima de altura entre um passo e outro (degrau)
const WAVE_MS = 2600;
const CAM_MIN = 2.6;
const CAM_MAX = 14;
const EYE_STANDING = 1.28;
const EYE_SITTING = 0.98;
const CAMERA_PREF_KEY = 'dusky:worldCamera';
const HINT_PREF_KEY = 'dusky:worldHintSeen';
const CROSSHAIR_PREF_KEY = 'dusky:worldCrosshair';
const ASSET_V = 8; // módulos carregados sob demanda (jogos, piano) — sobe junto com os imports acima

function lerpAngle(a, b, k) {
  const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * k;
}
function initialsOf(name) { return String(name || '?').trim().slice(0, 2).toUpperCase(); }
function pref(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (_) { return fallback; } }
function savePref(key, v) { try { localStorage.setItem(key, v); } catch (_) { /* ok */ } }

export function createWorld(container, api) {
  const sceneDef = api.scene;
  const B = sceneDef.bounds;
  const surfaces = sceneDef.surfaces || [{ minX: -1e9, maxX: 1e9, minZ: -1e9, maxZ: 1e9, y: 0 }];

  // ---------- three.js ----------
  // alpha: o furo da TV deixa ver o vídeo que fica atrás do canvas (ver tv.js)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.className = 'world-canvas';
  renderer.domElement.tabIndex = 0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 900);
  scene.add(camera); // as cartas da mão (Duno) são filhas da câmera: ela precisa estar na cena

  const room = buildRoom(sceneDef);
  const props = buildProps(sceneDef);
  scene.add(room.ground, props.ground);
  // tudo do mezanino num grupo só: na 3ª pessoa, estando embaixo dele, some pra não tampar a vista
  const upperGroup = new THREE.Group();
  upperGroup.add(room.upper, props.upper);
  scene.add(upperGroup);

  // sombra "de mentira" embaixo de cada boneco (bem mais leve que sombra de verdade)
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.42)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const blobGeo = new THREE.PlaneGeometry(0.85, 0.85);

  // ---------- assentos clicáveis ----------
  const seatHits = [];
  const seatHitGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
  const seatHitMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const seat of sceneDef.seats) {
    const hit = new THREE.Mesh(seatHitGeo, seatHitMat);
    hit.position.set(seat.x, (seat.floor || 0) + 0.45, seat.z);
    hit.userData.seat = seat;
    scene.add(hit);
    seatHits.push(hit);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 40), new THREE.MeshBasicMaterial({ color: 0x8ee6b4, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const targetMarker = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.17, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
  targetMarker.rotation.x = -Math.PI / 2;
  targetMarker.visible = false;
  scene.add(targetMarker);

  // ---------- TV ----------
  const tv = sceneDef.tv ? createTv({ scene, camera, container, def: sceneDef.tv, api }) : null;

  // ---------- etiquetas de nome (balõezinhos HTML por cima do canvas) ----------
  const labels = document.createElement('div');
  labels.className = 'world-labels';
  container.appendChild(labels);

  // ---------- HUD: dock redondinho ----------
  const hud = document.createElement('div');
  hud.className = 'world-dock';
  hud.innerHTML = `
    <button type="button" class="world-dock-btn" data-act="wave"><span class="world-dock-emoji">👋</span><span class="world-dock-label">acenar</span></button>
    <button type="button" class="world-dock-btn" data-act="dance"><span class="world-dock-emoji">💃</span><span class="world-dock-label">dançar</span></button>
    <button type="button" class="world-dock-btn" data-act="stand" hidden><span class="world-dock-emoji">🧍</span><span class="world-dock-label">levantar</span></button>
    <span class="world-dock-sep"></span>
    <button type="button" class="world-dock-btn" data-act="camera"><span class="world-dock-emoji">🎥</span><span class="world-dock-label">3ª pessoa</span></button>
    <button type="button" class="world-dock-btn" data-act="crosshair" hidden><span class="world-dock-emoji">🎯</span><span class="world-dock-label">mira</span></button>
    <button type="button" class="world-dock-btn" data-act="duno" hidden><span class="world-dock-emoji">🃏</span><span class="world-dock-label">Duno</span></button>
    <button type="button" class="world-dock-btn" data-act="blackjack" hidden><span class="world-dock-emoji">♠️</span><span class="world-dock-label">21</span></button>
    <button type="button" class="world-dock-btn" data-act="chess" hidden><span class="world-dock-emoji">♟️</span><span class="world-dock-label">xadrez</span></button>
    ${tv ? '<button type="button" class="world-dock-btn" data-act="tv"><span class="world-dock-emoji">📺</span><span class="world-dock-label">TV</span></button>' : ''}
    <button type="button" class="world-dock-btn" data-act="fullscreen"><span class="world-dock-emoji world-dock-glyph">⛶</span><span class="world-dock-label">tela cheia</span></button>`;
  container.appendChild(hud);
  const hint = document.createElement('div');
  hint.className = 'world-hint';
  hint.innerHTML = `
    <span><b>WASD</b> anda · <b>shift</b> corre · clique no chão ou num assento · arraste pra olhar · <b>V</b> 1ª/3ª pessoa · <b>C</b> mira · <b>G</b> Duno · <b>B</b> 21 · <b>K</b> xadrez · <b>F</b> tela cheia</span>
    <button type="button" aria-label="fechar dica">✕</button>`;
  hint.hidden = pref(HINT_PREF_KEY, '') === '1';
  hint.querySelector('button').addEventListener('click', () => { hint.hidden = true; savePref(HINT_PREF_KEY, '1'); });
  container.appendChild(hint);
  // 1ª pessoa: mira no meio da tela (liga/desliga) e o aviso "clique pra olhar com o mouse"
  const crosshair = document.createElement('div');
  crosshair.className = 'world-crosshair';
  crosshair.hidden = true;
  container.appendChild(crosshair);
  const lockPrompt = document.createElement('div');
  lockPrompt.className = 'world-lock-prompt';
  lockPrompt.innerHTML = '<span>🖱️ clique no mundo pra olhar com o mouse · <b>Esc</b> solta</span>';
  lockPrompt.hidden = true;
  container.appendChild(lockPrompt);
  let crosshairOn = pref(CROSSHAIR_PREF_KEY, '1') === '1';
  let pointerLocked = false;
  let lockFailed = false; // o app/navegador não deixou prender o mouse: a câmera segue o mouse solto
  // modo cartas (Duno): jogando e sentado na mesa, a câmera fica em 1ª pessoa olhando a mão
  let cardMode = false;
  function viewMode() { return cardMode ? 'first' : camMode; }

  // ---------- pessoas ----------
  const people = new Map();
  let selfId = null;

  function makeTag(person) {
    const tag = document.createElement('div');
    tag.className = 'world-tag' + (person.isSelf ? ' is-self' : '');
    const av = document.createElement('span');
    av.className = 'world-tag-avatar';
    if (person.user.avatar_url) {
      const img = document.createElement('img');
      img.src = person.user.avatar_url;
      img.alt = '';
      av.appendChild(img);
    } else {
      av.textContent = initialsOf(person.user.username);
    }
    const name = document.createElement('span');
    name.className = 'world-tag-name';
    name.textContent = person.user.username;
    const icons = document.createElement('span');
    icons.className = 'world-tag-icons';
    tag.append(av, name, icons);
    tag.addEventListener('click', () => api.openProfile(person.id, tag));
    tag.addEventListener('contextmenu', (e) => {
      if (person.isSelf) return;
      e.preventDefault();
      api.openContextMenu(e, person.id, person.user.username);
    });
    labels.appendChild(tag);
    return tag;
  }

  function addPerson(entry) {
    const avatar = createAvatar(entry.user.accent_color);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    scene.add(avatar.root, blob);
    const person = {
      id: entry.id, user: entry.user, isSelf: entry.isSelf, avatar, blob,
      pos: new THREE.Vector3(), target: new THREE.Vector3(), ry: 0, targetRy: 0,
      action: 'stand', seat: null, moving: 0, placed: false, waveUntil: 0,
    };
    person.tag = makeTag(person);
    avatar.root.traverse((o) => { o.userData.personId = entry.id; });
    people.set(entry.id, person);
    return person;
  }

  function removePerson(id) {
    const p = people.get(id);
    if (!p) return;
    scene.remove(p.avatar.root, p.blob);
    p.avatar.dispose();
    p.tag.remove();
    people.delete(id);
  }

  function seatById(id) { return sceneDef.seats.find((s) => s.id === id) || null; }

  function placeFromState(p, st, snap) {
    if (!st) return;
    p.target.set(st.x, st.y || 0, st.z);
    p.targetRy = st.ry;
    p.action = st.action || 'stand';
    p.seat = st.seat || null;
    if (p.action === 'wave') p.waveUntil = performance.now() + WAVE_MS;
    if (snap || !p.placed) {
      p.pos.copy(p.target);
      p.ry = p.targetRy;
      p.placed = true;
    }
  }

  // ---------- andares: altura do chão em (x, z) perto da altura atual ----------
  function surfaceY(s, x, z) {
    if (!s.ramp) return s.y;
    const { from, to, y0, y1 } = s.ramp;
    const k = Math.min(1, Math.max(0, (s.ramp.axis === 'x' ? x - from : z - from) / (to - from)));
    return y0 + (y1 - y0) * k;
  }
  // das superfícies ao alcance de um passo, fica com a MAIS ALTA: assim, no pé da escada, o boneco
  // sobe nela em vez de continuar no chão (e entrar embaixo dela)
  function groundAt(x, z, curY) {
    let best = null;
    for (const s of surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const y = surfaceY(s, x, z);
      if (Math.abs(y - curY) <= STEP_UP && (best == null || y > best)) best = y;
    }
    return best;
  }
  // colisão: empurra o corpo pra fora dos móveis do andar em que ele está
  function collide(pos) {
    for (const c of sceneDef.colliders) {
      if (c.minY != null && pos.y < c.minY) continue;
      if (c.maxY != null && pos.y > c.maxY) continue;
      const hx = c.w / 2 + BODY_RADIUS;
      const hz = c.d / 2 + BODY_RADIUS;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        const px = hx - Math.abs(dx);
        const pz = hz - Math.abs(dz);
        if (px < pz) pos.x = c.x + Math.sign(dx || 1) * hx;
        else pos.z = c.z + Math.sign(dz || 1) * hz;
      }
    }
    pos.x = Math.min(B.maxX, Math.max(B.minX, pos.x));
    pos.z = Math.min(B.maxZ, Math.max(B.minZ, pos.z));
  }

  // ---------- eu ----------
  const keys = new Set();
  let route = [];            // pontos até o destino (pode passar pela escada)
  let pendingSeat = null;
  let walkTime = 0;          // tempo andando nessa rota (em tempo de jogo: não depende do fps)
  let stillTime = 0;         // há quanto tempo não chego mais perto do ponto atual
  let bestDist = Infinity;
  let lastSent = null;

  function me() { return selfId != null ? people.get(selfId) : null; }

  function myState() {
    const p = me();
    if (!p) return null;
    return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), ry: +p.ry.toFixed(2), action: p.action, seat: p.action === 'sit' ? p.seat : null };
  }

  function sendMine(force) {
    const st = myState();
    if (!st) return;
    const changed = !lastSent || force || st.action !== lastSent.action || st.seat !== lastSent.seat
      || Math.abs(st.x - lastSent.x) > 0.01 || Math.abs(st.z - lastSent.z) > 0.01 || Math.abs(st.y - (lastSent.y || 0)) > 0.01 || Math.abs(st.ry - lastSent.ry) > 0.05;
    if (!changed) return;
    lastSent = st;
    api.sendSelf(st);
  }

  function setMyAction(action) {
    const p = me();
    if (!p) return;
    if (p.action === 'sit' && action !== 'sit') standUp();
    p.action = action;
    if (action === 'wave') p.waveUntil = performance.now() + WAVE_MS;
    sendMine(true);
    refreshHud();
  }

  function standUp() {
    const p = me();
    if (!p || p.action !== 'sit') return;
    const seat = seatById(p.seat);
    if (seat) {
      p.pos.set(seat.x + Math.sin(seat.ry) * 0.7, seat.floor || 0, seat.z + Math.cos(seat.ry) * 0.7);
      collide(p.pos);
    }
    p.action = 'stand';
    p.seat = null;
    p.target.copy(p.pos);
    onMySeatChanged();
  }

  function isSeatTaken(seatId) {
    for (const p of people.values()) if (!p.isSelf && p.action === 'sit' && p.seat === seatId) return true;
    return false;
  }

  function sitOn(seat) {
    const p = me();
    if (!p || isSeatTaken(seat.id)) return;
    p.action = 'sit';
    p.seat = seat.id;
    p.pos.set(seat.x, seat.floor || 0, seat.z);
    p.target.copy(p.pos);
    p.ry = seat.ry;
    if (camMode === 'first') camYaw = seat.ry;
    route = [];
    pendingSeat = null;
    targetMarker.visible = false;
    sendMine(true);
    refreshHud();
    onMySeatChanged();
  }

  // caminho até um ponto: se ele é em outro andar, passa pela escada (pé e topo)
  function planRoute(target, targetY) {
    const p = me();
    const st = sceneDef.stairs;
    const pts = [];
    if (st && Math.abs(targetY - p.pos.y) > 1) {
      const cx = (st.minX + st.maxX) / 2;
      const bottom = new THREE.Vector3(cx, 0, st.bottomZ + 0.5);
      const top = new THREE.Vector3(cx, st.y, st.topZ - 0.8);
      const off = new THREE.Vector3(st.minX - 0.7, st.y, st.topZ - 0.8);
      if (targetY > p.pos.y) pts.push(bottom, top, off); else pts.push(off, top, bottom);
    }
    pts.push(target);
    route = pts;
    walkTime = stillTime = 0;
    bestDist = Infinity;
  }

  let hudState = '';
  function refreshHud() {
    const p = me();
    const key = `${p ? p.action : ''}|${camMode}|${cardMode}|${crosshairOn}|${pointerLocked}|${lockFailed}|${dunoVisibleKey()}|${bjVisibleKey()}|${chessVisibleKey()}|${anyPanelOpen()}`;
    if (key === hudState) return;
    hudState = key;
    hud.querySelector('[data-act="stand"]').hidden = !p || p.action !== 'sit';
    hud.querySelectorAll('[data-act="wave"], [data-act="dance"]').forEach((b) => b.classList.toggle('is-on', !!p && b.dataset.act === p.action));
    const cam = hud.querySelector('[data-act="camera"]');
    cam.querySelector('.world-dock-label').textContent = camMode === 'first' ? '1ª pessoa' : '3ª pessoa';
    cam.querySelector('.world-dock-emoji').textContent = camMode === 'first' ? '👀' : '🎥';
    const ch = hud.querySelector('[data-act="crosshair"]');
    ch.hidden = camMode !== 'first';
    ch.classList.toggle('is-on', crosshairOn);
    crosshair.hidden = !(camMode === 'first' && crosshairOn && !cardMode && !lockFailed);
    lockPrompt.hidden = !(camMode === 'first' && !pointerLocked && !lockFailed && !cardMode && !anyPanelOpen());
    hud.querySelector('[data-act="duno"]').hidden = !dunoShouldShowButton();
    hud.querySelector('[data-act="duno"]').classList.toggle('is-on', !!(duno && duno.isOpen()));
    hud.querySelector('[data-act="blackjack"]').hidden = !(bj && bj.isActive());
    hud.querySelector('[data-act="blackjack"]').classList.toggle('is-on', !!(bj && bj.isOpen()));
    hud.querySelector('[data-act="chess"]').hidden = !(chess && chess.isActive());
    hud.querySelector('[data-act="chess"]').classList.toggle('is-on', !!(chess && chess.isOpen()));
  }

  hud.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const p = me();
    const act = b.dataset.act;
    if (act === 'camera') toggleCamera();
    else if (act === 'crosshair') toggleCrosshair();
    else if (act === 'duno') { if (duno) duno.toggle(); }
    else if (act === 'blackjack') { if (bj) bj.toggle(); }
    else if (act === 'chess') { if (chess) chess.toggle(); }
    else if (act === 'fullscreen') toggleWorldFullscreen();
    else if (act === 'tv') { if (tv) { tv.togglePanel(); onPanelChange(); } }
    else if (!p) return;
    else if (act === 'stand') { standUp(); sendMine(true); refreshHud(); }
    else setMyAction(p.action === act && act === 'dance' ? 'stand' : act);
    if (act !== 'tv') canvas.focus();
  });

  // ---------- jogos (Duno) e piano: módulos carregados só quando precisa ----------
  // cada mesa da cena diz o jogo dela (`game`): Duno (uma mesa), 21 ou xadrez (quantas houver)
  const tableDef = (sceneDef.tables || []).find((t) => (t.game || 'duno') === 'duno') || null;
  const bjDefs = (sceneDef.tables || []).filter((t) => t.game === 'blackjack');
  let bj = null;
  let bjLoading = null;
  const bjLast = new Map(); // mesa -> último estado (chegou antes do módulo carregar)
  // xadrez: carrega junto com o mundo (é leve) — as peças ficam sempre nas mesas, até sem partida
  const chessDefs = (sceneDef.tables || []).filter((t) => t.game === 'chess');
  let chess = null;
  let chessLoading = null;
  const chessLast = new Map();
  let duno = null;
  let dunoLoading = null;
  let dunoLast = null;
  let piano = null;
  let pianoLoading = null;
  const worldApiForModules = {
    userName: (id) => api.userName(id),
    user: (id) => api.user(id),
    standUp: () => { standUp(); sendMine(true); refreshHud(); },
    onPanelChange: () => onPanelChange(),
    myPos: () => { const p = me(); return p ? { x: p.pos.x, y: p.pos.y, z: p.pos.z } : null; },
  };

  function ensureDuno() {
    if (duno || !tableDef) return Promise.resolve(duno);
    if (!dunoLoading) {
      dunoLoading = import(`./games/duno.js?v=${ASSET_V}`).then((mod) => {
        duno = mod.createDuno({ scene, container, api, def: tableDef, world: worldApiForModules });
        if (dunoLast) duno.setState(dunoLast);
        hudState = '';
        refreshHud();
        return duno;
      }).catch((err) => { console.error('[mundinho] Duno não carregou:', err); dunoLoading = null; return null; });
    }
    return dunoLoading;
  }
  // 21: um módulo pra todas as mesas de 21 (public/world/games/blackjack.js)
  function ensureBlackjack() {
    if (bj || !bjDefs.length) return Promise.resolve(bj);
    if (!bjLoading) {
      bjLoading = import(`./games/blackjack.js?v=${ASSET_V}`).then((mod) => {
        bj = mod.createBlackjack({ scene, container, api, defs: bjDefs, world: worldApiForModules });
        for (const st of bjLast.values()) bj.setState(st);
        hudState = '';
        refreshHud();
        return bj;
      }).catch((err) => { console.error('[mundinho] 21 não carregou:', err); bjLoading = null; return null; });
    }
    return bjLoading;
  }
  function bjVisibleKey() { return bj ? `${bj.isActive()}${bj.isOpen()}` : ''; }
  // xadrez: um módulo pra todas as mesas de xadrez (public/world/games/chess.js)
  function ensureChess() {
    if (chess || !chessDefs.length) return Promise.resolve(chess);
    if (!chessLoading) {
      chessLoading = import(`./games/chess.js?v=${ASSET_V}`).then((mod) => {
        chess = mod.createChess({ scene, container, api, defs: chessDefs, world: worldApiForModules });
        for (const st of chessLast.values()) chess.setState(st);
        hudState = '';
        refreshHud();
        return chess;
      }).catch((err) => { console.error('[mundinho] xadrez não carregou:', err); chessLoading = null; return null; });
    }
    return chessLoading;
  }
  function chessVisibleKey() { return chess ? `${chess.isActive()}${chess.isOpen()}` : ''; }
  if (chessDefs.length) ensureChess();

  function setGame(state) {
    if (state.game === 'chess') {
      chessLast.set(state.table, state);
      if (chess) chess.setState(state);
      else ensureChess();
      hudState = '';
      refreshHud();
      return;
    }
    if (state.game === 'blackjack') {
      bjLast.set(state.table, state);
      if (bj) bj.setState(state);
      else if (state.seated.length || state.hands.length) ensureBlackjack();
      hudState = '';
      refreshHud();
      return;
    }
    if (!tableDef || state.table !== tableDef.id) return;
    dunoLast = state;
    const relevant = state.game || state.occupants.length;
    if (duno) duno.setState(state);
    else if (relevant) ensureDuno();
    hudState = '';
    refreshHud();
  }
  function dunoShouldShowButton() {
    return !!(duno && duno.isActive());
  }
  function dunoVisibleKey() { return duno ? `${duno.isActive()}${duno.isOpen()}` : ''; }

  function ensurePiano() {
    if (piano || !sceneDef.piano) return Promise.resolve(piano);
    if (!pianoLoading) {
      pianoLoading = import(`./piano.js?v=${ASSET_V}`).then((mod) => {
        piano = mod.createPiano({ container, api, def: sceneDef.piano, world: worldApiForModules });
        return piano;
      }).catch((err) => { console.error('[mundinho] piano não carregou:', err); pianoLoading = null; return null; });
    }
    return pianoLoading;
  }

  // entra/sai do modo cartas (jogando Duno e sentado na mesa)
  function syncCardMode() {
    const p = me();
    const seatId = p && p.action === 'sit' ? p.seat : null;
    const want = !!(duno && duno.wantsCardMode(seatId));
    if (want === cardMode) return;
    cardMode = want;
    if (want) {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      const seat = seatById(seatId);
      if (seat) camYaw = seat.ry;
      lookPitch = -0.55; // olhando pra mesa
      route = [];
    } else if (camMode !== 'first') {
      lookPitch = 0;
    }
    duno.setCardMode(want, camera);
    // as cartas ficam embaixo: o dock e a dica saem do caminho (X levanta; a barra tem o resto)
    container.classList.toggle('is-card-mode', want);
    hudState = '';
    refreshHud();
  }

  // sentei/levantei: banco do piano abre o teclado; cadeira da mesa de jogos carrega o Duno
  function onMySeatChanged() {
    const p = me();
    const seat = p && p.action === 'sit' ? p.seat : null;
    if (sceneDef.piano && seat === sceneDef.piano.seat) ensurePiano().then((pn) => { if (pn) pn.setOpen(true); });
    else if (piano) piano.setOpen(false);
    if (tableDef && seat && tableDef.seats.includes(seat)) ensureDuno();
    if (seat && bjDefs.some((d) => d.seats.includes(seat))) ensureBlackjack().then((b) => { if (b) b.onMySeat(seat); });
    if (seat && chessDefs.some((d) => d.seats.includes(seat))) ensureChess().then((c) => { if (c) c.onMySeat(seat); });
  }

  function anyPanelOpen() {
    return !!((tv && tv.isPanelOpen()) || (duno && duno.isOpen()) || (bj && bj.isOpen()) || (chess && chess.isOpen()) || (piano && piano.isOpen()));
  }
  // abriu um painel: solta o mouse (precisa do cursor pra clicar nele)
  function onPanelChange() {
    if (anyPanelOpen() && document.pointerLockElement === canvas) document.exitPointerLock();
    hudState = '';
    refreshHud();
  }

  // ---------- tela cheia do mundo inteiro (com os botões da call junto) ----------
  const fsTarget = container.closest('.call-view') || container;
  function toggleWorldFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else fsTarget.requestFullscreen().then(() => canvas.focus()).catch(() => {});
  }
  function onFullscreenChange() {
    const on = document.fullscreenElement === fsTarget;
    const b = hud.querySelector('[data-act="fullscreen"]');
    b.classList.toggle('is-on', on);
    b.querySelector('.world-dock-label').textContent = on ? 'sair' : 'tela cheia';
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);

  // ---------- câmera: 3ª pessoa (orbita atrás do boneco) e 1ª pessoa (dos olhos) ----------
  let camMode = pref(CAMERA_PREF_KEY, 'third') === 'first' ? 'first' : 'third';
  let camYaw = Math.PI;   // pra onde a câmera olha: (sin camYaw, cos camYaw)
  let camPitch = 0.55;    // 3ª pessoa: inclinação de cima
  let lookPitch = 0;      // 1ª pessoa: olhar pra cima/baixo
  let camDist = 6.5;
  let camYawSent = null;
  const camTarget = new THREE.Vector3();
  let camReady = false;

  function toggleCamera() {
    camMode = camMode === 'first' ? 'third' : 'first';
    savePref(CAMERA_PREF_KEY, camMode);
    lookPitch = 0;
    if (camMode !== 'first' && document.pointerLockElement === canvas) document.exitPointerLock();
    hudState = '';
    refreshHud();
  }

  function toggleCrosshair() {
    crosshairOn = !crosshairOn;
    savePref(CROSSHAIR_PREF_KEY, crosshairOn ? '1' : '0');
    hudState = '';
    refreshHud();
  }

  // ---------- 1ª pessoa: a câmera segue o mouse (pointer lock: o cursor some até apertar Esc) ----------
  function onLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
    hudState = '';
    refreshHud();
  }
  function onLockError() {
    if (lockFailed) return;
    lockFailed = true;
    hudState = '';
    refreshHud();
    api.toast('esse app não deixou prender o mouse — a câmera segue o mouse solto (atualize o app desktop pra ficar como no navegador)');
  }
  document.addEventListener('pointerlockerror', onLockError);
  function requestLock() {
    try {
      const r = canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(onLockError);
    } catch (_) { onLockError(); }
  }
  function onLockedMove(e) {
    if (!pointerLocked) return;
    camYaw -= e.movementX * 0.0024;
    lookPitch = Math.min(1.25, Math.max(-1.25, lookPitch - e.movementY * 0.0022));
  }
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onLockedMove);

  function updateCamera(dt) {
    const p = me();
    const focus = p ? p.pos : new THREE.Vector3(sceneDef.spawn.x, sceneDef.spawn.y || 0, sceneDef.spawn.z);
    if (viewMode() === 'first' && p) {
      const seat = p.action === 'sit' ? seatById(p.seat) : null;
      // sentado, o olho acompanha a altura do assento (banqueta é mais alta que pufe)
      let eye = focus.y + (seat ? EYE_SITTING + (seat.y - (seat.floor || 0) - 0.45) : EYE_STANDING);
      let fwd = 0.12;
      // jogando cartas: um pouco mais alto e pra trás, pra ver a mesa inteira e não só a borda
      if (cardMode) { eye += 0.32; fwd = -0.28; }
      camera.position.set(focus.x + Math.sin(camYaw) * fwd, eye, focus.z + Math.cos(camYaw) * fwd);
      const cp = Math.cos(lookPitch);
      camera.lookAt(camera.position.x + Math.sin(camYaw) * cp, eye + Math.sin(lookPitch), camera.position.z + Math.cos(camYaw) * cp);
      camReady = false;
    } else {
      const desired = new THREE.Vector3(focus.x, focus.y + 1.0, focus.z);
      if (!camReady) { camTarget.copy(desired); camReady = true; }
      camTarget.lerp(desired, Math.min(1, dt * 6));
      const horiz = Math.cos(camPitch) * camDist;
      camera.position.set(
        camTarget.x - Math.sin(camYaw) * horiz,
        camTarget.y + Math.sin(camPitch) * camDist,
        camTarget.z - Math.cos(camYaw) * horiz,
      );
      camera.lookAt(camTarget);
    }
    if (camYawSent == null || Math.abs(camYaw - camYawSent) > 0.03) {
      camYawSent = camYaw;
      api.setListenerYaw(camYaw);
    }
    // corte do mezanino: na 3ª pessoa, estando no térreo embaixo dele (ou perto), o andar de cima some
    const mz = sceneDef.mezzanine;
    let hideUpper = false;
    if (mz && p && viewMode() === 'third') {
      const under = p.pos.y < mz.y - 1 && p.pos.x < mz.maxX + 1.2 && p.pos.x > mz.minX - 1 && p.pos.z > mz.minZ - 1 && p.pos.z < mz.maxZ + 1;
      hideUpper = under && camera.position.y > mz.y - 0.4;
    }
    upperGroup.visible = !hideUpper;
    // paredes de vidro: os caixilhos tampariam a vista quando a câmera está do lado de fora
    const hw = sceneDef.size.w / 2;
    const hd = sceneDef.size.d / 2;
    for (const gs of room.glassSides) {
      const outside = viewMode() === 'third' && (
        (gs.side === 'south' && camera.position.z > hd - 0.1) || (gs.side === 'north' && camera.position.z < -hd + 0.1)
        || (gs.side === 'east' && camera.position.x > hw - 0.1) || (gs.side === 'west' && camera.position.x < -hw + 0.1));
      gs.group.visible = !outside;
    }
    for (const person of people.values()) person.hiddenByCut = hideUpper && mz && person.pos.y >= mz.y - 0.5;
  }

  // ---------- mouse ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;
  const canvas = renderer.domElement;

  // e = null: mira (meio da tela), usado na 1ª pessoa com o mouse preso
  function pick(e, objects) {
    if (!e) { pointer.set(0, 0); } else {
      const r = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    }
    raycaster.setFromCamera(pointer, camera);
    const visibleObjs = objects.filter((o) => isVisibleInTree(o));
    return raycaster.intersectObjects(visibleObjs, true)[0] || null;
  }
  function isVisibleInTree(o) {
    for (let n = o; n; n = n.parent) if (n.visible === false && !n.userData.seat) return false;
    return !(o.userData.seat && o.position.y > 3 && !upperGroup.visible);
  }
  function avatarRoots() { return [...people.values()].filter((p) => !p.isSelf && !p.hiddenByCut).map((p) => p.avatar.root); }

  function ndcOf(e) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.button !== 2) return;
    if (cardMode && e.button === 0) {
      // modo cartas: clique é na carta (ou no monte); olhar em volta = arrastar com o botão direito
      duno.click(ndcOf(e));
      ignoreUp = true;
      canvas.focus();
      return;
    }
    if (camMode === 'first' && e.button === 0 && !lockFailed) {
      // 1ª pessoa: o primeiro clique prende o mouse; com ele preso, clicar = usar o que está na mira
      if (!pointerLocked) { requestLock(); drag = null; ignoreUp = true; canvas.focus(); return; }
      interact(null);
      ignoreUp = true;
      return;
    }
    drag = { x: e.clientX, y: e.clientY, yaw: camYaw, pitch: camPitch, look: lookPitch, moved: false, button: e.button };
    canvas.setPointerCapture(e.pointerId);
    canvas.focus();
  }
  function onPointerMove(e) {
    if (pointerLocked) return;
    if (cardMode && !drag) {
      const r = duno.pointerMove(ndcOf(e));
      canvas.style.cursor = r ? r.cursor : '';
      return;
    }
    // sem pointer lock (app antigo): na 1ª pessoa a câmera segue o mouse mesmo assim
    if (camMode === 'first' && lockFailed && !drag && (e.movementX || e.movementY)) {
      camYaw -= e.movementX * 0.004;
      lookPitch = Math.min(1.25, Math.max(-1.25, lookPitch - e.movementY * 0.0035));
    }
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        camYaw = drag.yaw - dx * 0.006;
        if (viewMode() === 'first') lookPitch = Math.min(1.2, Math.max(-1.2, drag.look - dy * 0.005));
        else camPitch = Math.min(1.35, Math.max(0.12, drag.pitch + dy * 0.004));
      }
      return;
    }
    const hit = pick(e, seatHits);
    const seat = hit && hit.object.userData.seat;
    if (seat && !isSeatTaken(seat.id)) {
      ring.position.set(seat.x, (seat.floor || 0) + 0.02, seat.z);
      ring.visible = true;
      canvas.style.cursor = 'pointer';
    } else {
      ring.visible = false;
      const over = pick(e, avatarRoots()) || (tv && pick(e, [tv.screen]));
      canvas.style.cursor = over ? 'pointer' : '';
    }
  }
  let ignoreUp = false;
  function onPointerUp(e) {
    const d = drag;
    drag = null;
    if (ignoreUp) { ignoreUp = false; return; }
    if (!d || d.moved || d.button !== 0) return;
    interact(e);
  }

  // clicou (ou, na 1ª pessoa, mirou e clicou): perfil, TV, mesa de jogos, assento, chão
  function interact(e) {
    const p = me();
    if (!p) return;
    const av = pick(e, avatarRoots());
    if (av) {
      const other = people.get(av.object.userData.personId);
      if (other) { api.openProfile(other.id, other.tag); return; }
    }
    if (tv && pick(e, [tv.screen])) { tv.openPanel(); onPanelChange(); return; }
    const seatHit = pick(e, seatHits);
    if (seatHit) {
      const seat = seatHit.object.userData.seat;
      if (isSeatTaken(seat.id)) return;
      if (p.action === 'sit') standUp();
      pendingSeat = seat;
      planRoute(new THREE.Vector3(seat.x + Math.sin(seat.ry) * 0.7, seat.floor || 0, seat.z + Math.cos(seat.ry) * 0.7), seat.floor || 0);
      return;
    }
    const fh = pick(e, room.walkables);
    if (fh) {
      if (p.action === 'sit') standUp();
      pendingSeat = null;
      const ty = fh.object.userData.walkY || 0;
      planRoute(new THREE.Vector3(fh.point.x, ty, fh.point.z), ty);
      targetMarker.position.set(fh.point.x, fh.point.y + 0.02, fh.point.z);
      targetMarker.visible = true;
    }
  }
  function onDblClick(e) { if (tv && pick(e, [tv.screen])) tv.toggleFullscreen(); }
  function onWheel(e) {
    e.preventDefault();
    if (camMode === 'first') return;
    camDist = Math.min(CAM_MAX, Math.max(CAM_MIN, camDist * (1 + Math.sign(e.deltaY) * 0.1)));
  }
  function onContextMenu(e) {
    e.preventDefault();
    const av = pick(e, avatarRoots());
    if (av) {
      const other = people.get(av.object.userData.personId);
      if (other) api.openContextMenu(e, other.id, other.user.username);
    }
  }

  // ---------- teclado (só com o mundo em foco: digitar no chat nunca anda o boneco) ----------
  const MOVE_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
  function typingSomewhere(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  function onKeyDown(e) {
    if (!visible || typingSomewhere(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!container.contains(document.activeElement) && document.activeElement !== document.body) return;
    if (MOVE_KEYS[e.code] || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      keys.add(e.code);
      if (MOVE_KEYS[e.code]) e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Digit1') setMyAction('wave');
    else if (e.code === 'Digit2') setMyAction(me() && me().action === 'dance' ? 'stand' : 'dance');
    else if (e.code === 'KeyX') { standUp(); sendMine(true); refreshHud(); }
    else if (e.code === 'KeyV') toggleCamera();
    else if (e.code === 'KeyT' && tv) { tv.togglePanel(); onPanelChange(); }
    else if (e.code === 'KeyF') toggleWorldFullscreen();
    else if (e.code === 'KeyC' && camMode === 'first') toggleCrosshair();
    else if (e.code === 'KeyG' && duno) duno.toggle();
    else if (e.code === 'KeyB' && bjDefs.length) ensureBlackjack().then((b) => { if (b) b.toggle(); });
    else if (e.code === 'KeyK' && chessDefs.length) ensureChess().then((c) => { if (c) c.toggle(); });
    else if (e.code === 'F9') { e.preventDefault(); toggleFpsMeter(); }
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onBlur() { keys.clear(); }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // ---------- passo de cada quadro ----------
  const tmp = new THREE.Vector3();
  const headPos = new THREE.Vector3();

  function stepSelf(dt) {
    const p = me();
    if (!p) return;
    let dx = 0;
    let dz = 0;
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (f || s) {
      route = [];
      pendingSeat = null;
      targetMarker.visible = false;
      dx = Math.sin(camYaw) * f - Math.cos(camYaw) * s;
      dz = Math.cos(camYaw) * f + Math.sin(camYaw) * s;
    } else if (route.length) {
      const target = route[0];
      dx = target.x - p.pos.x;
      dz = target.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      walkTime += dt;
      if (dist < bestDist - 0.02) { bestDist = dist; stillTime = 0; } else stillTime += dt;
      const stuck = stillTime > 0.5 || walkTime > 20;
      if (dist < 0.15 || stuck) {
        route.shift();
        bestDist = Infinity;
        stillTime = 0;
        dx = dz = 0;
        if (!route.length || stuck) {
          route = [];
          targetMarker.visible = false;
          // travou num móvel no caminho: pra ir sentar, "pula" pro assento; pro chão, para ali
          if (pendingSeat) sitOn(pendingSeat);
        }
      }
    }
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      if (p.action === 'sit') standUp();
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
      const stepLen = Math.min(len, speed * dt);
      tmp.set(p.pos.x + (dx / len) * stepLen, p.pos.y, p.pos.z + (dz / len) * stepLen);
      collide(tmp);
      const gy = groundAt(tmp.x, tmp.z, p.pos.y);
      if (gy != null) {
        tmp.y = gy;
        const really = Math.hypot(tmp.x - p.pos.x, tmp.z - p.pos.z);
        p.pos.copy(tmp);
        p.moving = Math.min(1, p.moving + dt * 6) * (really > 0.0005 ? 1 : 0.5);
      }
      p.ry = lerpAngle(p.ry, Math.atan2(dx, dz), Math.min(1, dt * 12));
      if (p.action !== 'walk') p.action = 'walk';
    } else {
      p.moving = Math.max(0, p.moving - dt * 6);
      if (p.action === 'walk') p.action = 'stand';
      if (p.action === 'wave' && performance.now() > p.waveUntil) p.action = 'stand';
      // 1ª pessoa parado: o corpo vira pra onde estou olhando (os outros veem pra onde olho)
      if (camMode === 'first' && p.action !== 'sit') p.ry = lerpAngle(p.ry, camYaw, Math.min(1, dt * 8));
    }
    p.target.copy(p.pos);
    sendMine(false);
    refreshHud();
  }

  function stepOthers(dt) {
    for (const p of people.values()) {
      if (p.isSelf) continue;
      const bx = p.pos.x;
      const bz = p.pos.z;
      p.pos.lerp(p.target, Math.min(1, dt * 10));
      if (p.pos.distanceTo(p.target) > 4) p.pos.copy(p.target);
      p.ry = lerpAngle(p.ry, p.targetRy, Math.min(1, dt * 10));
      const speed = Math.hypot(p.pos.x - bx, p.pos.z - bz) / Math.max(dt, 0.001);
      p.moving += ((speed > 0.4 && p.action !== 'sit' ? 1 : 0) - p.moving) * Math.min(1, dt * 8);
      if (p.action === 'wave' && performance.now() > p.waveUntil) p.action = 'stand';
    }
  }

  function updateBodies(dt) {
    for (const p of people.values()) {
      const seat = p.action === 'sit' ? seatById(p.seat) : null;
      p.avatar.root.position.set(p.pos.x, p.pos.y, p.pos.z);
      p.avatar.root.rotation.y = p.ry;
      const hideSelf = p.isSelf && viewMode() === 'first';
      p.avatar.root.visible = p.placed && !hideSelf && !p.hiddenByCut;
      p.avatar.update(dt, { action: p.action === 'walk' ? 'stand' : p.action, moving: p.moving, speaking: api.isSpeaking(p.id), seatY: seat ? seat.y - (seat.floor || 0) : null });
      p.blob.position.set(p.pos.x, p.pos.y + 0.012, p.pos.z);
      p.blob.visible = p.placed && p.action !== 'sit' && !hideSelf && !p.hiddenByCut;
    }
  }

  function updateLabels() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const p of people.values()) {
      if (!p.placed || p.hiddenByCut || (p.isSelf && viewMode() === 'first')) { p.tag.hidden = true; continue; }
      const sitting = p.action === 'sit';
      headPos.set(p.pos.x, p.pos.y + (sitting ? AVATAR_HEAD_TOP - 0.3 : AVATAR_HEAD_TOP) + 0.22, p.pos.z);
      headPos.project(camera);
      const behind = headPos.z > 1;
      const x = (headPos.x * 0.5 + 0.5) * w;
      const y = (-headPos.y * 0.5 + 0.5) * h;
      p.tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      p.tag.hidden = behind;
      p.tag.classList.toggle('is-speaking', api.isSpeaking(p.id));
      const dist = camera.position.distanceTo(p.avatar.root.position);
      p.tag.style.opacity = String(Math.max(0.5, Math.min(1, 1.3 - dist / 20)));
    }
  }

  // ---------- contador de fps (F9) ----------
  // Pra comparar o app com o navegador: fps de verdade, tempo de cada quadro, a placa que o WebGL
  // está usando (se aparecer "llvmpipe"/"SwiftShader", está desenhando no processador), escala de
  // pixels, foco (sem foco o mundo limita em 20 fps de propósito) e, no app, como está a aceleração.
  const FPS_PREF_KEY = 'dusky:worldFps';
  let fpsBox = null;
  let fpsFrames = 0;
  let fpsSince = performance.now();
  let fpsWorst = 0;
  let fpsPrev = 0;
  function gpuName() {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch (_) { return '?'; }
  }
  function toggleFpsMeter(force) {
    const on = force === undefined ? !fpsBox : force;
    savePref(FPS_PREF_KEY, on ? '1' : '0');
    if (!on) { if (fpsBox) fpsBox.remove(); fpsBox = null; return; }
    if (fpsBox) return;
    fpsBox = document.createElement('pre');
    fpsBox.className = 'world-fps';
    fpsBox.style.cssText = 'position:absolute;left:8px;top:8px;z-index:5;margin:0;padding:6px 8px;border-radius:6px;'
      + 'background:rgba(10,8,18,.72);color:#d9fff9;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;white-space:pre';
    container.appendChild(fpsBox);
    fpsFrames = 0; fpsSince = performance.now(); fpsWorst = 0;
  }
  function tickFpsMeter(now) {
    if (!fpsBox) return;
    fpsFrames++;
    if (fpsPrev) fpsWorst = Math.max(fpsWorst, now - fpsPrev);
    fpsPrev = now;
    if (now - fpsSince < 1000) return;
    const fps = (fpsFrames * 1000) / (now - fpsSince);
    const desk = window.duskyDesktop;
    const gpu = desk && desk.appInfo && desk.appInfo.gpu;
    const lines = [
      `${fps.toFixed(0)} fps · pior quadro ${fpsWorst.toFixed(1)} ms`,
      `placa: ${gpuName()}`,
      `pixels: ${cw}×${ch} × ${renderer.getPixelRatio().toFixed(2)} (tela ${(window.devicePixelRatio || 1).toFixed(2)})`,
      `foco: ${document.hasFocus() ? 'sim' : 'não (limitado a 20 fps)'}`,
    ];
    if (desk) {
      lines.push(`app: ${(desk.appInfo && desk.appInfo.label) || desk.shell || 'desktop'}`);
      if (gpu) {
        lines.push(`aceleração: ${gpu.hardwareAcceleration ? 'ligada' : 'DESLIGADA'}${gpu.session ? ` · ${gpu.session}` : ''}`);
        if (gpu.dmabufDisabled) lines.push('WEBKIT_DISABLE_DMABUF_RENDERER=1 (WebGL copiado pela CPU: lento)');
        if (gpu.compositingDisabled) lines.push('WEBKIT_DISABLE_COMPOSITING_MODE=1');
      }
    }
    fpsBox.textContent = lines.join('\n');
    fpsFrames = 0; fpsSince = now; fpsWorst = 0;
  }
  if (pref(FPS_PREF_KEY, '0') === '1') toggleFpsMeter(true);

  // ---------- laço de desenho: só quando visível; sem foco, fps baixo ----------
  let visible = true;
  let raf = 0;
  let last = performance.now();
  let lastFrame = 0;
  let cw = 0;
  let ch = 0;

  let lastAim = 0;
  // com o mouse preso, o anel do assento aparece no que está na mira
  function aimHover() {
    const hit = pick(null, seatHits);
    const seat = hit && hit.object.userData.seat;
    if (seat && !isSeatTaken(seat.id) && hit.distance < 6) {
      ring.position.set(seat.x, (seat.floor || 0) + 0.02, seat.z);
      ring.visible = true;
    } else ring.visible = false;
  }

  function shouldRender() {
    return visible && document.visibilityState === 'visible' && container.isConnected && container.clientWidth > 0;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!shouldRender()) { last = now; return; }
    const minGap = document.hasFocus() || document.fullscreenElement ? 0 : 1000 / 20;
    if (now - lastFrame < minGap) return;
    lastFrame = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    stepSelf(dt);
    stepOthers(dt);
    syncCardMode();
    if (cardMode) duno.updateCards(dt);
    updateCamera(dt);
    updateBodies(dt);
    ring.material.opacity = 0.65 + Math.sin(now / 200) * 0.25;
    if (pointerLocked && now - lastAim > 120) { lastAim = now; aimHover(); }
    renderer.render(scene, camera);
    if (tv) { tv.update(now); tv.renderCss(cw, ch); }
    updateLabels();
    tickFpsMeter(now);
  }

  function resize() {
    cw = container.clientWidth;
    ch = container.clientHeight;
    if (!cw || !ch) return;
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    if (tv) tv.resize(cw, ch);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  raf = requestAnimationFrame(frame);

  // ---------- interface pro site ----------
  function setParticipants(list) {
    const ids = new Set(list.map((e) => e.id));
    for (const id of [...people.keys()]) if (!ids.has(id)) removePerson(id);
    for (const entry of list) {
      let p = people.get(entry.id);
      if (!p) {
        p = addPerson(entry);
        if (entry.isSelf) {
          selfId = entry.id;
          const st = api.getSelf();
          if (st) { placeFromState(p, st, true); camYaw = st.ry; }
        } else {
          placeFromState(p, api.getPeople().get(entry.id), true);
        }
      }
      p.tag.querySelector('.world-tag-icons').textContent = entry.deafened ? '🎧' : entry.muted ? '🔇' : '';
      if (entry.user.accent_color && entry.user.accent_color !== p.user.accent_color) p.avatar.setColor(entry.user.accent_color);
      p.user = entry.user;
    }
    hudState = '';
    refreshHud();
  }

  function applyRemote(id, st) {
    const p = people.get(id);
    if (!p || p.isSelf) return;
    placeFromState(p, st, false);
  }

  function applySelf(st, snap) {
    const p = me();
    if (!p || !st) return;
    const firstTime = !p.placed;
    placeFromState(p, st, snap);
    if (firstTime) camYaw = st.ry;
    lastSent = { ...st };
    hudState = '';
    refreshHud();
  }

  function setVisible(v) {
    visible = !!v;
    if (!visible) keys.clear();
  }

  function destroy() {
    cancelAnimationFrame(raf);
    if (fpsBox) { fpsBox.remove(); fpsBox = null; }
    ro.disconnect();
    if (tv) tv.destroy();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('dblclick', onDblClick);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('pointerlockerror', onLockError);
    document.removeEventListener('mousemove', onLockedMove);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    if (duno) duno.destroy();
    if (bj) bj.destroy();
    if (chess) chess.destroy();
    if (piano) piano.destroy();
    if (document.fullscreenElement === fsTarget) document.exitFullscreen().catch(() => {});
    for (const id of [...people.keys()]) removePerson(id);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    renderer.dispose();
    renderer.forceContextLoss();
    container.innerHTML = '';
  }

  setTimeout(() => canvas.focus(), 50);
  refreshHud();

  return {
    setParticipants, applyRemote, applySelf, removePerson, setVisible, destroy,
    setTv: (state, serverNow) => { if (tv) tv.setState(state, serverNow); },
    setGame: (state) => setGame(state),
    pianoNote: (userId, note, on) => { ensurePiano().then((pn) => { if (pn) pn.remote(userId, note, on); }); },
    screensChanged: () => { if (tv) tv.screensChanged(); },
  };
}
