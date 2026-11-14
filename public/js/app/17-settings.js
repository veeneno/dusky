// dusky — Carregamento inicial e tela de configurações
// Parte 17 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - carregamento inicial
//   - modal de configurações de voz e vídeo

// ---------- carregamento inicial ----------

async function loadUser() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    // leva o convite junto pro login, se a pessoa chegou por um link /invite/...
    const invite = new URLSearchParams(window.location.search).get('invite');
    window.location.replace(invite ? `/login.html?invite=${encodeURIComponent(invite)}` : '/login.html');
    return null;
  }
  const { user } = await res.json();
  currentUser = user;
  applyUserToProfileBar(user);
  return user;
}

async function loadServers() {
  try {
    const res = await fetch('/api/servers');
    if (!res.ok) return;
    servers = (await res.json()).servers;
  } catch (_) { /* segue com a lista vazia */ }
  renderRail();
}

// busca quem está em cada canal de voz agora (nos meus servidores) — alimenta a pré-visualização
// na sidebar logo no carregamento (os eventos de voz só vêm via WS a partir daí pra frente)
async function loadVoiceOccupancy() {
  const res = await fetch('/api/channels/voice-state');
  if (!res.ok) return;
  const { occupancy } = await res.json();
  channelVoiceState.clear();
  for (const o of occupancy || []) {
    if (o.channelId == null) continue;
    getChannelVoiceMap(o.channelId).set(o.userId, {
      muted: !!o.muted, deafened: !!o.deafened, cameraOn: !!o.cameraOn, screenOn: !!o.screenOn,
    });
  }
  renderVoicePreviews();
}

