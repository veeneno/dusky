// dusky — Soundboard: tocar sons na call, seletor e editor de som
// Parte 26 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - tocar um som que alguém soltou na call (soundboard_play) e prévia local
//   - seletor do soundboard (botão na call e na barra da call), com os sons de TODOS os servidores
//   - editor de som: escolher arquivo, ver a onda, cortar o trecho (até ~5 s), nome, emoji, volume
//
// Como funciona: quem clica manda soundboard_play pelo WebSocket; o servidor confere a permissão
// (server/soundboard.js) e avisa cada pessoa da call; cada navegador baixa o mp3 e toca no contexto
// de áudio dos sons (getSfxCtx, 18-call-audio.js), com o volume do soundboard de cada um. O som
// não passa pela call — funciona igual em malha e com o servidor de mídia.

const SOUNDBOARD_VOLUME_KEY = 'dusky:soundboardVolume';
const SOUNDBOARD_COOLDOWN_MS = 1500; // igual ao do servidor
const soundboardPopup = document.getElementById('soundboardPopup');
const soundboardBody = document.getElementById('soundboardBody');
const soundboardSearch = document.getElementById('soundboardSearch');
const soundboardHint = document.getElementById('soundboardHint');

let soundboardData = null;        // resposta de GET /api/soundboard (cache até soundboard_updated)
let soundboardLoading = null;
let soundboardAnchor = null;
let soundboardLastPlayAt = 0;
const soundBufferCache = new Map(); // url -> Promise<AudioBuffer>
let soundPreviewSource = null;

function getSoundboardVolume() {
  try {
    const v = parseInt(localStorage.getItem(SOUNDBOARD_VOLUME_KEY), 10);
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 60;
  } catch (_) { return 60; }
}
function saveSoundboardVolume(v) {
  try { localStorage.setItem(SOUNDBOARD_VOLUME_KEY, String(v)); } catch (_) { /* segue sem persistir */ }
}

// ---------- tocar ----------

function loadSoundBuffer(url) {
  if (!soundBufferCache.has(url)) {
    const p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error('som indisponível'); return r.arrayBuffer(); })
      .then((buf) => getSfxCtx().decodeAudioData(buf));
    p.catch(() => soundBufferCache.delete(url)); // deu erro: tenta de novo na próxima
    soundBufferCache.set(url, p);
  }
  return soundBufferCache.get(url);
}

// toca um AudioBuffer (inteiro, ou de `offset` por `duration` segundos) no contexto dos sons
function playAudioBuffer(buffer, gain, offset = 0, duration) {
  const ctx = getSfxCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = Math.max(0, gain);
  src.connect(g).connect(ctx.destination);
  if (duration != null) src.start(0, offset, duration); else src.start(0, offset);
  return src;
}

async function playSoundUrl(url, gain) {
  try {
    const buffer = await loadSoundBuffer(url);
    return playAudioBuffer(buffer, gain);
  } catch (_) { return null; }
}

// Fontes por participante: silenciar interrompe também o som que já está tocando.
const participantSoundboardSources = new Map();
function stopParticipantSoundboard(userId) {
  const sources = participantSoundboardSources.get(userId);
  if (!sources) return;
  for (const src of sources) { try { src.stop(); } catch (_) { /* já terminou */ } }
  participantSoundboardSources.delete(userId);
}

function canHearParticipantSoundboard(userId) {
  const o = getLocalOverride(userId);
  return !isDeafened && !o.soundboardMuted
    && !(currentUser && userId !== currentUser.id && o.mutedLocal);
}

// alguém (talvez eu) tocou um som na minha call
async function handleSoundboardPlay({ userId, sound }) {
  if (!sound || !voiceChannel) return;
  showSoundboardBurst(userId, sound);
  if (!canHearParticipantSoundboard(userId)) return;
  const channel = voiceChannel;
  try {
    const buffer = await loadSoundBuffer(sound.url);
    // O download pode terminar depois de silenciar a pessoa ou sair/trocar de call.
    if (voiceChannel !== channel || !canHearParticipantSoundboard(userId)) return;
    const src = playAudioBuffer(buffer, (sound.volume || 1) * getSoundboardVolume() / 100);
    let sources = participantSoundboardSources.get(userId);
    if (!sources) participantSoundboardSources.set(userId, sources = new Set());
    sources.add(src);
    src.onended = () => {
      sources.delete(src);
      if (!sources.size && participantSoundboardSources.get(userId) === sources) participantSoundboardSources.delete(userId);
    };
  } catch (_) { /* som indisponível: não interrompe a call */ }
}

