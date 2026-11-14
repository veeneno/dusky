/* Catálogo local e ciclo de vida das animações. Não acessa o Discord. */
(() => {
  'use strict';
  const items = window.DUSKY_DECOR_CATALOG?.items || [];
  const index = new Map(items.map(item => [item.id, item]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOff = () => reduced.matches || document.documentElement.hasAttribute('data-reduce-motion');
  const watched = new Map();
  const blobs = new Map();
  const nameplates = new WeakMap();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = watched.get(entry.target);
      if (state) { state.visible = entry.isIntersecting; sync(state); }
    }
  });
  function sync(state) {
    const play = state.visible && !document.hidden && !motionOff() && state.el.isConnected;
    if (play && !state.stop) state.stop = state.start();
    else if (!play && state.stop) { state.stop(); state.stop = null; }
  }
  function watch(el, start) {
    const state = { el, start, visible: false, stop: null };
    watched.set(el, state);
    observer.observe(el);
  }
  const update = () => {
    for (const [el, state] of watched) {
      if (!el.isConnected) {
        state.stop?.(); observer.unobserve(el); watched.delete(el);
      } else sync(state);
    }
  };
  new MutationObserver(update).observe(document.documentElement, { childList: true, subtree: true });
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduce-motion'] });
  reduced.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);

  async function blob(src) {
    if (!blobs.has(src)) {
      const promise = fetch(src).then(r => {
        if (!r.ok) throw new Error('decoração indisponível');
        return r.blob();
      }).catch(error => { blobs.delete(src); throw error; });
      blobs.set(src, promise);
      if (blobs.size > 16) blobs.delete(blobs.keys().next().value);
    }
    return blobs.get(src);
  }

  function avatar(img, item) {
    img.src = item.preview;
    watch(img, () => {
      img.src = item.image;
      return () => { img.src = item.preview; };
    });
  }

  function clearNameplate(row) {
    nameplates.get(row)?.();
    nameplates.delete(row);
  }
  function nameplate(row, item) {
    clearNameplate(row);
    const video = document.createElement('video');
    video.className = 'catalog-nameplate-video';
    video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'none';
    video.setAttribute('aria-hidden', 'true');
    row.prepend(video);
    let active = false;
    const play = () => {
      if (!active || motionOff() || document.hidden) return;
      if (!video.getAttribute('src')) video.src = item.video;
      video.play().then(() => { if (active && !motionOff()) video.classList.add('playing'); }).catch(() => {});
    };
    const enter = () => { active = true; play(); };
    const leave = () => {
      active = false; video.pause(); video.classList.remove('playing');
      if (video.readyState) video.currentTime = 0;
    };
    const focusout = e => { if (!row.contains(e.relatedTarget)) leave(); };
    row.addEventListener('pointerenter', enter); row.addEventListener('pointerleave', leave);
    row.addEventListener('focusin', enter); row.addEventListener('focusout', focusout);
    watch(video, () => { play(); return leave; });
    nameplates.set(row, () => {
      leave(); video.remove();
      row.removeEventListener('pointerenter', enter); row.removeEventListener('pointerleave', leave);
      row.removeEventListener('focusin', enter); row.removeEventListener('focusout', focusout);
    });
  }

  function profile(fx, item) {
    fx.classList.add('catalog-profile-fx');
    const poster = document.createElement('img');
    poster.className = 'catalog-fx-poster'; poster.src = item.preview; poster.alt = '';
    fx.appendChild(poster);
    watch(fx, () => {
      let stopped = false;
      const timers = new Set();
      const playing = new Map();
      const later = (fn, delay) => {
        const id = setTimeout(() => { timers.delete(id); if (!stopped) fn(); }, Math.max(0, delay));
        timers.add(id);
      };
      const remove = img => {
        const url = playing.get(img);
        if (url) URL.revokeObjectURL(url);
        playing.delete(img); img.remove();
      };
      // Carrega as camadas escolhidas antes de iniciar a mesma linha do tempo.
      const chosen = item.layers.map(layer => {
        const candidates = [layer.src, ...(layer.variants || [])];
        return { layer, src: candidates[Math.floor(Math.random() * candidates.length)] };
      });
      Promise.all(chosen.map(async x => ({ ...x, data: await blob(x.src) }))).then(loaded => {
        if (stopped) return;
        poster.hidden = true;
        for (const { layer, data } of loaded) {
          const run = () => {
            if (stopped) return;
            const img = document.createElement('img');
            img.alt = ''; img.className = 'catalog-fx-layer';
            const url = URL.createObjectURL(data);
            playing.set(img, url);
            img.style.zIndex = layer.zIndex;
            img.style.left = `${(layer.position?.x || 0) / 450 * 100}%`;
            img.style.top = `${(layer.position?.y || 0) / 880 * 100}%`;
            img.style.width = `${(layer.width || 450) / 450 * 100}%`;
            img.style.height = `${(layer.height || 880) / 880 * 100}%`;
            img.src = url; fx.appendChild(img);
            later(() => {
              remove(img);
              if (layer.loop) later(run, layer.loopDelay || 0);
            }, layer.duration);
          };
          later(run, layer.start);
        }
      }).catch(() => { /* mantém a imagem estática se uma mídia falhar */ });
      return () => {
        stopped = true; timers.forEach(clearTimeout); timers.clear();
        for (const img of playing.keys()) remove(img);
        poster.hidden = false;
      };
    });
  }

  window.DuskyDecor = { items, get: (slot, id) => {
    const item = index.get(id);
    return item?.slot === slot ? item : null;
  }, avatar, nameplate, clearNameplate, profile };
})();
