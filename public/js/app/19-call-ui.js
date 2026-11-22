// dusky — Tela da call: atalhos, participantes, telas compartilhadas e estatísticas
// Parte 19 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - atalhos da call na barra lateral: supressão de ruído e compartilhar tela
//   - telas compartilhadas
//   - prévia da MINHA tela só roda com o dusky em foco
//   - estatísticas REAIS da transmissão de tela (resolução, fps, bitrate medidos pelo WebRTC)

// ---------- atalhos da call na barra lateral: supressão de ruído e compartilhar tela ----------
// Cada campo dos popups é um ESPELHO do campo de verdade nas configurações: muda o original e
// dispara o 'change' dele. Salvar e aplicar na call é exatamente o mesmo código das configurações.
const callQuickNoiseBtn = document.getElementById('callQuickNoiseBtn');
const callQuickScreenBtn = document.getElementById('callQuickScreenBtn');
const callQuickScreenOptsBtn = document.getElementById('callQuickScreenOptsBtn');
let quickPopup = null;

function closeQuickPopup() {
  if (!quickPopup) return;
  const p = quickPopup;
  quickPopup = null;
  p.el.remove();
  document.removeEventListener('mousedown', p.onDown, true);
  document.removeEventListener('keydown', p.onKey, true);
  window.removeEventListener('resize', closeQuickPopup);
  if (p.cleanup) p.cleanup();
}

// abre em cima do botão; clicar no mesmo botão de novo fecha. `build(el)` monta o conteúdo e pode
// devolver uma função de limpeza
function openQuickPopup(anchor, title, build) {
  const same = quickPopup && quickPopup.anchor === anchor;
  closeQuickPopup();
  if (same) return;
  const el = document.createElement('div');
  el.className = 'quick-popup';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  const head = document.createElement('div');
  head.className = 'quick-popup-title';
  head.textContent = title;
  el.appendChild(head);
  const cleanup = build(el);
  el.addEventListener('click', (e) => e.stopPropagation());
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.left)) + 'px';
  el.style.top = Math.max(8, r.top - el.offsetHeight - 8) + 'px';
  const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeQuickPopup(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeQuickPopup(); } };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', closeQuickPopup);
  quickPopup = { el, anchor, onDown, onKey, cleanup };
}

// `labels` troca o texto de algumas opções por um mais curto (o popup é estreito)
function quickMirrorSelect(parent, label, original, savedValue, labels) {
  const wrap = document.createElement('label');
  wrap.className = 'quick-popup-field';
  const span = document.createElement('span');
  span.textContent = label;
  const sel = document.createElement('select');
  for (const opt of original.options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = (labels && labels[opt.value]) || opt.textContent;
    sel.appendChild(o);
  }
  sel.value = String(savedValue);
  sel.addEventListener('change', () => {
    original.value = sel.value;
    original.dispatchEvent(new Event('change'));
  });
  wrap.append(span, sel);
  parent.appendChild(wrap);
  return sel;
}

