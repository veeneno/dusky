// dusky — Melhorar a tela dos outros (FSR 1 e geração de quadros), do lado de quem assiste
// Parte 35 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - preferência "melhorar imagem" (por aparelho): original, só nitidez, ou aumentar e dar nitidez
//   - no navegador e no app do Windows: um <canvas> por cima do <video> da tela de cada pessoa,
//     desenhado com o FSR (public/js/screen-fsr.js) a cada quadro que o vídeo mostra
//   - no app do Linux a tela já é desenhada num canvas (21-call-sfu.js): lá o FSR entra direto
//     no desenho (screenEnhanceNativeStep), sem canvas extra
//   - geração de quadros (public/js/screen-framegen.js): inventa os quadros do meio entre dois que
//     chegaram (30 → 60, 90, 120 fps). Pra isso a tela aparece um pouquinho atrasada: o quadro novo
//     só é mostrado depois dos do meio, (n-1)/n de um intervalo (~17 ms a 30 fps em 2x)
//
// É experimental e começa desligado. Custa só a placa de vídeo de quem assiste: quem compartilha
// não muda nada. O ganho maior é quem compartilha mandar em 720p/900p (menos peso no codificador e
// na internet dele) e quem assiste ver aumentado pro tamanho da própria tela.

const SCREEN_FSR_KEY = 'dusky:screenFsr';            // 'off' | 'sharpen' | 'upscale'
const SCREEN_FSR_SHARP_KEY = 'dusky:screenFsrSharp'; // 'low' | 'mid' | 'high'
// nitidez em "stops" do RCAS (0 = máximo; cada 1 = metade). A AMD recomenda 0,2 pra jogo; vídeo
// comprimido tem bloco e ruído, então o padrão aqui é mais leve
const SCREEN_FSR_STOPS = { low: 1.0, mid: 0.5, high: 0.2 };
const SCREEN_FSR_MAX_OUT = { w: 3840, h: 2160 }; // teto da saída (4K), mesmo em tela gigante
const SCREEN_FG_KEY = 'dusky:screenFrameGen';      // 'off' | '2' | '3' | 'auto'
// dois quadros mais longe que isso (tela quase parada, menos de ~10 fps): não inventa nada no meio,
// senão vira câmera lenta "derretendo" de uma imagem pra outra
const SCREEN_FG_MAX_GAP_MS = 100;

function getScreenFsrMode() {
  try {
    const v = localStorage.getItem(SCREEN_FSR_KEY);
    return v === 'sharpen' || v === 'upscale' ? v : 'off';
  } catch (_) { return 'off'; }
}
function getScreenFrameGenMode() {
  try {
    const v = localStorage.getItem(SCREEN_FG_KEY);
    return v === '2' || v === '3' || v === 'auto' ? v : 'off';
  } catch (_) { return 'off'; }
}
// FSR ou geração de quadros ligados: a tela passa pelo renderizador (screen-fsr.js)
function screenEnhanceOn() {
  return getScreenFsrMode() !== 'off' || getScreenFrameGenMode() !== 'off';
}
function getScreenFsrSharp() {
  try {
    const v = localStorage.getItem(SCREEN_FSR_SHARP_KEY);
    return SCREEN_FSR_STOPS[v] != null ? v : 'mid';
  } catch (_) { return 'mid'; }
}
function saveScreenFsr(mode, sharp, frameGen) {
  try {
    if (mode) localStorage.setItem(SCREEN_FSR_KEY, mode);
    if (sharp) localStorage.setItem(SCREEN_FSR_SHARP_KEY, sharp);
    if (frameGen) localStorage.setItem(SCREEN_FG_KEY, frameGen);
  } catch (_) { /* vale só agora */ }
  syncScreenFsrSettings();
  // remonta os cards das telas: liga/desliga o canvas do FSR na hora (no navegador)
  if (voiceChannel) renderScreenShareArea();
}

// opções pro DuskyFsr.draw, a partir da preferência e do espaço onde a tela aparece agora
function screenFsrDrawOptions(canvasEl) {
  const mode = getScreenFsrMode();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (canvasEl && canvasEl.clientWidth) || 0;
  const h = (canvasEl && canvasEl.clientHeight) || 0;
  return {
    upscale: mode === 'upscale',
    sharpen: mode !== 'off',
    sharpness: SCREEN_FSR_STOPS[getScreenFsrSharp()],
    maxWidth: Math.min(SCREEN_FSR_MAX_OUT.w, Math.round(w * dpr)),
    maxHeight: Math.min(SCREEN_FSR_MAX_OUT.h, Math.round(h * dpr)),
  };
}

