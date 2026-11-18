// dusky — Preferências salvas neste aparelho
// Parte 2 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - preferências de dispositivo (mic / saída / câmera)
//   - sensibilidade do microfone (gate de ruído) e supressão de ruído
//   - sons de notificação (entrar/sair de call, mensagem recebida)
//   - preferências do chat e de acessibilidade (aba "chat"/"acessibilidade")
//   - qualidade do compartilhamento de tela (resolução + fps + bitrate + com/sem áudio)
//   - volume por participante (0–200%)
//   - volume do ÁUDIO DA TELA compartilhada por participante (0–200%), separado do volume do mic
//   - ajustes locais por participante (silenciar/ocultar vídeo só pro meu lado)
//   - estado de voz por canal (pra pré-visualização na sidebar)

// ---------- preferências de dispositivo (mic / saída / câmera) ----------
const DEVICE_PREF_KEYS = { mic: 'dusky:device:mic', speaker: 'dusky:device:speaker', camera: 'dusky:device:camera' };
const SUPPORTS_SINK_ID = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
let settingsStream = null; // captura que pertence ao modal, separada da call
let settingsMicGraph = null;
let settingsMicFallback = null;
let settingsPreviewId = 0;
let micTest = null;
let settingsMeterTimer = null;

function getSavedDeviceId(kind) {
  try { return localStorage.getItem(DEVICE_PREF_KEYS[kind]) || ''; } catch (_) { return ''; }
}
function saveDeviceId(kind, id) {
  try { localStorage.setItem(DEVICE_PREF_KEYS[kind], id || ''); } catch (_) { /* localStorage indisponível — segue sem persistir */ }
}

// ---------- sensibilidade do microfone (gate de ruído) e supressão de ruído ----------
const MIC_GATE_MODE_KEY = 'dusky:micGateMode';
const MIC_SENSITIVITY_KEY = 'dusky:micSensitivity';
const NOISE_SUPPRESSION_KEY = 'dusky:noiseSuppression';
const NOISE_SUPPRESSION_LEVEL_KEY = 'dusky:noiseSuppressionLevel';
// limites de atenuação do DeepFilterNet3 em dB, os mesmos do CleanMic (que usa os padrões do
// EasyEffects): 35 leve, 50 média, 100 forte (100 = sem limite: o ruído some de vez, e liga o
// pós-filtro). Os antigos 20/40/60 deixavam o chiado passar (no máximo 40 dB a menos, por padrão).
const NOISE_SUPPRESSION_LEVELS = [35, 50, 100];
const NOISE_SUPPRESSION_LEGACY_LEVELS = { 20: 35, 40: 50, 60: 100 };
// pós-filtro do DeepFilterNet (beta): limpa o resto de ruído entre as palavras. Só no "forte",
// como o CleanMic — em excesso ele abafa a voz.
function noiseSuppressionPostFilterBeta(level) { return level >= 100 ? 0.05 : 0; }
const MIC_GAIN_KEY = 'dusky:micGain';

function getSavedMicGain() {
  try {
    const v = parseInt(localStorage.getItem(MIC_GAIN_KEY), 10);
    // 100% por padrão: o ajuste automático de volume (AGC) já deixa a voz no nível certo. Os 150%
    // de antes empurravam toda fala pro limitador, que achatava e distorcia a voz.
    return Number.isFinite(v) ? Math.min(300, Math.max(50, v)) : 100;
  } catch (_) { return 100; }
}
function saveMicGain(v) {
  try { localStorage.setItem(MIC_GAIN_KEY, String(v)); } catch (_) { /* segue sem persistir */ }
}

const SELF_MONITOR_KEY = 'dusky:selfMonitor';
function getSavedSelfMonitor() {
  try { return localStorage.getItem(SELF_MONITOR_KEY) === '1'; } catch (_) { return false; }
}
function saveSelfMonitor(v) {
  try { localStorage.setItem(SELF_MONITOR_KEY, v ? '1' : '0'); } catch (_) { /* segue sem persistir */ }
}

