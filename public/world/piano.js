// piano de cauda tocável (docs/MUNDINHO.md). Carregado sob demanda: quando alguém senta no banco
// ou quando chega a primeira nota de outra pessoa. O som é sintetizado aqui (Web Audio, sem arquivo
// de áudio) e sai DO PIANO: passa por um PannerNode na posição dele, igual à voz das pessoas.
// Quem está no banco vê um teclado com o atalho de cada tecla escrito nela (no layout do teclado da
// pessoa, ABNT incluso, quando o navegador deixa ler o layout).

// teclas físicas (KeyboardEvent.code) -> semitom a partir do Dó da oitava atual
const WHITE = [['KeyA', 0], ['KeyS', 2], ['KeyD', 4], ['KeyF', 5], ['KeyG', 7], ['KeyH', 9], ['KeyJ', 11], ['KeyK', 12], ['KeyL', 14], ['Semicolon', 16], ['Quote', 17]];
const BLACK = [['KeyW', 1], ['KeyE', 3], ['KeyT', 6], ['KeyY', 8], ['KeyU', 10], ['KeyO', 13], ['KeyP', 15]];
const US_LABELS = { Semicolon: ';', Quote: "'" };
const NOTE_NAMES = ['dó', 'dó#', 'ré', 'ré#', 'mi', 'fá', 'fá#', 'sol', 'sol#', 'lá', 'lá#', 'si'];
const OCTAVE_KEY = 'dusky:pianoOctave';

function labelFor(code, layout) {
  const k = layout && layout.get(code);
  if (k) return k.toUpperCase();
  return US_LABELS[code] || code.replace('Key', '');
}