// emoji subindo em cima de quem tocou (na tela da call)
function showSoundboardBurst(userId, sound) {
  const tile = document.querySelector(`#callParticipants .call-participant[data-user-id="${Number(userId)}"]`);
  if (!tile) return;
  const burst = document.createElement('span');
  burst.className = 'soundboard-burst';
  burst.textContent = sound.emoji || '🔊';
  burst.title = sound.name;
  tile.appendChild(burst);
  setTimeout(() => burst.remove(), 1800);
}

// prévia: só eu ouço (configurações do servidor e botão direito no seletor)
async function previewSound(sound) {
  stopSoundPreview();
  soundPreviewSource = await playSoundUrl(sound.url, (sound.volume || 1) * Math.max(getSoundboardVolume(), 30) / 100);
}
function stopSoundPreview() {
  if (soundPreviewSource) { try { soundPreviewSource.stop(); } catch (_) { /* já parou */ } }
  soundPreviewSource = null;
}

// ---------- seletor ----------

function invalidateSoundboard() {
  soundboardData = null;
  if (!soundboardPopup.hidden) loadSoundboard().then(renderSoundboardPicker);
}

function loadSoundboard() {
  if (soundboardData) return Promise.resolve(soundboardData);
  if (!soundboardLoading) {
    soundboardLoading = fetch('/api/soundboard')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) soundboardData = data; return soundboardData; })
      .catch(() => soundboardData)
      .finally(() => { soundboardLoading = null; });
  }
  return soundboardLoading;
}

function openSoundboardPicker(anchor) {
  soundboardAnchor = anchor;
  soundboardSearch.value = '';
  soundboardPopup.hidden = false;
  positionSoundboardPicker();
  renderSoundboardPicker();
  loadSoundboard().then(renderSoundboardPicker);
  setTimeout(() => soundboardSearch.focus(), 0);
}

function closeSoundboardPicker() {
  soundboardPopup.hidden = true;
  stopSoundPreview();
}

function toggleSoundboardPicker(anchor) {
  if (!soundboardPopup.hidden && soundboardAnchor === anchor) closeSoundboardPicker();
  else openSoundboardPicker(anchor);
}

function positionSoundboardPicker() {
  if (!soundboardAnchor) return;
  const r = soundboardAnchor.getBoundingClientRect();
  const w = soundboardPopup.offsetWidth || 360;
  const h = soundboardPopup.offsetHeight || 420;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  let top = r.top - h - 10;
  if (top < 8) top = Math.min(window.innerHeight - h - 8, r.bottom + 10);
  soundboardPopup.style.left = `${Math.round(left)}px`;
  soundboardPopup.style.top = `${Math.round(Math.max(8, top))}px`;
}

