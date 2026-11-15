// a cobertura do mundinho: a construção (pisos, paredes de vidro, mezanino, escada, grade, céu e
// cidade lá fora) e os móveis, tudo feito em código — nenhum arquivo de modelo pra baixar.
// Cada "prop" das cenas (public/world/scenes/*.json) tem uma função em BUILDERS. Convenção: a FRENTE
// de um móvel é o +z local (pra onde quem senta olha); `ry` gira em volta do Y; `y` = altura do piso.
import * as THREE from '/vendor/three/0.170.0/three.module.min.js';

// ---------- materiais (cacheados: muitos móveis repetem) ----------
const mats = new Map();
function mat(color, opts = {}) {
  const key = JSON.stringify([String(color), opts.roughness, opts.metalness, opts.emissive, opts.emissiveIntensity, opts.map ? opts.map.uuid : 0]);
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.75,
      metalness: opts.metalness ?? 0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      map: opts.map || null,
    }));
  }
  return mats.get(key);
}
const BRASS = () => mat(0xc9a46a, { metalness: 0.85, roughness: 0.32 });
const BLACK_METAL = () => mat(0x1d1d22, { metalness: 0.6, roughness: 0.45 });
const OAK = () => mat(0xb98a5e, { roughness: 0.55 });
const WALNUT = () => mat(0x6b4630, { roughness: 0.5 });

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// gerador pseudoaleatório com semente (o mesmo mundo pra todo mundo)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