// ---------- sons de notificação (entrar/sair de call, mensagem recebida) ----------
const NOTIFICATION_SOUNDS_KEY = 'dusky:notificationSounds';
function getSavedNotificationSounds() {
  try {
    const v = localStorage.getItem(NOTIFICATION_SOUNDS_KEY);
    return v === null ? true : v === '1'; // ligado por padrão
  } catch (_) { return true; }
}
function saveNotificationSounds(v) {
  try { localStorage.setItem(NOTIFICATION_SOUNDS_KEY, v ? '1' : '0'); } catch (_) { /* segue sem persistir */ }
}

function getSavedMicSensitivity() {
  try {
    const v = parseInt(localStorage.getItem(MIC_SENSITIVITY_KEY), 10);
    return Number.isFinite(v) ? Math.min(60, Math.max(0, v)) : 0;
  } catch (_) { return 0; }
}
function saveMicSensitivity(v) {
  try { localStorage.setItem(MIC_SENSITIVITY_KEY, String(v)); } catch (_) { /* segue sem persistir */ }
}
function getSavedMicGateMode() {
  if (isTauriApp()) return 'manual';
  try { return localStorage.getItem(MIC_GATE_MODE_KEY) === 'manual' ? 'manual' : 'auto'; }
  catch (_) { return 'auto'; }
}

// Mantém a posição gravada do slider, agora calibrado em RMS. Zero sempre deixa aberto.
function micThresholdDb(sensitivity) {
  return sensitivity === 0 ? null : Math.round(-65 + (sensitivity - 1) * 45 / 59);
}

function micDbToPercent(db) {
  return Math.max(0, Math.min(100, (db + 70) * 100 / 70));
}

// 'deepfilter' (avançada, parecida com a Krisp do Discord — padrão) | 'rnnoise' (leve) | 'off'
const NOISE_MODES = ['deepfilter', 'rnnoise', 'off'];
// processamento da voz no navegador: 'speakers' (cancela eco + volume automático), 'headphones'
// (sem cancelar eco — o que mais estraga a voz, e com fone não precisa), 'studio' (nada)
const VOICE_PROCESSING_KEY = 'dusky:voiceProcessing';
const VOICE_PROCESSING_MODES = ['speakers', 'headphones', 'studio'];
function getSavedVoiceProcessing() {
  try {
    const v = localStorage.getItem(VOICE_PROCESSING_KEY);
    return VOICE_PROCESSING_MODES.includes(v) ? v : 'speakers';
  } catch (_) { return 'speakers'; }
}
function saveVoiceProcessing(v) {
  try { localStorage.setItem(VOICE_PROCESSING_KEY, VOICE_PROCESSING_MODES.includes(v) ? v : 'speakers'); } catch (_) { /* ok */ }
}
// volume automático: 'own' (o nivelador do dusky, depois do supressor — padrão, ver
// worklets/mic-leveler.js) ou 'browser' (o do navegador, que age ANTES do supressor e sobe o chiado
// nas pausas — o supressor recebe um ruído que "respira" e deixa resto passar). O CleanMic entrega
// o mic cru pro DeepFilterNet; aqui é o mais perto disso. No modo estúdio não tem nenhum.
const MIC_LEVELER_KEY = 'dusky:micLeveler';
function getSavedMicLeveler() {
  try { return localStorage.getItem(MIC_LEVELER_KEY) === 'browser' ? 'browser' : 'own'; } catch (_) { return 'own'; }
}
function usesOwnLeveler() {
  return getSavedMicLeveler() === 'own' && getSavedVoiceProcessing() !== 'studio';
}