function renderSoundboardPicker() {
  if (soundboardPopup.hidden) return;
  soundboardBody.innerHTML = '';
  if (!soundboardData) { soundboardBody.innerHTML = '<p class="soundboard-empty">carregando…</p>'; return; }
  const callServerId = voiceChannel ? voiceChannel.server_id : null;
  const callServer = soundboardData.servers.find((s) => s.id === callServerId) || null;
  const callPerms = callServer ? callServer.permissions : { use_soundboard: false, use_external_sounds: false };
  const q = soundboardSearch.value.trim().toLowerCase();

  // servidor da call primeiro, depois os outros na ordem da barra
  const ordered = soundboardData.servers.slice().sort((a, b) => (b.id === callServerId) - (a.id === callServerId));
  let shown = 0;
  for (const s of ordered) {
    const sounds = s.sounds.filter((x) => !q || x.name.toLowerCase().includes(q));
    if (!sounds.length) continue;
    const external = s.id !== callServerId;
    let blocked = null;
    if (!voiceChannel) blocked = 'entre numa call pra tocar';
    else if (!callPerms.use_soundboard) blocked = 'seu cargo não pode usar o soundboard nessa call';
    else if (external && !callPerms.use_external_sounds) blocked = 'essa call não deixa usar sons de outros servidores';

    const section = document.createElement('section');
    section.className = 'soundboard-section';
    const head = document.createElement('div');
    head.className = 'soundboard-section-head';
    head.innerHTML = `<span class="soundboard-server-icon">${serverIconInner(s)}</span><span class="soundboard-server-name"></span>`;
    head.querySelector('.soundboard-server-name').textContent = s.name + (s.id === callServerId ? ' · esta call' : '');
    section.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'soundboard-grid';
    for (const sound of sounds) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'soundboard-sound';
      b.innerHTML = '<span class="soundboard-sound-emoji"></span><span class="soundboard-sound-name"></span>';
      b.querySelector('.soundboard-sound-emoji').textContent = sound.emoji || '🔊';
      b.querySelector('.soundboard-sound-name').textContent = sound.name;
      b.title = blocked ? `${sound.name} — ${blocked}` : `${sound.name} (botão direito: ouvir só você)`;
      if (blocked) b.classList.add('is-blocked');
      b.addEventListener('click', () => {
        if (blocked) { toast(blocked); return; }
        const now = Date.now();
        if (now - soundboardLastPlayAt < SOUNDBOARD_COOLDOWN_MS) return;
        soundboardLastPlayAt = now;
        Realtime.send('soundboard_play', { soundId: sound.id });
        soundboardBody.querySelectorAll('.soundboard-sound').forEach((el) => {
          el.classList.remove('is-cooling');
          void el.offsetWidth;
          el.classList.add('is-cooling');
        });
      });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); previewSound(sound); });
      grid.appendChild(b);
      shown++;
    }
    section.appendChild(grid);
    soundboardBody.appendChild(section);
  }
  if (!shown) {
    const manage = callServer && callServer.permissions.manage_soundboard;
    soundboardBody.innerHTML = q
      ? '<p class="soundboard-empty">nenhum som com esse nome</p>'
      : `<p class="soundboard-empty">nenhum som ainda nos seus servidores.${manage ? '' : ' Peça pra quem gerencia o servidor adicionar alguns.'}</p>`;
  }
  // atalho pra adicionar som no servidor da call (pra quem pode)
  if (callServer && callServer.permissions.manage_soundboard) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-ghost btn-sm soundboard-add';
    add.textContent = `+ adicionar som em ${callServer.name}`;
    add.addEventListener('click', () => { closeSoundboardPicker(); openSoundEditor({ serverId: callServer.id }); });
    soundboardBody.appendChild(add);
  }
  soundboardHint.textContent = voiceChannel ? 'clique pra tocar pra call · botão direito pra ouvir só você' : 'entre numa call pra tocar · botão direito pra ouvir';
  positionSoundboardPicker();
}

soundboardSearch.addEventListener('input', renderSoundboardPicker);
document.addEventListener('mousedown', (e) => {
  if (soundboardPopup.hidden) return;
  if (soundboardPopup.contains(e.target) || (soundboardAnchor && soundboardAnchor.contains(e.target))) return;
  closeSoundboardPicker();
});
window.addEventListener('resize', () => { if (!soundboardPopup.hidden) positionSoundboardPicker(); });

for (const id of ['callViewSoundboardBtn', 'callQuickSoundboardBtn']) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); toggleSoundboardPicker(btn); });
}

// volume do soundboard (configurações → som)
const soundboardVolumeRange = document.getElementById('soundboardVolumeRange');
const soundboardVolumeValue = document.getElementById('soundboardVolumeValue');
soundboardVolumeRange.value = String(getSoundboardVolume());
soundboardVolumeValue.textContent = `${getSoundboardVolume()}%`;
soundboardVolumeRange.addEventListener('input', () => {
  const v = Number(soundboardVolumeRange.value);
  saveSoundboardVolume(v);
  soundboardVolumeValue.textContent = `${v}%`;
});