// quanto tempo dura uma atualização do monitor (medido nos laços de desenho; começa em 60 Hz)
let screenDisplayFrameMs = 1000 / 60;
let screenLastRafAt = 0;
function noteScreenDisplayFrame(now) {
  const d = now - screenLastRafAt;
  screenLastRafAt = now;
  if (d > 3 && d < 50) screenDisplayFrameMs = screenDisplayFrameMs * 0.95 + d * 0.05;
}

// quantos quadros mostrar por quadro que chegou (1 = nenhum gerado), pelo intervalo entre eles.
// Nunca mais do que o monitor consegue mostrar: 60 fps de origem num monitor de 60 Hz fica 1x
function screenFrameGenFactor(gapMs) {
  const mode = getScreenFrameGenMode();
  if (mode === 'off' || !(gapMs > 0) || gapMs > SCREEN_FG_MAX_GAP_MS) return 1;
  const fits = Math.max(1, Math.min(4, Math.round(gapMs / screenDisplayFrameMs)));
  return mode === 'auto' ? fits : Math.min(Number(mode), fits);
}

// texto do selinho no canto da tela
function screenFsrLabel(info, factor, fps) {
  const parts = [];
  if (info && info.srcW && getScreenFsrMode() !== 'off') parts.push(info.easu ? `FSR ${info.srcH}p → ${info.outH}p` : 'FSR nitidez');
  if (factor > 1) parts.push(`${factor}x${fps ? ` · ${fps} fps` : ''}`);
  return parts.join(' · ');
}

// marca de tempo de quem envia (ms) de um quadro do <video>, pra saber o intervalo real entre
// quadros: na chamada (WebRTC) vem o rtpTimestamp (relógio de 90 kHz); sem ele, a hora de captura
function screenFrameTimeMs(meta, now) {
  if (meta && typeof meta.rtpTimestamp === 'number') return meta.rtpTimestamp / 90;
  if (meta && typeof meta.captureTime === 'number') return meta.captureTime;
  return (meta && meta.presentationTime) || now;
}

// ---------- navegador / app do Windows: canvas por cima do <video> ----------

// um canvas (e um contexto WebGL) por tela de pessoa, reaproveitado: o card da tela é refeito a
// cada mudança da call (renderScreenShareArea) e criar um contexto WebGL por vez estouraria o limite
// do navegador (~16) e jogaria memória da placa fora
const screenFsrViews = new Map(); // userId -> { canvas, badge, fsr, video, token, pair… }
let screenFsrUnsupported = false;

function dropScreenFsrView(userId) {
  const v = screenFsrViews.get(userId);
  if (!v) return;
  screenFsrViews.delete(userId);
  v.token++;
  v.fsr.destroy();
  v.canvas.remove();
  v.badge.remove();
}

