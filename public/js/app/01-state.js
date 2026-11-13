let channelCategories = [];
let pendingCategoryId = null;

// didiscord — Elementos da página e estado global
// Parte 1 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - estado de chamada de voz (WebRTC)

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
  // mundinho 3D (canal de voz com cena — ver 27-world.js): um cubinho
  world: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5"/><path d="M12 12v10"/></svg>',
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
// compartilhamento pela placa de vídeo (app desktop): { encoderName, hardware, viewers:Set, stats,
// sfuCapable, viaSfu } — viaSfu = o vídeo está saindo pelo servidor de mídia (ver 20-screencast-native.js)
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