let marbleTex = null;
function marble() {
  if (!marbleTex) {
    marbleTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#f3f1ee';
      g.fillRect(0, 0, w, h);
      const r = rng(42);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(120,120,130,${0.06 + r() * 0.12})`;
        g.lineWidth = 0.6 + r() * 2.2;
        g.beginPath();
        let x = r() * w;
        let y = 0;
        g.moveTo(x, y);
        while (y < h) { x += (r() - 0.5) * 60; y += 20 + r() * 40; g.lineTo(x, y); }
        g.stroke();
      }
    });
  }
  return mat(0xffffff, { roughness: 0.18, map: marbleTex });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, material, seg = 20, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  return m;
}
// caixa com cantos arredondados (almofadas e estofados ficam bem mais "macios")
function rbox(w, h, d, r, material, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape();
  const rr = Math.min(r, w / 2, h / 2);
  shape.moveTo(-w / 2 + rr, -h / 2);
  shape.lineTo(w / 2 - rr, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rr);
  shape.lineTo(w / 2, h / 2 - rr);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - rr, h / 2);
  shape.lineTo(-w / 2 + rr, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rr);
  shape.lineTo(-w / 2, -h / 2 + rr);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rr, -h / 2);
  const bev = Math.min(rr, d / 2) * 0.9;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, d - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.9, bevelSegments: 3, curveSegments: 4 });
  geo.translate(0, 0, -(d - bev * 2) / 2);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
function shade(hex, amount) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return c;
}

// ---------- móveis ----------

function sofa(p) {
  const g = new THREE.Group();
  const n = p.seats || 3;
  const w = n * 0.8 + 0.4;
  const color = p.color || '#e9e2d6';
  const fabric = mat(color, { roughness: 0.95 });
  const fabric2 = mat(shade(color, -0.06), { roughness: 0.95 });
  g.add(rbox(w, 0.32, 0.92, 0.08, fabric2, 0, 0.24, 0));
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * 0.8;
    g.add(rbox(0.78, 0.16, 0.72, 0.07, fabric, cx, 0.46, 0.07));
    const back = rbox(0.76, 0.5, 0.2, 0.08, fabric, cx, 0.74, -0.3);
    back.rotation.x = -0.14;
    g.add(back);
  }
  g.add(rbox(w, 0.56, 0.2, 0.08, fabric2, 0, 0.6, -0.38));
  for (const s of [-1, 1]) g.add(rbox(0.22, 0.5, 0.92, 0.09, fabric2, s * (w / 2 - 0.11), 0.48, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.025, 0.02, 0.1, BRASS(), 8, sx * (w / 2 - 0.12), 0.05, sz * 0.36));
  // almofadinhas
  const r = rng(Math.round(w * 100));
  const pillow = [0xd8b07a, 0x8fb3a6, 0xc98b8b, 0x7f8fc9];
  for (let i = 0; i < Math.min(2, n); i++) {
    const side = i === 0 ? -1 : 1;
    const pl = rbox(0.42, 0.36, 0.12, 0.06, mat(pillow[Math.floor(r() * pillow.length)], { roughness: 0.95 }), side * (w / 2 - 0.45), 0.72, -0.15);
    pl.rotation.set(-0.25, side * 0.25, side * 0.08);
    g.add(pl);
  }
  return g;
}

function loungeChair(p) {
  const g = new THREE.Group();
  const fabric = mat(p.color || '#c4a27a', { roughness: 0.9 });
  g.add(rbox(0.86, 0.18, 0.82, 0.08, fabric, 0, 0.36, 0.04));
  const back = rbox(0.86, 0.6, 0.18, 0.08, fabric, 0, 0.66, -0.34);
  back.rotation.x = -0.25;
  g.add(back);
  for (const s of [-1, 1]) g.add(rbox(0.12, 0.3, 0.76, 0.05, fabric, s * 0.44, 0.48, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = cyl(0.02, 0.015, 0.3, WALNUT(), 8, sx * 0.36, 0.15, sz * 0.32);
    leg.rotation.z = sx * 0.12;
    g.add(leg);
  }
  return g;
}

function beanbag(p) {
  const g = new THREE.Group();
  const colors = [0xf2b880, 0x9ad0c2, 0xc6a0e8];
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), mat(colors[Math.abs(Math.round((p.z || 0) * 3)) % colors.length], { roughness: 1 }));
  m.scale.set(1, 0.6, 1);
  m.position.y = 0.26;
  g.add(m);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), m.material);
  back.scale.set(1.05, 0.9, 0.55);
  back.position.set(0, 0.5, -0.24);
  g.add(back);
  return g;
}

function chair() {
  const g = new THREE.Group();
  const seat = mat(0x3c3f4a, { roughness: 0.8 });
  g.add(rbox(0.46, 0.08, 0.46, 0.04, seat, 0, 0.46, 0));
  const back = rbox(0.44, 0.42, 0.06, 0.03, seat, 0, 0.74, -0.21);
  back.rotation.x = -0.1;
  g.add(back);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.018, 0.016, 0.44, OAK(), 8, sx * 0.18, 0.22, sz * 0.18));
  return g;
}

function barStool() {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.2, 0.07, mat(0x2d2f38, { roughness: 0.7 }), 24, 0, 0.78, 0));
  g.add(cyl(0.03, 0.03, 0.74, BRASS(), 10, 0, 0.4, 0));
  g.add(cyl(0.22, 0.24, 0.03, BRASS(), 24, 0, 0.015, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 24), BRASS());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  g.add(ring);
  return g;
}

function marbleTable(p) {
  const g = new THREE.Group();
  const r = p.r || 0.8;
  const top = cyl(r, r, 0.06, marble(), 40, 0, 0.4, 0);
  top.scale.z = 0.72;
  g.add(top);
  const base = cyl(r * 0.45, r * 0.55, 0.36, BRASS(), 30, 0, 0.19, 0);
  base.scale.z = 0.72;
  g.add(base);
  g.add(box(0.28, 0.04, 0.2, mat(0x2c3e66), 0.18, 0.45, 0.05));
  g.add(cyl(0.06, 0.05, 0.14, mat(0xf0e7da, { roughness: 0.3 }), 14, -0.25, 0.5, -0.05));
  return g;
}

function sideTable() {
  const g = new THREE.Group();
  g.add(cyl(0.26, 0.26, 0.04, marble(), 28, 0, 0.55, 0));
  g.add(cyl(0.02, 0.02, 0.53, BRASS(), 8, 0, 0.27, 0));
  g.add(cyl(0.18, 0.2, 0.02, BRASS(), 20, 0, 0.01, 0));
  return g;
}

function roundTable() {
  const g = new THREE.Group();
  g.add(cyl(0.6, 0.6, 0.05, WALNUT(), 40, 0, 0.74, 0));
  g.add(cyl(0.06, 0.09, 0.7, BLACK_METAL(), 12, 0, 0.37, 0));
  g.add(cyl(0.32, 0.34, 0.04, BLACK_METAL(), 24, 0, 0.02, 0));
  return g;
}

function diningTable(p) {
  const g = new THREE.Group();
  const w = p.w || 2.8;
  const d = p.d || 1.1;
  g.add(rbox(w, 0.07, d, 0.03, WALNUT(), 0, 0.75, 0));
  for (const s of [-1, 1]) {
    const leg = box(0.08, 0.72, d * 0.7, BLACK_METAL(), s * (w / 2 - 0.35), 0.36, 0);
    g.add(leg);
  }
  // centro de mesa
  g.add(cyl(0.12, 0.09, 0.2, mat(0xe9e4dc, { roughness: 0.25 }), 18, 0, 0.88, 0));
  for (const [x, c] of [[-0.05, 0xf2b880], [0.06, 0xe57d8f], [0, 0xf5e6a8]]) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), mat(c, { roughness: 0.9 }));
    f.position.set(x, 1.02, x * 0.6);
    g.add(f);
  }
  return g;
}

function island(p) {
  const g = new THREE.Group();
  const w = p.w || 3.4;
  const d = p.d || 1.1;
  g.add(box(w - 0.1, 0.88, d - 0.1, mat(0x1f2633, { roughness: 0.5 }), 0, 0.44, 0));
  g.add(box(w, 0.06, d, marble(), 0, 0.91, 0));
  // cuba e torneira
  g.add(box(0.6, 0.02, 0.4, mat(0x2a2a2e, { metalness: 0.5, roughness: 0.3 }), -0.8, 0.945, -0.1));
  const tap = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 8, 18, Math.PI), BRASS());
  tap.position.set(-0.8, 1.07, -0.32);
  g.add(tap);
  g.add(cyl(0.015, 0.015, 0.14, BRASS(), 8, -0.66, 1.0, -0.32));
  g.add(cyl(0.14, 0.12, 0.08, mat(0xe9e4dc, { roughness: 0.3 }), 20, 0.9, 0.98, 0));
  for (const [x, c] of [[0.85, 0xf2c14e], [0.95, 0x8bc34a], [0.9, 0xe85c5c]]) {
    const fr = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(c, { roughness: 0.5 }));
    fr.position.set(x, 1.05, (x - 0.9) * 2);
    g.add(fr);
  }
  return g;
}

function kitchenRun(p) {
  const g = new THREE.Group();
  const w = p.w || 6;
  const navy = mat(0x1f2633, { roughness: 0.5 });
  g.add(box(w, 0.88, 0.62, navy, 0, 0.44, 0));
  g.add(box(w + 0.02, 0.05, 0.66, marble(), 0, 0.905, 0.01));
  for (let x = -w / 2 + 0.3; x < w / 2; x += 0.6) g.add(box(0.3, 0.02, 0.02, BRASS(), x, 0.74, 0.32));
  // armários de cima e prateleira com luz
  g.add(box(w, 0.8, 0.36, navy, 0, 2.15, -0.12));
  g.add(box(w, 0.03, 0.36, mat(0xfff2d6, { emissive: 0xffd9a0, emissiveIntensity: 0.8 }), 0, 1.74, -0.12));
  // revestimento entre bancada e armário
  g.add(box(w, 0.8, 0.02, mat(0xe9e4dc, { roughness: 0.25 }), 0, 1.33, -0.3));
  // cooktop e coifa
  g.add(box(0.7, 0.015, 0.45, mat(0x111111, { roughness: 0.2 }), 1.2, 0.94, 0.02));
  return g;
}

function fridge() {
  const g = new THREE.Group();
  const steel = mat(0xc8ccd2, { metalness: 0.7, roughness: 0.3 });
  g.add(box(0.86, 2.2, 0.72, steel, 0, 1.1, 0));
  g.add(box(0.02, 2.0, 0.02, mat(0x666a70), 0, 1.1, 0.37));
  for (const s of [-1, 1]) g.add(box(0.02, 0.6, 0.03, BLACK_METAL(), s * 0.08, 1.2, 0.38));
  return g;
}

function sideboard(p) {
  const g = new THREE.Group();
  const w = p.w || 2.4;
  g.add(box(w, 0.7, 0.45, WALNUT(), 0, 0.45, 0));
  for (const sx of [-1, 1]) g.add(cyl(0.02, 0.02, 0.1, BRASS(), 8, sx * (w / 2 - 0.1), 0.05, 0));
  g.add(cyl(0.1, 0.07, 0.36, mat(0x2f6f63, { roughness: 0.2 }), 18, -w / 4, 0.98, 0));
  g.add(box(0.4, 0.06, 0.28, mat(0xc98b8b), w / 4, 0.83, 0));
  return g;
}

function mediaConsole(p) {
  const g = new THREE.Group();
  const w = p.w || 4.4;
  g.add(rbox(w, 0.45, 0.48, 0.03, WALNUT(), 0, 0.3, 0));
  g.add(box(w - 0.2, 0.02, 0.44, BRASS(), 0, 0.075, 0));
  // caixas de som e um vasinho
  // caixinhas de som baixas (não podem tampar a TV, que fica logo acima)
  for (const s of [-1, 1]) g.add(rbox(0.22, 0.55, 0.22, 0.04, mat(0x22232a), s * (w / 2 - 0.25), 0.8, 0));
  g.add(cyl(0.09, 0.07, 0.3, mat(0xf0e7da, { roughness: 0.3 }), 16, w / 2 - 0.8, 0.67, 0));
  return g;
}

// painel de ripas de madeira atrás da TV
function woodPanel(p) {
  const g = new THREE.Group();
  const w = p.w || 7;
  const h = p.h || 7;
  g.add(box(w, h, 0.04, WALNUT(), 0, h / 2, 0));
  const slat = mat(0x8a5c3f, { roughness: 0.5 });
  for (let x = -w / 2 + 0.06; x < w / 2; x += 0.12) g.add(box(0.06, h, 0.04, slat, x, h / 2, 0.035));
  // fita de luz embaixo
  g.add(box(w, 0.03, 0.03, mat(0xffe2b0, { emissive: 0xffc77a, emissiveIntensity: 1.2 }), 0, 0.02, 0.08));
  return g;
}

function shelf() {
  const g = new THREE.Group();
  const wood = WALNUT();
  g.add(box(2.4, 0.05, 0.38, wood, 0, 0.03, 0));
  g.add(box(2.4, 0.05, 0.38, wood, 0, 2.2, 0));
  for (const s of [-1, 0, 1]) g.add(box(0.04, 2.2, 0.38, BRASS(), s * 1.18, 1.1, 0));
  const colors = [0xd8b07a, 0x8fb3a6, 0xc98b8b, 0x7f8fc9, 0xf3f1ee, 0x2c3e66, 0xe0a458];
  const r = rng(9);
  for (let row = 0; row < 4; row++) {
    const y = 0.06 + row * 0.54;
    if (row > 0) g.add(box(2.36, 0.03, 0.36, wood, 0, y, 0));
    let x = -1.12;
    while (x < 1.1) {
      if (r() < 0.14) {
        const v = cyl(0.06, 0.045, 0.22, mat(colors[Math.floor(r() * colors.length)], { roughness: 0.25 }), 14, x + 0.1, y + 0.13, 0);
        g.add(v);
        x += 0.28;
        continue;
      }
      const bw = 0.04 + r() * 0.05;
      const bh = 0.26 + r() * 0.16;
      g.add(box(bw, bh, 0.25, mat(colors[Math.floor(r() * colors.length)], { roughness: 0.85 }), x + bw / 2, y + 0.02 + bh / 2, 0.02));
      x += bw + 0.006;
    }
  }
  return g;
}

function plantTall() {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.24, 0.55, mat(0xeae6df, { roughness: 0.4 }), 24, 0, 0.275, 0));
  g.add(cyl(0.28, 0.28, 0.02, mat(0x3b2a1e), 24, 0, 0.55, 0));
  g.add(cyl(0.025, 0.035, 1.3, mat(0x5b4430), 6, 0, 1.15, 0));
  const leaves = [mat(0x3f8f55, { roughness: 0.8 }), mat(0x2e7247, { roughness: 0.8 }), mat(0x58a86a, { roughness: 0.8 })];
  const r = rng(5);
  for (let i = 0; i < 16; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), leaves[i % 3]);
    const a = r() * Math.PI * 2;
    const rad = 0.15 + r() * 0.3;
    leaf.position.set(Math.cos(a) * rad, 1.25 + r() * 0.9, Math.sin(a) * rad);
    leaf.scale.set(1, 0.35, 0.7);
    leaf.rotation.set(r() - 0.5, a, (r() - 0.5) * 1.2);
    g.add(leaf);
  }
  return g;
}

// luminária de arco (o abajur fica pendurado na frente)
function arcLamp() {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.22, 0.06, marble(), 24, 0, 0.03, 0));
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 2.6, 0.2), new THREE.Vector3(0, 2.0, 1.5));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018, 8), BRASS()));
  const shadeM = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc9a46a, { metalness: 0.8, roughness: 0.3 }));
  shadeM.position.set(0, 2.05, 1.5);
  g.add(shadeM);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9c4 }));
  bulb.position.set(0, 1.98, 1.5);
  g.add(bulb);
  const light = new THREE.PointLight(0xffcf96, 7, 8, 1.5);
  light.position.set(0, 1.85, 1.5);
  g.add(light);
  return g;
}

function pendantShade(material) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 12), material);
  g.add(s);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
  bulb.position.y = -0.12;
  g.add(bulb);
  return g;
}

// luminária pendurada: `y` dela é a altura do teto
function pendant(p) {
  const g = new THREE.Group();
  const ceil = p.y || 3.4;
  g.position.y = 0;
  const drop = 1.1;
  const wire = cyl(0.006, 0.006, drop, BLACK_METAL(), 4, 0, ceil - drop / 2 - (p.floorY || 0), 0);
  g.add(wire);
  const shadeG = pendantShade(mat(0xf4efe6, { emissive: 0xffe2b5, emissiveIntensity: 0.6, roughness: 0.9 }));
  shadeG.position.y = ceil - drop;
  g.add(shadeG);
  const light = new THREE.PointLight(0xffd6a0, 8, 9, 1.6);
  light.position.y = ceil - drop - 0.2;
  g.add(light);
  return g;
}

function pendantRow(p) {
  const g = new THREE.Group();
  const n = p.count || 3;
  const spread = p.spread || 2;
  const ceil = p.y || 3.3;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -spread / 2 + (spread / (n - 1)) * i;
    g.add(cyl(0.006, 0.006, 0.9, BLACK_METAL(), 4, x, ceil - 0.45, 0));
    const s = pendantShade(BRASS());
    s.position.set(x, ceil - 0.95, 0);
    g.add(s);
  }
  const light = new THREE.PointLight(0xffd6a0, 9, 8, 1.6);
  light.position.set(0, ceil - 1.2, 0);
  g.add(light);
  return g;
}

function chandelier(p) {
  const g = new THREE.Group();
  const ceil = p.y || 3.3;
  g.add(cyl(0.008, 0.008, 0.8, BRASS(), 4, 0, ceil - 0.4, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 40), BRASS());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = ceil - 0.85;
  g.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
    b.position.set(Math.cos(a) * 0.55, ceil - 0.78, Math.sin(a) * 0.55);
    g.add(b);
  }
  const light = new THREE.PointLight(0xffd6a0, 10, 9, 1.6);
  light.position.y = ceil - 1.1;
  g.add(light);
  return g;
}

// piano de cauda (bem simplificado, mas de longe engana)
function piano() {
  const g = new THREE.Group();
  const lacquer = mat(0x0d0d10, { roughness: 0.15, metalness: 0.2 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.75, 0);
  shape.lineTo(0.75, 0);
  shape.lineTo(0.75, 0.6);
  shape.bezierCurveTo(0.75, 1.4, 0.2, 1.2, 0.1, 1.75);
  shape.bezierCurveTo(-0.1, 2.0, -0.75, 1.9, -0.75, 1.2);
  shape.lineTo(-0.75, 0);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), lacquer);
  body.rotation.x = -Math.PI / 2;
  body.position.set(0, 0.62, 0.9);
  g.add(body);
  const lid = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), lacquer);
  lid.rotation.x = -Math.PI / 2 - 0.5;
  lid.position.set(0, 0.95, 0.9);
  g.add(lid);
  g.add(box(1.5, 0.05, 0.18, mat(0xf5f3ee, { roughness: 0.3 }), 0, 0.82, 1.0));
  for (let i = 0; i < 18; i++) g.add(box(0.03, 0.03, 0.1, lacquer, -0.68 + i * 0.08, 0.85, 0.96));
  for (const [x, z] of [[-0.6, 0.85], [0.6, 0.85], [-0.2, -0.75]]) g.add(cyl(0.05, 0.04, 0.62, lacquer, 10, x, 0.31, z));
  const bench = rbox(0.9, 0.08, 0.36, 0.04, lacquer, 0, 0.48, 1.45);
  g.add(bench);
  for (const s of [-1, 1]) g.add(box(0.05, 0.46, 0.3, lacquer, s * 0.38, 0.23, 1.45));
  return g;
}

// quadro abstrato (pintado num canvas, com a semente da cena)
function art(p) {
  const g = new THREE.Group();
  const w = p.w || 1.6;
  const h = p.h || 1.1;
  const tex = canvasTex(256, Math.round(256 * h / w), (c, cw, ch) => {
    const r = rng(p.seed || 1);
    const palette = ['#f2b880', '#e57d8f', '#8fb3a6', '#2c3e66', '#f5e6a8', '#c6a0e8', '#e9e2d6'];
    c.fillStyle = '#f3efe8';
    c.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 7; i++) {
      c.fillStyle = palette[Math.floor(r() * palette.length)];
      c.globalAlpha = 0.85;
      c.beginPath();
      if (r() < 0.5) c.arc(r() * cw, r() * ch, 20 + r() * 60, 0, Math.PI * 2);
      else c.ellipse(r() * cw, r() * ch, 30 + r() * 70, 15 + r() * 40, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.strokeStyle = '#2b2b30';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(r() * cw, 0);
    c.bezierCurveTo(r() * cw, ch * 0.4, r() * cw, ch * 0.6, r() * cw, ch);
    c.stroke();
  });
  g.add(box(w + 0.08, h + 0.08, 0.04, BRASS(), 0, p.y || 1.8, 0));
  const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  canvasMesh.position.set(0, p.y || 1.8, 0.025);
  g.add(canvasMesh);
  return g;
}

function rug(p) {
  const g = new THREE.Group();
  const color = p.color || '#d8cfc0';
  const geo = p.round ? new THREE.CircleGeometry(p.w / 2, 48) : new THREE.PlaneGeometry(p.w, p.d);
  const m = new THREE.Mesh(geo, mat(color, { roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  g.add(m);
  const borderGeo = p.round ? new THREE.RingGeometry(p.w / 2 - 0.14, p.w / 2 - 0.08, 48) : null;
  if (borderGeo) {
    const b = new THREE.Mesh(borderGeo, mat(shade(color, -0.12), { roughness: 1 }));
    b.rotation.x = -Math.PI / 2;
    b.position.y = 0.008;
    g.add(b);
  } else {
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(p.w - 0.3, p.d - 0.3), mat(shade(color, 0.05), { roughness: 1 }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.008;
    g.add(inner);
  }
  return g;
}

// mesa de jogos redonda (feltro verde, borda de madeira) — onde o Duno acontece
function gameTable(p) {
  const g = new THREE.Group();
  const r = p.r || 1.0;
  g.add(cyl(r + 0.08, r + 0.08, 0.08, WALNUT(), 48, 0, 0.72, 0));
  g.add(cyl(r - 0.04, r - 0.04, 0.02, mat(0x2f7a5a, { roughness: 1 }), 48, 0, 0.765, 0));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.035, 8, 48), BRASS());
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.77;
  g.add(rim);
  g.add(cyl(0.1, 0.16, 0.66, BLACK_METAL(), 14, 0, 0.35, 0));
  g.add(cyl(0.45, 0.5, 0.05, BLACK_METAL(), 30, 0, 0.025, 0));
  return g;
}

// mesa de 21 (blackjack): meia-lua com a banca no lado reto (-z) e os jogadores na curva (+z).
// O feltro tem a frase impressa em arco, como nas mesas de cassino. Cartas e fichas da rodada são
// desenhadas por public/world/games/blackjack.js por cima do feltro (altura 0.781).
let bjFeltTex = null;
function blackjackFeltTexture() {
  if (bjFeltTex) return bjFeltTex;
  // o quadrado do canvas = [-r, r] nos dois eixos da mesa; a banca fica no meio da borda de cima
  bjFeltTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    const grad = g.createRadialGradient(c, c * 0.9, 40, c, c, c);
    grad.addColorStop(0, '#1f7a52');
    grad.addColorStop(1, '#125a3c');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
    // texto em arco, com o "pé" das letras virado pros jogadores
    const arcText = (text, radius, size, color, from = 152, to = 28) => {
      g.save();
      g.fillStyle = color;
      g.font = `800 ${size}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = text.length;
      for (let i = 0; i < n; i++) {
        const th = ((from + (to - from) * (n === 1 ? 0.5 : i / (n - 1))) * Math.PI) / 180;
        g.save();
        g.translate(c + radius * Math.cos(th), c + radius * Math.sin(th));
        g.rotate(th - Math.PI / 2);
        g.fillText(text[i], 0, 0);
        g.restore();
      }
      g.restore();
    };
    arcText('BLACKJACK PAGA 3 PARA 2', c * 0.5, 34, '#f4d58a', 150, 30);
    arcText('A BANCA PARA EM 17', c * 0.38, 22, 'rgba(255,255,255,0.75)', 140, 40);
    // arcos das apostas: um círculo por cadeira
    g.strokeStyle = 'rgba(244, 213, 138, 0.7)';
    g.lineWidth = 4;
    for (const deg of [64, 32, 0, -32, -64]) {
      const a = (deg * Math.PI) / 180;
      g.beginPath();
      g.arc(c + Math.sin(a) * c * 0.8, c + Math.cos(a) * c * 0.8, 34, 0, Math.PI * 2);
      g.stroke();
    }
    // linha da banca
    g.strokeStyle = 'rgba(244, 213, 138, 0.5)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c, c * 0.24, 0.1, Math.PI - 0.1);
    g.stroke();
  });
  return bjFeltTex;
}