// ---------- editor de som ----------

const soundEditorBackdrop = document.getElementById('soundEditorBackdrop');
const soundEditorInput = document.getElementById('soundEditorInput');
const soundEditorWave = document.getElementById('soundEditorWave');
const soundEditorSel = document.getElementById('soundEditorSel');
const soundEditorPlayhead = document.getElementById('soundEditorPlayhead');
const soundEditorName = document.getElementById('soundEditorName');
const soundEditorEmojiBtn = document.getElementById('soundEditorEmoji');
const soundEditorVolume = document.getElementById('soundEditorVolume');
const soundEditorError = document.getElementById('soundEditorError');
const soundEditorSave = document.getElementById('soundEditorSave');
const SOUND_MAX_S = 5.2;

// { serverId, sound (editando) | null, file, buffer, start, end, emoji }
let soundEditor = null;
let soundEditorPreviewSrc = null;
let soundEditorRaf = 0;

function openSoundEditor({ serverId, sound = null }) {
  soundEditor = { serverId, sound, file: null, buffer: null, start: 0, end: 0, emoji: sound ? sound.emoji : null };
  document.getElementById('soundEditorTitle').textContent = sound ? 'editar som' : 'enviar som';
  document.getElementById('soundEditorFileRow').hidden = !!sound;
  document.getElementById('soundEditorWaveWrap').hidden = true;
  document.getElementById('soundEditorTimes').hidden = true;
  document.getElementById('soundEditorFileName').textContent = 'mp3, wav, ogg, m4a ou até um vídeo — até 25MB';
  soundEditorName.value = sound ? sound.name : '';
  soundEditorVolume.value = String(Math.round((sound ? sound.volume : 1) * 100));
  document.getElementById('soundEditorVolumeValue').textContent = `${soundEditorVolume.value}%`;
  soundEditorEmojiBtn.textContent = soundEditor.emoji || '🔊';
  soundEditorError.textContent = '';
  soundEditorSave.textContent = sound ? 'salvar' : 'enviar';
  soundEditorSave.disabled = !sound;
  soundEditorInput.value = '';
  soundEditorBackdrop.hidden = false;
  if (sound) soundEditorName.focus();
}

function closeSoundEditor() {
  stopSoundEditorPreview();
  soundEditorBackdrop.hidden = true;
  soundEditor = null;
}

soundEditorBackdrop.addEventListener('click', (e) => {
  if (e.target === soundEditorBackdrop || e.target.closest('[data-close]')) closeSoundEditor();
});
document.getElementById('soundEditorPick').addEventListener('click', () => soundEditorInput.click());

function formatSecs(s) {
  return `${s.toFixed(2).replace('.', ',')} s`;
}

soundEditorInput.addEventListener('change', async () => {
  const file = soundEditorInput.files[0];
  if (!file || !soundEditor) return;
  soundEditorError.textContent = '';
  if (file.size > 25 * 1024 * 1024) { soundEditorError.textContent = 'arquivo grande demais (máx. 25MB)'; return; }
  document.getElementById('soundEditorFileName').textContent = file.name;
  soundEditorSave.disabled = true;
  try {
    // decodifica aqui só pra mostrar a onda e cortar — quem corta de verdade é o ffmpeg no servidor
    const buffer = await getSfxCtx().decodeAudioData(await file.arrayBuffer());
    soundEditor.file = file;
    soundEditor.buffer = buffer;
    soundEditor.start = 0;
    soundEditor.end = Math.min(buffer.duration, SOUND_MAX_S);
    if (!soundEditorName.value.trim()) soundEditorName.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 32);
    document.getElementById('soundEditorWaveWrap').hidden = false;
    document.getElementById('soundEditorTimes').hidden = false;
    requestAnimationFrame(() => { drawSoundWave(); updateSoundSelection(); });
    soundEditorSave.disabled = false;
  } catch (_) {
    soundEditor.file = null;
    soundEditor.buffer = null;
    soundEditorError.textContent = 'não deu pra ler esse arquivo aqui — tente mp3, wav ou ogg';
  }
});