function openNoisePopup() {
  openQuickPopup(callQuickNoiseBtn, 'supressão de ruído', (el) => {
    const mode = quickMirrorSelect(el, 'modo', noiseSuppressionSelect, getSavedNoiseSuppression(),
      { deepfilter: 'avançada (recomendado)', rnnoise: 'leve', off: 'nenhuma' });
    let level = null;
    if (noiseSuppressionLevelSelect) {
      level = quickMirrorSelect(el, 'intensidade', noiseSuppressionLevelSelect, getSavedNoiseSuppressionLevel());
      const syncLevel = () => { level.parentElement.hidden = mode.value !== 'deepfilter'; };
      mode.addEventListener('change', syncLevel);
      syncLevel();
    }
    if (micLevelerSelect) {
      quickMirrorSelect(el, 'volume automático', micLevelerSelect, getSavedMicLeveler(),
        { browser: 'do navegador (padrão)', own: 'do dusky (novo)' });
    }
    // mesmo aviso das configurações ("aplicando…", "ativa nesta call: …")
    const status = document.createElement('div');
    status.className = 'quick-popup-status';
    status.setAttribute('role', 'status');
    const syncStatus = () => { status.textContent = noiseSuppressionStatus ? noiseSuppressionStatus.textContent : ''; };
    el.appendChild(status);
    updateNoiseSuppressionStatus();
    syncStatus();
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'quick-popup-link';
    more.textContent = 'todas as configurações de voz';
    more.addEventListener('click', () => { closeQuickPopup(); openSettingsModal('microfone'); });
    el.appendChild(more);
    if (!noiseSuppressionStatus || typeof MutationObserver === 'undefined') return null;
    const observer = new MutationObserver(syncStatus);
    observer.observe(noiseSuppressionStatus, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  });
}

function openScreenPopup(anchor) {
  openQuickPopup(anchor, 'compartilhar tela', (el) => {
    const row = document.createElement('div');
    row.className = 'quick-popup-row';
    el.appendChild(row);
    quickMirrorSelect(row, 'resolução', screenResolutionSelect, getSavedScreenResolution());
    quickMirrorSelect(row, 'fps', screenFpsSelect, getSavedScreenFps());
    quickMirrorSelect(el, 'prioridade', screenPrioritySelect, getSavedScreenPriority(),
      { balanced: 'equilibrado (recomendado)', smooth: 'fluidez — jogos e vídeos', sharp: 'nitidez — texto e código' });
    quickMirrorSelect(el, 'bitrate', screenBitrateSelect, getSavedScreenBitrateKbps(), { 0: 'automático (até 16 Mbps)' });

    const check = document.createElement('label');
    check.className = 'quick-popup-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = getSavedScreenAudioEnabled();
    box.addEventListener('change', () => {
      screenAudioCheckbox.checked = box.checked;
      screenAudioCheckbox.dispatchEvent(new Event('change'));
    });
    check.append(box, document.createTextNode('compartilhar com som'));
    el.appendChild(check);

    const help = document.createElement('div');
    help.className = 'quick-popup-help';
    help.textContent = screenOn
      ? 'prioridade e bitrate valem na hora. Resolução, fps e som valem quando você compartilhar de novo.'
      : 'fica salvo: vale pra este e pros próximos compartilhamentos.';
    el.appendChild(help);

    const go = document.createElement('button');
    go.type = 'button';
    go.className = screenOn ? 'btn btn-ghost' : 'btn btn-primary';
    go.textContent = screenOn ? 'parar de compartilhar' : 'compartilhar tela';
    go.addEventListener('click', () => { closeQuickPopup(); toggleScreenShare(); });
    el.appendChild(go);
    return null;
  });
}

// botão da tela mostra se está compartilhando (chamado de todo lugar que liga/desliga a tela)
function setScreenButtonsLive(live) {
  callViewScreenBtn.classList.toggle('active', live);
  if (!callQuickScreenBtn) return;
  callQuickScreenBtn.classList.toggle('is-live', live);
  const text = live ? 'parar de compartilhar a tela' : 'compartilhar tela';
  callQuickScreenBtn.title = text;
  callQuickScreenBtn.setAttribute('aria-label', text);
}

if (callQuickNoiseBtn) callQuickNoiseBtn.addEventListener('click', (e) => { e.stopPropagation(); openNoisePopup(); });
if (callQuickScreenBtn) {
  callQuickScreenBtn.addEventListener('click', (e) => { e.stopPropagation(); closeQuickPopup(); toggleScreenShare(); });
  callQuickScreenBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openScreenPopup(callQuickScreenBtn); });
}
if (callQuickScreenOptsBtn) callQuickScreenOptsBtn.addEventListener('click', (e) => { e.stopPropagation(); openScreenPopup(callQuickScreenOptsBtn); });
// botão direito no botão de tela da própria call abre as mesmas opções
callViewScreenBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); openScreenPopup(callViewScreenBtn); });

function updateMinibar() {
  if (voiceChannel) {
    callMinibar.hidden = false;
    callMinibarName.textContent = `#${voiceChannel.name}`;
  } else {
    callMinibar.hidden = true;
    closeQuickPopup();
  }
}

function callParticipantBadges(state) {
  let html = '';
  if (state.deafened) html += BADGE_DEAFENED;
  else if (state.muted) html += BADGE_MIC_OFF;
  return html;
}

// objeto "usuario" falso pro bot de música — só pra reaproveitar o mesmo código de render de tile
// (memberAvatarInner, badges, etc) que espera um objeto com username/avatar_url/accent_color.
// Nome/avatar vêm de /api/bots (carregado em loadMembers), com fallback caso ainda não tenha carregado.
function botPseudoUser() {
  const b = bots.find((x) => x.id === 'musicbot');
  return {
    id: BOT_USER_ID,
    username: b ? b.name : 'DJ dusky',
    avatar_url: b ? b.avatar_url : null,
    accent_color: '#A855F7', // mesmo roxo usado nos embeds do bot (server/bots/musicBot/embeds.js)
  };
}

const EYE_OFF_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const EYE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

// essa pessoa está mostrando câmera agora (pra mim)?
function entryHasVideo(entry, state) {
  if (entry.id === BOT_USER_ID) return false; // o bot é só áudio
  if (entry.isSelf) return cameraOn && !!localCameraStream;
  const st = state || callParticipantsState.get(entry.id) || {};
  const peer = peers.get(entry.id);
  return !!st.cameraOn && !!peer && peer.cameraStream.getVideoTracks().length > 0 && !getLocalOverride(entry.id).hideVideo;
}

