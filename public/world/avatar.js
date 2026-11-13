// bonequinho do mundinho (docs/MUNDINHO.md): fofo, em estilo desenho (toon + contorno), feito em
// código — sem arquivo de modelo. Cabeçona redonda com orelhinhas, olhos com brilho que piscam,
// boquinha que mexe quando a pessoa fala, bochechas, mãos e pés redondinhos. A roupa usa a cor de
// destaque do perfil; o resto é um tom clarinho dela.
// Animações procedurais (seno nas articulações): andar, sentar, acenar, dançar, respirar e falar.
import * as THREE from '/vendor/three/0.170.0/three.module.min.js';

// rampa de luz do toon: 3 faixas (sombra, meio, luz) — é o que dá o ar de desenho
let toonRamp = null;
function ramp() {
  if (!toonRamp) {
    toonRamp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp() });

let shared = null;
function geometries() {
  if (shared) return shared;
  shared = {
    body: new THREE.SphereGeometry(0.3, 24, 18),
    head: new THREE.SphereGeometry(0.34, 28, 20),
    ear: new THREE.SphereGeometry(0.1, 14, 10),
    eyeWhite: new THREE.SphereGeometry(0.075, 14, 10),
    pupil: new THREE.SphereGeometry(0.05, 12, 10),
    shine: new THREE.SphereGeometry(0.018, 8, 6),
    cheek: new THREE.CircleGeometry(0.05, 16),
    mouth: new THREE.TorusGeometry(0.05, 0.014, 6, 14, Math.PI),
    arm: new THREE.CapsuleGeometry(0.065, 0.2, 4, 10),
    hand: new THREE.SphereGeometry(0.075, 12, 10),
    leg: new THREE.CapsuleGeometry(0.08, 0.14, 4, 10),
    foot: new THREE.SphereGeometry(0.1, 14, 10),
  };
  return shared;
}

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1f1a24, side: THREE.BackSide });
const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const PUPIL = new THREE.MeshBasicMaterial({ color: 0x241c2c });
const CHEEK = new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.6, depthWrite: false });
const MOUTH = new THREE.MeshBasicMaterial({ color: 0x3a2230 });

// malha + contorno (uma cópia um pouco maior, só com as faces de trás, em cor escura)
function outlined(geo, material, thickness = 1.07) {
  const m = new THREE.Mesh(geo, material);
  const o = new THREE.Mesh(geo, OUTLINE);
  o.scale.setScalar(thickness);
  m.add(o);
  return m;
}

function tints(hex) {
  const base = new THREE.Color(hex || '#5865f2');
  const hsl = {};
  base.getHSL(hsl);
  const skin = new THREE.Color().setHSL(hsl.h, Math.min(0.55, hsl.s * 0.55), 0.84);
  const dark = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0.12, hsl.l - 0.22));
  const inner = new THREE.Color().setHSL(hsl.h, Math.min(0.7, hsl.s), 0.72);
  return { base, skin, dark, inner };
}

// alturas (a partir do pé) — o mundo usa pra saber onde fica a cabeça
export const AVATAR_HIP = 0.34;
export const AVATAR_HEAD_TOP = 1.42;

