// dusky — Menus de contexto (botão direito)
// Parte 3 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - menu de contexto (clique direito num participante) — ajustes que valem só pro meu lado
//   - menu de contexto (clique direito numa tile de compartilhamento de tela)

// ---------- menu de contexto (clique direito num participante) — ajustes que valem só pro meu lado ----------
let openContextMenuEl = null;

function closeParticipantContextMenu() {
  if (!openContextMenuEl) return;
  openContextMenuEl.remove();
  openContextMenuEl = null;
  document.removeEventListener('mousedown', handleContextMenuOutsideClick, true);
  document.removeEventListener('keydown', handleContextMenuEscape, true);
}

function handleContextMenuOutsideClick(e) {
  if (openContextMenuEl && !openContextMenuEl.contains(e.target)) closeParticipantContextMenu();
}

function handleContextMenuEscape(e) {
  if (e.key === 'Escape') closeParticipantContextMenu();
}

function openParticipantContextMenu(e, userId, username) {
  closeParticipantContextMenu();

  const isBot = userId === BOT_USER_ID; // bot não tem vídeo — esconde o toggle de ocultar vídeo pra ele
  const override = getLocalOverride(userId);
  const vol = getSavedVolume(userId);

  const menu = document.createElement('div');
  menu.className = 'participant-context-menu';
  menu.innerHTML = `
      <div class="participant-context-menu-title">${escapeHtml(username)}</div>
      <div class="participant-context-menu-volume">
        <div class="participant-context-menu-volume-labels">
          <span>volume</span>
          <span class="participant-context-menu-volume-value">${vol}%</span>
        </div>
        <input type="range" min="0" max="200" value="${vol}">
      </div>
      <label class="participant-context-menu-toggle">
        <span>silenciar localmente</span>
        <input type="checkbox" data-role="mute" ${override.mutedLocal ? 'checked' : ''}>
      </label>
      ${isBot ? '' : `
      <label class="participant-context-menu-toggle">
        <span>silenciar soundpad só pra mim</span>
        <input type="checkbox" data-role="mute-soundboard" ${override.soundboardMuted ? 'checked' : ''}>
      </label>
      <label class="participant-context-menu-toggle">
        <span>ocultar vídeo</span>
        <input type="checkbox" data-role="hide-video" ${override.hideVideo ? 'checked' : ''}>
      </label>`}
    `;
  appendVoiceModerationItems(menu, userId);
  appendBlockMenuItem(menu, userId, username); // 34-blocks.js
  document.body.appendChild(menu);
  openContextMenuEl = menu;

  // posiciona perto do clique, sem deixar vazar pra fora da tela
  const menuRect = menu.getBoundingClientRect();
  let left = e.clientX;
  let top = e.clientY;
  if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;
  if (top + menuRect.height > window.innerHeight - 8) top = window.innerHeight - menuRect.height - 8;
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top = Math.max(8, top) + 'px';

  const volumeRange = menu.querySelector('input[type="range"]');
  const volumeLabel = menu.querySelector('.participant-context-menu-volume-value');
  volumeRange.addEventListener('input', () => {
    const v = Number(volumeRange.value);
    volumeLabel.textContent = v + '%';
    saveVolume(userId, v);
    if (isBot) applyLocalOverridesToBotAudio();
    else applyLocalOverridesToRemoteAudio(userId);
    renderCallParticipants(); // mantém o slider da call view sincronizado, se estiver aberta
  });

  menu.querySelector('input[data-role="mute"]').addEventListener('change', (ev) => {
    const o = getLocalOverride(userId);
    o.mutedLocal = ev.target.checked;
    saveLocalOverride(userId, o);
    if (o.mutedLocal) stopParticipantSoundboard(userId);
    if (isBot) applyLocalOverridesToBotAudio();
    else applyLocalOverridesToRemoteAudio(userId);
  });
  const soundboardMuteInput = menu.querySelector('input[data-role="mute-soundboard"]');
  if (soundboardMuteInput) soundboardMuteInput.addEventListener('change', (ev) => {
    const o = getLocalOverride(userId);
    o.soundboardMuted = ev.target.checked;
    saveLocalOverride(userId, o);
    if (o.soundboardMuted) stopParticipantSoundboard(userId);
  });
  const hideVideoInput = menu.querySelector('input[data-role="hide-video"]');
  if (hideVideoInput) hideVideoInput.addEventListener('change', (ev) => {
    const o = getLocalOverride(userId);
    o.hideVideo = ev.target.checked;
    saveLocalOverride(userId, o);
    renderCallParticipants();
  });

  // só escuta clique-fora a partir do próximo ciclo, senão o clique direito que abriu
  // o menu (mousedown antes do contextmenu, dependendo do navegador) já fecharia ele na hora
  setTimeout(() => {
    document.addEventListener('mousedown', handleContextMenuOutsideClick, true);
    document.addEventListener('keydown', handleContextMenuEscape, true);
  }, 0);
}