function blackjackTable(p) {
  const g = new THREE.Group();
  const r = p.r || 1.15;
  // meia-lua (curva pro +z) + uma faixa reta atrás pra banca
  const half = (rad, back) => {
    const s = new THREE.Shape();
    s.moveTo(rad, 0);
    s.absarc(0, 0, rad, 0, -Math.PI, true);
    s.lineTo(-rad, back);
    s.lineTo(rad, back);
    s.closePath();
    return s;
  };
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(half(r, 0.18), { depth: 0.06, bevelEnabled: false, curveSegments: 40 }), WALNUT());
  body.rotation.x = -Math.PI / 2;
  body.position.y = 0.72;
  g.add(body);
  // feltro: UV refeito pra cobrir [-r, r] (a textura é desenhada nesse quadrado)
  const feltGeo = new THREE.ShapeGeometry(half(r - 0.06, 0.12), 40);
  const pos = feltGeo.attributes.position;
  const uv = feltGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + r) / (2 * r), (pos.getY(i) + r) / (2 * r));
  const felt = new THREE.Mesh(feltGeo, mat(0xffffff, { roughness: 1, map: blackjackFeltTexture() }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.781;
  g.add(felt);
  // borda acolchoada de couro na curva
  const rail = new THREE.Mesh(new THREE.TorusGeometry(r - 0.02, 0.05, 10, 48, Math.PI), mat(0x2a1a14, { roughness: 0.45 }));
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 0.79;
  g.add(rail);
  // pés
  for (const sx of [-1, 1]) g.add(cyl(0.05, 0.07, 0.72, BLACK_METAL(), 12, sx * r * 0.5, 0.36, r * 0.35));
  g.add(cyl(0.06, 0.08, 0.72, BLACK_METAL(), 12, 0, 0.36, -0.05));
  // bandeja de fichas da banca
  const tray = box(0.62, 0.035, 0.13, mat(0x1b1b20, { roughness: 0.4 }), 0, 0.8, 0.06);
  g.add(tray);
  // uma fileira de fichas deitadas em cada canaleta (cores das fichas do jogo)
  [0xe8e2d6, 0xd94141, 0x2f7de1, 0x2fa65a, 0x222226, 0x8d4fd6].forEach((col, i) => {
    const row = cyl(0.026, 0.026, 0.11, mat(col, { roughness: 0.5 }), 16, -0.25 + i * 0.1, 0.835, 0.06);
    row.rotation.x = Math.PI / 2;
    g.add(row);
  });
  // sapato das cartas (à direita da banca) e porta-descarte (à esquerda)
  const shoe = box(0.16, 0.1, 0.26, mat(0x101014, { roughness: 0.35 }), -r * 0.62, 0.83, 0.12);
  shoe.rotation.y = 0.35;
  g.add(shoe);
  const shoeCards = box(0.13, 0.06, 0.2, mat(0x7a1f2b, { roughness: 0.6 }), -r * 0.62, 0.87, 0.12);
  shoeCards.rotation.y = 0.35;
  g.add(shoeCards);
  const discardTray = box(0.15, 0.05, 0.2, mat(0x101014, { roughness: 0.35 }), r * 0.62, 0.805, 0.12);
  discardTray.rotation.y = -0.35;
  g.add(discardTray);
  return g;
}

// mesa de xadrez: quadrada, de nogueira, com o tabuleiro embutido no tampo (casas de 0.065 m, igual
// ao S de public/world/games/chess.js, que desenha as peças e o relógio por cima — altura 0.747).
// As cadeiras ficam em lados opostos; quem joga de brancas fica do lado da casa a1 (escura, no canto
// esquerdo dele), o que vale pros dois lados porque o xadrez é simétrico girando 180°.
let chessBoardTex = null;
function chessBoardTexture() {
  if (chessBoardTex) return chessBoardTex;
  chessBoardTex = canvasTex(512, 512, (g, w) => {
    const border = w * (0.02 / 0.56);
    const cell = (w - border * 2) / 8;
    g.fillStyle = '#3a2418';
    g.fillRect(0, 0, w, w);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        g.fillStyle = (i + j) % 2 === 0 ? '#8a5a3b' : '#ead7b0';
        g.fillRect(border + i * cell, border + j * cell, cell + 0.5, cell + 0.5);
      }
    }
    g.strokeStyle = '#c9a46a';
    g.lineWidth = 3;
    g.strokeRect(border - 2, border - 2, w - border * 2 + 4, w - border * 2 + 4);
  });
  return chessBoardTex;
}
function chessTable(p) {
  const g = new THREE.Group();
  const w = p.w || 0.9;
  // o arredondado do rbox estica a peça pra fora (bevelSize), então o topo do tampo fica acima de
  // y + h/2. Antes o tabuleiro (0.7462) ficava ENTERRADO no tampo e não aparecia: agora o tampo é
  // posicionado pelo topo de verdade, 3 mm abaixo do tabuleiro (e das peças, em BOARD_Y = 0.747).
  const top = rbox(w, 0.05, w, 0.02, WALNUT());
  top.geometry.computeBoundingBox();
  top.position.y = 0.743 - top.geometry.boundingBox.max.y;
  g.add(top);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), mat(0xffffff, { roughness: 0.35, map: chessBoardTexture() }));
  board.rotation.x = -Math.PI / 2;
  board.position.y = 0.7462;
  g.add(board);
  // coluna torneada + pé em cruz
  g.add(cyl(0.05, 0.07, 0.6, WALNUT(), 16, 0, 0.4, 0));
  g.add(cyl(0.09, 0.06, 0.08, WALNUT(), 16, 0, 0.66, 0));
  for (const a of [0, Math.PI / 2]) {
    const foot = rbox(0.62, 0.05, 0.08, 0.02, WALNUT(), 0, 0.03, 0);
    foot.rotation.y = a;
    g.add(foot);
  }
  return g;
}