// ampliar/diminuir a câmera de alguém (clicar no vídeo). Só uma por vez.
function toggleSpotlight(userId) {
  spotlightUserId = spotlightUserId === userId ? null : userId;
  renderCallParticipants();
}

function toggleElementFullscreen(el) {
  if (document.fullscreenElement === el) {
    document.exitFullscreen().catch(() => {});
  } else {
    el.requestFullscreen().catch((err) => console.warn('[call] não deu pra entrar em tela cheia:', err));
  }
}

function renderCallParticipants() {
  syncWorldView(); // call-mundo: mostra o mundinho 3D no lugar da grade (27-world.js)
  callParticipants.innerHTML = '';
  if (!voiceChannel || !currentUser) {
    callParticipants.classList.remove('has-spotlight');
    return;
  }

  const otherIds = [...callParticipantsState.keys()].filter((id) => id !== currentUser.id);
  const entries = [{ id: currentUser.id, isSelf: true }, ...otherIds.map((id) => ({ id, isSelf: false }))];

  // a câmera ampliada só continua ampliada enquanto a pessoa estiver com vídeo
  if (spotlightUserId != null && !entries.some((e) => e.id === spotlightUserId && entryHasVideo(e))) {
    spotlightUserId = null;
  }
  callParticipants.classList.toggle('has-spotlight', spotlightUserId != null);
  if (spotlightUserId != null) {
    entries.sort((a, b) => (b.id === spotlightUserId) - (a.id === spotlightUserId));
  }

  for (const entry of entries) {
    const isBot = entry.id === BOT_USER_ID;
    const state = callParticipantsState.get(entry.id) || { muted: false, deafened: false, cameraOn: false, screenOn: false };
    const user = entry.isSelf ? currentUser : (isBot ? botPseudoUser() : findUser(entry.id));
    if (!user) continue;

    const hasVideo = entryHasVideo(entry, state);
    const isSpotlight = hasVideo && spotlightUserId === entry.id;

    const el = document.createElement('div');
    el.className = 'call-participant' + (isBot ? ' is-bot' : '') + (isSpotlight ? ' is-spotlight' : '') + (speakingUsers.has(entry.id) ? ' is-speaking' : '');
    el.dataset.userId = String(entry.id);
    if (!entry.isSelf) {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openParticipantContextMenu(e, entry.id, user.username);
      });
    }

    const frame = document.createElement('div');
    frame.className = 'call-participant-frame' + (hasVideo ? ' has-video' : '') + (entry.isSelf ? ' is-local' : '');
    // com câmera: clicar amplia/diminui. Sem câmera: abre o perfil, como antes.
    frame.title = hasVideo ? (isSpotlight ? 'clique pra diminuir' : 'clique pra ampliar') : '';
    frame.addEventListener('click', () => {
      if (hasVideo) toggleSpotlight(entry.id);
      else openViewProfile(entry.id, frame);
    });

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // a câmera nunca carrega áudio (o mic vai pelo <audio> de cada pessoa)
    if (hasVideo) {
      video.srcObject = entry.isSelf ? localCameraStream : peers.get(entry.id).cameraStream;
      video.play().catch(() => { /* vídeo mudo quase nunca é bloqueado */ });
    }
    frame.appendChild(video);

    const avatar = document.createElement('div');
    avatar.className = 'call-participant-avatar';
    avatar.style.borderColor = user.accent_color || 'var(--amethyst)';
    avatar.innerHTML = memberAvatarInner(user);
    frame.appendChild(avatar);

    if (hasVideo) {
      const fsBtn = document.createElement('button');
      fsBtn.type = 'button';
      fsBtn.className = 'call-participant-fs-btn';
      fsBtn.title = 'tela cheia';
      fsBtn.setAttribute('aria-label', 'câmera em tela cheia');
      fsBtn.innerHTML = EXPAND_ICON;
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleElementFullscreen(frame);
      });
      frame.appendChild(fsBtn);
    }
    el.appendChild(frame);

    const nameEl = document.createElement('span');
    nameEl.className = 'call-participant-name is-clickable';
    nameEl.textContent = user.username + (entry.isSelf ? ' (você)' : '');
    applyNameStyle(nameEl, { ...user, id: entry.id });
    nameEl.addEventListener('click', () => openViewProfile(entry.id, nameEl));
    el.appendChild(nameEl);

    const badges = document.createElement('span');
    badges.className = 'call-participant-badges';
    badges.innerHTML = callParticipantBadges(state);
    el.appendChild(badges);

    // slider de volume só pros outros — 0 a 200%, o mesmo do menu de clique direito
    if (!entry.isSelf) {
      const vol = getSavedVolume(entry.id);
      const volWrap = document.createElement('div');
      volWrap.className = 'call-participant-volume';
      volWrap.innerHTML = `<input type="range" min="0" max="200" value="${vol}"><span class="call-participant-volume-value">${vol}%</span>`;
      const range = volWrap.querySelector('input');
      const label = volWrap.querySelector('.call-participant-volume-value');
      range.addEventListener('input', () => {
        const v = Number(range.value);
        label.textContent = v + '%';
        saveVolume(entry.id, v);
        if (isBot) applyLocalOverridesToBotAudio();
        else applyLocalOverridesToRemoteAudio(entry.id);
      });
      el.appendChild(volWrap);
    }

    if (!entry.isSelf && !isBot) {
      const peer = peers.get(entry.id);
      const details = document.createElement('details');
      details.className = 'call-voice-stats';
      details.open = !!peer?.voiceStatsOpen;
      const summary = document.createElement('summary');
      const metrics = document.createElement('dl');
      details.append(summary, metrics);
      details.addEventListener('toggle', () => {
        const current = peers.get(entry.id);
        if (!current || !details.isConnected) return;
        current.voiceStatsOpen = details.open;
        if (details.open) renderPeerVoiceStats(details, current.voiceStats);
      });
      el.appendChild(details);
      renderPeerVoiceStats(details, peer?.voiceStats);
    }

    callParticipants.appendChild(el);
  }

  renderScreenShareArea();
}