// onda: pico de cada coluna de pixels, espelhado em cima/embaixo
function drawSoundWave() {
  const buffer = soundEditor && soundEditor.buffer;
  if (!buffer) return;
  const dpr = window.devicePixelRatio || 1;
  const w = soundEditorWave.clientWidth || 460;
  const h = soundEditorWave.clientHeight || 96;
  soundEditorWave.width = Math.round(w * dpr);
  soundEditorWave.height = Math.round(h * dpr);
  const ctx = soundEditorWave.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const color = getComputedStyle(soundEditorWave).color || '#999';
  ctx.fillStyle = color;
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  const peaks = new Float32Array(w);
  let max = 0;
  for (let x = 0; x < w; x++) {
    let peak = 0;
    const from = x * step;
    for (let i = 0; i < step; i += 4) { const v = Math.abs(data[from + i] || 0); if (v > peak) peak = v; }
    peaks[x] = peak;
    if (peak > max) max = peak;
  }
  // normaliza pelo pico do arquivo: som baixinho também mostra a forma direitinho
  const scale = max > 0 ? 1 / max : 0;
  for (let x = 0; x < w; x++) {
    const bar = Math.max(1, peaks[x] * scale * (h - 8));
    ctx.fillRect(x, (h - bar) / 2, 1, bar);
  }
}

function updateSoundSelection() {
  const ed = soundEditor;
  if (!ed || !ed.buffer) return;
  const d = ed.buffer.duration;
  soundEditorSel.style.left = `${(ed.start / d) * 100}%`;
  soundEditorSel.style.width = `${((ed.end - ed.start) / d) * 100}%`;
  document.getElementById('soundEditorRange').textContent = `${formatSecs(ed.start)} → ${formatSecs(ed.end)} · ${formatSecs(ed.end - ed.start)} (máx. ${formatSecs(SOUND_MAX_S)})`;
}

// arrastar as alças (início/fim) ou a seleção inteira
(function wireSoundSelection() {
  const wrap = document.getElementById('soundEditorWaveWrap');
  let drag = null;
  const timeAt = (clientX) => {
    const r = wrap.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * soundEditor.buffer.duration;
  };
  wrap.addEventListener('pointerdown', (e) => {
    if (!soundEditor || !soundEditor.buffer) return;
    const handle = e.target.closest('[data-handle]');
    const t = timeAt(e.clientX);
    if (handle) drag = { kind: handle.dataset.handle };
    else if (e.target.closest('#soundEditorSel')) drag = { kind: 'move', offset: t - soundEditor.start };
    else {
      // clique fora da seleção: começa ali, com o tamanho atual
      const len = soundEditor.end - soundEditor.start;
      soundEditor.start = Math.max(0, Math.min(t, soundEditor.buffer.duration - len));
      soundEditor.end = soundEditor.start + len;
      updateSoundSelection();
      drag = { kind: 'move', offset: t - soundEditor.start };
    }
    stopSoundEditorPreview();
    wrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag || !soundEditor || !soundEditor.buffer) return;
    const ed = soundEditor;
    const d = ed.buffer.duration;
    const t = timeAt(e.clientX);
    const MIN = 0.1;
    if (drag.kind === 'start') {
      ed.start = Math.min(Math.max(0, t), ed.end - MIN);
      if (ed.end - ed.start > SOUND_MAX_S) ed.end = ed.start + SOUND_MAX_S;
    } else if (drag.kind === 'end') {
      ed.end = Math.max(Math.min(d, t), ed.start + MIN);
      if (ed.end - ed.start > SOUND_MAX_S) ed.start = ed.end - SOUND_MAX_S;
    } else {
      const len = ed.end - ed.start;
      ed.start = Math.min(Math.max(0, t - drag.offset), d - len);
      ed.end = ed.start + len;
    }
    updateSoundSelection();
  });
  const end = () => { drag = null; };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
})();