const BUILDERS = {
  gameTable,
  blackjackTable,
  chessTable,
  sofa, loungeChair, beanbag, chair, barStool, marbleTable, sideTable, roundTable, diningTable,
  island, kitchenRun, fridge, sideboard, mediaConsole, woodPanel, shelf, plantTall, arcLamp,
  pendant, pendantRow, chandelier, piano, art, rug,
};

// ---------- a construção ----------

function floorTexture() {
  // espinha de peixe clarinha
  return canvasTex(512, 512, (g, w, h) => {
    const tones = ['#c9a27a', '#c09872', '#d0aa82', '#b98f69', '#c8a07a'];
    g.fillStyle = '#b48c66';
    g.fillRect(0, 0, w, h);
    const r = rng(3);
    const L = 128;
    const T = 32;
    for (let y = -L; y < h + L; y += T * 2) {
      for (let x = -L; x < w + L; x += L) {
        for (const flip of [0, 1]) {
          g.save();
          g.translate(x + (flip ? L / 2 : 0), y + (flip ? T : 0));
          g.rotate(flip ? -Math.PI / 4 : Math.PI / 4);
          g.fillStyle = tones[Math.floor(r() * tones.length)];
          g.fillRect(0, 0, L * 0.7, T * 0.9);
          g.restore();
        }
      }
    }
  }, [6, 4]);
}