// ---------- preferências do chat e de acessibilidade (aba "chat"/"acessibilidade") ----------
const PREF_DEFAULTS = {
  prefLinkPreviews: true, prefJumboEmoji: true, prefShortcodes: true, prefTyping: true, prefEnterSends: true,
  prefClock24: true, prefAutoplayVideo: true, prefReduceMotion: false, prefUnderlineLinks: false,
  prefAlwaysTimestamps: false, prefSaturation: 100,
  // efeitos de perfil (nome, moldura, placa): 'always' | 'hover' | 'off' — ver profile.css e 33-performance.js
  prefFxMotion: 'hover',
};
function getPref(key) {
  try {
    const v = localStorage.getItem(`dusky:${key}`);
    if (v === null) return PREF_DEFAULTS[key];
    if (typeof PREF_DEFAULTS[key] === 'string') return v;
    return typeof PREF_DEFAULTS[key] === 'number' ? Number(v) : v === '1';
  } catch (_) { return PREF_DEFAULTS[key]; }
}
function setPref(key, value) {
  try { localStorage.setItem(`dusky:${key}`, typeof value === 'number' || typeof value === 'string' ? String(value) : (value ? '1' : '0')); } catch (_) { /* ok */ }
  applyPrefs();
}
// as que mudam o visual viram atributos no <html> (o CSS faz o resto)
function applyPrefs() {
  const root = document.documentElement;
  root.toggleAttribute('data-reduce-motion', getPref('prefReduceMotion'));
  root.toggleAttribute('data-underline-links', getPref('prefUnderlineLinks'));
  root.toggleAttribute('data-always-time', getPref('prefAlwaysTimestamps'));
  const fx = getPref('prefFxMotion');
  root.setAttribute('data-fx-motion', ['always', 'hover', 'off'].includes(fx) ? fx : 'hover');
  const sat = getPref('prefSaturation');
  root.toggleAttribute('data-saturation', sat < 100);
  root.style.setProperty('--app-saturation', String(sat / 100));
}
applyPrefs();

// janela sem foco ou escondida (outra janela na frente, minimizado, bandeja): os efeitos de perfil
// param de animar — ninguém está olhando, e cada quadro deles custa processador (ver profile.css)
function syncFxIdle() {
  document.documentElement.toggleAttribute('data-fx-idle', document.hidden || !document.hasFocus());
}
window.addEventListener('focus', syncFxIdle);
window.addEventListener('blur', syncFxIdle);
document.addEventListener('visibilitychange', syncFxIdle);
syncFxIdle();

function getSavedNoiseSuppression() {
  try {
    const v = localStorage.getItem(NOISE_SUPPRESSION_KEY);
    if (v === null || v === '1') return 'deepfilter'; // '1' = o liga/desliga antigo, ligado
    if (v === '0') return 'off';
    return NOISE_MODES.includes(v) ? v : 'deepfilter';
  } catch (_) { return 'deepfilter'; }
}
function saveNoiseSuppression(mode) {
  try { localStorage.setItem(NOISE_SUPPRESSION_KEY, NOISE_MODES.includes(mode) ? mode : 'deepfilter'); } catch (_) { /* segue sem persistir */ }
}

function getSavedNoiseSuppressionLevel() {
  try {
    const level = Number(localStorage.getItem(NOISE_SUPPRESSION_LEVEL_KEY));
    if (NOISE_SUPPRESSION_LEVELS.includes(level)) return level;
    if (NOISE_SUPPRESSION_LEGACY_LEVELS[level]) return NOISE_SUPPRESSION_LEGACY_LEVELS[level];
  } catch (_) { /* segue com a intensidade padrão */ }
  return 50;
}


// ---------- qualidade do compartilhamento de tela (resolução + fps + bitrate + com/sem áudio) ----------
const SCREEN_RESOLUTION_KEY = 'dusky:screenResolution';
const SCREEN_FPS_KEY = 'dusky:screenFps';
const SCREEN_BITRATE_KEY = 'dusky:screenBitrateKbps';
const SCREEN_AUDIO_KEY = 'dusky:screenAudioEnabled';

const SCREEN_RESOLUTIONS = ['1280x720', '1920x1080', '2560x1440', '3840x2160'];
const SCREEN_FPS_VALUES = [15, 30, 60, 120];