// ---------- telas compartilhadas ----------

// estou assistindo a tela dessa pessoa? Call normal: só depois de clicar em "assistir" (até lá
// aparece o card "fulano está compartilhando a tela" e nada do vídeo é baixado). Mundinho: a TV
// mostra sozinha, a não ser que eu tenha parado de assistir.
function isWatchingScreen(userId) {
  if (worldCallActive()) return !unwatchedScreens.has(userId);
  return watchedScreens.has(userId);
}

// assistir / parar de assistir a tela de alguém. Avisa a pessoa (malha: ela só manda a tela pra quem
// pediu) e assina/deixa de assinar no servidor de mídia — em call com muita gente, quem não está
// assistindo não gasta a internet de quem compartilha nem a própria.
function setWatchingScreen(userId, watching) {
  if (watching) {
    watchedScreens.add(userId);
    unwatchedScreens.delete(userId);
  } else {
    watchedScreens.delete(userId);
    unwatchedScreens.add(userId);
    closeScreencastPc(peers.get(userId));
  }
  Realtime.send('rtc_signal', { to: userId, data: { kind: 'watch', screen: !!watching } });
  sfuSetScreenSubscribed(userId, !!watching);
  renderScreenShareArea();
  applyLocalOverrideToRemoteScreenAudio(userId);
}

// ---------- prévia da MINHA tela: mostrar/esconder (igual Discord) ----------
// Pelo navegador a prévia é o próprio stream capturado. Pela placa de vídeo (app desktop) a tela sai
// pelo auxiliar ("tela-<meu id>") e a prévia é essa mesma tela vinda do servidor de mídia, assinada
// só com a prévia ligada (custa banda e decodificação) — igual à tela de qualquer outra pessoa.
// A escolha fica guardada (vale pro próximo compartilhamento também).
const OWN_PREVIEW_KEY = 'dusky:screenPreview';
let ownScreenPreviewOn = (() => {
  try { return localStorage.getItem(OWN_PREVIEW_KEY) !== '0'; } catch (_) { return true; }
})();
let ownNativePreviewStream = null; // a minha tela vinda do servidor de mídia (compartilhando pelo app)
let ownPreviewSync = { ctx: null, want: null }; // o que já foi pedido pro servidor de mídia

function setOwnScreenPreview(on) {
  ownScreenPreviewOn = !!on;
  try { localStorage.setItem(OWN_PREVIEW_KEY, on ? '1' : '0'); } catch (_) { /* vale só agora */ }
  ownPreviewSync.want = null; // pede de novo (assinar/deixar de assinar)
  renderScreenShareArea();
}

function ownNativePreviewWanted() {
  return ownScreenPreviewOn && screenOn && !!nativeScreencast;
}