function skyTexture() {
  return canvasTex(16, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#05060f');
    grd.addColorStop(0.42, '#121535');
    grd.addColorStop(0.5, '#3a2d5c');
    grd.addColorStop(0.53, '#7a4a6e');
    grd.addColorStop(0.6, '#1a1a2c');
    grd.addColorStop(1, '#07070c');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

function windowsTexture(seed, warm) {
  return canvasTex(128, 256, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = '#0d0f18';
    g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 10) {
      for (let x = 4; x < w; x += 9) {
        if (r() < 0.38) {
          const on = r();
          g.fillStyle = warm ? (on < 0.7 ? '#ffd28a' : '#fff1c9') : (on < 0.6 ? '#9fd3ff' : '#e4f3ff');
          g.globalAlpha = 0.45 + r() * 0.55;
          g.fillRect(x, y, 5, 6);
        }
      }
    }
    g.globalAlpha = 1;
  });
}

// a cidade lá fora: prédios em volta (InstancedMesh = poucas chamadas de desenho), céu e estrelas
function buildCity() {
  const city = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  city.add(sky);
  const starGeo = new THREE.BufferGeometry();
  const r = rng(77);
  const pts = [];
  for (let i = 0; i < 500; i++) {
    const a = r() * Math.PI * 2;
    const e = 0.15 + r() * 1.3;
    pts.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  city.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false }));
  moon.position.set(160, 120, 260);
  city.add(moon);

  // chão lá embaixo, cheio de luzinha
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#07080d';
      g.fillRect(0, 0, w, h);
      const rr = rng(8);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = rr() < 0.7 ? '#ffcf8a' : '#8fc7ff';
        g.globalAlpha = 0.3 + rr() * 0.6;
        g.fillRect(rr() * w, rr() * h, 1.2, 1.2);
      }
    }, [8, 8]),
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -90;
  city.add(ground);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const groups = [0, 1, 2, 3].map((i) => new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: windowsTexture(10 + i, i % 2 === 0) }), 30));
  const dummy = new THREE.Object3D();
  const counts = [0, 0, 0, 0];
  const rb = rng(21);
  for (let i = 0; i < 120; i++) {
    const a = rb() * Math.PI * 2;
    const dist = 60 + rb() * 140; // longe o bastante pra nenhum prédio encostar na casa (36x24 m)
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const w = 10 + rb() * 18;
    const h = 40 + rb() * 120;
    dummy.position.set(x, -90, z);
    dummy.scale.set(w, h, w * (0.6 + rb() * 0.6));
    dummy.rotation.y = rb() * Math.PI;
    dummy.updateMatrix();
    const k = i % 4;
    if (counts[k] < 30) groups[k].setMatrixAt(counts[k]++, dummy.matrix);
  }
  groups.forEach((g, k) => { g.count = counts[k]; city.add(g); });
  return city;
}