function getSavedScreenResolution() {
  try {
    const v = localStorage.getItem(SCREEN_RESOLUTION_KEY);
    return SCREEN_RESOLUTIONS.includes(v) ? v : '1280x720'; // 720p é o padrão — mais leve pra internet dos dois
  } catch (_) { return '1280x720'; }
}
function saveScreenResolution(v) {
  try { localStorage.setItem(SCREEN_RESOLUTION_KEY, v); } catch (_) { /* segue sem persistir */ }
}
function getSavedScreenFps() {
  try {
    const v = parseInt(localStorage.getItem(SCREEN_FPS_KEY), 10);
    return SCREEN_FPS_VALUES.includes(v) ? v : 30; // 30fps é o padrão
  } catch (_) { return 30; }
}
function saveScreenFps(v) {
  try { localStorage.setItem(SCREEN_FPS_KEY, String(v)); } catch (_) { /* segue sem persistir */ }
}
// teto absoluto do compartilhamento de tela: 16 Mbps (vale pro automático também)
const SCREEN_MAX_BITRATE_KBPS = 16000;
// bitrate em kbps; 0 = automático (o WebRTC decide sozinho, até o teto acima).
// valor salvo acima do teto (ex: as antigas opções de 20/35 Mbps) vira o teto.
function getSavedScreenBitrateKbps() {
  try {
    const v = parseInt(localStorage.getItem(SCREEN_BITRATE_KEY), 10);
    return Number.isFinite(v) && v >= 0 ? Math.min(v, SCREEN_MAX_BITRATE_KBPS) : 0;
  } catch (_) { return 0; }
}
function saveScreenBitrateKbps(v) {
  try { localStorage.setItem(SCREEN_BITRATE_KEY, String(v)); } catch (_) { /* segue sem persistir */ }
}
// o que o codificador sacrifica quando falta processador ou internet. O padrão do navegador pra
// tela compartilhada é "nitidez": mantém a resolução cravada e joga quadros fora — com 2-3 pessoas
// assistindo, medido aqui: 60 → ~15 fps. "equilibrado" (o padrão agora) corta um pouco de cada e
// segura o fps, que é o que o Discord faz pra jogo/vídeo.
//   contentHint: diz ao navegador que tipo de imagem é ('motion' = movimento, 'detail' = texto)
//   degradation: degradationPreference do RTCRtpSender
const SCREEN_PRIORITY_KEY = 'dusky:screenPriority';
const SCREEN_PRIORITIES = {
  balanced: { contentHint: 'motion', degradation: 'balanced' },
  smooth: { contentHint: 'motion', degradation: 'maintain-framerate' },
  sharp: { contentHint: 'detail', degradation: 'maintain-resolution' },
};
function getSavedScreenPriority() {
  try {
    const v = localStorage.getItem(SCREEN_PRIORITY_KEY);
    return SCREEN_PRIORITIES[v] ? v : 'balanced';
  } catch (_) { return 'balanced'; }
}
function saveScreenPriority(v) {
  try { localStorage.setItem(SCREEN_PRIORITY_KEY, SCREEN_PRIORITIES[v] ? v : 'balanced'); } catch (_) { /* segue sem persistir */ }
}

function getSavedScreenAudioEnabled() {
  try {
    const v = localStorage.getItem(SCREEN_AUDIO_KEY);
    return v === null ? true : v === '1'; // com som por padrão
  } catch (_) { return true; }
}
function saveScreenAudioEnabled(v) {
  try { localStorage.setItem(SCREEN_AUDIO_KEY, v ? '1' : '0'); } catch (_) { /* segue sem persistir */ }
}

