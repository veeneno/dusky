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
  const selfMonitorCheckbox = document.getElementById('selfMonitorCheckbox');
  const tauriMicWarning = document.getElementById('tauriMicWarning');
  const speakerUnsupportedHint = document.getElementById('speakerUnsupportedHint');
  const micSensitivityRange = document.getElementById('micSensitivityRange');
  const micSensitivityValue = document.getElementById('micSensitivityValue');
  const noiseSuppressionSelect = document.getElementById('noiseSuppressionSelect');
  const voiceProcessingSelect = document.getElementById('voiceProcessingSelect');
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
  const unreadChannels = new Map(); // channelId -> serverId (null = DM) com mensagem nova nao vista

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
  let speakingRAF = null; // timer do laço de fala/portão do mic (ver runSpeakingLoop)
  // 30x por segundo: rápido o bastante pro portão do mic não cortar começo de palavra, e bem mais
  // leve que rodar colado na taxa do monitor (60–240 Hz) — esse laço roda o tempo todo na call,
  // inclusive com o didiscord atrás do jogo
  const SPEAKING_TICK_MS = 33;
  let rawMicStream = null; // stream crua do getUserMedia, antes do reforço de ganho — precisa ser parada separadamente pra liberar o hardware do mic
  let micGainNode = null; // GainNode aplicado no mic durante a call de verdade — ajustável ao vivo pelo slider de configurações
  let micGateGainNode = null; // GainNode do gate de sensibilidade — abre/fecha via ganho, nunca via track.enabled
  let micRnnoiseNode = null; // nó de supressão de ruído (DeepFilterNet3 ou RNNoise) ativo agora, se houver
  let micNsTeardown = null; // desliga/libera o nó de supressão atual
  let micNsActiveMode = 'off'; // qual supressão está de fato rodando ('deepfilter' | 'rnnoise' | 'off')
  let selfMonitorGainNode = null; // "ouvir a si mesmo" — toca o próprio mic de volta no fone, só localmente
  let selfMonitorSourceStream = null; // qual stream (cru) já está conectada nesse grafo
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
  let settingsStream = null; // stream de mic+câmera aberta só pra pré-visualização dentro do modal
  let settingsAnalyser = null;
  let settingsMeterRAF = null;

  function getSavedDeviceId(kind) {
    try { return localStorage.getItem(DEVICE_PREF_KEYS[kind]) || ''; } catch (_) { return ''; }
  }
  function saveDeviceId(kind, id) {
    try { localStorage.setItem(DEVICE_PREF_KEYS[kind], id || ''); } catch (_) { /* localStorage indisponível — segue sem persistir */ }
  }

  // ---------- sensibilidade do microfone (gate de ruído) e supressão de ruído ----------
  const MIC_SENSITIVITY_KEY = 'didiscord:micSensitivity';
  const NOISE_SUPPRESSION_KEY = 'didiscord:noiseSuppression';
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
      // teto de 60 (não 100): a níveis muito altos, a voz quase nunca cruza o limiar durante uma
      // call de verdade (a calibração na pré-visualização das configurações usa uma captura de áudio
      // separada da call e pode registrar níveis mais altos), o que deixava o mic mudo sem erro nenhum.
      // isso também re-limita, na hora, qualquer valor alto que já esteja salvo no navegador.
      return Number.isFinite(v) ? Math.min(60, Math.max(0, v)) : 0;
    } catch (_) { return 0; }
  }
  function saveMicSensitivity(v) {
    try { localStorage.setItem(MIC_SENSITIVITY_KEY, String(v)); } catch (_) { /* segue sem persistir */ }
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
      autoGainControl: mode !== 'studio',
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
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
        row.className = 'channel-voice-preview-row';
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

  async function selectChannel(ch) {
    if (ch.type === 'voice' && ch.can_connect === false && !(voiceChannel && voiceChannel.id === ch.id)) {
      toast('você não tem permissão pra entrar nessa call', 'error');
      return;
    }
    closeMediaViewer();
    hideCommandPopup();
    currentChannel = ch;
    markChannelRead(ch.id);
    if (ch.server_id != null) rememberLastChannel(ch.server_id, ch.id);
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
      const res = await fetch(`/api/channels/${ch.id}/messages`);
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
    chatInput.focus();
  }

  function messageGroupKey(m) {
    return m.user_id ? `u${m.user_id}` : `b${m.bot_name || 'bot'}`;
  }

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
          <span class="msg-author ${isBot ? 'is-bot' : 'is-clickable'}">${escapeHtml(name)}</span>
          ${isBot ? '<span class="msg-bot-tag">bot</span>' : ''}
          <span class="msg-time">${formatTime(m.created_at)}</span>
        </div>
        <div class="msg-text"></div>
      </div>
    `;
    renderMessageText(el.querySelector('.msg-text'), m.content || '', !!m.edited);

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
        ? m.reply_content
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
        wrap.innerHTML = `<video src="${escapeAttr(m.attachment_url)}" controls preload="metadata" playsinline></video>`;
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'msg-media-expand';
        expand.title = 'abrir no visualizador';
        expand.setAttribute('aria-label', 'abrir vídeo no visualizador');
        expand.innerHTML = EXPAND_ICON;
        expand.addEventListener('click', () => {
          const v = wrap.querySelector('video');
          if (v) v.pause();
          openMediaViewer(m);
        });
        wrap.appendChild(expand);
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
        wrap.className = 'msg-attachment msg-attachment-image';
        wrap.innerHTML = `<button type="button" class="msg-media-btn" aria-label="abrir imagem"><img src="${escapeAttr(m.attachment_url)}" alt="anexo" loading="lazy"></button>`;
        wrap.querySelector('.msg-media-btn').addEventListener('click', () => openMediaViewer(m));
      }
      el.querySelector('.msg-body').appendChild(wrap);
    }

    if (!isBot) {
      const replyBtn = document.createElement('button');
      replyBtn.className = 'msg-reply-btn';
      replyBtn.title = 'responder';
      replyBtn.innerHTML = MSG_REPLY_ICON;
      replyBtn.addEventListener('click', () => setReplyTarget(m));
      el.appendChild(replyBtn);
    }

    if (canEditMessage(m)) {
      const editBtn = document.createElement('button');
      editBtn.className = 'msg-edit-btn';
      editBtn.title = 'editar mensagem';
      editBtn.innerHTML = MSG_EDIT_ICON;
      editBtn.addEventListener('click', () => startEditMessage(m, el));
      el.appendChild(editBtn);
    }

    if (canDeleteMessage(m)) {
      const delBtn = document.createElement('button');
      delBtn.className = 'msg-delete-btn';
      delBtn.title = 'apagar mensagem';
      delBtn.innerHTML = MSG_TRASH_ICON;
      delBtn.addEventListener('click', () => deleteMessage(m.id));
      el.appendChild(delBtn);
    }

    return el;
  }

  // escreve o texto da mensagem no elemento: links http(s) viram <a> clicáveis (abrem em nova aba),
  // o resto continua texto puro (nada de innerHTML, então não dá pra injetar HTML)
  function renderMessageText(target, text, edited) {
    target.textContent = '';
    const urlRe = /https?:\/\/[^\s<>"']+/gi;
    let last = 0;
    let match;
    while ((match = urlRe.exec(text)) !== null) {
      let url = match[0];
      // pontuação no fim geralmente não faz parte do link ("veja https://x.com.") — mas um ')' que
      // fecha um '(' do próprio link (ex: wikipedia) fica
      while (/[.,;:!?)\]}]$/.test(url)) {
        if (url.endsWith(')') && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) break;
        url = url.slice(0, -1);
      }
      let parsed = null;
      try { parsed = new URL(url); } catch (_) { /* não é uma URL válida — fica como texto */ }
      if (!parsed || !parsed.hostname.includes('.')) continue;

      if (match.index > last) target.appendChild(document.createTextNode(text.slice(last, match.index)));
      const a = document.createElement('a');
      a.className = 'msg-link';
      a.href = parsed.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = url;
      target.appendChild(a);
      last = match.index + url.length;
      urlRe.lastIndex = last;
    }
    if (last < text.length) target.appendChild(document.createTextNode(text.slice(last)));
    if (edited) {
      const tag = document.createElement('span');
      tag.className = 'msg-edited';
      tag.textContent = ' (editado)';
      target.appendChild(tag);
    }
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
    ta.value = m.content || '';
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
      const value = ta.value.trim();
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
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('is-highlighted');
    void el.offsetWidth; // força reflow pra poder tocar a animação de novo se já rodou antes
    el.classList.add('is-highlighted');
  }

  function setReplyTarget(m) {
    const isBot = !m.user_id;
    const name = isBot ? (m.bot_name || 'bot') : m.username;
    const snippet = m.content ? m.content : (m.attachment_type === 'video' ? 'vídeo' : m.attachment_type === 'file' ? 'arquivo' : m.attachment_type === 'image' ? 'imagem' : '');
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
      if (item.kind === 'command') {
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
    // comandos só fazem sentido em canal de texto de servidor (o bot não toca em DM)
    if (!currentChannel || currentChannel.dm || currentChannel.type !== 'text' || pendingAttachment) {
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

  chatInput.addEventListener('input', updateCommandPopup);
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

  chatComposer.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideCommandPopup();
    if (!currentChannel) return;
    const content = chatInput.value.trim();
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
        statusEl.textContent = m.status_text || '';
        statusEl.hidden = !m.status_text;
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
      setMainEmpty('suas conversas', 'Escolha uma conversa na lateral pra continuar de onde parou.');
    }
  }

  // ---------- não lidas ----------
  // canal -> servidor (null = DM). Só vale durante a sessão: marca o que chegou enquanto a pessoa
  // estava olhando outra coisa.

  function markChannelUnread(channelId, serverId) {
    unreadChannels.set(channelId, serverId == null ? null : serverId);
  }

  function markChannelRead(channelId) {
    unreadChannels.delete(channelId);
  }

  function serverHasUnread(serverId) {
    for (const sid of unreadChannels.values()) if (sid === serverId) return true;
    return false;
  }

  function dmUnreadCount() {
    let n = 0;
    for (const sid of unreadChannels.values()) if (sid === null) n++;
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
      selectChannel(target);
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

  // cor do nome = cor do cargo mais alto que tem cor
  function memberColor(member) {
    const r = memberRoles(member).find((x) => x.color);
    return r ? r.color : null;
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
        <button type="button" class="role-delete" title="apagar cargo" aria-label="apagar cargo">${TRASH_ICON}</button>
      `;
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

  function openMediaViewer(m) {
    viewerItems = currentMessages.filter(isViewableMedia);
    viewerIndex = viewerItems.findIndex((x) => x.id === m.id);
    if (viewerIndex < 0) { viewerItems = [m]; viewerIndex = 0; }
    mediaViewer.hidden = false;
    document.body.classList.add('is-viewing-media');
    showViewerItem();
  }

  function closeMediaViewer() {
    if (mediaViewer.hidden) return;
    const video = mediaViewerStage.querySelector('video');
    if (video) video.pause();
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
    mediaViewerCaption.textContent = m.content || '';
    mediaViewerCaption.hidden = !m.content;

    if (m.attachment_type === 'video') {
      mediaViewerZoom.hidden = true;
      const video = document.createElement('video');
      video.className = 'media-viewer-video';
      video.src = m.attachment_url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      mediaViewerStage.appendChild(video);
      video.play().catch(() => { /* sem autoplay: a pessoa aperta o play */ });
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
    if (viewerImg) viewerImg.style.transform = `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom})`;
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
    if (!viewProfileBackdrop.hidden) { closeViewProfile(); return; }
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
    if (settingsMeterRAF) { cancelAnimationFrame(settingsMeterRAF); settingsMeterRAF = null; }
    settingsAnalyser = null;
    stopSelfMonitor();
    if (settingsStream) {
      settingsStream.getTracks().forEach((t) => t.stop());
      settingsStream = null;
    }
    cameraPreview.srcObject = null;
  }

  function runMicMeter() {
    function loop() {
      if (!settingsAnalyser) { settingsMeterRAF = null; return; }
      micMeterFill.style.width = getAnalyserLevel(settingsAnalyser) + '%';
      settingsMeterRAF = requestAnimationFrame(loop);
    }
    if (!settingsMeterRAF) settingsMeterRAF = requestAnimationFrame(loop);
  }

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
    settingsError.textContent = '';

    const micId = micSelect.value || getSavedDeviceId('mic');
    const cameraId = cameraSelect.value || getSavedDeviceId('camera');

    try {
      settingsStream = await navigator.mediaDevices.getUserMedia({
        audio: micConstraints(micId),
        video: cameraId ? { deviceId: { exact: cameraId } } : true,
      });
    } catch (_) {
      // talvez não tenha câmera disponível — tenta só áudio pra não travar o mic também
      try {
        settingsStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(micId) });
      } catch (err) {
        settingsError.textContent = 'não consegui acessar microfone/câmera: ' + err.message;
        return;
      }
    }

    const videoTracks = settingsStream.getVideoTracks();
    if (videoTracks.length > 0) {
      cameraPreview.srcObject = settingsStream;
      cameraPreviewEmpty.hidden = true;
    } else {
      cameraPreview.srcObject = null;
      cameraPreviewEmpty.hidden = false;
    }

    try {
      const ctx = getAudioCtx();
      const src = ctx.createMediaStreamSource(settingsStream);
      settingsAnalyser = ctx.createAnalyser();
      settingsAnalyser.fftSize = 512;
      src.connect(settingsAnalyser);
      runMicMeter();
    } catch (_) { /* medidor é só um extra visual — segue sem ele se o Web Audio falhar */ }

    updateSelfMonitor(settingsStream);

    // agora que temos permissão, os labels dos dispositivos ficam disponíveis — repopula pra mostrar nomes reais
    await populateDeviceSelects();
  }

  // ---- abas do modal de configurações (microfone / áudio / vídeo) ----
  function switchSettingsTab(tabName) {
    settingsTabs.querySelectorAll('.settings-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.settingsTab === tabName);
    });
    settingsModalBackdrop.querySelectorAll('.settings-tab-panel').forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== tabName;
    });
  }

  settingsTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.settings-tab');
    if (btn) switchSettingsTab(btn.dataset.settingsTab);
  });

  async function openSettingsModal() {
    switchSettingsTab('microfone');
    settingsError.textContent = '';
    micGainRange.value = getSavedMicGain();
    updateMicGainLabel();
    selfMonitorCheckbox.checked = getSavedSelfMonitor();
    tauriMicWarning.hidden = !isTauriApp();
    speakerUnsupportedHint.hidden = SUPPORTS_SINK_ID;
    notificationSoundsCheckbox.checked = getSavedNotificationSounds();
    micSensitivityRange.value = getSavedMicSensitivity();
    updateMicSensitivityLabel();
    noiseSuppressionSelect.value = getSavedNoiseSuppression();
    updateNoiseSuppressionStatus();
    screenResolutionSelect.value = getSavedScreenResolution();
    screenFpsSelect.value = String(getSavedScreenFps());
    screenBitrateSelect.value = String(getSavedScreenBitrateKbps());
    screenPrioritySelect.value = getSavedScreenPriority();
    screenAudioCheckbox.checked = getSavedScreenAudioEnabled();
    settingsModalBackdrop.hidden = false;
    try {
      await populateDeviceSelects();
    } catch (_) { /* enumerateDevices sem permissão ainda retorna labels vazios — tudo bem */ }
    await startSettingsPreview();
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
    startSettingsPreview();
    reacquireMicInCall(); // com a call aberta, já troca o mic que está sendo enviado
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
  });

  // troca o microfone com a call aberta: abre o mic de novo (novo aparelho ou novo modo de
  // processamento) e remonta o processamento em cima dele, sem sair da call
  async function reacquireMicInCall() {
    if (!voiceChannel || !rawMicStream || isTauriApp()) return;
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
    if (!voiceChannel) { fresh.getTracks().forEach((t) => t.stop()); return; }
    const old = rawMicStream;
    rawMicStream = fresh;
    await rebuildMicProcessing();
    if (old && old !== rawMicStream) old.getTracks().forEach((t) => t.stop());
    updateSelfMonitor(rawMicStream);
  }

  if (voiceProcessingSelect) {
    voiceProcessingSelect.value = getSavedVoiceProcessing();
    voiceProcessingSelect.addEventListener('change', async () => {
      saveVoiceProcessing(voiceProcessingSelect.value);
      startSettingsPreview();
      voiceProcessingSelect.disabled = true;
      try { await reacquireMicInCall(); } finally { voiceProcessingSelect.disabled = false; }
    });
  }

  selfMonitorCheckbox.addEventListener('change', () => {
    saveSelfMonitor(selfMonitorCheckbox.checked);
    updateSelfMonitor(voiceChannel ? rawMicStream : settingsStream);
  });

  notificationSoundsCheckbox.addEventListener('change', () => {
    saveNotificationSounds(notificationSoundsCheckbox.checked);
    if (notificationSoundsCheckbox.checked) playMessageSound(); // feedback imediato ao ligar
  });

  function updateMicSensitivityLabel() {
    const v = Number(micSensitivityRange.value);
    micSensitivityValue.textContent = v === 0 ? 'desligada' : v + '%';
    micMeterThreshold.classList.toggle('show', v > 0);
    micMeterThreshold.style.left = v + '%';
  }
  micSensitivityRange.addEventListener('input', () => {
    updateMicSensitivityLabel();
    saveMicSensitivity(Number(micSensitivityRange.value));
  });
  // texto embaixo da opção: o que está de fato rodando na call agora (pode ter caído pro modo leve)
  function updateNoiseSuppressionStatus() {
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
    if (voiceChannel && rawMicStream) {
      noiseSuppressionStatus.textContent = 'aplicando…';
      noiseSuppressionSelect.disabled = true;
      try { await rebuildMicProcessing(); } finally { noiseSuppressionSelect.disabled = false; }
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

  // "ouvir a si mesmo": toca o próprio mic (stream cru, sem passar pelo RTCPeerConnection) de volta
  // no alto-falante/fone, baixinho. Funciona igual em qualquer motor (Chrome, Firefox, WebKitGTK do
  // Tauri) porque nunca sai da página — é só reprodução local via Web Audio, não depende do bridging
  // pro RTCPeerConnection que é o que quebra no app desktop Linux.
  function updateSelfMonitor(rawStream) {
    const enabled = getSavedSelfMonitor();
    if (!enabled || !rawStream) {
      stopSelfMonitor();
      return;
    }
    if (selfMonitorSourceStream === rawStream && selfMonitorGainNode) return; // já montado pra esse stream
    stopSelfMonitor();
    try {
      const ctx = getAudioCtx();
      const src = ctx.createMediaStreamSource(rawStream);
      selfMonitorGainNode = ctx.createGain();
      selfMonitorGainNode.gain.value = 0.4; // baixo de propósito, pra reduzir risco de eco/microfonia
      src.connect(selfMonitorGainNode);
      selfMonitorGainNode.connect(ctx.destination);
      selfMonitorSourceStream = rawStream;
    } catch (err) {
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
    selfMonitorSourceStream = null;
  }

  // aplica um reforço de ganho (Web Audio GainNode) em cima do stream cru do mic, antes de
  // mandar pra call. Retorna um NOVO MediaStream (via createMediaStreamDestination) já amplificado
  // — tanto pra transmissão (transceiver) quanto pro analyser de detecção de fala, que passam a
  // refletir o volume de verdade que está sendo enviado, não o volume cru do hardware.
  // ---------- supressão de ruído de verdade (RNNoise, WASM) — mesma família de técnica do Krisp ----------
  const RNNOISE_BASE = '/vendor/web-noise-suppressor';
  let rnnoiseLoadPromise = null;

  function loadRnnoiseAssets(ctx) {
    if (!rnnoiseLoadPromise) {
      rnnoiseLoadPromise = (async () => {
        const mod = await import(`${RNNOISE_BASE}/index.js`);
        const wasmBinary = await mod.loadRnnoise({
          url: `${RNNOISE_BASE}/rnnoise.wasm`,
          simdUrl: `${RNNOISE_BASE}/rnnoise_simd.wasm`,
        });
        await ctx.audioWorklet.addModule(`${RNNOISE_BASE}/rnnoiseWorkletProcessor.js`);
        return { RnnoiseWorkletNode: mod.RnnoiseWorkletNode, wasmBinary };
      })().catch((err) => {
        rnnoiseLoadPromise = null; // permite tentar de novo na próxima call em vez de ficar quebrado pra sempre
        throw err;
      });
    }
    return rnnoiseLoadPromise;
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
        const { DeepFilterNet3Core } = await import(`${DEEPFILTER_BASE}/index.esm.js`);
        // noiseReductionLevel = limite de atenuação em dB; 100 = sem limite (tira o ruído inteiro, como a Krisp)
        // noiseReductionLevel = quanto o ruído pode ser abaixado, em dB. 100 = sem limite: tira tudo,
        // mas come pedaço da voz junto (som abafado/robótico). 40 dB já some com teclado/ventilador
        // e deixa a voz inteira — é o ajuste que o próprio DeepFilterNet recomenda pra voz.
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
        return { node, mode: 'deepfilter', teardown: () => { try { node.disconnect(); } catch (_) { /* já desligado */ } } };
      } catch (err) {
        console.warn('[call] supressão avançada (DeepFilterNet3) indisponível, usando a leve (RNNoise):', err);
        mode = 'rnnoise';
      }
    }
    if (mode === 'rnnoise') {
      try {
        const { RnnoiseWorkletNode, wasmBinary } = await loadRnnoiseAssets(ctx);
        const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
        return { node, mode: 'rnnoise', teardown: () => { try { node.disconnect(); node.destroy(); } catch (_) { /* já desligado */ } } };
      } catch (err) {
        console.warn('[call] não consegui carregar a supressão de ruído (RNNoise), seguindo sem ela:', err);
      }
    }
    return { node: null, mode: 'off', teardown: null };
  }

  async function buildMicProcessingGraph(rawStream, gainValue, noiseMode) {
    const ctx = getAudioCtx();
    const source = ctx.createMediaStreamSource(rawStream);

    let node = source;
    const ns = await createNoiseSuppressorNode(ctx, noiseMode);
    if (ns.node) {
      node.connect(ns.node);
      node = ns.node;
    }

    const gainNode = ctx.createGain();
    gainNode.gain.value = gainValue / 100;
    node.connect(gainNode);

    const gateGainNode = ctx.createGain();
    gateGainNode.gain.value = 1;
    gainNode.connect(gateGainNode);

    // limitador de segurança: o reforço manual de ganho acima (padrão 150%, até 300%) soma com o
    // autoGainControl do navegador (já ligado em micConstraints) e, sem isso, estoura o sinal acima de
    // 1.0 — o GainNode sozinho não tem teto nenhum, então qualquer pico vira clipping puro na hora de
    // virar PCM pro Opus. Isso é a causa mais provável do áudio saindo "robótico"/distorcido, e também
    // explica por que só aparece quando fala (picos) e não no silêncio (sem estouro, sem distorção).
    // ratio bem alto + attack rápido = age como um teto rígido em vez de compressão perceptível.
    // teto em -1 dBFS (antes -3): só pega pico de verdade, sem achatar a fala normal
    const limiterNode = ctx.createDynamicsCompressor();
    limiterNode.threshold.value = -1;
    limiterNode.knee.value = 0;
    limiterNode.ratio.value = 20;
    limiterNode.attack.value = 0.001;
    limiterNode.release.value = 0.1;
    gateGainNode.connect(limiterNode);

    const dest = ctx.createMediaStreamDestination();
    limiterNode.connect(dest);

    return {
      stream: dest.stream, gainNode, gateGainNode, limiterNode,
      rnnoiseNode: ns.node, noiseMode: ns.mode,
      teardown: () => {
        try { source.disconnect(); } catch (_) { /* já desligado */ }
        if (ns.teardown) ns.teardown();
      },
    };
  }

  // troca a supressão de ruído com a call aberta: monta um processamento novo a partir do mic cru,
  // troca a faixa enviada pra todo mundo (sem renegociar nada) e desliga o processamento antigo
  async function rebuildMicProcessing() {
    if (!voiceChannel || !rawMicStream || isTauriApp()) return;
    const previousStream = localStream;
    const previousTeardown = micNsTeardown;
    const boosted = await buildMicProcessingGraph(rawMicStream, getSavedMicGain(), getSavedNoiseSuppression());
    if (!voiceChannel || !rawMicStream) { boosted.teardown(); return; } // saiu da call enquanto montava
    if (micGateGainNode) boosted.gateGainNode.gain.value = micGateGainNode.gain.value;
    localStream = boosted.stream;
    micGainNode = boosted.gainNode;
    micGateGainNode = boosted.gateGainNode;
    micRnnoiseNode = boosted.rnnoiseNode;
    micNsTeardown = boosted.teardown;
    micNsActiveMode = boosted.noiseMode;
    applyLocalTrackState();
    await replaceOnAllPeers('mic', localStream.getAudioTracks()[0] || null);
    setupLocalSpeakingDetection();
    if (previousTeardown) previousTeardown();
    if (previousStream && previousStream !== rawMicStream) previousStream.getTracks().forEach((t) => t.stop());
    updateNoiseSuppressionStatus();
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
    if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
  }

  function setMuted(val) {
    isMuted = val;
    applyLocalTrackState();
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

  function updateMinibar() {
    if (voiceChannel) {
      callMinibar.hidden = false;
      callMinibarName.textContent = `#${voiceChannel.name}`;
    } else {
      callMinibar.hidden = true;
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
      el.className = 'call-participant' + (isBot ? ' is-bot' : '') + (isSpotlight ? ' is-spotlight' : '');
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
    if (sendingPeer) {
      try {
        const report = await sendingPeer.screen.sender.getStats();
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
      if (!st || !st.screenOn || unwatchedScreens.has(peer.userId) || !peer.screen) continue;
      try {
        const report = await (peer.scPc && peer.scPc.connectionState !== 'closed' ? peer.scPc : peer.screen.receiver).getStats();
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

  function setParticipantSpeaking(userId, speaking) {
    const el = callParticipants.querySelector(`.call-participant[data-user-id="${userId}"]`);
    if (el) el.classList.toggle('is-speaking', !!speaking);
  }

  function checkSpeaking(analyser) {
    if (!analyser) return false;
    return getAnalyserLevel(analyser) > 12;
  }

  function runSpeakingLoop() {
    let micGateOpenUntil = 0; // hangover: mantém o mic aberto por um instante depois que o volume cai,
                              // evitando que a gate corte o começo/fim das palavras de forma abrupta
    function loop() {
      if (!voiceChannel) { speakingRAF = null; return; }

      let selfSpeaking = false;
      if (localAnalyser) {
        const level = getAnalyserLevel(localAnalyser);
        const sensitivity = getSavedMicSensitivity();
        if (!isMuted) {
          // o gate mexe só no GANHO do nó dedicado a isso (micGateGainNode) — nunca em track.enabled.
          // isso roda por dentro do mesmo grafo de áudio que já funciona pro ganho manual, evitando
          // qualquer efeito colateral de desabilitar a track de saída enquanto ela está sendo
          // consumida por um RTCRtpSender ativo (era isso que deixava o mic totalmente mudo assim
          // que a sensibilidade saía de 0%, em qualquer valor).
          if (sensitivity === 0) {
            if (micGateGainNode) {
              micGateGainNode.gain.setTargetAtTime(1, getAudioCtx().currentTime, 0.01);
            } else if (localStream) {
              // sem grafo de processamento (Tauri) — track vem direto do getUserMedia, sem passar por
              // nenhum MediaStreamDestinationNode, então track.enabled funciona normalmente aqui
              localStream.getAudioTracks().forEach((t) => { if (!t.enabled) t.enabled = true; });
            }
            selfSpeaking = level >= 8;
          } else {
            const now = performance.now();
            if (level >= sensitivity) micGateOpenUntil = now + 350; // segura aberto por mais 350ms
            const shouldTransmit = now < micGateOpenUntil;
            if (micGateGainNode) {
              micGateGainNode.gain.setTargetAtTime(shouldTransmit ? 1 : 0, getAudioCtx().currentTime, 0.03);
            } else if (localStream) {
              localStream.getAudioTracks().forEach((t) => { t.enabled = shouldTransmit; });
            }
            selfSpeaking = shouldTransmit;
          }
        } else if (micGateGainNode) {
          micGateGainNode.gain.setTargetAtTime(0, getAudioCtx().currentTime, 0.01);
        }
      }
      setParticipantSpeaking(currentUser.id, selfSpeaking);
      for (const peer of peers.values()) setParticipantSpeaking(peer.userId, checkSpeaking(peer.analyser));
      speakingRAF = setTimeout(loop, SPEAKING_TICK_MS);
    }
    if (!speakingRAF) speakingRAF = setTimeout(loop, 0);
  }

  function setupLocalSpeakingDetection(rawStreamFallback) {
    localAnalyser = null;
    try {
      const ctx = getAudioCtx();
      if (micGainNode) {
        // conecta direto na saída do GainNode do reforço de mic (mesmo nó que alimenta o transceiver) —
        // evita reconstruir um MediaStreamSource em cima do stream já processado, que em alguns
        // navegadores fica com leitura zerada/instável
        localAnalyser = ctx.createAnalyser();
        localAnalyser.fftSize = 512;
        micGainNode.connect(localAnalyser);
      } else if (rawStreamFallback) {
        // sem grafo de processamento (app desktop Linux/Tauri) — mede direto do stream cru.
        // esse analyser é só local (medidor/borda verde), nunca cruza pro RTCPeerConnection
        const src = ctx.createMediaStreamSource(rawStreamFallback);
        localAnalyser = ctx.createAnalyser();
        localAnalyser.fftSize = 512;
        src.connect(localAnalyser);
      }
    } catch (_) { /* Web Audio pode falhar em contextos raros — call continua sem indicador visual */ }
    runSpeakingLoop();
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
    callViewScreenBtn.classList.add('active');
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
    if (speakingRAF) { clearTimeout(speakingRAF); speakingRAF = null; }
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

  // diagnóstico: conexão direta (P2P) ou passando pelo servidor TURN (relay)?
  async function logSelectedCandidatePair(peer) {
    try {
      const stats = await peer.pc.getStats();
      let pair = null;
      stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
      if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.selected) pair = r; });
      if (!pair) return;
      const local = stats.get(pair.localCandidateId);
      const remote = stats.get(pair.remoteCandidateId);
      const relay = (local && local.candidateType === 'relay') || (remote && remote.candidateType === 'relay');
      console.log(`[call] conexão com ${peer.userId}: ${relay ? 'via TURN (relay)' : 'direta (P2P)'} — local ${local && local.candidateType}, remoto ${remote && remote.candidateType}`);
    } catch (_) { /* só diagnóstico */ }
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
    return Promise.all([...peers.values()].map((peer) => {
      const t = peer[kind];
      return t ? t.sender.replaceTrack(track).catch(() => {}) : null;
    }));
  }

  async function createPeer(userId, isInitiator) {
    closePeer(userId);
    const peer = newPeer(userId);
    peer.isInitiator = isInitiator;
    peer.pc = new RTCPeerConnection({ iceServers });
    peers.set(userId, peer); // antes de qualquer await: candidatos que chegarem já acham a conexão
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
          setupRemoteSpeakingDetection(peer);
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
      if (state === 'connected' || state === 'completed') {
        tuneAudioSenders(peer);
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
      const offer = withStartBitrate(await pc.createOffer());
      if (!isCurrent()) return peer;
      await pc.setLocalDescription(offer);
      Realtime.send('rtc_signal', { to: userId, data: { kind: 'offer', sdp: offer } });
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

  // ---------- qualidade do áudio (Opus) ----------
  // Sem isso o WebRTC usa o Opus no padrão: ~32 kbps, MONO, pensado pra telefone. O Discord manda a
  // voz a 64–96 kbps e o som da tela em estéreo com bitrate alto. Aqui: voz 96 kbps com correção de
  // perda de pacote (FEC), som da tela 192 kbps ESTÉREO. Os parâmetros vão no SDP que CADA lado
  // manda ("é assim que eu quero receber") — o outro lado codifica seguindo isso.
  const OPUS_PARAMS = {
    mic: { maxaveragebitrate: 96000, maxplaybackrate: 48000, stereo: 0, 'sprop-stereo': 0, useinbandfec: 1, usedtx: 0, cbr: 0 },
    screen: { maxaveragebitrate: 192000, maxplaybackrate: 48000, stereo: 1, 'sprop-stereo': 1, useinbandfec: 1, usedtx: 0, cbr: 0 },
  };
  const AUDIO_MAX_BITRATE = { mic: 96000, screen: 192000 };

  function audioEncoding(kind) {
    // prioridade alta: com a banda apertada (tela 1080p60 junto), o áudio é o último a perder qualidade
    return { maxBitrate: AUDIO_MAX_BITRATE[kind], priority: 'high', networkPriority: 'high' };
  }

  async function tuneAudioSenders(peer) {
    for (const [kind, tr] of [['mic', peer.mic], ['screen', peer.screenAudio]]) {
      if (!tr || !tr.sender) continue;
      try {
        const params = tr.sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        Object.assign(params.encodings[0], audioEncoding(kind));
        await tr.sender.setParameters(params);
      } catch (err) {
        console.warn('[call] não consegui ajustar o áudio enviado (' + kind + '):', err && err.message);
      }
    }
  }

  // 1ª seção de áudio do SDP = microfone, 2ª = som da tela (mesma ordem dos transceivers)
  function tuneOpusSdp(sdp) {
    const lines = sdp.split('\r\n');
    let audioIndex = -1;
    let section = null; // { kind, opusPt, fmtpAt, rtpmapAt }
    const sections = [];
    lines.forEach((line, i) => {
      if (line.startsWith('m=')) {
        section = null;
        if (line.startsWith('m=audio')) {
          audioIndex++;
          section = { kind: audioIndex === 0 ? 'mic' : audioIndex === 1 ? 'screen' : null, opusPt: null, fmtpAt: -1, rtpmapAt: -1 };
          sections.push(section);
        }
        return;
      }
      if (!section) return;
      const rm = /^a=rtpmap:(\d+) opus\/48000/i.exec(line);
      if (rm) { section.opusPt = rm[1]; section.rtpmapAt = i; }
      if (section.opusPt && line.startsWith(`a=fmtp:${section.opusPt} `)) section.fmtpAt = i;
    });
    const inserts = [];
    for (const sec of sections) {
      if (!sec.kind || !sec.opusPt) continue;
      const wanted = OPUS_PARAMS[sec.kind];
      const current = {};
      if (sec.fmtpAt >= 0) {
        for (const kv of lines[sec.fmtpAt].slice(`a=fmtp:${sec.opusPt} `.length).split(';')) {
          const [k, v] = kv.split('=');
          if (k && k.trim()) current[k.trim()] = v === undefined ? '' : v.trim();
        }
      }
      Object.assign(current, wanted);
      const fmtp = `a=fmtp:${sec.opusPt} ` + Object.entries(current).map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';');
      if (sec.fmtpAt >= 0) lines[sec.fmtpAt] = fmtp;
      else inserts.push([sec.rtpmapAt, fmtp]);
    }
    for (const [at, fmtp] of inserts.sort((a, b) => b[0] - a[0])) lines.splice(at + 1, 0, fmtp);
    return lines.join('\r\n');
  }

  function withStartBitrate(desc) {
    if (!desc || !desc.sdp) return desc;
    desc = { type: desc.type, sdp: tuneOpusSdp(desc.sdp) };
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

    if (data.kind === 'offer') {
      const peer = await createPeer(from, false);
      await peer.pc.setRemoteDescription(new RTCSessionDescription(withStartBitrate(data.sdp)));
      if (peers.get(from) !== peer) return;
      setupTransceivers(peer, false);
      await flushPendingIceCandidates(peer);
      const answer = withStartBitrate(await peer.pc.createAnswer());
      await peer.pc.setLocalDescription(answer);
      Realtime.send('rtc_signal', { to: from, data: { kind: 'answer', sdp: answer } });
      if (unwatchedScreens.has(from)) Realtime.send('rtc_signal', { to: from, data: { kind: 'watch', screen: false } });
    } else if (data.kind === 'answer') {
      const peer = peers.get(from);
      if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription(new RTCSessionDescription(withStartBitrate(data.sdp)));
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
    callViewScreenBtn.classList.add('active');
    const track = localScreenStream.getVideoTracks()[0];
    track.contentHint = SCREEN_PRIORITIES[getSavedScreenPriority()].contentHint;
    track.addEventListener('ended', () => stopScreenShare()); // clicou em "parar de compartilhar" na barra do navegador
    // compartilhamento novo: todo mundo começa assistindo (quem tinha parado de assistir o anterior volta)
    for (const peer of peers.values()) peer.wantsMyScreen = true;
    localScreenAudioTrack = null;
    await Promise.all([...peers.values()].map(applyScreenSendersToPeer));

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
    callViewScreenBtn.classList.remove('active');
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

    // aplica o reforço de ganho configurado (padrão 100%) + supressão de ruído (RNNoise, se ligada) —
    // o que realmente vai pro transceiver e pro analyser de detecção de fala é essa versão
    // processada, não o áudio cru do mic. EXCETO no app desktop Linux (Tauri/WebKitGTK), onde esse
    // processamento quebra silenciosamente o envio (ver isTauriApp) — ali mandamos a track crua.
    if (!hasMic) {
      localStream = null;
      micGainNode = null;
      micGateGainNode = null;
      micRnnoiseNode = null;
      setupLocalSpeakingDetection(null);
    } else if (isTauriApp()) {
      localStream = rawMicStream;
      micGainNode = null;
      micGateGainNode = null;
      micRnnoiseNode = null;
      setupLocalSpeakingDetection(rawMicStream);
    } else {
      const boosted = await buildMicProcessingGraph(rawMicStream, getSavedMicGain(), getSavedNoiseSuppression());
      localStream = boosted.stream;
      micGainNode = boosted.gainNode;
      micGateGainNode = boosted.gateGainNode;
      micRnnoiseNode = boosted.rnnoiseNode;
      micNsTeardown = boosted.teardown;
      micNsActiveMode = boosted.noiseMode;
      setupLocalSpeakingDetection();
    }
    updateNoiseSuppressionStatus();
    updateSelfMonitor(rawMicStream);

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
    playJoinSound();
    await refreshIceServers(); // credencial TURN fresca pra essa call
    applyLocalTrackState();
    callParticipantsState.set(currentUser.id, { muted: isMuted, deafened: isDeafened, cameraOn, screenOn });
    updateMinibar();
    renderCallParticipants();
    baseCallStatus = hasMic ? '' : 'sem microfone — só ouvindo';
    refreshConnectionStatus();

    Realtime.send('voice_join', { channelId: ch.id });
    syncLocalVoiceState(); // manda o estado real (inclusive o mudo forçado, se for o caso) pro outro lado
  }

  function leaveVoiceCall(opts = {}) {
    if (!voiceChannel) return;
    playLeaveSound();
    if (!opts.silent) Realtime.send('voice_leave');

    closeAllPeers();
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
    stopSelfMonitor();
    if (micNsTeardown) { micNsTeardown(); micNsTeardown = null; }
    micRnnoiseNode = null;
    micNsActiveMode = 'off';
    micGainNode = null;
    micGateGainNode = null;
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
    callViewScreenBtn.classList.remove('active');
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
    updateMinibar();

    if (currentChannel && currentChannel.id === leftChannel.id) {
      currentChannel = null;
      renderChannels();
      setMainEmpty('você saiu da chamada', 'Escolha um canal na lateral pra continuar.');
    }
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

      // som só pra DM ou pro servidor que estou olhando — com vários servidores, tocar pra tudo vira barulho
      if (!mine && message.user_id && (isDm || message.server_id === currentServerId)) {
        playMessageSound();
      }

      if (!isOpen) {
        if (!mine) markChannelUnread(message.channel_id, message.server_id);
        renderRail();
        if ((isDm && currentServerId == null) || (!isDm && message.server_id === currentServerId)) renderChannels();
        return;
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

    Realtime.on('message_deleted', ({ channelId, messageId }) => {
      if (!currentChannel || channelId !== currentChannel.id) return;
      currentMessages = currentMessages.filter((m) => m.id !== messageId);
      removeMessageFromDom(messageId);
    });

    function setPresence(userId, online) {
      const u = usersById.get(userId);
      if (u) u.online = online;
      for (const d of dms) if (d.user && d.user.id === userId) d.user.online = online;
      renderMembers();
      if (currentServerId == null) renderChannels();
      if (currentChannel && currentChannel.dm && currentChannel.userId === userId) renderDmProfilePanel();
    }

    Realtime.on('presence_online', ({ userId }) => setPresence(userId, true));
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
      }
      renderCallParticipants();
    });

    Realtime.on('voice_user_left', ({ channelId, userId }) => {
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