// busca o volume atual do bot de música logo no boot, pra quem ainda não tem preferência pessoal
// salva ver o volume certo desde a primeira call. Não é crítico — falha em silêncio.
async function loadMusicbotState(serverId) {
  if (serverId == null) return; // cada servidor tem o seu bot — sem call, nada a carregar ainda
  try {
    const res = await fetch(`/api/musicbot/state?server=${serverId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (Number.isFinite(data.volume)) botServerVolume = data.volume;
  } catch (_) { /* segue com o padrão de 100% */ }
}

logoutBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  try { await disableBackgroundPush(); } catch (_) { /* a sessão encerrada também impede ler conteúdo no worker */ }
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ---------- modal de configurações de voz e vídeo ----------

function stopSettingsStream() {
  settingsPreviewId++;
  if (settingsMeterTimer) clearTimeout(settingsMeterTimer);
  settingsMeterTimer = null;
  micMeterFill.style.width = '0%';
  if (settingsMicGraph) settingsMicGraph.teardown();
  settingsMicGraph = null;
  settingsMicFallback = null;
  updateNoiseSuppressionStatus();
  if (settingsStream) settingsStream.getTracks().forEach((t) => t.stop());
  settingsStream = null;
  cameraPreview.srcObject = null;
  resetMicTest();
  if (micTestBtn) micTestBtn.disabled = true;
}

function runMicMeter() {
  function loop() {
    const inCall = voiceChannel && localStream;
    const graph = micTest?.graph || (inCall ? callMicGraph : settingsMicGraph);
    const analyser = graph?.analyser || (inCall ? localAnalyser : settingsMicFallback);
    const gate = graph?.gate;
    if (gate?.legacy && graph !== callMicGraph) gate.tickLegacy(getAnalyserDb(analyser));
    const level = gate?.state.levelDb ?? getAnalyserDb(analyser);
    micMeterFill.style.width = (isTauriApp() && analyser ? getAnalyserLevel(analyser) : micDbToPercent(level)) + '%';
    if (micGateStatus) {
      const fallback = (gate?.legacy || gate?.vadFailed) && getSavedMicGateMode() === 'auto';
      const text = inCall && isMuted && !micTest?.graph ? 'microfone mutado'
        : fallback ? 'detecção indisponível · microfone aberto'
        : gate ? (gate.state.open ? 'microfone aberto' : 'microfone fechado') : '';
      if (micGateStatus.textContent !== text) micGateStatus.textContent = text;
    }
    settingsMeterTimer = setTimeout(loop, SPEAKING_TICK_MS);
  }
  if (!settingsMeterTimer) loop();
}

function resetMicTest() {
  const test = micTest;
  micTest = null;
  if (test) {
    clearTimeout(test.stopTimer);
    if (test.recorder && test.recorder.state !== 'inactive') test.recorder.stop();
    test.graph?.teardown();
    test.clonedTrack?.stop();
    micTestPlayback.pause();
    micTestPlayback.removeAttribute('src');
    micTestPlayback.load();
    if (test.url) URL.revokeObjectURL(test.url);
  }
  if (micTestBtn) {
    micTestPlayback.hidden = true;
    micTestBtn.textContent = 'testar microfone';
    micTestStatus.textContent = '';
  }
  updateSelfMonitor();
}

micTestBtn?.addEventListener('click', async () => {
  const cancel = micTest?.recording;
  resetMicTest();
  if (cancel) return;
  if (typeof MediaRecorder === 'undefined') {
    micTestStatus.textContent = 'a gravação não está disponível neste navegador';
    return;
  }

  let stream = voiceChannel && localStream ? localStream : settingsMicGraph?.stream || settingsStream;
  if (!stream?.getAudioTracks().some((track) => track.readyState === 'live')) {
    micTestStatus.textContent = 'nenhum microfone disponível para testar';
    return;
  }
  const test = { recording: true };
  micTest = test;
  micTestBtn.textContent = 'cancelar teste';
  micTestStatus.textContent = 'preparando microfone…';
  updateSelfMonitor();
  try {
    if (voiceChannel && isMuted && rawMicStream) {
      // Dá pra testar com a call mutada: essa cópia alimenta só a gravação local.
      test.clonedTrack = rawMicStream.getAudioTracks()[0].clone();
      test.clonedTrack.enabled = true;
      const raw = new MediaStream([test.clonedTrack]);
      const graph = isTauriApp() ? null : await tryBuildMicProcessingGraph(raw);
      if (micTest !== test) { graph?.teardown(); return; }
      test.graph = graph;
      stream = graph?.stream || raw;
    }

    const recorder = new MediaRecorder(stream);
    test.recorder = recorder;
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => {
      if (micTest !== test) return;
      resetMicTest();
      micTestStatus.textContent = 'não consegui gravar o microfone';
    };
    recorder.onstop = async () => {
      if (micTest !== test) return;
      clearTimeout(test.stopTimer);
      test.graph?.teardown();
      test.graph = null;
      test.clonedTrack?.stop();
      test.clonedTrack = null;
      test.recording = false;
      micTestBtn.textContent = 'testar de novo';
      if (!chunks.length) {
        resetMicTest();
        micTestStatus.textContent = 'a gravação ficou vazia';
        return;
      }
      test.url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || chunks[0].type }));
      micTestPlayback.src = test.url;
      micTestPlayback.hidden = false;
      const speaker = getSavedDeviceId('speaker');
      if (SUPPORTS_SINK_ID) await micTestPlayback.setSinkId(speaker).catch(() => {});
      if (micTest !== test) return;
      micTestStatus.textContent = 'gravação pronta';
      await micTestPlayback.play().catch(() => {});
      if (micTest === test) updateSelfMonitor();
    };
    recorder.start();
    micTestStatus.textContent = 'gravando por 5 segundos…';
    test.stopTimer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, 5000);
  } catch (err) {
    if (micTest !== test) return;
    resetMicTest();
    micTestStatus.textContent = 'não consegui gravar o microfone: ' + err.message;
  }
});

// (seta em vez da função direta: updateSelfMonitor mora em 18-call-audio.js, carregado depois deste arquivo)
for (const event of ['play', 'pause', 'ended']) micTestPlayback?.addEventListener(event, (e) => updateSelfMonitor(e));

async function populateDeviceSelects() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === 'audioinput');
  const speakers = devices.filter((d) => d.kind === 'audiooutput');
  const cameras = devices.filter((d) => d.kind === 'videoinput');

  function fill(select, list, kind, fallbackLabel) {
    const saved = getSavedDeviceId(kind);
    select.innerHTML = '';
    if (list.length === 0) {
      select.innerHTML = `<option value="">${fallbackLabel}</option>`;
      select.disabled = true;
      return;
    }
    select.disabled = false;
    list.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `${fallbackLabel} ${i + 1}`;
      select.appendChild(opt);
    });
    select.value = list.some((d) => d.deviceId === saved) ? saved : list[0].deviceId;
  }

  fill(micSelect, mics, 'mic', 'microfone');
  fill(cameraSelect, cameras, 'camera', 'câmera');

  if (SUPPORTS_SINK_ID) {
    speakerField.hidden = false;
    fill(speakerSelect, speakers, 'speaker', 'saída de áudio');
  } else {
    speakerField.hidden = true; // navegador não suporta escolher saída (ex: firefox, safari)
  }
}

async function startSettingsPreview() {
  stopSettingsStream();
  const previewId = settingsPreviewId;
  const isCurrent = () => previewId === settingsPreviewId;
  const previewMic = currentSettingsTab === 'microfone';
  settingsError.textContent = '';

  if (previewMic && voiceChannel && localStream) {
    // Na call, o medidor lê o próprio analisador do gate, sem abrir outro microfone.
    runMicMeter();
    if (micTestBtn) micTestBtn.disabled = false;
    return;
  }

  let stream;
  try {
    if (previewMic) {
      const micId = getSavedDeviceId('mic');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(micId) });
      } catch (err) {
        if (!micId || !isCurrent()) throw err;
        stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints('') });
      }
    } else {
      const cameraId = getSavedDeviceId('camera');
      stream = await navigator.mediaDevices.getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : true });
    }
  } catch (err) {
    if (isCurrent()) {
      settingsError.textContent = 'não consegui acessar ' + (previewMic ? 'o microfone: ' : 'a câmera: ') + err.message;
      if (!previewMic) cameraPreviewEmpty.hidden = false;
    }
    return;
  }
  if (!isCurrent()) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  settingsStream = stream;

  if (previewMic) {
    const graph = isTauriApp() ? null : await tryBuildMicProcessingGraph(stream);
    if (!isCurrent()) {
      graph?.teardown();
      return;
    }
    settingsMicGraph = graph;
    updateNoiseSuppressionStatus();
    if (!graph) {
      settingsMicFallback = createRawMicAnalyser(stream);
      if (!isTauriApp()) settingsError.textContent = 'processamento indisponível: o teste usa o áudio cru';
    }
    runMicMeter();
    updateSelfMonitor();
    if (micTestBtn) micTestBtn.disabled = false;
  } else {
    cameraPreview.srcObject = stream;
    cameraPreviewEmpty.hidden = true;
  }
  // Com a permissão concedida, o navegador já pode mostrar os nomes reais dos dispositivos.
  await populateDeviceSelects().catch(() => {});
}

function refreshVoiceSettings() {
  if (!settingsModalBackdrop.hidden && currentSettingsTab === 'microfone') {
    startSettingsPreview().catch(() => {});
  }
}

// ---- abas das configurações ----
// o microfone/câmera só ligam nas abas que mostram o medidor ou a prévia (voz e câmera)
const SETTINGS_TAB_KEY = 'dusky:settingsTab';
let settingsEditorMounted = false;
let currentSettingsTab = null;

function switchSettingsTab(tabName) {
  if (!settingsModalBackdrop.querySelector(`.settings-tab-panel[data-settings-panel="${tabName}"]`)) tabName = 'aparencia';
  currentSettingsTab = tabName;
  try { localStorage.setItem(SETTINGS_TAB_KEY, tabName); } catch (_) { /* ok */ }
  settingsTabs.querySelectorAll('.settings-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.settingsTab === tabName);
  });
  settingsModalBackdrop.querySelectorAll('.settings-tab-panel').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tabName;
  });
  settingsModalBackdrop.querySelector('.settings-content').scrollTop = 0;
  if (tabName === 'aparencia' && !settingsEditorMounted) {
    settingsEditorMounted = true;
    DuskyTheme.mountEditor(document.getElementById('themeEditor'), { toast });
  }
  if (tabName === 'app') renderSettingsAppCard();
  if (!settingsModalBackdrop.hidden) {
    if (tabName === 'microfone' || tabName === 'video') startSettingsPreview().catch(() => {});
    else stopSettingsStream();
  }
}

settingsTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.settings-tab');
  if (!btn) return;
  if (btn.dataset.settingsAction === 'profile') { closeSettingsModal(); openProfileModal(); return; }
  if (btn.dataset.settingsAction === 'logout') { logoutBtn.click(); return; }
  switchSettingsTab(btn.dataset.settingsTab);
});
settingsModalBackdrop.addEventListener('click', (e) => {
  const jump = e.target.closest('[data-settings-jump]');
  if (jump) { e.preventDefault(); switchSettingsTab(jump.dataset.settingsJump); }
});

// interruptores e controles das abas "chat" e "acessibilidade"
for (const key of Object.keys(PREF_DEFAULTS)) {
  const el = document.getElementById(key);
  if (!el) continue;
  if (el.type === 'checkbox') {
    el.addEventListener('change', () => {
      setPref(key, el.checked);
      if (key === 'prefClock24' || key === 'prefJumboEmoji' || key === 'prefLinkPreviews') renderMessages();
    });
  } else {
    const label = document.getElementById(`${key}Value`);
    el.addEventListener('input', () => { setPref(key, Number(el.value)); if (label) label.textContent = `${el.value}%`; });
  }
}
function syncPrefControls() {
  for (const key of Object.keys(PREF_DEFAULTS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = getPref(key);
    else { el.value = String(getPref(key)); const label = document.getElementById(`${key}Value`); if (label) label.textContent = `${el.value}%`; }
  }
}

// versão do site: vem do servidor (package.json + commit que está rodando), não é fixa no código
let siteVersionInfo = null;
let siteVersionLoading = null;
function loadSiteVersion() {
  if (!siteVersionLoading) {
    siteVersionLoading = fetch('/api/version', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => { siteVersionInfo = info; return info; })
      .catch(() => { siteVersionLoading = null; return null; });
  }
  return siteVersionLoading;
}
function siteVersionText() {
  const v = siteVersionInfo;
  if (!v || !v.version) return 'site';
  return `site ${v.version}${v.commit ? ` (${v.commit})` : ''}`;
}
function desktopOsName(desk) {
  return desk.platform === 'win32' ? 'Windows' : desk.platform === 'linux' ? 'Linux' : desk.platform;
}
function renderSettingsAppCard() {
  const card = document.getElementById('settingsAppCard');
  const desk = window.duskyDesktop;
  const info = desk && desk.appInfo;
  card.innerHTML = '<span class="settings-card-icon"><img src="/img/brand/dm-colorido-64.png" width="28" height="28" alt=""></span><span class="settings-card-text"><strong></strong><span></span></span>';
  // app novo: "dusky Mist 1.0"; Electron antigo (sem appInfo): só "app desktop do dusky"
  card.querySelector('strong').textContent = desk ? ((info && info.label) || 'app desktop do dusky') : 'dusky no navegador';
  const line = () => {
    const parts = [];
    if (desk && desk.appVersion) parts.push(`app ${desk.appVersion}`);
    parts.push(siteVersionText());
    if (desk) parts.push(desktopOsName(desk));
    else parts.push('instale o app pra compartilhar tela pela placa de vídeo e receber atualizações sozinho');
    return parts.join(' · ');
  };
  const sub = card.querySelector('.settings-card-text span');
  sub.textContent = line();
  if (!siteVersionInfo) loadSiteVersion().then(() => { if (sub.isConnected) sub.textContent = line(); });
  const checkBtn = document.getElementById('settingsCheckUpdatesBtn');
  checkBtn.hidden = !(desk && typeof desk.checkForUpdates === 'function');
  document.getElementById('settingsDownloadBtn').textContent = desk ? 'página de download' : 'baixar o app';
  // aceleração de hardware: só o app novo (Tauri) sabe mudar
  const hwRow = document.getElementById('settingsHwAccelRow');
  const canHw = !!(desk && typeof desk.setHardwareAcceleration === 'function');
  hwRow.hidden = !canHw;
  if (canHw) document.getElementById('settingsHwAccel').checked = !(info && info.gpu && info.gpu.hardwareAcceleration === false);
}
document.getElementById('settingsHwAccel').addEventListener('change', (e) => {
  const desk = window.duskyDesktop;
  if (!desk || !desk.setHardwareAcceleration) return;
  const on = e.target.checked;
  if (!confirm(`${on ? 'Ligar' : 'Desligar'} a aceleração de hardware? O app reinicia agora${inVoiceCallForSettings() ? ' (e sai da call)' : ''}.`)) {
    e.target.checked = !on;
    return;
  }
  desk.setHardwareAcceleration(on);
});
function inVoiceCallForSettings() {
  try { return typeof voiceChannel !== 'undefined' && !!voiceChannel; } catch (_) { return false; }
}
document.getElementById('settingsCheckUpdatesBtn').addEventListener('click', () => {
  if (window.duskyDesktop && window.duskyDesktop.checkForUpdates) window.duskyDesktop.checkForUpdates();
});

async function openSettingsModal(tab) {
  let wanted = tab;
  if (!wanted) { try { wanted = localStorage.getItem(SETTINGS_TAB_KEY); } catch (_) { /* ok */ } }
  syncPrefControls();
  settingsError.textContent = '';
  micGainRange.value = getSavedMicGain();
  updateMicGainLabel();
  selfMonitorCheckbox.checked = getSavedSelfMonitor();
  tauriMicWarning.hidden = !isTauriApp();
  speakerUnsupportedHint.hidden = SUPPORTS_SINK_ID;
  notificationSoundsCheckbox.checked = getSavedNotificationSounds();
  micSensitivityRange.value = getSavedMicSensitivity();
  if (micGateModeSelect) micGateModeSelect.value = getSavedMicGateMode();
  updateMicSensitivityLabel();
  noiseSuppressionSelect.value = getSavedNoiseSuppression();
  if (noiseSuppressionLevelSelect) noiseSuppressionLevelSelect.value = getSavedNoiseSuppressionLevel();
  updateNoiseSuppressionStatus();
  screenResolutionSelect.value = getSavedScreenResolution();
  screenFpsSelect.value = String(getSavedScreenFps());
  screenBitrateSelect.value = String(getSavedScreenBitrateKbps());
  screenPrioritySelect.value = getSavedScreenPriority();
  screenAudioCheckbox.checked = getSavedScreenAudioEnabled();
  settingsModalBackdrop.hidden = false;
  switchSettingsTab(wanted || 'aparencia');
  try {
    await populateDeviceSelects();
  } catch (_) { /* enumerateDevices sem permissão ainda retorna labels vazios — tudo bem */ }
}

function closeSettingsModal() {
  settingsModalBackdrop.hidden = true;
  stopSettingsStream();
}

settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); openSettingsModal(); });
settingsCloseBtn.addEventListener('click', closeSettingsModal);
settingsModalBackdrop.addEventListener('click', (e) => {
  if (e.target === settingsModalBackdrop) closeSettingsModal();
});

micSelect.addEventListener('change', () => {
  saveDeviceId('mic', micSelect.value);
  if (voiceChannel && rawMicStream && !isTauriApp()) reacquireMicInCall();
  else refreshVoiceSettings();
});
cameraSelect.addEventListener('change', () => {
  saveDeviceId('camera', cameraSelect.value);
  startSettingsPreview();
});
speakerSelect.addEventListener('change', () => {
  saveDeviceId('speaker', speakerSelect.value);
  applyOutputDeviceEverywhere();
});

function updateMicGainLabel() {
  micGainValue.textContent = micGainRange.value + '%';
}
micGainRange.addEventListener('input', () => {
  updateMicGainLabel();
  const v = Number(micGainRange.value);
  saveMicGain(v);
  // ajusta ao vivo se já tiver uma call rolando, sem precisar reentrar no canal
  if (micGainNode) micGainNode.gain.value = v / 100;
  if (settingsMicGraph) settingsMicGraph.gainNode.gain.value = v / 100;
});

// troca o microfone com a call aberta: abre o mic de novo (novo aparelho ou novo modo de
// processamento) e remonta o processamento em cima dele, sem sair da call
async function reacquireMicInCall() {
  if (!voiceChannel || !rawMicStream || isTauriApp()) return;
  const channel = voiceChannel;
  const captureId = ++micCaptureId;
  const savedMic = getSavedDeviceId('mic');
  let fresh;
  try {
    fresh = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(savedMic) });
  } catch (_) {
    try { fresh = await navigator.mediaDevices.getUserMedia({ audio: micConstraints('') }); } catch (err) {
      console.warn('[call] não consegui reabrir o microfone:', err);
      return;
    }
  }
  if (voiceChannel !== channel || captureId !== micCaptureId) {
    fresh.getTracks().forEach((t) => t.stop());
    return;
  }
  await rebuildMicProcessing(fresh);
}

if (voiceProcessingSelect) {
  voiceProcessingSelect.value = getSavedVoiceProcessing();
  voiceProcessingSelect.addEventListener('change', async () => {
    saveVoiceProcessing(voiceProcessingSelect.value);
    if (!voiceChannel || !rawMicStream || isTauriApp()) refreshVoiceSettings();
    voiceProcessingSelect.disabled = true;
    try { await reacquireMicInCall(); } finally { voiceProcessingSelect.disabled = false; }
  });
}

const micLevelerSelect = document.getElementById('micLevelerSelect');
if (micLevelerSelect) {
  micLevelerSelect.value = getSavedMicLeveler();
  micLevelerSelect.addEventListener('change', async () => {
    try { localStorage.setItem(MIC_LEVELER_KEY, micLevelerSelect.value === 'own' ? 'own' : 'browser'); } catch (_) { /* vale nesta página */ }
    // muda o que é pedido ao navegador (ajuste dele ligado/desligado), então reabre o microfone
    if (!voiceChannel || !rawMicStream || isTauriApp()) refreshVoiceSettings();
    micLevelerSelect.disabled = true;
    try { await reacquireMicInCall(); } finally { micLevelerSelect.disabled = false; }
  });
}

selfMonitorCheckbox.addEventListener('change', () => {
  saveSelfMonitor(selfMonitorCheckbox.checked);
  updateSelfMonitor();
});

notificationSoundsCheckbox.addEventListener('change', () => {
  saveNotificationSounds(notificationSoundsCheckbox.checked);
  if (notificationSoundsCheckbox.checked) playMessageSound({ force: true }); // feedback imediato ao ligar
});

function updateMicSensitivityLabel() {
  const v = Number(micSensitivityRange.value);
  const manual = getSavedMicGateMode() === 'manual';
  const legacy = isTauriApp();
  const threshold = micThresholdDb(v);
  if (micGateModeField) micGateModeField.hidden = legacy;
  if (micSensitivityField) micSensitivityField.hidden = !manual;
  micSensitivityValue.textContent = v === 0 ? 'aberto' : legacy ? v + '%' : threshold + ' dBFS';
  micMeterThreshold.classList.toggle('show', manual && v > 0);
  micMeterThreshold.style.left = (legacy ? v : micDbToPercent(threshold)) + '%';
}

function applyMicGateSettings() {
  for (const graph of [callMicGraph, settingsMicGraph, micTest?.graph]) graph?.gate.configure();
}

micSensitivityRange.addEventListener('input', () => {
  saveMicSensitivity(Number(micSensitivityRange.value));
  updateMicSensitivityLabel();
  applyMicGateSettings();
});
micGateModeSelect?.addEventListener('change', () => {
  try { localStorage.setItem(MIC_GATE_MODE_KEY, micGateModeSelect.value); } catch (_) { /* segue com o padrão */ }
  updateMicSensitivityLabel();
  applyMicGateSettings();
});
// texto embaixo da opção: o que está de fato rodando na call agora (pode ter caído pro modo leve)
function updateNoiseSuppressionStatus() {
  if (noiseSuppressionLevelField) {
    noiseSuppressionLevelField.hidden = getSavedNoiseSuppression() !== 'deepfilter' || isTauriApp();
    const graph = voiceChannel && localStream ? callMicGraph : settingsMicGraph;
    noiseSuppressionLevelSelect.disabled = !!graph && !graph.setSuppressionLevel;
  }
  if (!noiseSuppressionStatus) return;
  const names = { deepfilter: 'avançada (DeepFilterNet3)', rnnoise: 'leve (RNNoise)', off: 'nenhuma' };
  if (!voiceChannel || !rawMicStream) {
    noiseSuppressionStatus.textContent = '';
    return;
  }
  const wanted = getSavedNoiseSuppression();
  noiseSuppressionStatus.textContent = wanted === micNsActiveMode
    ? `ativa nesta call: ${names[micNsActiveMode]}`
    : `ativa nesta call: ${names[micNsActiveMode]} — a ${names[wanted]} não carregou neste dispositivo`;
}

noiseSuppressionSelect.addEventListener('change', async () => {
  saveNoiseSuppression(noiseSuppressionSelect.value);
  updateNoiseSuppressionStatus();
  if (voiceChannel && rawMicStream && !isTauriApp()) {
    noiseSuppressionStatus.textContent = 'aplicando…';
    noiseSuppressionSelect.disabled = true;
    try { await rebuildMicProcessing(); } finally { noiseSuppressionSelect.disabled = false; }
  } else {
    refreshVoiceSettings();
  }
});
noiseSuppressionLevelSelect?.addEventListener('change', () => {
  const level = Number(noiseSuppressionLevelSelect.value);
  if (!NOISE_SUPPRESSION_LEVELS.includes(level)) return;
  try { localStorage.setItem(NOISE_SUPPRESSION_LEVEL_KEY, String(level)); } catch (_) { /* vale nesta página */ }
  for (const graph of [callMicGraph, settingsMicGraph, micTest?.graph]) {
    graph?.setSuppressionLevel?.(level);
    graph?.setPostFilterBeta?.(noiseSuppressionPostFilterBeta(level));
  }
});
screenResolutionSelect.addEventListener('change', () => {
  saveScreenResolution(screenResolutionSelect.value);
});
screenFpsSelect.addEventListener('change', () => {
  saveScreenFps(Number(screenFpsSelect.value));
});
screenBitrateSelect.addEventListener('change', () => {
  saveScreenBitrateKbps(Number(screenBitrateSelect.value));
  reapplyScreenEncoding();
});
screenPrioritySelect.addEventListener('change', () => {
  saveScreenPriority(screenPrioritySelect.value);
  reapplyScreenEncoding();
});

// mudou prioridade/bitrate compartilhando: vale na hora, sem parar a transmissão
function reapplyScreenEncoding() {
  if (!screenOn || !localScreenStream) return;
  const track = localScreenStream.getVideoTracks()[0];
  if (track) track.contentHint = SCREEN_PRIORITIES[getSavedScreenPriority()].contentHint;
  for (const peer of peers.values()) {
    if (peer.screen && peer.screen.sender.track) applyScreenBitrate(peer.screen.sender);
  }
  const sfuScreen = sfu && sfu.pubs.get('screen');
  if (sfuScreen && sfuScreen.track && sfuScreen.track.sender) applyScreenBitrate(sfuScreen.track.sender);
}
screenAudioCheckbox.addEventListener('change', () => {
  saveScreenAudioEnabled(screenAudioCheckbox.checked);
});

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (!settingsModalBackdrop.hidden) populateDeviceSelects();
  });
}

speakerTestBtn.addEventListener('click', async () => {
  // toca um bipe curto pela saída escolhida, pra confirmar que é o fone certo
  try {
    const ctx = getAudioCtx();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(dest);
    gain.connect(ctx.destination);

    const testEl = document.createElement('audio');
    testEl.srcObject = dest.stream;
    testEl.autoplay = true;
    if (SUPPORTS_SINK_ID && speakerSelect.value) {
      await testEl.setSinkId(speakerSelect.value);
    }
    osc.start();
    setTimeout(() => { osc.stop(); testEl.remove(); }, 500);
  } catch (err) {
    settingsError.textContent = 'não consegui tocar o teste: ' + err.message;
  }
});
