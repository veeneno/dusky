// dusky — Melhorar a tela dos outros (FSR 1), do lado de quem assiste
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
//     no desenho (screenFsrDrawOptions), sem canvas extra
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

function getScreenFsrMode() {
  try {
    const v = localStorage.getItem(SCREEN_FSR_KEY);
    return v === 'sharpen' || v === 'upscale' ? v : 'off';
  } catch (_) { return 'off'; }
}
function getScreenFsrSharp() {
  try {
    const v = localStorage.getItem(SCREEN_FSR_SHARP_KEY);
    return SCREEN_FSR_STOPS[v] != null ? v : 'mid';
  } catch (_) { return 'mid'; }
}
function saveScreenFsr(mode, sharp) {
  try {
    if (mode) localStorage.setItem(SCREEN_FSR_KEY, mode);
    if (sharp) localStorage.setItem(SCREEN_FSR_SHARP_KEY, sharp);
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

function screenFsrLabel(info) {
  if (!info || !info.srcW) return '';
  return info.easu ? `FSR ${info.srcH}p → ${info.outH}p` : 'FSR nitidez';
}

// ---------- navegador / app do Windows: canvas por cima do <video> ----------

// um canvas (e um contexto WebGL) por tela de pessoa, reaproveitado: o card da tela é refeito a
// cada mudança da call (renderScreenShareArea) e criar um contexto WebGL por vez estouraria o limite
// do navegador (~16) e jogaria memória da placa fora
const screenFsrViews = new Map(); // userId -> { canvas, badge, fsr, video, token }
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
  if (getScreenFsrMode() === 'off' || screenFsrUnsupported || !window.DuskyFsr) {
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
    view = { canvas, badge, fsr, video: null, token: 0, label: '' };
    screenFsrViews.set(userId, view);
  }
  view.video = video;
  const token = ++view.token;
  video.after(view.canvas);
  tile.appendChild(view.badge);
  tile.classList.add('has-fsr');

  const schedule = () => {
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(frame);
    else requestAnimationFrame(frame);
  };
  const frame = () => {
    if (view.token !== token || !video.isConnected) return; // card refeito ou tela saiu
    if (video.videoWidth && video.videoHeight) {
      if (!view.fsr.draw(video, video.videoWidth, video.videoHeight, screenFsrDrawOptions(view.canvas))) {
        if (view.fsr.lost) {
          // a placa derrubou o contexto (driver reiniciou, memória): volta pro vídeo original
          console.warn('[fsr] contexto WebGL perdido — mostrando a tela original');
          tile.classList.remove('has-fsr');
          dropScreenFsrView(userId);
          return;
        }
      } else {
        const label = screenFsrLabel(view.fsr.info);
        if (label !== view.label) { view.label = label; view.badge.textContent = label; }
      }
    }
    schedule();
  };
  schedule();
}

// ---------- configurações ----------

const screenFsrSelect = document.getElementById('screenFsrSelect');
const screenFsrSharpSelect = document.getElementById('screenFsrSharpSelect');
const screenFsrStatus = document.getElementById('screenFsrStatus');

function syncScreenFsrSettings() {
  if (!screenFsrSelect) return;
  screenFsrSelect.value = getScreenFsrMode();
  screenFsrSharpSelect.value = getScreenFsrSharp();
  screenFsrSharpSelect.disabled = getScreenFsrMode() === 'off';
  screenFsrStatus.textContent = screenFsrUnsupported
    ? 'este navegador ou placa de vídeo não tem WebGL2 por hardware: a tela continua como chega.'
    : '';
}

if (screenFsrSelect) {
  screenFsrSelect.addEventListener('change', () => saveScreenFsr(screenFsrSelect.value, null));
  screenFsrSharpSelect.addEventListener('change', () => saveScreenFsr(null, screenFsrSharpSelect.value));
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
}