// chamado por 19-call-ui.js pra cada tela remota que vai pro <video>
function attachScreenFsr(tile, video, userId) {
  // telas que sumiram da call: libera o contexto delas
  for (const id of [...screenFsrViews.keys()]) {
    if (id !== userId && !callParticipantsState.has(id)) dropScreenFsrView(id);
  }
  if (!screenEnhanceOn() || screenFsrUnsupported || !window.DuskyFsr) {
    dropScreenFsrView(userId);
    return;
  }
  let view = screenFsrViews.get(userId);
  if (!view) {
    const canvas = document.createElement('canvas');
    canvas.className = 'call-screenshare-fsr';
    const fsr = window.DuskyFsr.create(canvas);
    if (!fsr) {
      // sem WebGL2 de verdade (ou placa "de mentira"): fica a imagem original, e avisa uma vez
      screenFsrUnsupported = true;
      console.warn('[fsr] este navegador/placa não tem WebGL2 por hardware — a tela fica como chega');
      syncScreenFsrSettings();
      return;
    }
    const badge = document.createElement('span');
    badge.className = 'call-screenshare-fsr-badge';
    view = { canvas, badge, fsr, video: null, token: 0, label: '', pair: null, lastSrc: null, gap: 0, raf: false, factor: 1, outCount: 0, outAt: 0, fps: 0 };
    screenFsrViews.set(userId, view);
  }
  view.video = video;
  const token = ++view.token;
  video.after(view.canvas);
  tile.appendChild(view.badge);
  tile.classList.add('has-fsr');

  const lost = () => {
    // a placa derrubou o contexto (driver reiniciou, memória): volta pro vídeo original
    console.warn('[fsr] contexto WebGL perdido — mostrando a tela original');
    tile.classList.remove('has-fsr');
    dropScreenFsrView(userId);
  };
  const show = (t) => {
    if (!view.fsr.present(screenFsrDrawOptions(view.canvas), t)) { if (view.fsr.lost) lost(); return; }
    // quadros mostrados por segundo (pro selinho)
    view.outCount++;
    const now = performance.now();
    if (now - view.outAt >= 1000) {
      view.fps = view.outAt ? Math.round((view.outCount * 1000) / (now - view.outAt)) : 0;
      view.outAt = now;
      view.outCount = 0;
    }
    const label = screenFsrLabel(view.fsr.info, view.factor, view.factor > 1 ? view.fps : 0);
    if (label !== view.label) { view.label = label; view.badge.textContent = label; }
  };
  // geração de quadros: quando chega o quadro B (depois do A), mostra 1/n do caminho de A pra B na
  // hora, depois 2/n, … e B no fim, espalhados pelo intervalo entre os dois. O laço segue o monitor
  // (requestAnimationFrame) e só desenha quando muda de fase
  const phaseTick = (now) => {
    if (view.token !== token || !video.isConnected) { view.raf = false; return; }
    noteScreenDisplayFrame(now);
    const p = view.pair;
    if (p) {
      const k = Math.min(p.n, 1 + Math.floor((performance.now() - p.start) / (p.gap / p.n)));
      if (k !== p.shown) { p.shown = k; show(k / p.n); }
      if (k >= p.n) view.pair = null;
    }
    if (view.pair) requestAnimationFrame(phaseTick);
    else view.raf = false;
  };
  const schedule = () => {
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(frame);
    else requestAnimationFrame(frame);
  };
  const frame = (now, meta) => {
    if (view.token !== token || !video.isConnected) return; // card refeito ou tela saiu
    if (video.videoWidth && video.videoHeight) {
      const fgOn = getScreenFrameGenMode() !== 'off' && typeof video.requestVideoFrameCallback === 'function';
      // intervalo entre este quadro e o anterior, pela marca de tempo de quem envia (média curta:
      // sem rtpTimestamp a hora de chegada balança)
      const src = screenFrameTimeMs(meta, now);
      let gap = view.lastSrc != null ? src - view.lastSrc : NaN;
      if (gap < 0) gap += 4294967296 / 90; // o relógio RTP deu a volta
      view.lastSrc = src;
      if (gap > 0 && gap < 1000) view.gap = view.gap ? view.gap * 0.7 + gap * 0.3 : gap;
      if (!view.fsr.push(video, video.videoWidth, video.videoHeight, { frameGen: fgOn })) {
        if (view.fsr.lost) { lost(); return; }
      } else {
        const n = fgOn && view.fsr.canInterpolate && gap > 0 ? screenFrameGenFactor(Math.min(gap, view.gap * 1.5)) : 1;
        view.factor = n;
        if (n > 1) {
          view.pair = { start: performance.now(), gap: Math.min(gap, view.gap * 1.5), n, shown: 1 };
          show(1 / n);
          if (!view.raf) { view.raf = true; requestAnimationFrame(phaseTick); }
        } else {
          view.pair = null;
          show(1);
        }
      }
    }
    schedule();
  };
  schedule();
}

// ---------- app do Linux: a tela já vem em quadros decodificados (21-call-sfu.js) ----------