// assina (ou não) a minha própria tela no servidor de mídia, conforme a prévia
function syncOwnNativePreview() {
  const want = ownNativePreviewWanted();
  if (!want) ownNativePreviewStream = null;
  if (typeof sfu === 'undefined' || !sfu || !currentUser) return;
  if (ownPreviewSync.ctx === sfu && ownPreviewSync.want === want) return;
  ownPreviewSync = { ctx: sfu, want };
  if (sfu.native) {
    // app do Linux: o Rust só assina a própria tela com isso ligado (call.rs, call_set_subscribed)
    try { sfu.api.setSubscribed(currentUser.id, true, want); } catch (_) { /* sem a prévia */ }
    return;
  }
  const helper = sfu.room && sfu.room.remoteParticipants.get(`tela-${currentUser.id}`);
  if (!helper) return; // o auxiliar ainda não entrou — o TrackSubscribed decide quando ele chegar
  for (const pub of helper.trackPublications.values()) {
    try { pub.setSubscribed(want && pub.kind === 'video'); } catch (_) { /* a faixa já acabou */ }
  }
}

// 21-call-sfu.js: faixa da minha PRÓPRIA conta (só a do auxiliar de tela interessa — é a prévia)
function ownSfuTrackSubscribed(track, publication, participant) {
  const myScreenVideo = /^tela-/.test(String(participant && participant.identity)) && track.kind === 'video';
  if (myScreenVideo && ownNativePreviewWanted() && track.mediaStreamTrack) {
    ownNativePreviewStream = new MediaStream([track.mediaStreamTrack]);
    renderScreenShareArea();
    return;
  }
  // o som da minha tela, ou a prévia desligada: não precisa vir (economiza banda)
  if (publication && typeof publication.setSubscribed === 'function') {
    try { publication.setSubscribed(false); } catch (_) { /* ok */ }
  }
}

function ownSfuTrackUnsubscribed(track) {
  const mst = track && track.mediaStreamTrack;
  if (ownNativePreviewStream && mst && ownNativePreviewStream.getTracks().includes(mst)) {
    ownNativePreviewStream = null;
    renderScreenShareArea();
  }
}