// ---------- menu de contexto (clique direito numa tile de compartilhamento de tela) ----------
// kind = 'local' (sua própria tela, sem volume — só o toggle de infos) ou 'remote' (a tela de
// alguém, com volume 0–200% do áudio da tela + o toggle de infos). userId é null pra 'local'.
function openScreenShareContextMenu(e, kind, userId, label) {
  closeParticipantContextMenu();

  const isRemote = kind === 'remote';
  const statsKey = isRemote ? `remote:${userId}` : 'local';
  const statsVisible = getSavedScreenStatsVisible(statsKey);
  const vol = isRemote ? getSavedScreenVolume(userId) : 0;

  const menu = document.createElement('div');
  menu.className = 'participant-context-menu';
  menu.innerHTML = `
      <div class="participant-context-menu-title">${escapeHtml(label)}</div>
      ${isRemote ? `
      <div class="participant-context-menu-volume">
        <div class="participant-context-menu-volume-labels">
          <span>volume da tela</span>
          <span class="participant-context-menu-volume-value">${vol}%</span>
        </div>
        <input type="range" min="0" max="200" value="${vol}">
      </div>` : ''}
      <label class="participant-context-menu-toggle">
        <span>mostrar informações da transmissão</span>
        <input type="checkbox" data-role="stats-visible" ${statsVisible ? 'checked' : ''}>
      </label>
    `;
  document.body.appendChild(menu);
  openContextMenuEl = menu;

  const menuRect = menu.getBoundingClientRect();
  let left = e.clientX;
  let top = e.clientY;
  if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;
  if (top + menuRect.height > window.innerHeight - 8) top = window.innerHeight - menuRect.height - 8;
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top = Math.max(8, top) + 'px';

  if (isRemote) {
    const volumeRange = menu.querySelector('input[type="range"]');
    const volumeLabel = menu.querySelector('.participant-context-menu-volume-value');
    volumeRange.addEventListener('input', () => {
      const v = Number(volumeRange.value);
      volumeLabel.textContent = v + '%';
      saveScreenVolume(userId, v);
      applyLocalOverrideToRemoteScreenAudio(userId);
    });
  }

  menu.querySelector('input[data-role="stats-visible"]').addEventListener('change', (ev) => {
    saveScreenStatsVisible(statsKey, ev.target.checked);
    updateScreenStats(); // reaplica a badge na hora (mostra/some), sem esperar o próximo tick de 1s
  });

  setTimeout(() => {
    document.addEventListener('mousedown', handleContextMenuOutsideClick, true);
    document.addEventListener('keydown', handleContextMenuEscape, true);
  }, 0);
}

function micConstraints(micId) {
  // a supressão nativa do navegador (constraint noiseSuppression) fica sempre desligada aqui —
  // ela é fraca e o RNNoise (rede neural via WASM) faz esse trabalho de verdade agora, no
  // grafo do Web Audio (ver buildMicProcessingGraph). echoCancellation/autoGainControl
  // continuam ligados pois são do hardware/driver e não têm substituto aqui.
  // modo escolhido nas configurações (ver getSavedVoiceProcessing). Pede também 48 kHz e mono: é
  // o que o Opus usa, sem reamostragem nem mistura de canal no caminho
  const mode = getSavedVoiceProcessing();
  const base = {
    noiseSuppression: false,
    echoCancellation: mode === 'speakers',
    // com o nivelador do dusky ligado, o do navegador sai: dois ajustes brigando deixam a voz "bombeando"
    autoGainControl: mode !== 'studio' && !usesOwnLeveler(),
    sampleRate: { ideal: 48000 },
    channelCount: { ideal: 1 },
  };
  return micId ? { ...base, deviceId: { exact: micId } } : base;
}

