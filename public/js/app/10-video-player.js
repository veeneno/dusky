// dusky — Player de vídeo próprio
// Parte 10 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - player de vídeo próprio (chat e visualizador)

// ===================================================================
// player de vídeo próprio (chat e visualizador)
// ===================================================================
// Controles no estilo do app: play, barra de progresso (com o que já carregou), tempo, volume
// lembrado, velocidade, tela cheia e abrir no visualizador. No chat, passar o mouse toca uma
// prévia sem som (dá pra desligar em configurações → chat).

const VIDEO_VOLUME_KEY = 'dusky:videoVolume';
const VIDEO_SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75];
const VP_ICONS = {
  play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  vol: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
  mute: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>',
  full: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  expand: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  loop: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
};

function formatClock(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s2 = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s2}` : `${m}:${s2}`;
}

function savedVideoVolume() {
  try { const v = JSON.parse(localStorage.getItem(VIDEO_VOLUME_KEY) || 'null'); if (v && typeof v.volume === 'number') return v; } catch (_) { /* ok */ }
  return { volume: 0.8, muted: false };
}

function createVideoPlayer(src, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'vplayer' + (opts.large ? ' is-large' : '');
  wrap.tabIndex = 0;
  wrap.innerHTML = `
      <video preload="metadata" playsinline></video>
      <button type="button" class="vplayer-big" aria-label="tocar">${VP_ICONS.play}</button>
      <div class="vplayer-bar">
        <button type="button" class="vplayer-btn vplayer-play" aria-label="tocar">${VP_ICONS.play}</button>
        <span class="vplayer-time">0:00 / 0:00</span>
        <div class="vplayer-track" role="slider" aria-label="posição do vídeo" tabindex="-1">
          <div class="vplayer-buffered"></div><div class="vplayer-played"><span class="vplayer-knob"></span></div>
        </div>
        <button type="button" class="vplayer-btn vplayer-speed" title="velocidade">1x</button>
        <span class="vplayer-volume">
          <button type="button" class="vplayer-btn vplayer-mute" aria-label="mutar">${VP_ICONS.vol}</button>
          <input type="range" class="vplayer-vol" min="0" max="1" step="0.05" aria-label="volume">
        </span>
        <button type="button" class="vplayer-btn vplayer-loop" title="repetir">${VP_ICONS.loop}</button>
        ${opts.onExpand ? `<button type="button" class="vplayer-btn vplayer-expand" title="abrir no visualizador">${VP_ICONS.expand}</button>` : ''}
        <button type="button" class="vplayer-btn vplayer-full" title="tela cheia (F)">${VP_ICONS.full}</button>
      </div>`;
  const v = wrap.querySelector('video');
  v.src = src;
  const q = (c) => wrap.querySelector(c);
  const vol = q('.vplayer-vol');
  const saved = savedVideoVolume();
  v.volume = saved.volume; vol.value = String(saved.volume);
  let userStarted = false;
  let previewing = false;

  const sync = () => {
    const playing = !v.paused && !v.ended;
    wrap.classList.toggle('is-playing', playing && !previewing);
    wrap.classList.toggle('is-previewing', previewing);
    q('.vplayer-play').innerHTML = playing && !previewing ? VP_ICONS.pause : VP_ICONS.play;
    q('.vplayer-time').textContent = `${formatClock(v.currentTime)} / ${formatClock(v.duration)}`;
    const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0;
    q('.vplayer-played').style.width = `${pct}%`;
    if (v.buffered.length && v.duration) q('.vplayer-buffered').style.width = `${(v.buffered.end(v.buffered.length - 1) / v.duration) * 100}%`;
    const muted = v.muted || v.volume === 0;
    q('.vplayer-mute').innerHTML = muted ? VP_ICONS.mute : VP_ICONS.vol;
    q('.vplayer-loop').classList.toggle('is-on', v.loop);
  };
  const start = () => {
    if (previewing) { previewing = false; v.currentTime = 0; }
    userStarted = true;
    v.muted = savedVideoVolume().muted;
    v.play().catch(() => {});
  };
  const toggle = () => { if (v.paused || v.ended || previewing) start(); else v.pause(); };
  const persistVolume = () => { try { localStorage.setItem(VIDEO_VOLUME_KEY, JSON.stringify({ volume: v.volume, muted: v.muted })); } catch (_) { /* ok */ } };

  ['play', 'pause', 'timeupdate', 'durationchange', 'progress', 'volumechange', 'ended', 'loadedmetadata'].forEach((ev) => v.addEventListener(ev, sync));
  v.addEventListener('click', toggle);
  v.addEventListener('dblclick', () => q('.vplayer-full').click());
  q('.vplayer-big').addEventListener('click', start);
  q('.vplayer-play').addEventListener('click', toggle);
  q('.vplayer-mute').addEventListener('click', () => { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.6; persistVolume(); });
  vol.addEventListener('input', () => { v.volume = Number(vol.value); v.muted = v.volume === 0; persistVolume(); });
  q('.vplayer-speed').addEventListener('click', (e) => {
    const next = VIDEO_SPEEDS[(VIDEO_SPEEDS.indexOf(v.playbackRate) + 1) % VIDEO_SPEEDS.length] || 1;
    v.playbackRate = next;
    e.currentTarget.textContent = `${next}x`;
  });
  q('.vplayer-loop').addEventListener('click', () => { v.loop = !v.loop; sync(); });
  q('.vplayer-full').addEventListener('click', () => {
    if (document.fullscreenElement === wrap) document.exitFullscreen().catch(() => {});
    else wrap.requestFullscreen().catch(() => {});
  });
  if (opts.onExpand) q('.vplayer-expand').addEventListener('click', () => { v.pause(); opts.onExpand(v.currentTime); });

  // arrastar na barra de progresso
  const track = q('.vplayer-track');
  const seekTo = (e) => {
    const r = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (v.duration) v.currentTime = t * v.duration;
  };
  track.addEventListener('pointerdown', (e) => {
    if (previewing) { previewing = false; userStarted = true; v.muted = savedVideoVolume().muted; }
    track.setPointerCapture(e.pointerId);
    wrap.classList.add('is-seeking');
    seekTo(e);
  });
  track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) seekTo(e); });
  track.addEventListener('pointerup', () => wrap.classList.remove('is-seeking'));

  wrap.addEventListener('keydown', (e) => {
    if (e.target.closest('input')) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
    else if (e.key === 'f') q('.vplayer-full').click();
    else if (e.key === 'm') q('.vplayer-mute').click();
    else if (e.key === 'ArrowRight' && !opts.large) { e.preventDefault(); v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); }
    else if (e.key === 'ArrowLeft' && !opts.large) { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5); }
  });

  // prévia sem som ao passar o mouse (só antes de a pessoa dar play de verdade)
  if (opts.hoverPreview) {
    wrap.addEventListener('mouseenter', () => {
      if (userStarted || !getPref('prefAutoplayVideo')) return;
      previewing = true; v.muted = true;
      v.play().catch(() => { previewing = false; });
    });
    wrap.addEventListener('mouseleave', () => {
      if (!previewing) return;
      v.pause(); previewing = false; v.currentTime = 0; sync();
    });
  }
  if (opts.startAt) v.addEventListener('loadedmetadata', () => { v.currentTime = opts.startAt; }, { once: true });
  if (opts.autoplay) { userStarted = true; v.muted = savedVideoVolume().muted; v.autoplay = true; }
  wrap.video = v;
  sync();
  return wrap;
}