export function createAvatar(color) {
  const g = geometries();
  const c = tints(color);
  const bodyMat = toon(c.base);
  const skinMat = toon(c.skin);
  const darkMat = toon(c.dark);
  const innerMat = toon(c.inner);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = AVATAR_HIP;
  body.add(hips);

  // corpo: uma "gotinha" (esfera achatada) com barriguinha mais clara
  const torso = outlined(g.body, bodyMat, 1.06);
  torso.scale.set(1, 1.08, 0.92);
  torso.position.y = 0.2;
  hips.add(torso);
  const belly = new THREE.Mesh(g.body, innerMat);
  belly.scale.set(0.6, 0.62, 0.35);
  belly.position.set(0, 0.16, 0.18);
  hips.add(belly);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.66;
  hips.add(headPivot);
  const head = outlined(g.head, skinMat, 1.05);
  head.position.y = 0.06;
  head.scale.set(1.05, 0.96, 1);
  headPivot.add(head);
  for (const side of [-1, 1]) {
    const ear = outlined(g.ear, bodyMat, 1.1);
    ear.position.set(0.22 * side, 0.36, -0.02);
    ear.scale.set(1, 1, 0.7);
    headPivot.add(ear);
    const earIn = new THREE.Mesh(g.ear, innerMat);
    earIn.scale.set(0.55, 0.55, 0.3);
    earIn.position.set(0.22 * side, 0.36, 0.045);
    headPivot.add(earIn);
  }
  // olhos: branco + pupila + brilho. O grupo de cada olho achata pra piscar.
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0.12 * side, 0.08, 0.29);
    const white = new THREE.Mesh(g.eyeWhite, WHITE);
    white.scale.set(1, 1.15, 0.5);
    eye.add(white);
    const pupil = new THREE.Mesh(g.pupil, PUPIL);
    pupil.scale.set(1, 1.15, 0.55);
    pupil.position.z = 0.025;
    eye.add(pupil);
    const shine = new THREE.Mesh(g.shine, WHITE);
    shine.position.set(0.018 * side + 0.012, 0.03, 0.055);
    eye.add(shine);
    headPivot.add(eye);
    eyes.push(eye);
    const cheek = new THREE.Mesh(g.cheek, CHEEK);
    cheek.position.set(0.2 * side, -0.03, 0.27);
    cheek.rotation.y = 0.5 * side;
    headPivot.add(cheek);
  }
  const mouth = new THREE.Mesh(g.mouth, MOUTH);
  mouth.rotation.z = Math.PI; // sorrisinho
  mouth.position.set(0, -0.05, 0.325);
  mouth.scale.set(1, 0.8, 1);
  headPivot.add(mouth);

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.27 * side, 0.34, 0);
    hips.add(shoulder);
    const arm = outlined(g.arm, bodyMat, 1.12);
    arm.position.y = -0.13;
    shoulder.add(arm);
    const hand = outlined(g.hand, skinMat, 1.1);
    hand.position.y = -0.28;
    shoulder.add(hand);
    arms.push(shoulder);
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.12 * side, 0.02, 0);
    hips.add(hip);
    const leg = outlined(g.leg, darkMat, 1.12);
    leg.position.y = -0.12;
    hip.add(leg);
    const foot = outlined(g.foot, darkMat, 1.1);
    foot.position.set(0, -0.27, 0.04);
    foot.scale.set(1, 0.62, 1.3);
    hip.add(foot);
    legs.push(hip);
  }

  let t = Math.random() * 10;
  let sitBlend = 0;
  let nextBlink = 1 + Math.random() * 3;
  let blink = 0;

  // dt em segundos; state = { action, moving (0..1), speaking, seatY (altura do assento acima do piso) }
  function update(dt, state) {
    t += dt;
    const action = state.action;
    const sitting = action === 'sit';
    sitBlend += ((sitting ? 1 : 0) - sitBlend) * Math.min(1, dt * 10);
    const move = state.moving || 0;

    for (const a of arms) a.rotation.set(0, 0, 0);
    for (const l of legs) l.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    hips.rotation.set(0, 0, 0);
    headPivot.rotation.set(0, 0, 0);

    // respirar e balançar de leve
    const breath = Math.sin(t * 2.2);
    torso.scale.y = 1.08 + breath * 0.02;
    headPivot.rotation.z = Math.sin(t * 0.9) * 0.03;
    arms[0].rotation.z = -0.18 - breath * 0.03;
    arms[1].rotation.z = 0.18 + breath * 0.03;

    if (move > 0.05 && !sitting) {
      const w = Math.sin(t * 12);
      legs[0].rotation.x = w * 0.8 * move;
      legs[1].rotation.x = -w * 0.8 * move;
      arms[0].rotation.x = -w * 0.7 * move;
      arms[1].rotation.x = w * 0.7 * move;
      body.position.y = Math.abs(Math.cos(t * 12)) * 0.06 * move;
      body.rotation.z = w * 0.05 * move;
      headPivot.rotation.x = -0.05 * move;
    } else if (action === 'wave') {
      arms[1].rotation.z = 2.7 + Math.sin(t * 10) * 0.35;
      headPivot.rotation.z = Math.sin(t * 5) * 0.1;
      body.rotation.z = 0.04;
    } else if (action === 'dance') {
      const b = Math.sin(t * 8);
      body.position.y = Math.abs(b) * 0.14;
      hips.rotation.y = Math.sin(t * 4) * 0.55;
      body.rotation.z = Math.sin(t * 4) * 0.14;
      arms[0].rotation.z = -2.4 - Math.sin(t * 8) * 0.45;
      arms[1].rotation.z = 2.4 - Math.sin(t * 8) * 0.45;
      legs[0].rotation.x = Math.max(0, b) * 0.6;
      legs[1].rotation.x = Math.max(0, -b) * 0.6;
      headPivot.rotation.z = Math.sin(t * 8) * 0.18;
    }

    if (sitBlend > 0.01) {
      const seatY = state.seatY != null ? state.seatY : 0.45;
      body.position.y = body.position.y * (1 - sitBlend) + (seatY - AVATAR_HIP + 0.06) * sitBlend;
      body.position.z = 0.04 * sitBlend;
      for (const l of legs) l.rotation.x = l.rotation.x * (1 - sitBlend) + -1.5 * sitBlend;
      if (sitting) {
        arms[0].rotation.x = -0.45 * sitBlend;
        arms[1].rotation.x = -0.45 * sitBlend;
      }
    }

    // piscar
    nextBlink -= dt;
    if (nextBlink <= 0) { blink = 0.14; nextBlink = 2 + Math.random() * 4; }
    if (blink > 0) blink -= dt;
    const eyeY = blink > 0 ? 0.12 : 1;
    for (const e of eyes) e.scale.y = eyeY;

    // falando: a boquinha abre e fecha, a cabeça mexe um pouquinho
    if (state.speaking) {
      const open = 0.8 + Math.abs(Math.sin(t * 16)) * 1.6;
      mouth.scale.set(1.1, open, 1);
      headPivot.rotation.x += Math.sin(t * 14) * 0.05;
    } else {
      mouth.scale.set(1, 0.8, 1);
    }
  }

  function setColor(hex) {
    const n = tints(hex);
    bodyMat.color.copy(n.base);
    skinMat.color.copy(n.skin);
    darkMat.color.copy(n.dark);
    innerMat.color.copy(n.inner);
  }

  function dispose() {
    for (const m of [bodyMat, skinMat, darkMat, innerMat]) m.dispose();
  }

  return { root, update, setColor, dispose };
}