// o app desktop Linux roda dentro do WebKitGTK (motor do Tauri), que historicamente tem suporte
// incompleto pro "bridging" entre Web Audio e MediaStream quando o resultado vai pra um
// RTCPeerConnection — o áudio processado (ganho, RNNoise, gate) simplesmente não chega no outro
// lado, mesmo aparecendo local (medidor/borda verde continuam funcionando, pois não passam pelo
// peer connection). Detectamos esse ambiente pra pular esse processamento só na track que é
// realmente enviada, e mandar o áudio cru do mic direto — no navegador normal nada muda.
// app ANTIGO em Tauri (call pelo WebRTC do próprio WebKit, que não aceitava o áudio processado).
// O app novo (pasta tauri/) se identifica com duskyDesktop.shell === 'tauri' e leva a call pro
// Rust — aí o microfone passa pelo processamento normal (supressão de ruído, gate, nivelador…).
function isTauriApp() {
  if (typeof window === 'undefined') return false;
  if (window.duskyDesktop && window.duskyDesktop.shell === 'tauri') return false;
  return window.__TAURI__ !== undefined || window.__TAURI_INTERNALS__ !== undefined;
}

const BADGE_MIC_OFF = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';
const BADGE_DEAFENED = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function formatTime(iso) {
  // sqlite guarda em UTC "YYYY-MM-DD HH:MM:SS"
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return getPref('prefClock24')
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function timeValue(iso) {
  return new Date(iso.replace(' ', 'T') + 'Z').getTime();
}

// escapa também aspas: o jeito antigo (textContent → innerHTML) só trocava & < >, e um texto
// com " fechava o atributo quando ia parar dentro de `attr="${...}"` (XSS pelo nome do anexo)
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// texto de embed suporta um markdown bem mínimo (**negrito** e `código`) — os embeds do bot
// de música (server/bots/musicBot/embeds.js) usam isso pra destacar título/duração das faixas
function renderEmbedText(str) {
  if (!str) return '';
  return escapeHtml(str)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
}

// monta o card de embed (respostas estruturadas do bot de música: tocando agora, fila, busca,
// etc.) a partir do JSON salvo em m.embed_json. formato vem de server/bots/musicBot/embeds.js:
// { title, description, thumbnail, color, fields: [{name, value}], footer }
function buildEmbedEl(embed) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-embed';
  if (embed.color) wrap.style.setProperty('--embed-color', embed.color);

  const body = document.createElement('div');
  body.className = 'msg-embed-body';

  if (embed.title) {
    const title = document.createElement('div');
    title.className = 'msg-embed-title';
    title.innerHTML = renderEmbedText(embed.title);
    body.appendChild(title);
  }
  if (embed.description) {
    const desc = document.createElement('div');
    desc.className = 'msg-embed-desc';
    desc.innerHTML = renderEmbedText(embed.description);
    body.appendChild(desc);
  }
  if (Array.isArray(embed.fields) && embed.fields.length) {
    const fields = document.createElement('div');
    fields.className = 'msg-embed-fields';
    for (const f of embed.fields) {
      const field = document.createElement('div');
      field.className = 'msg-embed-field';
      field.innerHTML = `<div class="msg-embed-field-name"></div><div class="msg-embed-field-value"></div>`;
      field.querySelector('.msg-embed-field-name').innerHTML = renderEmbedText(f.name);
      field.querySelector('.msg-embed-field-value').innerHTML = renderEmbedText(f.value);
      fields.appendChild(field);
    }
    body.appendChild(fields);
  }
  if (embed.footer) {
    const footer = document.createElement('div');
    footer.className = 'msg-embed-footer';
    footer.innerHTML = renderEmbedText(embed.footer);
    body.appendChild(footer);
  }

  wrap.appendChild(body);
  if (embed.thumbnail) {
    const thumb = document.createElement('img');
    thumb.className = 'msg-embed-thumb';
    thumb.src = embed.thumbnail;
    thumb.alt = '';
    thumb.loading = 'lazy';
    wrap.appendChild(thumb);
  }
  return wrap;
}
