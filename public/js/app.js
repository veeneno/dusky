// shell principal — usuário logado, lista de canais, chat em tempo real
(function () {
  const channelGroups = document.getElementById('channelGroups');
  const profileBar = document.getElementById('profileBar');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileName = document.getElementById('profileName');
  const logoutBtn = document.getElementById('logoutBtn');
  const muteBtn = document.getElementById('muteBtn');
  const deafenBtn = document.getElementById('deafenBtn');
  const callMinibar = document.getElementById('callMinibar');
  const callMinibarName = document.getElementById('callMinibarName');
  const callMinibarLeaveBtn = document.getElementById('callMinibarLeaveBtn');
  const callView = document.getElementById('callView');
  const callChannelName = document.getElementById('callChannelName');
  const callParticipants = document.getElementById('callParticipants');
  const callViewMuteBtn = document.getElementById('callViewMuteBtn');
  const callViewDeafenBtn = document.getElementById('callViewDeafenBtn');
  const callViewCameraBtn = document.getElementById('callViewCameraBtn');
  const callViewScreenBtn = document.getElementById('callViewScreenBtn');
  const callViewLeaveBtn = document.getElementById('callViewLeaveBtn');
  const callScreenShareArea = document.getElementById('callScreenShareArea');
  const callConnectionStatus = document.getElementById('callConnectionStatus');

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModalBackdrop = document.getElementById('settingsModalBackdrop');
  const settingsTabs = document.getElementById('settingsTabs');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const settingsError = document.getElementById('settingsError');
  const micSelect = document.getElementById('micSelect');
  const micMeterFill = document.getElementById('micMeterFill');
  const micMeterThreshold = document.getElementById('micMeterThreshold');
  const micGainRange = document.getElementById('micGainRange');
  const micGainValue = document.getElementById('micGainValue');
  const micTestBtn = document.getElementById('micTestBtn');
  const micTestStatus = document.getElementById('micTestStatus');
  const micTestPlayback = document.getElementById('micTestPlayback');
  const selfMonitorCheckbox = document.getElementById('selfMonitorCheckbox');
  const tauriMicWarning = document.getElementById('tauriMicWarning');
  const speakerUnsupportedHint = document.getElementById('speakerUnsupportedHint');
  const micGateModeField = document.getElementById('micGateModeField');
  const micGateModeSelect = document.getElementById('micGateModeSelect');
  const micGateStatus = document.getElementById('micGateStatus');
  const micSensitivityField = document.getElementById('micSensitivityField');
  const micSensitivityRange = document.getElementById('micSensitivityRange');
  const micSensitivityValue = document.getElementById('micSensitivityValue');
  const noiseSuppressionSelect = document.getElementById('noiseSuppressionSelect');
  const voiceProcessingSelect = document.getElementById('voiceProcessingSelect');
  const noiseSuppressionLevelField = document.getElementById('noiseSuppressionLevelField');
  const noiseSuppressionLevelSelect = document.getElementById('noiseSuppressionLevelSelect');
  const noiseSuppressionStatus = document.getElementById('noiseSuppressionStatus');
  const screenResolutionSelect = document.getElementById('screenResolutionSelect');
  const screenFpsSelect = document.getElementById('screenFpsSelect');
  const screenBitrateSelect = document.getElementById('screenBitrateSelect');
  const screenPrioritySelect = document.getElementById('screenPrioritySelect');
  const screenAudioCheckbox = document.getElementById('screenAudioCheckbox');
  const speakerField = document.getElementById('speakerField');
  const speakerSelect = document.getElementById('speakerSelect');
  const speakerTestBtn = document.getElementById('speakerTestBtn');
  const notificationSoundsCheckbox = document.getElementById('notificationSoundsCheckbox');
  const cameraSelect = document.getElementById('cameraSelect');
  const cameraPreview = document.getElementById('cameraPreview');
  const cameraPreviewEmpty = document.getElementById('cameraPreviewEmpty');

  const mainEmpty = document.getElementById('mainEmpty');
  const chatView = document.getElementById('chatView');
  const chatChannelName = document.getElementById('chatChannelName');
  const chatChannelIcon = document.getElementById('chatChannelIcon');
  const chatMessages = document.getElementById('chatMessages');
  const chatComposer = document.getElementById('chatComposer');
  const chatInput = document.getElementById('chatInput');

  const membersToggleBtn = document.getElementById('membersToggleBtn');
  const memberPanel = document.getElementById('memberPanel');
  const memberSectionOnline = document.getElementById('memberSectionOnline');
  const memberSectionOffline = document.getElementById('memberSectionOffline');
  const memberSectionBots = document.getElementById('memberSectionBots');

  const attachBtn = document.getElementById('attachBtn');
  const attachInput = document.getElementById('attachInput');
  const attachmentPreview = document.getElementById('attachmentPreview');
  const attachmentPreviewThumb = document.getElementById('attachmentPreviewThumb');
  const attachmentPreviewName = document.getElementById('attachmentPreviewName');
  const attachmentPreviewRemove = document.getElementById('attachmentPreviewRemove');
  const attachmentPreviewProgressTrack = document.getElementById('attachmentPreviewProgressTrack');
  const attachmentPreviewProgressFill = document.getElementById('attachmentPreviewProgressFill');
  const attachmentPreviewProgressText = document.getElementById('attachmentPreviewProgressText');
  const composerError = document.getElementById('composerError');
  const chatSendBtn = document.getElementById('chatSendBtn');

  const gifBtn = document.getElementById('gifBtn');
  const gifPicker = document.getElementById('gifPicker');
  const gifPickerTabs = document.getElementById('gifPickerTabs');
  const gifSearchInput = document.getElementById('gifSearchInput');
  const gifPickerGrid = document.getElementById('gifPickerGrid');

  const replyPreview = document.getElementById('replyPreview');
  const replyPreviewName = document.getElementById('replyPreviewName');
  const replyPreviewSnippet = document.getElementById('replyPreviewSnippet');
  const replyPreviewRemove = document.getElementById('replyPreviewRemove');

  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalTitle = document.getElementById('modalTitle');
  const modalError = document.getElementById('modalError');
  const newChannelName = document.getElementById('newChannelName');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalCreateBtn = document.getElementById('modalCreateBtn');


  const ICONS = {
    text: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    voice: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  };
  const TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  const MSG_TRASH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  const MSG_EDIT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const MSG_REPLY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>';
  const VIDEO_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';
  const FILE_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  const DOWNLOAD_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  const EXPAND_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  const COMPRESS_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

  const ACCENT_COLORS = ['#9D5CE8', '#FF8F66', '#7CD9A0', '#5CC8E8', '#E85C9D', '#E8D45C', '#5C7FE8', '#E85C5C'];
  const GROUP_WINDOW_MS = 5 * 60 * 1000; // mensagens da mesma pessoa em até 5min viram um grupo só

  let channels = [];
  let currentChannel = null;
  let pendingCreateType = 'text';
  let currentUser = null;
  let currentMessages = [];
  let hasOlderMessages = false; // ainda tem histórico mais antigo no servidor pra esse canal?
  let loadingOlderMessages = false;
  let pendingAttachment = null;
  let activeUploadXhr = null; // XMLHttpRequest do envio de anexo em andamento (null se não tem upload rolando)
  let pendingReplyTo = null; // { id, authorName, snippet } — mensagem que estou respondendo agora
  let members = []; // membros do servidor aberto agora
  let bots = [];
  let servers = []; // servidores dos quais sou membro
  let currentServerId = null; // null = tela inicial (mensagens diretas)
  let dms = []; // minhas conversas diretas
  let serverRoles = []; // cargos do servidor aberto
  let myServerPerms = { is_admin: false, role_ids: [] }; // o que eu posso no servidor aberto
  const usersById = new Map(); // cache de todo usuario que ja apareceu (ver rememberUser)
  const unreadChannels = new Map(); // channelId -> { serverId (null = DM), mentions } — vem do servidor (/api/unread)

  // ---------- estado de chamada de voz (WebRTC) ----------
  let voiceChannel = null; // canal de voz que estou ocupando de verdade (pode diferir do currentChannel se eu for ver um canal de texto durante a call)
  let appAudioCaptureStream = null; // só no app desktop Electron: stream extra de getUserMedia quando
                                     // o plano de áudio da tela é 'app' (isolamento por app via PipeWire
                                     // — ver window.didiscordDesktop em electron/preload.js). Guardado
                                     // aqui só pra poder parar a track e devolver o roteamento no
                                     // stopScreenShare(); nunca é usado quando o plano é 'system' ou 'none'.
  let pcmAudioGenerator = null; // só no app desktop Electron/Windows: MediaStreamTrackGenerator usado
                                 // quando o plano de áudio da tela é 'pcm' (WASAPI Process Loopback via
                                 // didiscord-audio-helper.exe — ver capturePcmAudioTrack abaixo)
  let pcmAudioWriter = null; // WritableStreamDefaultWriter do pcmAudioGenerator.writable
  let pcmAudioUnsubscribe = null; // cancela a inscrição em window.didiscordDesktop.onPcmChunk
  let pcmAudioLeftover = null; // Uint8Array — bytes de um frame incompleto, aguardando o próximo chunk
  let pcmAudioStartedAtMs = null; // performance.now() do primeiro chunk — timestamps do AudioData são relativos a isso
  let localStream = null;
  let localCameraStream = null;
  let localScreenStream = null;
  let cameraOn = false;
  let screenOn = false;
  let isMuted = false;
  let isDeafened = false;
  const callParticipantsState = new Map(); // userId -> { muted, deafened, cameraOn, screenOn }
  // chamada em grupo: uma RTCPeerConnection por pessoa da call (malha / "mesh"). Ver createPeer.
  const peers = new Map(); // userId -> peer (ver newPeer)
  let voiceStatsTimer = null;
  let localScreenAudioTrack = null; // áudio da MINHA tela (pode vir à parte do vídeo, ex: app desktop)
  // compartilhamento pela placa de vídeo (app desktop): { encoderName, hardware, viewers:Set, stats }
  let nativeScreencast = null;
  const unwatchedScreens = new Set(); // userIds cuja tela eu parei de assistir
  let spotlightUserId = null; // câmera ampliada na call (pode ser a minha)
  let baseCallStatus = ''; // aviso fixo da call (ex: sem microfone) — "reconectando…" tem prioridade
  // estado de TODOS os canais de voz (não só o que estou ocupando agora) — alimenta a
  // pré-visualização na sidebar de quem está em cada canal, mesmo sem eu estar na call
  const channelVoiceState = new Map(); // channelId -> Map(userId -> {muted, deafened, cameraOn, screenOn})
  // ajustes que valem só PRA MIM (nunca chegam no outro lado): silenciar localmente e ocultar
  // vídeo de alguém, pra não precisar deixar esses controles sempre visíveis embaixo da pessoa
  const localVoiceOverrides = new Map(); // userId -> { mutedLocal, hideVideo }
  let audioCtx = null;
  let localAnalyser = null;
  let legacySpeakingTimer = null; // timer só para a detecção legada
  const SPEAKING_TICK_MS = 33;
  let rawMicStream = null; // stream crua do getUserMedia, antes do reforço de ganho — precisa ser parada separadamente pra liberar o hardware do mic
  let micGainNode = null; // GainNode aplicado no mic durante a call de verdade — ajustável ao vivo pelo slider de configurações
  let callMicGraph = null;
  let micNsActiveMode = 'off'; // qual supressão está de fato rodando ('deepfilter' | 'rnnoise' | 'off')
  let selfMonitorGainNode = null; // "ouvir a si mesmo" — toca o próprio mic de volta no fone, só localmente
  let selfMonitorSourceNode = null;
  let selfMonitorSourceStream = null;
  // reforço de volume acima de 100% pro áudio remoto: o <audio> nativo só vai até 100% (volume=1),
  // então pra chegar em até 200% somamos por cima um GainNode em paralelo (ver applyLocalOverridesToRemoteAudio)

  // pseudo-userId do bot de música — tem que ser o MESMO valor hardcoded em server/realtime.js
  // (BOT_USER_ID). O bot nunca é uma conexão WebRTC de verdade: ele só aparece nos eventos de
  // presença de voz (voice_channel_state/voice_user_joined/voice_user_left) pra virar uma tile
  // na call view. O áudio dele chega separado, por HTTP (GET /api/musicbot/stream), tocado num
  // <audio> próprio (#musicbotAudio) — nunca por uma RTCPeerConnection.
  const BOT_USER_ID = -1;
  let botAudioBoostGainNode = null; // mesmo esquema do remoteBoostGainNode acima, só que pro áudio do bot
  let botAudioBoostSourceEl = null; // qual <audio> já está conectado nesse grafo (evita reconectar à toa)
  let botServerVolume = 100; // volume atual do bot (server/bots/musicBot/queue.js) — sincronizado no
                              // load via GET /api/musicbot/state e ao vivo via evento 'musicbot_volume'.
                              // só vale como PADRÃO pra quem nunca personalizou o próprio slider (ver getSavedVolume).

  // STUN puro como ponto de partida — vira a lista completa (STUN + TURN do Metered) assim que
  // refreshIceServers() rodar. Guardamos como variável (não const) porque é trocada em tempo real.
  let iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

  // busca no servidor uma credencial TURN de curta duração (a secret key do Metered nunca
  // sai do backend). Chamado sempre que entramos numa call, pra pegar uma credencial fresca.
  async function refreshIceServers() {
    try {
      const res = await fetch('/api/rtc/ice-servers');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        iceServers = data.iceServers;
      }
    } catch (_) {
      // sem internet ou o Metered caiu — segue com o que já tinha (STUN puro, na pior das hipóteses)
    }
  }

  // ---------- preferências de dispositivo (mic / saída / câmera) ----------
  const DEVICE_PREF_KEYS = { mic: 'didiscord:device:mic', speaker: 'didiscord:device:speaker', camera: 'didiscord:device:camera' };
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
  const MIC_GATE_MODE_KEY = 'didiscord:micGateMode';
  const MIC_SENSITIVITY_KEY = 'didiscord:micSensitivity';
  const NOISE_SUPPRESSION_KEY = 'didiscord:noiseSuppression';
  const NOISE_SUPPRESSION_LEVEL_KEY = 'didiscord:noiseSuppressionLevel';
  const NOISE_SUPPRESSION_LEVELS = [20, 40, 60];
  const MIC_GAIN_KEY = 'didiscord:micGain';

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

  const SELF_MONITOR_KEY = 'didiscord:selfMonitor';
  function getSavedSelfMonitor() {
    try { return localStorage.getItem(SELF_MONITOR_KEY) === '1'; } catch (_) { return false; }
  }
  function saveSelfMonitor(v) {
    try { localStorage.setItem(SELF_MONITOR_KEY, v ? '1' : '0'); } catch (_) { /* segue sem persistir */ }
  }

  // ---------- sons de notificação (entrar/sair de call, mensagem recebida) ----------
  const NOTIFICATION_SOUNDS_KEY = 'didiscord:notificationSounds';
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
  const VOICE_PROCESSING_KEY = 'didiscord:voiceProcessing';
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
  // volume automático: 'browser' (o do navegador, antes do supressor — padrão) ou 'own' (o nivelador
  // do didiscord, depois do supressor — ver worklets/mic-leveler.js). No modo estúdio não tem nenhum.
  const MIC_LEVELER_KEY = 'didiscord:micLeveler';
  function getSavedMicLeveler() {
    try { return localStorage.getItem(MIC_LEVELER_KEY) === 'own' ? 'own' : 'browser'; } catch (_) { return 'browser'; }
  }
  function usesOwnLeveler() {
    return getSavedMicLeveler() === 'own' && getSavedVoiceProcessing() !== 'studio';
  }

  // ---------- preferências do chat e de acessibilidade (aba "chat"/"acessibilidade") ----------
  const PREF_DEFAULTS = {
    prefLinkPreviews: true, prefJumboEmoji: true, prefShortcodes: true, prefTyping: true, prefEnterSends: true,
    prefClock24: true, prefAutoplayVideo: true, prefReduceMotion: false, prefUnderlineLinks: false,
    prefAlwaysTimestamps: false, prefSaturation: 100,
  };
  function getPref(key) {
    try {
      const v = localStorage.getItem(`didiscord:${key}`);
      if (v === null) return PREF_DEFAULTS[key];
      return typeof PREF_DEFAULTS[key] === 'number' ? Number(v) : v === '1';
    } catch (_) { return PREF_DEFAULTS[key]; }
  }
  function setPref(key, value) {
    try { localStorage.setItem(`didiscord:${key}`, typeof value === 'number' ? String(value) : (value ? '1' : '0')); } catch (_) { /* ok */ }
    applyPrefs();
  }
  // as que mudam o visual viram atributos no <html> (o CSS faz o resto)
  function applyPrefs() {
    const root = document.documentElement;
    root.toggleAttribute('data-reduce-motion', getPref('prefReduceMotion'));
    root.toggleAttribute('data-underline-links', getPref('prefUnderlineLinks'));
    root.toggleAttribute('data-always-time', getPref('prefAlwaysTimestamps'));
    const sat = getPref('prefSaturation');
    root.toggleAttribute('data-saturation', sat < 100);
    root.style.setProperty('--app-saturation', String(sat / 100));
  }
  applyPrefs();

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
    } catch (_) { /* segue com a intensidade padrão */ }
    return 40;
  }


  // ---------- qualidade do compartilhamento de tela (resolução + fps + bitrate + com/sem áudio) ----------
  const SCREEN_RESOLUTION_KEY = 'didiscord:screenResolution';
  const SCREEN_FPS_KEY = 'didiscord:screenFps';
  const SCREEN_BITRATE_KEY = 'didiscord:screenBitrateKbps';
  const SCREEN_AUDIO_KEY = 'didiscord:screenAudioEnabled';

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
  const SCREEN_PRIORITY_KEY = 'didiscord:screenPriority';
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
      const raw = localStorage.getItem(`didiscord:volume:${userId}`);
      if (raw === null) return userId === BOT_USER_ID ? botServerVolume : 100;
      const v = parseInt(raw, 10);
      return Number.isFinite(v) ? Math.min(200, Math.max(0, v)) : 100;
    } catch (_) { return userId === BOT_USER_ID ? botServerVolume : 100; }
  }
  function saveVolume(userId, val) {
    try { localStorage.setItem(`didiscord:volume:${userId}`, String(val)); } catch (_) { /* segue sem persistir */ }
  }

  // ---------- volume do ÁUDIO DA TELA compartilhada por participante (0–200%), separado do volume do mic ----------
  function getSavedScreenVolume(userId) {
    try {
      const v = parseInt(localStorage.getItem(`didiscord:screenVolume:${userId}`), 10);
      return Number.isFinite(v) ? Math.min(200, Math.max(0, v)) : 100;
    } catch (_) { return 100; }
  }
  function saveScreenVolume(userId, val) {
    try { localStorage.setItem(`didiscord:screenVolume:${userId}`, String(val)); } catch (_) { /* segue sem persistir */ }
  }

  // ---------- mostrar/ocultar as informações (resolução/fps/bitrate) da tile de compartilhamento de
  // tela — ajuste local, independente pra cada lado: quem está VENDO a tela de alguém escolhe se quer
  // ver essas infos na tile de quem compartilha (key `remote:${userId}`), e quem está COMPARTILHANDO
  // escolhe se quer ver essas infos na própria tile de preview (key fixa 'local') ----------
  function getSavedScreenStatsVisible(key) {
    try {
      const v = localStorage.getItem(`didiscord:screenStatsVisible:${key}`);
      return v === null ? true : v === '1'; // visível por padrão, igual já era
    } catch (_) { return true; }
  }
  function saveScreenStatsVisible(key, val) {
    try { localStorage.setItem(`didiscord:screenStatsVisible:${key}`, val ? '1' : '0'); } catch (_) { /* segue sem persistir */ }
  }

  // ---------- ajustes locais por participante (silenciar/ocultar vídeo só pro meu lado) ----------
  function getLocalOverride(userId) {
    let o = localVoiceOverrides.get(userId);
    if (o) return o;
    let mutedLocal = false;
    let hideVideo = false;
    try {
      mutedLocal = localStorage.getItem(`didiscord:localMute:${userId}`) === '1';
      hideVideo = localStorage.getItem(`didiscord:hideVideo:${userId}`) === '1';
    } catch (_) { /* segue com os padrões (false, false) */ }
    o = { mutedLocal, hideVideo };
    localVoiceOverrides.set(userId, o);
    return o;
  }
  function saveLocalOverride(userId, o) {
    localVoiceOverrides.set(userId, o);
    try {
      localStorage.setItem(`didiscord:localMute:${userId}`, o.mutedLocal ? '1' : '0');
      localStorage.setItem(`didiscord:hideVideo:${userId}`, o.hideVideo ? '1' : '0');
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
        <span>ocultar vídeo</span>
        <input type="checkbox" data-role="hide-video" ${override.hideVideo ? 'checked' : ''}>
      </label>`}
    `;
    appendVoiceModerationItems(menu, userId);
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
      if (isBot) applyLocalOverridesToBotAudio();
      else applyLocalOverridesToRemoteAudio(userId);
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
      // com o nivelador do didiscord ligado, o do navegador sai: dois ajustes brigando deixam a voz "bombeando"
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
  function isTauriApp() {
    return typeof window !== 'undefined' && (window.__TAURI__ !== undefined || window.__TAURI_INTERNALS__ !== undefined);
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  // ---------- sidebar / canais ----------


  function renderChannels() {
    channelGroups.innerHTML = '';

    // tela inicial (mensagens diretas): a lateral vira a lista de conversas
    if (currentServerId == null) {
      renderDmList();
      return;
    }

    const canManage = isAdminOfCurrentServer();
    const groups = [
      { type: 'text', label: 'canais de texto' },
      { type: 'voice', label: 'canais de voz' },
    ];

    for (const group of groups) {
      const items = channels.filter((c) => c.type === group.type);
      if (items.length === 0 && !canManage) continue;

      const wrap = document.createElement('div');
      wrap.className = 'channel-group';

      const labelRow = document.createElement('div');
      labelRow.className = 'channel-group-label';
      labelRow.innerHTML = `<span>${group.label}</span>`;
      if (canManage) {
        const addBtn = document.createElement('button');
        addBtn.className = 'channel-add-btn';
        addBtn.title = group.type === 'text' ? 'criar canal de texto' : 'criar canal de voz';
        addBtn.setAttribute('aria-label', addBtn.title);
        addBtn.textContent = '+';
        addBtn.addEventListener('click', () => openCreateModal(group.type));
        labelRow.appendChild(addBtn);
      }
      wrap.appendChild(labelRow);

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'channel-empty';
        empty.textContent = 'nenhum canal ainda';
        wrap.appendChild(empty);
      } else {
        for (const ch of items) {
          wrap.appendChild(buildChannelItem(ch, canManage));
          if (ch.type === 'voice') wrap.appendChild(buildVoicePreview(ch));
        }
      }

      channelGroups.appendChild(wrap);
    }

    renderVoicePreviews();
  }

  // pequena lista de quem está num canal de voz, mostrada embaixo do nome do canal na sidebar
  // — igual ao Discord, funciona mesmo que eu não esteja ocupando esse canal agora
  function buildVoicePreview(ch) {
    const el = document.createElement('div');
    el.className = 'channel-voice-preview';
    el.dataset.channelId = ch.id;
    el.hidden = true;
    return el;
  }

  function renderVoicePreviews() {
    channelGroups.querySelectorAll('.channel-voice-preview').forEach((el) => {
      const channelId = Number(el.dataset.channelId);
      const stateMap = channelVoiceState.get(channelId);
      el.innerHTML = '';

      if (!stateMap || stateMap.size === 0) {
        el.hidden = true;
        return;
      }
      el.hidden = false;

      for (const [userId, state] of stateMap.entries()) {
        const isBot = userId === BOT_USER_ID;
        const user = isBot ? botPseudoUser() : findUser(userId);
        if (!user) continue;
        const isSelfUser = !!(currentUser && currentUser.id === userId);

        const row = document.createElement('div');
        row.className = 'channel-voice-preview-row' + (speakingUsers.has(userId) ? ' is-speaking' : '');
        row.dataset.userId = userId;
        row.innerHTML = `
          <span class="channel-voice-preview-avatar">${memberAvatarInner(user)}</span>
          <span class="channel-voice-preview-name">${escapeHtml(user.username)}${isSelfUser ? ' (você)' : ''}</span>
          <span class="channel-voice-preview-badges">${callParticipantBadges(state)}</span>
        `;
        row.addEventListener('click', () => openViewProfile(userId, row));
        makeVoiceRowDraggable(row, userId);
        if (!isSelfUser) {
          row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openParticipantContextMenu(e, userId, user.username);
          });
        }
        el.appendChild(row);
      }
    });
  }

  function buildChannelItem(ch, canManage) {
    const el = document.createElement('div');
    el.className = 'channel-item';
    if (currentChannel && currentChannel.id === ch.id) el.classList.add('active');
    if (unreadChannels.has(ch.id)) el.classList.add('is-unread');
    el.dataset.channelId = ch.id;
    el.innerHTML = `<span class="icon">${ICONS[ch.type]}</span><span class="channel-item-name"></span>`;
    el.querySelector('.channel-item-name').textContent = ch.name;
    const unread = unreadChannels.get(ch.id);
    if (unread && unread.mentions > 0) el.appendChild(mentionBadge(unread.mentions, 'channel-mention-badge'));

    const locked = ch.type === 'voice' && ch.can_connect === false;
    if (ch.private_view || (ch.type === 'voice' && ch.private_connect)) {
      const lock = document.createElement('span');
      lock.className = 'channel-lock';
      lock.innerHTML = LOCK_ICON;
      lock.title = locked
        ? 'você não tem permissão pra entrar nessa call'
        : (ch.private_view ? 'canal privado (só alguns cargos veem)' : 'só alguns cargos entram nessa call');
      el.appendChild(lock);
    }
    if (locked) {
      el.classList.add('is-locked');
      el.title = 'você não tem permissão pra entrar nessa call';
    }
    makeVoiceChannelDropTarget(el, ch);

    if (canManage) {
      const editBtn = document.createElement('button');
      editBtn.className = 'channel-edit-btn';
      editBtn.title = 'editar canal';
      editBtn.setAttribute('aria-label', `editar canal ${ch.name}`);
      editBtn.innerHTML = GEAR_ICON;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openChannelEdit(ch);
      });
      el.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'channel-delete-btn';
      delBtn.title = 'apagar canal';
      delBtn.setAttribute('aria-label', `apagar canal ${ch.name}`);
      delBtn.innerHTML = TRASH_ICON;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChannel(ch);
      });
      el.appendChild(delBtn);
    }

    el.addEventListener('click', () => selectChannel(ch));
    return el;
  }

  async function deleteChannel(ch) {
    if (!confirm(`apagar o canal "${ch.name}"? isso apaga o histórico junto.`)) return;
    const res = await fetch(`/api/channels/${ch.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || 'não deu pra apagar o canal', 'error');
    }
    // a atualização da lista chega via broadcast (channel_deleted)
  }

  // ---------- lista de mensagens diretas (lateral da tela inicial) ----------

  function dmChannel(dm) {
    return { id: dm.id, type: 'text', name: dm.user.username, server_id: null, dm: true, userId: dm.user.id };
  }

  function renderDmList() {
    const wrap = document.createElement('div');
    wrap.className = 'channel-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'channel-group-label';
    labelRow.innerHTML = '<span>conversas</span>';
    const addBtn = document.createElement('button');
    addBtn.className = 'channel-add-btn';
    addBtn.title = 'nova conversa';
    addBtn.setAttribute('aria-label', 'nova conversa');
    addBtn.textContent = '+';
    addBtn.addEventListener('click', openNewDmModal);
    labelRow.appendChild(addBtn);
    wrap.appendChild(labelRow);

    if (dms.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'channel-empty';
      empty.textContent = 'nenhuma conversa ainda';
      wrap.appendChild(empty);
    }

    for (const dm of dms) wrap.appendChild(buildDmItem(dm));
    channelGroups.appendChild(wrap);
  }

  function buildDmItem(dm) {
    const u = findUser(dm.user.id) || dm.user;
    const el = document.createElement('div');
    el.className = 'dm-item';
    if (currentChannel && currentChannel.id === dm.id) el.classList.add('active');
    if (unreadChannels.has(dm.id)) el.classList.add('is-unread');
    el.innerHTML = `
      <span class="dm-item-avatar">${memberAvatarInner(u)}<span class="presence-dot${u.online ? ' is-online' : ''}"></span></span>
      <span class="dm-item-text">
        <span class="dm-item-name"></span>
        <span class="dm-item-status"></span>
      </span>
      <span class="unread-pill" aria-label="mensagens novas"></span>
    `;
    el.querySelector('.dm-item-name').textContent = u.username;
    const dmUnread = unreadChannels.get(dm.id);
    if (dmUnread && dmUnread.mentions > 0) {
      const pill = el.querySelector('.unread-pill');
      pill.textContent = dmUnread.mentions > 99 ? '99+' : String(dmUnread.mentions);
      pill.classList.add('has-count');
    }
    el.querySelector('.dm-item-status').textContent = u.status_text || (u.online ? 'online' : 'offline');
    el.addEventListener('click', () => selectChannel(dmChannel(dm)));
    return el;
  }

  // ---------- modal de criar canal ----------

  const channelTypePicker = document.getElementById('channelTypePicker');

  function setCreateType(type) {
    pendingCreateType = type;
    channelTypePicker.querySelectorAll('.channel-type-option').forEach((b) => {
      b.classList.toggle('active', b.dataset.type === type);
    });
    newChannelName.placeholder = type === 'text' ? 'novo-canal' : 'Sala de Chamada';
  }

  channelTypePicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.channel-type-option');
    if (btn) setCreateType(btn.dataset.type);
  });

  function openCreateModal(type) {
    if (!isAdminOfCurrentServer()) return;
    modalTitle.textContent = 'criar canal';
    setCreateType(type || 'text');
    newChannelName.value = '';
    modalError.textContent = '';
    modalBackdrop.hidden = false;
    newChannelName.focus();
  }

  function closeModal() {
    modalBackdrop.hidden = true;
  }

  modalCancelBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  async function submitCreateChannel() {
    const name = newChannelName.value.trim();
    if (!name) {
      modalError.textContent = 'dá um nome pro canal';
      return;
    }
    if (currentServerId == null) return;
    modalCreateBtn.disabled = true;
    try {
      const res = await fetch(`/api/servers/${currentServerId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: pendingCreateType }),
      });
      const data = await res.json();
      if (!res.ok) {
        modalError.textContent = data.error || 'não deu pra criar o canal';
        return;
      }
      closeModal();
      // a lista atualiza sozinha via broadcast (channel_created); se for de texto, já abre
      if (data.channel && data.channel.type === 'text') {
        if (!channels.some((c) => c.id === data.channel.id)) channels.push(data.channel);
        selectChannel(data.channel);
      }
    } finally {
      modalCreateBtn.disabled = false;
    }
  }

  modalCreateBtn.addEventListener('click', submitCreateChannel);
  newChannelName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCreateChannel();
    if (e.key === 'Escape') closeModal();
  });

  // ---------- chat ----------

  const AT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>';

  async function selectChannel(ch, opts = {}) {
    if (ch.type === 'voice' && ch.can_connect === false && !(voiceChannel && voiceChannel.id === ch.id)) {
      toast('você não tem permissão pra entrar nessa call', 'error');
      return;
    }
    closeMediaViewer();
    hideCommandPopup();
    const sameChannel = !!(currentChannel && currentChannel.id === ch.id);
    currentChannel = ch;
    if (ch.type === 'text') markChannelRead(ch.id);
    if (ch.server_id != null) rememberLastChannel(ch.server_id, ch.id);
    setViewingHistory(false);
    if (!(opts.aroundId && sameChannel)) closeSidePanels();
    renderTyping();
    renderChannels();
    renderRail();
    clearPendingAttachment();
    clearReplyTarget();
    showComposerError('');

    if (ch.type === 'voice') {
      mainEmpty.hidden = true;
      chatView.hidden = true;
      callView.hidden = false;
      callChannelName.textContent = ch.name;
      renderCallParticipants();
      if (!voiceChannel || voiceChannel.id !== ch.id) {
        await joinVoiceCall(ch);
      }
      return;
    }

    callView.hidden = true;
    mainEmpty.hidden = true;
    chatView.hidden = false;

    const isDm = !!ch.dm;
    chatView.classList.toggle('is-dm', isDm);
    if (isDm) {
      const u = findUser(ch.userId);
      const name = u ? u.username : ch.name;
      chatChannelIcon.innerHTML = AT_ICON;
      chatChannelName.textContent = name;
      chatInput.placeholder = `mensagem para @${name}`;
      membersToggleBtn.hidden = true;
      memberPanel.hidden = true;
      dmProfilePanel.hidden = false;
      renderDmProfilePanel();
    } else {
      chatChannelIcon.innerHTML = ICONS.text;
      chatChannelName.textContent = ch.name;
      chatInput.placeholder = `mensagem em #${ch.name}`;
      membersToggleBtn.hidden = false;
      memberPanel.hidden = memberPanelCollapsed;
      dmProfilePanel.hidden = true;
    }
    chatMessages.innerHTML = '<div class="chat-empty">carregando mensagens...</div>';

    const requestedId = ch.id;
    let data = null;
    try {
      const res = await fetch(`/api/channels/${ch.id}/messages${opts.aroundId ? `?around=${opts.aroundId}&limit=60` : ''}`);
      if (res.ok) data = await res.json();
    } catch (_) { /* cai no aviso abaixo */ }
    // se a pessoa trocou de canal enquanto carregava, descarta essa resposta
    if (!currentChannel || currentChannel.id !== requestedId) return;
    if (!data) {
      chatMessages.innerHTML = '<div class="chat-empty">não deu pra carregar as mensagens. tenta abrir o canal de novo.</div>';
      return;
    }
    currentMessages = data.messages || [];
    hasOlderMessages = !!data.has_more;
    renderMessages();
    if (opts.aroundId) {
      setViewingHistory(!!data.has_more_after);
      requestAnimationFrame(() => highlightMessage(opts.aroundId));
    } else {
      chatInput.focus();
    }
  }

  function messageGroupKey(m) {
    return m.user_id ? `u${m.user_id}` : `b${m.bot_name || 'bot'}`;
  }

  let stuckToBottom = true;
  function isScrolledNearBottom() {
    return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 120;
  }

  function renderMessages() {
    chatMessages.innerHTML = '';

    if (currentMessages.length === 0) {
      chatMessages.innerHTML = '<div class="chat-empty">nenhuma mensagem ainda — comece a conversa</div>';
      return;
    }

    chatMessages.appendChild(buildHistoryTop());
    let prev = null;
    for (const m of currentMessages) {
      chatMessages.appendChild(buildMessageEl(m, isContinuation(prev, m)));
      prev = m;
    }
    scrollToBottom();
    // canal com pouca mensagem não tem barra de rolagem — então nunca dispararia o "chegou no topo"
    maybeLoadOlderMessages();
  }

  function isContinuation(prev, m) {
    return !!prev
      && messageGroupKey(prev) === messageGroupKey(m)
      && (timeValue(m.created_at) - timeValue(prev.created_at)) < GROUP_WINDOW_MS;
  }

  // ---------- histórico antigo (rolar pro topo carrega mais) ----------
  // o canal abre com as 50 mensagens mais recentes; chegando perto do topo, busca as 50 anteriores
  // e encaixa em cima sem mexer no que a pessoa está lendo — até chegar no começo do canal.

  function buildHistoryTop() {
    const el = document.createElement('div');
    el.className = 'chat-history-top';
    updateHistoryTop(el);
    return el;
  }

  function updateHistoryTop(el = chatMessages.querySelector('.chat-history-top')) {
    if (!el) return;
    if (hasOlderMessages) {
      el.classList.remove('is-start');
      el.textContent = loadingOlderMessages ? 'carregando mensagens antigas…' : '';
    } else {
      el.classList.add('is-start');
      const name = currentChannel ? (currentChannel.dm ? `@${chatChannelName.textContent}` : `#${currentChannel.name}`) : 'canal';
      el.textContent = `começo de ${name}`;
    }
  }

  function maybeLoadOlderMessages() {
    if (!hasOlderMessages || loadingOlderMessages || !currentChannel) return;
    if (chatMessages.scrollTop > 300) return;
    loadOlderMessages();
  }

  async function loadOlderMessages() {
    const channel = currentChannel;
    const oldest = currentMessages[0];
    if (!channel || !oldest) return;
    loadingOlderMessages = true;
    updateHistoryTop();
    try {
      const res = await fetch(`/api/channels/${channel.id}/messages?before=${oldest.id}&limit=50`);
      if (!res.ok || currentChannel !== channel) return;
      const data = await res.json();
      if (currentChannel !== channel || currentMessages[0] !== oldest) return; // trocou de canal no meio
      const older = data.messages || [];
      hasOlderMessages = !!data.has_more;
      if (!older.length) return;

      // guarda a distância até o fim pra devolver a pessoa exatamente no mesmo ponto da leitura
      const fromBottom = chatMessages.scrollHeight - chatMessages.scrollTop;

      const frag = document.createDocumentFragment();
      let prev = null;
      for (const m of older) {
        const el = buildMessageEl(m, isContinuation(prev, m));
        el.classList.add('no-anim'); // histórico antigo entra quieto, sem animação de "mensagem nova"
        frag.appendChild(el);
        prev = m;
      }
      // a mensagem que era a primeira agora pode virar continuação da última carregada
      const firstEl = chatMessages.querySelector(`.msg-group[data-message-id="${oldest.id}"]`);
      if (firstEl && isContinuation(prev, oldest) !== firstEl.classList.contains('is-continued')) {
        const rebuilt = buildMessageEl(oldest, isContinuation(prev, oldest));
        rebuilt.classList.add('no-anim');
        firstEl.replaceWith(rebuilt);
      }
      const top = chatMessages.querySelector('.chat-history-top');
      if (top) top.after(frag);
      else chatMessages.prepend(frag);
      currentMessages = older.concat(currentMessages);

      chatMessages.scrollTop = chatMessages.scrollHeight - fromBottom;
    } catch (_) {
      /* sem conexão — tenta de novo na próxima rolagem */
    } finally {
      loadingOlderMessages = false;
      updateHistoryTop();
    }
    // se mesmo assim a tela ainda não encheu (mensagens curtinhas), continua puxando
    if (currentChannel === channel) requestAnimationFrame(maybeLoadOlderMessages);
  }

  chatMessages.addEventListener('scroll', maybeLoadOlderMessages, { passive: true });

  // "grudado no fim": se a pessoa está no fim da conversa, qualquer imagem/vídeo/prévia que termine de
  // carregar depois (e empurre tudo pra cima) mantém a rolagem lá embaixo. load não borbulha, por isso
  // a escuta é na fase de captura.
  chatMessages.addEventListener('scroll', () => { stuckToBottom = isScrolledNearBottom(); }, { passive: true });
  const keepStuck = () => { if (stuckToBottom) scrollToBottom(); };
  chatMessages.addEventListener('load', keepStuck, true);
  chatMessages.addEventListener('loadedmetadata', keepStuck, true);

  // adiciona só a mensagem nova ao DOM (sem reconstruir a lista inteira) — evita replay da
  // animação de entrada em todo o histórico e evita perder a posição do scroll a cada mensagem
  function appendMessageToDom(m) {
    const empty = chatMessages.querySelector('.chat-empty');
    if (empty) empty.remove();

    const prev = currentMessages.length > 1 ? currentMessages[currentMessages.length - 2] : null;
    const continued = isContinuation(prev, m);

    const wasNearBottom = isScrolledNearBottom();
    const isMine = !!(currentUser && m.user_id === currentUser.id);

    const el = buildMessageEl(m, continued);
    chatMessages.appendChild(el);

    if (isMine || wasNearBottom) {
      scrollToBottom();
      // imagens/vídeos de anexo carregam de forma assíncrona e mudam a altura depois —
      // reforça o scroll quando o conteúdo terminar de carregar, senão a rolagem para "quase lá"
      const media = el.querySelector('img, video');
      if (media) {
        const reScroll = () => { if (isMine || isScrolledNearBottom()) scrollToBottom(); };
        media.addEventListener('load', reScroll, { once: true });
        media.addEventListener('loadedmetadata', reScroll, { once: true });
      }
    }
  }

  function removeMessageFromDom(messageId) {
    const el = chatMessages.querySelector(`.msg-group[data-message-id="${messageId}"]`);
    if (el) el.remove();
    if (currentMessages.length === 0) {
      chatMessages.innerHTML = '<div class="chat-empty">nenhuma mensagem ainda — comece a conversa</div>';
    }
  }

  function buildMessageEl(m, continued) {
    const isBot = !m.user_id;
    const name = isBot ? (m.bot_name || 'bot') : m.username;

    const el = document.createElement('div');
    el.className = 'msg-group' + (continued ? ' is-continued' : '');
    el.dataset.messageId = m.id;

    const avatarInner = (!isBot && m.avatar_url)
      ? `<img src="${m.avatar_url}" alt="${escapeHtml(name)}">`
      : initials(name);

    el.innerHTML = `
      <div class="msg-avatar${isBot ? '' : ' is-clickable'}">${avatarInner}</div>
      <span class="msg-time-inline">${formatTime(m.created_at)}</span>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-author ${isBot ? 'is-bot' : 'is-clickable'}"${isBot ? '' : ` data-user-id="${Number(m.user_id)}"`}>${escapeHtml(name)}</span>
          ${isBot ? '<span class="msg-bot-tag">bot</span>' : ''}
          <span class="msg-time">${formatTime(m.created_at)}</span>
        </div>
        <div class="msg-text"></div>
      </div>
    `;
    if (!isBot) applyAuthorColors(el);
    renderMessageText(el.querySelector('.msg-text'), m.content || '', !!m.edited, m);
    if (messageMentionsMe(m)) el.classList.add('mentions-me');
    if (m.pinned) {
      const pin = document.createElement('span');
      pin.className = 'msg-pinned';
      pin.title = 'mensagem fixada';
      pin.innerHTML = PIN_ICON;
      el.querySelector('.msg-meta').appendChild(pin);
    }

    if (m.embed_json) {
      try {
        const embed = JSON.parse(m.embed_json);
        el.querySelector('.msg-body').appendChild(buildEmbedEl(embed));
      } catch (_) { /* embed malformado — ignora silenciosamente, mensagem de texto já apareceu */ }
    }

    if (!isBot) {
      const msgAvatarEl = el.querySelector('.msg-avatar');
      const msgAuthorEl = el.querySelector('.msg-author');
      msgAvatarEl.addEventListener('click', (e) => openViewProfile(m.user_id, e.currentTarget));
      msgAuthorEl.addEventListener('click', (e) => openViewProfile(m.user_id, e.currentTarget));
      // botão direito também funciona aqui — ajusta volume/muta local/oculta vídeo dessa pessoa,
      // igual em qualquer outro lugar do app onde o perfil dela aparece
      if (!currentUser || currentUser.id !== m.user_id) {
        const openVolumeMenu = (e) => { e.preventDefault(); openParticipantContextMenu(e, m.user_id, m.username); };
        msgAvatarEl.addEventListener('contextmenu', openVolumeMenu);
        msgAuthorEl.addEventListener('contextmenu', openVolumeMenu);
      }
    }

    if (m.reply_to_id) {
      const ref = document.createElement('div');
      ref.className = 'msg-reply-ref';
      const refName = m.reply_username || m.reply_bot_name || 'mensagem apagada';
      const refSnippet = m.reply_content
        ? DidiMarkdown.plain(m.reply_content, mentionContext(m))
        : (m.reply_attachment_type === 'video' ? 'vídeo' : m.reply_attachment_type === 'file' ? 'arquivo' : m.reply_attachment_type === 'image' ? 'imagem' : '');
      ref.innerHTML = `<span class="msg-reply-ref-icon">${MSG_REPLY_ICON}</span><span class="msg-reply-ref-name">${escapeHtml(refName)}</span><span class="msg-reply-ref-snippet"></span>`;
      ref.querySelector('.msg-reply-ref-snippet').textContent = refSnippet;
      ref.addEventListener('click', () => jumpToMessage(m.reply_to_id));
      el.querySelector('.msg-body').insertBefore(ref, el.querySelector('.msg-meta'));
    }

    if (m.attachment_url) {
      const wrap = document.createElement('div');
      if (m.attachment_type === 'video') {
        wrap.className = 'msg-attachment msg-attachment-video';
        wrap.appendChild(createVideoPlayer(m.attachment_url, { hoverPreview: true, onExpand: (t) => openMediaViewer(m, { startAt: t }) }));
      } else if (m.attachment_type === 'file') {
        // arquivo genérico (não imagem/vídeo) — chip de download com nome e tamanho, sem preview
        wrap.className = 'msg-attachment msg-attachment-file';
        const fname = m.attachment_name || 'arquivo';
        const fsize = formatFileSize(m.attachment_size);
        wrap.innerHTML = `
          <a href="${m.attachment_url}" download="${escapeHtml(fname)}" class="msg-file-chip">
            <span class="msg-file-chip-icon">${FILE_ICON}</span>
            <span class="msg-file-chip-info">
              <span class="msg-file-chip-name"></span>
              <span class="msg-file-chip-size">${escapeHtml(fsize)}</span>
            </span>
            <span class="msg-file-chip-download">${DOWNLOAD_ICON}</span>
          </a>
        `;
        wrap.querySelector('.msg-file-chip-name').textContent = fname;
      } else {
        wrap.className = 'msg-attachment msg-attachment-image is-loading' + (m.attachment_type === 'gif' || /\.gif($|\?)/i.test(m.attachment_url) ? ' is-gif' : '');
        wrap.innerHTML = `<button type="button" class="msg-media-btn" aria-label="abrir imagem"><img src="${escapeAttr(m.attachment_url)}" alt="anexo" loading="lazy"></button>`;
        const img = wrap.querySelector('img');
        const loaded = () => wrap.classList.remove('is-loading');
        if (img.complete) loaded(); else { img.addEventListener('load', loaded, { once: true }); img.addEventListener('error', () => { wrap.classList.remove('is-loading'); wrap.classList.add('is-broken'); }, { once: true }); }
        wrap.querySelector('.msg-media-btn').addEventListener('click', () => openMediaViewer(m));
      }
      el.querySelector('.msg-body').appendChild(wrap);
    }

    attachLinkEmbeds(el, m);
    el.querySelector('.msg-body').appendChild(buildReactionsEl(m));

    // barrinha de ações que aparece no hover: reagir, fixar, responder, editar, apagar
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    el.appendChild(actions);

    const reactBtn = document.createElement('button');
    reactBtn.type = 'button';
    reactBtn.className = 'msg-action-btn';
    reactBtn.title = 'reagir';
    reactBtn.innerHTML = REACT_ICON;
    reactBtn.addEventListener('click', () => DidiEmoji.open({ anchor: reactBtn, onPick: (emoji) => toggleReaction(m, emoji) }));
    actions.appendChild(reactBtn);

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'msg-action-btn' + (m.pinned ? ' is-on' : '');
    pinBtn.title = m.pinned ? 'desafixar' : 'fixar mensagem';
    pinBtn.innerHTML = PIN_ICON;
    pinBtn.addEventListener('click', () => togglePin(m));
    actions.appendChild(pinBtn);

    if (!isBot) {
      const replyBtn = document.createElement('button');
      replyBtn.className = 'msg-reply-btn';
      replyBtn.title = 'responder';
      replyBtn.innerHTML = MSG_REPLY_ICON;
      replyBtn.addEventListener('click', () => setReplyTarget(m));
      actions.appendChild(replyBtn);
    }

    if (canEditMessage(m)) {
      const editBtn = document.createElement('button');
      editBtn.className = 'msg-edit-btn';
      editBtn.title = 'editar mensagem';
      editBtn.innerHTML = MSG_EDIT_ICON;
      editBtn.addEventListener('click', () => startEditMessage(m, el));
      actions.appendChild(editBtn);
    }

    if (canDeleteMessage(m)) {
      const delBtn = document.createElement('button');
      delBtn.className = 'msg-delete-btn';
      delBtn.title = 'apagar mensagem';
      delBtn.innerHTML = MSG_TRASH_ICON;
      delBtn.addEventListener('click', () => deleteMessage(m.id));
      actions.appendChild(delBtn);
    }

    return el;
  }

  // só o autor edita (bot e gif não têm texto pra editar)
  function canEditMessage(m) {
    return !!(currentUser && m.user_id && m.user_id === currentUser.id && m.attachment_type !== 'gif');
  }

  // troca o texto da mensagem por uma caixa de edição: Enter salva, Shift+Enter quebra linha, Esc cancela.
  // a mensagem atualizada volta pra todo mundo pelo broadcast message_edited
  function startEditMessage(m, el) {
    const textEl = el.querySelector('.msg-text');
    if (!textEl || el.classList.contains('is-editing')) return;
    el.classList.add('is-editing');

    const ta = document.createElement('textarea');
    ta.className = 'msg-edit-input';
    ta.value = decodeMentions(m.content || '', m);
    ta.maxLength = 4000;
    ta.rows = 1;
    const hint = document.createElement('div');
    hint.className = 'msg-edit-hint';
    const defaultHint = 'enter salva • esc cancela';
    hint.textContent = defaultHint;
    const wrap = document.createElement('div');
    wrap.className = 'msg-edit-wrap';
    wrap.append(ta, hint);
    textEl.hidden = true;
    textEl.after(wrap);

    const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'; };
    const close = () => { wrap.remove(); textEl.hidden = false; el.classList.remove('is-editing'); };
    const fail = (msg) => {
      ta.disabled = false;
      hint.textContent = msg;
      hint.classList.add('is-error');
      ta.focus();
    };

    const save = async () => {
      const value = encodeShortcodes(encodeMentions(ta.value.trim()));
      if (value === (m.content || '').trim()) return close();
      if (!value && !m.attachment_url) { hint.textContent = 'a mensagem não pode ficar vazia (esc cancela)'; hint.classList.add('is-error'); return; }
      ta.disabled = true;
      hint.classList.remove('is-error');
      hint.textContent = 'salvando…';
      try {
        const res = await fetch(`/api/channels/${m.channel_id}/messages/${m.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: value }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return fail(data.error || 'não deu pra salvar');
        }
        close();
      } catch (_) {
        fail('sem conexão — não deu pra salvar');
      }
    };

    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    ta.addEventListener('input', () => {
      autosize();
      if (hint.classList.contains('is-error')) { hint.classList.remove('is-error'); hint.textContent = defaultHint; }
    });
    autosize();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  // quem pode apagar: o autor, o dono do servidor, ou qualquer um se for mensagem de bot
  function canDeleteMessage(m) {
    if (!currentUser) return false;
    if (!m.user_id || m.user_id === currentUser.id) return true;
    const s = m.server_id != null ? servers.find((x) => x.id === m.server_id) : null;
    return !!(s && (s.owner_id === currentUser.id || s.is_admin));
  }

  // rola até a mensagem original (se ainda estiver carregada) e pisca ela, tipo Discord
  function jumpToMessage(messageId) {
    const el = chatMessages.querySelector(`.msg-group[data-message-id="${messageId}"]`);
    if (!el) {
      if (currentChannel) selectChannel(currentChannel, { aroundId: messageId });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('is-highlighted');
    void el.offsetWidth; // força reflow pra poder tocar a animação de novo se já rodou antes
    el.classList.add('is-highlighted');
  }

  function setReplyTarget(m) {
    const isBot = !m.user_id;
    const name = isBot ? (m.bot_name || 'bot') : m.username;
    const snippet = m.content ? DidiMarkdown.plain(m.content, mentionContext(m)) : (m.attachment_type === 'video' ? 'vídeo' : m.attachment_type === 'file' ? 'arquivo' : m.attachment_type === 'image' ? 'imagem' : '');
    pendingReplyTo = { id: m.id, authorName: name, snippet };
    replyPreviewName.textContent = name;
    replyPreviewSnippet.textContent = snippet;
    replyPreview.hidden = false;
    chatInput.focus();
  }

  function clearReplyTarget() {
    pendingReplyTo = null;
    replyPreview.hidden = true;
  }

  replyPreviewRemove.addEventListener('click', clearReplyTarget);

  async function deleteMessage(messageId) {
    if (!currentChannel) return;
    await fetch(`/api/channels/${currentChannel.id}/messages/${messageId}`, { method: 'DELETE' });
    // remoção real chega via broadcast (message_deleted)
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    stuckToBottom = true;
  }

  // ===================================================================
  // conteúdo das mensagens: Markdown, menções, reações, prévia de links
  // ===================================================================

  // quem é `id` pra mostrar numa menção: membro do servidor aberto, alguém já visto, ou o nome que
  // veio junto com a mensagem (mention_users)
  function mentionContext(m) {
    const extra = new Map(((m && m.mention_users) || []).map((u) => [u.id, u]));
    return {
      meId: currentUser ? currentUser.id : null,
      resolveUser: (id) => (currentUser && id === currentUser.id ? currentUser : null)
        || members.find((x) => x.id === id) || findUser(id) || extra.get(id) || null,
      onMention: (id, anchor) => openViewProfile(id, anchor),
    };
  }

  function messageMentionsMe(m) {
    if (!currentUser || !m || m.user_id === currentUser.id) return false;
    const text = m.content || '';
    return text.includes(`<@${currentUser.id}>`) || !!m.mentions_everyone || /(^|[^\w`])@(everyone|here)\b/.test(text);
  }

  // texto puro de uma mensagem (notificação, resposta, fixadas)
  function messagePlain(m, fallback = '') {
    if (!m) return fallback;
    const t = DidiMarkdown.plain(m.content || '', mentionContext(m));
    if (t) return t;
    if (m.attachment_type === 'gif') return 'mandou um gif';
    if (m.attachment_type === 'image') return 'mandou uma imagem';
    if (m.attachment_type === 'video') return 'mandou um vídeo';
    if (m.attachment_type === 'file') return `mandou um arquivo${m.attachment_name ? `: ${m.attachment_name}` : ''}`;
    return fallback;
  }

  // escreve o texto da mensagem (Markdown) no elemento — nada de innerHTML, ver js/markdown.js
  function renderMessageText(target, text, edited, m) {
    target.textContent = '';
    target.classList.toggle('is-jumbo', getPref('prefJumboEmoji') && DidiMarkdown.isEmojiOnly(text));
    target.appendChild(DidiMarkdown.render(text, mentionContext(m)));
    if (edited) {
      const tag = document.createElement('span');
      tag.className = 'msg-edited';
      tag.textContent = ' (editado)';
      const last = target.lastElementChild;
      if (last && /^(DIV|H1|H2|H3)$/.test(last.tagName)) last.appendChild(tag);
      else target.appendChild(tag);
    }
  }

  // ---------- reações ----------

  const REACT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
  const PIN_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

  function userName(id) {
    if (currentUser && id === currentUser.id) return 'você';
    const u = members.find((x) => x.id === id) || findUser(id);
    return u ? u.username : 'alguém';
  }

  async function toggleReaction(m, emoji) {
    const group = (m.reactions || []).find((r) => r.emoji === emoji);
    const mine = !!(group && currentUser && group.user_ids.includes(currentUser.id));
    try {
      const res = await fetch(`/api/channels/${m.channel_id}/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`, { method: mine ? 'DELETE' : 'PUT' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || 'não deu pra reagir', 'error');
      }
      // a atualização chega pra todo mundo pelo broadcast reactions_updated
    } catch (_) {
      toast('sem conexão — não deu pra reagir', 'error');
    }
  }

  function buildReactionsEl(m) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-reactions';
    for (const r of m.reactions || []) {
      if (!r.user_ids.length) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'msg-reaction';
      if (currentUser && r.user_ids.includes(currentUser.id)) b.classList.add('is-mine');
      b.innerHTML = '<span class="msg-reaction-emoji"></span><span class="msg-reaction-count"></span>';
      b.querySelector('.msg-reaction-emoji').textContent = r.emoji;
      b.querySelector('.msg-reaction-count').textContent = String(r.user_ids.length);
      const names = r.user_ids.slice(0, 8).map(userName);
      b.title = names.join(', ') + (r.user_ids.length > 8 ? ` e mais ${r.user_ids.length - 8}` : '') + ` reagiu com ${r.emoji}`;
      b.addEventListener('click', () => toggleReaction(m, r.emoji));
      wrap.appendChild(b);
    }
    if (wrap.children.length) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'msg-reaction msg-reaction-add';
      add.title = 'adicionar reação';
      add.innerHTML = REACT_ICON;
      add.addEventListener('click', () => DidiEmoji.open({ anchor: add, onPick: (emoji) => toggleReaction(m, emoji) }));
      wrap.appendChild(add);
    }
    return wrap;
  }

  function refreshReactions(messageId) {
    const m = currentMessages.find((x) => x.id === messageId);
    const el = chatMessages.querySelector(`.msg-group[data-message-id="${messageId}"]`);
    if (!m || !el) return;
    const old = el.querySelector('.msg-reactions');
    const fresh = buildReactionsEl(m);
    if (old) old.replaceWith(fresh);
    else el.querySelector('.msg-body').appendChild(fresh);
  }

  // ---------- fixar ----------

  async function togglePin(m) {
    try {
      const res = await fetch(`/api/channels/${m.channel_id}/messages/${m.id}/pin`, { method: m.pinned ? 'DELETE' : 'PUT' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast(data.error || 'não deu pra fixar', 'error');
      else toast(m.pinned ? 'mensagem desafixada' : 'mensagem fixada — veja pelo alfinete no topo');
    } catch (_) {
      toast('sem conexão', 'error');
    }
  }

  // ---------- prévia de links ----------

  const embedCache = new Map(); // url -> Promise<embed|null>
  function fetchEmbed(url) {
    if (!embedCache.has(url)) {
      embedCache.set(url, fetch(`/api/embed?url=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.embed) || null).catch(() => null));
    }
    return embedCache.get(url);
  }

  function buildLinkEmbedEl(e, m) {
    const card = document.createElement('div');
    if (e.type === 'image') {
      card.className = 'msg-embed-media';
      const img = document.createElement('img');
      img.src = e.image; img.alt = ''; img.loading = 'lazy';
      img.addEventListener('click', () => openMediaViewer({ ...m, id: -m.id, attachment_url: e.image, attachment_type: 'image' }));
      card.appendChild(img);
      return card;
    }
    if (e.type === 'video') {
      card.className = 'msg-embed-media';
      const v = document.createElement('video');
      v.src = e.video; v.controls = true; v.preload = 'metadata'; v.playsInline = true;
      card.appendChild(v);
      return card;
    }
    card.className = 'msg-link-embed' + (e.type === 'youtube' ? ' is-youtube' : '');
    if (e.color) card.style.setProperty('--embed-color', e.color);
    const text = document.createElement('div');
    text.className = 'msg-link-embed-text';
    if (e.site || e.author) {
      const site = document.createElement('div');
      site.className = 'msg-link-embed-site';
      site.textContent = e.type === 'youtube' && e.author ? `${e.site} · ${e.author}` : e.site;
      text.appendChild(site);
    }
    if (e.title) {
      const a = document.createElement('a');
      a.className = 'msg-link-embed-title';
      a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = e.title;
      text.appendChild(a);
    }
    if (e.description) {
      const d = document.createElement('div');
      d.className = 'msg-link-embed-desc';
      d.textContent = e.description;
      text.appendChild(d);
    }
    card.appendChild(text);

    if (e.type === 'youtube') {
      // miniatura com botão de play; clicando, vira o vídeo de verdade ali mesmo
      const player = document.createElement('button');
      player.type = 'button';
      player.className = 'msg-yt-thumb';
      player.setAttribute('aria-label', 'tocar vídeo');
      player.innerHTML = '<img alt="" loading="lazy"><span class="msg-yt-play"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>';
      player.querySelector('img').src = e.image;
      player.addEventListener('click', () => {
        const frame = document.createElement('iframe');
        frame.className = 'msg-yt-frame';
        frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(e.video_id)}?autoplay=1${e.start ? `&start=${e.start}` : ''}`;
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.allowFullscreen = true;
        player.replaceWith(frame);
      });
      card.appendChild(player);
    } else if (e.image) {
      const img = document.createElement('img');
      img.className = e.large_image ? 'msg-link-embed-image' : 'msg-link-embed-thumb';
      img.src = e.image; img.alt = ''; img.loading = 'lazy';
      img.addEventListener('error', () => img.remove());
      img.addEventListener('click', () => openMediaViewer({ ...m, id: -m.id, attachment_url: e.image, attachment_type: 'image' }));
      card.appendChild(img);
      if (!e.large_image) card.classList.add('has-thumb');
    }
    return card;
  }

  function attachLinkEmbeds(el, m) {
    if (m.attachment_type === 'gif' || !getPref('prefLinkPreviews')) return;
    const urls = DidiMarkdown.links(m.content || '');
    if (!urls.length) return;
    const holder = document.createElement('div');
    holder.className = 'msg-embeds';
    const body = el.querySelector('.msg-body');
    const reactions = body.querySelector('.msg-reactions');
    body.insertBefore(holder, reactions || null);
    for (const url of urls) {
      fetchEmbed(url).then((embed) => {
        if (!embed || !holder.isConnected) return;
        const near = isScrolledNearBottom();
        holder.appendChild(buildLinkEmbedEl(embed, m));
        if (near) scrollToBottom();
        holder.querySelectorAll('img').forEach((img) => img.addEventListener('load', () => { if (near && isScrolledNearBottom()) scrollToBottom(); }, { once: true }));
      });
    }
  }

  // ===================================================================
  // menções (@) e emojis (:) na caixa de mensagem
  // ===================================================================
  // No texto que vai pro servidor, menção é <@id>. Na caixa de mensagem a pessoa vê "@nome"; a troca
  // acontece na hora de enviar (e o contrário, na hora de editar).

  // quem dá pra mencionar aqui: membros do servidor, ou a outra pessoa da DM
  function mentionCandidates() {
    if (!currentChannel) return [];
    if (currentChannel.dm) {
      const u = findUser(currentChannel.userId);
      return [u, currentUser].filter(Boolean);
    }
    return members;
  }

  function foldText(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // "@fulano de tal" -> "<@12>" (nomes mais longos primeiro, pra "ana" não pegar o começo de "ana clara")
  function encodeMentions(text) {
    const list = mentionCandidates().filter((u) => u && u.username).sort((a, b) => b.username.length - a.username.length);
    if (!list.length) return text;
    const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/); // não mexe dentro de código
    return parts.map((part, i) => {
      if (i % 2 === 1) return part;
      let out = '';
      let idx = 0;
      while (idx < part.length) {
        const at = part.indexOf('@', idx);
        if (at === -1) { out += part.slice(idx); break; }
        out += part.slice(idx, at);
        const prevCh = part[at - 1];
        let matched = null;
        if (!prevCh || !/[\p{L}\p{N}_]/u.test(prevCh)) {
          const after = part.slice(at + 1);
          matched = list.find((u) => after.toLowerCase().startsWith(u.username.toLowerCase())
            && !/[\p{L}\p{N}_]/u.test(after[u.username.length] || ''));
        }
        if (matched) { out += `<@${matched.id}>`; idx = at + 1 + matched.username.length; }
        else { out += '@'; idx = at + 1; }
      }
      return out;
    }).join('');
  }

  function decodeMentions(text, m) {
    const ctx = mentionContext(m);
    return String(text || '').replace(/<@(\d{1,10})>/g, (all, id) => {
      const u = ctx.resolveUser(Number(id));
      return u ? `@${u.username}` : all;
    });
  }

  // :joia: escrito à mão (sem escolher na lista) também vira emoji ao enviar
  function encodeShortcodes(text) {
    if (!getPref('prefShortcodes')) return text;
    return text.replace(/(^|[^\w`]):([a-z0-9_+-]{2,40}):/gi, (all, pre, name) => {
      const e = DidiEmoji.fromShortcode(name);
      return e ? pre + e : all;
    });
  }

  // texto antes do cursor que está sendo completado: { kind: 'mention'|'emoji', query, start }
  function tokenBeforeCaret() {
    const pos = chatInput.selectionStart;
    if (pos == null || pos !== chatInput.selectionEnd) return null;
    const before = chatInput.value.slice(0, pos);
    let m = before.match(/(^|\s)@([^\s@]{0,32})$/);
    if (m) return { kind: 'mention', query: m[2], start: pos - m[2].length - 1 };
    m = before.match(/(^|\s):([\p{L}\p{N}_+-]{2,32})$/u);
    if (m) return { kind: 'emoji', query: m[2], start: pos - m[2].length - 1 };
    return null;
  }

  function replaceToken(token, insert) {
    const pos = chatInput.selectionStart;
    const v = chatInput.value;
    chatInput.value = v.slice(0, token.start) + insert + v.slice(pos);
    const caret = token.start + insert.length;
    chatInput.setSelectionRange(caret, caret);
    chatInput.focus();
    autosizeComposer();
  }

  // devolve true se tratou (mostrou a lista de menção/emoji)
  let emojiSearchToken = 0;
  function updateMentionOrEmojiPopup() {
    const token = tokenBeforeCaret();
    if (!token) return false;
    if (token.kind === 'mention') {
      const q = foldText(token.query);
      const users = mentionCandidates()
        .filter((u) => u && foldText(u.username).split(/\s+/).some((w, i, arr) => w.startsWith(q) || arr.join(' ').startsWith(q)))
        .slice(0, 8)
        .map((u) => ({ kind: 'mention', user: u, token }));
      const specials = currentChannel && !currentChannel.dm
        ? ['everyone', 'here'].filter((s) => s.startsWith(q)).map((s) => ({ kind: 'mention-special', name: s, token }))
        : [];
      if (popupMode !== 'mention') popupIndex = 0;
      popupMode = 'mention';
      popupItems = [...users, ...specials];
      if (!popupItems.length) { hideCommandPopup(); return true; }
      renderPopup(token.query ? `membros com "@${token.query}"` : 'mencionar');
      return true;
    }
    const mine = ++emojiSearchToken;
    DidiEmoji.search(token.query, 8).then((found) => {
      if (mine !== emojiSearchToken) return;
      const still = tokenBeforeCaret();
      if (!still || still.kind !== 'emoji' || still.query !== token.query) return;
      if (popupMode !== 'emoji') popupIndex = 0;
      popupMode = 'emoji';
      popupItems = found.map((e) => ({ kind: 'emoji', emoji: e, token }));
      if (!popupItems.length) { hideCommandPopup(); return; }
      renderPopup(`emojis com ":${token.query}"`);
    }).catch(() => {});
    return true;
  }

  // caixa de mensagem cresce com o texto (até um limite), igual o Discord
  function autosizeComposer() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 260) + 'px';
  }

  // ===================================================================
  // "fulano está digitando…"
  // ===================================================================

  const TYPING_SEND_EVERY_MS = 3000;
  const TYPING_SHOW_MS = 6500;
  const typingByChannel = new Map(); // channelId -> Map(userId -> até quando mostrar)
  let lastTypingSentAt = 0;
  let lastTypingChannel = null;
  const typingIndicator = document.getElementById('typingIndicator');

  function notifyTyping() {
    if (!currentChannel || currentChannel.type !== 'text' || !getPref('prefTyping')) return;
    const v = chatInput.value;
    if (!v.trim() || v.startsWith('/')) return;
    const now = Date.now();
    if (lastTypingChannel === currentChannel.id && now - lastTypingSentAt < TYPING_SEND_EVERY_MS) return;
    lastTypingSentAt = now;
    lastTypingChannel = currentChannel.id;
    Realtime.send('typing', { channelId: currentChannel.id });
  }

  function renderTyping() {
    if (!typingIndicator) return;
    const map = currentChannel ? typingByChannel.get(currentChannel.id) : null;
    const now = Date.now();
    const ids = map ? [...map.entries()].filter(([, until]) => until > now).map(([id]) => id) : [];
    if (!ids.length) { typingIndicator.textContent = ''; typingIndicator.classList.remove('is-active'); return; }
    const names = ids.map(userName);
    let text;
    if (names.length === 1) text = `${names[0]} está digitando…`;
    else if (names.length === 2) text = `${names[0]} e ${names[1]} estão digitando…`;
    else if (names.length === 3) text = `${names[0]}, ${names[1]} e ${names[2]} estão digitando…`;
    else text = 'várias pessoas estão digitando…';
    typingIndicator.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-text"></span>';
    typingIndicator.querySelector('.typing-text').textContent = text;
    typingIndicator.classList.add('is-active');
  }

  function setTyping(channelId, userId, on) {
    if (!typingByChannel.has(channelId)) typingByChannel.set(channelId, new Map());
    const map = typingByChannel.get(channelId);
    if (on) map.set(userId, Date.now() + TYPING_SHOW_MS);
    else map.delete(userId);
    if (currentChannel && currentChannel.id === channelId) renderTyping();
  }

  setInterval(() => { if (typingIndicator && typingIndicator.classList.contains('is-active')) renderTyping(); }, 1000);

  // ===================================================================
  // notificações do sistema
  // ===================================================================

  const NOTIFY_KEY = 'didiscord:notificationLevel';
  const notificationLevelSelect = document.getElementById('notificationLevelSelect');
  const notificationPermissionBtn = document.getElementById('notificationPermissionBtn');

  function getNotifyLevel() {
    try { const v = localStorage.getItem(NOTIFY_KEY); return ['mentions', 'all', 'none'].includes(v) ? v : 'mentions'; } catch (_) { return 'mentions'; }
  }
  function setNotifyLevel(v) { try { localStorage.setItem(NOTIFY_KEY, v); } catch (_) { /* ok */ } }

  function notificationsSupported() { return typeof Notification !== 'undefined'; }

  function updateNotificationPermissionUi() {
    if (!notificationPermissionBtn) return;
    const need = notificationsSupported() && Notification.permission === 'default' && getNotifyLevel() !== 'none';
    notificationPermissionBtn.hidden = !need;
    const help = document.getElementById('notificationHelp');
    if (help && notificationsSupported() && Notification.permission === 'denied' && getNotifyLevel() !== 'none') {
      help.textContent = 'o navegador está bloqueando as notificações deste site — libera no cadeado ao lado do endereço.';
    }
  }

  function askNotificationPermission() {
    if (!notificationsSupported() || Notification.permission !== 'default') return;
    Notification.requestPermission().then(updateNotificationPermissionUi).catch(() => {});
  }

  if (notificationLevelSelect) {
    notificationLevelSelect.value = getNotifyLevel();
    notificationLevelSelect.addEventListener('change', () => {
      setNotifyLevel(notificationLevelSelect.value);
      if (notificationLevelSelect.value !== 'none') askNotificationPermission();
      updateNotificationPermissionUi();
    });
  }
  if (notificationPermissionBtn) notificationPermissionBtn.addEventListener('click', askNotificationPermission);
  // o navegador só deixa pedir permissão num clique de verdade — pede no primeiro clique no site
  document.addEventListener('pointerdown', function firstClick() {
    document.removeEventListener('pointerdown', firstClick, true);
    if (getNotifyLevel() !== 'none') askNotificationPermission();
  }, true);

  function appIsInFront() {
    return document.visibilityState === 'visible' && document.hasFocus();
  }

  function shouldNotify(message, isDm, mentionsMe) {
    const level = getNotifyLevel();
    if (level === 'none') return false;
    if (level === 'all') return true;
    return isDm || mentionsMe;
  }

  function showSystemNotification(message) {
    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    const isDm = message.server_id == null;
    const author = message.username || message.bot_name || 'alguém';
    let title = author;
    if (!isDm) {
      const s = servers.find((x) => x.id === message.server_id);
      const ch = channels.find((c) => c.id === message.channel_id);
      const chName = message.channel_name || (ch && ch.name);
      title = `${author} (${chName ? '#' + chName : 'canal'}${s ? ', ' + s.name : ''})`;
    }
    try {
      const n = new Notification(title, {
        body: messagePlain(message).slice(0, 220),
        icon: message.avatar_url || '/favicon.ico',
        tag: `didiscord-${message.channel_id}`,
        silent: true, // o som é o do próprio didiscord
      });
      n.onclick = () => {
        if (window.didiscordDesktop && window.didiscordDesktop.focusWindow) window.didiscordDesktop.focusWindow();
        window.focus();
        n.close();
        openMessageLocation(message);
      };
    } catch (_) { /* alguns ambientes não deixam criar Notification fora de service worker */ }
  }

  // vai até a mensagem: troca de servidor/conversa se precisar
  async function openMessageLocation(message, opts = {}) {
    if (message.server_id == null) {
      if (currentServerId != null) await selectServer(null);
      const dm = dms.find((d) => d.id === message.channel_id);
      if (dm) await selectChannel(dmChannel(dm), opts);
      return;
    }
    if (currentServerId !== message.server_id) {
      await selectServer(message.server_id, { channelId: message.channel_id, aroundId: opts.aroundId });
      return;
    }
    const ch = channels.find((c) => c.id === message.channel_id);
    if (ch) await selectChannel(ch, opts);
  }

  // ===================================================================
  // não lidas (guardadas no servidor) e contagem de menções
  // ===================================================================

  async function loadUnread() {
    try {
      const res = await fetch('/api/unread');
      if (!res.ok) return;
      const data = await res.json();
      unreadChannels.clear();
      for (const u of data.unread || []) {
        if (currentChannel && currentChannel.id === u.channel_id && appIsInFront()) { syncRead(u.channel_id); continue; }
        unreadChannels.set(u.channel_id, { serverId: u.server_id, mentions: u.mentions || 0 });
      }
      renderRail();
      renderChannels();
      updateUnreadTitle();
    } catch (_) { /* sem conexão — tenta de novo quando o WebSocket voltar */ }
  }

  const readSyncTimers = new Map();
  function syncRead(channelId) {
    clearTimeout(readSyncTimers.get(channelId));
    readSyncTimers.set(channelId, setTimeout(() => {
      readSyncTimers.delete(channelId);
      fetch(`/api/unread/${channelId}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }, 600));
  }

  function totalMentions() {
    let n = 0;
    for (const u of unreadChannels.values()) n += u.mentions || 0;
    return n;
  }

  function updateUnreadTitle() {
    const n = totalMentions();
    const base = 'didiscord';
    document.title = n ? `(${n > 99 ? '99+' : n}) ${base}` : (unreadChannels.size ? `• ${base}` : base);
    if (window.didiscordDesktop && typeof window.didiscordDesktop.setBadge === 'function') {
      try { window.didiscordDesktop.setBadge(n); } catch (_) { /* app antigo */ }
    }
  }

  function serverMentionCount(serverId) {
    let n = 0;
    for (const u of unreadChannels.values()) if (u.serverId === serverId) n += u.mentions || 0;
    return n;
  }

  function mentionBadge(count, cls) {
    const b = document.createElement('span');
    b.className = cls;
    b.textContent = count > 99 ? '99+' : String(count);
    return b;
  }

  // ===================================================================
  // pular pra uma mensagem antiga (busca, fixadas, resposta) e voltar pro presente
  // ===================================================================

  let hasNewerMessages = false;
  let loadingNewerMessages = false;
  const jumpPresentBtn = document.getElementById('jumpPresentBtn');

  function setViewingHistory(on) {
    hasNewerMessages = on;
    if (jumpPresentBtn) jumpPresentBtn.hidden = !on;
  }

  if (jumpPresentBtn) {
    jumpPresentBtn.addEventListener('click', () => { if (currentChannel) selectChannel(currentChannel); });
  }

  async function loadNewerMessages() {
    const channel = currentChannel;
    const newest = currentMessages[currentMessages.length - 1];
    if (!channel || !newest || loadingNewerMessages || !hasNewerMessages) return;
    loadingNewerMessages = true;
    try {
      const res = await fetch(`/api/channels/${channel.id}/messages?after=${newest.id}&limit=50`);
      if (!res.ok || currentChannel !== channel) return;
      const data = await res.json();
      if (currentChannel !== channel) return;
      const newer = data.messages || [];
      let prev = newest;
      for (const m of newer) {
        currentMessages.push(m);
        const el = buildMessageEl(m, isContinuation(prev, m));
        el.classList.add('no-anim');
        chatMessages.appendChild(el);
        prev = m;
      }
      setViewingHistory(!!data.has_more_after);
      if (!hasNewerMessages) syncRead(channel.id);
    } catch (_) { /* tenta de novo na próxima rolagem */ } finally {
      loadingNewerMessages = false;
    }
  }

  chatMessages.addEventListener('scroll', () => {
    if (hasNewerMessages && isScrolledNearBottom()) loadNewerMessages();
  }, { passive: true });

  function highlightMessage(messageId) {
    const el = chatMessages.querySelector(`.msg-group[data-message-id="${messageId}"]`);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'auto', block: 'center' });
    el.classList.remove('is-highlighted');
    void el.offsetWidth;
    el.classList.add('is-highlighted');
    return true;
  }

  // ===================================================================
  // painéis da lateral: fixadas e busca
  // ===================================================================

  const pinsBtn = document.getElementById('pinsBtn');
  const pinsPanel = document.getElementById('pinsPanel');
  const pinsList = document.getElementById('pinsList');
  const searchPanel = document.getElementById('searchPanel');
  const searchResults = document.getElementById('searchResults');
  const searchSummary = document.getElementById('searchSummary');
  const chatSearchForm = document.getElementById('chatSearchForm');
  const chatSearchInput = document.getElementById('chatSearchInput');

  // com fixadas/busca abertas, a lista de membros (ou o perfil da DM) sai da frente — igual o Discord
  function closeSidePanels() {
    const wasOpen = (pinsPanel && !pinsPanel.hidden) || (searchPanel && !searchPanel.hidden);
    if (pinsPanel) pinsPanel.hidden = true;
    if (searchPanel) searchPanel.hidden = true;
    if (pinsBtn) pinsBtn.classList.remove('active');
    if (wasOpen && currentChannel) {
      if (currentChannel.dm) dmProfilePanel.hidden = false;
      else memberPanel.hidden = memberPanelCollapsed;
    }
  }
  function openSidePanel(panel) {
    closeSidePanels();
    panel.hidden = false;
    memberPanel.hidden = true;
    dmProfilePanel.hidden = true;
  }
  document.querySelectorAll('[data-close-panel]').forEach((b) => b.addEventListener('click', closeSidePanels));

  // um resultado (busca/fixada): autor, quando, onde, texto — clicando, pula pra mensagem
  function buildResultEl(m, terms, showChannel) {
    const el = document.createElement('div');
    el.className = 'side-result';
    const head = document.createElement('div');
    head.className = 'side-result-head';
    head.innerHTML = '<span class="side-result-author"></span><span class="side-result-when"></span>';
    head.querySelector('.side-result-author').textContent = m.username || m.bot_name || 'bot';
    head.querySelector('.side-result-when').textContent = (showChannel && m.channel_name ? `#${m.channel_name} · ` : '') + formatDateTime(m.created_at);
    const body = document.createElement('div');
    body.className = 'side-result-text msg-text';
    renderMessageText(body, m.content || '', false, m);
    if (!m.content && m.attachment_type) body.textContent = messagePlain(m);
    if (terms && terms.length) markTerms(body, terms);
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'side-result-jump';
    jump.textContent = 'ir';
    el.append(head, body, jump);
    const go = () => goToMessage(m);
    jump.addEventListener('click', go);
    el.addEventListener('click', (e) => { if (!e.target.closest('a, .md-spoiler, .md-mention')) go(); });
    return el;
  }

  function formatDateTime(iso) {
    const d = new Date(timeValue(iso));
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // destaca as palavras buscadas (sem diferença de acento) nos textos do resultado
  function markTerms(root, terms) {
    const needles = terms.map(foldText).filter(Boolean);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue;
      const folded = foldText(text);
      if (folded.length !== text.length) continue; // acento composto mudou o tamanho: pula pra não errar a posição
      const ranges = [];
      for (const n of needles) {
        const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}\\p{N}_]*)`, 'gu');
        for (const m of folded.matchAll(re)) ranges.push([m.index + m[1].length, m.index + m[0].length]);
      }
      if (!ranges.length) continue;
      ranges.sort((a, b) => a[0] - b[0]);
      const frag = document.createDocumentFragment();
      let pos = 0;
      for (const [a, b] of ranges) {
        if (a < pos) continue;
        frag.append(text.slice(pos, a));
        const mark = document.createElement('mark');
        mark.textContent = text.slice(a, b);
        frag.append(mark);
        pos = b;
      }
      frag.append(text.slice(pos));
      node.replaceWith(frag);
    }
  }

  async function goToMessage(m) {
    if (currentChannel && currentChannel.id === m.channel_id && highlightMessage(m.id)) return;
    await openMessageLocation(m, { aroundId: m.id });
  }

  async function openPins() {
    if (!currentChannel || currentChannel.type !== 'text') return;
    if (!pinsPanel.hidden) { closeSidePanels(); return; }
    openSidePanel(pinsPanel);
    pinsBtn.classList.add('active');
    await renderPins();
  }

  async function renderPins() {
    if (!currentChannel || pinsPanel.hidden) return;
    const channel = currentChannel;
    pinsList.innerHTML = '<div class="side-empty">carregando…</div>';
    try {
      const res = await fetch(`/api/channels/${channel.id}/messages/pins`);
      const data = await res.json();
      if (currentChannel !== channel) return;
      pinsList.innerHTML = '';
      if (!data.messages || !data.messages.length) {
        pinsList.innerHTML = '<div class="side-empty">nenhuma mensagem fixada aqui ainda.<br>passe o mouse numa mensagem e clique no alfinete.</div>';
        return;
      }
      for (const m of data.messages) pinsList.appendChild(buildResultEl(m, null, false));
    } catch (_) {
      pinsList.innerHTML = '<div class="side-empty">não deu pra carregar</div>';
    }
  }

  if (pinsBtn) pinsBtn.addEventListener('click', openPins);

  let searchState = null; // { q, params, offset, total }

  // "de:fulano pizza" procura só mensagens do fulano
  function parseSearch(raw) {
    let q = raw;
    let authorId = null;
    const m = raw.match(/(?:^|\s)de:@?(\S+)/i);
    if (m) {
      const name = foldText(m[1]);
      const u = mentionCandidates().find((x) => x && foldText(x.username).replace(/\s+/g, '') === name.replace(/\s+/g, ''))
        || mentionCandidates().find((x) => x && foldText(x.username).startsWith(name));
      if (u) { authorId = u.id; q = raw.replace(m[0], ' ').trim(); }
    }
    return { q, authorId };
  }

  async function runSearch(append) {
    if (!searchState) return;
    const { q, authorId } = searchState;
    const where = currentChannel && currentChannel.dm ? `channel_id=${currentChannel.id}` : `server_id=${currentServerId}`;
    const url = `/api/search?q=${encodeURIComponent(q)}&${where}${authorId ? `&author_id=${authorId}` : ''}&offset=${searchState.offset}`;
    if (!append) { searchResults.innerHTML = '<div class="side-empty">buscando…</div>'; searchSummary.textContent = 'buscando…'; }
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) { searchResults.innerHTML = `<div class="side-empty"></div>`; searchResults.firstChild.textContent = data.error || 'não deu pra buscar'; return; }
      if (!append) searchResults.innerHTML = '';
      const more = searchResults.querySelector('.side-more');
      if (more) more.remove();
      searchState.total = data.total;
      searchSummary.textContent = data.total === 1 ? '1 resultado' : `${data.total} resultados`;
      if (!data.total) { searchResults.innerHTML = '<div class="side-empty">nada encontrado</div>'; return; }
      for (const m of data.messages) searchResults.appendChild(buildResultEl(m, data.terms, !currentChannel.dm));
      searchState.offset = data.offset + data.messages.length;
      if (searchState.offset < data.total) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-ghost side-more';
        b.textContent = 'mais resultados';
        b.addEventListener('click', () => runSearch(true));
        searchResults.appendChild(b);
      }
    } catch (_) {
      searchResults.innerHTML = '<div class="side-empty">sem conexão</div>';
    }
  }

  if (chatSearchForm) {
    chatSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = chatSearchInput.value.trim();
      if (!raw || !currentChannel) return;
      const { q, authorId } = parseSearch(raw);
      if (!q && !authorId) return;
      openSidePanel(searchPanel);
      searchState = { q, authorId, offset: 0, total: 0 };
      runSearch(false);
    });
    chatSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { chatSearchInput.value = ''; closeSidePanels(); chatSearchInput.blur(); }
    });
  }

  // ---------- anexos ----------

  attachBtn.addEventListener('click', () => attachInput.click());

  function showComposerError(msg) {
    composerError.textContent = msg;
    composerError.hidden = !msg;
  }

  function setPendingAttachment(file) {
    pendingAttachment = file;
    attachmentPreviewName.textContent = file.name || 'arquivo colado';
    attachmentPreview.hidden = false;
    showComposerError('');

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      attachmentPreviewThumb.style.backgroundImage = `url(${url})`;
      attachmentPreviewThumb.innerHTML = '';
    } else {
      // vídeo ou arquivo genérico (pdf, zip, docx etc.) — sem preview de imagem, só um ícone
      attachmentPreviewThumb.style.backgroundImage = '';
      attachmentPreviewThumb.innerHTML = file.type.startsWith('video/') ? VIDEO_ICON : FILE_ICON;
      attachmentPreviewThumb.style.display = 'flex';
      attachmentPreviewThumb.style.alignItems = 'center';
      attachmentPreviewThumb.style.justifyContent = 'center';
      attachmentPreviewThumb.style.color = 'var(--text-lo)';
    }
  }

  attachInput.addEventListener('change', () => {
    const file = attachInput.files[0];
    if (!file) return;
    setPendingAttachment(file);
  });

  // colar (ctrl+v) uma imagem copiada (print, ou copiada de outro app/site) direto no chat —
  // igual Discord/Slack/WhatsApp Web. Só intercepta quando o clipboard realmente tem um arquivo
  // de imagem; colar texto normal continua funcionando sem nenhuma mudança de comportamento.
  chatInput.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault(); // evita colar também um nome de arquivo/lixo como texto no campo
        setPendingAttachment(file);
        break;
      }
    }
  });

  function clearPendingAttachment() {
    pendingAttachment = null;
    attachInput.value = '';
    attachmentPreview.hidden = true;
    attachmentPreviewThumb.style.backgroundImage = '';
    attachmentPreviewThumb.innerHTML = '';
    hideUploadProgress();
  }

  // mostra a barra de progresso (0-100) mais um texto "XX% · 12.3 MB / 45.0 MB" embaixo do
  // nome do arquivo, dentro do preview de anexo pendente — usado durante o envio de verdade
  function showUploadProgress(percent, loadedBytes, totalBytes) {
    attachmentPreviewProgressTrack.hidden = false;
    attachmentPreviewProgressText.hidden = false;
    attachmentPreviewProgressFill.style.width = percent + '%';
    const sizes = (loadedBytes != null && totalBytes != null)
      ? ` · ${formatFileSize(loadedBytes)} / ${formatFileSize(totalBytes)}`
      : '';
    attachmentPreviewProgressText.textContent = `enviando... ${percent}%${sizes}`;
  }

  function hideUploadProgress() {
    attachmentPreviewProgressTrack.hidden = true;
    attachmentPreviewProgressText.hidden = true;
    attachmentPreviewProgressFill.style.width = '0%';
  }

  // durante um upload em andamento, o botão de "remover anexo" vira "cancelar envio" — aborta o
  // XHR (o listener 'abort' cuida da limpeza) em vez de só limpar o estado local, senão o upload
  // continuaria rolando em segundo plano sem nenhuma forma de pará-lo
  attachmentPreviewRemove.addEventListener('click', () => {
    if (activeUploadXhr) {
      activeUploadXhr.abort();
      return;
    }
    clearPendingAttachment();
  });

  // ---------- gif e figurinha (GIPHY) ----------

  let gifSearchTimer = null;
  let gifPickerKind = 'gifs';
  let gifQuery = '';
  let gifOffset = 0;
  let gifLoadingMore = false;
  let gifHasMore = true;

  async function openGifPicker() {
    gifPicker.hidden = false;
    gifSearchInput.value = '';
    gifSearchInput.focus();
    await loadGifs('');
  }

  function closeGifPicker() {
    gifPicker.hidden = true;
  }

  gifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (gifPicker.hidden) openGifPicker();
    else closeGifPicker();
  });

  gifPickerTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.gif-picker-tab');
    if (!btn || btn.dataset.kind === gifPickerKind) return;
    gifPickerKind = btn.dataset.kind;
    gifPickerTabs.querySelectorAll('.gif-picker-tab').forEach((t) => t.classList.toggle('active', t === btn));
    loadGifs(gifSearchInput.value.trim());
  });

  document.addEventListener('click', (e) => {
    if (!gifPicker.hidden && !gifPicker.contains(e.target) && e.target !== gifBtn) closeGifPicker();
  });

  gifSearchInput.addEventListener('keydown', (e) => e.stopPropagation());
  gifSearchInput.addEventListener('input', () => {
    clearTimeout(gifSearchTimer);
    gifSearchTimer = setTimeout(() => loadGifs(gifSearchInput.value.trim()), 350);
  });

  async function loadGifs(query) {
    gifQuery = query;
    gifOffset = 0;
    gifHasMore = true;
    gifPickerGrid.innerHTML = '<div class="gif-picker-loading">buscando...</div>';
    try {
      const res = await fetch(`/api/giphy/search?q=${encodeURIComponent(query)}&type=${gifPickerKind}&offset=0`);
      const data = await res.json();
      if (!res.ok) {
        gifPickerGrid.innerHTML = `<div class="gif-picker-empty">${escapeHtml(data.error || 'erro ao buscar')}</div>`;
        return;
      }
      const gifs = data.gifs || [];
      gifOffset = gifs.length;
      gifHasMore = gifs.length > 0;
      renderGifResults(gifs, false);
    } catch (_) {
      gifPickerGrid.innerHTML = '<div class="gif-picker-empty">erro de conexão</div>';
    }
  }

  // busca a próxima página (offset atual) e vai anexando no grid, sem apagar o que já tem
  async function loadMoreGifs() {
    if (gifLoadingMore || !gifHasMore) return;
    gifLoadingMore = true;
    const moreEl = document.createElement('div');
    moreEl.className = 'gif-picker-loading-more';
    moreEl.textContent = 'carregando mais...';
    gifPickerGrid.appendChild(moreEl);
    try {
      const res = await fetch(`/api/giphy/search?q=${encodeURIComponent(gifQuery)}&type=${gifPickerKind}&offset=${gifOffset}`);
      const data = await res.json();
      moreEl.remove();
      if (!res.ok) { gifHasMore = false; return; }
      const gifs = data.gifs || [];
      gifOffset += gifs.length;
      if (gifs.length === 0) gifHasMore = false;
      renderGifResults(gifs, true);
    } catch (_) {
      moreEl.remove();
    } finally {
      gifLoadingMore = false;
    }
  }

  // rolou perto do fim do grid -> busca mais gifs automaticamente
  gifPickerGrid.addEventListener('scroll', () => {
    if (gifPickerGrid.scrollTop + gifPickerGrid.clientHeight >= gifPickerGrid.scrollHeight - 150) {
      loadMoreGifs();
    }
  });

  function renderGifResults(gifs, append) {
    if (!append) gifPickerGrid.innerHTML = '';
    if (!append && gifs.length === 0) {
      gifPickerGrid.innerHTML = '<div class="gif-picker-empty">nenhum gif encontrado</div>';
      return;
    }
    for (const g of gifs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gif-picker-item';
      btn.innerHTML = `<img src="${g.preview}" alt="${escapeHtml(g.title)}" loading="lazy">`;
      btn.addEventListener('click', () => sendGif(g.url));
      gifPickerGrid.appendChild(btn);
    }
  }

  async function sendGif(url) {
    if (!currentChannel) return;
    closeGifPicker();
    const replyToId = pendingReplyTo ? pendingReplyTo.id : null;
    clearReplyTarget();
    await fetch(`/api/channels/${currentChannel.id}/messages/gif`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, reply_to_id: replyToId }),
    });
    // a mensagem aparece via broadcast (message_created), igual anexo normal
  }


  // ===================================================================
  // player de vídeo próprio (chat e visualizador)
  // ===================================================================
  // Controles no estilo do app: play, barra de progresso (com o que já carregou), tempo, volume
  // lembrado, velocidade, tela cheia e abrir no visualizador. No chat, passar o mouse toca uma
  // prévia sem som (dá pra desligar em configurações → chat).

  const VIDEO_VOLUME_KEY = 'didiscord:videoVolume';
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

  // ===================================================================
  // menu de comandos ("/") e autocompletar do /play
  // ===================================================================
  // Digitou "/" no começo da mensagem num canal de servidor: aparece a lista de comandos do bot
  // de música, filtrando enquanto digita. Em "/play <algo>", aparecem os 5 primeiros resultados
  // do YouTube (buscados no servidor, ver routes/musicbot.js). ↑ ↓ escolhem, Enter/Tab confirmam,
  // Esc fecha.

  const BOT_COMMANDS = [
    { name: 'play', args: '<música ou link>', desc: 'toca na sua call — nome da música, link do YouTube ou do Spotify' },
    { name: 'search', args: '<música>', desc: 'mostra 5 resultados pra escolher com /play <número>' },
    { name: 'skip', desc: 'pula a música atual' },
    { name: 'skipto', args: '<posição>', desc: 'pula direto pra uma posição da fila' },
    { name: 'pause', desc: 'pausa ou continua a música' },
    { name: 'stop', desc: 'para a música e limpa a fila' },
    { name: 'shuffle', desc: 'embaralha a fila' },
    { name: 'queue', args: '[página | clear]', desc: 'mostra a fila (ou limpa com /queue clear)' },
    { name: 'volume', args: '<0 a 200>', desc: 'muda o volume do bot pra todo mundo' },
  ];
  const PLAY_SEARCH_DEBOUNCE_MS = 350;

  const commandPopup = document.getElementById('commandPopup');
  let popupMode = null; // null | 'commands' | 'play'
  let popupItems = []; // { kind: 'command' | 'track', ... }
  let popupIndex = 0;
  let playSearchTimer = null;
  let playSearchToken = 0;
  let playSearchQuery = '';

  function botIdentity() {
    const b = bots.find((x) => x.id === 'musicbot');
    return { name: b ? b.name : 'DJ didiscord', avatar: b ? b.avatar_url : null };
  }

  function hideCommandPopup() {
    popupMode = null;
    popupItems = [];
    commandPopup.hidden = true;
    commandPopup.innerHTML = '';
    clearTimeout(playSearchTimer);
    playSearchToken++; // descarta busca em andamento
    chatInput.removeAttribute('aria-activedescendant');
  }

  function setPopupIndex(i) {
    if (!popupItems.length) return;
    popupIndex = (i + popupItems.length) % popupItems.length;
    commandPopup.querySelectorAll('.command-item').forEach((el, idx) => {
      const active = idx === popupIndex;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) {
        el.scrollIntoView({ block: 'nearest' });
        chatInput.setAttribute('aria-activedescendant', el.id);
      }
    });
  }

  function renderPopup(header, emptyText) {
    const bot = botIdentity();
    commandPopup.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'command-popup-head';
    head.textContent = header;
    commandPopup.appendChild(head);

    if (!popupItems.length) {
      const empty = document.createElement('div');
      empty.className = 'command-popup-empty';
      empty.textContent = emptyText || 'nada por aqui';
      commandPopup.appendChild(empty);
    }

    popupItems.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'command-item' + (item.kind === 'track' ? ' is-track' : '');
      el.id = `command-item-${idx}`;
      el.setAttribute('role', 'option');
      if (item.kind === 'mention') {
        el.classList.add('is-mention');
        el.innerHTML = `
          <span class="command-item-avatar">${memberAvatarInner(item.user)}</span>
          <span class="command-item-text"><span class="command-item-name"><strong></strong></span></span>
          <span class="command-item-source"></span>`;
        el.querySelector('strong').textContent = item.user.username;
        el.querySelector('.command-item-source').textContent = currentUser && item.user.id === currentUser.id ? 'você' : (item.user.online ? 'online' : '');
      } else if (item.kind === 'mention-special') {
        el.classList.add('is-mention');
        el.innerHTML = `
          <span class="command-item-avatar is-special">@</span>
          <span class="command-item-text"><span class="command-item-name"><strong></strong></span><span class="command-item-desc"></span></span>`;
        el.querySelector('strong').textContent = '@' + item.name;
        el.querySelector('.command-item-desc').textContent = item.name === 'everyone' ? 'avisa todo mundo que vê este canal' : 'avisa quem está online';
      } else if (item.kind === 'emoji') {
        el.classList.add('is-emoji');
        el.innerHTML = `
          <span class="command-item-emoji"></span>
          <span class="command-item-text"><span class="command-item-name"><strong></strong></span></span>
          <span class="command-item-source"></span>`;
        el.querySelector('.command-item-emoji').textContent = item.emoji.emoji;
        el.querySelector('strong').textContent = item.emoji.codes.length ? `:${item.emoji.codes[0]}:` : item.emoji.name;
        el.querySelector('.command-item-source').textContent = item.emoji.name;
      } else if (item.kind === 'command') {
        el.innerHTML = `
          <span class="command-item-icon">${bot.avatar ? `<img src="${escapeAttr(bot.avatar)}" alt="">` : '♪'}</span>
          <span class="command-item-text">
            <span class="command-item-name"><strong></strong><span class="command-item-args"></span></span>
            <span class="command-item-desc"></span>
          </span>
          <span class="command-item-source"></span>`;
        el.querySelector('strong').textContent = `/${item.cmd.name}`;
        el.querySelector('.command-item-args').textContent = item.cmd.args || '';
        el.querySelector('.command-item-desc').textContent = item.cmd.desc;
        el.querySelector('.command-item-source').textContent = bot.name;
      } else {
        el.innerHTML = `
          <span class="command-item-thumb"><img src="${escapeAttr(item.track.thumbnail)}" alt="" loading="lazy"></span>
          <span class="command-item-text">
            <span class="command-item-name"><strong></strong></span>
            <span class="command-item-desc"></span>
          </span>
          <span class="command-item-duration"></span>`;
        el.querySelector('strong').textContent = item.track.title;
        el.querySelector('.command-item-desc').textContent = item.track.artist || 'YouTube';
        el.querySelector('.command-item-duration').textContent = item.track.duration || '';
      }
      // mousedown (não click): escolhe antes do input perder o foco
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        popupIndex = idx;
        choosePopupItem();
      });
      el.addEventListener('mousemove', () => { if (popupIndex !== idx) setPopupIndex(idx); });
      commandPopup.appendChild(el);
    });

    commandPopup.hidden = false;
    setPopupIndex(Math.min(popupIndex, Math.max(0, popupItems.length - 1)));
  }

  function renderPlayLoading(query) {
    commandPopup.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'command-popup-head';
    head.textContent = `buscando "${query}" no YouTube…`;
    const loading = document.createElement('div');
    loading.className = 'command-popup-loading';
    loading.innerHTML = '<span></span><span></span><span></span>';
    commandPopup.append(head, loading);
    commandPopup.hidden = false;
  }

  function updateCommandPopup() {
    if (!currentChannel || currentChannel.type !== 'text') { hideCommandPopup(); return; }
    // @menção e :emoji: funcionam em qualquer canal de texto (inclusive DM)
    if (updateMentionOrEmojiPopup()) return;
    // comandos só fazem sentido em canal de texto de servidor (o bot não toca em DM)
    if (currentChannel.dm || pendingAttachment) {
      hideCommandPopup();
      return;
    }
    const value = chatInput.value;

    // "/pl" -> lista de comandos filtrada
    const cmdMatch = /^\/(\S*)$/.exec(value);
    if (cmdMatch) {
      const typed = cmdMatch[1].toLowerCase();
      const list = BOT_COMMANDS.filter((c) => c.name.startsWith(typed));
      if (popupMode !== 'commands') popupIndex = 0;
      popupMode = 'commands';
      popupItems = list.map((cmd) => ({ kind: 'command', cmd }));
      if (!list.length) { hideCommandPopup(); return; }
      renderPopup(typed ? `comandos com "/${typed}"` : 'comandos do bot de música');
      return;
    }

    // "/play jane" -> sugestões do YouTube
    const playMatch = /^\/play\s+(.+)$/i.exec(value);
    if (playMatch) {
      const query = playMatch[1].trim();
      if (query.length < 2 || /^https?:\/\//i.test(query) || /^\d+$/.test(query)) {
        hideCommandPopup(); // link ou "/play 3" (depois de um /search) não precisam de sugestão
        return;
      }
      if (popupMode === 'play' && query === playSearchQuery && popupItems.length) return; // nada mudou
      popupMode = 'play';
      playSearchQuery = query;
      popupItems = [];
      popupIndex = 0;
      renderPlayLoading(query);
      clearTimeout(playSearchTimer);
      const token = ++playSearchToken;
      playSearchTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/musicbot/search?q=${encodeURIComponent(query)}`);
          const data = await res.json().catch(() => ({}));
          if (token !== playSearchToken || popupMode !== 'play') return; // já digitou outra coisa
          popupItems = (data.results || []).map((track) => ({ kind: 'track', track }));
          renderPopup(`resultados pra "${query}"`, data.error ? `não deu pra buscar: ${data.error}` : 'nada encontrado — Enter manda assim mesmo');
        } catch (_) {
          if (token === playSearchToken) hideCommandPopup();
        }
      }, PLAY_SEARCH_DEBOUNCE_MS);
      return;
    }

    hideCommandPopup();
  }

  function choosePopupItem() {
    const item = popupItems[popupIndex];
    if (!item) return false;
    if (item.kind === 'mention' || item.kind === 'mention-special' || item.kind === 'emoji') {
      const insert = item.kind === 'mention' ? `@${item.user.username} `
        : item.kind === 'mention-special' ? `@${item.name} ` : `${item.emoji.emoji} `;
      hideCommandPopup();
      replaceToken(item.token, insert);
      return true;
    }
    if (item.kind === 'command') {
      if (item.cmd.args) {
        // comando com argumento: completa e deixa a pessoa digitar (no /play já começa a sugerir)
        chatInput.value = `/${item.cmd.name} `;
        hideCommandPopup();
        chatInput.focus();
        updateCommandPopup();
      } else {
        // sem argumento (/skip, /stop...): já manda
        chatInput.value = `/${item.cmd.name}`;
        hideCommandPopup();
        chatComposer.requestSubmit();
      }
      return true;
    }
    // música escolhida: manda o /play com o link exato dela
    chatInput.value = `/play ${item.track.url}`;
    hideCommandPopup();
    chatComposer.requestSubmit();
    return true;
  }

  chatInput.addEventListener('input', () => { autosizeComposer(); notifyTyping(); updateCommandPopup(); });
  chatInput.addEventListener('click', updateCommandPopup);
  chatInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== chatInput) hideCommandPopup(); }, 150));

  chatInput.addEventListener('keydown', (e) => {
    if (commandPopup.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setPopupIndex(popupIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPopupIndex(popupIndex - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideCommandPopup(); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && popupItems.length) {
      e.preventDefault(); // não deixa o formulário enviar o texto cru — quem decide é choosePopupItem
      choosePopupItem();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // ainda carregando: Tab não tira o foco da caixa de mensagem
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    // Enter envia (ou, se a pessoa preferir, Enter quebra linha e Ctrl+Enter envia)
    const sends = getPref('prefEnterSends') ? (!e.shiftKey && !e.ctrlKey) : (e.ctrlKey || e.metaKey);
    if (e.key === 'Enter' && sends) {
      e.preventDefault();
      chatComposer.requestSubmit();
    } else if (e.key === 'ArrowUp' && !chatInput.value) {
      // seta pra cima com a caixa vazia: edita a sua última mensagem (igual o Discord)
      const mine = [...currentMessages].reverse().find(canEditMessage);
      const el = mine && chatMessages.querySelector(`.msg-group[data-message-id="${mine.id}"]`);
      if (el) { e.preventDefault(); startEditMessage(mine, el); }
    }
  });

  const emojiBtn = document.getElementById('emojiBtn');
  if (emojiBtn) {
    emojiBtn.addEventListener('click', () => {
      DidiEmoji.open({
        anchor: emojiBtn,
        onPick: (emoji) => {
          const start = chatInput.selectionStart ?? chatInput.value.length;
          const end = chatInput.selectionEnd ?? start;
          chatInput.value = chatInput.value.slice(0, start) + emoji + chatInput.value.slice(end);
          const caret = start + emoji.length;
          chatInput.focus();
          chatInput.setSelectionRange(caret, caret);
          autosizeComposer();
        },
      });
    });
  }

  chatComposer.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideCommandPopup();
    if (!currentChannel) return;
    const content = encodeShortcodes(encodeMentions(chatInput.value.trim()));
    const replyToId = pendingReplyTo ? pendingReplyTo.id : null;

    if (pendingAttachment) {
      const file = pendingAttachment;
      const caption = content;
      showComposerError('');

      // NÃO limpa o anexo pendente nem o input aqui — só depois do upload confirmar sucesso
      // (xhr 'load' com status 2xx). Assim, se a conexão cair ou o servidor recusar o arquivo
      // (ex: 2GB é bastante coisa numa conexão ruim), o anexo e a legenda continuam ali pra
      // a pessoa só clicar em enviar de novo, em vez de ter que escolher o arquivo outra vez.
      attachBtn.disabled = true;
      chatSendBtn.disabled = true;
      showUploadProgress(0, 0, file.size);

      const formData = new FormData();
      formData.append('file', file);
      if (caption) formData.append('content', caption);
      if (replyToId) formData.append('reply_to_id', replyToId);

      const xhr = new XMLHttpRequest();
      activeUploadXhr = xhr;
      xhr.open('POST', `/api/channels/${currentChannel.id}/messages/attachment`);

      // progresso real de upload — fetch() não expõe isso de forma confiável, por isso o XHR
      xhr.upload.addEventListener('progress', (ev) => {
        if (!ev.lengthComputable) return;
        const percent = Math.round((ev.loaded / ev.total) * 100);
        showUploadProgress(percent, ev.loaded, ev.total);
      });

      xhr.addEventListener('load', () => {
        activeUploadXhr = null;
        attachBtn.disabled = false;
        chatSendBtn.disabled = false;
        if (xhr.status >= 200 && xhr.status < 300) {
          clearPendingAttachment();
          chatInput.value = '';
          autosizeComposer();
          clearReplyTarget();
          // a mensagem em si aparece via broadcast (message_created), igual todo o resto
        } else {
          let errMsg = 'não deu pra enviar esse arquivo';
          try {
            const data = JSON.parse(xhr.responseText);
            if (data && data.error) errMsg = data.error;
          } catch (_) { /* resposta não veio em JSON — segue com a mensagem padrão */ }
          hideUploadProgress();
          showComposerError(errMsg);
        }
      });

      xhr.addEventListener('error', () => {
        activeUploadXhr = null;
        attachBtn.disabled = false;
        chatSendBtn.disabled = false;
        hideUploadProgress();
        showComposerError('erro de conexão ao enviar o arquivo');
      });

      // cancelamento deliberado (botão "remover anexo" durante upload, ver attachmentPreviewRemove)
      // — aí sim remove o anexo de vez, já que a pessoa pediu isso explicitamente
      xhr.addEventListener('abort', () => {
        activeUploadXhr = null;
        attachBtn.disabled = false;
        chatSendBtn.disabled = false;
        clearPendingAttachment();
      });

      xhr.send(formData);
      return;
    }

    if (!content) return;
    chatInput.value = '';
    autosizeComposer();
    clearReplyTarget();
    showComposerError('');
    try {
      const res = await fetch(`/api/channels/${currentChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, reply_to_id: replyToId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showComposerError(data.error || 'não deu pra enviar a mensagem');
      }
    } catch (_) {
      showComposerError('erro de conexão ao enviar a mensagem');
    }
    // a mensagem aparece via broadcast (message_created), inclusive pra quem enviou
  });

  // ---------- cache de usuários ----------
  // todo mundo que já apareceu na tela (membros de qualquer servidor aberto, pessoas das DMs,
  // contatos) fica aqui, por id — assim avatar/nome funcionam em qualquer lugar (call de outro
  // servidor, lista de DMs, popout) sem depender de qual servidor está aberto agora.
  function rememberUser(u) {
    if (!u || u.id == null) return null;
    const prev = usersById.get(u.id);
    if (prev) { Object.assign(prev, u); return prev; }
    const copy = { ...u };
    usersById.set(u.id, copy);
    return copy;
  }

  function findUser(id) {
    if (currentUser && id === currentUser.id) return currentUser;
    return usersById.get(id) || null;
  }

  function escapeAttr(str) {
    return String(str == null ? '' : str).replace(/[&"'<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  // ---------- painel de membros ----------

  let memberPanelCollapsed = false;
  membersToggleBtn.addEventListener('click', () => {
    memberPanelCollapsed = !memberPanelCollapsed;
    memberPanel.hidden = memberPanelCollapsed;
  });

  const CROWN_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>';

  function memberAvatarInner(m) {
    return m.avatar_url
      ? `<img src="${escapeAttr(m.avatar_url)}" alt="${escapeAttr(m.username)}">`
      : escapeHtml(initials(m.username));
  }

  function renderMembers() {
    const server = currentServer();
    const online = members.filter((m) => m.online);
    const offline = members.filter((m) => !m.online);

    function fillSection(section, list, label) {
      const labelEl = section.querySelector('.member-section-label');
      labelEl.textContent = `${label} (${list.length})`;
      section.hidden = list.length === 0;
      section.querySelectorAll('.member-item, .member-empty').forEach((n) => n.remove());

      for (const m of list) {
        const isOwner = !!(server && server.owner_id === m.id);
        const item = document.createElement('div');
        item.className = 'member-item' + (m.online ? '' : ' is-offline');
        item.style.setProperty('--member-accent', m.accent_color || 'var(--amethyst)');
        item.innerHTML = `
          <div class="member-item-avatar">
            ${memberAvatarInner(m)}
            <span class="member-presence-dot"></span>
          </div>
          <div class="member-item-text">
            <span class="member-item-name"><span class="member-item-name-text"></span>${isOwner ? `<span class="member-owner" title="dono do servidor">${CROWN_ICON}</span>` : ''}</span>
            <span class="member-item-status"></span>
          </div>
        `;
        item.querySelector('.member-item-name-text').textContent = m.username;
        const roleColor = memberColor(m);
        if (roleColor) item.querySelector('.member-item-name-text').style.color = roleColor;
        const statusEl = item.querySelector('.member-item-status');
        if (m.activity && m.online) {
          // "jogando X" (rich presence) ocupa o lugar do status enquanto a pessoa está no jogo
          const game = document.createElement('strong');
          game.textContent = m.activity.name;
          statusEl.replaceChildren('jogando ', game);
          statusEl.classList.add('is-activity');
          statusEl.title = `${m.activity.name} — ${formatActivitySince(m.activity.startedAt)}`;
          statusEl.hidden = false;
        } else {
          statusEl.textContent = m.status_text || '';
          statusEl.hidden = !m.status_text;
        }
        item.addEventListener('click', () => openViewProfile(m.id, item));
        if (!currentUser || currentUser.id !== m.id) {
          item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openParticipantContextMenu(e, m.id, m.username);
          });
        }
        section.appendChild(item);
      }
    }

    // cargos "mostrados separado" (igual ao Discord): quem está online e tem um desses cargos aparece
    // no grupo do cargo MAIS ALTO dele, com o nome do cargo em cima; o resto fica em "online" e quem
    // está offline fica sempre junto em "offline"
    const hoisted = serverRoles.filter((r) => r.hoist); // já vem do mais alto pro mais baixo
    const groups = new Map(hoisted.map((r) => [r.id, []]));
    const plainOnline = [];
    for (const m of online) {
      const top = memberRoles(m).find((r) => r.hoist);
      if (top) groups.get(top.id).push(m);
      else plainOnline.push(m);
    }
    memberPanel.querySelectorAll('.member-section.is-role').forEach((n) => n.remove());
    for (const role of hoisted) {
      const list = groups.get(role.id);
      if (!list.length) continue;
      const section = document.createElement('div');
      section.className = 'member-section is-role';
      section.style.setProperty('--role-color', role.color || 'var(--text-faint)');
      section.innerHTML = '<div class="member-section-label"></div>';
      memberPanel.insertBefore(section, memberSectionOnline);
      fillSection(section, list, role.name);
    }

    fillSection(memberSectionOnline, plainOnline, 'online');
    fillSection(memberSectionOffline, offline, 'offline');

    const botsLabel = memberSectionBots.querySelector('.member-section-label');
    botsLabel.textContent = `bots (${bots.length})`;
    memberSectionBots.hidden = bots.length === 0 || currentServerId == null;
    memberSectionBots.querySelectorAll('.member-item, .member-empty').forEach((n) => n.remove());
    for (const b of bots) {
      const item = document.createElement('div');
      item.className = 'member-item is-bot';
      item.innerHTML = `
        <div class="member-item-avatar">
          ${b.avatar_url ? `<img src="${escapeAttr(b.avatar_url)}" alt="">` : escapeHtml(initials(b.name))}
        </div>
        <div class="member-item-text">
          <span class="member-item-name"><span class="member-item-name-text"></span><span class="member-bot-tag">bot</span></span>
        </div>
      `;
      item.querySelector('.member-item-name-text').textContent = b.name;
      item.title = b.description || '';
      memberSectionBots.appendChild(item);
    }
    applyAuthorColors(); // membros/cargos mudaram: os nomes no chat acompanham
  }

  async function loadMembers() {
    const sid = currentServerId;
    if (sid == null) { members = []; renderMembers(); return; }
    try {
      const res = await fetch(`/api/servers/${sid}/members`);
      if (sid !== currentServerId) return; // trocou de servidor enquanto carregava
      if (res.ok) {
        const data = await res.json();
        members = data.members.map(rememberUser);
      }
      if (!bots.length) {
        const botsRes = await fetch('/api/bots');
        if (botsRes.ok) bots = (await botsRes.json()).bots;
      }
    } catch (_) { /* lista fica como estava */ }
    if (sid === currentServerId) renderMembers();
  }

  // ---------- cartão de perfil ----------
  // um componente só, usado em 3 lugares: popout (clicar em alguém), prévia ao vivo na edição do
  // próprio perfil e painel lateral das DMs. O cartão inteiro é pintado com as cores da pessoa
  // (cor de destaque + segunda cor opcional pro degradê), e o conteúdo fica numa placa escura por
  // cima — é o que faz cada perfil ter cara própria.

  function formatMemberSince(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function serverInitials(name) {
    const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2);
    return words.slice(0, 3).map((w) => w[0]).join('');
  }

  function serverIconInner(s) {
    return s.icon_url
      ? `<img src="${escapeAttr(s.icon_url)}" alt="">`
      : `<span class="server-initials">${escapeHtml(serverInitials(s.name))}</span>`;
  }

  // opts: { online, mutuals: [{id,name,icon_url}] | null, actions: [{label, kind, onClick}], isPreview }
  function renderProfileCard(el, user, opts = {}) {
    const c1 = user.accent_color || ACCENT_COLORS[0];
    const c2 = user.accent_color_2 || null;
    el.style.setProperty('--card-c1', c1);
    el.style.setProperty('--card-c2', c2 || c1);
    el.classList.toggle('has-gradient', !!c2);
    el.classList.toggle('has-banner', !!user.banner_url);

    const online = opts.online != null ? opts.online : !!user.online;
    const avatar = user.avatar_url
      ? `<img src="${escapeAttr(user.avatar_url)}" alt="">`
      : `<span class="pc-initials">${escapeHtml(initials(user.username))}</span>`;

    el.innerHTML = `
      <div class="pc-banner"${user.banner_url ? ` style="background-image:url('${escapeAttr(user.banner_url)}')"` : ''}></div>
      <div class="pc-avatar-row">
        <div class="pc-avatar">${avatar}<span class="pc-dot${online ? ' is-online' : ''}" title="${online ? 'online' : 'offline'}"></span></div>
      </div>
      <div class="pc-body">
        <div class="pc-identity">
          <h3 class="pc-name display"></h3>
          <p class="pc-status"></p>
        </div>
        <div class="pc-section pc-activity-wrap" hidden>
          <h4>jogando</h4>
          <p class="pc-activity"></p>
          <p class="pc-activity-time"></p>
        </div>
        <div class="pc-section pc-about">
          <h4>sobre mim</h4>
          <p class="pc-bio"></p>
        </div>
        <div class="pc-section pc-since-wrap">
          <h4>no didiscord desde</h4>
          <p class="pc-since"></p>
        </div>
        <div class="pc-section pc-roles-wrap" hidden>
          <h4>cargos</h4>
          <div class="pc-roles"></div>
        </div>
        <div class="pc-section pc-mutuals-wrap" hidden>
          <h4>servidores em comum</h4>
          <div class="pc-mutuals"></div>
        </div>
        <div class="pc-actions"></div>
      </div>
    `;

    el.querySelector('.pc-name').textContent = user.username || '';

    const statusEl = el.querySelector('.pc-status');
    statusEl.textContent = user.status_text || '';
    statusEl.hidden = !user.status_text;

    if (user.activity && user.activity.name && online) {
      el.querySelector('.pc-activity-wrap').hidden = false;
      el.querySelector('.pc-activity').textContent = user.activity.name;
      el.querySelector('.pc-activity-time').textContent = formatActivitySince(user.activity.startedAt);
    }

    const bioEl = el.querySelector('.pc-bio');
    if (user.bio) {
      bioEl.textContent = user.bio;
    } else if (opts.isPreview) {
      bioEl.textContent = 'escreva algo sobre você';
      bioEl.classList.add('is-empty');
    } else {
      el.querySelector('.pc-about').hidden = true;
    }

    const since = formatMemberSince(user.created_at);
    el.querySelector('.pc-since').textContent = since;
    el.querySelector('.pc-since-wrap').hidden = !since;

    if (Array.isArray(opts.mutuals) && opts.mutuals.length) {
      const wrap = el.querySelector('.pc-mutuals-wrap');
      const list = el.querySelector('.pc-mutuals');
      wrap.hidden = false;
      for (const s of opts.mutuals) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pc-mutual';
        b.title = s.name;
        b.innerHTML = serverIconInner(s);
        b.addEventListener('click', () => {
          closeViewProfile();
          if (servers.some((x) => x.id === s.id)) selectServer(s.id);
        });
        list.appendChild(b);
      }
    }

    if (opts.roles) fillProfileRoles(el.querySelector('.pc-roles-wrap'), opts.roles);

    const actionsEl = el.querySelector('.pc-actions');
    for (const a of opts.actions || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.kind === 'danger' ? 'btn-danger-ghost' : a.kind === 'ghost' ? 'btn-ghost' : 'btn-primary'}`;
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      actionsEl.appendChild(b);
    }
    actionsEl.hidden = !(opts.actions && opts.actions.length);
  }

  // ---------- popout de perfil (clicar no avatar/nome de alguém, em qualquer lugar do app) ----------

  const viewProfileBackdrop = document.getElementById('viewProfileBackdrop');
  const viewProfileCard = document.getElementById('viewProfileCard');
  let viewProfileToken = 0;

  // userId: quem mostrar. anchorEl: o elemento em que a pessoa clicou — o popout nasce colado
  // nele, igual ao Discord. Mostra na hora com o que já está em cache e completa (servidores em
  // comum, dados frescos) quando a resposta do servidor chegar.
  async function openViewProfile(userId, anchorEl) {
    if (userId === BOT_USER_ID) return;
    const token = ++viewProfileToken;
    const cached = findUser(userId);
    if (cached) showProfilePopout(cached, cached.mutual_servers || null, anchorEl);

    try {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok || token !== viewProfileToken) return;
      const { user } = await res.json();
      const merged = user.id === currentUser.id ? Object.assign(currentUser, user) : rememberUser(user);
      if (cached && viewProfileBackdrop.hidden) return; // fechou enquanto carregava
      showProfilePopout(merged, user.mutual_servers, anchorEl);
    } catch (_) { /* fica com a versão em cache */ }
  }

  function showProfilePopout(user, mutuals, anchorEl) {
    const isSelf = !!(currentUser && user.id === currentUser.id);
    const actions = [];
    if (isSelf) {
      actions.push({ label: 'editar perfil', kind: 'primary', onClick: () => { closeViewProfile(); openProfileModal(); } });
    } else {
      actions.push({ label: 'mandar mensagem', kind: 'primary', onClick: () => { closeViewProfile(); openDm(user.id); } });
      const s = currentServer();
      if (s && canModerateMember(user.id) && members.some((m) => m.id === user.id)) {
        const inCallHere = channels.some((c) => c.id === findParticipantChannel(user.id));
        if (inCallHere) {
          actions.push({ label: 'desconectar da call', kind: 'ghost', onClick: () => { closeViewProfile(); disconnectMember(user.id, user.username); } });
        }
        actions.push({ label: `expulsar de ${s.name}`, kind: 'danger', onClick: () => { closeViewProfile(); kickMember(user); } });
      }
    }
    // cargos (só quando estou olhando um servidor e a pessoa é membro dele)
    const member = currentServer() ? members.find((m) => m.id === user.id) : null;
    let roles = null;
    if (member) {
      roles = {
        roles: memberRoles(member),
        editable: isAdminOfCurrentServer() && (isSelf || canModerateMember(user.id)),
        amOwner: currentServer().owner_id === currentUser.id,
        available: serverRoles,
        onChange: (ids) => setMemberRoles(user, ids, anchorEl),
      };
    }
    renderProfileCard(viewProfileCard, user, { mutuals: isSelf ? null : mutuals, actions, roles });
    viewProfileBackdrop.hidden = false;
    positionProfilePopout(anchorEl);
  }

  // encosta o popout perto do elemento clicado, sem deixar vazar pra fora da janela — tenta
  // primeiro à direita do elemento (como o Discord), e vira pra esquerda se não couber
  function positionProfilePopout(anchorEl) {
    const popout = viewProfileCard;
    const w = popout.offsetWidth || 340;
    const h = popout.offsetHeight || 420;
    let left;
    let top;

    if (anchorEl && anchorEl.isConnected) {
      const a = anchorEl.getBoundingClientRect();
      left = a.right + 12;
      top = a.top;
      if (left + w > window.innerWidth - 8) left = a.left - w - 12;
      if (left < 8) left = Math.min(window.innerWidth - w - 8, Math.max(8, a.left));
    } else {
      left = (window.innerWidth - w) / 2;
      top = (window.innerHeight - h) / 2;
    }
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    if (top < 8) top = 8;

    popout.style.left = Math.round(left) + 'px';
    popout.style.top = Math.round(top) + 'px';
  }

  function closeViewProfile() {
    viewProfileBackdrop.hidden = true;
  }

  viewProfileBackdrop.addEventListener('click', (e) => {
    if (e.target === viewProfileBackdrop) closeViewProfile();
  });
  window.addEventListener('resize', () => {
    if (!viewProfileBackdrop.hidden) closeViewProfile();
  });

  // ---------- painel de perfil na DM ----------

  const dmProfilePanel = document.getElementById('dmProfilePanel');
  const dmProfileCard = document.getElementById('dmProfileCard');

  async function renderDmProfilePanel() {
    if (!currentChannel || !currentChannel.dm) return;
    const channelId = currentChannel.id;
    const userId = currentChannel.userId;
    const u = findUser(userId);
    if (u) renderProfileCard(dmProfileCard, u, { mutuals: u.mutual_servers || null });

    if (!u || u.mutual_servers === undefined) {
      try {
        const res = await fetch(`/api/users/${userId}`);
        if (!res.ok) return;
        const { user } = await res.json();
        const merged = rememberUser(user);
        if (currentChannel && currentChannel.id === channelId) {
          renderProfileCard(dmProfileCard, merged, { mutuals: merged.mutual_servers || null });
        }
      } catch (_) { /* painel fica como está */ }
    }
  }

  // ---------- edição do próprio perfil ----------

  const profileModalBackdrop = document.getElementById('profileModalBackdrop');
  const profileTabs = document.getElementById('profileTabs');
  const profileCloseBtn = document.getElementById('profileCloseBtn');
  const profileEditBanner = document.getElementById('profileEditBanner');
  const profileEditAvatar = document.getElementById('profileEditAvatar');
  const profileLivePreview = document.getElementById('profileLivePreview');
  const avatarUploadBtn = document.getElementById('avatarUploadBtn');
  const bannerUploadBtn = document.getElementById('bannerUploadBtn');
  const bannerRemoveBtn = document.getElementById('bannerRemoveBtn');
  const avatarInput = document.getElementById('avatarInput');
  const bannerInput = document.getElementById('bannerInput');
  const profileUsernameInput = document.getElementById('profileUsernameInput');
  const profileStatusInput = document.getElementById('profileStatusInput');
  const profileBioInput = document.getElementById('profileBioInput');
  const profileBioCount = document.getElementById('profileBioCount');
  const colorSwatches = document.getElementById('colorSwatches');
  const colorSwatches2 = document.getElementById('colorSwatches2');
  const profileInfoError = document.getElementById('profileInfoError');
  const profileInfoSaveBtn = document.getElementById('profileInfoSaveBtn');
  const currentPasswordInput = document.getElementById('currentPasswordInput');
  const newPasswordInput = document.getElementById('newPasswordInput');
  const profilePasswordError = document.getElementById('profilePasswordError');
  const profilePasswordSaveBtn = document.getElementById('profilePasswordSaveBtn');
  const profileStatusLine = document.getElementById('profileStatus');

  function applyUserToProfileBar(user) {
    profileName.textContent = user.username;
    profileStatusLine.textContent = user.status_text || 'online';
    profileStatusLine.classList.toggle('has-custom', !!user.status_text);
    profileAvatar.style.setProperty('--pfp-ring', user.accent_color || 'var(--amethyst)');
    if (user.avatar_url) {
      profileAvatar.innerHTML = `<img src="${escapeAttr(user.avatar_url)}" alt="">`;
    } else {
      profileAvatar.textContent = initials(user.username);
    }
  }

  function buildColorSwatches(selected) {
    colorSwatches.innerHTML = '';
    for (const color of ACCENT_COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch' + (color.toLowerCase() === (selected || '').toLowerCase() ? ' active' : '');
      btn.style.background = color;
      btn.title = color;
      btn.addEventListener('click', () => {
        colorSwatches.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        colorSwatches.dataset.selected = color;
        refreshLivePreview();
      });
      colorSwatches.appendChild(btn);
    }
    colorSwatches.dataset.selected = selected || ACCENT_COLORS[0];

    const custom = document.createElement('input');
    custom.type = 'color';
    custom.className = 'color-swatch-custom';
    custom.value = selected || ACCENT_COLORS[0];
    custom.title = 'escolher outra cor';
    custom.addEventListener('input', () => {
      colorSwatches.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
      colorSwatches.dataset.selected = custom.value;
      refreshLivePreview();
    });
    colorSwatches.appendChild(custom);
  }

  function buildColorSwatches2(selected2) {
    colorSwatches2.innerHTML = '';

    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.className = 'color-swatch-none' + (!selected2 ? ' active' : '');
    noneBtn.title = 'sem degradê';
    noneBtn.addEventListener('click', () => {
      colorSwatches2.querySelectorAll('.color-swatch, .color-swatch-none').forEach((s) => s.classList.remove('active'));
      noneBtn.classList.add('active');
      colorSwatches2.dataset.selected2 = '';
      refreshLivePreview();
    });
    colorSwatches2.appendChild(noneBtn);

    for (const color of ACCENT_COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch' + (color.toLowerCase() === (selected2 || '').toLowerCase() ? ' active' : '');
      btn.style.background = color;
      btn.title = color;
      btn.addEventListener('click', () => {
        colorSwatches2.querySelectorAll('.color-swatch, .color-swatch-none').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        colorSwatches2.dataset.selected2 = color;
        refreshLivePreview();
      });
      colorSwatches2.appendChild(btn);
    }
    colorSwatches2.dataset.selected2 = selected2 || '';

    const custom = document.createElement('input');
    custom.type = 'color';
    custom.className = 'color-swatch-custom';
    custom.value = selected2 || ACCENT_COLORS[1];
    custom.title = 'escolher outra cor';
    custom.addEventListener('input', () => {
      colorSwatches2.querySelectorAll('.color-swatch, .color-swatch-none').forEach((s) => s.classList.remove('active'));
      colorSwatches2.dataset.selected2 = custom.value;
      refreshLivePreview();
    });
    colorSwatches2.appendChild(custom);
  }

  // o perfil como está no formulário agora (ainda não salvo) — alimenta a prévia ao vivo
  function draftUser() {
    return {
      ...currentUser,
      username: profileUsernameInput.value.trim() || currentUser.username,
      status_text: profileStatusInput.value.trim() || null,
      bio: profileBioInput.value.trim() || null,
      accent_color: colorSwatches.dataset.selected || currentUser.accent_color,
      accent_color_2: colorSwatches2.dataset.selected2 || null,
    };
  }

  function refreshImagePreviews() {
    const d = draftUser();
    profileEditBanner.style.setProperty('--card-c1', d.accent_color || ACCENT_COLORS[0]);
    profileEditBanner.style.setProperty('--card-c2', d.accent_color_2 || d.accent_color || ACCENT_COLORS[0]);
    profileEditBanner.style.backgroundImage = currentUser.banner_url ? `url('${escapeAttr(currentUser.banner_url)}')` : '';
    profileEditBanner.classList.toggle('has-image', !!currentUser.banner_url);
    profileEditAvatar.innerHTML = currentUser.avatar_url
      ? `<img src="${escapeAttr(currentUser.avatar_url)}" alt="">`
      : `<span>${escapeHtml(initials(d.username))}</span>`;
    profileEditAvatar.style.borderColor = d.accent_color || ACCENT_COLORS[0];
    bannerRemoveBtn.hidden = !currentUser.banner_url;
  }

  function refreshLivePreview() {
    renderProfileCard(profileLivePreview, draftUser(), { online: true, isPreview: true });
    profileBioCount.textContent = `${profileBioInput.value.length}/190`;
    refreshImagePreviews();
  }

  function switchProfileTab(tabName) {
    profileTabs.querySelectorAll('.profile-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    profileModalBackdrop.querySelectorAll('.profile-tab-panel').forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tabName;
    });
  }

  profileTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.profile-tab');
    if (btn) switchProfileTab(btn.dataset.tab);
  });

  profileUsernameInput.addEventListener('input', refreshLivePreview);
  profileStatusInput.addEventListener('input', refreshLivePreview);
  profileBioInput.addEventListener('input', refreshLivePreview);

  function openProfileModal() {
    profileInfoError.textContent = '';
    profileInfoError.classList.remove('is-success');
    profilePasswordError.textContent = '';
    profilePasswordError.classList.remove('is-success');
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    profileUsernameInput.value = currentUser.username;
    profileStatusInput.value = currentUser.status_text || '';
    profileBioInput.value = currentUser.bio || '';
    switchProfileTab('perfil');
    buildColorSwatches(currentUser.accent_color);
    buildColorSwatches2(currentUser.accent_color_2);
    refreshLivePreview();
    profileModalBackdrop.hidden = false;
    profileUsernameInput.focus();
  }

  function closeProfileModal() {
    profileModalBackdrop.hidden = true;
  }

  profileBar.addEventListener('click', (e) => {
    if (e.target.closest('.profile-actions')) return; // botões de mudo/config/sair não abrem o perfil
    openProfileModal();
  });
  profileCloseBtn.addEventListener('click', closeProfileModal);
  profileModalBackdrop.addEventListener('click', (e) => {
    if (e.target === profileModalBackdrop) closeProfileModal();
  });

  avatarUploadBtn.addEventListener('click', () => avatarInput.click());
  bannerUploadBtn.addEventListener('click', () => bannerInput.click());

  async function uploadProfileImage(kind, input) {
    const file = input.files[0];
    if (!file) return;
    profileInfoError.textContent = '';
    profileInfoError.classList.remove('is-success');
    const btn = kind === 'avatar' ? avatarUploadBtn : bannerUploadBtn;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'enviando...';
    try {
      const formData = new FormData();
      formData.append(kind, file);
      const res = await fetch(`/api/profile/${kind}`, { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        currentUser = { ...currentUser, ...data.user };
        applyUserToProfileBar(currentUser);
        refreshLivePreview();
      } else {
        profileInfoError.textContent = data.error || (kind === 'avatar' ? 'não deu pra trocar o avatar' : 'não deu pra trocar o banner');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = original;
      input.value = '';
    }
  }

  avatarInput.addEventListener('change', () => uploadProfileImage('avatar', avatarInput));
  bannerInput.addEventListener('change', () => uploadProfileImage('banner', bannerInput));

  bannerRemoveBtn.addEventListener('click', async () => {
    const res = await fetch('/api/profile/banner', { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      currentUser = { ...currentUser, ...data.user };
      refreshLivePreview();
    } else {
      profileInfoError.textContent = data.error || 'não deu pra remover o banner';
    }
  });

  profileInfoSaveBtn.addEventListener('click', async () => {
    profileInfoError.textContent = '';
    profileInfoError.classList.remove('is-success');
    const d = draftUser();

    profileInfoSaveBtn.disabled = true;
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: profileUsernameInput.value.trim(),
          status_text: d.status_text || '',
          bio: d.bio || '',
          accent_color: d.accent_color,
          accent_color_2: d.accent_color_2,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        profileInfoError.textContent = data.error || 'não deu pra salvar';
        return;
      }
      currentUser = { ...currentUser, ...data.user };
      applyUserToProfileBar(currentUser);
      profileInfoError.textContent = 'perfil salvo';
      profileInfoError.classList.add('is-success');
    } finally {
      profileInfoSaveBtn.disabled = false;
    }
  });

  profilePasswordSaveBtn.addEventListener('click', async () => {
    profilePasswordError.textContent = '';
    profilePasswordError.classList.remove('is-success');
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    if (!currentPassword || !newPassword) {
      profilePasswordError.textContent = 'preencha a senha atual e a nova';
      return;
    }

    profilePasswordSaveBtn.disabled = true;
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        profilePasswordError.textContent = data.error || 'não deu pra trocar a senha';
        return;
      }
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      profilePasswordError.textContent = 'senha trocada';
      profilePasswordError.classList.add('is-success');
    } finally {
      profilePasswordSaveBtn.disabled = false;
    }
  });

  // ---------- avisos rápidos (toast) ----------

  const toastHost = document.getElementById('toastHost');

  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' is-error' : '');
    el.textContent = text;
    toastHost.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 250);
    }, 4000);
  }

  // ---------- tela vazia da área principal ----------

  function setMainEmpty(title, text, actions = []) {
    mainEmpty.innerHTML = '';
    const h = document.createElement('h2');
    h.className = 'display';
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = text;
    mainEmpty.append(h, p);
    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'main-empty-actions';
      for (const a of actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`;
        b.textContent = a.label;
        b.addEventListener('click', a.onClick);
        row.appendChild(b);
      }
      mainEmpty.appendChild(row);
    }
    chatView.hidden = true;
    callView.hidden = true;
    mainEmpty.hidden = false;
  }

  function showHomeEmpty() {
    if (servers.length === 0) {
      setMainEmpty(
        'bem-vindo ao didiscord',
        'Você ainda não está em nenhum servidor. Crie o seu ou entre com o link de convite que um amigo te mandou.',
        [
          { label: 'criar servidor', primary: true, onClick: () => openAddServerModal('create') },
          { label: 'entrar com convite', onClick: () => openAddServerModal('join') },
        ]
      );
    } else if (dms.length === 0) {
      setMainEmpty(
        'nenhuma conversa ainda',
        'Clique em alguém da lista de membros de um servidor e escolha "mandar mensagem", ou comece por aqui.',
        [{ label: 'nova conversa', primary: true, onClick: openNewDmModal }]
      );
    } else {
      setMainEmpty('suas conversas', 'Escolha uma conversa na lateral pra continuar de onde parou.',
        window.didiscordDesktop ? [] : [{ label: 'baixar o app pro computador', onClick: () => window.open('/baixar', '_blank') }]);
    }
  }

  // ---------- não lidas ----------
  // canal -> { servidor (null = DM), quantas menções }. O ponto lido fica no servidor
  // (channel_reads), então sobrevive a recarregar a página e vale em todas as abas/no app.

  function markChannelUnread(channelId, serverId, addMentions = 0) {
    const cur = unreadChannels.get(channelId) || { serverId: serverId == null ? null : serverId, mentions: 0 };
    cur.mentions += addMentions;
    unreadChannels.set(channelId, cur);
    updateUnreadTitle();
  }

  function markChannelRead(channelId) {
    unreadChannels.delete(channelId);
    syncRead(channelId);
    updateUnreadTitle();
  }

  function serverHasUnread(serverId) {
    for (const u of unreadChannels.values()) if (u.serverId === serverId) return true;
    return false;
  }

  // na bolinha da tela inicial: quantas mensagens diretas não lidas
  function dmUnreadCount() {
    let n = 0;
    for (const u of unreadChannels.values()) if (u.serverId === null) n += Math.max(1, u.mentions || 0);
    return n;
  }

  function rememberLastChannel(serverId, channelId) {
    try { localStorage.setItem(`didiscord:lastChannel:${serverId}`, String(channelId)); } catch (_) { /* sem storage, sem memória */ }
  }

  function lastChannelOf(serverId) {
    try { return Number(localStorage.getItem(`didiscord:lastChannel:${serverId}`)) || null; } catch (_) { return null; }
  }

  // ---------- barra de servidores ----------

  const railHomeBtn = document.getElementById('railHomeBtn');
  const railHomeBadge = document.getElementById('railHomeBadge');
  const railServers = document.getElementById('railServers');
  const railAddBtn = document.getElementById('railAddBtn');
  const serverHeaderBtn = document.getElementById('serverHeaderBtn');
  const serverHeaderName = document.getElementById('serverHeaderName');
  const serverMenu = document.getElementById('serverMenu');

  function currentServer() {
    return currentServerId == null ? null : (servers.find((s) => s.id === currentServerId) || null);
  }

  function renderRail() {
    railHomeBtn.classList.toggle('active', currentServerId == null);
    const dmUnread = dmUnreadCount();
    railHomeBadge.hidden = dmUnread === 0;
    railHomeBadge.textContent = dmUnread > 9 ? '9+' : String(dmUnread);

    railServers.innerHTML = '';
    for (const s of servers) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rail-item rail-server';
      if (s.id === currentServerId) b.classList.add('active');
      if (s.id !== currentServerId && serverHasUnread(s.id)) b.classList.add('has-unread');
      b.title = s.name;
      b.setAttribute('aria-label', s.name);
      b.innerHTML = `<span class="rail-pill"></span><span class="rail-icon">${serverIconInner(s)}</span>`;
      const mentions = serverMentionCount(s.id);
      if (mentions > 0) b.appendChild(mentionBadge(mentions, 'rail-badge'));
      b.addEventListener('click', () => selectServer(s.id));
      railServers.appendChild(b);
    }
  }

  function renderSidebarHeader() {
    const s = currentServer();
    closeServerMenu();
    if (!s) {
      serverHeaderName.textContent = 'mensagens diretas';
      serverHeaderBtn.classList.add('is-home');
      serverHeaderBtn.disabled = true;
      return;
    }
    serverHeaderName.textContent = s.name;
    serverHeaderBtn.classList.remove('is-home');
    serverHeaderBtn.disabled = false;
  }

  railHomeBtn.addEventListener('click', () => selectServer(null));
  railAddBtn.addEventListener('click', () => openAddServerModal('choose'));

  function upsertServer(server) {
    const i = servers.findIndex((s) => s.id === server.id);
    if (i >= 0) servers[i] = { ...servers[i], ...server };
    else servers.push(server);
    renderRail();
    if (server.id === currentServerId) {
      renderSidebarHeader();
      renderMembers(); // coroa do dono pode ter mudado
    }
  }

  // o servidor sumiu pra mim (apaguei, saí, fui expulso ou alguém apagou) — limpa tudo dele
  function removeServerLocally(serverId, message) {
    servers = servers.filter((s) => s.id !== serverId);
    for (const [chId, sid] of [...unreadChannels.entries()]) if (sid === serverId) unreadChannels.delete(chId);
    if (voiceChannel && voiceChannel.server_id === serverId) leaveVoiceCall({ silent: true });
    if (currentServerId === serverId) selectServer(null);
    else renderRail();
    if (message) toast(message);
  }

  async function selectServer(serverId, opts = {}) {
    closeServerMenu();
    closeViewProfile();
    currentServerId = serverId;
    try { localStorage.setItem('didiscord:lastServer', serverId == null ? 'home' : String(serverId)); } catch (_) { /* ok */ }
    currentChannel = null;
    channels = [];
    serverRoles = [];
    myServerPerms = { is_admin: false, role_ids: [] };
    renderRail();
    renderSidebarHeader();

    if (serverId == null) {
      members = [];
      renderMembers();
      renderChannels();
      if (opts.dmId) {
        const dm = dms.find((d) => d.id === opts.dmId);
        if (dm) { selectChannel(dmChannel(dm)); return; }
      }
      showHomeEmpty();
      return;
    }

    renderChannels();
    setMainEmpty('', '');
    mainEmpty.hidden = true;

    const sid = serverId;
    let chRes;
    try {
      [chRes] = await Promise.all([fetch(`/api/servers/${sid}/channels`), loadMembers(), loadRoles()]);
    } catch (_) {
      if (sid === currentServerId) setMainEmpty('sem conexão', 'Não deu pra carregar esse servidor. Confere a internet e tenta de novo.');
      return;
    }
    if (sid !== currentServerId) return;
    if (!chRes.ok) {
      removeServerLocally(sid, 'você não tem mais acesso a esse servidor');
      return;
    }
    const chData = await chRes.json();
    channels = chData.channels;
    myServerPerms = chData.me || { is_admin: false, role_ids: [] };
    renderMembers(); // agora com as cores dos cargos
    renderChannels();

    const wanted = opts.channelId || lastChannelOf(sid);
    const target = channels.find((c) => c.id === wanted && c.type === 'text') || channels.find((c) => c.type === 'text');
    if (target) {
      selectChannel(target, target.id === opts.channelId && opts.aroundId ? { aroundId: opts.aroundId } : {});
    } else if (voiceChannel && voiceChannel.server_id === sid) {
      selectChannel(channels.find((c) => c.id === voiceChannel.id) || voiceChannel);
    } else {
      setMainEmpty('nada por aqui ainda', isAdminOfCurrentServer()
        ? 'Esse servidor ainda não tem canais de texto. Crie um pelo + na lateral.'
        : 'Esse servidor ainda não tem canais de texto.');
    }
  }

  // ---------- menu do servidor (clicar no nome, no topo da lateral) ----------

  const MENU_ICONS = {
    invite: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
    settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    channel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    leave: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  };

  function openServerMenu() {
    const s = currentServer();
    if (!s) return;
    const isOwner = s.owner_id === currentUser.id;
    const items = [
      { label: 'convidar pessoas', icon: 'invite', accent: true, onClick: openInviteModal },
      isAdminOfCurrentServer() && { label: 'configurações do servidor', icon: 'settings', onClick: openServerSettings },
      isAdminOfCurrentServer() && { label: 'criar canal', icon: 'channel', onClick: () => openCreateModal('text') },
      !isOwner && { sep: true },
      !isOwner && { label: 'sair do servidor', icon: 'leave', danger: true, onClick: leaveCurrentServer },
    ].filter(Boolean);

    serverMenu.innerHTML = '';
    for (const it of items) {
      if (it.sep) {
        const sep = document.createElement('div');
        sep.className = 'server-menu-sep';
        serverMenu.appendChild(sep);
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'server-menu-item' + (it.accent ? ' is-accent' : '') + (it.danger ? ' is-danger' : '');
      b.setAttribute('role', 'menuitem');
      b.innerHTML = `<span></span>${MENU_ICONS[it.icon]}`;
      b.querySelector('span').textContent = it.label;
      b.addEventListener('click', () => { closeServerMenu(); it.onClick(); });
      serverMenu.appendChild(b);
    }
    serverMenu.hidden = false;
    serverHeaderBtn.classList.add('is-open');
    serverHeaderBtn.setAttribute('aria-expanded', 'true');
  }

  function closeServerMenu() {
    serverMenu.hidden = true;
    serverHeaderBtn.classList.remove('is-open');
    serverHeaderBtn.setAttribute('aria-expanded', 'false');
  }

  serverHeaderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (serverMenu.hidden) openServerMenu(); else closeServerMenu();
  });
  document.addEventListener('click', (e) => {
    if (!serverMenu.hidden && !serverMenu.contains(e.target)) closeServerMenu();
  });

  async function leaveCurrentServer() {
    const s = currentServer();
    if (!s) return;
    if (!confirm(`sair de "${s.name}"? pra voltar, vai precisar de um convite novo.`)) return;
    const res = await fetch(`/api/servers/${s.id}/leave`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra sair do servidor', 'error'); return; }
    removeServerLocally(s.id, `você saiu de ${s.name}`);
  }

  async function kickMember(user) {
    const s = currentServer();
    if (!s) return;
    if (!confirm(`expulsar ${user.username} de "${s.name}"? a pessoa só volta com um convite novo.`)) return;
    const res = await fetch(`/api/servers/${s.id}/members/${user.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra expulsar', 'error'); return; }
    toast(`${user.username} foi removido do servidor`);
  }

  // fecha um modal clicando fora dele ou em qualquer botão marcado com data-close
  function wireModal(backdrop, onClose) {
    const close = () => { backdrop.hidden = true; if (onClose) onClose(); };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-close]')) close();
    });
    return close;
  }

  // ---------- criar / entrar num servidor ----------

  const addServerBackdrop = document.getElementById('addServerBackdrop');
  const createServerName = document.getElementById('createServerName');
  const createServerError = document.getElementById('createServerError');
  const createServerBtn = document.getElementById('createServerBtn');
  const joinServerInput = document.getElementById('joinServerInput');
  const joinServerError = document.getElementById('joinServerError');
  const joinServerBtn = document.getElementById('joinServerBtn');
  const closeAddServer = wireModal(addServerBackdrop);

  function setAddServerStep(step) {
    addServerBackdrop.querySelectorAll('.add-server-step').forEach((el) => {
      el.hidden = el.dataset.step !== step;
    });
    createServerError.textContent = '';
    joinServerError.textContent = '';
    if (step === 'create') {
      if (!createServerName.value) createServerName.value = `servidor de ${currentUser.username}`;
      createServerName.focus();
      createServerName.select();
    } else if (step === 'join') {
      joinServerInput.focus();
    }
  }

  function openAddServerModal(step) {
    createServerName.value = '';
    joinServerInput.value = '';
    addServerBackdrop.hidden = false;
    setAddServerStep(step || 'choose');
  }

  addServerBackdrop.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) setAddServerStep(go.dataset.goto);
  });

  async function submitCreateServer() {
    const name = createServerName.value.trim();
    if (!name) { createServerError.textContent = 'dá um nome pro servidor'; return; }
    createServerBtn.disabled = true;
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { createServerError.textContent = data.error || 'não deu pra criar o servidor'; return; }
      upsertServer(data.server);
      closeAddServer();
      await selectServer(data.server.id);
      toast(`${data.server.name} criado. Use "convidar pessoas" no menu do servidor pra chamar a galera.`);
    } finally {
      createServerBtn.disabled = false;
    }
  }

  createServerBtn.addEventListener('click', submitCreateServer);
  createServerName.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCreateServer(); });

  // aceita o link inteiro (https://site/invite/CODIGO) ou só o código
  function parseInviteCode(value) {
    const v = String(value || '').trim();
    const fromLink = v.match(/invite\/([A-Za-z0-9]{4,32})/);
    if (fromLink) return fromLink[1];
    return /^[A-Za-z0-9]{4,32}$/.test(v) ? v : null;
  }

  async function acceptInvite(code) {
    const res = await fetch(`/api/invites/${encodeURIComponent(code)}/accept`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'não deu pra entrar nesse servidor' };
    upsertServer(data.server);
    await selectServer(data.server.id);
    if (!data.already_member) toast(`você entrou em ${data.server.name}`);
    return { server: data.server };
  }

  async function submitJoinServer() {
    const code = parseInviteCode(joinServerInput.value);
    if (!code) { joinServerError.textContent = 'isso não parece um link de convite'; return; }
    joinServerBtn.disabled = true;
    try {
      const result = await acceptInvite(code);
      if (result.error) { joinServerError.textContent = result.error; return; }
      closeAddServer();
    } finally {
      joinServerBtn.disabled = false;
    }
  }

  joinServerBtn.addEventListener('click', submitJoinServer);
  joinServerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitJoinServer(); });

  // ---------- convidar pessoas ----------

  const inviteBackdrop = document.getElementById('inviteBackdrop');
  const inviteServerName = document.getElementById('inviteServerName');
  const inviteLinkInput = document.getElementById('inviteLinkInput');
  const inviteCopyBtn = document.getElementById('inviteCopyBtn');
  const inviteHint = document.getElementById('inviteHint');
  const inviteExpirySelect = document.getElementById('inviteExpirySelect');
  const inviteUsesSelect = document.getElementById('inviteUsesSelect');
  wireModal(inviteBackdrop);
  let inviteRequestToken = 0;

  function describeInvite(inv) {
    const hours = Number(inviteExpirySelect.value);
    const expiry = hours === 0 ? 'Esse link nunca expira'
      : hours === 1 ? 'Esse link expira em 1 hora'
      : hours === 24 ? 'Esse link expira em 1 dia'
      : `Esse link expira em ${hours / 24} dias`;
    const uses = inv.max_uses ? ` e funciona ${inv.max_uses === 1 ? '1 vez' : `${inv.max_uses} vezes`}` : '';
    return `${expiry}${uses}.`;
  }

  async function generateInvite() {
    const s = currentServer();
    if (!s) return;
    const token = ++inviteRequestToken;
    inviteLinkInput.value = 'gerando link...';
    inviteCopyBtn.disabled = true;
    inviteHint.textContent = '';
    try {
      const res = await fetch(`/api/servers/${s.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_age_hours: Number(inviteExpirySelect.value), max_uses: Number(inviteUsesSelect.value) }),
      });
      const data = await res.json().catch(() => ({}));
      if (token !== inviteRequestToken) return;
      if (!res.ok) { inviteLinkInput.value = ''; inviteHint.textContent = data.error || 'não deu pra gerar o link'; return; }
      inviteLinkInput.value = `${window.location.origin}/invite/${data.invite.code}`;
      inviteHint.textContent = describeInvite(data.invite);
      inviteCopyBtn.disabled = false;
      inviteCopyBtn.textContent = 'copiar';
    } catch (_) {
      if (token === inviteRequestToken) inviteHint.textContent = 'sem conexão — tenta de novo';
    }
  }

  function openInviteModal() {
    const s = currentServer();
    if (!s) return;
    inviteServerName.textContent = s.name;
    inviteBackdrop.hidden = false;
    generateInvite();
  }

  inviteExpirySelect.addEventListener('change', generateInvite);
  inviteUsesSelect.addEventListener('change', generateInvite);
  inviteLinkInput.addEventListener('focus', () => inviteLinkInput.select());

  inviteCopyBtn.addEventListener('click', async () => {
    const link = inviteLinkInput.value;
    let copied = false;
    try { await navigator.clipboard.writeText(link); copied = true; } catch (_) {
      inviteLinkInput.select();
      try { copied = document.execCommand('copy'); } catch (__) { copied = false; }
    }
    inviteCopyBtn.textContent = copied ? 'copiado' : 'copie manualmente';
    setTimeout(() => { inviteCopyBtn.textContent = 'copiar'; }, 1800);
  });

  // ---------- configurações do servidor (só dono) ----------

  const serverSettingsBackdrop = document.getElementById('serverSettingsBackdrop');
  const serverSettingsIcon = document.getElementById('serverSettingsIcon');
  const serverSettingsIconBtn = document.getElementById('serverSettingsIconBtn');
  const serverSettingsIconRemoveBtn = document.getElementById('serverSettingsIconRemoveBtn');
  const serverSettingsIconInput = document.getElementById('serverSettingsIconInput');
  const serverSettingsNameInput = document.getElementById('serverSettingsNameInput');
  const serverSettingsError = document.getElementById('serverSettingsError');
  const serverSettingsSaveBtn = document.getElementById('serverSettingsSaveBtn');
  const serverSettingsDeleteBtn = document.getElementById('serverSettingsDeleteBtn');
  const closeServerSettings = wireModal(serverSettingsBackdrop);

  function refreshServerSettingsIcon() {
    const s = currentServer();
    if (!s) return;
    serverSettingsIcon.innerHTML = serverIconInner(s);
    serverSettingsIconRemoveBtn.hidden = !s.icon_url;
  }

  function openServerSettings() {
    const s = currentServer();
    if (!s || !isAdminOfCurrentServer()) return;
    serverSettingsNameInput.value = s.name;
    serverSettingsError.textContent = '';
    serverSettingsError.classList.remove('is-success');
    refreshServerSettingsIcon();
    serverDangerZone.hidden = s.owner_id !== currentUser.id;
    renderRolesList();
    loadRoles().then(renderRolesList);
    serverSettingsBackdrop.hidden = false;
  }

  serverSettingsIcon.addEventListener('click', () => serverSettingsIconInput.click());
  serverSettingsIconBtn.addEventListener('click', () => serverSettingsIconInput.click());

  serverSettingsIconInput.addEventListener('change', async () => {
    const s = currentServer();
    const file = serverSettingsIconInput.files[0];
    if (!s || !file) return;
    const formData = new FormData();
    formData.append('icon', file);
    serverSettingsIconBtn.disabled = true;
    try {
      const res = await fetch(`/api/servers/${s.id}/icon`, { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { serverSettingsError.textContent = data.error || 'não deu pra trocar o ícone'; return; }
      upsertServer(data.server);
      refreshServerSettingsIcon();
    } finally {
      serverSettingsIconBtn.disabled = false;
      serverSettingsIconInput.value = '';
    }
  });

  serverSettingsIconRemoveBtn.addEventListener('click', async () => {
    const s = currentServer();
    if (!s) return;
    const res = await fetch(`/api/servers/${s.id}/icon`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { serverSettingsError.textContent = data.error || 'não deu pra remover o ícone'; return; }
    upsertServer(data.server);
    refreshServerSettingsIcon();
  });

  serverSettingsSaveBtn.addEventListener('click', async () => {
    const s = currentServer();
    if (!s) return;
    serverSettingsError.classList.remove('is-success');
    const name = serverSettingsNameInput.value.trim();
    if (!name) { serverSettingsError.textContent = 'dá um nome pro servidor'; return; }
    serverSettingsSaveBtn.disabled = true;
    try {
      const res = await fetch(`/api/servers/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { serverSettingsError.textContent = data.error || 'não deu pra salvar'; return; }
      upsertServer(data.server);
      serverSettingsError.textContent = 'salvo';
      serverSettingsError.classList.add('is-success');
    } finally {
      serverSettingsSaveBtn.disabled = false;
    }
  });

  serverSettingsDeleteBtn.addEventListener('click', async () => {
    const s = currentServer();
    if (!s) return;
    const typed = prompt(`pra apagar "${s.name}" de vez, digite o nome do servidor:`);
    if (typed == null) return;
    if (typed.trim() !== s.name) { serverSettingsError.textContent = 'o nome não bate — nada foi apagado'; return; }
    const res = await fetch(`/api/servers/${s.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { serverSettingsError.textContent = data.error || 'não deu pra apagar'; return; }
    closeServerSettings();
    removeServerLocally(s.id, `${s.name} foi apagado`);
  });

  // ---------- aceitar convite vindo do link (/invite/CODIGO -> /app.html?invite=CODIGO) ----------

  const joinInviteBackdrop = document.getElementById('joinInviteBackdrop');
  const joinInviteIcon = document.getElementById('joinInviteIcon');
  const joinInviteLead = document.getElementById('joinInviteLead');
  const joinInviteName = document.getElementById('joinInviteName');
  const joinInviteCounts = document.getElementById('joinInviteCounts');
  const joinInviteError = document.getElementById('joinInviteError');
  const joinInviteAcceptBtn = document.getElementById('joinInviteAcceptBtn');
  const closeJoinInvite = wireModal(joinInviteBackdrop);
  let pendingInviteCode = null;

  async function handleInviteFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const code = parseInviteCode(params.get('invite'));
    if (!params.has('invite')) return;
    // tira o ?invite= da barra de endereço — recarregar a página não deve reabrir o convite
    window.history.replaceState(null, '', window.location.pathname);
    if (!code) return;

    pendingInviteCode = code;
    joinInviteError.textContent = '';
    joinInviteAcceptBtn.disabled = true;
    joinInviteAcceptBtn.hidden = false;
    joinInviteIcon.innerHTML = '';
    joinInviteLead.textContent = 'carregando convite...';
    joinInviteName.textContent = '';
    joinInviteCounts.innerHTML = '';
    joinInviteBackdrop.hidden = false;

    let invite = null;
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(code)}`);
      if (res.ok) invite = (await res.json()).invite;
    } catch (_) { /* tratado abaixo */ }

    if (!invite) {
      joinInviteLead.textContent = 'esse convite não funciona mais';
      joinInviteName.textContent = 'convite inválido';
      joinInviteError.textContent = 'Ele pode ter expirado ou sido apagado. Peça um link novo pra quem te convidou.';
      joinInviteAcceptBtn.hidden = true;
      return;
    }

    joinInviteIcon.innerHTML = serverIconInner({ name: invite.server.name, icon_url: invite.server.icon_url });
    joinInviteLead.textContent = invite.inviter ? `${invite.inviter} te convidou pra entrar em` : 'você foi convidado pra entrar em';
    joinInviteName.textContent = invite.server.name;
    joinInviteCounts.innerHTML = `
      <span><i class="dot is-online"></i>${invite.server.online_count} online</span>
      <span><i class="dot"></i>${invite.server.member_count} ${invite.server.member_count === 1 ? 'membro' : 'membros'}</span>
    `;

    if (invite.already_member) {
      joinInviteAcceptBtn.textContent = 'abrir servidor';
      joinInviteAcceptBtn.disabled = false;
    } else if (!invite.usable) {
      joinInviteError.textContent = `${invite.problem}. Peça um link novo pra quem te convidou.`;
      joinInviteAcceptBtn.hidden = true;
    } else {
      joinInviteAcceptBtn.textContent = 'entrar no servidor';
      joinInviteAcceptBtn.disabled = false;
    }
  }

  joinInviteAcceptBtn.addEventListener('click', async () => {
    if (!pendingInviteCode) return;
    joinInviteAcceptBtn.disabled = true;
    const result = await acceptInvite(pendingInviteCode);
    if (result.error) {
      joinInviteError.textContent = result.error;
      joinInviteAcceptBtn.disabled = false;
      return;
    }
    pendingInviteCode = null;
    closeJoinInvite();
  });

  // ---------- mensagens diretas ----------

  const newDmBackdrop = document.getElementById('newDmBackdrop');
  const newDmSearch = document.getElementById('newDmSearch');
  const newDmList = document.getElementById('newDmList');
  wireModal(newDmBackdrop);
  let contacts = [];

  function sortDms() {
    const key = (d) => d.last_message_at || d.created_at || '';
    dms.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  }

  function upsertDm(dm) {
    if (!dm || !dm.user) return;
    rememberUser(dm.user);
    const i = dms.findIndex((d) => d.id === dm.id);
    if (i >= 0) dms[i] = { ...dms[i], ...dm };
    else dms.push(dm);
    sortDms();
    if (currentServerId == null) renderChannels();
    renderRail();
  }

  async function loadDms() {
    try {
      const res = await fetch('/api/dms');
      if (!res.ok) return;
      dms = (await res.json()).dms;
      dms.forEach((d) => rememberUser(d.user));
      sortDms();
    } catch (_) { /* fica com a lista anterior */ }
  }

  async function openDm(userId) {
    if (currentUser && userId === currentUser.id) return;
    const res = await fetch('/api/dms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra abrir a conversa', 'error'); return; }
    upsertDm(data.dm);
    if (currentServerId != null) await selectServer(null, { dmId: data.dm.id });
    else selectChannel(dmChannel(data.dm));
  }

  function renderContacts() {
    const q = newDmSearch.value.trim().toLowerCase();
    const list = contacts.filter((u) => !q || u.username.toLowerCase().includes(q));
    newDmList.innerHTML = '';
    if (contacts.length === 0) {
      newDmList.innerHTML = '<p class="new-dm-empty">Quando você estiver num servidor com outras pessoas, elas aparecem aqui.</p>';
      return;
    }
    if (list.length === 0) {
      newDmList.innerHTML = '<p class="new-dm-empty">Ninguém com esse nome.</p>';
      return;
    }
    for (const u of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'new-dm-row';
      b.innerHTML = `
        <span class="dm-item-avatar">${memberAvatarInner(u)}<span class="presence-dot${u.online ? ' is-online' : ''}"></span></span>
        <span class="dm-item-text"><span class="dm-item-name"></span><span class="dm-item-status"></span></span>
      `;
      b.querySelector('.dm-item-name').textContent = u.username;
      b.querySelector('.dm-item-status').textContent = u.status_text || (u.online ? 'online' : 'offline');
      b.addEventListener('click', () => { newDmBackdrop.hidden = true; openDm(u.id); });
      newDmList.appendChild(b);
    }
  }

  async function openNewDmModal() {
    newDmSearch.value = '';
    newDmList.innerHTML = '<p class="new-dm-empty">carregando...</p>';
    newDmBackdrop.hidden = false;
    newDmSearch.focus();
    try {
      const res = await fetch('/api/users/contacts');
      contacts = res.ok ? (await res.json()).users.map(rememberUser) : [];
    } catch (_) { contacts = []; }
    renderContacts();
  }

  newDmSearch.addEventListener('input', renderContacts);

  const LOCK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const GEAR_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  // ===================================================================
  // cargos e permissões
  // ===================================================================

  function isAdminOfCurrentServer() {
    const s = currentServer();
    if (!s || !currentUser) return false;
    return s.owner_id === currentUser.id || !!s.is_admin || !!myServerPerms.is_admin;
  }

  function roleById(id) {
    return serverRoles.find((r) => r.id === id) || null;
  }

  // cargos de um membro, do mais alto pro mais baixo
  function memberRoles(member) {
    return ((member && member.role_ids) || []).map(roleById).filter(Boolean).sort((a, b) => b.position - a.position);
  }

  function memberIsAdmin(userId) {
    return memberRoles(members.find((m) => m.id === userId)).some((r) => r.is_admin);
  }

  // cor do nome (lista de membros e chat) = cor do cargo mais alto "mostrado separado" da pessoa;
  // quem não tem nenhum desses fica com a cor do cargo mais alto que tem cor
  function memberColor(member) {
    const roles = memberRoles(member);
    const r = roles.find((x) => x.hoist && x.color) || roles.find((x) => x.color);
    return r ? r.color : null;
  }

  // pinta o nome de quem escreveu cada mensagem com a cor do cargo. Chamado ao montar a mensagem e
  // de novo quando membros/cargos chegam ou mudam (as mensagens podem aparecer antes deles)
  function applyAuthorColors(root) {
    const inServer = currentServerId != null && !(currentChannel && currentChannel.dm);
    (root || document).querySelectorAll('.msg-author[data-user-id]').forEach((el) => {
      const id = Number(el.dataset.userId);
      const color = inServer ? memberColor(members.find((m) => m.id === id)) : null;
      el.style.color = color || '';
    });
  }

  // mesma regra do servidor (routes/servers.js, canModerate): ninguém mexe no dono, e só o dono
  // mexe em outro administrador
  function canModerateMember(userId) {
    const s = currentServer();
    if (!s || !currentUser || userId === currentUser.id || userId === BOT_USER_ID) return false;
    if (!isAdminOfCurrentServer() || userId === s.owner_id) return false;
    if (s.owner_id === currentUser.id) return true;
    return !memberIsAdmin(userId);
  }

  async function loadRoles() {
    const sid = currentServerId;
    if (sid == null) { serverRoles = []; return; }
    try {
      const res = await fetch(`/api/servers/${sid}/roles`);
      if (res.ok && sid === currentServerId) serverRoles = (await res.json()).roles;
    } catch (_) { /* fica com a lista anterior */ }
  }

  async function loadChannelsForCurrent() {
    const sid = currentServerId;
    if (sid == null) return;
    try {
      const res = await fetch(`/api/servers/${sid}/channels`);
      if (!res.ok || sid !== currentServerId) return;
      const data = await res.json();
      channels = data.channels;
      myServerPerms = data.me || { is_admin: false, role_ids: [] };
    } catch (_) { /* fica com a lista anterior */ }
  }

  // cargos ou permissões de canal mudaram: recarrega o que eu vejo desse servidor
  async function refreshServerData(serverId) {
    await loadServers(); // "sou admin?" de cada servidor pode ter mudado
    if (serverId !== currentServerId) return;
    await Promise.all([loadChannelsForCurrent(), loadMembers(), loadRoles()]);
    if (serverId !== currentServerId) return;
    renderMembers(); // os cargos podem ter chegado depois dos membros: refaz grupos e cores (lista e chat)

    if (currentChannel && !currentChannel.dm) {
      const fresh = channels.find((c) => c.id === currentChannel.id);
      if (!fresh) {
        // perdi acesso ao canal que estava aberto
        currentChannel = null;
        const fallback = channels.find((c) => c.type === 'text');
        if (fallback) selectChannel(fallback);
        else setMainEmpty('você não tem mais acesso a esse canal', 'Escolha outro canal na lateral.');
      } else {
        Object.assign(currentChannel, fresh);
      }
    }
    if (voiceChannel) {
      const fresh = channels.find((c) => c.id === voiceChannel.id);
      if (fresh) Object.assign(voiceChannel, fresh);
    }
    renderChannels();
    renderSidebarHeader();
    renderMembers();
    if (!serverSettingsBackdrop.hidden) {
      if (isAdminOfCurrentServer()) renderRolesList();
      else serverSettingsBackdrop.hidden = true;
    }
  }

  // ---------- cargos no cartão de perfil ----------

  async function setMemberRoles(user, roleIds, anchorEl) {
    const s = currentServer();
    if (!s) return;
    const res = await fetch(`/api/servers/${s.id}/members/${user.id}/roles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_ids: roleIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra mudar os cargos', 'error'); return; }
    const member = members.find((m) => m.id === user.id);
    if (member) member.role_ids = data.role_ids;
    renderMembers();
    if (!viewProfileBackdrop.hidden) showProfilePopout(findUser(user.id) || user, user.mutual_servers || null, anchorEl);
  }

  // seção "cargos" do cartão: etiquetas com a cor de cada cargo; quem pode, tira (×) e põe (+)
  function fillProfileRoles(wrap, cfg) {
    const list = wrap.querySelector('.pc-roles');
    list.innerHTML = '';
    if (!cfg.roles.length && !cfg.editable) return; // sem cargos e sem poder dar: some
    wrap.hidden = false;

    const currentIds = cfg.roles.map((r) => r.id);
    const canTouch = (role) => cfg.editable && (!role.is_admin || cfg.amOwner);

    for (const role of cfg.roles) {
      const chip = document.createElement('span');
      chip.className = 'pc-role';
      chip.style.setProperty('--role-color', role.color || 'var(--text-faint)');
      chip.innerHTML = '<i class="pc-role-dot"></i><span class="pc-role-name"></span>';
      chip.querySelector('.pc-role-name').textContent = role.name;
      if (role.is_admin) chip.title = 'administrador';
      if (canTouch(role)) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'pc-role-remove';
        x.setAttribute('aria-label', `tirar o cargo ${role.name}`);
        x.textContent = '×';
        x.addEventListener('click', () => cfg.onChange(currentIds.filter((id) => id !== role.id)));
        chip.appendChild(x);
      }
      list.appendChild(chip);
    }

    const addable = cfg.editable ? cfg.available.filter((r) => !currentIds.includes(r.id) && canTouch(r)) : [];
    if (addable.length) {
      const addWrap = document.createElement('span');
      addWrap.className = 'pc-role-add-wrap';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'pc-role-add';
      add.title = 'dar um cargo';
      add.setAttribute('aria-label', 'dar um cargo');
      add.textContent = '+';
      const menu = document.createElement('div');
      menu.className = 'pc-role-menu';
      menu.hidden = true;
      for (const r of addable) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'pc-role-menu-item';
        item.style.setProperty('--role-color', r.color || 'var(--text-faint)');
        item.innerHTML = '<i class="pc-role-dot"></i><span></span>';
        item.querySelector('span').textContent = r.name + (r.is_admin ? ' (admin)' : '');
        item.addEventListener('click', () => cfg.onChange([...currentIds, r.id]));
        menu.appendChild(item);
      }
      add.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
      addWrap.append(add, menu);
      list.appendChild(addWrap);
    } else if (!cfg.roles.length) {
      const none = document.createElement('span');
      none.className = 'pc-roles-empty';
      none.textContent = serverRoles.length ? 'sem cargos' : 'crie cargos nas configurações do servidor';
      list.appendChild(none);
    }
  }

  // ---------- lista de cargos (configurações do servidor) ----------

  const rolesList = document.getElementById('rolesList');
  const roleCreateBtn = document.getElementById('roleCreateBtn');
  const serverDangerZone = document.getElementById('serverDangerZone');

  async function roleRequest(method, path, body) {
    const s = currentServer();
    if (!s) return null;
    const res = await fetch(`/api/servers/${s.id}/roles${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra salvar o cargo', 'error'); return null; }
    return data;
  }

  function renderRolesList() {
    const s = currentServer();
    const amOwner = !!(s && currentUser && s.owner_id === currentUser.id);
    rolesList.innerHTML = '';
    if (!serverRoles.length) {
      rolesList.innerHTML = '<p class="roles-empty">Nenhum cargo ainda. Crie um pra separar quem vê ou entra em cada canal.</p>';
      return;
    }
    for (const role of serverRoles) {
      const row = document.createElement('div');
      row.className = 'role-row';
      row.innerHTML = `
        <input type="color" class="role-color" title="cor do cargo" aria-label="cor do cargo">
        <input type="text" class="role-name" maxlength="32" aria-label="nome do cargo">
        <label class="role-hoist" title="mostrar quem tem esse cargo num grupo separado na lista de membros (com o nome do cargo em cima)">
          <input type="checkbox"> <span>separado</span>
        </label>
        <label class="role-admin" title="${amOwner ? 'administradores gerenciam o servidor, canais, cargos e calls' : 'só o dono muda quem é administrador'}">
          <input type="checkbox"> <span>admin</span>
        </label>
        <span class="role-move">
          <button type="button" class="role-up" title="subir o cargo" aria-label="subir o cargo">▲</button>
          <button type="button" class="role-down" title="descer o cargo" aria-label="descer o cargo">▼</button>
        </span>
        <button type="button" class="role-delete" title="apagar cargo" aria-label="apagar cargo">${TRASH_ICON}</button>
      `;
      // ordem dos cargos: o de cima vale mais (cor do nome, grupo na lista de membros). Trocar de
      // lugar regrava as posições de cima pra baixo, o que também desempata cargos antigos.
      const index = serverRoles.indexOf(role);
      const moveBy = async (delta) => {
        const order = serverRoles.slice();
        const target = index + delta;
        if (target < 0 || target >= order.length) return;
        [order[index], order[target]] = [order[target], order[index]];
        rolesList.querySelectorAll('.role-move button').forEach((b) => { b.disabled = true; });
        for (let k = 0; k < order.length; k++) {
          const position = order.length - k;
          if (order[k].position !== position) await roleRequest('PATCH', `/${order[k].id}`, { position });
        }
        await loadRoles();
        renderRolesList();
        renderMembers();
      };
      const up = row.querySelector('.role-up');
      const down = row.querySelector('.role-down');
      up.disabled = index === 0;
      down.disabled = index === serverRoles.length - 1;
      up.addEventListener('click', () => moveBy(-1));
      down.addEventListener('click', () => moveBy(1));
      const color = row.querySelector('.role-color');
      const name = row.querySelector('.role-name');
      const admin = row.querySelector('.role-admin input');
      const hoist = row.querySelector('.role-hoist input');
      hoist.checked = !!role.hoist;
      hoist.addEventListener('change', async () => {
        const ok = await roleRequest('PATCH', `/${role.id}`, { hoist: hoist.checked });
        if (!ok) hoist.checked = !!role.hoist;
      });
      const del = row.querySelector('.role-delete');
      color.value = role.color || '#9D5CE8';
      name.value = role.name;
      admin.checked = role.is_admin;
      admin.disabled = !amOwner;
      del.disabled = role.is_admin && !amOwner;

      color.addEventListener('change', () => roleRequest('PATCH', `/${role.id}`, { color: color.value }));
      name.addEventListener('change', async () => {
        const ok = await roleRequest('PATCH', `/${role.id}`, { name: name.value });
        if (!ok) name.value = role.name;
      });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
      admin.addEventListener('change', async () => {
        const ok = await roleRequest('PATCH', `/${role.id}`, { is_admin: admin.checked });
        if (!ok) admin.checked = role.is_admin;
      });
      del.addEventListener('click', async () => {
        if (!confirm(`apagar o cargo "${role.name}"? quem tem esse cargo perde ele.`)) return;
        await roleRequest('DELETE', `/${role.id}`);
      });
      rolesList.appendChild(row);
    }
  }

  roleCreateBtn.addEventListener('click', async () => {
    const color = ACCENT_COLORS[serverRoles.length % ACCENT_COLORS.length];
    const data = await roleRequest('POST', '', { name: 'novo cargo', color });
    if (!data) return;
    await loadRoles();
    renderRolesList();
    const input = rolesList.querySelector('.role-row:first-child .role-name');
    if (input) { input.focus(); input.select(); }
  });

  // ---------- editar canal (nome, privado, quem entra na call) ----------

  const channelEditBackdrop = document.getElementById('channelEditBackdrop');
  const channelEditName = document.getElementById('channelEditName');
  const channelEditPrivateView = document.getElementById('channelEditPrivateView');
  const channelEditViewRoles = document.getElementById('channelEditViewRoles');
  const channelEditConnectBlock = document.getElementById('channelEditConnectBlock');
  const channelEditPrivateConnect = document.getElementById('channelEditPrivateConnect');
  const channelEditConnectRoles = document.getElementById('channelEditConnectRoles');
  const channelEditError = document.getElementById('channelEditError');
  const channelEditSaveBtn = document.getElementById('channelEditSaveBtn');
  const closeChannelEdit = wireModal(channelEditBackdrop);
  let editingChannel = null;

  function fillRoleChecks(container, checkedIds, enabled) {
    container.innerHTML = '';
    container.classList.toggle('is-disabled', !enabled);
    if (!serverRoles.length) {
      container.innerHTML = '<p class="perm-roles-empty">Crie cargos nas configurações do servidor pra poder escolher.</p>';
      return;
    }
    for (const role of serverRoles) {
      const label = document.createElement('label');
      label.className = 'perm-role';
      label.style.setProperty('--role-color', role.color || 'var(--text-faint)');
      label.innerHTML = '<input type="checkbox"><i class="pc-role-dot"></i><span></span>';
      const box = label.querySelector('input');
      box.value = String(role.id);
      // admin sempre tem acesso — aparece marcado e travado, só pra deixar isso claro
      box.checked = role.is_admin || checkedIds.includes(role.id);
      box.disabled = !enabled || role.is_admin;
      label.querySelector('span').textContent = role.name + (role.is_admin ? ' (admin)' : '');
      container.appendChild(label);
    }
  }

  function checkedRoleIds(container) {
    return [...container.querySelectorAll('input:checked:not(:disabled)')].map((b) => Number(b.value));
  }

  function openChannelEdit(ch) {
    if (!isAdminOfCurrentServer()) return;
    editingChannel = ch;
    channelEditName.value = ch.name;
    channelEditError.textContent = '';
    channelEditPrivateView.checked = !!ch.private_view;
    fillRoleChecks(channelEditViewRoles, ch.view_role_ids || [], !!ch.private_view);
    channelEditConnectBlock.hidden = ch.type !== 'voice';
    channelEditPrivateConnect.checked = !!ch.private_connect;
    fillRoleChecks(channelEditConnectRoles, ch.connect_role_ids || [], !!ch.private_connect);
    channelEditBackdrop.hidden = false;
    channelEditName.focus();
  }

  channelEditPrivateView.addEventListener('change', () => {
    fillRoleChecks(channelEditViewRoles, checkedRoleIds(channelEditViewRoles), channelEditPrivateView.checked);
  });
  channelEditPrivateConnect.addEventListener('change', () => {
    fillRoleChecks(channelEditConnectRoles, checkedRoleIds(channelEditConnectRoles), channelEditPrivateConnect.checked);
  });

  channelEditSaveBtn.addEventListener('click', async () => {
    if (!editingChannel) return;
    const ch = editingChannel;
    const body = {
      name: channelEditName.value,
      private_view: channelEditPrivateView.checked,
      view_role_ids: checkedRoleIds(channelEditViewRoles),
    };
    if (ch.type === 'voice') {
      body.private_connect = channelEditPrivateConnect.checked;
      body.connect_role_ids = checkedRoleIds(channelEditConnectRoles);
    }
    channelEditSaveBtn.disabled = true;
    try {
      const res = await fetch(`/api/channels/${ch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { channelEditError.textContent = data.error || 'não deu pra salvar'; return; }
      closeChannelEdit();
      // a lista recarrega sozinha pelo evento channels_updated
    } finally {
      channelEditSaveBtn.disabled = false;
    }
  });

  // ---------- moderação de voz: desconectar e mover ----------

  async function voiceModeration(userId, action, body) {
    const s = currentServer();
    if (!s) return false;
    const res = await fetch(`/api/servers/${s.id}/voice/${userId}/${action}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'não deu pra fazer isso', 'error'); return false; }
    return true;
  }

  function moveMemberToChannel(userId, channelId) {
    return voiceModeration(userId, 'move', { channel_id: channelId });
  }

  async function disconnectMember(userId, username) {
    if (await voiceModeration(userId, 'disconnect')) toast(`${username} foi desconectado da call`);
  }

  // itens de administrador no menu de clique direito de quem está numa call deste servidor
  function appendVoiceModerationItems(menu, userId) {
    if (!canModerateMember(userId)) return;
    const chId = findParticipantChannel(userId);
    const ch = chId != null ? channels.find((c) => c.id === chId) : null;
    if (!ch) return; // não está numa call deste servidor

    const section = document.createElement('div');
    section.className = 'participant-context-menu-admin';
    section.innerHTML = '<div class="participant-context-menu-subtitle">moderação</div>';
    const addItem = (label, onClick, danger) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'participant-context-menu-item' + (danger ? ' is-danger' : '');
      b.textContent = label;
      b.addEventListener('click', () => { closeParticipantContextMenu(); onClick(); });
      section.appendChild(b);
    };
    if (voiceChannel && voiceChannel.server_id === currentServerId && voiceChannel.id !== ch.id) {
      addItem('puxar pra minha call', () => moveMemberToChannel(userId, voiceChannel.id));
    }
    for (const other of channels) {
      if (other.type !== 'voice' || other.id === ch.id) continue;
      if (voiceChannel && other.id === voiceChannel.id) continue; // já tem "puxar pra minha call"
      addItem(`mover para ${other.name}`, () => moveMemberToChannel(userId, other.id));
    }
    addItem('desconectar da call', () => {
      const u = findUser(userId);
      disconnectMember(userId, u ? u.username : 'a pessoa');
    }, true);
    menu.appendChild(section);
  }

  // arrastar alguém da lista de quem está em call e soltar em outro canal de voz (administradores)
  const DRAG_MIME = 'application/x-didiscord-user';

  function makeVoiceRowDraggable(row, userId) {
    if (!canModerateMember(userId)) return;
    row.draggable = true;
    row.classList.add('is-draggable');
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData(DRAG_MIME, String(userId));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
      channelGroups.classList.add('is-dragging-user');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      channelGroups.classList.remove('is-dragging-user');
    });
  }

  function makeVoiceChannelDropTarget(el, ch) {
    if (ch.type !== 'voice' || !isAdminOfCurrentServer()) return;
    el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('is-drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('is-drop-target');
      const userId = Number(e.dataTransfer.getData(DRAG_MIME));
      if (!userId) return;
      e.preventDefault();
      if (findParticipantChannel(userId) === ch.id) return;
      moveMemberToChannel(userId, ch.id);
    });
  }

  // ===================================================================
  // visualizador de imagens e vídeos
  // ===================================================================

  const mediaViewer = document.getElementById('mediaViewer');
  const mediaViewerStage = document.getElementById('mediaViewerStage');
  const mediaViewerAvatar = document.getElementById('mediaViewerAvatar');
  const mediaViewerName = document.getElementById('mediaViewerName');
  const mediaViewerDate = document.getElementById('mediaViewerDate');
  const mediaViewerCount = document.getElementById('mediaViewerCount');
  const mediaViewerZoom = document.getElementById('mediaViewerZoom');
  const mediaViewerZoomReset = document.getElementById('mediaViewerZoomReset');
  const mediaViewerOpen = document.getElementById('mediaViewerOpen');
  const mediaViewerDownload = document.getElementById('mediaViewerDownload');
  const mediaViewerPrev = document.getElementById('mediaViewerPrev');
  const mediaViewerNext = document.getElementById('mediaViewerNext');
  const mediaViewerCaption = document.getElementById('mediaViewerCaption');

  const VIEWER_MAX_ZOOM = 8;
  let viewerItems = [];
  let viewerIndex = 0;
  let viewerImg = null;
  let viewerZoom = 1;
  let viewerPan = { x: 0, y: 0 };
  let viewerDrag = null;

  function isViewableMedia(m) {
    return !!m.attachment_url && m.attachment_type !== 'file';
  }

  function viewerFileName(m) {
    if (m.attachment_name) return m.attachment_name;
    const last = String(m.attachment_url).split('?')[0].split('/').pop();
    return last || 'arquivo';
  }

  let viewerStartAt = 0;
  let viewerRotation = 0;
  const mediaViewerStrip = document.getElementById('mediaViewerStrip');
  const mediaViewerBackdrop = document.getElementById('mediaViewerBackdrop');
  const mediaViewerRotate = document.getElementById('mediaViewerRotate');
  const mediaViewerCopy = document.getElementById('mediaViewerCopy');

  function openMediaViewer(m, opts = {}) {
    viewerItems = currentMessages.filter(isViewableMedia);
    viewerIndex = viewerItems.findIndex((x) => x.id === m.id);
    if (viewerIndex < 0) { viewerItems = [m]; viewerIndex = 0; }
    viewerStartAt = opts.startAt || 0;
    mediaViewer.hidden = false;
    document.body.classList.add('is-viewing-media');
    renderViewerStrip();
    showViewerItem();
  }

  // miniaturas de todas as imagens/vídeos do canal, embaixo — clica pra pular
  function renderViewerStrip() {
    mediaViewerStrip.innerHTML = '';
    mediaViewerStrip.hidden = viewerItems.length < 2;
    if (viewerItems.length < 2) return;
    viewerItems.forEach((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'media-viewer-thumb' + (item.attachment_type === 'video' ? ' is-video' : '');
      b.setAttribute('aria-label', `mídia ${i + 1}`);
      if (item.attachment_type === 'video') {
        const v = document.createElement('video');
        v.src = `${item.attachment_url}#t=0.5`; v.preload = 'metadata'; v.muted = true;
        b.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.src = item.attachment_url; img.alt = ''; img.loading = 'lazy';
        b.appendChild(img);
      }
      b.addEventListener('click', () => { viewerIndex = i; viewerStartAt = 0; showViewerItem(); });
      mediaViewerStrip.appendChild(b);
    });
  }

  function syncViewerStrip() {
    mediaViewerStrip.querySelectorAll('.media-viewer-thumb').forEach((b, i) => {
      b.classList.toggle('is-active', i === viewerIndex);
      // centraliza a miniatura atual só rolando a faixa (scrollIntoView rolaria o visualizador inteiro)
      if (i === viewerIndex) mediaViewerStrip.scrollTo({ left: b.offsetLeft - (mediaViewerStrip.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    });
  }

  mediaViewerRotate.addEventListener('click', () => { viewerRotation = (viewerRotation + 90) % 360; applyViewerTransform(); });
  mediaViewerCopy.addEventListener('click', async () => {
    const m = viewerItems[viewerIndex];
    if (!m) return;
    try {
      const blob = await fetch(m.attachment_url).then((r) => r.blob());
      let png = blob;
      if (blob.type !== 'image/png') {
        const bmp = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        canvas.getContext('2d').drawImage(bmp, 0, 0);
        png = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast('imagem copiada');
    } catch (_) {
      toast('não deu pra copiar essa imagem', 'error');
    }
  });

  function closeMediaViewer() {
    if (mediaViewer.hidden) return;
    const video = mediaViewerStage.querySelector('video');
    if (video) video.pause();
    mediaViewerStrip.innerHTML = '';
    mediaViewerStage.innerHTML = '';
    viewerImg = null;
    mediaViewer.hidden = true;
    document.body.classList.remove('is-viewing-media');
  }

  function showViewerItem() {
    const m = viewerItems[viewerIndex];
    if (!m) { closeMediaViewer(); return; }
    const old = mediaViewerStage.querySelector('video');
    if (old) old.pause();
    mediaViewerStage.innerHTML = '';
    viewerImg = null;
    viewerZoom = 1;
    viewerPan = { x: 0, y: 0 };

    const author = m.bot_name
      ? { username: m.bot_name, avatar_url: null }
      : (findUser(m.user_id) || { username: m.username || 'alguém', avatar_url: m.avatar_url });
    mediaViewerAvatar.innerHTML = memberAvatarInner(author);
    mediaViewerName.textContent = author.username;
    const when = new Date(String(m.created_at).replace(' ', 'T') + (String(m.created_at).includes('Z') ? '' : 'Z'));
    mediaViewerDate.textContent = Number.isNaN(when.getTime())
      ? ''
      : when.toLocaleString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    mediaViewerCount.textContent = viewerItems.length > 1 ? `${viewerIndex + 1} de ${viewerItems.length}` : '';
    mediaViewerPrev.hidden = viewerIndex <= 0;
    mediaViewerNext.hidden = viewerIndex >= viewerItems.length - 1;
    mediaViewerOpen.href = m.attachment_url;
    mediaViewerDownload.href = m.attachment_url;
    mediaViewerDownload.setAttribute('download', viewerFileName(m));
    mediaViewerCaption.textContent = '';
    if (m.content) mediaViewerCaption.appendChild(DidiMarkdown.render(m.content, mentionContext(m)));
    mediaViewerCaption.hidden = !m.content;
    viewerRotation = 0;
    const isVideo = m.attachment_type === 'video';
    mediaViewerRotate.hidden = isVideo;
    mediaViewerCopy.hidden = isVideo || typeof ClipboardItem === 'undefined';
    mediaViewerBackdrop.style.backgroundImage = isVideo ? 'none' : `url("${String(m.attachment_url).replace(/"/g, '%22')}")`;
    syncViewerStrip();

    if (isVideo) {
      mediaViewerZoom.hidden = true;
      const player = createVideoPlayer(m.attachment_url, { large: true, autoplay: true, startAt: viewerStartAt });
      player.classList.add('media-viewer-video');
      mediaViewerStage.appendChild(player);
      player.video.play().catch(() => { /* sem autoplay: a pessoa aperta o play */ });
      viewerStartAt = 0;
    } else {
      mediaViewerZoom.hidden = false;
      const img = document.createElement('img');
      img.className = 'media-viewer-img';
      img.src = m.attachment_url;
      img.alt = viewerFileName(m);
      img.draggable = false;
      mediaViewerStage.appendChild(img);
      viewerImg = img;
      applyViewerTransform();
    }
  }

  function applyViewerTransform() {
    mediaViewerZoomReset.textContent = `${Math.round(viewerZoom * 100)}%`;
    mediaViewerStage.classList.toggle('is-zoomed', viewerZoom > 1);
    if (viewerImg) viewerImg.style.transform = `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom}) rotate(${viewerRotation}deg)`;
  }

  // não deixa a imagem ampliada "fugir" da tela: o arrasto para na borda
  function clampViewerPan() {
    if (!viewerImg) return;
    const stage = mediaViewerStage.getBoundingClientRect();
    const maxX = Math.max(0, (viewerImg.offsetWidth * viewerZoom - stage.width) / 2);
    const maxY = Math.max(0, (viewerImg.offsetHeight * viewerZoom - stage.height) / 2);
    viewerPan.x = Math.max(-maxX, Math.min(maxX, viewerPan.x));
    viewerPan.y = Math.max(-maxY, Math.min(maxY, viewerPan.y));
  }

  // zoom mantendo parado o ponto embaixo do cursor (cx, cy relativos ao centro da área)
  function setViewerZoom(z, cx = 0, cy = 0) {
    if (!viewerImg) return;
    const next = Math.max(1, Math.min(VIEWER_MAX_ZOOM, z));
    viewerPan.x = cx - (cx - viewerPan.x) * (next / viewerZoom);
    viewerPan.y = cy - (cy - viewerPan.y) * (next / viewerZoom);
    viewerZoom = next;
    if (viewerZoom === 1) viewerPan = { x: 0, y: 0 };
    clampViewerPan();
    applyViewerTransform();
  }

  function stageOffset(e) {
    const r = mediaViewerStage.getBoundingClientRect();
    return { cx: e.clientX - (r.left + r.width / 2), cy: e.clientY - (r.top + r.height / 2) };
  }

  function viewerStep(delta) {
    const next = viewerIndex + delta;
    if (next < 0 || next >= viewerItems.length) return;
    viewerIndex = next;
    showViewerItem();
  }

  mediaViewerStage.addEventListener('wheel', (e) => {
    if (!viewerImg) return;
    e.preventDefault();
    const { cx, cy } = stageOffset(e);
    setViewerZoom(viewerZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), cx, cy);
  }, { passive: false });

  mediaViewerStage.addEventListener('dblclick', (e) => {
    if (!viewerImg || e.target !== viewerImg) return;
    const { cx, cy } = stageOffset(e);
    setViewerZoom(viewerZoom > 1 ? 1 : 2.5, cx, cy);
  });

  mediaViewerStage.addEventListener('pointerdown', (e) => {
    if (!viewerImg || e.target !== viewerImg || viewerZoom <= 1) return;
    viewerDrag = { x: e.clientX, y: e.clientY, panX: viewerPan.x, panY: viewerPan.y, id: e.pointerId };
    mediaViewerStage.setPointerCapture(e.pointerId);
    mediaViewerStage.classList.add('is-panning');
  });
  mediaViewerStage.addEventListener('pointermove', (e) => {
    if (!viewerDrag || e.pointerId !== viewerDrag.id) return;
    viewerPan.x = viewerDrag.panX + (e.clientX - viewerDrag.x);
    viewerPan.y = viewerDrag.panY + (e.clientY - viewerDrag.y);
    clampViewerPan();
    applyViewerTransform();
  });
  const endViewerDrag = () => {
    viewerDrag = null;
    mediaViewerStage.classList.remove('is-panning');
  };
  mediaViewerStage.addEventListener('pointerup', endViewerDrag);
  mediaViewerStage.addEventListener('pointercancel', endViewerDrag);

  // clicar no fundo (fora da imagem/vídeo) fecha
  mediaViewerStage.addEventListener('click', (e) => {
    if (e.target === mediaViewerStage) closeMediaViewer();
  });

  document.getElementById('mediaViewerClose').addEventListener('click', closeMediaViewer);
  document.getElementById('mediaViewerZoomIn').addEventListener('click', () => setViewerZoom(viewerZoom * 1.5));
  document.getElementById('mediaViewerZoomOut').addEventListener('click', () => setViewerZoom(viewerZoom / 1.5));
  mediaViewerZoomReset.addEventListener('click', () => setViewerZoom(1));
  mediaViewerPrev.addEventListener('click', () => viewerStep(-1));
  mediaViewerNext.addEventListener('click', () => viewerStep(1));
  window.addEventListener('resize', () => { if (!mediaViewer.hidden) { clampViewerPan(); applyViewerTransform(); } });

  // teclado do visualizador (fase de captura: tem prioridade sobre os outros atalhos com Esc)
  document.addEventListener('keydown', (e) => {
    if (mediaViewer.hidden) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeMediaViewer(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); viewerStep(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); viewerStep(1); }
    else if (e.key === '+' || e.key === '=') setViewerZoom(viewerZoom * 1.5);
    else if (e.key === '-') setViewerZoom(viewerZoom / 1.5);
    else if (e.key === '0') setViewerZoom(1);
    else if ((e.key === 'r' || e.key === 'R') && viewerImg) { viewerRotation = (viewerRotation + 90) % 360; applyViewerTransform(); }
  }, true);

  // ===================================================================
  // painel de admin do site (só pra quem é admin do SITE — ver server/routes/admin.js)
  // ===================================================================

  const railAdminBtn = document.getElementById('railAdminBtn');
  const adminBackdrop = document.getElementById('adminBackdrop');
  const adminBody = document.getElementById('adminBody');
  const adminTabs = document.getElementById('adminTabs');
  let adminTab = 'overview';

  function setupAdminEntry() {
    railAdminBtn.hidden = !(currentUser && currentUser.is_site_admin);
  }

  async function adminApi(method, path, body) {
    const res = await fetch(`/api/admin${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'não deu certo');
    return data;
  }

  function fmtDuration(sec) {
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function openAdminPanel() {
    if (!currentUser || !currentUser.is_site_admin) return;
    adminBackdrop.hidden = false;
    showAdminTab(adminTab);
  }

  function showAdminTab(tab) {
    adminTab = tab;
    adminTabs.querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.toggle('active', b.dataset.adminTab === tab));
    adminBody.innerHTML = '<p class="admin-loading">carregando…</p>';
    const render = { overview: renderAdminOverview, users: renderAdminUsers, servers: renderAdminServers, announce: renderAdminAnnounce }[tab];
    render().catch((err) => { adminBody.innerHTML = ''; adminBody.append(Object.assign(document.createElement('p'), { className: 'field-error', textContent: err.message })); });
  }

  async function renderAdminOverview() {
    const o = await adminApi('GET', '/overview');
    const cards = [
      ['contas', o.users, o.suspended ? `${o.suspended} suspensa(s)` : 'nenhuma suspensa'],
      ['online agora', o.online, `${o.inVoice} em call · ${o.voiceChannelsActive} call(s) ativa(s)`],
      ['servidores', o.servers, ''],
      ['mensagens', o.messages.toLocaleString('pt-BR'), `${o.messagesToday} nas últimas 24h`],
      ['servidor ligado há', fmtDuration(o.uptimeSec), `Node ${o.node} · ${o.memoryMB} MB de memória`],
      ['espaço usado', `${(o.dbMB + o.uploadsMB).toFixed(1)} MB`, `banco ${o.dbMB} MB · anexos ${o.uploadsMB} MB`],
    ];
    adminBody.innerHTML = '<div class="admin-cards"></div>';
    const grid = adminBody.querySelector('.admin-cards');
    for (const [label, value, sub] of cards) {
      const c = document.createElement('div');
      c.className = 'admin-card';
      c.innerHTML = '<span class="admin-card-label"></span><strong class="admin-card-value"></strong><span class="admin-card-sub"></span>';
      c.querySelector('.admin-card-label').textContent = label;
      c.querySelector('.admin-card-value').textContent = String(value);
      c.querySelector('.admin-card-sub').textContent = sub;
      grid.appendChild(c);
    }
  }

  async function renderAdminUsers(query = '') {
    const { users } = await adminApi('GET', `/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    adminBody.innerHTML = `
      <div class="admin-toolbar">
        <input type="search" class="admin-search" placeholder="procurar pelo nome" autocomplete="off">
        <span class="admin-count"></span>
      </div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>conta</th><th>criada</th><th>servidores</th><th>mensagens</th><th>última mensagem</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>`;
    const search = adminBody.querySelector('.admin-search');
    search.value = query;
    let t = null;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => renderAdminUsers(search.value.trim()).then(() => { const s2 = adminBody.querySelector('.admin-search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }), 300); });
    adminBody.querySelector('.admin-count').textContent = `${users.length} conta(s)`;
    const tbody = adminBody.querySelector('tbody');
    for (const u of users) {
      const tr = document.createElement('tr');
      if (u.banned_at) tr.classList.add('is-suspended');
      tr.innerHTML = `
        <td><span class="admin-user"><span class="admin-avatar"></span><span class="admin-user-text"><strong></strong><small></small></span></span></td>
        <td></td><td></td><td></td><td></td>
        <td class="admin-actions"></td>`;
      tr.querySelector('.admin-avatar').innerHTML = memberAvatarInner(u);
      tr.querySelector('.admin-avatar').style.borderColor = u.accent_color || 'var(--line)';
      tr.querySelector('strong').textContent = u.username;
      const tags = [];
      if (u.is_site_admin) tags.push('admin do site');
      if (u.online) tags.push('online');
      if (u.banned_at) tags.push(`suspensa${u.ban_reason ? `: ${u.ban_reason}` : ''}`);
      tr.querySelector('small').textContent = tags.join(' · ');
      const cells = tr.querySelectorAll('td');
      cells[1].textContent = fmtDate(u.created_at);
      cells[2].textContent = u.servers;
      cells[3].textContent = u.messages.toLocaleString('pt-BR');
      cells[4].textContent = fmtDate(u.last_message_at);
      const actions = cells[5];
      if (!u.is_site_admin) {
        const mk = (label, cls, fn) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `btn btn-sm ${cls}`;
          b.textContent = label;
          b.addEventListener('click', fn);
          actions.appendChild(b);
        };
        if (u.banned_at) {
          mk('reativar', 'btn-ghost', async () => {
            try { await adminApi('POST', `/users/${u.id}/unsuspend`); toast(`${u.username} reativado`); renderAdminUsers(search.value.trim()); } catch (err) { toast(err.message, 'error'); }
          });
        } else {
          mk('suspender', 'btn-danger-ghost', async () => {
            const reason = prompt(`suspender ${u.username}? ela cai de tudo na hora e não consegue mais entrar.\n\nmotivo (aparece pra pessoa, opcional):`);
            if (reason === null) return;
            try { await adminApi('POST', `/users/${u.id}/suspend`, { reason }); toast(`${u.username} suspenso`); renderAdminUsers(search.value.trim()); } catch (err) { toast(err.message, 'error'); }
          });
        }
        mk('nova senha', 'btn-ghost', async () => {
          if (!confirm(`gerar uma senha temporária pra ${u.username}? todas as sessões dela serão desconectadas.`)) return;
          try {
            const r = await adminApi('POST', `/users/${u.id}/reset-password`);
            prompt(`senha temporária de ${u.username} (aparece só agora — copie e mande pra pessoa):`, r.temporaryPassword);
          } catch (err) { toast(err.message, 'error'); }
        });
      }
      tbody.appendChild(tr);
    }
  }

  async function renderAdminServers() {
    const { servers: list } = await adminApi('GET', '/servers');
    adminBody.innerHTML = `
      <div class="admin-toolbar"><span class="admin-count"></span></div>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>servidor</th><th>dono</th><th>membros</th><th>canais</th><th>mensagens</th><th>criado</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>`;
    adminBody.querySelector('.admin-count').textContent = `${list.length} servidor(es)`;
    const tbody = adminBody.querySelector('tbody');
    for (const sv of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><span class="admin-user"><span class="admin-avatar is-server"></span><strong></strong></span></td><td></td><td></td><td></td><td></td><td></td><td class="admin-actions"></td>';
      tr.querySelector('.admin-avatar').innerHTML = serverIconInner(sv);
      tr.querySelector('strong').textContent = sv.name;
      const cells = tr.querySelectorAll('td');
      cells[1].textContent = sv.owner || '—';
      cells[2].textContent = sv.members;
      cells[3].textContent = sv.channels;
      cells[4].textContent = sv.messages.toLocaleString('pt-BR');
      cells[5].textContent = fmtDate(sv.created_at);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-sm btn-danger-ghost';
      del.textContent = 'apagar';
      del.addEventListener('click', async () => {
        const typed = prompt(`apagar "${sv.name}" de vez (${sv.messages} mensagens, ${sv.members} membros)? isso não tem volta.\n\ndigite o nome do servidor pra confirmar:`);
        if (typed == null) return;
        if (typed.trim() !== sv.name) { toast('o nome não bate — nada foi apagado', 'error'); return; }
        try { await adminApi('DELETE', `/servers/${sv.id}`); toast(`${sv.name} apagado`); renderAdminServers(); } catch (err) { toast(err.message, 'error'); }
      });
      cells[6].appendChild(del);
      tbody.appendChild(tr);
    }
  }

  async function renderAdminAnnounce() {
    adminBody.innerHTML = `
      <div class="admin-announce">
        <p class="modal-lead">O aviso aparece em destaque pra todo mundo que estiver com o didiscord aberto agora (manutenção, reinício do servidor, novidade…).</p>
        <textarea maxlength="300" rows="4" placeholder="ex: vou reiniciar o servidor em 5 minutos pra atualizar"></textarea>
        <div class="modal-actions"><span class="field-help admin-announce-count">0/300</span><button type="button" class="btn btn-primary">mandar aviso</button></div>
      </div>`;
    const ta = adminBody.querySelector('textarea');
    const count = adminBody.querySelector('.admin-announce-count');
    ta.addEventListener('input', () => { count.textContent = `${ta.value.length}/300`; });
    adminBody.querySelector('.btn-primary').addEventListener('click', async () => {
      if (!ta.value.trim()) return;
      try {
        const r = await adminApi('POST', '/announce', { text: ta.value });
        toast(`aviso mandado pra ${r.delivered} pessoa(s) online`);
        ta.value = '';
        count.textContent = '0/300';
      } catch (err) { toast(err.message, 'error'); }
    });
    ta.focus();
  }

  railAdminBtn.addEventListener('click', openAdminPanel);
  adminTabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-admin-tab]');
    if (b) showAdminTab(b.dataset.adminTab);
  });
  wireModal(adminBackdrop);

  // aviso geral do admin: um banner em destaque no topo, que fica até a pessoa fechar
  function showSiteAnnouncement(text, by) {
    const el = document.createElement('div');
    el.className = 'site-announcement';
    el.setAttribute('role', 'alert');
    el.innerHTML = '<span class="site-announcement-icon">📣</span><span class="site-announcement-text"></span><button type="button" aria-label="fechar">×</button>';
    el.querySelector('.site-announcement-text').textContent = by ? `${by}: ${text}` : text;
    el.querySelector('button').addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    playMessageSound();
  }

  // Esc fecha o que estiver aberto por cima (popout, menu, modais novos)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (window.DidiEmoji && DidiEmoji.isOpen()) return;
    if (!viewProfileBackdrop.hidden) { closeViewProfile(); return; }
    if (!settingsModalBackdrop.hidden) { closeSettingsModal(); return; }
    if (!serverMenu.hidden) { closeServerMenu(); return; }
    for (const bd of [adminBackdrop, channelEditBackdrop, newDmBackdrop, inviteBackdrop, serverSettingsBackdrop, addServerBackdrop, joinInviteBackdrop, profileModalBackdrop]) {
      if (!bd.hidden) { bd.hidden = true; return; }
    }
  });

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

  for (const event of ['play', 'pause', 'ended']) micTestPlayback?.addEventListener(event, updateSelfMonitor);

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
  const SETTINGS_TAB_KEY = 'didiscord:settingsTab';
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
      DidiTheme.mountEditor(document.getElementById('themeEditor'), { toast });
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

  const SITE_VERSION = '0.6.4';
  function renderSettingsAppCard() {
    const card = document.getElementById('settingsAppCard');
    const desk = window.didiscordDesktop;
    card.innerHTML = '<span class="settings-card-icon"><svg width="26" height="13" viewBox="0 0 56 28"><path d="M 10 14 C 20 2, 36 26, 46 14" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.6"/><circle cx="10" cy="14" r="6" fill="currentColor"/><circle cx="46" cy="14" r="6" fill="currentColor"/></svg></span><span class="settings-card-text"><strong></strong><span></span></span>';
    card.querySelector('strong').textContent = desk ? 'app desktop do didiscord' : 'didiscord no navegador';
    card.querySelector('.settings-card-text span').textContent = desk
      ? `site ${SITE_VERSION} · ${desk.platform === 'win32' ? 'Windows' : desk.platform === 'linux' ? 'Linux' : desk.platform}`
      : `site ${SITE_VERSION} · instale o app pra compartilhar tela pela placa de vídeo e receber atualizações sozinho`;
    const checkBtn = document.getElementById('settingsCheckUpdatesBtn');
    checkBtn.hidden = !(desk && typeof desk.checkForUpdates === 'function');
    document.getElementById('settingsDownloadBtn').textContent = desk ? 'página de download' : 'baixar o app';
  }
  document.getElementById('settingsCheckUpdatesBtn').addEventListener('click', () => {
    if (window.didiscordDesktop && window.didiscordDesktop.checkForUpdates) window.didiscordDesktop.checkForUpdates();
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
    if (notificationSoundsCheckbox.checked) playMessageSound(); // feedback imediato ao ligar
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

  // ---------- chamada de voz (WebRTC) ----------

  function getAudioCtx() {
    if (!audioCtx) {
      // 48kHz explícito: o worklet do RNNoise assume essa taxa de amostragem
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      applyOutputDeviceToAudioCtx();
    }
    // um AudioContext criado fora de uma cadeia síncrona de clique pode nascer "suspended" —
    // se isso acontecer, o áudio remoto (que passa pelo GainNode do controle de volume) fica
    // mudo mesmo com tudo conectado certinho, sem erro nenhum no console. resume() em cima de
    // um contexto já rodando não faz nada, então é seguro chamar sempre.
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => console.log('[call] audioCtx retomado, estado agora:', audioCtx.state))
        .catch((err) => console.warn('[call] não consegui retomar o audioCtx:', err));
    }
    return audioCtx;
  }

  // ---------- sons de notificação (sintetizados via Web Audio, sem depender de nenhum arquivo
  // de áudio externo) — tocam localmente pros DOIS lados: quando eu entro/saio de uma call e
  // quando o outro participante entra/sai (ver wireRealtime), e quando chega mensagem de quem
  // não sou eu. Reusa o mesmo AudioContext da call (getAudioCtx) por simplicidade, mas funciona
  // mesmo fora de uma call (ex: som de mensagem enquanto só estou navegando o chat).
  function playChime(frequencies, opts = {}) {
    if (!getSavedNotificationSounds()) return;
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      const stepDuration = opts.stepDuration != null ? opts.stepDuration : 0.09;
      const noteDuration = opts.noteDuration != null ? opts.noteDuration : 0.15;
      const volume = opts.volume != null ? opts.volume : 0.16;
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = opts.type || 'sine';
        osc.frequency.value = freq;
        const startAt = now + i * stepDuration;
        // envelope curto (ataque rápido, decaimento exponencial) pra soar como um "blip" limpo,
        // sem clique/estalo no início nem corte abrupto no final
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(volume, startAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + noteDuration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + noteDuration + 0.02);
      });
    } catch (err) {
      console.warn('[sound] não consegui tocar o som de notificação:', err);
    }
  }

  // duas notas subindo — mesmo som pra "eu entrei" e "o outro entrou"
  function playJoinSound() {
    playChime([440, 660], { stepDuration: 0.09, noteDuration: 0.17 });
  }

  // duas notas descendo — o inverso do som de entrada, pra ficar reconhecível de ouvido
  function playLeaveSound() {
    playChime([560, 360], { stepDuration: 0.09, noteDuration: 0.19 });
  }

  // nota única, mais curta e discreta — não deve competir com quem está falando numa call
  function playMessageSound() {
    playChime([740], { noteDuration: 0.11, volume: 0.13, type: 'triangle' });
  }

  function getAnalyserLevel(analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (const v of data) sum += v;
    return Math.min(100, Math.round((sum / data.length) * 1.6));
  }

  const micRmsBuffer = new Float32Array(512);
  function getAnalyserDb(analyser) {
    if (!analyser) return -90;
    analyser.getFloatTimeDomainData(micRmsBuffer);
    let sum = 0;
    for (const sample of micRmsBuffer) sum += sample * sample;
    return Math.max(-90, 10 * Math.log10(sum / micRmsBuffer.length));
  }

  // Toca a mesma saída que a call envia, com volume local reduzido pra evitar microfonia.
  function updateSelfMonitor() {
    const stream = localStream || settingsMicGraph?.stream || settingsStream;
    if (!getSavedSelfMonitor() || !stream?.getAudioTracks().length || micTest?.recording || micTestPlayback?.paused === false) {
      stopSelfMonitor();
      return;
    }
    if (selfMonitorSourceStream === stream) return;
    stopSelfMonitor();
    try {
      const ctx = getAudioCtx();
      selfMonitorSourceNode = ctx.createMediaStreamSource(stream);
      selfMonitorGainNode = ctx.createGain();
      selfMonitorGainNode.gain.value = 0.4;
      selfMonitorSourceNode.connect(selfMonitorGainNode).connect(ctx.destination);
      selfMonitorSourceStream = stream;
    } catch (err) {
      stopSelfMonitor();
      console.warn('[call] não consegui montar o "ouvir a si mesmo":', err);
    }
  }

  // ---------- volume acima de 100%: UM caminho só ----------
  // Antes, acima de 100% o som tocava por dois caminhos ao mesmo tempo (o elemento <audio> até 100% +
  // um reforço paralelo pela Web Audio com "o que passa de 100%"). Os dois têm atrasos diferentes,
  // então a mesma voz saía duas vezes, levemente descompassada ("duplicado") — e o reforço não passa
  // pelo cancelamento de eco do navegador, então pra quem usa caixa de som a voz reforçada vazava de
  // volta pelo microfone. Agora: até 100% só o elemento (com o cancelamento de eco funcionando);
  // acima de 100% o elemento fica mudo e TODO o som vai pelo reforço, com o ganho inteiro.
  let boostLimiter = null;

  // tudo que sai pelo reforço passa por um limitador: ganho acima de 1 estouraria (chiado) nos picos
  function boostOutput(ctx) {
    if (!boostLimiter || boostLimiter.context !== ctx) {
      boostLimiter = ctx.createDynamicsCompressor();
      boostLimiter.threshold.value = -1;
      boostLimiter.knee.value = 0;
      boostLimiter.ratio.value = 20;
      boostLimiter.attack.value = 0.002;
      boostLimiter.release.value = 0.12;
      boostLimiter.connect(ctx.destination);
    }
    return boostLimiter;
  }

  // a saída de áudio escolhida nas configurações também vale pro caminho do reforço (Web Audio) —
  // antes ele tocava sempre no dispositivo padrão, mesmo com outro escolhido
  function applyOutputDeviceToAudioCtx() {
    if (!audioCtx || typeof audioCtx.setSinkId !== 'function') return;
    const id = getSavedDeviceId('speaker');
    audioCtx.setSinkId(id && id !== 'default' ? id : '').catch(() => { /* dispositivo sumiu — segue no padrão */ });
  }

  // troca a saída na hora, com a call aberta (antes só valia pra quem entrasse depois)
  function applyOutputDeviceEverywhere() {
    applyOutputDeviceToAudioCtx();
    const id = getSavedDeviceId('speaker');
    if (!SUPPORTS_SINK_ID || !id) return;
    const els = [...document.querySelectorAll('audio[data-peer-audio], #musicbotAudio, .call-screenshare-tile video')];
    for (const el of els) el.setSinkId(id).catch(() => { /* segue no padrão */ });
  }

  function stopSelfMonitor() {
    if (selfMonitorGainNode) { try { selfMonitorGainNode.disconnect(); } catch (_) { /* já desconectado */ } selfMonitorGainNode = null; }
    selfMonitorSourceNode?.disconnect();
    selfMonitorSourceNode = null;
    selfMonitorSourceStream = null;
  }

  // aplica um reforço de ganho (Web Audio GainNode) em cima do stream cru do mic, antes de
  // mandar pra call. Retorna um NOVO MediaStream (via createMediaStreamDestination) já amplificado
  // — tanto pra transmissão (transceiver) quanto pro analyser de detecção de fala, que passam a
  // refletir o volume de verdade que está sendo enviado, não o volume cru do hardware.
  // ---------- supressão de ruído de verdade (RNNoise, WASM) — mesma família de técnica do Krisp ----------
  const RNNOISE_BASE = '/vendor/web-noise-suppressor';
  const RNNOISE_WORKLET = `${RNNOISE_BASE}/rnnoiseWorkletProcessor.js?v=2`;
  let rnnoiseAssetsPromise = null;

  function loadRnnoiseAssets() {
    if (!rnnoiseAssetsPromise) {
      rnnoiseAssetsPromise = (async () => {
        const mod = await import(`${RNNOISE_BASE}/index.js`);
        const wasmBinary = await mod.loadRnnoise({
          url: `${RNNOISE_BASE}/rnnoise.wasm`,
          simdUrl: `${RNNOISE_BASE}/rnnoise_simd.wasm`,
        });
        return { RnnoiseWorkletNode: mod.RnnoiseWorkletNode, wasmBinary };
      })().catch((err) => {
        rnnoiseAssetsPromise = null;
        throw err;
      });
    }
    return rnnoiseAssetsPromise;
  }

  // monta o grafo de áudio do mic: bruto -> [RNNoise] -> ganho manual -> gate de sensibilidade -> destino (pro transceiver)
  // o gate de sensibilidade mexe só no GANHO desse último nó, nunca em track.enabled — evita depender
  // de como cada navegador lida com desabilitar a track de saída de um MediaStreamAudioDestinationNode
  // enquanto ela já está sendo consumida por um RTCRtpSender (isso causava mic totalmente mudo assim
  // que a sensibilidade saía de 0%, mesmo em 1%).
  // ---------- supressão de ruído avançada (DeepFilterNet3) — a mais parecida com a Krisp do Discord ----------
  // rede neural que separa voz de ruído (teclado, ventilador, barulho de rua, eco do cômodo) rodando
  // no próprio navegador, num AudioWorklet. Arquivos servidos pelo próprio servidor (public/vendor/
  // deepfilternet3, ver README lá). Medido: ~0,7 ms pra cada 10 ms de áudio, então cabe com folga.
  const DEEPFILTER_BASE = '/vendor/deepfilternet3';
  let deepFilterCorePromise = null;

  function loadDeepFilterCore() {
    if (!deepFilterCorePromise) {
      deepFilterCorePromise = (async () => {
        const { DeepFilterNet3Core } = await import(`${DEEPFILTER_BASE}/index.esm.js?v=2`);
        // Os níveis são limites de atenuação em dB. 40 dB mantém o ajuste das calls anteriores.
        const core = new DeepFilterNet3Core({ sampleRate: 48000, noiseReductionLevel: 40, assetConfig: { cdnUrl: DEEPFILTER_BASE } });
        await core.initialize();
        return core;
      })().catch((err) => {
        deepFilterCorePromise = null; // tenta de novo na próxima vez em vez de ficar quebrado
        throw err;
      });
    }
    return deepFilterCorePromise;
  }

  // cria o nó de supressão pro modo pedido. Se o avançado falhar (navegador sem suporte, arquivo
  // não baixou), cai pro RNNoise; se esse também falhar, segue sem supressão — nunca deixa a pessoa
  // sem microfone por causa disso. Devolve { node, mode, teardown }.
  async function createNoiseSuppressorNode(ctx, mode) {
    if (mode === 'deepfilter') {
      try {
        const core = await loadDeepFilterCore();
        const node = await core.createAudioWorkletNode(ctx);
        return {
          node,
          mode: 'deepfilter',
          setSuppressionLevel: (level) => core.setSuppressionLevel(level, node),
          teardown: () => {
            node.disconnect();
            node.port.close();
            if (core.workletNode === node) core.workletNode = null;
          },
        };
      } catch (err) {
        console.warn('[call] supressão avançada (DeepFilterNet3) indisponível, usando a leve (RNNoise):', err);
        mode = 'rnnoise';
      }
    }
    if (mode === 'rnnoise') {
      try {
        const [{ RnnoiseWorkletNode, wasmBinary }] = await Promise.all([
          loadRnnoiseAssets(), loadMicWorkletModule(ctx, RNNOISE_WORKLET),
        ]);
        const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
        return { node, mode: 'rnnoise', teardown: () => { try { node.disconnect(); node.destroy(); } catch (_) { /* já desligado */ } } };
      } catch (err) {
        console.warn('[call] não consegui carregar a supressão de ruído (RNNoise), seguindo sem ela:', err);
      }
    }
    return { node: null, mode: 'off', teardown: null };
  }

  const micWorkletModules = new Map(); // a call e a prévia usam o mesmo AudioContext

  function loadMicWorkletModule(ctx, url) {
    if (!micWorkletModules.has(url)) {
      const pending = ctx.audioWorklet.addModule(url).catch((err) => {
        micWorkletModules.delete(url);
        throw err;
      });
      micWorkletModules.set(url, pending);
    }
    return micWorkletModules.get(url);
  }

  async function createMicWorklet(ctx, name, url, options = {}) {
    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return null;
    let timer;
    try {
      await Promise.race([
        loadMicWorkletModule(ctx, url),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('tempo de carga excedido')), 1000);
        }),
      ]);
      return new AudioWorkletNode(ctx, name, {
        channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1], ...options,
      });
    } catch (err) {
      console.warn('[call] processamento do microfone indisponível:', name, err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function connectMicGate(input, sidechain, output, worklet) {
    const gate = {
      legacy: !worklet,
      vadFailed: false,
      state: { levelDb: -90, speaking: false, open: true },
      onSpeaking: null,
      configure,
      mute,
      tickLegacy,
      teardown,
    };
    let automatic = true;
    let thresholdDb = null;
    let muted = false;
    let openUntil = 0;
    let vadRequested = false;

    function report(state) {
      const changed = state.speaking !== gate.state.speaking;
      gate.state = state;
      if (changed) gate.onSpeaking?.(state.speaking);
    }

    function configure() {
      automatic = getSavedMicGateMode() === 'auto';
      thresholdDb = micThresholdDb(getSavedMicSensitivity());
      if (gate.legacy) return;
      worklet.port.postMessage({ type: 'config', automatic, thresholdDb });
      if (!automatic || vadRequested) return;
      vadRequested = true;
      if (worklet.context.sampleRate !== 48000) {
        gate.vadFailed = true;
        return;
      }
      loadRnnoiseAssets().then(({ wasmBinary }) => {
        if (!gate.legacy) worklet.port.postMessage({ type: 'vad', wasmBinary });
      }).catch((err) => {
        gate.vadFailed = true;
        console.warn('[call] detecção automática indisponível, seguindo com o mic aberto:', err);
      });
    }

    function mute(value) {
      if (muted === value) return;
      muted = value;
      if (!gate.legacy) worklet.port.postMessage({ type: 'mute', muted });
      if (muted) {
        openUntil = 0;
        report({ levelDb: -90, speaking: false, open: false });
      }
    }

    // O fallback mantém o gate manual com o medidor em dB e deixa passar no automático.
    function tickLegacy(levelDb) {
      const now = performance.now();
      const bypass = automatic || thresholdDb === null;
      if (!muted && levelDb >= (bypass ? -55 : thresholdDb)) openUntil = now + 350;
      const speaking = !muted && now < openUntil;
      const open = !muted && (bypass || speaking);
      output.gain.setTargetAtTime(open ? 1 : 0, output.context.currentTime, 0.03);
      report({ levelDb, speaking, open });
    }

    function teardown() {
      if (gate.legacy) return;
      gate.legacy = true; // também invalida o carregamento assíncrono do WASM
      worklet.onprocessorerror = null;
      worklet.port.onmessage = null;
      worklet.port.postMessage({ type: 'stop' });
      worklet.port.close();
      worklet.disconnect();
    }

    if (worklet) {
      worklet.port.onmessage = ({ data }) => {
        if (data.type === 'vad-error') gate.vadFailed = true;
        if (data.type === 'meter' && !muted) report({ levelDb: data.levelDb, speaking: data.speaking, open: data.open });
      };
      worklet.onprocessorerror = (err) => {
        input.disconnect(worklet);
        sidechain.disconnect(worklet);
        teardown();
        input.connect(output); // usa a mesma track de saída se o worklet parar na call
        console.warn('[call] gate indisponível, usando o modo de reserva:', err);
      };
      input.connect(worklet, 0, 0);
      sidechain.connect(worklet, 0, 1);
      worklet.connect(output);
    } else {
      input.connect(output);
    }
    return gate;
  }

  function connectMicLimiter(input, dest, worklet) {
    let limiter = worklet;
    function connectCompressor() {
      limiter = input.context.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      input.connect(limiter).connect(dest);
    }
    if (worklet) {
      input.connect(worklet).connect(dest);
      worklet.onprocessorerror = (err) => {
        worklet.onprocessorerror = null;
        input.disconnect(worklet);
        worklet.disconnect();
        worklet.port.close();
        // Mantém a mesma track de saída mesmo se o processor parar no meio da call.
        connectCompressor();
        console.warn('[call] limitador do microfone falhou, usando o compressor:', err);
      };
    } else {
      connectCompressor();
    }
    return () => {
      if (worklet?.onprocessorerror) {
        worklet.onprocessorerror = null;
        worklet.port.postMessage('stop');
        worklet.port.close();
      }
      limiter.disconnect();
    };
  }

  // último ganho que o nivelador achou: remontar o processamento (trocar supressão, microfone…)
  // começa dele em vez de reaprender o volume do zero
  let lastLevelerGainDb = 0;

  function connectMicLeveler(input, output, worklet) {
    input.connect(worklet);
    worklet.connect(output);
    worklet.port.onmessage = ({ data }) => { if (data && data.type === 'gain') lastLevelerGainDb = data.gainDb; };
    worklet.onprocessorerror = (err) => {
      try { input.disconnect(worklet); } catch (_) { /* já desligado */ }
      input.connect(output); // sem o nivelador a voz continua passando, só sem o ajuste
      console.warn('[call] nivelador de volume parou, seguindo sem ele:', err);
    };
    return () => {
      worklet.onprocessorerror = null;
      worklet.port.onmessage = null;
      worklet.port.postMessage('stop');
      worklet.port.close();
      worklet.disconnect();
    };
  }

  async function buildMicProcessingGraph(rawStream, gainValue, noiseMode) {
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(rawStream);

    // Corta vibração de mesa e rumble antes que entrem no supressor.
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;
    highpass.Q.value = 20 * Math.log10(Math.SQRT1_2); // Butterworth; a Web Audio usa Q em dB aqui

    const gainNode = ctx.createGain();
    const gateGainNode = ctx.createGain();
    const analyser = ctx.createAnalyser();
    const dest = ctx.createMediaStreamDestination();
    const wantsLeveler = usesOwnLeveler();
    const [ns, limiterWorklet, gateWorklet, levelerWorklet] = await Promise.all([
      createNoiseSuppressorNode(ctx, noiseMode),
      createMicWorklet(ctx, 'didiscord-mic-limiter', '/js/worklets/mic-limiter.js?v=1'),
      createMicWorklet(ctx, 'didiscord-mic-gate', '/js/worklets/mic-gate.js?v=2', { numberOfInputs: 2 }),
      wantsLeveler
        ? createMicWorklet(ctx, 'didiscord-mic-leveler', '/js/worklets/mic-leveler.js?v=1', { processorOptions: { initialGainDb: lastLevelerGainDb } })
        : null,
    ]);
    if (wantsLeveler && !levelerWorklet) console.warn('[call] nivelador de volume indisponível — o microfone segue sem ajuste automático');
    let gate;
    let teardownLimiter;
    let teardownLeveler;
    const teardown = () => {
      for (const node of [source, highpass, gainNode, gateGainNode]) node.disconnect();
      gate?.teardown();
      teardownLimiter?.();
      teardownLeveler?.();
      ns.teardown?.();
      dest.stream.getTracks().forEach((track) => track.stop());
    };

    try {
      teardownLimiter = connectMicLimiter(gateGainNode, dest, limiterWorklet);
      gate = connectMicGate(gainNode, highpass, gateGainNode, gateWorklet);
      source.connect(highpass);
      if (ns.node) highpass.connect(ns.node);
      // nivelador (se ligado) logo depois do supressor: mede só a voz, já sem o ruído
      const cleaned = ns.node || highpass;
      if (levelerWorklet) teardownLeveler = connectMicLeveler(cleaned, gainNode, levelerWorklet);
      else cleaned.connect(gainNode);
      gainNode.gain.value = gainValue / 100;

      // Call e prévia leem o mesmo ponto: depois da supressão e do ganho, antes do gate.
      analyser.fftSize = 512;
      gainNode.connect(analyser);
      return {
        stream: dest.stream, gainNode, gate, analyser, noiseMode: ns.mode,
        setSuppressionLevel: ns.setSuppressionLevel, teardown,
      };
    } catch (err) {
      teardown();
      throw err;
    }
  }

  async function tryBuildMicProcessingGraph(stream) {
    try {
      const graph = await buildMicProcessingGraph(stream, getSavedMicGain(), getSavedNoiseSuppression());
      // A pessoa pode mexer nas configurações enquanto os módulos carregam.
      graph.gainNode.gain.value = getSavedMicGain() / 100;
      graph.setSuppressionLevel?.(getSavedNoiseSuppressionLevel());
      graph.gate.configure();
      return graph;
    } catch (err) {
      console.warn('[call] processamento do microfone indisponível, seguindo com o áudio cru:', err);
      return null;
    }
  }

  // Monta antes de trocar a faixa, pra manter o microfone anterior disponível durante o carregamento.
  let micRebuildId = 0;
  let micCaptureId = 0;
  async function rebuildMicProcessing(input = rawMicStream) {
    if (!voiceChannel || !input || isTauriApp()) return;
    const channel = voiceChannel;
    const previousRaw = rawMicStream;
    const rebuildId = ++micRebuildId;
    const graph = await tryBuildMicProcessingGraph(input);
    if (voiceChannel !== channel || rebuildId !== micRebuildId) {
      graph?.teardown();
      if (input !== previousRaw) input.getTracks().forEach((track) => track.stop());
      return;
    }

    const previousGraph = callMicGraph;
    rawMicStream = input;
    useCallMicGraph(graph);
    applyLocalTrackState();
    publishLocalSpeaking(graph?.gate.state.speaking);
    const replacement = replaceOnAllPeers('mic', localStream.getAudioTracks()[0] || null);
    resetMicTest();
    await replacement;
    previousGraph?.teardown();
    if (previousRaw !== input) previousRaw.getTracks().forEach((track) => track.stop());
    updateNoiseSuppressionStatus();
  }

  function useCallMicGraph(graph) {
    localStream = graph?.stream || rawMicStream;
    micGainNode = graph?.gainNode || null;
    callMicGraph = graph;
    if (graph) graph.gate.onSpeaking = (speaking) => {
      if (callMicGraph === graph) publishLocalSpeaking(speaking);
    };
    micNsActiveMode = graph?.noiseMode || 'off';
    localAnalyser = graph?.analyser || createRawMicAnalyser(rawMicStream);
    runSpeakingLoop();
  }

  // ---------- áudio de cada pessoa da call ----------
  // cada participante tem o próprio <audio> (o caminho normal, 0–100%) e o próprio GainNode em
  // paralelo pro reforço acima de 100% — o volume e o "silenciar localmente" de cada um são
  // independentes, igual no Discord.
  function getPeerAudioEl(peer) {
    if (!peer.audioEl) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.hidden = true;
      el.dataset.peerAudio = String(peer.userId);
      document.body.appendChild(el);
      peer.audioEl = el;
    }
    const el = peer.audioEl;
    el.muted = isDeafened;
    const savedSpeaker = getSavedDeviceId('speaker');
    if (SUPPORTS_SINK_ID && savedSpeaker && el.sinkId !== savedSpeaker) {
      el.setSinkId(savedSpeaker).catch(() => { /* dispositivo pode ter sido desconectado — segue no padrão */ });
    }
    return el;
  }

  function connectPeerAudio(peer) {
    const el = getPeerAudioEl(peer);
    if (el.srcObject !== peer.audioStream) {
      el.srcObject = peer.audioStream;
      el.play().catch((err) => console.warn('[call] autoplay do áudio de', peer.userId, 'bloqueado pelo navegador:', err));
    }
    ensurePeerBoostGraph(peer);
    applyLocalOverridesToRemoteAudio(peer.userId);
  }

  // grafo paralelo que soma o reforço de volume acima de 100% — ganho 0 (inaudível) até alguém
  // pedir mais de 100% pra essa pessoa
  function ensurePeerBoostGraph(peer) {
    if (peer.boostSource === peer.audioStream && peer.boostGain) return;
    try {
      const ctx = getAudioCtx();
      const src = ctx.createMediaStreamSource(peer.audioStream);
      peer.boostGain = ctx.createGain();
      peer.boostGain.gain.value = 0;
      src.connect(peer.boostGain);
      peer.boostGain.connect(boostOutput(ctx));
      peer.boostSource = peer.audioStream;
    } catch (err) {
      console.warn('[call] não consegui montar o reforço de volume acima de 100%:', err);
    }
  }

  // aplica volume (0–200%) + silenciar-localmente no áudio de uma pessoa da call. Nunca mexe em
  // `.muted` do elemento além do ensurdecer (isDeafened).
  function applyLocalOverridesToRemoteAudio(userId) {
    const peer = peers.get(userId);
    if (!peer || !peer.audioEl) return;
    const override = getLocalOverride(userId);
    const vol = getSavedVolume(userId); // 0–200
    const factor = override.mutedLocal ? 0 : vol / 100;
    // acima de 100%: o elemento fica mudo e o reforço leva o som inteiro (um caminho só — ver boostOutput)
    const boosted = factor > 1 && !!peer.boostGain;
    peer.audioEl.volume = boosted ? 1 : Math.min(1, Math.max(0, factor));
    peer.audioEl.muted = isDeafened || boosted;
    if (peer.boostGain) {
      peer.boostGain.gain.setTargetAtTime(boosted && !isDeafened ? factor : 0, getAudioCtx().currentTime, 0.03);
    }
  }

  // ---------- áudio do bot de música (server/bots/musicBot) ----------
  // segue o MESMO padrão do áudio remoto (connectRemoteAudioGain/ensureRemoteBoostGraph acima):
  // 0–100% direto via el.volume, reforço até 200% por um GainNode em paralelo. A diferença é que
  // a fonte aqui não é uma MediaStream de WebRTC, é um <audio src="/api/musicbot/stream">, então
  // o "tap" paralelo pro reforço usa el.captureStream() em vez de ctx.createMediaStreamSource
  // direto numa stream já existente (NUNCA usar ctx.createMediaElementSource aqui — isso
  // sequestraria a saída normal do elemento pro grafo, quebrando o caminho direto 0–100%).
  function getOrCreateBotAudioEl() {
    let el = document.getElementById('musicbotAudio');
    if (!el) {
      el = document.createElement('audio');
      el.id = 'musicbotAudio';
      el.autoplay = true;
      el.hidden = true;
      document.body.appendChild(el);
    }
    el.muted = isDeafened;
    const savedSpeaker = getSavedDeviceId('speaker');
    if (SUPPORTS_SINK_ID && savedSpeaker) {
      el.setSinkId(savedSpeaker).catch(() => { /* dispositivo pode ter sido desconectado — segue no padrão */ });
    }
    return el;
  }

  // começa a tocar o stream ao vivo do bot — chamado quando o bot entra no canal de voz em que eu
  // estou (voice_user_joined) ou quando eu entro num canal onde o bot já estava (voice_channel_state)
  // cada servidor tem o seu bot: ouve o stream do servidor da call em que eu estou
  function startBotAudio() {
    if (!voiceChannel || voiceChannel.server_id == null) return;
    const serverId = voiceChannel.server_id;
    const el = getOrCreateBotAudioEl();
    const wanted = `/api/musicbot/stream?server=${serverId}`; // mesma origem — o cookie da sessão autentica
    if (el.dataset.stream !== wanted) {
      el.dataset.stream = wanted;
      el.src = wanted;
      loadMusicbotState(serverId);
    }
    el.play().catch((err) => {
      console.warn('[musicbot] autoplay do áudio do bot foi bloqueado pelo navegador:', err);
    });
    ensureBotAudioBoostGraph(el);
    applyLocalOverridesToBotAudio();
    startBotCatchUp(el);
  }

  // ---------- sincronia do bot entre todo mundo ----------
  // o stream é uma rádio ao vivo; quem conecta no meio recebe alguns segundos "de reserva" pra
  // começar a tocar na hora (server/bots/musicBot/stream.js) — e fica esses segundos atrás de quem
  // já estava ouvindo. Aqui o app mede quanto áudio tem guardado à frente do que está tocando e,
  // se estiver atrasado, acelera de leve (sem mudar o tom) até ficar perto do ao vivo. Resultado:
  // todo mundo ouve o bot com ~1s de diferença no máximo, e sem travar por falta de reserva.
  const BOT_TARGET_LEAD_S = 1.0; // reserva ideal (protege contra oscilação da internet)
  const BOT_SEEK_LEAD_S = 4.0;   // atrasado demais: tenta pular direto pra perto do ao vivo
  let botCatchUpTimer = null;

  function botBufferedLead(el) {
    const b = el.buffered;
    if (!b || !b.length) return 0;
    return Math.max(0, b.end(b.length - 1) - el.currentTime);
  }

  function startBotCatchUp(el) {
    if (botCatchUpTimer) return;
    if ('preservesPitch' in el) el.preservesPitch = true;
    botCatchUpTimer = setInterval(() => {
      if (el.paused || !el.getAttribute('src')) return;
      const lead = botBufferedLead(el);
      if (lead > BOT_SEEK_LEAD_S) {
        try { el.currentTime = el.buffered.end(el.buffered.length - 1) - BOT_TARGET_LEAD_S; } catch (_) { /* stream sem seek: a aceleração resolve */ }
      }
      const rate = lead > BOT_TARGET_LEAD_S + 0.6 ? 1.08 : (lead < BOT_TARGET_LEAD_S + 0.15 ? 1.0 : el.playbackRate);
      if (el.playbackRate !== rate) el.playbackRate = rate;
    }, 500);
  }

  function stopBotCatchUp() {
    if (botCatchUpTimer) { clearInterval(botCatchUpTimer); botCatchUpTimer = null; }
  }

  // para de tocar o bot — chamado quando o bot sai do canal (voice_user_left) ou quando eu saio da
  // call. Remove o src (não só pause) pra fechar a conexão HTTP de verdade em vez de deixar
  // pendurada consumindo banda à toa em segundo plano.
  function stopBotAudio() {
    stopBotCatchUp();
    const el = document.getElementById('musicbotAudio');
    if (el) {
      el.pause();
      el.removeAttribute('src');
      delete el.dataset.stream;
      el.playbackRate = 1;
      el.load();
    }
    if (botAudioBoostGainNode) { try { botAudioBoostGainNode.disconnect(); } catch (_) { /* já desconectado */ } botAudioBoostGainNode = null; }
    if (botAudioMediaSource) { try { botAudioMediaSource.disconnect(); } catch (_) { /* já desconectado */ } }
    botAudioBoostSourceEl = null;
  }

  // o som do bot não vem de uma call (não depende do cancelamento de eco), então ele vai INTEIRO pela
  // Web Audio: elemento → ganho (0–200%) → limitador → saída. Um caminho só, em qualquer volume.
  // (antes: elemento até 100% + reforço paralelo pela captureStream — o som saía duplicado acima de 100%)
  let botAudioMediaSource = null;
  function ensureBotAudioBoostGraph(el) {
    if (botAudioBoostSourceEl === el && botAudioBoostGainNode) return; // já montado pra esse elemento
    try {
      const ctx = getAudioCtx();
      // createMediaElementSource só pode ser chamado UMA vez por elemento — o elemento do bot é reaproveitado
      if (!botAudioMediaSource || botAudioMediaSource.mediaElement !== el) botAudioMediaSource = ctx.createMediaElementSource(el);
      botAudioBoostGainNode = ctx.createGain();
      botAudioBoostGainNode.gain.value = 1;
      botAudioMediaSource.connect(botAudioBoostGainNode);
      botAudioBoostGainNode.connect(boostOutput(ctx));
      botAudioBoostSourceEl = el;
    } catch (err) {
      console.warn('[musicbot] não consegui montar o volume do bot pela Web Audio — fica no volume do elemento (até 100%):', err);
    }
  }

  // mesma lógica de applyLocalOverridesToRemoteAudio, só que sempre vale (não tem "é a pessoa
  // certa?" pra checar — só existe um bot) e usa getSavedVolume/getLocalOverride com BOT_USER_ID
  // como chave, reaproveitando o mesmo esquema de persistência local por participante
  function applyLocalOverridesToBotAudio() {
    const el = document.getElementById('musicbotAudio');
    if (!el) return;
    const override = getLocalOverride(BOT_USER_ID);
    const vol = getSavedVolume(BOT_USER_ID); // 0–200
    const factor = override.mutedLocal ? 0 : vol / 100;
    if (botAudioBoostGainNode) {
      // todo o som do bot já passa pelo ganho: o elemento fica em 100% e o ganho faz 0–200%
      el.volume = 1;
      botAudioBoostGainNode.gain.setTargetAtTime(factor, getAudioCtx().currentTime, 0.03);
    } else {
      el.volume = Math.min(1, Math.max(0, factor));
    }
  }

  // o áudio da TELA de alguém toca JUNTO com o vídeo, no MESMO elemento <video> (mesma
  // MediaStream) — assim o navegador sincroniza imagem e som sozinho. 0–100% via video.volume,
  // e o reforço acima de 100% via um GainNode em paralelo (igual o mic).
  function ensurePeerScreenBoostGraph(peer) {
    if (peer.screenBoostSource === peer.screenAudioStream && peer.screenBoostGain) return;
    try {
      const ctx = getAudioCtx();
      const src = ctx.createMediaStreamSource(peer.screenAudioStream);
      peer.screenBoostGain = ctx.createGain();
      peer.screenBoostGain.gain.value = 0;
      src.connect(peer.screenBoostGain);
      peer.screenBoostGain.connect(boostOutput(ctx));
      peer.screenBoostSource = peer.screenAudioStream;
    } catch (err) {
      console.warn('[call] não consegui montar o reforço de volume da tela acima de 100%:', err);
    }
  }

  // videoEl opcional (quando a tile acabou de ser criada e ainda não está na página)
  function applyLocalOverrideToRemoteScreenAudio(userId, videoEl) {
    const peer = peers.get(userId);
    if (!peer) return;
    const el = videoEl || callScreenShareArea.querySelector(`.call-screenshare-tile[data-kind="remote"][data-user-id="${userId}"] video`);
    const factor = getSavedScreenVolume(userId) / 100; // 0–200%
    // acima de 100%: o <video> fica mudo e o reforço leva o som inteiro (um caminho só)
    const boosted = factor > 1 && !!peer.screenBoostGain && !!el;
    if (el) {
      el.volume = boosted ? 1 : Math.min(1, Math.max(0, factor));
      el.muted = isDeafened || boosted;
    }
    // sem tile (parei de assistir) = sem som da tela também, inclusive o do reforço
    if (peer.screenBoostGain) {
      const gain = boosted && !isDeafened ? factor : 0;
      peer.screenBoostGain.gain.setTargetAtTime(gain, getAudioCtx().currentTime, 0.03);
    }
  }

  function applyLocalTrackState() {
    callMicGraph?.gate.mute(isMuted);
    if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
    if (rawMicStream && rawMicStream !== localStream) {
      rawMicStream.getAudioTracks().forEach((track) => { track.enabled = !isMuted; });
    }
  }

  function setMuted(val) {
    isMuted = val;
    applyLocalTrackState();
    if (isMuted) publishLocalSpeaking(false);
    muteBtn.classList.toggle('active', isMuted);
    callViewMuteBtn.classList.toggle('active', isMuted);
    syncLocalVoiceState();
  }

  function setDeafened(val) {
    isDeafened = val;
    for (const peer of peers.values()) {
      applyLocalOverridesToRemoteAudio(peer.userId);
      applyLocalOverrideToRemoteScreenAudio(peer.userId);
    }
    const botEl = document.getElementById('musicbotAudio');
    if (botEl) botEl.muted = isDeafened;
    deafenBtn.classList.toggle('active', isDeafened);
    callViewDeafenBtn.classList.toggle('active', isDeafened);
    if (isDeafened && !isMuted) {
      setMuted(true); // ensurdecer também muta o microfone, igual Discord
    } else {
      syncLocalVoiceState();
    }
  }

  function syncLocalVoiceState() {
    if (!voiceChannel || !currentUser) return;
    callParticipantsState.set(currentUser.id, { muted: isMuted, deafened: isDeafened, cameraOn, screenOn });
    renderCallParticipants();
    Realtime.send('voice_update', { muted: isMuted, deafened: isDeafened, cameraOn, screenOn });
  }

  muteBtn.addEventListener('click', (e) => { e.stopPropagation(); setMuted(!isMuted); });
  deafenBtn.addEventListener('click', (e) => { e.stopPropagation(); setDeafened(!isDeafened); });
  callViewMuteBtn.addEventListener('click', () => setMuted(!isMuted));
  callViewDeafenBtn.addEventListener('click', () => setDeafened(!isDeafened));
  callViewCameraBtn.addEventListener('click', () => toggleCamera());
  callViewScreenBtn.addEventListener('click', () => toggleScreenShare());
  callViewLeaveBtn.addEventListener('click', () => leaveVoiceCall());
  callMinibarLeaveBtn.addEventListener('click', (e) => { e.stopPropagation(); leaveVoiceCall(); });
  callMinibar.addEventListener('click', () => { if (voiceChannel) selectChannel(voiceChannel); });

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
          { browser: 'do navegador (padrão)', own: 'do didiscord (novo)' });
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
      username: b ? b.name : 'DJ didiscord',
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

  // parar/voltar a assistir a tela de alguém. Parar avisa a pessoa pra não mandar mais a tela pra
  // mim — em call com muita gente, isso alivia bastante a internet de quem está compartilhando.
  function setWatchingScreen(userId, watching) {
    if (watching) unwatchedScreens.delete(userId);
    else {
      unwatchedScreens.add(userId);
      closeScreencastPc(peers.get(userId));
    }
    Realtime.send('rtc_signal', { to: userId, data: { kind: 'watch', screen: !!watching } });
    sfuSetScreenSubscribed(userId, !!watching);
    renderScreenShareArea();
    applyLocalOverrideToRemoteScreenAudio(userId);
  }

  function renderScreenShareArea() {
    callScreenShareArea.innerHTML = '';
    const tiles = [];

    if (screenOn && localScreenStream) {
      tiles.push({ kind: 'local', label: 'sua tela', stream: localScreenStream, userId: null });
    } else if (screenOn && nativeScreencast) {
      tiles.push({ kind: 'local-native', label: 'sua tela', userId: null });
    }
    for (const [userId, st] of callParticipantsState.entries()) {
      if (!currentUser || userId === currentUser.id || userId === BOT_USER_ID || !st.screenOn) continue;
      const user = findUser(userId);
      const name = user ? user.username : 'alguém';
      if (unwatchedScreens.has(userId)) {
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
      if (t.kind === 'local-native') {
        // sem prévia de propósito: mostrar a própria tela custaria processador/placa à toa
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
        card.querySelector('.native-screencast-encoder').textContent = nativeScreencast.hardware
          ? `codificando uma vez só, na ${nativeScreencast.encoderName} — quase não pesa no jogo`
          : `codificando uma vez só, no ${nativeScreencast.encoderName}`;
        callScreenShareArea.appendChild(card);
        updateNativeScreencastBadge();
        continue;
      }

      if (t.kind === 'stopped') {
        const card = document.createElement('div');
        card.className = 'call-screenshare-stopped';
        card.innerHTML = `<span class="call-screenshare-stopped-icon">${EYE_OFF_ICON}</span><span class="call-screenshare-stopped-text"></span>`;
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
      video.muted = t.kind === 'local' ? true : isDeafened;
      video.srcObject = t.stream;
      video.play().catch((err) => {
        if (t.kind === 'remote') console.warn('[call] autoplay da tela remota bloqueado pelo navegador:', err);
      });
      if (t.kind === 'remote') applyLocalOverrideToRemoteScreenAudio(t.userId, video);
      tile.appendChild(video);

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

  // ---------- prévia da MINHA tela só roda com o didiscord em foco ----------
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
      if (!st || !st.screenOn || unwatchedScreens.has(peer.userId) || (!screenReceiver && !scLive)) continue;
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

  // ===================================================================
  // compartilhamento de tela pela placa de vídeo (só no app desktop)
  // ===================================================================
  // Pelo navegador, a tela é codificada no processador UMA VEZ POR PESSOA assistindo (a call é em
  // malha) — ~1 núcleo por pessoa em 1080p60, o que derrubava o fps dos jogos. No app desktop, o
  // ffmpeg captura e codifica uma vez só (NVENC/AMF/QSV/VA-API) e o auxiliar didiscord-screencast
  // manda o mesmo vídeo pra cada um, numa conexão própria por pessoa (ver electron/screencast.js).
  //
  // Sinalização (pelo mesmo rtc_signal das calls):
  //   quem compartilha → quem assiste:  sc-offer, sc-cand-s
  //   quem assiste → quem compartilha:  sc-answer, sc-cand-v
  // O áudio da tela continua pelo caminho de sempre (transceiver de áudio da tela em cada conexão).

  const nativeApi = () => (window.didiscordDesktop && window.didiscordDesktop.screencast) || null;

  // a Metered manda cada servidor com "urls" em TEXTO ("turn:..."); o auxiliar (Pion) só aceita LISTA
  // e recusava o comando "start" inteiro ("invalid ICEServer") — o ffmpeg nem ligava e quem assistia
  // via preto. Aqui sempre vira lista.
  function iceServersForHelper() {
    return (iceServers || []).map((srv) => {
      const urls = Array.isArray(srv.urls) ? srv.urls : [srv.urls];
      const out = { urls: urls.filter(Boolean).map(String) };
      if (srv.username) out.username = String(srv.username);
      if (srv.credential) out.credential = String(srv.credential);
      return out;
    }).filter((srv) => srv.urls.length);
  }

  // se a transmissão pela placa de vídeo não começar de verdade logo, desiste e volta pro jeito antigo
  const NATIVE_START_TIMEOUT_MS = 10000;
  let nativeStartTimer = null;

  function abandonNativeScreenShare(why) {
    console.warn('[screencast] desistindo da placa de vídeo:', why);
    clearTimeout(nativeStartTimer);
    nativeStartTimer = null;
    stopScreenShare();
    toast('não deu pra compartilhar pela placa de vídeo — escolha a tela de novo pra ir pelo jeito normal', 'error');
    startScreenShare({ skipNative: true });
  }

  // quem compartilha: garante que o auxiliar esteja (ou não) mandando a tela pra essa pessoa
  function syncNativeViewer(userId, want) {
    const api = nativeApi();
    if (!api || !nativeScreencast) return;
    const has = nativeScreencast.viewers.has(userId);
    if (want && !has) {
      nativeScreencast.viewers.add(userId);
      api.command({ cmd: 'add', viewer: String(userId), iceServers: iceServersForHelper() });
    } else if (!want && has) {
      nativeScreencast.viewers.delete(userId);
      api.command({ cmd: 'remove', viewer: String(userId) });
    }
  }

  // a conexão da tela com essa pessoa caiu: pede pro auxiliar refazer (ele descarta a antiga e manda
  // uma oferta nova). No máximo uma vez a cada 5s por pessoa, e com credencial TURN fresca.
  const nativeResyncAt = new Map();
  function resyncNativeViewer(userId, why) {
    const api = nativeApi();
    if (!api || !nativeScreencast || !nativeScreencast.viewers.has(userId)) return;
    if (Date.now() - (nativeResyncAt.get(userId) || 0) < 5000) return;
    nativeResyncAt.set(userId, Date.now());
    console.warn('[screencast] refazendo a conexão da tela com', userId, '—', why);
    refreshIceServers().finally(() => {
      if (!nativeScreencast || !nativeScreencast.viewers.has(userId)) return;
      api.command({ cmd: 'add', viewer: String(userId), iceServers: iceServersForHelper() });
    });
  }

  // eventos do auxiliar (ofertas pra cada pessoa, estatísticas, fim)
  function handleNativeScreencastEvent(ev) {
    if (!ev || !nativeScreencast) return;
    const to = Number(ev.viewer);
    if (ev.ev === 'offer' && to) {
      Realtime.send('rtc_signal', { to, data: { kind: 'sc-offer', sdp: ev.sdp } });
    } else if (ev.ev === 'candidate' && to) {
      Realtime.send('rtc_signal', { to, data: { kind: 'sc-cand-s', candidate: ev.candidate } });
    } else if (ev.ev === 'state' && to) {
      if (ev.state === 'failed') resyncNativeViewer(to, 'a conexão caiu');
    } else if (ev.ev === 'started') {
      nativeScreencast.started = true;
      clearTimeout(nativeStartTimer);
      nativeStartTimer = null;
    } else if (ev.ev === 'stats') {
      nativeScreencast.stats = ev;
      updateNativeScreencastBadge();
    } else if (ev.ev === 'ended' && !nativeScreencast.started) {
      // morreu antes do primeiro quadro (captura falhou, comando recusado...)
      abandonNativeScreenShare(ev.reason || 'terminou antes de começar');
    } else if (ev.ev === 'ended') {
      // parou sozinho (ffmpeg caiu, janela fechada...) — se fomos nós que paramos, nativeScreencast já é null
      const reason = ev.reason || '';
      stopScreenShare();
      toast(`o compartilhamento de tela parou${reason ? ` (${reason})` : ''}`, 'error');
    } else if (ev.ev === 'error') {
      console.warn('[screencast]', ev.message);
      // erro antes do primeiro quadro = não vai funcionar; depois disso, costuma ser só de uma pessoa
      if (!nativeScreencast.started && !ev.viewer) abandonNativeScreenShare(ev.message);
    }
  }

  let nativeEventsWired = false;
  function wireNativeScreencastEvents() {
    const api = nativeApi();
    if (!api || nativeEventsWired) return;
    nativeEventsWired = true;
    api.onEvent(handleNativeScreencastEvent);
  }

  function updateNativeScreencastBadge() {
    const el = callScreenShareArea.querySelector('.native-screencast-stats');
    if (!el || !nativeScreencast) return;
    const st = nativeScreencast.stats;
    const viewers = nativeScreencast.viewers.size;
    const parts = [];
    if (nativeScreencast.width) parts.push(`${nativeScreencast.width}\u00d7${nativeScreencast.height}`);
    if (st) parts.push(`${Math.round(st.fps)} fps`, st.kbps >= 1000 ? `${(st.kbps / 1000).toFixed(1)} Mbps` : `${st.kbps} kbps`);
    parts.push(viewers === 1 ? '1 pessoa assistindo' : `${viewers} pessoas assistindo`);
    el.textContent = parts.join(' · ');
  }

  // tenta compartilhar pela placa de vídeo. Devolve 'started' | 'cancelled' | 'fallback' (usar o jeito antigo)
  async function startNativeScreenShare({ fps, width, height, wantAudio }) {
    const api = nativeApi();
    if (!api) return 'fallback';
    let info;
    try { info = await api.available(); } catch (_) { return 'fallback'; }
    if (!info || !info.available) {
      if (info && info.deps && info.deps.state === 'downloading') {
        toast(`baixando o componente de compartilhamento pela placa de vídeo (${Math.round((info.deps.progress || 0) * 100)}%) — por enquanto vai pelo jeito normal`);
      }
      return 'fallback';
    }
    wireNativeScreencastEvents();
    const res = await api.start({ fps, width, height, bitrateKbps: getSavedScreenBitrateKbps(), iceServers: iceServersForHelper(), audioRequested: wantAudio });
    if (!res || res.cancelled) return 'cancelled';
    if (!res.ok) {
      console.warn('[screencast] não deu pra usar a placa de vídeo:', res.reason);
      toast('não deu pra compartilhar pela placa de vídeo — indo pelo jeito normal', 'error');
      return 'fallback';
    }

    nativeScreencast = { encoderName: res.encoderName, hardware: res.hardware, width: res.width, height: res.height, viewers: new Set(), stats: null, started: false };
    clearTimeout(nativeStartTimer);
    nativeStartTimer = setTimeout(() => {
      if (nativeScreencast && !nativeScreencast.started) abandonNativeScreenShare('nenhum quadro em 10s');
    }, NATIVE_START_TIMEOUT_MS);
    screenOn = true;
    setScreenButtonsLive(true);
    for (const peer of peers.values()) peer.wantsMyScreen = true;

    // o som da tela vai pelo caminho de sempre (o main.js já preparou a captura pra fonte escolhida)
    localScreenAudioTrack = null;
    if (wantAudio && window.didiscordDesktop.getScreenAudioPlan) {
      try {
        const plan = await window.didiscordDesktop.getScreenAudioPlan();
        if (plan && plan.mode === 'pcm') localScreenAudioTrack = await capturePcmAudioTrack(plan);
      } catch (err) {
        console.warn('[screencast] sem som da tela:', err);
      }
    }
    await Promise.all([...peers.values()].map(applyScreenSendersToPeer));
    sfuSyncScreen();
    renderCallParticipants();
    syncLocalVoiceState();
    return 'started';
  }

  // quem assiste: a conexão que recebe a tela de quem compartilha pela placa de vídeo
  function closeScreencastPc(peer) {
    if (!peer || !peer.scPc) return;
    try { peer.scPc.close(); } catch (_) { /* já fechada */ }
    peer.scPc = null;
    peer.scPending = [];
    peer.scDisplayStream = null;
    screenStatsPrev.delete(`in:${peer.userId}`);
  }

  async function handleScreencastSignal(from, data) {
    const peer = peers.get(from);
    if (data.kind === 'sc-offer') {
      if (!peer) return; // não estou na call com essa pessoa
      closeScreencastPc(peer);
      const pc = new RTCPeerConnection({ iceServers });
      peer.scPc = pc;
      peer.scPending = [];
      pc.ontrack = (ev) => {
        if (peer.scPc !== pc || ev.track.kind !== 'video') return;
        // mesmo <video> com o som da tela (que continua chegando pela conexão normal)
        peer.scDisplayStream = new MediaStream([ev.track, ...peer.screenAudioStream.getAudioTracks()]);
        ev.track.addEventListener('ended', () => renderCallParticipants());
        renderCallParticipants();
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && peer.scPc === pc) Realtime.send('rtc_signal', { to: from, data: { kind: 'sc-cand-v', candidate: e.candidate } });
      };
      // caiu (rede trocou, TURN venceu...): pede pra quem compartilha mandar a tela de novo — antes
      // ficava tela preta/congelada até parar e voltar a assistir
      pc.onconnectionstatechange = () => {
        if (peer.scPc === pc && pc.connectionState === 'failed') {
          Realtime.send('rtc_signal', { to: from, data: { kind: 'sc-retry' } });
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      Realtime.send('rtc_signal', { to: from, data: { kind: 'sc-answer', sdp: pc.localDescription } });
      for (const c of peer.scPending.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    } else if (data.kind === 'sc-cand-s') {
      if (!peer || !peer.scPc) return;
      if (!peer.scPc.remoteDescription) peer.scPending.push(data.candidate);
      else await peer.scPc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    } else if (data.kind === 'sc-retry') {
      resyncNativeViewer(from, 'quem assiste pediu');
    } else if (data.kind === 'sc-answer' || data.kind === 'sc-cand-v') {
      // eu sou quem compartilha: repassa pro auxiliar
      const api = nativeApi();
      if (!api || !nativeScreencast || !nativeScreencast.viewers.has(from)) return;
      if (data.kind === 'sc-answer') api.command({ cmd: 'answer', viewer: String(from), sdp: data.sdp });
      else api.command({ cmd: 'candidate', viewer: String(from), candidate: data.candidate });
    }
  }


  // ===================================================================
  // calls pelo servidor de mídia (SFU) — LiveKit rodando no PC do servidor
  // ===================================================================
  // Com SFU=livekit no .env do servidor (ver server/sfu/livekit.js), cada pessoa manda voz, câmera
  // e tela UMA vez pro servidor, e ele repassa pros outros. Sem isso, vale a malha de sempre (uma
  // conexão direta com cada pessoa) — o resto deste arquivo. O que continua igual nos dois modos:
  //   - quem está na call, mudo/surdo, "falando" etc. (tudo pelo WebSocket do site)
  //   - o objeto `peer` de cada pessoa (newPeer): aqui ele só não tem RTCPeerConnection própria;
  //     as faixas que chegam do servidor entram nos mesmos streams (audioStream, screenStream…)
  //   - a tela pela placa de vídeo do app desktop: o auxiliar ainda manda direto pra cada pessoa
  let sfu = null;          // { room, lib, pubs: Map(tipo -> publicação), queue: Map(tipo -> Promise), reconnecting }
  let sfuRequired = false; // o servidor disse que esta call é pelo SFU (mesmo se a conexão caiu e está voltando)
  let sfuRetryTimer = null;
  let sfuLibPromise = null;

  function loadSfuLib() {
    if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
    if (!sfuLibPromise) {
      sfuLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/vendor/livekit/livekit-client.umd.js?v=2.23.0';
        s.onload = () => (window.LivekitClient ? resolve(window.LivekitClient) : reject(new Error('a biblioteca do servidor de mídia não carregou')));
        s.onerror = () => reject(new Error('não consegui baixar a biblioteca do servidor de mídia'));
        document.head.appendChild(s);
      }).catch((err) => { sfuLibPromise = null; throw err; });
    }
    return sfuLibPromise;
  }

  const sfuActive = () => !!sfu || sfuRequired;

  // identidade no LiveKit = id da conta
  function sfuUserId(participant) {
    const id = Number(participant && participant.identity);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function sfuEnsurePeer(userId) {
    let peer = peers.get(userId);
    if (peer) return peer;
    peer = newPeer(userId);
    peer.sfu = true;
    peer.iceState = sfu && !sfu.reconnecting ? 'connected' : 'disconnected';
    peers.set(userId, peer);
    if (voiceStatsTimer === null) voiceStatsTimer = setInterval(updateVoiceStats, 1500);
    // compartilhando pela placa de vídeo: a tela pra essa pessoa sai pelo auxiliar (conexão própria)
    applyScreenSendersToPeer(peer);
    return peer;
  }

  function sfuMarkPeers(connected) {
    for (const peer of peers.values()) if (peer.sfu) peer.iceState = connected ? 'connected' : 'disconnected';
    refreshConnectionStatus();
  }

  function sfuTrackSubscribed(track, publication, participant) {
    const userId = sfuUserId(participant);
    if (userId == null || (currentUser && userId === currentUser.id)) return;
    const peer = sfuEnsurePeer(userId);
    const mst = track.mediaStreamTrack;
    const source = publication.source;
    if (source === 'microphone') {
      for (const old of peer.audioStream.getTracks()) peer.audioStream.removeTrack(old);
      peer.audioStream.addTrack(mst);
      peer.sfuMicReceiver = track.receiver || null;
      peer.voiceStatsPrevious = null;
      // faixa nova = refaz o que lê direto dela (reforço acima de 100% e indicador de fala)
      if (peer.boostGain) { try { peer.boostGain.disconnect(); } catch (_) { /* já desligado */ } }
      peer.boostGain = null;
      peer.boostSource = null;
      connectPeerAudio(peer);
      if (!peer.hasSpeakingSignal) setupRemoteSpeakingDetection(peer);
    } else if (source === 'screen_share_audio') {
      for (const s of [peer.screenStream, peer.screenAudioStream]) {
        for (const old of s.getAudioTracks()) s.removeTrack(old);
        s.addTrack(mst);
      }
      if (peer.scDisplayStream) peer.scDisplayStream.addTrack(mst);
      if (peer.screenBoostGain) { try { peer.screenBoostGain.disconnect(); } catch (_) { /* já desligado */ } }
      peer.screenBoostGain = null;
      peer.screenBoostSource = null;
      ensurePeerScreenBoostGraph(peer);
      applyLocalOverrideToRemoteScreenAudio(userId);
    } else if (track.kind === 'video') {
      const isScreen = source === 'screen_share';
      const target = isScreen ? peer.screenStream : peer.cameraStream;
      for (const old of target.getVideoTracks()) target.removeTrack(old);
      target.addTrack(mst);
      if (isScreen) peer.sfuScreenReceiver = track.receiver || null;
      mst.addEventListener('mute', () => renderCallParticipants());
      mst.addEventListener('unmute', () => renderCallParticipants());
    }
    renderCallParticipants();
  }

  function sfuTrackUnsubscribed(track, publication, participant) {
    const peer = peers.get(sfuUserId(participant));
    if (!peer) return;
    const mst = track.mediaStreamTrack;
    for (const s of [peer.audioStream, peer.cameraStream, peer.screenStream, peer.screenAudioStream, peer.scDisplayStream]) {
      if (s && mst) { try { s.removeTrack(mst); } catch (_) { /* não estava nesse */ } }
    }
    if (publication.source === 'microphone') peer.sfuMicReceiver = null;
    if (publication.source === 'screen_share') { peer.sfuScreenReceiver = null; screenStatsPrev.delete(`in:${peer.userId}`); }
    renderCallParticipants();
  }

  // "parar de assistir" a tela de alguém: no SFU é só deixar de assinar as faixas da tela dela
  function sfuSetScreenSubscribed(userId, on) {
    if (!sfu) return;
    const participant = sfu.room.remoteParticipants.get(String(userId));
    if (!participant) return;
    for (const pub of participant.trackPublications.values()) {
      if (/^screen_share/.test(pub.source)) { try { pub.setSubscribed(on); } catch (_) { /* some sozinha se a faixa acabou */ } }
    }
  }

  function sfuPublishOptions(kind, LK) {
    const S = LK.Track.Source;
    // voz: sem DTX (cortava começo de palavra), com RED (cada pacote leva uma cópia do anterior)
    if (kind === 'mic') return { source: S.Microphone, name: 'mic', dtx: false, red: true, forceStereo: false, audioPreset: { maxBitrate: AUDIO_MAX_BITRATE.mic }, stopMicTrackOnMute: false };
    if (kind === 'screenAudio') return { source: S.ScreenShareAudio, name: 'som-da-tela', dtx: false, red: false, forceStereo: true, audioPreset: { maxBitrate: AUDIO_MAX_BITRATE.screen } };
    // uma qualidade só por faixa (sem simulcast): menos processador pra quem envia, igual à malha
    if (kind === 'camera') return { source: S.Camera, name: 'camera', simulcast: false };
    const kbps = getSavedScreenBitrateKbps();
    const encoding = { maxBitrate: (kbps > 0 ? kbps : SCREEN_MAX_BITRATE_KBPS) * 1000, maxFramerate: getSavedScreenFps() };
    return {
      source: S.ScreenShare, name: 'tela', simulcast: false,
      screenShareEncoding: encoding, videoEncoding: encoding,
      degradationPreference: SCREEN_PRIORITIES[getSavedScreenPriority()].degradation,
    };
  }

  // publica, troca ou tira uma das minhas faixas ('mic' | 'camera' | 'screen' | 'screenAudio').
  // Uma fila por tipo: ligar e desligar rápido nunca atropela a operação anterior.
  function sfuSetTrack(kind, track) {
    const ctx = sfu;
    if (!ctx) return Promise.resolve();
    const run = async () => {
      if (sfu !== ctx) return;
      const local = ctx.room.localParticipant;
      const cur = ctx.pubs.get(kind);
      if (((cur && cur.track && cur.track.mediaStreamTrack) || null) === track) return;
      // microfone remontado (trocou supressão, aparelho…): troca a faixa sem tirar do ar
      if (cur && cur.track && track && kind === 'mic') { await cur.track.replaceTrack(track, true); return; }
      if (cur) {
        ctx.pubs.delete(kind);
        try { if (cur.track) await local.unpublishTrack(cur.track, false); } catch (_) { /* já tinha saído */ }
      }
      if (!track || sfu !== ctx) return;
      const pub = await local.publishTrack(track, sfuPublishOptions(kind, ctx.lib));
      if (sfu !== ctx) return;
      ctx.pubs.set(kind, pub);
      if (kind === 'screen' && pub.track && pub.track.sender) applyScreenBitrate(pub.track.sender);
    };
    const next = (ctx.queue.get(kind) || Promise.resolve()).then(run)
      .catch((err) => console.warn('[sfu] não consegui publicar', kind, err));
    ctx.queue.set(kind, next);
    return next;
  }

  // a tela pelo navegador vai pelo SFU; pela placa de vídeo o VÍDEO sai pelo auxiliar e só o som vai por aqui
  function sfuSyncScreen() {
    if (!sfu) return Promise.resolve();
    const video = screenOn && !nativeScreencast && localScreenStream ? (localScreenStream.getVideoTracks()[0] || null) : null;
    const audio = screenOn ? (localScreenAudioTrack || (localScreenStream && localScreenStream.getAudioTracks()[0]) || null) : null;
    return Promise.all([sfuSetTrack('screen', video), sfuSetTrack('screenAudio', audio)]);
  }

  function sfuPublishAll() {
    if (!sfu) return;
    sfuSetTrack('mic', (localStream && localStream.getAudioTracks()[0]) || null);
    sfuSetTrack('camera', cameraOn && localCameraStream ? (localCameraStream.getVideoTracks()[0] || null) : null);
    sfuSyncScreen();
  }

  // conecta na sala do canal. Devolve false se o servidor não usa SFU (aí a call vai em malha)
  async function sfuConnect(ch) {
    const res = await fetch(`/api/rtc/sfu?channelId=${ch.id}`);
    const info = res.ok ? await res.json() : null;
    if (!info || !info.enabled) return false;
    sfuRequired = true;
    const LK = await loadSfuLib();
    try { LK.setLogLevel('warn'); } catch (_) { /* só deixa o console mais limpo */ }
    const room = new LK.Room({ adaptiveStream: false, dynacast: false });
    const ctx = { room, lib: LK, pubs: new Map(), queue: new Map(), reconnecting: false };
    const mine = (fn) => (...args) => { if (sfu === ctx) fn(...args); };
    room.on(LK.RoomEvent.TrackSubscribed, mine(sfuTrackSubscribed));
    room.on(LK.RoomEvent.TrackUnsubscribed, mine(sfuTrackUnsubscribed));
    room.on(LK.RoomEvent.TrackPublished, mine((publication, participant) => {
      // tela de alguém que eu tinha parado de assistir: continua sem assistir
      if (/^screen_share/.test(publication.source) && unwatchedScreens.has(sfuUserId(participant))) {
        try { publication.setSubscribed(false); } catch (_) { /* ok */ }
      }
    }));
    room.on(LK.RoomEvent.Reconnecting, mine(() => { ctx.reconnecting = true; sfuMarkPeers(false); }));
    room.on(LK.RoomEvent.Reconnected, mine(() => { ctx.reconnecting = false; sfuMarkPeers(true); }));
    room.on(LK.RoomEvent.Disconnected, mine((reason) => {
      // caiu de vez (o servidor de mídia reiniciou, a rede sumiu por muito tempo…): tenta voltar sozinho
      console.warn('[sfu] conexão com o servidor de mídia caiu:', reason);
      sfu = null;
      sfuScheduleRetry();
    }));
    sfu = ctx;
    try {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      await room.connect(`${scheme}://${location.host}${info.path}`, info.token, { autoSubscribe: true });
    } catch (err) {
      if (sfu === ctx) sfu = null;
      try { room.disconnect(false); } catch (_) { /* nem conectou */ }
      throw err;
    }
    return sfu === ctx;
  }

  function sfuScheduleRetry() {
    clearTimeout(sfuRetryTimer);
    const ch = voiceChannel;
    if (!ch || !sfuRequired) return;
    sfuMarkPeers(false);
    sfuRetryTimer = setTimeout(async () => {
      if (voiceChannel !== ch || sfu) return;
      try {
        if (await sfuConnect(ch)) {
          if (voiceChannel !== ch) { sfuDisconnect(); return; }
          sfuMarkPeers(true);
          sfuPublishAll();
          return;
        }
      } catch (err) {
        console.warn('[sfu] ainda sem conexão com o servidor de mídia:', err && err.message);
      }
      if (voiceChannel === ch && !sfu) sfuScheduleRetry();
    }, 4000);
  }

  function sfuDisconnect() {
    clearTimeout(sfuRetryTimer);
    sfuRetryTimer = null;
    sfuRequired = false;
    const ctx = sfu;
    sfu = null;
    // false: não para as minhas faixas — quem cuida delas é o resto do código da call
    if (ctx) { try { ctx.room.disconnect(false); } catch (_) { /* já fechada */ } }
  }

  // ===================================================================
  // chamada em grupo — uma RTCPeerConnection por pessoa ("malha"/mesh)
  // ===================================================================
  // Cada pessoa da call tem uma conexão direta com cada uma das outras. Quem ACABOU de entrar é
  // quem liga (manda a oferta) pra cada um que já estava (voice_channel_state); quem já estava só
  // responde. Cada conexão tem 4 "canais" fixos (transceivers): mic, câmera, tela e áudio da tela —
  // ligar/desligar câmera ou tela só troca a faixa (replaceTrack), sem renegociar nada.

  function newPeer(userId) {
    return {
      userId,
      pc: null,
      isInitiator: false,
      mic: null, camera: null, screen: null, screenAudio: null, // transceivers
      audioStream: new MediaStream(), // mic dela
      cameraStream: new MediaStream(),
      screenStream: new MediaStream(), // vídeo + áudio da tela dela (mesmo <video>, fica sincronizado)
      screenAudioStream: new MediaStream(), // só o áudio da tela — alimenta o reforço acima de 100%
      audioEl: null,
      boostGain: null, boostSource: null,
      screenBoostGain: null, screenBoostSource: null,
      analyser: null,
      pendingCandidates: [],
      iceRestartTimer: null,
      iceState: 'new',
      wantsMyScreen: true, // essa pessoa quer receber a minha tela? (ela pode "parar de assistir")
    };
  }

  function setupRemoteSpeakingDetection(peer) {
    peer.analyser = null;
    try {
      const ctx = getAudioCtx();
      const src = ctx.createMediaStreamSource(peer.audioStream);
      peer.analyser = ctx.createAnalyser();
      peer.analyser.fftSize = 512;
      src.connect(peer.analyser);
    } catch (_) { /* sem indicador de fala pra essa pessoa — o resto funciona */ }
  }

  function stopSpeakingDetection() {
    localAnalyser = null;
    for (const peer of peers.values()) peer.analyser = null;
    if (legacySpeakingTimer) { clearTimeout(legacySpeakingTimer); legacySpeakingTimer = null; }
  }

  async function flushPendingIceCandidates(peer) {
    while (peer.pendingCandidates.length) {
      const candidate = peer.pendingCandidates.shift();
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) { /* candidato tardio ou inválido */ }
    }
  }

  function setCallConnectionStatus(text) {
    if (text) {
      callConnectionStatus.textContent = text;
      callConnectionStatus.hidden = false;
    } else {
      callConnectionStatus.hidden = true;
    }
  }

  // "reconectando…" se a conexão com alguém caiu; senão o aviso fixo (ex: sem microfone)
  function refreshConnectionStatus() {
    const reconnecting = [...peers.values()].some((p) => p.iceState === 'disconnected' || p.iceState === 'failed');
    setCallConnectionStatus(reconnecting ? 'reconectando…' : baseCallStatus);
  }

  function getSelectedCandidatePair(stats, transportId) {
    const transport = stats.get(transportId);
    if (transport?.selectedCandidatePairId) return stats.get(transport.selectedCandidatePairId);
    for (const report of stats.values()) {
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        const pair = stats.get(report.selectedCandidatePairId);
        if (pair) return pair;
      }
    }
    return [...stats.values()].find((report) => report.type === 'candidate-pair' && report.selected);
  }

  function getCandidateRoute(stats, pair) {
    const local = stats.get(pair?.localCandidateId)?.candidateType;
    const remote = stats.get(pair?.remoteCandidateId)?.candidateType;
    if (local === 'relay' || remote === 'relay') return 'via TURN';
    return local && remote ? 'direta' : null;
  }

  async function logSelectedCandidatePair(peer) {
    try {
      const stats = await peer.pc.getStats();
      const route = getCandidateRoute(stats, getSelectedCandidatePair(stats));
      if (route) console.log(`[call] conexão com ${peer.userId}: ${route}`);
    } catch (_) { /* só diagnóstico */ }
  }

  function readPeerVoiceStats(peer, stats) {
    const mid = peer.mic?.mid;
    const trackId = peer.mic?.receiver.track.id;
    const inbound = [...stats.values()].find((report) =>
      report.type === 'inbound-rtp' && (report.kind || report.mediaType) === 'audio' &&
      // pelo servidor de mídia o relatório já vem só da faixa de voz dessa pessoa
      (peer.sfu || (mid != null && report.mid === mid) || (trackId && report.trackIdentifier === trackId))
    );
    const pair = getSelectedCandidatePair(stats, inbound?.transportId);
    const previous = peer.voiceStatsPrevious;
    peer.voiceStatsPrevious = inbound;

    // Usa deltas da mesma faixa. Contadores de outra conexão ou que voltaram a zero
    // não dizem nada sobre o intervalo atual.
    function delta(key) {
      if (!inbound || previous?.id !== inbound.id) return null;
      const value = inbound[key] - previous[key];
      return Number.isFinite(value) && value >= 0 ? value : null;
    }
    const received = delta('packetsReceived');
    // A perda acumulada pode diminuir quando chegam pacotes atrasados.
    const lost = inbound && previous?.id === inbound.id ? inbound.packetsLost - previous.packetsLost : NaN;
    const loss = received !== null && Number.isFinite(lost) && received + Math.max(0, lost) > 0
      ? 100 * Math.max(0, lost) / (received + Math.max(0, lost)) : null;
    const elapsed = delta('timestamp');
    const bytes = delta('bytesReceived');
    const bitrate = elapsed > 0 && bytes !== null ? 8 * bytes / elapsed : null;
    const discarded = delta('packetsDiscarded');
    const delay = delta('jitterBufferDelay');
    const emitted = delta('jitterBufferEmittedCount');
    const bufferMs = emitted > 0 && delay !== null ? 1000 * delay / emitted : null;
    const concealed = delta('concealedSamples');
    const samples = delta('totalSamplesReceived');
    const concealment = samples > 0 && concealed !== null ? 100 * concealed / samples : null;
    const jitter = Number.isFinite(inbound?.jitter) ? 1000 * inbound.jitter : null;
    const rtt = Number.isFinite(pair?.currentRoundTripTime) ? 1000 * pair.currentRoundTripTime : null;

    // Heurística local de diagnóstico. Classifica pelo pior dos sinais disponíveis.
    const quality = [
      [loss, 2, 5], [jitter, 25, 50], [rtt, 150, 300], [concealment, 2, 5],
    ].reduce((worst, [value, medium, bad]) => value === null ? worst :
      Math.max(worst, value >= bad ? 3 : value >= medium ? 2 : 1), 0);

    return {
      loss, jitter, rtt, bitrate, discarded, bufferMs, concealed, concealment, quality,
      route: peer.sfu ? 'pelo servidor de mídia' : getCandidateRoute(stats, pair),
      micRed: peer.micRed,
    };
  }

  function renderPeerVoiceStats(details, stats) {
    const summary = details.querySelector('summary');
    const quality = stats?.quality || 0;
    const label = ['sem dados', 'bom', 'médio', 'ruim'][quality];
    const heading = 'voz: ' + label;
    if (summary.textContent !== heading) summary.textContent = heading;
    details.dataset.quality = String(quality);
    if (!details.open && details.lastElementChild.childElementCount) return;
    const format = (value, unit, precision = 0) =>
      Number.isFinite(value) ? `${value.toLocaleString('pt-BR', { maximumFractionDigits: precision })}${unit}` : '—';
    const hiddenAudio = format(stats?.concealed, ' amostras');
    const metrics = [
      ['conexão', stats?.route || '—'],
      ['perda recebida', format(stats?.loss, '%', 1)],
      ['jitter', format(stats?.jitter, ' ms', 1)],
      ['RTT', format(stats?.rtt, ' ms')],
      ['bitrate recebido', format(stats?.bitrate, ' kb/s')],
      ['redundância de voz', stats?.micRed == null ? '—' : stats.micRed ? 'Opus + RED' : 'Opus (FEC)'],
      ['buffer de voz', format(stats?.bufferMs, ' ms', 1)],
      ['piso do buffer', stats ? (stats.bufferTarget ? format(stats.bufferTarget, ' ms') : 'automática') : '—'],
      ['áudio reconstruído', stats?.concealment == null ? hiddenAudio : `${hiddenAudio} (${format(stats.concealment, '%', 1)})`],
    ];
    const list = details.lastElementChild;
    list.replaceChildren(...metrics.flatMap(([name, value]) => {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = name;
      description.textContent = value;
      return [term, description];
    }));
  }

  function updateVoiceJitterBuffer(peer, stats) {
    const receiver = peer.mic?.receiver;
    if (!receiver || peer.voiceBufferUnsupported) return;
    // DESLIGADO: cada vez que o alvo do buffer muda, o navegador acelera ou estica a voz pra chegar
    // no atraso novo — e como o alvo subia e voltava conforme a rede oscilava, a voz de quem fala
    // ficava "mudando" no meio da frase. O buffer do próprio navegador (NetEQ) já se adapta sozinho,
    // de forma contínua; é esse comportamento padrão que o Discord usa. O código abaixo fica só de
    // referência, caso um dia valha testar de novo com um alvo fixo.
    if (peer.mic) return;
    const property = 'jitterBufferTarget' in receiver ? 'jitterBufferTarget'
      : 'playoutDelayHint' in receiver ? 'playoutDelayHint' : null;
    if (!property) {
      peer.voiceBufferUnsupported = true;
      return;
    }

    const current = peer.voiceBufferTarget || null;
    const { jitter, discarded, concealment } = stats;
    let target = current;
    if (jitter !== null && (jitter >= 25 || (jitter >= 10 && (discarded > 0 || concealment >= 2)))) {
      // No Chromium o valor funciona como piso. Aumenta só quando há variação na
      // chegada dos pacotes, pois segurar áudio não recupera perda pura de rede.
      target = Math.max(current || 0, Math.min(100, Math.max(40, Math.ceil(jitter / 10) * 20)));
      peer.voiceBufferCleanSamples = 0;
    } else if (current && jitter !== null && jitter < 15) {
      // NetEQ também pode descartar cópias RED. Com chegada estável, deixa o navegador
      // reduzir o atraso, mesmo se os contadores ainda mostrarem descartes ou perda.
      peer.voiceBufferCleanSamples = (peer.voiceBufferCleanSamples || 0) + 1;
      if (peer.voiceBufferCleanSamples >= 4) target = null;
    } else {
      peer.voiceBufferCleanSamples = 0;
    }

    if (target === current) return;
    try {
      receiver[property] = property === 'jitterBufferTarget' || target === null ? target : target / 1000;
      peer.voiceBufferTarget = target;
    } catch (_) {
      peer.voiceBufferUnsupported = true;
    }
  }

  function updateVoiceStats() {
    for (const peer of peers.values()) {
      if (peer.voiceStatsPending || !['connected', 'completed'].includes(peer.iceState)) continue;
      const statsSource = peer.sfu ? peer.sfuMicReceiver : peer.pc;
      if (!statsSource) continue;
      peer.voiceStatsPending = true;
      statsSource.getStats().then((stats) => {
        if (peers.get(peer.userId) !== peer || !['connected', 'completed'].includes(peer.iceState)) return;
        peer.voiceStats = readPeerVoiceStats(peer, stats);
        updateVoiceJitterBuffer(peer, peer.voiceStats);
        peer.voiceStats.bufferTarget = peer.voiceBufferTarget;
        const details = callParticipants.querySelector(`[data-user-id="${peer.userId}"] .call-voice-stats`);
        if (details) renderPeerVoiceStats(details, peer.voiceStats);
      }).catch(() => { /* diagnóstico opcional, sem interferir no áudio */ })
        .finally(() => { peer.voiceStatsPending = false; });
    }
  }

  // a conexão com alguém caiu: quem ligou originalmente liga de novo (só um lado, pra não cruzar)
  function attemptIceRestart(peer) {
    if (!voiceChannel || peers.get(peer.userId) !== peer || !peer.isInitiator) return;
    // credencial TURN fresca antes de religar: a do começo da call vence em ~1h, e com ela vencida
    // quem depende do TURN (outra rede, 4G) nunca mais reconecta
    refreshIceServers().finally(() => {
      if (!voiceChannel || peers.get(peer.userId) !== peer) return;
      createPeer(peer.userId, true).catch((err) => console.warn('[call] falha ao reconectar com', peer.userId, err));
    });
  }

  // os 4 canais fixos da conexão, sempre na mesma ordem: 0 mic, 1 câmera, 2 tela, 3 áudio da tela
  function setupTransceivers(peer, isInitiator) {
    let list;
    if (isInitiator) {
      list = [
        peer.pc.addTransceiver('audio', { direction: 'sendrecv', sendEncodings: [audioEncoding('mic')] }),
        peer.pc.addTransceiver('video', { direction: 'sendrecv' }),
        peer.pc.addTransceiver('video', { direction: 'sendrecv' }),
        peer.pc.addTransceiver('audio', { direction: 'sendrecv', sendEncodings: [audioEncoding('screen')] }),
      ];
    } else {
      // quem responde recebe os transceivers prontos da oferta, na mesma ordem
      list = peer.pc.getTransceivers().slice(0, 4);
      list.forEach((t) => { if (t) t.direction = 'sendrecv'; });
    }
    [peer.mic, peer.camera, peer.screen, peer.screenAudio] = list;
    if (isInitiator || descriptionPrefersMicRed(peer.pc.remoteDescription)) {
      peer.micRedCapable = setMicRedPreferences(peer.mic, !isInitiator);
    }

    const micTrack = localStream && localStream.getAudioTracks()[0];
    if (micTrack && peer.mic) peer.mic.sender.replaceTrack(micTrack).catch(() => {});
    if (cameraOn && localCameraStream && peer.camera) peer.camera.sender.replaceTrack(localCameraStream.getVideoTracks()[0]).catch(() => {});
    applyScreenSendersToPeer(peer);
  }

  // manda (ou para de mandar) a minha tela pra essa pessoa — só se eu estou compartilhando E ela
  // está assistindo
  async function applyScreenSendersToPeer(peer) {
    const wants = screenOn && peer.wantsMyScreen;
    // pela placa de vídeo: o vídeo sai pelo auxiliar; pela conexão normal vai só o som da tela
    if (nativeScreencast) syncNativeViewer(peer.userId, wants);
    const videoTrack = wants && localScreenStream ? (localScreenStream.getVideoTracks()[0] || null) : null;
    const audioTrack = wants ? (localScreenAudioTrack || (localScreenStream && localScreenStream.getAudioTracks()[0]) || null) : null;
    if (peer.screen) {
      try {
        await peer.screen.sender.replaceTrack(videoTrack);
        if (videoTrack) await applyScreenBitrate(peer.screen.sender);
      } catch (_) { /* segue sem enviar se a troca falhar */ }
    }
    if (peer.screenAudio) {
      try { await peer.screenAudio.sender.replaceTrack(audioTrack); } catch (_) { /* idem */ }
    }
  }

  // troca a faixa de um dos canais ('camera' | 'screen' | 'screenAudio' | 'mic') em todas as conexões
  function replaceOnAllPeers(kind, track) {
    if (sfuActive()) {
      return kind === 'screen' || kind === 'screenAudio' ? sfuSyncScreen() : sfuSetTrack(kind, track);
    }
    return Promise.all([...peers.values()].map((peer) => {
      const t = peer[kind];
      return t ? t.sender.replaceTrack(track).catch(() => {}) : null;
    }));
  }

  async function createPeer(userId, isInitiator) {
    if (sfuActive()) return sfuEnsurePeer(userId); // pelo servidor de mídia não tem conexão por pessoa
    closePeer(userId);
    const peer = newPeer(userId);
    peer.isInitiator = isInitiator;
    // Os quatro transceivers compartilham ICE/DTLS quando o outro cliente aceita BUNDLE.
    // Mantém a conexão do auxiliar de screencast fora desta configuração.
    try {
      peer.pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    } catch (_) {
      peer.pc = new RTCPeerConnection({ iceServers });
    }
    peers.set(userId, peer); // antes de qualquer await: candidatos que chegarem já acham a conexão
    if (voiceStatsTimer === null) voiceStatsTimer = setInterval(updateVoiceStats, 1500);
    const pc = peer.pc;
    const isCurrent = () => peers.get(userId) === peer;

    pc.ontrack = (ev) => {
      if (!isCurrent()) return;
      // a POSIÇÃO do transceiver diz o que é (0 mic, 1 câmera, 2 tela, 3 áudio da tela), mas o tipo
      // real da faixa manda mais: áudio nunca vira vídeo, mesmo se a posição vier estranha
      const idx = pc.getTransceivers().indexOf(ev.transceiver);
      if (ev.track.kind === 'audio') {
        if (idx === 3) {
          peer.screenStream.addTrack(ev.track);
          peer.screenAudioStream.addTrack(ev.track);
          if (peer.scDisplayStream) peer.scDisplayStream.addTrack(ev.track);
          ev.track.addEventListener('ended', () => {
            peer.screenStream.removeTrack(ev.track);
            peer.screenAudioStream.removeTrack(ev.track);
          });
          ensurePeerScreenBoostGraph(peer);
          renderCallParticipants();
        } else {
          peer.audioStream.addTrack(ev.track);
          connectPeerAudio(peer);
          if (!peer.hasSpeakingSignal) setupRemoteSpeakingDetection(peer);
        }
        return;
      }
      const target = idx === 2 ? peer.screenStream : peer.cameraStream;
      target.addTrack(ev.track);
      ev.track.addEventListener('ended', () => { target.removeTrack(ev.track); renderCallParticipants(); });
      ev.track.addEventListener('mute', () => renderCallParticipants());
      ev.track.addEventListener('unmute', () => renderCallParticipants());
      renderCallParticipants();
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && isCurrent()) {
        Realtime.send('rtc_signal', { to: userId, data: { kind: 'candidate', candidate: ev.candidate } });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (!isCurrent()) return;
      const state = pc.iceConnectionState;
      peer.iceState = state;
      if (state === 'disconnected' || state === 'failed') {
        peer.voiceStats = null;
        peer.voiceStatsPrevious = null;
        peer.voiceBufferCleanSamples = 0;
        const details = callParticipants.querySelector(`[data-user-id="${userId}"] .call-voice-stats`);
        if (details) renderPeerVoiceStats(details, null);
      }
      if (state === 'connected' || state === 'completed') {
        if (peer.iceRestartTimer) { clearTimeout(peer.iceRestartTimer); peer.iceRestartTimer = null; }
        logSelectedCandidatePair(peer);
      } else if (state === 'disconnected') {
        // às vezes se resolve sozinho em alguns segundos — só reconecta se continuar caído
        if (peer.iceRestartTimer) clearTimeout(peer.iceRestartTimer);
        peer.iceRestartTimer = setTimeout(() => {
          if (isCurrent() && pc.iceConnectionState === 'disconnected') attemptIceRestart(peer);
        }, 3000);
      } else if (state === 'failed') {
        attemptIceRestart(peer);
      }
      refreshConnectionStatus();
    };

    if (isInitiator) {
      setupTransceivers(peer, true);
      const offer = await setLocalVoiceDescription(peer, 'offer');
      if (!isCurrent()) return peer;
      Realtime.send('rtc_signal', { to: userId, data: {
        kind: 'offer', sdp: offer, micRed: peer.micRedCapable && !!micSdpPayloads(offer)?.hasRed,
      } });
      // se eu já tinha parado de assistir a tela dessa pessoa, avisa de novo na conexão nova
      if (unwatchedScreens.has(userId)) Realtime.send('rtc_signal', { to: userId, data: { kind: 'watch', screen: false } });
    }
    return peer;
  }

  // o WebRTC começa estimando a banda MUITO baixa (~100 kbps) e sobe devagar — o começo de todo
  // compartilhamento de tela ficava em 320x180 a ~9 fps por vários segundos ("limitado pela
  // internet", mesmo com internet sobrando). x-google-start-bitrate faz começar de um ponto
  // razoável; daí pra frente o controle de congestionamento ajusta normalmente, pra cima ou pra baixo.
  const VIDEO_START_BITRATE_KBPS = 2500;

  // ---------- qualidade do áudio (Opus / RED) ----------
  const RED_MIC_BITRATE = 64000;
  const AUDIO_MAX_BITRATE = { mic: 96000, screen: 192000 };
  const OPUS_PARAMS = {
    mic: { maxaveragebitrate: AUDIO_MAX_BITRATE.mic, maxplaybackrate: 48000, stereo: 0, 'sprop-stereo': 0, useinbandfec: 1, usedtx: 0, cbr: 0 },
    screen: { maxaveragebitrate: AUDIO_MAX_BITRATE.screen, maxplaybackrate: 48000, stereo: 1, 'sprop-stereo': 1, useinbandfec: 1, usedtx: 0, cbr: 0 },
  };

  function audioEncoding(kind, micRed = false) {
    // Prioridade alta: com a banda apertada, o áudio é o último a perder qualidade.
    const maxBitrate = kind === 'mic' && micRed ? RED_MIC_BITRATE : AUDIO_MAX_BITRATE[kind];
    return { maxBitrate, priority: 'high', networkPriority: 'high' };
  }

  function getMicRedPreferences(preferRed) {
    const codecs = RTCRtpReceiver.getCapabilities?.('audio')?.codecs || [];
    const opus = codecs.find((codec) => codec.mimeType.toLowerCase() === 'audio/opus' && codec.clockRate === 48000);
    const red = codecs.find((codec) => codec.mimeType.toLowerCase() === 'audio/red' &&
      codec.clockRate === 48000 && codec.channels === opus?.channels);
    if (!opus || !red) return null;
    const first = preferRed ? [red, opus] : [opus, red];
    return first.concat(codecs.filter((codec) => codec !== red && codec !== opus));
  }

  function setMicRedPreferences(transceiver, preferRed) {
    if (!transceiver?.setCodecPreferences) return false;
    try {
      const codecs = getMicRedPreferences(preferRed);
      if (!codecs) return false;
      transceiver.setCodecPreferences(codecs);
      return true;
    } catch (_) {
      return false;
    }
  }

  function audioSdpPayloads(section) {
    const lines = section.split('\r\n');
    const payloads = lines[0].trim().split(/ +/).slice(3);
    const formats = new Map();
    for (const line of lines) {
      const match = /^a=rtpmap:(\d+) (opus|red)\/48000(?:\/|$)/i.exec(line);
      if (match) formats.set(match[2].toLowerCase(), match[1]);
    }
    const opus = formats.get('opus');
    const red = formats.get('red');
    const wrapped = lines.find((line) => line.startsWith(`a=fmtp:${red} `))?.slice(`a=fmtp:${red} `.length).trim().split('/');
    const redIndex = payloads.indexOf(red);
    const opusIndex = payloads.indexOf(opus);
    const hasRed = redIndex >= 0 && opusIndex >= 0 && wrapped?.length >= 2 && wrapped.every((id) => id === opus);
    return { opus, red, hasRed, prefersRed: hasRed && redIndex < opusIndex };
  }

  function micSdpPayloads(description) {
    const mic = description?.sdp?.split(/(?=^m=)/m).find((section) => section.startsWith('m=audio '));
    return mic ? audioSdpPayloads(mic) : null;
  }

  function descriptionPrefersMicRed(description) {
    return !!micSdpPayloads(description)?.prefersRed;
  }

  function acceptMicRedOffer(description, offered) {
    if (!offered || !window.RTCRtpTransceiver?.prototype.setCodecPreferences) return description;
    const mic = micSdpPayloads(description);
    if (!mic?.hasRed || mic.prefersRed) return description;
    try {
      if (!getMicRedPreferences(true)) return description;
    } catch (_) {
      return description;
    }
    // Oferece Opus primeiro para clientes antigos. Quando os dois lados anunciam
    // suporte, prioriza o RED já oferecido para que o libwebrtc o use no envio.
    const sdp = description.sdp.replace(/^m=audio [^\r\n]+/m, (line) => {
      const fields = line.trim().split(/ +/);
      const payloads = fields.slice(3).filter((pt) => pt !== mic.red);
      payloads.splice(payloads.indexOf(mic.opus), 0, mic.red);
      return fields.slice(0, 3).concat(payloads).join(' ');
    });
    return { type: description.type, sdp };
  }

  async function tuneAudioSenders(peer) {
    // O outro lado pode remover RED da resposta. Confere a negociação antes de baixar a taxa.
    const local = micSdpPayloads(peer.pc.localDescription);
    peer.micRed = !!local?.hasRed && descriptionPrefersMicRed(peer.pc.remoteDescription) &&
      (peer.isInitiator || local.prefersRed);
    for (const [kind, tr] of [['mic', peer.mic], ['screen', peer.screenAudio]]) {
      if (!tr?.sender) continue;
      try {
        const params = tr.sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        Object.assign(params.encodings[0], audioEncoding(kind, peer.micRed));
        await tr.sender.setParameters(params);
      } catch (err) {
        console.warn('[call] não consegui ajustar o áudio enviado (' + kind + '):', err && err.message);
      }
    }
  }

  function separateMicPayloadTypes(sections) {
    const micIndex = sections.findIndex((section) => section.startsWith('m=audio '));
    const screen = sections.slice(micIndex + 1).find((section) => section.startsWith('m=audio '));
    if (micIndex < 0 || !screen) return;
    const mic = audioSdpPayloads(sections[micIndex]);
    const screenAudio = audioSdpPayloads(screen);
    if (!mic.opus || !screenAudio.opus) return;
    const used = new Set(sections.filter((section) => section.startsWith('m='))
      .flatMap((section) => section.split('\r\n', 1)[0].trim().split(/ +/).slice(3)));
    const available = Array.from({ length: 32 }, (_, i) => String(i + 96)).filter((pt) => !used.has(pt));
    const remap = new Map();
    if (mic.opus === screenAudio.opus) remap.set(mic.opus, available.shift());
    if (mic.red && (mic.red === screenAudio.red || mic.red === screenAudio.opus)) remap.set(mic.red, available.shift());
    if (!remap.size || [...remap.values()].some((pt) => !pt)) return;

    // O mesmo PT dentro de BUNDLE não pode significar Opus mono no mic e estéreo na tela.
    // Só ofertas nossas ganham IDs separados; respostas usam os IDs do outro lado.
    const lines = sections[micIndex].split('\r\n');
    lines[0] = lines[0].split(/ +/).map((value, i) => i >= 3 ? remap.get(value) || value : value).join(' ');
    for (let i = 1; i < lines.length; i++) {
      const match = /^a=(rtpmap|fmtp|rtcp-fb):(\d+) (.*)$/.exec(lines[i]);
      if (!match) continue;
      const [, attribute, payload, value] = match;
      const params = attribute === 'fmtp' && payload === mic.red
        ? value.split('/').map((pt) => remap.get(pt) || pt).join('/') : value;
      lines[i] = `a=${attribute}:${remap.get(payload) || payload} ${params}`;
    }
    sections[micIndex] = lines.join('\r\n');
  }

  function tuneOpusSdp(sdp, answer, separateMic) {
    const sections = sdp.split(/(?=^m=)/m);
    if (separateMic) separateMicPayloadTypes(sections);
    let audioIndex = 0;
    return sections.map((section) => {
      if (!section.startsWith('m=audio ')) return section;
      const kind = ['mic', 'screen'][audioIndex++];
      if (!kind) return section;
      const { opus, prefersRed } = audioSdpPayloads(section);
      if (!opus) return section;
      const lines = section.split('\r\n');
      const rtpmapAt = lines.findIndex((line) => line.startsWith(`a=rtpmap:${opus} `));
      const prefix = `a=fmtp:${opus} `;
      const fmtpAt = lines.findIndex((line) => line.startsWith(prefix));
      const params = new Map();
      if (fmtpAt >= 0) {
        for (const pair of lines[fmtpAt].slice(prefix.length).split(';')) {
          const [name, value = ''] = pair.split('=');
          if (name.trim()) params.set(name.trim(), value.trim());
        }
      }
      for (const [name, value] of Object.entries(OPUS_PARAMS[kind])) params.set(name, value);
      // Na oferta mantém 96 kb/s até o outro lado aceitar RED. O teto de envio
      // de quem responde também é ajustado depois da negociação (tuneAudioSenders).
      if (kind === 'mic' && answer && prefersRed) params.set('maxaveragebitrate', RED_MIC_BITRATE);
      const fmtp = prefix + [...params].map(([name, value]) => value === '' ? name : `${name}=${value}`).join(';');
      if (fmtpAt >= 0) lines[fmtpAt] = fmtp;
      else lines.splice(rtpmapAt + 1, 0, fmtp);
      return lines.join('\r\n');
    }).join('');
  }

  async function setLocalVoiceDescription(peer, type) {
    const pc = peer.pc;
    const offer = type === 'offer';
    const create = () => offer ? pc.createOffer() : pc.createAnswer();
    try {
      const desc = withStartBitrate(await create(), offer);
      await pc.setLocalDescription(desc);
      return desc;
    } catch (err) {
      if (pc.signalingState !== (offer ? 'stable' : 'have-remote-offer')) throw err;
      // Se a preferência ou o remapeamento não funcionar nesta implementação, volta
      // ao SDP compatível que o didiscord usava antes.
      if (peer.micRedCapable) peer.mic.setCodecPreferences([]);
      peer.micRedCapable = false;
      const desc = withStartBitrate(await create());
      await pc.setLocalDescription(desc);
      return desc;
    }
  }

  function withStartBitrate(desc, separateMic = false) {
    if (!desc || !desc.sdp) return desc;
    desc = { type: desc.type, sdp: tuneOpusSdp(desc.sdp, desc.type === 'answer', separateMic) };
    const lines = desc.sdp.split('\r\n');
    const videoPts = new Set();
    let inVideo = false;
    for (const line of lines) {
      if (line.startsWith('m=')) inVideo = line.startsWith('m=video');
      const m = inVideo && /^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//i.exec(line);
      if (m) videoPts.add(m[1]);
    }
    const out = lines.map((line) => {
      const m = /^a=fmtp:(\d+) (.*)$/.exec(line);
      if (!m || !videoPts.has(m[1]) || line.includes('x-google-start-bitrate')) return line;
      return `${line};x-google-start-bitrate=${VIDEO_START_BITRATE_KBPS}`;
    });
    // codec sem linha fmtp nenhuma (VP8 costuma vir assim): cria uma logo depois do rtpmap
    const final = [];
    for (const line of out) {
      final.push(line);
      const m = /^a=rtpmap:(\d+) /.exec(line);
      if (m && videoPts.has(m[1]) && !out.some((l) => l.startsWith(`a=fmtp:${m[1]} `))) {
        final.push(`a=fmtp:${m[1]} x-google-start-bitrate=${VIDEO_START_BITRATE_KBPS}`);
      }
    }
    return { type: desc.type, sdp: final.join('\r\n') };
  }

  async function handleRtcSignal(from, data) {
    if (!voiceChannel || !data) return;

    if (data.kind === 'watch') {
      // a pessoa parou (ou voltou) de assistir a minha tela
      const peer = peers.get(from);
      if (peer) {
        peer.wantsMyScreen = !!data.screen;
        await applyScreenSendersToPeer(peer);
      }
      return;
    }

    if (/^sc-/.test(data.kind)) {
      await handleScreencastSignal(from, data);
      return;
    }

    // pelo servidor de mídia não existe oferta/resposta entre as pessoas (só 'watch' e 'sc-*' acima)
    if (sfuActive()) return;

    if (data.kind === 'offer') {
      const peer = await createPeer(from, false);
      const offer = acceptMicRedOffer(data.sdp, data.micRed === true);
      await peer.pc.setRemoteDescription(new RTCSessionDescription(withStartBitrate(offer)));
      if (peers.get(from) !== peer) return;
      setupTransceivers(peer, false);
      await flushPendingIceCandidates(peer);
      const answer = await setLocalVoiceDescription(peer, 'answer');
      if (peers.get(from) !== peer) return;
      Realtime.send('rtc_signal', { to: from, data: { kind: 'answer', sdp: answer } });
      tuneAudioSenders(peer);
      if (unwatchedScreens.has(from)) Realtime.send('rtc_signal', { to: from, data: { kind: 'watch', screen: false } });
    } else if (data.kind === 'answer') {
      const peer = peers.get(from);
      if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription(new RTCSessionDescription(withStartBitrate(data.sdp)));
      if (peers.get(from) !== peer) return;
      tuneAudioSenders(peer);
      await flushPendingIceCandidates(peer);
    } else if (data.kind === 'candidate') {
      const peer = peers.get(from);
      if (!peer) return;
      if (!peer.pc.remoteDescription) {
        peer.pendingCandidates.push(data.candidate);
        return;
      }
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (_) { /* ignora */ }
    }
  }

  function closePeer(userId) {
    const peer = peers.get(userId);
    if (!peer) return;
    peers.delete(userId);
    if (!peers.size) { clearInterval(voiceStatsTimer); voiceStatsTimer = null; }
    closeScreencastPc(peer);
    if (nativeScreencast && nativeScreencast.viewers.has(userId)) syncNativeViewer(userId, false);
    if (peer.iceRestartTimer) clearTimeout(peer.iceRestartTimer);
    try { peer.pc.close(); } catch (_) { /* já fechada */ }
    if (peer.audioEl) {
      peer.audioEl.srcObject = null;
      peer.audioEl.remove();
    }
    for (const node of [peer.boostGain, peer.screenBoostGain]) {
      if (node) { try { node.disconnect(); } catch (_) { /* já desconectado */ } }
    }
    peer.analyser = null;
    screenStatsPrev.delete(`in:${userId}`);
    refreshConnectionStatus();
  }

  function closeAllPeers() {
    for (const userId of [...peers.keys()]) closePeer(userId);
  }

  // ---------- câmera ----------

  async function toggleCamera() {
    if (!voiceChannel) return;
    if (cameraOn) stopCameraTrack();
    else await startCameraTrack();
  }

  async function startCameraTrack() {
    const camId = getSavedDeviceId('camera');
    try {
      localCameraStream = await navigator.mediaDevices.getUserMedia({
        video: camId ? { deviceId: { exact: camId } } : true,
      });
    } catch (err) {
      alert('não consegui acessar a câmera: ' + err.message);
      return;
    }
    cameraOn = true;
    callViewCameraBtn.classList.add('active');
    await replaceOnAllPeers('camera', localCameraStream.getVideoTracks()[0] || null);
    syncLocalVoiceState();
  }

  function stopCameraTrack() {
    cameraOn = false;
    callViewCameraBtn.classList.remove('active');
    if (localCameraStream) {
      localCameraStream.getTracks().forEach((t) => t.stop());
      localCameraStream = null;
    }
    replaceOnAllPeers('camera', null);
    syncLocalVoiceState();
  }

  // ---------- compartilhamento de tela ----------

  async function toggleScreenShare() {
    if (!voiceChannel) return;
    if (screenOn) stopScreenShare();
    else await startScreenShare();
  }

  async function startScreenShare(opts = {}) {
    if (!navigator.mediaDevices.getDisplayMedia) {
      alert('seu navegador não suporta compartilhamento de tela');
      return;
    }
    const [resW, resH] = getSavedScreenResolution().split('x').map(Number);
    const fps = getSavedScreenFps();
    const wantAudio = getSavedScreenAudioEnabled();
    // credencial TURN fresca: compartilhar abre conexões novas, e a credencial pega quando entrou na
    // call pode já ter vencido (dura ~1h) — aí quem precisa de TURN via tela preta
    await refreshIceServers();

    // app desktop: tenta pela placa de vídeo primeiro (codifica uma vez só, leve pro jogo)
    if (nativeApi() && !opts.skipNative) {
      const outcome = await startNativeScreenShare({ fps, width: resW, height: resH, wantAudio });
      if (outcome !== 'fallback') return;
    }

    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: resW, max: resW },
          height: { ideal: resH, max: resH },
          frameRate: { ideal: fps, max: fps },
        },
        // pede áudio junto só se a opção "compartilhar com som" estiver marcada nas
        // configurações — se `false`, o navegador nem mostra a caixinha de áudio no
        // seletor. Quando `true`, ainda é só um pedido: se a pessoa não marcar a
        // caixinha (navegador) ou o SO não suportar, localScreenStream simplesmente
        // não vem com faixa de áudio — tratamos isso como opcional mais abaixo.
        audio: wantAudio
          ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : false,
      });
    } catch (_) {
      return; // usuário cancelou o seletor do navegador
    }
    screenOn = true;
    setScreenButtonsLive(true);
    const track = localScreenStream.getVideoTracks()[0];
    track.contentHint = SCREEN_PRIORITIES[getSavedScreenPriority()].contentHint;
    track.addEventListener('ended', () => stopScreenShare()); // clicou em "parar de compartilhar" na barra do navegador
    // compartilhamento novo: todo mundo começa assistindo (quem tinha parado de assistir o anterior volta)
    for (const peer of peers.values()) peer.wantsMyScreen = true;
    localScreenAudioTrack = null;
    await Promise.all([...peers.values()].map(applyScreenSendersToPeer));
    sfuSyncScreen();

    // no navegador normal (ou quando o app desktop decide incluir áudio de sistema pro caso de
    // "tela inteira"), o áudio já vem embutido no próprio localScreenStream — usa direto.
    let audioTrack = localScreenStream.getAudioTracks()[0] || null;

    // no app desktop (Electron), o main.js decide como o áudio é resolvido (ver
    // setDisplayMediaRequestHandler em electron/main.js) e devolve o plano via IPC. Quando o plano
    // é 'app' (compartilhando uma JANELA específica, com o áudio isolado só daquele app via
    // PipeWire), o localScreenStream nunca vem com faixa de áudio — o Electron não aceita apontar
    // getDisplayMedia pra um device/monitor arbitrário, só 'loopback' (sistema inteiro) ou nada.
    // Nesse caso buscamos o áudio à parte, por um getUserMedia mirando o monitor isolado.
    if (window.didiscordDesktop) {
      try {
        const plan = await window.didiscordDesktop.getScreenAudioPlan();
        if (plan && plan.mode === 'app') {
          audioTrack = await captureIsolatedAppAudioTrack(plan.deviceLabelHint);
        } else if (plan && plan.mode === 'pcm') {
          // Windows: sem stream nenhum pra puxar (nem embutido, nem via getUserMedia) — o áudio
          // chega em pedaços crus de PCM pelo IPC (ver electron/main.js, startWindowsPcmCapture)
          // e precisa ser montado numa track de verdade aqui.
          audioTrack = await capturePcmAudioTrack(plan);
        }
      } catch (err) {
        console.warn('[call] não consegui buscar o plano de áudio da tela (app desktop):', err);
      }
    }

    localScreenAudioTrack = audioTrack || null;
    if (localScreenAudioTrack) await Promise.all([...peers.values()].map(applyScreenSendersToPeer));
    sfuSyncScreen();
    syncLocalVoiceState();
  }

  // busca, entre os dispositivos de entrada de áudio, o monitor PipeWire isolado que o main.js
  // (electron/main.js, startAppAudioCapture) preparou pro app escolhido no seletor de janela —
  // identificado pela descrição do sink (device.description=didiscord-app-share, ver main.js), que
  // aparece como parte do label do dispositivo depois que alguma permissão de mic já foi concedida
  // (é o caso aqui, já que a call já pediu getUserMedia de áudio antes). Devolve null se não achar
  // (ex: sistema sem PipeWire, ou o label vier diferente do esperado) — nesse caso a tela é
  // compartilhada só com vídeo, sem travar o resto do fluxo.
  async function findIsolatedAppAudioDevice(labelHint) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');
    return audioInputs.find((d) => d.label && d.label.toLowerCase().includes((labelHint || '').toLowerCase())) || null;
  }

  async function captureIsolatedAppAudioTrack(labelHint) {
    try {
      // o node do PipeWire (module-remap-source, ver main.js) nasce essencialmente na hora do lado do
      // áudio do sistema, mas o cache de dispositivos do Chromium não atualiza instantaneamente junto —
      // enumerateDevices() pode devolver a lista de ANTES do device novo existir se chamado logo de
      // cara, mesmo alguns milissegundos depois de o node já estar pronto no PipeWire (confirmado
      // isoladamente com pactl/pw-dump: o node aparece instantâneo lá, mas o Chromium só refaz sua
      // própria lista quando o evento 'devicechange' chega, que é assíncrono). Por isso tenta várias
      // vezes com um pequeno intervalo antes de desistir, em vez de uma única tentativa imediata — essa
      // corrida é a causa mais provável de "compartilhar janela específica não pega áudio de nada".
      const MAX_ATTEMPTS = 8;
      const RETRY_DELAY_MS = 250;
      let match = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !match; attempt++) {
        match = await findIsolatedAppAudioDevice(labelHint);
        if (!match && attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
      if (!match) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        console.warn('[call] não achei o dispositivo de áudio isolado do app depois de', MAX_ATTEMPTS, 'tentativas (label esperado conter):', labelHint, '— devices de áudio disponíveis agora:', audioInputs.map((d) => ({ label: d.label, deviceId: d.deviceId })));
        return null;
      }
      console.log('[call] áudio isolado do app encontrado:', match.label);
      appAudioCaptureStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: match.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const track = appAudioCaptureStream.getAudioTracks()[0] || null;
      console.log('[call] track de áudio isolado obtida:', track && { id: track.id, label: track.label, muted: track.muted, readyState: track.readyState });
      return track;
    } catch (err) {
      console.warn('[call] falhou ao capturar o áudio isolado do app pra tela compartilhada:', err);
      return null;
    }
  }

  // monta a MediaStreamTrack de áudio da tela a partir do PCM cru que o helper nativo Windows
  // (didiscord-audio-helper.exe, via WASAPI Process Loopback — ver electron/main.js e
  // electron/native/audio-helper/AudioHelper.cpp) despeja pro processo principal e repassa aqui
  // por IPC (window.didiscordDesktop.onPcmChunk, ver electron/preload.js). Usa
  // MediaStreamTrackGenerator (WebCodecs Insertable Streams) pra transformar cada pedaço de PCM
  // num AudioData de verdade, que vira uma MediaStreamTrack normal — o resto do pipeline
  // (screenAudioTransceiver, RTCPeerConnection) não sabe nem precisa saber que essa track não veio
  // de um getUserMedia/getDisplayMedia normal.
  async function capturePcmAudioTrack(plan) {
    if (typeof MediaStreamTrackGenerator === 'undefined' || typeof AudioData === 'undefined') {
      console.warn('[call] este Chromium não suporta MediaStreamTrackGenerator/AudioData — sem áudio da tela (Windows)');
      return null;
    }
    if (!window.didiscordDesktop || typeof window.didiscordDesktop.onPcmChunk !== 'function') {
      console.warn('[call] app desktop não expõe onPcmChunk — sem áudio da tela (Windows)');
      return null;
    }
    if (!plan.isFloat || plan.bitsPerSample !== 32) {
      console.warn('[call] formato PCM inesperado do helper Windows (esperado float32 intercalado):', plan);
      return null;
    }

    const { sampleRate, channels } = plan;
    const bytesPerFrame = 4 * channels; // float32 = 4 bytes/amostra, intercalado (canais juntos por frame)

    pcmAudioLeftover = new Uint8Array(0);
    pcmAudioStartedAtMs = null;

    const generator = new MediaStreamTrackGenerator({ kind: 'audio' });
    const writer = generator.writable.getWriter();
    pcmAudioGenerator = generator;
    pcmAudioWriter = writer;

    pcmAudioUnsubscribe = window.didiscordDesktop.onPcmChunk((bytes) => {
      let data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (pcmAudioLeftover.length > 0) {
        const merged = new Uint8Array(pcmAudioLeftover.length + data.length);
        merged.set(pcmAudioLeftover, 0);
        merged.set(data, pcmAudioLeftover.length);
        data = merged;
      }

      const usableBytes = data.length - (data.length % bytesPerFrame);
      if (usableBytes <= 0) {
        pcmAudioLeftover = data; // frame ainda incompleto — guarda pro próximo chunk
        return;
      }

      const frameCount = usableBytes / bytesPerFrame;
      // cópia porque `data` pode ser um subarray de um buffer reciclado pelo IPC — AudioData
      // precisa de posse estável do seu próprio ArrayBuffer.
      const chunk = data.slice(0, usableBytes);
      pcmAudioLeftover = data.slice(usableBytes);

      // timestamp relativo ao instante do PRIMEIRO chunk, em vez de acumulado por quantidade de
      // frames já enviados — assim um gap de silêncio (o helper não escreve nada durante
      // AUDCLNT_BUFFERFLAGS_SILENT, ver AudioHelper.cpp) vira só "sem áudio nesse intervalo" em
      // vez de ir acumulando atraso e dessincronizar da call.
      const nowMs = performance.now();
      if (pcmAudioStartedAtMs === null) pcmAudioStartedAtMs = nowMs;
      const timestampUs = Math.round((nowMs - pcmAudioStartedAtMs) * 1000);

      let audioData;
      try {
        audioData = new AudioData({
          format: 'f32',
          sampleRate,
          numberOfFrames: frameCount,
          numberOfChannels: channels,
          timestamp: timestampUs,
          data: chunk,
        });
      } catch (err) {
        console.warn('[call] falha ao montar AudioData a partir do PCM (Windows):', err);
        return;
      }

      writer.write(audioData).catch((err) => {
        console.warn('[call] falha ao escrever no MediaStreamTrackGenerator de áudio (Windows):', err);
      });
    });

    return generator;
  }

  // desfaz capturePcmAudioTrack: cancela a inscrição do IPC, fecha o writer e para o generator.
  // Chamada incondicionalmente em stopScreenShare() — é um no-op seguro quando o plano não era
  // 'pcm' (Linux/mac, ou compartilhamento sem áudio), já que todas as variáveis ficam null nesse caso.
  function stopPcmAudioCapture() {
    if (pcmAudioUnsubscribe) {
      try { pcmAudioUnsubscribe(); } catch (_) { /* já pode ter sido removido */ }
      pcmAudioUnsubscribe = null;
    }
    if (pcmAudioWriter) {
      try { pcmAudioWriter.close(); } catch (_) { /* generator pode já ter sido parado/destruído */ }
      pcmAudioWriter = null;
    }
    if (pcmAudioGenerator) {
      try { pcmAudioGenerator.stop(); } catch (_) { /* idem */ }
      pcmAudioGenerator = null;
    }
    pcmAudioLeftover = null;
    pcmAudioStartedAtMs = null;
  }

  // aplica o teto de bitrate escolhido nas configurações (kbps → bps) ao sender de
  // vídeo da tela via RTCRtpSender.setParameters — não dá pra controlar isso pelas
  // constraints do getDisplayMedia, só no nível do encoder do WebRTC mesmo. 0 = automático
  // (o WebRTC ajusta sozinho pela rede/CPU, mas nunca passa de SCREEN_MAX_BITRATE_KBPS).
  //
  // também aplica a prioridade (o que sacrificar quando aperta) e o teto de fps — em cada pessoa
  // assistindo, já que na call em grupo cada uma tem a sua própria codificação
  async function applyScreenBitrate(sender) {
    const kbps = getSavedScreenBitrateKbps();
    const priority = SCREEN_PRIORITIES[getSavedScreenPriority()];
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = (kbps > 0 ? kbps : SCREEN_MAX_BITRATE_KBPS) * 1000;
      params.encodings[0].maxFramerate = getSavedScreenFps();
      params.degradationPreference = priority.degradation;
      await sender.setParameters(params);
    } catch (err) {
      console.warn('[call] não consegui aplicar o bitrate escolhido pro compartilhamento de tela:', err);
    }
  }

  function stopScreenShare() {
    if (nativeScreencast) {
      nativeScreencast = null;
      clearTimeout(nativeStartTimer);
      nativeStartTimer = null;
      const api = nativeApi();
      if (api) api.stop().catch(() => {});
    }
    screenOn = false;
    setScreenButtonsLive(false);
    if (localScreenStream) {
      localScreenStream.getTracks().forEach((t) => t.stop());
      localScreenStream = null;
    }
    if (appAudioCaptureStream) {
      appAudioCaptureStream.getTracks().forEach((t) => t.stop());
      appAudioCaptureStream = null;
      if (window.didiscordDesktop) {
        // devolve o stream daquele app pro sink de áudio padrão do sistema (senão ele continua
        // mudo/isolado depois que a gente para de compartilhar) — não bloqueia o resto da limpeza
        window.didiscordDesktop.stopAppAudioCapture().catch((err) => console.warn('[call] falha ao devolver o roteamento de áudio do app:', err));
      }
    }
    // no-op se o plano não era 'pcm' (Linux/mac, ou compartilhamento sem áudio) — só desmonta o
    // MediaStreamTrackGenerator quando o áudio da tela veio via WASAPI Process Loopback (Windows)
    stopPcmAudioCapture();
    // sempre avisa o processo principal que o compartilhamento acabou, independente do modo —
    // no modo 'system' (tela inteira) isso encerra o recheck periódico que mantém o próprio
    // didiscord fora do sink padrão (ver startSelfAwayWatch em electron/main.js); nos outros
    // modos é um no-op inofensivo.
    if (window.didiscordDesktop) {
      window.didiscordDesktop.notifyScreenShareStopped().catch((err) => console.warn('[call] falha ao avisar o fim do compartilhamento pro processo principal:', err));
    }
    localScreenAudioTrack = null;
    replaceOnAllPeers('screen', null);
    replaceOnAllPeers('screenAudio', null);
    syncLocalVoiceState();
  }

  async function joinVoiceCall(ch) {
    if (ch.can_connect === false) {
      toast('você não tem permissão pra entrar nessa call', 'error');
      return;
    }
    if (voiceChannel && voiceChannel.id !== ch.id) {
      leaveVoiceCall({ silent: true });
    }

    // cria/retoma o AudioContext o mais perto possível do clique do usuário (gesto real) —
    // isso maximiza a chance do navegador liberar o áudio sem bloqueio de autoplay depois
    getAudioCtx();

    let hasMic = true;
    try {
      const savedMic = getSavedDeviceId('mic');
      try {
        rawMicStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(savedMic) });
      } catch (specificErr) {
        if (savedMic) {
          // o mic salvo pode ter sido desconectado — tenta de novo com o padrão do sistema
          rawMicStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints('') });
        } else {
          throw specificErr;
        }
      }
    } catch (err) {
      // sem microfone (nenhum dispositivo, permissão negada, etc) — entra na call mesmo assim,
      // só que sem transmitir áudio. Continua dando pra ouvir a outra pessoa e usar câmera/tela.
      // isso é comum no app desktop (Electron) em máquinas sem microfone disponível.
      console.warn('[call] entrando sem microfone:', err);
      rawMicStream = null;
      hasMic = false;
    }

    const graph = hasMic && !isTauriApp() ? await tryBuildMicProcessingGraph(rawMicStream) : null;
    useCallMicGraph(graph);

    // sem mic não tem o que transmitir — já entra mutado, e trava o botão de mutar (nada pra
    // desmutar). Isso é só um estado local por enquanto; o voice_update com isso vai logo abaixo,
    // depois do voice_join, pra não mandar mensagem de call fora de ordem.
    isMuted = !hasMic ? true : isMuted;
    muteBtn.classList.toggle('active', isMuted);
    callViewMuteBtn.classList.toggle('active', isMuted);
    muteBtn.disabled = !hasMic;
    callViewMuteBtn.disabled = !hasMic;
    muteBtn.title = hasMic ? '' : 'nenhum microfone disponível';
    callViewMuteBtn.title = hasMic ? '' : 'nenhum microfone disponível';

    voiceChannel = ch;
    updateNoiseSuppressionStatus();
    refreshVoiceSettings();
    updateSelfMonitor();
    playJoinSound();
    await refreshIceServers(); // credencial TURN fresca pra essa call
    // servidor de mídia (se estiver ligado no servidor): conecta ANTES do voice_join, pra já estar na
    // sala quando a lista de quem está na call chegar. Se não estiver ligado, segue em malha.
    try {
      await sfuConnect(ch);
    } catch (err) {
      console.warn('[sfu] não consegui conectar ao servidor de mídia:', err);
      if (voiceChannel === ch) {
        toast('não consegui conectar ao servidor de mídia — tentando de novo…', 'error');
        sfuScheduleRetry();
      }
    }
    if (voiceChannel !== ch) { if (!voiceChannel) sfuDisconnect(); return; } // saiu/trocou enquanto conectava
    sfuPublishAll();
    applyLocalTrackState();
    callParticipantsState.set(currentUser.id, { muted: isMuted, deafened: isDeafened, cameraOn, screenOn });
    updateMinibar();
    renderCallParticipants();
    baseCallStatus = hasMic ? '' : 'sem microfone — só ouvindo';
    refreshConnectionStatus();

    Realtime.send('voice_join', { channelId: ch.id });
    voiceSpeakingReady = true;
    publishLocalSpeaking(callMicGraph?.gate.state.speaking);
    syncLocalVoiceState(); // manda o estado real (inclusive o mudo forçado, se for o caso) pro outro lado
  }

  function leaveVoiceCall(opts = {}) {
    if (currentUser) setParticipantSpeaking(currentUser.id, false);
    speakingSentState = false;
    voiceSpeakingReady = false;
    if (!voiceChannel) return;
    playLeaveSound();
    if (!opts.silent) Realtime.send('voice_leave');

    closeAllPeers();
    sfuDisconnect();
    stopBotAudio(); // sem isso a "rádio" do bot continuava tocando depois de sair da call
    stopSpeakingDetection();

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    if (rawMicStream) {
      rawMicStream.getTracks().forEach((t) => t.stop());
      rawMicStream = null;
    }
    resetMicTest();
    callMicGraph?.teardown();
    callMicGraph = null;
    micNsActiveMode = 'off';
    micGainNode = null;
    if (localCameraStream) {
      localCameraStream.getTracks().forEach((t) => t.stop());
      localCameraStream = null;
    }
    // reaproveita stopScreenShare() em vez de só parar as tracks na mão — ela já cuida de
    // devolver o roteamento de áudio isolado do app (stopAppAudioCapture) e de avisar o processo
    // principal que o compartilhamento acabou (notifyScreenShareStopped, que encerra o recheck
    // periódico do self-away na tela inteira). Sem isso, sair da call sem clicar em "parar de
    // compartilhar" antes deixava esse estado órfão.
    if (screenOn) {
      stopScreenShare();
    } else if (localScreenStream) {
      localScreenStream.getTracks().forEach((t) => t.stop());
      localScreenStream = null;
    }
    cameraOn = false;
    callViewCameraBtn.classList.remove('active');
    setScreenButtonsLive(false);
    callScreenShareArea.hidden = true;
    callScreenShareArea.innerHTML = '';
    stopScreenStatsLoop();
    muteBtn.disabled = false;
    callViewMuteBtn.disabled = false;
    muteBtn.title = '';
    callViewMuteBtn.title = '';

    unwatchedScreens.clear();
    spotlightUserId = null;
    baseCallStatus = '';
    localScreenAudioTrack = null;
    callParticipantsState.clear();
    setCallConnectionStatus('');
    const leftChannel = voiceChannel;
    voiceChannel = null;
    micRebuildId++;
    refreshVoiceSettings();
    updateNoiseSuppressionStatus();
    updateMinibar();

    if (currentChannel && currentChannel.id === leftChannel.id) {
      currentChannel = null;
      renderChannels();
      setMainEmpty('você saiu da chamada', 'Escolha um canal na lateral pra continuar.');
    }
  }

  // ---------- "jogando X" (rich presence) ----------
  // O app desktop descobre o jogo aberto neste computador (electron/presence.js) e avisa aqui; o
  // site repassa pro servidor (activity_set), que mostra pros amigos. No navegador não tem detecção.
  // A opção e os jogos cadastrados ficam neste aparelho (localStorage): o que está aberto é coisa
  // do computador, não da conta.
  const PRESENCE_ENABLED_KEY = 'didiscord:presenceEnabled';
  const PRESENCE_GAMES_KEY = 'didiscord:presenceGames';
  const presenceApi = () => (window.didiscordDesktop && window.didiscordDesktop.presence) || null;
  let myActivity = null; // { name, startedAt } — o que o app detectou agora

  function getPresenceEnabled() {
    try { return localStorage.getItem(PRESENCE_ENABLED_KEY) !== '0'; } catch (_) { return true; } // ligado por padrão
  }
  function getPresenceGames() {
    try {
      const list = JSON.parse(localStorage.getItem(PRESENCE_GAMES_KEY) || '[]');
      return Array.isArray(list) ? list.filter((g) => g && typeof g.exe === 'string' && typeof g.name === 'string').slice(0, 100) : [];
    } catch (_) { return []; }
  }
  function savePresenceGames(list) {
    try { localStorage.setItem(PRESENCE_GAMES_KEY, JSON.stringify(list.slice(0, 100))); } catch (_) { /* vale nesta página */ }
  }

  // manda o estado atual pro servidor (ele ignora repetição, então dá pra chamar à vontade)
  function sendMyActivity() {
    const a = getPresenceEnabled() ? myActivity : null;
    Realtime.send('activity_set', a ? { name: a.name, startedAt: a.startedAt } : { name: '' });
  }

  function configurePresence() {
    const api = presenceApi();
    if (!api) return;
    const enabled = getPresenceEnabled();
    api.configure({ enabled, custom: getPresenceGames() });
    if (!enabled) { myActivity = null; sendMyActivity(); }
  }

  function initPresence() {
    renderPresenceSettings();
    const api = presenceApi();
    if (!api) return; // navegador, ou app desktop antigo (antes da 0.5.1)
    api.onActivity((a) => {
      myActivity = a && a.name ? { name: String(a.name), startedAt: Number(a.startedAt) || Date.now() } : null;
      sendMyActivity();
      renderPresenceSettings();
    });
    configurePresence();
    // reenvia de tempos em tempos: cobre reconexão do site e reinício do servidor
    setInterval(sendMyActivity, 60000);
  }

  function setUserActivity(userId, activity) {
    const value = activity && activity.name ? activity : null;
    const u = usersById.get(userId);
    if (u) u.activity = value;
    if (currentUser && currentUser.id === userId) currentUser.activity = value;
    for (const d of dms) if (d.user && d.user.id === userId) d.user.activity = value;
    renderMembers();
    if (currentChannel && currentChannel.dm && currentChannel.userId === userId) renderDmProfilePanel();
  }

  function formatActivitySince(startedAt) {
    const min = Math.max(0, Math.floor((Date.now() - Number(startedAt)) / 60000));
    if (!Number.isFinite(min) || min < 1) return 'começou agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  }

  // configurações → app → atividade
  function renderPresenceSettings() {
    const host = document.getElementById('presenceSettings');
    if (!host) return;
    const api = presenceApi();
    const enabled = getPresenceEnabled();
    host.replaceChildren();
    const make = (tag, cls, text) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text != null) el.textContent = text;
      return el;
    };

    const toggle = make('label', 'settings-toggle');
    const text = make('span', 'settings-toggle-text');
    text.append(make('strong', null, 'mostrar o que estou jogando'), make('small', null, 'aparece "jogando …" pros seus amigos, na lista de membros e no seu perfil'));
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = enabled;
    box.addEventListener('change', () => {
      try { localStorage.setItem(PRESENCE_ENABLED_KEY, box.checked ? '1' : '0'); } catch (_) { /* vale nesta página */ }
      configurePresence();
      renderPresenceSettings();
    });
    toggle.append(text, box);
    host.append(toggle);

    if (!api) {
      host.append(make('p', 'field-help', window.didiscordDesktop
        ? 'este app é de uma versão antiga: atualize pra 0.5.1 ou mais nova pra ele detectar os jogos.'
        : 'a detecção só funciona no app do computador (o navegador não enxerga os programas abertos).'));
      return;
    }
    if (!enabled) {
      host.append(make('p', 'field-help', 'desligado: o app não olha os programas abertos e nada é enviado.'));
      return;
    }

    host.append(make('p', 'field-help presence-now', myActivity ? `detectado agora: ${myActivity.name}` : 'nenhum jogo detectado agora. Jogos da Steam e os mais conhecidos aparecem sozinhos; os outros você adiciona abaixo.'));

    const games = getPresenceGames();
    if (games.length) {
      const list = make('div', 'presence-games');
      for (const g of games) {
        const row = make('div', 'presence-game');
        const label = make('span', 'presence-game-name', g.name);
        const exe = make('span', 'presence-game-exe', g.exe);
        const del = make('button', 'btn btn-ghost btn-sm', 'remover');
        del.type = 'button';
        del.addEventListener('click', () => {
          savePresenceGames(getPresenceGames().filter((x) => x.exe !== g.exe));
          configurePresence();
          renderPresenceSettings();
        });
        row.append(label, exe, del);
        list.append(row);
      }
      host.append(list);
    }

    const addBtn = make('button', 'btn btn-ghost', 'adicionar jogo');
    addBtn.type = 'button';
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      let found = [];
      try { found = await api.candidates(); } catch (_) { found = []; }
      addBtn.remove();
      const known = new Set(getPresenceGames().map((g) => g.exe));
      found = (found || []).filter((c) => c && c.exe && !known.has(c.exe));
      if (!found.length) {
        host.append(make('p', 'field-help', 'não achei nenhum programa que pareça um jogo aberto agora. Abra o jogo e tente de novo.'));
        return;
      }
      const form = make('div', 'presence-add');
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'programa aberto');
      for (const c of found) {
        const opt = document.createElement('option');
        opt.value = c.exe;
        opt.textContent = c.label || c.exe;
        select.append(opt);
      }
      const name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 64;
      name.placeholder = 'nome que aparece (ex: Hollow Knight)';
      name.setAttribute('aria-label', 'nome do jogo');
      const save = make('button', 'btn btn-primary', 'salvar');
      save.type = 'button';
      const commit = () => {
        const label = name.value.trim().replace(/\s+/g, ' ');
        if (!label) { name.focus(); return; }
        savePresenceGames([...getPresenceGames().filter((x) => x.exe !== select.value), { exe: select.value, name: label }]);
        configurePresence();
        renderPresenceSettings();
      };
      save.addEventListener('click', commit);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
      form.append(select, name, save);
      host.append(make('p', 'field-help', 'escolha o programa do jogo (ele precisa estar aberto) e o nome que deve aparecer:'), form);
      name.focus();
    });
    host.append(addBtn);
  }

  // ---------- eventos em tempo real ----------

  function wireRealtime() {
    Realtime.on('channel_created', ({ serverId, channel }) => {
      if (serverId !== currentServerId) return;
      if (!channels.some((c) => c.id === channel.id)) channels.push(channel);
      renderChannels();
    });

    Realtime.on('channel_deleted', ({ serverId, channelId }) => {
      unreadChannels.delete(channelId);
      if (voiceChannel && voiceChannel.id === channelId) leaveVoiceCall({ silent: true });
      if (serverId !== currentServerId) { renderRail(); return; }
      channels = channels.filter((c) => c.id !== channelId);
      if (currentChannel && currentChannel.id === channelId) {
        currentChannel = null;
        const fallback = channels.find((c) => c.type === 'text');
        if (fallback) selectChannel(fallback);
        else setMainEmpty('esse canal foi apagado', 'Escolha outro canal na lateral.');
      }
      renderChannels();
      renderRail();
    });

    Realtime.on('message_created', ({ message }) => {
      const isDm = message.server_id == null;
      const mine = !!(currentUser && message.user_id === currentUser.id);
      const isOpen = !!(currentChannel && message.channel_id === currentChannel.id);

      if (isDm) {
        const dm = dms.find((d) => d.id === message.channel_id);
        if (dm) {
          dm.last_message_at = message.created_at;
          sortDms();
        } else {
          // primeira mensagem de uma conversa nova que alguém puxou comigo
          loadDms().then(() => {
            if (currentServerId == null) renderChannels();
            renderRail();
            if (currentServerId == null && !currentChannel) showHomeEmpty();
          });
        }
      }

      const mentionsMe = messageMentionsMe(message);
      if (message.user_id) setTyping(message.channel_id, message.user_id, false);

      // som só pra DM, pro servidor que estou olhando, ou quando me mencionam — com vários
      // servidores, tocar pra tudo vira barulho
      if (!mine && message.user_id && (isDm || message.server_id === currentServerId || mentionsMe)) {
        playMessageSound();
      }
      // notificação do sistema quando o didiscord não está na frente (ou é outro canal)
      if (!mine && (!isOpen || !appIsInFront()) && shouldNotify(message, isDm, mentionsMe)) {
        showSystemNotification(message);
      }

      const countsAsMention = !mine && (isDm || mentionsMe) ? 1 : 0;
      const refreshLists = () => {
        renderRail();
        if ((isDm && currentServerId == null) || (!isDm && message.server_id === currentServerId)) renderChannels();
      };

      // canal fechado, ou aberto mas vendo mensagens antigas (não dá pra encaixar a nova no fim)
      if (!isOpen || hasNewerMessages) {
        if (!mine) markChannelUnread(message.channel_id, message.server_id, countsAsMention);
        refreshLists();
        return;
      }

      if (!mine) {
        if (appIsInFront()) syncRead(message.channel_id);
        else { markChannelUnread(message.channel_id, message.server_id, countsAsMention); refreshLists(); }
      }
      if (isDm && currentServerId == null) renderChannels(); // reordena a lista de conversas
      currentMessages.push(message);
      appendMessageToDom(message);
    });

    Realtime.on('message_edited', ({ channelId, message }) => {
      if (!currentChannel || channelId !== currentChannel.id) return;
      const idx = currentMessages.findIndex((x) => x.id === message.id);
      if (idx === -1) return;
      currentMessages[idx] = message;
      const old = chatMessages.querySelector(`.msg-group[data-message-id="${message.id}"]`);
      if (old) old.replaceWith(buildMessageEl(message, old.classList.contains('is-continued')));
    });

    Realtime.on('reactions_updated', ({ channelId, messageId, reactions }) => {
      if (!currentChannel || channelId !== currentChannel.id) return;
      const m = currentMessages.find((x) => x.id === messageId);
      if (!m) return;
      m.reactions = reactions;
      refreshReactions(messageId);
    });

    Realtime.on('message_pinned', ({ channelId, message, pinned, by }) => {
      if (!currentChannel || channelId !== currentChannel.id) return;
      const idx = currentMessages.findIndex((x) => x.id === message.id);
      if (idx !== -1) {
        currentMessages[idx] = message;
        const old = chatMessages.querySelector(`.msg-group[data-message-id="${message.id}"]`);
        if (old) old.replaceWith(Object.assign(buildMessageEl(message, old.classList.contains('is-continued')), {}));
        const fresh = chatMessages.querySelector(`.msg-group[data-message-id="${message.id}"]`);
        if (fresh) fresh.classList.add('no-anim');
      }
      if (by && currentUser && by.id !== currentUser.id) toast(`${by.username} ${pinned ? 'fixou' : 'desafixou'} uma mensagem`);
      renderPins();
    });

    Realtime.on('typing', ({ channelId, userId }) => {
      if (currentUser && userId === currentUser.id) return;
      setTyping(channelId, userId, true);
    });

    // li num lugar (outra aba, o app no PC): tira o aviso aqui também
    Realtime.on('read_state', ({ channelId }) => {
      if (!unreadChannels.has(channelId)) return;
      unreadChannels.delete(channelId);
      updateUnreadTitle();
      renderRail();
      renderChannels();
    });

    // voltou a conexão depois de cair: pode ter chegado mensagem nesse meio-tempo
    let wsOpenedOnce = false;
    Realtime.on('connection_status', ({ status }) => {
      if (status !== 'open') return;
      if (wsOpenedOnce) loadUnread();
      wsOpenedOnce = true;
    });

    Realtime.on('message_deleted', ({ channelId, messageId }) => {
      if (!currentChannel || channelId !== currentChannel.id) return;
      currentMessages = currentMessages.filter((m) => m.id !== messageId);
      removeMessageFromDom(messageId);
    });

    function setPresence(userId, online) {
      const u = usersById.get(userId);
      if (u) { u.online = online; if (!online) u.activity = null; }
      for (const d of dms) if (d.user && d.user.id === userId) { d.user.online = online; if (!online) d.user.activity = null; }
      renderMembers();
      if (currentServerId == null) renderChannels();
      if (currentChannel && currentChannel.dm && currentChannel.userId === userId) renderDmProfilePanel();
    }

    Realtime.on('presence_online', ({ userId }) => setPresence(userId, true));
    Realtime.on('activity_update', ({ userId, activity }) => setUserActivity(userId, activity));
    Realtime.on('connection_status', ({ status }) => { if (status === 'open') sendMyActivity(); }); // reconectou: o servidor esqueceu
    Realtime.on('presence_offline', ({ userId }) => setPresence(userId, false));

    Realtime.on('server_joined', ({ server }) => upsertServer(server));
    Realtime.on('server_updated', ({ server }) => upsertServer(server));

    Realtime.on('server_deleted', ({ serverId }) => {
      const s = servers.find((x) => x.id === serverId);
      if (s) removeServerLocally(serverId, `o servidor ${s.name} foi apagado`);
    });

    Realtime.on('server_removed', ({ serverId, reason }) => {
      const s = servers.find((x) => x.id === serverId);
      if (s) removeServerLocally(serverId, reason === 'kicked' ? `você foi removido de ${s.name}` : null);
    });

    Realtime.on('member_joined', ({ serverId, member }) => {
      const u = rememberUser(member);
      if (serverId !== currentServerId) return;
      if (!members.some((m) => m.id === u.id)) members.push(u);
      renderMembers();
    });

    Realtime.on('member_left', ({ serverId, userId }) => {
      if (serverId !== currentServerId) return;
      members = members.filter((m) => m.id !== userId);
      renderMembers();
    });

    Realtime.on('dm_created', ({ dm }) => upsertDm(dm));

    Realtime.on('profile_updated', ({ user }) => {
      rememberUser(user);
      for (const d of dms) if (d.user && d.user.id === user.id) Object.assign(d.user, user);
      if (currentUser && user.id === currentUser.id) {
        currentUser = { ...currentUser, ...user };
        applyUserToProfileBar(currentUser);
      }
      renderMembers();
      if (currentServerId == null) renderChannels();
      if (currentChannel && currentChannel.dm && currentChannel.userId === user.id) {
        chatChannelName.textContent = user.username;
        renderDmProfilePanel();
      }
      // mensagens já na tela mostram nome/avatar antigos até reabrir o canal — aceitável
    });

    // ---------- eventos de chamada de voz ----------

    Realtime.on('voice_channel_state', async ({ channelId, participants }) => {
      // atualiza a pré-visualização da sidebar independente de eu estar nesse canal
      const map = getChannelVoiceMap(channelId);
      map.clear();
      for (const p of participants) {
        map.set(p.userId, { muted: p.muted, deafened: p.deafened, cameraOn: !!p.cameraOn, screenOn: !!p.screenOn });
      }
      if (currentUser) map.set(currentUser.id, { muted: isMuted, deafened: isDeafened, cameraOn, screenOn }); // eu também apareço na pré-visualização
      renderVoicePreviews();

      if (!voiceChannel || voiceChannel.id !== channelId) return;
      for (const p of participants) {
        callParticipantsState.set(p.userId, { muted: p.muted, deafened: p.deafened, cameraOn: !!p.cameraOn, screenOn: !!p.screenOn });
        // o bot nunca é uma RTCPeerConnection de verdade (ver comentário no topo do arquivo, perto
        // de BOT_USER_ID) — o áudio dele chega por HTTP. Só abre sinalização WebRTC pro humano de verdade.
        if (p.userId === BOT_USER_ID) startBotAudio();
        else await createPeer(p.userId, true); // quem acabou de entrar liga pra cada um que já estava
      }
      renderCallParticipants();
    });

    Realtime.on('voice_user_joined', ({ channelId, userId, muted, deafened, cameraOn: uCameraOn, screenOn: uScreenOn }) => {
      getChannelVoiceMap(channelId).set(userId, { muted, deafened, cameraOn: !!uCameraOn, screenOn: !!uScreenOn });
      renderVoicePreviews();

      if (!voiceChannel || voiceChannel.id !== channelId) return;
      callParticipantsState.set(userId, { muted, deafened, cameraOn: !!uCameraOn, screenOn: !!uScreenOn });
      if (userId === BOT_USER_ID) {
        // o bot "entrando" não é uma call de verdade — só liga o stream HTTP de áudio dele, sem
        // tocar o som de entrada de humano nem mexer em remoteUserId (que é só pro outro humano,
        // usado pra saber quem é o dono da única RTCPeerConnection da call)
        startBotAudio();
      } else {
        playJoinSound(); // alguém entrou na call que eu já estou — a oferta WebRTC vem dele
        if (sfuActive()) sfuEnsurePeer(userId); // pelo servidor de mídia não vem oferta: cria a entrada já
      }
      renderCallParticipants();
    });

    Realtime.on('voice_speaking', ({ userId, speaking }) => {
      if (currentUser && userId === currentUser.id) return;
      const peer = peers.get(userId);
      if (peer) {
        peer.hasSpeakingSignal = true;
        peer.analyser = null;
      }
      setParticipantSpeaking(userId, speaking);
    });

    Realtime.on('voice_user_left', ({ channelId, userId }) => {
      setParticipantSpeaking(userId, false);
      const map = channelVoiceState.get(channelId);
      if (map) map.delete(userId);
      renderVoicePreviews();

      if (!voiceChannel || voiceChannel.id !== channelId) return;
      if (currentUser && userId === currentUser.id) {
        // o servidor me tirou da call (fui expulso, o canal foi apagado) — sai localmente tambem
        leaveVoiceCall({ silent: true });
        return;
      }
      callParticipantsState.delete(userId);
      if (userId === BOT_USER_ID) {
        stopBotAudio();
      } else {
        playLeaveSound(); // alguém saiu da call que eu ainda estou
        closePeer(userId);
        unwatchedScreens.delete(userId);
        if (spotlightUserId === userId) spotlightUserId = null;
      }
      renderCallParticipants();
    });

    Realtime.on('voice_state_update', ({ userId, muted, deafened, cameraOn: uCameraOn, screenOn: uScreenOn }) => {
      // esse evento não vem com channelId — acha em qual canal esse usuário está pra atualizar a pré-visualização
      const channelId = findParticipantChannel(userId);
      if (channelId != null) {
        getChannelVoiceMap(channelId).set(userId, { muted, deafened, cameraOn: !!uCameraOn, screenOn: !!uScreenOn });
        renderVoicePreviews();
      }

      // parou de compartilhar: na próxima vez, volta a assistir automaticamente
      if (!uScreenOn) {
        unwatchedScreens.delete(userId);
        closeScreencastPc(peers.get(userId));
      }

      const st = callParticipantsState.get(userId);
      if (st) {
        st.muted = muted;
        st.deafened = deafened;
        st.cameraOn = !!uCameraOn;
        st.screenOn = !!uScreenOn;
        renderCallParticipants();
      }
    });

    // volume do bot ajustado via /volume no chat (server/bots/musicBot/queue.js -> setVolume) —
    // vira o novo PADRÃO pra quem ainda não mexeu no próprio slider (ver getSavedVolume); quem já
    // personalizou continua com a própria preferência, sem ser sobrescrito.
    Realtime.on('musicbot_volume', ({ serverId, volume }) => {
      // volume de outro servidor não é o bot que eu estou ouvindo
      if (!voiceChannel || voiceChannel.server_id !== serverId) return;
      botServerVolume = volume;
      let hasPersonalPref = true;
      try { hasPersonalPref = localStorage.getItem(`didiscord:volume:${BOT_USER_ID}`) !== null; } catch (_) { /* assume que tem, pra não sobrescrever à toa */ }
      if (!hasPersonalPref) {
        applyLocalOverridesToBotAudio();
        renderCallParticipants();
      }
    });

    Realtime.on('rtc_signal', ({ from, data }) => {
      handleRtcSignal(from, data).catch((err) => console.warn('[call] erro na sinalização com', from, err));
    });

    // ---------- moderação de voz (feita por um administrador) ----------

    Realtime.on('voice_disconnected', ({ by, reason }) => {
      // o voice_user_left com o meu id chega logo em seguida e faz a saída de verdade
      if (reason === 'permission') toast('você perdeu a permissão de ficar nessa call');
      else toast(by ? `${by} te desconectou da call` : 'você foi desconectado da call');
    });

    Realtime.on('voice_move', async ({ channel, by }) => {
      if (!channel) return;
      const wasViewingCall = !!(voiceChannel && currentChannel && currentChannel.id === voiceChannel.id);
      const known = channels.find((c) => c.id === channel.id) || channel;
      toast(by ? `${by} te levou pra ${known.name}` : `você foi levado pra ${known.name}`);
      await joinVoiceCall(known);
      if (wasViewingCall && currentServerId === known.server_id) selectChannel(known);
    });

    Realtime.on('voice_join_denied', ({ channelId }) => {
      if (voiceChannel && voiceChannel.id === channelId) {
        toast('você não tem permissão pra entrar nessa call', 'error');
        leaveVoiceCall({ silent: true });
      }
    });

    // ---------- cargos e permissões mudaram ----------
    Realtime.on('roles_updated', ({ serverId }) => refreshServerData(serverId));

    // ---------- admin do site ----------
    Realtime.on('site_announcement', ({ text, by }) => showSiteAnnouncement(text, by));
    Realtime.on('account_suspended', ({ reason }) => {
      if (voiceChannel) leaveVoiceCall({ silent: true });
      alert(reason ? `sua conta foi suspensa: ${reason}` : 'sua conta foi suspensa');
      window.location.replace('/login.html');
    });
    Realtime.on('session_revoked', () => {
      if (voiceChannel) leaveVoiceCall({ silent: true });
      alert('sua senha foi redefinida — entre de novo com a senha nova');
      window.location.replace('/login.html');
    });
    Realtime.on('channels_updated', ({ serverId }) => refreshServerData(serverId));

    Realtime.connect();

    // ao fechar a aba/app (ou dar reload) enquanto em call, avisa o servidor na hora em vez de
    // depender do heartbeat pra perceber que a conexão sumiu — sem isso, o outro participante
    // podia continuar vendo você "na call" por até ~65s depois de você já ter saído de verdade.
    // 'pagehide' cobre também o caso do app desktop (Tauri) sendo fechado, ao contrário de
    // 'beforeunload', que em alguns webviews não dispara de forma confiável.
    window.addEventListener('pagehide', () => {
      if (voiceChannel) Realtime.send('voice_leave');
    });
  }

  function readCurrentIfInFront() {
    if (!appIsInFront() || !currentChannel || hasNewerMessages || !unreadChannels.has(currentChannel.id)) return;
    markChannelRead(currentChannel.id);
    renderChannels();
    renderRail();
  }
  window.addEventListener('focus', readCurrentIfInFront);
  document.addEventListener('visibilitychange', readCurrentIfInFront);

  (async function init() {
    if (!window.isSecureContext) {
      alert('esse site precisa ser acessado por HTTPS (ou localhost) pra microfone e câmera funcionarem — use o link https, não o IP local puro.');
    }
    const user = await loadUser();
    if (!user) return;
    setupAdminEntry();
    await Promise.all([loadServers(), loadDms()]);
    await loadVoiceOccupancy();
    await loadMusicbotState();
    wireRealtime();
    initPresence();
    DidiTheme.load();
    loadUnread();
    updateNotificationPermissionUi();

    // abre onde a pessoa estava da última vez (servidor ou tela de conversas)
    let last = null;
    try { last = localStorage.getItem('didiscord:lastServer'); } catch (_) { /* ok */ }
    const lastId = Number(last);
    if (last && last !== 'home' && servers.some((s) => s.id === lastId)) await selectServer(lastId);
    else if (last !== 'home' && servers.length) await selectServer(servers[0].id);
    else await selectServer(null);

    handleInviteFromUrl();
  })();
})();