function previewToggleButton(on, extraClass) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = extraClass;
  btn.title = on ? 'esconder a prévia da sua tela (os outros continuam vendo)' : 'mostrar o que você está transmitindo';
  btn.innerHTML = `${on ? EYE_OFF_ICON : EYE_ICON}<span>${on ? 'esconder prévia' : 'mostrar prévia'}</span>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOwnScreenPreview(!on);
  });
  return btn;
}

function renderScreenShareArea() {
  callScreenShareArea.innerHTML = '';
  const tiles = [];
  syncOwnNativePreview();

  if (screenOn && localScreenStream) {
    tiles.push(ownScreenPreviewOn
      ? { kind: 'local', label: 'sua tela', stream: localScreenStream, userId: null }
      : { kind: 'local-card', label: 'sua tela', userId: null });
  } else if (screenOn && nativeScreencast) {
    const live = ownNativePreviewStream && ownNativePreviewStream.getVideoTracks().some((tr) => tr.readyState === 'live');
    tiles.push(live
      ? { kind: 'local', label: 'sua tela', stream: ownNativePreviewStream, userId: null, native: true }
      : { kind: 'local-native', label: 'sua tela', userId: null });
  }
  for (const [userId, st] of callParticipantsState.entries()) {
    if (!currentUser || userId === currentUser.id || userId === BOT_USER_ID || !st.screenOn) continue;
    const user = findUser(userId);
    const name = user ? user.username : 'alguém';
    if (!isWatchingScreen(userId)) {
      tiles.push({ kind: 'stopped', label: name, userId });
      continue;
    }
    const peer = peers.get(userId);
    // tela vinda pela placa de vídeo de quem compartilha (app desktop) tem prioridade
    const nativeStream = peer && peer.scDisplayStream && peer.scDisplayStream.getVideoTracks().some((t) => t.readyState === 'live') ? peer.scDisplayStream : null;
    const stream = nativeStream || (peer && peer.screenStream);
    if (!peer || !stream || stream.getVideoTracks().length === 0) continue;
    tiles.push({ kind: 'remote', label: `tela de ${name}`, stream, userId });
  }

  callScreenShareArea.hidden = tiles.length === 0;
  callScreenShareArea.classList.toggle('only-stopped', tiles.length > 0 && tiles.every((t) => t.kind === 'stopped'));

  for (const t of tiles) {
    if (t.kind === 'local-native' || t.kind === 'local-card') {
      // prévia desligada (ou ainda chegando): só o aviso, com o botão de mostrar/esconder
      const card = document.createElement('div');
      card.className = 'call-screenshare-tile is-native';
      card.dataset.kind = 'local';
      card.innerHTML = `
          <div class="native-screencast-card">
            <span class="native-screencast-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
            <strong>você está compartilhando a tela</strong>
            <span class="native-screencast-encoder"></span>
            <span class="native-screencast-stats"></span>
          </div>`;
      const encoderEl = card.querySelector('.native-screencast-encoder');
      if (t.kind === 'local-native') {
        encoderEl.textContent = nativeScreencast.hardware
          ? `codificando uma vez só, na ${nativeScreencast.encoderName} — quase não pesa no jogo`
          : `codificando uma vez só, no ${nativeScreencast.encoderName}`;
      }
      const loading = ownScreenPreviewOn && t.kind === 'local-native';
      if (loading) {
        const note = document.createElement('span');
        note.className = 'native-screencast-encoder';
        note.textContent = 'carregando a prévia…';
        card.querySelector('.native-screencast-card').appendChild(note);
      }
      card.querySelector('.native-screencast-card').appendChild(previewToggleButton(ownScreenPreviewOn, 'btn btn-primary btn-sm native-screencast-preview-btn'));
      callScreenShareArea.appendChild(card);
      if (t.kind === 'local-native') updateNativeScreencastBadge();
      continue;
    }

    if (t.kind === 'stopped') {
      const card = document.createElement('div');
      card.className = 'call-screenshare-stopped';
      card.innerHTML = `<span class="call-screenshare-stopped-icon">${EYE_ICON}</span><span class="call-screenshare-stopped-text"></span>`;
      card.querySelector('.call-screenshare-stopped-text').textContent = `${t.label} está compartilhando a tela`;
      const watchBtn = document.createElement('button');
      watchBtn.type = 'button';
      watchBtn.className = 'btn btn-primary btn-sm';
      watchBtn.textContent = 'assistir';
      watchBtn.addEventListener('click', () => setWatchingScreen(t.userId, true));
      card.appendChild(watchBtn);
      callScreenShareArea.appendChild(card);
      continue;
    }

    const tile = document.createElement('div');
    tile.className = 'call-screenshare-tile';
    tile.dataset.kind = t.kind;
    if (t.userId != null) tile.dataset.userId = String(t.userId);
    tile.title = 'clique direito pra ajustar' + (t.kind === 'remote' ? ' volume/infos' : ' as infos exibidas');
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openScreenShareContextMenu(e, t.kind, t.userId ?? null, t.label);
    });
    tile.addEventListener('dblclick', () => toggleElementFullscreen(tile));

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    // sua própria tela fica sempre muda; a dos outros toca o som da tela junto com a imagem
    // app do Linux: o <video> nunca carrega áudio nem é mutado — o som da tela vai pela Web Audio
    // (ver webkitGtkApp em 18-call-audio.js: mutar elemento lá deixa o app inteiro mudo)
    if (!webkitGtkApp()) video.muted = t.kind === 'local' ? true : isDeafened;
    // app do Linux: a tela já vem desenhada num canvas (21-call-sfu.js, sfuNativeAddEncodedVideo) —
    // mostra o próprio canvas, sem passar pelo <video> (menos processador e um quadro a menos de
    // atraso); o <video> fica escondido, só tocando o som da tela
    const nativeCanvas = (t.kind === 'remote' || t.native) ? (t.stream.getVideoTracks()[0] || {}).duskyCanvas : null;
    video.srcObject = webkitGtkApp()
      ? new MediaStream(nativeCanvas ? [] : t.stream.getVideoTracks())
      : (nativeCanvas ? new MediaStream(t.stream.getAudioTracks()) : t.stream);
    if (nativeCanvas) {
      video.style.display = 'none';
      nativeCanvas.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;display:block';
    }
    video.play().catch((err) => {
      if (t.kind === 'remote') console.warn('[call] autoplay da tela remota bloqueado pelo navegador:', err);
    });
    if (t.kind === 'remote') applyLocalOverrideToRemoteScreenAudio(t.userId, video);
    tile.appendChild(video);
    if (nativeCanvas) tile.appendChild(nativeCanvas);

    const label = document.createElement('span');
    label.className = 'call-screenshare-label';
    label.textContent = t.label;
    tile.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'call-screenshare-actions';
    if (t.kind === 'remote') {
      const stopBtn = document.createElement('button');
      stopBtn.type = 'button';
      stopBtn.className = 'call-screenshare-action-btn';
      stopBtn.title = 'parar de assistir';
      stopBtn.setAttribute('aria-label', 'parar de assistir');
      stopBtn.innerHTML = `${EYE_OFF_ICON}<span>parar de assistir</span>`;
      stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setWatchingScreen(t.userId, false);
      });
      actions.appendChild(stopBtn);
    }
    if (t.kind === 'local') actions.appendChild(previewToggleButton(true, 'call-screenshare-action-btn'));
    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'call-screenshare-action-btn is-icon';
    fsBtn.title = 'tela cheia';
    fsBtn.setAttribute('aria-label', 'tela cheia');
    fsBtn.innerHTML = EXPAND_ICON;
    fsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleElementFullscreen(tile);
    });
    tile.addEventListener('fullscreenchange', () => {
      fsBtn.innerHTML = document.fullscreenElement === tile ? COMPRESS_ICON : EXPAND_ICON;
      fsBtn.title = document.fullscreenElement === tile ? 'sair da tela cheia' : 'tela cheia';
    });
    actions.appendChild(fsBtn);
    tile.appendChild(actions);

    const statsBadge = document.createElement('span');
    statsBadge.className = 'call-screenshare-stats';
    statsBadge.hidden = true; // só aparece quando chegar a 1ª medição real
    tile.appendChild(statsBadge);

    callScreenShareArea.appendChild(tile);
  }

  if (tiles.some((t) => t.kind !== 'stopped')) startScreenStatsLoop();
  else stopScreenStatsLoop();
  updateOwnPreviewPlayback();
}

// ---------- prévia da MINHA tela só roda com o dusky em foco ----------
// desenhar a própria tela em tamanho grande, a cada quadro, custa processador/placa de vídeo — e
// enquanto a pessoa está no jogo ninguém está olhando essa prévia. No X11 o sistema nem avisa o
// app que a janela está coberta, então ela continuava sendo desenhada atrás do jogo. Pausar a
// prévia NÃO afeta a transmissão: os outros continuam recebendo a tela normalmente.
function ownPreviewShouldRun() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function updateOwnPreviewPlayback() {
  const tile = callScreenShareArea.querySelector('.call-screenshare-tile[data-kind="local"]');
  const video = tile && tile.querySelector('video');
  if (!video) return;
  const run = ownPreviewShouldRun();
  tile.classList.toggle('is-preview-paused', !run);
  if (run) video.play().catch(() => { /* volta no próximo foco */ });
  else video.pause();
}

window.addEventListener('blur', updateOwnPreviewPlayback);
window.addEventListener('focus', updateOwnPreviewPlayback);
document.addEventListener('visibilitychange', updateOwnPreviewPlayback);

// ---------- estatísticas REAIS da transmissão de tela (resolução, fps, bitrate medidos pelo WebRTC) ----------
let screenStatsIntervalId = null;
const screenStatsPrev = new Map(); // 'out' | 'in:<userId>' -> { bytes, timestamp }

function startScreenStatsLoop() {
  if (screenStatsIntervalId) return;
  screenStatsIntervalId = setInterval(updateScreenStats, 1000);
  updateScreenStats();
}

function stopScreenStatsLoop() {
  if (screenStatsIntervalId) { clearInterval(screenStatsIntervalId); screenStatsIntervalId = null; }
  screenStatsPrev.clear();
}

function formatScreenStats({ width, height, fps, kbps, limit }) {
  const parts = [];
  if (width && height) parts.push(`${width}\u00d7${height}`);
  if (fps != null) parts.push(`${fps} fps`);
  if (kbps != null) parts.push(kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`);
  // o próprio WebRTC diz por que está entregando menos que o pedido
  if (limit === 'bandwidth') parts.push('limitado pela internet');
  else if (limit === 'cpu') parts.push('limitado pelo processador');
  return parts.join(' · ');
}