// grade de vidro com corrimão de latão (linha de x1,z1 até x2,z2). Com `ramp`, acompanha a escada.
function railing(rl) {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
  const dx = rl.x2 - rl.x1;
  const dz = rl.z2 - rl.z1;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  if (rl.ramp) {
    // painel inclinado: um paralelogramo do pé ao topo da escada
    const { from, to, y0, y1 } = rl.ramp;
    const run = Math.abs(to - from);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(run, y1 - y0);
    shape.lineTo(run, y1 - y0 + 1.0);
    shape.lineTo(0, 1.0);
    const panel = new THREE.Mesh(new THREE.ShapeGeometry(shape), glass);
    panel.material.side = THREE.DoubleSide;
    panel.rotation.y = Math.PI / 2;
    panel.position.set(rl.x1, y0, from);
    g.add(panel);
    const handCurve = new THREE.LineCurve3(new THREE.Vector3(rl.x1, y0 + 1.0, from), new THREE.Vector3(rl.x1, y1 + 1.0, to));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(handCurve, 1, 0.025, 8), BRASS()));
    return g;
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), glass);
  panel.material.side = THREE.DoubleSide;
  panel.position.set((rl.x1 + rl.x2) / 2, rl.y + 0.5, (rl.z1 + rl.z2) / 2);
  panel.rotation.y = ang + Math.PI / 2;
  g.add(panel);
  const rail = cyl(0.025, 0.025, len, BRASS(), 8, (rl.x1 + rl.x2) / 2, rl.y + 1.0, (rl.z1 + rl.z2) / 2);
  rail.rotation.set(Math.PI / 2, 0, 0);
  rail.rotation.y = ang;
  rail.rotateX(0);
  const holder = new THREE.Group();
  holder.position.copy(rail.position);
  holder.rotation.y = ang;
  rail.position.set(0, 0, 0);
  rail.rotation.set(Math.PI / 2, 0, 0);
  holder.add(rail);
  g.add(holder);
  return g;
}

