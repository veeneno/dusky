// TV do mundinho (docs/MUNDINHO.md): mostra a tela que alguém da call compartilhou, ou um vídeo
// do YouTube que toca sincronizado pra todo mundo. Cada um pode mutar a TV só pra si, mudar o
// volume e pôr em tela cheia.
//
// Como a imagem aparece "dentro" do 3D: o vídeo (ou o iframe do YouTube) é um elemento HTML de
// verdade, posicionado em 3D pelo CSS3DRenderer numa camada ATRÁS do canvas. Na tela da TV, o canvas
// desenha um "furo" transparente — então o vídeo aparece ali, e um boneco que passa na frente tampa
// a TV direitinho. Isso não custa quase nada: quem desenha o vídeo é o próprio navegador.
import * as THREE from '/vendor/three/0.170.0/three.module.min.js';
import { CSS3DRenderer, CSS3DObject } from '/vendor/three/0.170.0/CSS3DRenderer.js';

const PX = 1280; // largura "virtual" do elemento da TV (o CSS3D escala pro tamanho da tela)
const TV_VOLUME_KEY = 'didiscord:worldTvVolume';
const TV_MUTED_KEY = 'didiscord:worldTvMuted';

function loadPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
}
function savePref(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* segue sem salvar */ }
}

// carrega a API de iframe do YouTube uma vez só (e só quando alguém põe um vídeo)
let ytReady = null;
function loadYouTubeApi() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    const fail = () => { ytReady = null; reject(new Error('não deu pra carregar o YouTube')); };
    s.onerror = fail;
    // rede travada (firewall, bloqueio): não fica esperando pra sempre
    setTimeout(() => { if (!(window.YT && window.YT.Player)) fail(); }, 15000);
    document.head.appendChild(s);
  });
  return ytReady;
}