function stopSoundEditorPreview() {
  if (soundEditorPreviewSrc) { try { soundEditorPreviewSrc.stop(); } catch (_) { /* já parou */ } }
  soundEditorPreviewSrc = null;
  cancelAnimationFrame(soundEditorRaf);
  soundEditorPlayhead.hidden = true;
  document.getElementById('soundEditorPreview').textContent = 'ouvir trecho';
}

document.getElementById('soundEditorPreview').addEventListener('click', () => {
  const ed = soundEditor;
  if (!ed || !ed.buffer) return;
  if (soundEditorPreviewSrc) { stopSoundEditorPreview(); return; }
  const len = ed.end - ed.start;
  const src = playAudioBuffer(ed.buffer, Number(soundEditorVolume.value) / 100, ed.start, len);
  soundEditorPreviewSrc = src;
  document.getElementById('soundEditorPreview').textContent = 'parar';
  const ctx = getSfxCtx();
  const t0 = ctx.currentTime;
  soundEditorPlayhead.hidden = false;
  const tick = () => {
    if (soundEditorPreviewSrc !== src) return;
    const t = ed.start + Math.min(len, ctx.currentTime - t0);
    soundEditorPlayhead.style.left = `${(t / ed.buffer.duration) * 100}%`;
    soundEditorRaf = requestAnimationFrame(tick);
  };
  tick();
  src.onended = () => { if (soundEditorPreviewSrc === src) stopSoundEditorPreview(); };
});

soundEditorVolume.addEventListener('input', () => {
  document.getElementById('soundEditorVolumeValue').textContent = `${soundEditorVolume.value}%`;
});
soundEditorEmojiBtn.addEventListener('click', () => {
  DuskyEmoji.open({ anchor: soundEditorEmojiBtn, onPick: (emoji) => {
    if (!soundEditor) return;
    soundEditor.emoji = emoji;
    soundEditorEmojiBtn.textContent = emoji;
  } });
});
document.getElementById('soundEditorEmojiClear').addEventListener('click', () => {
  if (!soundEditor) return;
  soundEditor.emoji = null;
  soundEditorEmojiBtn.textContent = '🔊';
});
window.addEventListener('resize', () => { if (soundEditor && soundEditor.buffer && !soundEditorBackdrop.hidden) drawSoundWave(); });

soundEditorSave.addEventListener('click', async () => {
  const ed = soundEditor;
  if (!ed) return;
  const name = soundEditorName.value.trim();
  if (name.length < 2) { soundEditorError.textContent = 'dá um nome pro som (2 a 32 letras)'; return; }
  const volume = Number(soundEditorVolume.value) / 100;
  soundEditorSave.disabled = true;
  soundEditorError.textContent = '';
  const label = soundEditorSave.textContent;
  soundEditorSave.textContent = ed.sound ? 'salvando…' : 'enviando…';
  try {
    let res;
    if (ed.sound) {
      res = await fetch(`/api/servers/${ed.serverId}/soundboard/${ed.sound.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, emoji: ed.emoji || '', volume }),
      });
    } else {
      if (!ed.file) { soundEditorError.textContent = 'escolha um arquivo'; return; }
      const form = new FormData();
      form.append('name', name);
      form.append('emoji', ed.emoji || '');
      form.append('volume', String(volume));
      form.append('start', ed.start.toFixed(3));
      form.append('end', ed.end.toFixed(3));
      form.append('sound', ed.file);
      res = await fetch(`/api/servers/${ed.serverId}/soundboard`, { method: 'POST', body: form });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { soundEditorError.textContent = data.error || 'não deu pra salvar o som'; return; }
    toast(ed.sound ? 'som salvo' : `"${name}" entrou no soundboard`);
    closeSoundEditor();
    invalidateSoundboard();
    if (!serverSettingsBackdrop.hidden && ssTab === 'soundboard') loadSsSounds();
  } catch (_) {
    soundEditorError.textContent = 'sem conexão — tente de novo';
  } finally {
    soundEditorSave.disabled = false;
    soundEditorSave.textContent = label;
  }
});