// Um passo do desenho de uma tela no app do Linux, com o FSR e/ou a geração de quadros. playout é
// "que horas são" na linha do tempo de quem envia (µs), já com a folga de 21-call-sfu.js. Guarda
// sempre o par de quadros em volta de agora (o anterior, já na hora, e o próximo, do futuro) e
// mostra o ponto certo entre os dois; sem geração de quadros, só o mais novo que já deu a hora.
// Devolve 'shown', 'idle' (nada mudou) ou 'fail' (não está conseguindo desenhar).
function screenEnhanceNativeStep(entry, playout) {
  const q = entry.queue;
  const r = entry.fsr;
  const fgOn = getScreenFrameGenMode() !== 'off' && r.canInterpolate;
  const st = entry.fg || (entry.fg = { prevTs: null, curTs: null, key: '', fails: 0 });
  let failed = false;
  const push = (f) => {
    if (!r.push(f, f.displayWidth, f.displayHeight, { frameGen: fgOn })) failed = true;
    st.prevTs = st.curTs;
    st.curTs = f.timestamp;
    f.close();
  };
  if (st.curTs == null || st.curTs <= playout) {
    // o mais novo que já deu a hora (os anteriores perderam a vez)
    let last = -1;
    for (let i = 0; i < q.length; i++) if (q[i].timestamp <= playout) last = i;
    if (last >= 0) {
      for (let i = 0; i < last; i++) q[i].close();
      const f = q[last];
      q.splice(0, last + 1);
      push(f);
    }
    // geração de quadros: já guarda o próximo, pra ter o par em volta de agora
    if (fgOn && st.curTs != null && st.curTs <= playout && q.length) push(q.shift());
  }
  if (failed) {
    if (++st.fails > 30 || r.lost) return 'fail';
    return 'idle';
  }
  if (st.curTs == null) return 'idle';
  let t = 1;
  let n = 1;
  if (fgOn && st.prevTs != null && st.curTs > playout) {
    n = screenFrameGenFactor((st.curTs - st.prevTs) / 1000);
    // com o par distante demais (n = 1) fica no anterior até dar a hora do novo
    t = n > 1 ? Math.max(0, Math.floor(((playout - st.prevTs) / (st.curTs - st.prevTs)) * n)) / n : 0;
  }
  entry.fgFactor = n;
  const key = `${st.curTs}:${t}`;
  if (key === st.key) return 'idle';
  st.key = key;
  if (!r.present(screenFsrDrawOptions(entry.canvas), t)) return r.lost ? 'fail' : 'idle';
  st.fails = 0;
  entry.shown++;
  return 'shown';
}

// ---------- configurações ----------

const screenFsrSelect = document.getElementById('screenFsrSelect');
const screenFsrSharpSelect = document.getElementById('screenFsrSharpSelect');
const screenFsrStatus = document.getElementById('screenFsrStatus');
const screenFrameGenSelect = document.getElementById('screenFrameGenSelect');

function syncScreenFsrSettings() {
  if (!screenFsrSelect) return;
  screenFsrSelect.value = getScreenFsrMode();
  screenFsrSharpSelect.value = getScreenFsrSharp();
  screenFsrSharpSelect.disabled = getScreenFsrMode() === 'off';
  if (screenFrameGenSelect) screenFrameGenSelect.value = getScreenFrameGenMode();
  screenFsrStatus.textContent = screenFsrUnsupported
    ? 'este navegador ou placa de vídeo não tem WebGL2 por hardware: a tela continua como chega.'
    : '';
}

if (screenFsrSelect) {
  screenFsrSelect.addEventListener('change', () => saveScreenFsr(screenFsrSelect.value, null));
  screenFsrSharpSelect.addEventListener('change', () => saveScreenFsr(null, screenFsrSharpSelect.value));
  if (screenFrameGenSelect) screenFrameGenSelect.addEventListener('change', () => saveScreenFsr(null, null, screenFrameGenSelect.value));
  syncScreenFsrSettings();
}

// item do botão direito na tela de alguém (03-context-menus.js): liga/desliga rápido pra comparar
function appendScreenFsrMenuItem(menu) {
  const label = document.createElement('label');
  label.className = 'participant-context-menu-toggle';
  label.innerHTML = '<span>melhorar imagem (FSR)</span><input type="checkbox">';
  const input = label.querySelector('input');
  input.checked = getScreenFsrMode() !== 'off';
  input.addEventListener('change', () => saveScreenFsr(input.checked ? 'upscale' : 'off', null));
  menu.appendChild(label);
  const fgLabel = document.createElement('label');
  fgLabel.className = 'participant-context-menu-toggle';
  fgLabel.innerHTML = '<span>gerar quadros (mais fps)</span><input type="checkbox">';
  const fgInput = fgLabel.querySelector('input');
  fgInput.checked = getScreenFrameGenMode() !== 'off';
  fgInput.addEventListener('change', () => saveScreenFsr(null, null, fgInput.checked ? 'auto' : 'off'));
  menu.appendChild(fgLabel);
}