export function createTv({ scene, camera, container, def, api }) {
  // ---------- camada CSS3D (atrás do canvas) ----------
  const css = new CSS3DRenderer();
  css.domElement.className = 'world-css-layer';
  container.prepend(css.domElement);

  const outer = document.createElement('div');
  outer.className = 'world-tv-outer';
  outer.style.width = `${PX}px`;
  outer.style.height = `${Math.round(PX * def.h / def.w)}px`;
  // o elemento de dentro é o que vai pra tela cheia (o de fora carrega a transformação 3D)
  const inner = document.createElement('div');
  inner.className = 'world-tv-inner';
  outer.appendChild(inner);
  const obj = new CSS3DObject(outer);
  obj.position.set(def.x, def.y, def.z + 0.002);
  obj.rotation.y = def.ry || 0;
  obj.scale.setScalar(def.w / PX);
  const cssScene = new THREE.Scene();
  cssScene.add(obj);

  // ---------- a TV no 3D ----------
  const group = new THREE.Group();
  group.position.set(def.x, def.y, def.z);
  group.rotation.y = def.ry || 0;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(def.w + 0.1, def.h + 0.1, 0.07), new THREE.MeshStandardMaterial({ color: 0x0c0c0f, roughness: 0.3, metalness: 0.3 }));
  bezel.position.z = -0.04;
  group.add(bezel);
  const offMat = new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.12, metalness: 0.4, emissive: 0x141833, emissiveIntensity: 0.35 });
  // furo: escreve transparente (alfa 0) por cima de tudo que estiver atrás no canvas
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(def.w, def.h), offMat);
  screen.position.z = 0.001;
  screen.userData.isTv = true;
  group.add(screen);
  // brilho no chão/parede quando ligada
  const glow = new THREE.PointLight(0x8fb0ff, 0, 7, 1.8);
  glow.position.set(0, 0, 1.2);
  group.add(glow);
  scene.add(group);

  // ---------- estado ----------
  let tv = { mode: 'off' };
  let serverOffset = 0; // relógio do servidor - o meu
  let player = null;    // YT.Player
  let playerVideoId = null;
  let videoEl = null;
  let screenUserId = null;
  let volume = loadPref(TV_VOLUME_KEY, 80);
  let muted = loadPref(TV_MUTED_KEY, false);
  let lastSync = 0;

  function expectedPosition() {
    if (tv.mode !== 'youtube') return 0;
    const now = Date.now() + serverOffset;
    return tv.playing ? tv.position + Math.max(0, now - tv.refAt) / 1000 : tv.position;
  }

  function clearContent() {
    if (player) { try { player.destroy(); } catch (_) { /* já foi */ } }
    player = null;
    playerVideoId = null;
    if (videoEl) { videoEl.srcObject = null; videoEl.remove(); }
    videoEl = null;
    screenUserId = null;
    inner.innerHTML = '';
  }

  function placeholder(text, actionLabel, onAction) {
    const card = document.createElement('div');
    card.className = 'world-tv-card';
    card.innerHTML = '<span class="world-tv-card-emoji">📺</span><strong></strong>';
    card.querySelector('strong').textContent = text;
    if (actionLabel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = actionLabel;
      b.addEventListener('click', onAction);
      card.appendChild(b);
    }
    inner.appendChild(card);
  }

  function showScreen() {
    const info = api.getScreenStream(tv.userId);
    if (screenUserId === tv.userId && videoEl && info && videoEl.srcObject === info.stream) return;
    clearContent();
    screenUserId = tv.userId;
    if (!info) { placeholder(`${api.userName(tv.userId)} está compartilhando a tela`); return; }
    if (info.native) { placeholder('você está mostrando a sua tela na TV'); return; }
    if (info.stopped) { placeholder(`você parou de assistir a tela de ${api.userName(tv.userId)}`); return; }
    videoEl = document.createElement('video');
    videoEl.className = 'world-tv-video';
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true; // o som da tela continua saindo pelo caminho de sempre da call (ver 27-world.js)
    videoEl.srcObject = info.stream;
    videoEl.play().catch(() => {});
    inner.appendChild(videoEl);
  }

  async function showYoutube() {
    if (player && playerVideoId === tv.videoId) { syncYoutube(true); return; }
    clearContent();
    playerVideoId = tv.videoId;
    const host = document.createElement('div');
    inner.appendChild(host);
    let YT;
    try { YT = await loadYouTubeApi(); } catch (err) { placeholder('não deu pra carregar o YouTube'); return; }
    if (tv.mode !== 'youtube' || tv.videoId !== playerVideoId) return;
    player = new YT.Player(host, {
      width: '100%',
      height: '100%',
      videoId: tv.videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, start: Math.floor(expectedPosition()) },
      events: {
        onReady: () => { applyVolume(); syncYoutube(true); },
      },
    });
  }

  // mantém o vídeo no mesmo ponto pra todo mundo (corrige se passar de 1,5 s de diferença)
  function syncYoutube(force) {
    if (!player || typeof player.getPlayerState !== 'function') return;
    const st = player.getPlayerState();
    const want = expectedPosition();
    const cur = player.getCurrentTime ? player.getCurrentTime() : 0;
    if (tv.playing && st !== 1 && st !== 3) player.playVideo();
    if (!tv.playing && st === 1) player.pauseVideo();
    if (force || Math.abs(cur - want) > 1.5) player.seekTo(want, true);
  }

  // volume do YouTube: o meu volume, mutado só pra mim, e mais baixo quanto mais longe da TV
  function distanceFactor() {
    if (document.fullscreenElement === inner) return 1;
    const me = api.myPosition();
    if (!me) return 1;
    const d = Math.hypot(me.x - def.x, (me.y + 1.4) - def.y, me.z - def.z);
    return Math.max(0.12, Math.min(1, 1.35 - d / 14));
  }
  function applyVolume() {
    const effective = muted ? 0 : volume;
    if (player && typeof player.setVolume === 'function') {
      player.setVolume(Math.round(effective * distanceFactor()));
      if (effective === 0) player.mute(); else player.unMute();
    }
    api.setTvAudio({ muted, volume }); // som da tela compartilhada (27-world.js)
  }

  function render() {
    const on = tv.mode !== 'off';
    screen.material = on ? holeMat : offMat;
    glow.intensity = on ? 3 : 0;
    outer.style.display = on ? '' : 'none';
    if (tv.mode === 'screen') showScreen();
    else if (tv.mode === 'youtube') showYoutube();
    else clearContent();
    refreshPanel();
  }

  // ---------- painel da TV (folha arredondada) ----------
  const panel = document.createElement('div');
  panel.className = 'world-sheet world-tv-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="world-sheet-head">
      <span class="world-sheet-icon">📺</span>
      <div class="world-sheet-title"><strong>TV da sala</strong><small class="world-tv-status"></small></div>
      <button type="button" class="world-round-btn is-small" data-tv="close" title="fechar">✕</button>
    </div>
    <div class="world-tv-section world-tv-controls" data-show="youtube">
      <button type="button" class="world-round-btn" data-tv="back" title="voltar 10 s">⏪</button>
      <button type="button" class="world-round-btn is-big" data-tv="playpause" title="tocar/pausar">⏯️</button>
      <button type="button" class="world-round-btn" data-tv="fwd" title="avançar 10 s">⏩</button>
    </div>
    <div class="world-tv-section">
      <span class="world-tv-label">só pra você</span>
      <div class="world-tv-me">
        <button type="button" class="world-round-btn" data-tv="mute" title="mutar a TV só pra você">🔊</button>
        <input type="range" min="0" max="100" step="5" class="world-tv-volume" aria-label="volume da TV">
        <button type="button" class="world-round-btn" data-tv="fullscreen" title="tela cheia">⛶</button>
      </div>
    </div>
    <div class="world-tv-section">
      <span class="world-tv-label">colocar na TV</span>
      <form class="world-tv-yt">
        <input type="text" placeholder="cole um link do YouTube" autocomplete="off" spellcheck="false">
        <button type="submit" class="world-pill-btn">▶ passar</button>
      </form>
      <div class="world-tv-screens"></div>
    </div>
    <button type="button" class="world-pill-btn is-ghost world-tv-off" data-tv="off">desligar a TV</button>`;
  container.appendChild(panel);
  const ytForm = panel.querySelector('.world-tv-yt');
  const ytInput = ytForm.querySelector('input');
  const volInput = panel.querySelector('.world-tv-volume');
  volInput.value = String(volume);

  function refreshPanel() {
    if (panel.hidden) return;
    const status = panel.querySelector('.world-tv-status');
    status.textContent = tv.mode === 'off' ? 'desligada'
      : tv.mode === 'screen' ? `tela de ${api.userName(tv.userId)}`
        : `YouTube · ${tv.playing ? 'tocando' : 'pausado'}${tv.by ? ` · por ${api.userName(tv.by)}` : ''}`;
    panel.querySelectorAll('[data-show="youtube"]').forEach((el) => { el.hidden = tv.mode !== 'youtube'; });
    panel.querySelector('[data-tv="mute"]').textContent = muted ? '🔇' : '🔊';
    panel.querySelector('[data-tv="mute"]').classList.toggle('is-on', muted);
    panel.querySelector('[data-tv="playpause"]').textContent = tv.playing ? '⏸️' : '▶️';
    panel.querySelector('.world-tv-off').hidden = tv.mode === 'off';
    panel.querySelector('[data-tv="fullscreen"]').disabled = tv.mode === 'off';
    // quem está compartilhando a tela agora (e eu, se não estiver)
    const list = panel.querySelector('.world-tv-screens');
    list.innerHTML = '';
    for (const s of api.screenSharers()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'world-pill-btn is-soft' + (tv.mode === 'screen' && tv.userId === s.id ? ' is-on' : '');
      b.textContent = s.isSelf ? '🖥️ mostrar a minha tela' : `🖥️ tela de ${s.name}`;
      b.addEventListener('click', () => api.sendTv({ op: 'screen', userId: s.id }));
      list.appendChild(b);
    }
    if (!api.screenSharers().some((s) => s.isSelf)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'world-pill-btn is-soft';
      b.textContent = '🖥️ compartilhar a minha tela';
      b.addEventListener('click', () => api.startScreenShare());
      list.appendChild(b);
    }
  }

  function openPanel() {
    panel.hidden = false;
    refreshPanel();
  }
  function closePanel() { panel.hidden = true; }
  function togglePanel() { if (panel.hidden) openPanel(); else closePanel(); }

  ytForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = ytInput.value.trim();
    if (!url) return;
    api.sendTv({ op: 'youtube', url });
    ytInput.value = '';
  });
  // digitar o link não pode andar o boneco
  ytInput.addEventListener('keydown', (e) => e.stopPropagation());
  volInput.addEventListener('input', () => {
    volume = Number(volInput.value);
    savePref(TV_VOLUME_KEY, volume);
    applyVolume();
  });

  function toggleFullscreen() {
    if (tv.mode === 'off') return;
    if (document.fullscreenElement === inner) document.exitFullscreen().catch(() => {});
    else inner.requestFullscreen().catch(() => {});
  }
  inner.addEventListener('fullscreenchange', applyVolume);

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tv]');
    if (!b) return;
    const act = b.dataset.tv;
    if (act === 'close') closePanel();
    else if (act === 'off') api.sendTv({ op: 'off' });
    else if (act === 'mute') { muted = !muted; savePref(TV_MUTED_KEY, muted); applyVolume(); refreshPanel(); }
    else if (act === 'fullscreen') toggleFullscreen();
    else if (act === 'playpause') api.sendTv({ op: tv.playing ? 'pause' : 'play', position: expectedPosition() });
    else if (act === 'back') api.sendTv({ op: 'seek', position: Math.max(0, expectedPosition() - 10) });
    else if (act === 'fwd') api.sendTv({ op: 'seek', position: expectedPosition() + 10 });
  });

  // ---------- interface pro mundo ----------
  function setState(next, serverNow) {
    if (serverNow) serverOffset = serverNow - Date.now();
    const prev = tv;
    tv = next && next.mode ? next : { mode: 'off' };
    const changedSource = prev.mode !== tv.mode || prev.videoId !== tv.videoId || prev.userId !== tv.userId;
    if (changedSource) render();
    else if (tv.mode === 'youtube') { syncYoutube(true); refreshPanel(); }
    applyVolume();
  }

  // a lista de telas compartilhadas mudou (alguém começou/parou): refaz o vídeo e o painel
  function screensChanged() {
    if (tv.mode === 'screen') showScreen(); // só refaz o vídeo se a fonte mudou de verdade
    refreshPanel();
  }

  function update(now) {
    if (tv.mode === 'youtube' && now - lastSync > 1000) {
      lastSync = now;
      syncYoutube(false);
      applyVolume();
    }
  }

  function renderCss(w, h) {
    if (tv.mode === 'off') return;
    if (css.domElement.clientWidth !== w || css.domElement.clientHeight !== h) css.setSize(w, h);
    css.render(cssScene, camera);
  }

  function resize(w, h) { css.setSize(w, h); }

  function destroy() {
    if (document.fullscreenElement === inner) document.exitFullscreen().catch(() => {});
    clearContent();
    panel.remove();
    css.domElement.remove();
    api.setTvAudio({ muted: false, volume: 100 });
  }

  render();
  applyVolume();
  return { setState, screensChanged, update, renderCss, resize, destroy, openPanel, togglePanel, closePanel, toggleFullscreen, screen, isPanelOpen: () => !panel.hidden };
}