export function createPiano({ container, api, def, world }) {
  // ---------- som ----------
  const ctx = api.audioCtx();
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -14;
  out.ratio.value = 4;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const panner = api.createPanner(ctx);
  // o piano é mais alto que uma voz: some mais longe
  panner.maxDistance = 14;
  if (panner.positionX) { panner.positionX.value = def.x; panner.positionY.value = def.y; panner.positionZ.value = def.z; }
  else panner.setPosition(def.x, def.y, def.z);
  master.connect(out).connect(panner).connect(ctx.destination);

  const voices = new Map(); // `${userId}:${note}` -> { gain, oscs, timer }

  function noteOn(userId, note) {
    if (api.isDeafened()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const key = `${userId}:${note}`;
    noteOff(userId, note, 0.04);
    const t = ctx.currentTime;
    const f = 440 * 2 ** ((note - 69) / 12);
    const g = ctx.createGain();
    const vel = 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.7);
    g.gain.exponentialRampToValueAtTime(vel * 0.05, t + 4);
    // corpo do som: um filtro que "fecha" com o tempo (o ataque brilha, o resto fica macio)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(14000, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(900, f * 2.2), t + 1.6);
    lp.connect(g).connect(master);
    const partials = [['triangle', 1, 0.6, 0], ['sine', 1, 0.35, 4], ['sine', 2, 0.22, -3], ['sine', 3, 0.08, 2], ['sine', 4, 0.04, 0]];
    const oscs = partials.map(([type, mult, amp, cents]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = cents;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a).connect(lp);
      o.start(t);
      return o;
    });
    const timer = setTimeout(() => noteOff(userId, note), 4500);
    voices.set(key, { g, oscs, timer });
    if (userId !== api.myId()) markKey(note, true);
  }

  function noteOff(userId, note, release = 0.35) {
    const key = `${userId}:${note}`;
    const v = voices.get(key);
    if (!v) return;
    voices.delete(key);
    clearTimeout(v.timer);
    const t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), t);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t + release);
    for (const o of v.oscs) o.stop(t + release + 0.05);
    if (userId !== api.myId()) markKey(note, false);
  }

  // ---------- teclado na tela ----------
  let octave = (() => { try { return Math.min(6, Math.max(2, Number(localStorage.getItem(OCTAVE_KEY)) || 4)); } catch (_) { return 4; } })();
  let layout = null;
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then((m) => { layout = m; render(); }).catch(() => {});

  const panel = document.createElement('div');
  panel.className = 'piano-panel';
  panel.hidden = true;
  container.appendChild(panel);
  const held = new Map(); // code -> nota (minhas teclas apertadas)
  const keyEls = new Map(); // nota -> elemento

  const base = () => 12 * (octave + 1);

  function render() {
    keyEls.clear();
    panel.innerHTML = `
      <div class="piano-head">
        <span class="piano-head-icon">🎹</span>
        <div class="piano-head-title"><strong>piano</strong><small>oitava ${octave} · <b>Z</b> desce · <b>X</b> sobe · <b>Esc</b> levanta</small></div>
        <button type="button" class="world-round-btn is-small" data-p="down" title="oitava abaixo (Z)">−</button>
        <button type="button" class="world-round-btn is-small" data-p="up" title="oitava acima (X)">+</button>
        <button type="button" class="world-pill-btn is-soft" data-p="stand">levantar</button>
      </div>
      <div class="piano-keys"></div>`;
    const keys = panel.querySelector('.piano-keys');
    const whiteW = 100 / WHITE.length;
    WHITE.forEach(([code, semi], i) => {
      const note = base() + semi;
      const k = document.createElement('button');
      k.type = 'button';
      k.className = 'piano-key is-white';
      k.style.left = `${i * whiteW}%`;
      k.style.width = `${whiteW}%`;
      k.innerHTML = `<span class="piano-note"></span><span class="piano-label"></span>`;
      k.querySelector('.piano-note').textContent = semi % 12 === 0 ? `${NOTE_NAMES[0]}${octave + Math.floor(semi / 12)}` : '';
      k.querySelector('.piano-label').textContent = labelFor(code, layout);
      bindMouse(k, note);
      keys.appendChild(k);
      keyEls.set(note, k);
    });
    // teclas pretas: no meio entre as brancas vizinhas
    const whitePos = new Map(WHITE.map(([, s], i) => [s, i]));
    for (const [code, semi] of BLACK) {
      const leftWhite = whitePos.get(semi - 1);
      const note = base() + semi;
      const k = document.createElement('button');
      k.type = 'button';
      k.className = 'piano-key is-black';
      k.style.left = `${(leftWhite + 1) * whiteW - whiteW * 0.3}%`;
      k.style.width = `${whiteW * 0.6}%`;
      k.innerHTML = '<span class="piano-label"></span>';
      k.querySelector('.piano-label').textContent = labelFor(code, layout);
      bindMouse(k, note);
      keys.appendChild(k);
      keyEls.set(note, k);
    }
    panel.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.p === 'down') shiftOctave(-1);
      else if (b.dataset.p === 'up') shiftOctave(1);
      else world.standUp();
    }));
  }

  function bindMouse(el, note) {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); play(note); el.setPointerCapture(e.pointerId); });
    const up = () => release(note);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function markKey(note, on) {
    const el = keyEls.get(note);
    if (el) el.classList.toggle('is-down', on);
  }

  function play(note) {
    noteOn(api.myId(), note);
    markKey(note, true);
    api.sendPiano(note, true);
  }
  function release(note) {
    noteOff(api.myId(), note);
    markKey(note, false);
    api.sendPiano(note, false);
  }

  function shiftOctave(d) {
    for (const [, n] of held) release(n);
    held.clear();
    octave = Math.min(6, Math.max(2, octave + d));
    try { localStorage.setItem(OCTAVE_KEY, String(octave)); } catch (_) { /* ok */ }
    render();
  }

  const CODES = new Map([...WHITE, ...BLACK]);
  function typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  // com o piano aberto, o teclado é do piano (o mundo não recebe: nada de andar sem querer)
  function onKeyDown(e) {
    if (panel.hidden || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape') { world.standUp(); }
    else if (e.code === 'KeyZ') { if (!e.repeat) shiftOctave(-1); }
    else if (e.code === 'KeyX') { if (!e.repeat) shiftOctave(1); }
    else if (CODES.has(e.code)) {
      if (!e.repeat && !held.has(e.code)) { const n = base() + CODES.get(e.code); held.set(e.code, n); play(n); }
    } else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function onKeyUp(e) {
    const n = held.get(e.code);
    if (n == null) return;
    held.delete(e.code);
    release(n);
    e.stopImmediatePropagation();
  }
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  function setOpen(v) {
    if (!!v === !panel.hidden) return;
    panel.hidden = !v;
    if (v) render();
    else { for (const [, n] of held) release(n); held.clear(); }
    world.onPanelChange();
  }

  function remote(userId, note, on) {
    if (on) noteOn(userId, note); else noteOff(userId, note);
  }

  function destroy() {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    for (const k of [...voices.keys()]) { const [u, n] = k.split(':'); noteOff(Number(u), Number(n), 0.05); }
    try { panner.disconnect(); } catch (_) { /* ok */ }
    panel.remove();
  }

  return { setOpen, isOpen: () => !panel.hidden, remote, destroy };
}