// monta a cobertura. Devolve { ground, upper, walkables, ceilings }:
// `upper` = tudo do mezanino (o mundo esconde quando você está embaixo, na 3ª pessoa);
// `walkables` = superfícies em que dá pra clicar pra andar.
export function buildRoom(sceneDef) {
  const { w, d, h } = sceneDef.size;
  const ground = new THREE.Group();
  const upper = new THREE.Group();
  const walkables = [];
  const tex = floorTexture();
  tex.repeat.set(w / 4, d / 4); // uma "placa" da espinha de peixe a cada 4 m, qualquer que seja o tamanho

  ground.add(buildCity());

  const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.userData.walkY = 0;
  ground.add(floor);
  walkables.push(floor);

  // teto (só aparece de baixo: de cima, a câmera vê através — "casa de boneca")
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0xf4f0ea, roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  ground.add(ceiling);

  // paredes: norte e oeste são de verdade; sul e leste têm vidro onde a cena manda
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xefe9e1, roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false });
  const frameMat = BLACK_METAL();
  const glassWalls = sceneDef.glassWalls || [];
  const glassSides = [];
  const sides = [
    { side: 'north', x: 0, z: -d / 2, ry: 0, len: w, axis: 'x' },
    { side: 'south', x: 0, z: d / 2, ry: Math.PI, len: w, axis: 'x' },
    { side: 'west', x: -w / 2, z: 0, ry: Math.PI / 2, len: d, axis: 'z' },
    { side: 'east', x: w / 2, z: 0, ry: -Math.PI / 2, len: d, axis: 'z' },
  ];
  for (const s of sides) {
    const glassSeg = glassWalls.find((g) => g.side === s.side);
    const half = s.len / 2;
    // trechos [de, até] ao longo da parede (em coordenada do mundo)
    const solid = glassSeg ? [[-half, glassSeg.from], [glassSeg.to, half]].filter(([a, b]) => b - a > 0.01) : [[-half, half]];
    const addWall = (a, b, material) => {
      const len = b - a;
      const mid = (a + b) / 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), material);
      if (s.axis === 'x') m.position.set(mid, h / 2, s.z); else m.position.set(s.x, h / 2, mid);
      m.rotation.y = s.ry;
      ground.add(m);
      return m;
    };
    for (const [a, b] of solid) addWall(a, b, wallMat);
    if (glassSeg) {
      // vidro + caixilhos num grupo por lado: o mundo esconde quando a câmera está do lado de fora
      const glassGroup = new THREE.Group();
      ground.add(glassGroup);
      glassSides.push({ side: s.side, group: glassGroup });
      const pane = addWall(glassSeg.from, glassSeg.to, glassMat);
      ground.remove(pane);
      glassGroup.add(pane);
      pane.renderOrder = 2;
      // caixilhos pretos a cada ~2 m e na altura do mezanino
      for (let t = glassSeg.from; t <= glassSeg.to + 0.01; t += (glassSeg.to - glassSeg.from) / Math.max(1, Math.round((glassSeg.to - glassSeg.from) / 2))) {
        const post = box(0.08, h, 0.08, frameMat);
        if (s.axis === 'x') post.position.set(t, h / 2, s.z); else post.position.set(s.x, h / 2, t);
        glassGroup.add(post);
      }
      for (const yy of [0.04, sceneDef.mezzanine ? sceneDef.mezzanine.y : h / 2, h - 0.04]) {
        const len = glassSeg.to - glassSeg.from;
        const beam = s.axis === 'x' ? box(len, 0.08, 0.08, frameMat) : box(0.08, 0.08, len, frameMat);
        const mid = (glassSeg.from + glassSeg.to) / 2;
        if (s.axis === 'x') beam.position.set(mid, yy, s.z); else beam.position.set(s.x, yy, mid);
        glassGroup.add(beam);
      }
    }
    // rodapé nas partes sólidas
    for (const [a, b] of solid) {
      const len = b - a;
      const mid = (a + b) / 2;
      const base = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.14), mat(0xffffff, { roughness: 0.6 }));
      if (s.axis === 'x') base.position.set(mid, 0.07, s.z); else base.position.set(s.x, 0.07, mid);
      base.rotation.y = s.ry;
      base.translateZ(0.01);
      ground.add(base);
    }
  }

  // mezanino: laje com a face de cima de madeira e a de baixo branca (é o teto da cozinha)
  const mz = sceneDef.mezzanine;
  if (mz) {
    const mw = mz.maxX - mz.minX;
    const md = mz.maxZ - mz.minZ;
    const t = mz.thickness || 0.3;
    const slab = box(mw, t, md, mat(0xf4f0ea, { roughness: 0.9 }), (mz.minX + mz.maxX) / 2, mz.y - t / 2, (mz.minZ + mz.maxZ) / 2);
    upper.add(slab);
    const upTex = tex.clone();
    upTex.needsUpdate = true;
    upTex.repeat.set(mw / 4, md / 4);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(mw, md), new THREE.MeshStandardMaterial({ map: upTex, roughness: 0.55 }));
    top.rotation.x = -Math.PI / 2;
    top.position.set((mz.minX + mz.maxX) / 2, mz.y + 0.002, (mz.minZ + mz.maxZ) / 2);
    top.userData.walkY = mz.y;
    upper.add(top);
    walkables.push(top);
    // fita de luz na borda da laje
    upper.add(box(0.03, 0.03, md, mat(0xffe2b0, { emissive: 0xffc77a, emissiveIntensity: 1.4 }), mz.maxX + 0.01, mz.y - t - 0.02, (mz.minZ + mz.maxZ) / 2));
  }

  // escada reta: degraus "flutuantes" de madeira com uma viga preta embaixo
  const st = sceneDef.stairs;
  if (st) {
    const n = st.steps || 18;
    const run = st.bottomZ - st.topZ;
    const stepD = run / n;
    const stepH = st.y / n;
    const sw = st.maxX - st.minX;
    const cx = (st.minX + st.maxX) / 2;
    const stepMat = mat(0xb98a5e, { roughness: 0.5 });
    for (let i = 0; i < n; i++) {
      const s = box(sw - 0.1, 0.07, stepD + 0.04, stepMat, cx, stepH * (i + 1) - 0.035, st.bottomZ - stepD * (i + 0.5));
      s.userData.walkY = stepH * (i + 1);
      ground.add(s);
      walkables.push(s);
    }
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, Math.hypot(run, st.y)), BLACK_METAL());
    stringer.position.set(st.minX + 0.08, st.y / 2 - 0.15, (st.bottomZ + st.topZ) / 2);
    stringer.rotation.x = Math.atan2(st.y, run);
    ground.add(stringer);
    // patamar
    const landing = box(sw, 0.3, 1.6, mat(0xf4f0ea, { roughness: 0.9 }), cx, st.y - 0.15, st.topZ - 0.8);
    upper.add(landing);
    const landTop = new THREE.Mesh(new THREE.PlaneGeometry(sw, 1.6), upper.children[1] ? upper.children[1].material : floorMat);
    landTop.rotation.x = -Math.PI / 2;
    landTop.position.set(cx, st.y + 0.003, st.topZ - 0.8);
    landTop.userData.walkY = st.y;
    upper.add(landTop);
    walkables.push(landTop);
  }

  for (const rl of sceneDef.railings || []) (rl.ramp ? ground : upper).add(railing(rl));

  // luz ambiente: céu noturno azulado + um pouco de lua
  ground.add(new THREE.HemisphereLight(0xc9d4ff, 0x3a2f2a, 0.9));
  const moon = new THREE.DirectionalLight(0xbfc9ff, 0.8);
  moon.position.set(12, 20, 18);
  ground.add(moon);
  const warm = new THREE.DirectionalLight(0xffe2c0, 0.5);
  warm.position.set(-10, 12, -6);
  ground.add(warm);

  return { ground, upper, walkables, glassSides };
}

// monta os móveis. Os que estão no mezanino (y >= 2) vão pro grupo `upper`.
export function buildProps(sceneDef) {
  const ground = new THREE.Group();
  const upper = new THREE.Group();
  for (const p of sceneDef.props || []) {
    const build = BUILDERS[p.type];
    if (!build) continue;
    const floorY = p.type === 'pendant' || p.type === 'pendantRow' || p.type === 'chandelier' || p.type === 'art' ? 0 : (p.y || 0);
    const obj = build(p);
    obj.position.set(p.x || 0, floorY, p.z || 0);
    obj.rotation.y = p.ry || 0;
    const isUpper = (p.type === 'pendant' || p.type === 'chandelier' || p.type === 'pendantRow' || p.type === 'art') ? (p.y || 0) > 4.2 : (p.y || 0) >= 2;
    (isUpper ? upper : ground).add(obj);
  }
  return { ground, upper };
}
