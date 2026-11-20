/* Catálogo local e ciclo de vida das animações (molduras, placas, efeito do perfil e avatares em GIF).
   Não acessa o Discord.

   Quando algo anima segue a preferência "efeitos de perfil" (acessibilidade → html[data-fx-motion],
   ver 02-preferences.js e o fim do profile.css):
     always  anima sempre que estiver na tela
     hover   (padrão) no chat, membros, DMs e call fica PARADO (o "preview" estático do catálogo, ou
             o 1º quadro do GIF do avatar) e anima com o mouse na linha; nas vitrines (cartão de
             perfil, editor de perfil, visualizador) anima sempre
     off     nunca anima
   E nunca com a janela sem foco (html[data-fx-idle]) ou com "reduzir movimento".
   Por quê: APNG da moldura, vídeo da placa e GIF do avatar são decodificados e redesenhados quadro a
   quadro — com várias pessoas na tela, o app parado gastava processador à toa. */
(() => {
  'use strict';
  const items = window.DUSKY_DECOR_CATALOG?.items || [];
  const index = new Map(items.map(item => [item.id, item]));
  const root = document.documentElement;
  // só a opção do app ("reduzir animações"). O "efeitos de animação" do Windows/sistema NÃO conta:
  // muita gente desliga ele por desempenho e ficava sem GIF nem efeito, com tudo ligado no dusky
  const motionOff = () => root.hasAttribute('data-reduce-motion');
  // linhas que "acordam" com o mouse e vitrines que animam sempre (as mesmas do profile.css)
  const ROWS = '.msg-group, .member-item, .dm-item, .call-participant, .channel-voice-preview-avatar, .profile-avatar-wrap';
  const SHOWCASE = '.pc-avatar, .pc-fx, .catalog-profile-fx, .profile-edit-avatar, #decorEditor, .media-viewer';
  let hoverRow = null;
  // pode animar AGORA? (hovered: o próprio elemento está com o mouse — placa do nome)
  function allowed(el, hovered) {
    const mode = root.getAttribute('data-fx-motion') || 'hover';
    if (mode === 'off' || motionOff() || document.hidden || root.hasAttribute('data-fx-idle')) return false;
    if (mode === 'always' || hovered) return true;
    if (el.closest(SHOWCASE)) return true;
    return !!hoverRow && hoverRow.contains(el);
  }
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
    const play = state.visible && state.el.isConnected && allowed(state.el, state.hovered?.());
    if (play && !state.stop) state.stop = state.start();
    else if (!play && state.stop) { state.stop(); state.stop = null; }
  }
  function watch(el, start, hovered) {
    const state = { el, start, hovered, visible: false, stop: null };
    watched.set(el, state);
    observer.observe(el);
    return state;
  }
  const update = () => {
    for (const [el, state] of watched) {
      if (!el.isConnected) {
        state.stop?.(); observer.unobserve(el); watched.delete(el);
      } else sync(state);
    }
  };
  // várias mudanças no DOM seguidas (lista de membros redesenhada, mensagens chegando) = UMA passada
  let updatePending = false;
  const scheduleUpdate = () => {
    if (updatePending) return;
    updatePending = true;
    queueMicrotask(() => { updatePending = false; update(); });
  };
  new MutationObserver(scheduleUpdate).observe(root, { childList: true, subtree: true });
  new MutationObserver(scheduleUpdate).observe(root, { attributes: true, attributeFilter: ['data-reduce-motion', 'data-fx-motion', 'data-fx-idle'] });
  document.addEventListener('visibilitychange', scheduleUpdate);
  // mouse entrou/saiu de uma linha: só reavalia o que está dentro dela (e da que ficou pra trás)
  document.addEventListener('pointerover', e => {
    const row = e.target instanceof Element ? e.target.closest(ROWS) : null;
    if (row === hoverRow) return;
    const prev = hoverRow;
    hoverRow = row;
    for (const [el, state] of watched) {
      if ((prev && prev.contains(el)) || (row && row.contains(el))) sync(state);
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    if (!hoverRow) return;
    hoverRow = null;
    scheduleUpdate();
  });

  // ---------- avatar em GIF: parado no 1º quadro até poder animar ----------
  // Os avatares animados ficam no próprio servidor (/uploads/avatars/*.gif — upload ou GIPHY): dá pra
  // desenhar o quadro num canvas sem problema de origem. A versão parada é guardada por endereço.
  const GIF_AVATAR = /\/uploads\/avatars\/[^/?#]+\.gif(?:[?#]|$)/i;
  const stills = new Map(); // endereço do GIF -> Promise<endereço blob: da imagem parada>
  function stillOf(img, src) {
    if (!stills.has(src)) {
      const p = new Promise((resolve, reject) => {
        const draw = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            if (!c.width || !c.height) throw new Error('imagem vazia');
            c.getContext('2d').drawImage(img, 0, 0);
            c.toBlob(b => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('sem quadro'))), 'image/png');
          } catch (err) { reject(err); }
        };
        if (img.complete && img.naturalWidth) draw();
        else {
          img.addEventListener('load', draw, { once: true });
          img.addEventListener('error', () => reject(new Error('não carregou')), { once: true });
        }
      }).catch(err => { stills.delete(src); throw err; });
      stills.set(src, p);
      // não guarda pra sempre: só os mais recentes (cada pessoa tem um avatar)
      if (stills.size > 200) {
        const [oldSrc, oldP] = stills.entries().next().value;
        stills.delete(oldSrc);
        oldP.then(u => URL.revokeObjectURL(u)).catch(() => {});
      }
    }
    return stills.get(src);
  }
  function freezeAvatar(img) {
    if (img.dataset.animSrc || img.classList.contains('avatar-deco')) return;
    const src = img.getAttribute('src') || '';
    if (!GIF_AVATAR.test(src)) return;
    img.dataset.animSrc = src;
    let still = null;
    const state = watch(img, () => {
      if (img.getAttribute('src') !== src) img.src = src;
      return () => { if (still) img.src = still; };
    });
    stillOf(img, src).then(url => {
      still = url;
      if (!state.stop && img.isConnected) img.src = still; // não está animando agora: mostra parado
    }).catch(() => { /* sem quadro parado: fica como era (animado) */ });
  }
  function scanAvatars(node) {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'IMG') freezeAvatar(node);
    else node.querySelectorAll?.('img[src*="/uploads/avatars/"]').forEach(freezeAvatar);
  }
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes') {
        // trocou o avatar (outro src): reavalia do zero
        const img = r.target;
        const now = img.getAttribute('src') || '';
        if (!img.dataset.animSrc) freezeAvatar(img); // ganhou um src de GIF depois de criado
        else if (now !== img.dataset.animSrc && !now.startsWith('blob:')) {
          delete img.dataset.animSrc;
          freezeAvatar(img);
        }
      } else r.addedNodes.forEach(scanAvatars);
    }
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  if (document.body) scanAvatars(document.body);

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
    // active = mouse/foco na linha. Toca se allowed() deixar: no "ao passar o mouse" só com active;
    // no "sempre" sozinha (quando aparece na tela); no "nunca", sem foco ou escondida, nunca
    let active = false;
    let running = false;
    const play = () => {
      if (!allowed(video, active)) return;
      running = true;
      if (!video.getAttribute('src')) video.src = item.video;
      video.play().then(() => { if (running) video.classList.add('playing'); }).catch(() => {});
    };
    const stop = () => {
      running = false; video.pause(); video.classList.remove('playing');
      if (video.readyState) video.currentTime = 0;
    };
    const enter = () => { active = true; play(); };
    const leave = () => { active = false; if (!allowed(video, false)) stop(); };
    const focusout = e => { if (!row.contains(e.relatedTarget)) leave(); };
    row.addEventListener('pointerenter', enter); row.addEventListener('pointerleave', leave);
    row.addEventListener('focusin', enter); row.addEventListener('focusout', focusout);
    watch(video, () => { play(); return stop; }, () => active);
    nameplates.set(row, () => {
      active = false; stop(); video.remove();
      row.removeEventListener('pointerenter', enter); row.removeEventListener('pointerleave', leave);
      row.removeEventListener('focusin', enter); row.removeEventListener('focusout', focusout);
    });
  }

  function profile(fx, item) {
    fx.classList.add('catalog-profile-fx');
    // o efeito do Discord é desenhado numa tela de 450x880 (1,5x o cartão de 300 px): as camadas ficam
    // dentro de um "palco" com essa proporção, preso no topo e com a largura do cartão — assim nada
    // estica quando o cartão é mais alto ou mais baixo (o que passa da altura é cortado embaixo)
    const stage = document.createElement('div');
    stage.className = 'catalog-fx-stage';
    fx.appendChild(stage);
    const poster = document.createElement('img');
    poster.className = 'catalog-fx-poster'; poster.src = item.preview; poster.alt = '';
    stage.appendChild(poster);
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
            img.src = url; stage.appendChild(img);
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