function setScreenStatsBadge(kind, userId, text) {
  const selector = kind === 'local'
    ? '.call-screenshare-tile[data-kind="local"]'
    : `.call-screenshare-tile[data-kind="remote"][data-user-id="${userId}"]`;
  const tile = callScreenShareArea.querySelector(selector);
  const badge = tile && tile.querySelector('.call-screenshare-stats');
  if (!badge) return;
  const statsKey = kind === 'local' ? 'local' : `remote:${userId}`;
  if (!text || !getSavedScreenStatsVisible(statsKey)) { badge.hidden = true; return; }
  badge.hidden = false;
  badge.textContent = text;
}

function kbpsSince(key, bytes, timestamp) {
  const prev = screenStatsPrev.get(key);
  let kbps = null;
  if (prev && timestamp > prev.timestamp && typeof bytes === 'number') {
    kbps = Math.max(0, Math.round(((bytes - prev.bytes) * 8) / ((timestamp - prev.timestamp) / 1000) / 1000));
  }
  if (typeof bytes === 'number') screenStatsPrev.set(key, { bytes, timestamp });
  return kbps;
}

async function updateScreenStats() {
  // o que EU estou mandando (medido na conexão com a primeira pessoa que está assistindo)
  const sendingPeer = screenOn ? [...peers.values()].find((p) => p.screen && p.screen.sender.track) : null;
  const sfuScreenPub = screenOn && sfu ? sfu.pubs.get('screen') : null;
  const screenSender = (sfuScreenPub && sfuScreenPub.track && sfuScreenPub.track.sender) || (sendingPeer && sendingPeer.screen.sender) || null;
  if (screenSender) {
    try {
      const report = await screenSender.getStats();
      let out = null;
      report.forEach((r) => { if (r.type === 'outbound-rtp' && r.kind === 'video') out = r; });
      if (out) {
        setScreenStatsBadge('local', null, formatScreenStats({
          width: out.frameWidth,
          height: out.frameHeight,
          fps: out.framesPerSecond != null ? Math.round(out.framesPerSecond) : null,
          kbps: kbpsSince('out', out.bytesSent, out.timestamp),
          limit: out.qualityLimitationReason,
        }));
      }
    } catch (_) { /* getStats pode falhar bem na troca de track — tenta no próximo tick */ }
  }

  // o que eu estou RECEBENDO de cada pessoa que está compartilhando
  for (const peer of peers.values()) {
    const st = callParticipantsState.get(peer.userId);
    const screenReceiver = peer.sfu ? peer.sfuScreenReceiver : (peer.screen && peer.screen.receiver);
    const scLive = peer.scPc && peer.scPc.connectionState !== 'closed';
    if (!st || !st.screenOn || !isWatchingScreen(peer.userId) || (!screenReceiver && !scLive)) continue;
    try {
      const report = await (scLive ? peer.scPc : screenReceiver).getStats();
      let inbound = null;
      report.forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') inbound = r; });
      if (inbound) {
        setScreenStatsBadge('remote', peer.userId, formatScreenStats({
          width: inbound.frameWidth,
          height: inbound.frameHeight,
          fps: inbound.framesPerSecond != null ? Math.round(inbound.framesPerSecond) : null,
          kbps: kbpsSince(`in:${peer.userId}`, inbound.bytesReceived, inbound.timestamp),
        }));
      }
    } catch (_) { /* idem */ }
  }
}