// ---------- volume por participante (0–200%) ----------
// pro bot de música especificamente: se a pessoa NUNCA mexeu no próprio slider (sem entrada no
// localStorage), o padrão é botServerVolume (o volume atual do /volume no chat, compartilhado
// via evento 'musicbot_volume') em vez do 100% fixo — assim quem nunca personalizou continua
// ouvindo o volume que a outra pessoa ajustou pelo comando. Depois que a pessoa mexe no slider
// uma vez, a preferência dela passa a mandar, igual todo resto do app (sempre local, nunca sincroniza).
function getSavedVolume(userId) {
  try {
    const raw = localStorage.getItem(`dusky:volume:${userId}`);
    if (raw === null) return userId === BOT_USER_ID ? botServerVolume : 100;
    const v = parseInt(raw, 10);
    return Number.isFinite(v) ? Math.min(200, Math.max(0, v)) : 100;
  } catch (_) { return userId === BOT_USER_ID ? botServerVolume : 100; }
}
function saveVolume(userId, val) {
  try { localStorage.setItem(`dusky:volume:${userId}`, String(val)); } catch (_) { /* segue sem persistir */ }
}

// ---------- volume do ÁUDIO DA TELA compartilhada por participante (0–200%), separado do volume do mic ----------
function getSavedScreenVolume(userId) {
  try {
    const v = parseInt(localStorage.getItem(`dusky:screenVolume:${userId}`), 10);
    return Number.isFinite(v) ? Math.min(200, Math.max(0, v)) : 100;
  } catch (_) { return 100; }
}
function saveScreenVolume(userId, val) {
  try { localStorage.setItem(`dusky:screenVolume:${userId}`, String(val)); } catch (_) { /* segue sem persistir */ }
}

// ---------- mostrar/ocultar as informações (resolução/fps/bitrate) da tile de compartilhamento de
// tela — ajuste local, independente pra cada lado: quem está VENDO a tela de alguém escolhe se quer
// ver essas infos na tile de quem compartilha (key `remote:${userId}`), e quem está COMPARTILHANDO
// escolhe se quer ver essas infos na própria tile de preview (key fixa 'local') ----------
function getSavedScreenStatsVisible(key) {
  try {
    const v = localStorage.getItem(`dusky:screenStatsVisible:${key}`);
    return v === null ? true : v === '1'; // visível por padrão, igual já era
  } catch (_) { return true; }
}
function saveScreenStatsVisible(key, val) {
  try { localStorage.setItem(`dusky:screenStatsVisible:${key}`, val ? '1' : '0'); } catch (_) { /* segue sem persistir */ }
}

// ---------- ajustes locais por participante (silenciar/ocultar vídeo só pro meu lado) ----------
function getLocalOverride(userId) {
  let o = localVoiceOverrides.get(userId);
  if (o) return o;
  let mutedLocal = false;
  let hideVideo = false;
  let soundboardMuted = false;
  try {
    mutedLocal = localStorage.getItem(`dusky:localMute:${userId}`) === '1';
    hideVideo = localStorage.getItem(`dusky:hideVideo:${userId}`) === '1';
    soundboardMuted = localStorage.getItem(`dusky:soundboardMute:${userId}`) === '1';
  } catch (_) { /* segue com os padrões (false, false) */ }
  o = { mutedLocal, hideVideo, soundboardMuted };
  localVoiceOverrides.set(userId, o);
  return o;
}
function saveLocalOverride(userId, o) {
  localVoiceOverrides.set(userId, o);
  try {
    localStorage.setItem(`dusky:localMute:${userId}`, o.mutedLocal ? '1' : '0');
    localStorage.setItem(`dusky:hideVideo:${userId}`, o.hideVideo ? '1' : '0');
    localStorage.setItem(`dusky:soundboardMute:${userId}`, o.soundboardMuted ? '1' : '0');
  } catch (_) { /* segue sem persistir */ }
}

// ---------- estado de voz por canal (pra pré-visualização na sidebar) ----------
function getChannelVoiceMap(channelId) {
  let m = channelVoiceState.get(channelId);
  if (!m) { m = new Map(); channelVoiceState.set(channelId, m); }
  return m;
}
// acha em qual canal um usuário está agora (o evento voice_state_update não vem com channelId)
function findParticipantChannel(userId) {
  for (const [channelId, m] of channelVoiceState.entries()) {
    if (m.has(userId)) return channelId;
  }
  return null;
}