// quem está falando agora: vale pra call aberta, pra prévia da barra lateral (inclusive de calls
// em que eu não estou — o servidor repassa o "voice_speaking") e pra minha barra de perfil
const speakingUsers = new Set();
function setParticipantSpeaking(userId, speaking) {
  const on = !!speaking;
  if (on === speakingUsers.has(userId)) return;
  if (on) speakingUsers.add(userId); else speakingUsers.delete(userId);
  const el = callParticipants.querySelector(`.call-participant[data-user-id="${userId}"]`);
  if (el) el.classList.toggle('is-speaking', on);
  channelGroups.querySelectorAll(`.channel-voice-preview-row[data-user-id="${userId}"]`).forEach((row) => row.classList.toggle('is-speaking', on));
  if (currentUser && userId === currentUser.id) profileBar.classList.toggle('is-speaking', on);
}

// A mesma transição do gate atualiza a borda local e é enviada aos demais participantes.
let speakingSentState = false;
let voiceSpeakingReady = false;
function publishLocalSpeaking(speaking) {
  if (!voiceChannel || !voiceSpeakingReady || !currentUser) return;
  const active = !!speaking && !isMuted;
  setParticipantSpeaking(currentUser.id, active);
  if (active === speakingSentState) return;
  speakingSentState = active;
  Realtime.send('voice_speaking', { speaking: active });
}

function runSpeakingLoop() {
  let rawOpenUntil = 0;
  function loop() {
    if (!voiceChannel) { legacySpeakingTimer = null; return; }
    const gate = callMicGraph?.gate;
    if (gate?.legacy) {
      gate.tickLegacy(getAnalyserDb(localAnalyser));
      publishLocalSpeaking(gate.state.speaking);
    } else if (!gate && localAnalyser && !isMuted) {
      const level = getAnalyserLevel(localAnalyser);
      const sensitivity = isTauriApp() ? getSavedMicSensitivity() : 0;
      const now = performance.now();
      if (level >= (sensitivity || 8)) rawOpenUntil = now + 350;
      const speaking = now < rawOpenUntil;
      if (isTauriApp()) {
        localStream?.getAudioTracks().forEach((track) => { track.enabled = sensitivity === 0 || speaking; });
      }
      publishLocalSpeaking(speaking);
    } else if (isMuted) {
      rawOpenUntil = 0;
    }

    // Mantém o analisador remoto até chegar o primeiro evento de fala (por exemplo, se
    // a pessoa já falava antes de eu entrar). Depois a borda acompanha o gate de quem fala.
    for (const peer of peers.values()) {
      if (!peer.hasSpeakingSignal && peer.analyser) {
        setParticipantSpeaking(peer.userId, getAnalyserLevel(peer.analyser) > 12);
      }
    }
    legacySpeakingTimer = setTimeout(loop, SPEAKING_TICK_MS);
  }
  if (!legacySpeakingTimer) legacySpeakingTimer = setTimeout(loop, 0);
}

function createRawMicAnalyser(stream) {
  if (!stream) return null;
  try {
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    return analyser;
  } catch (_) { return null; }
}
