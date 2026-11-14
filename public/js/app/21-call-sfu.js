// dusky — Calls pelo servidor de mídia (LiveKit)
// Parte 21 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - calls pelo servidor de mídia (SFU) — LiveKit rodando no PC do servidor

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
// identidade no LiveKit = id da conta. O auxiliar de tela do app desktop entra como "tela-<id>":
// é a mesma pessoa, só que mandando o vídeo da tela por outra conexão.
function sfuUserId(participant) {
  const id = Number(String((participant && participant.identity) || '').replace(/^tela-/, ''));
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
    for (const node of [peer.boostGain, peer.spatialPanner]) { if (node) { try { node.disconnect(); } catch (_) { /* já desligado */ } } }
    peer.spatialPanner = null;
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
    // vídeo que vem do auxiliar de tela é sempre a tela, qualquer que seja a etiqueta
    const isScreen = source === 'screen_share' || /^tela-/.test(participant.identity);
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
  if (publication.source === 'screen_share' || /^tela-/.test(participant.identity)) { peer.sfuScreenReceiver = null; screenStatsPrev.delete(`in:${peer.userId}`); }
  renderCallParticipants();
}

// "parar de assistir" a tela de alguém: no SFU é só deixar de assinar as faixas da tela dela
function sfuSetScreenSubscribed(userId, on) {
  if (!sfu) return;
  if (sfu.native) { sfu.api.setSubscribed(userId, true, on); return; }
  // a tela pode vir da própria pessoa (navegador) ou do auxiliar dela (app desktop, "tela-<id>")
  for (const identity of [String(userId), `tela-${userId}`]) {
    const participant = sfu.room.remoteParticipants.get(identity);
    if (!participant) continue;
    for (const pub of participant.trackPublications.values()) {
      if (/^screen_share/.test(pub.source)) { try { pub.setSubscribed(on); } catch (_) { /* some sozinha se a faixa acabou */ } }
    }
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
  if (ctx.native) return sfuNativeSetTrack(ctx, kind, track);
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
  // app desktop no Linux: o WebKitGTK não tem WebRTC, a conexão com a sala fica no Rust
  const nativeCall = nativeCallApi();
  if (nativeCall) return sfuConnectNative(ch, info, nativeCall);
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
  if (ctx && ctx.native) { sfuNativeTeardown(ctx); ctx.api.leave(); return; }
  // false: não para as minhas faixas — quem cuida delas é o resto do código da call
  if (ctx) { try { ctx.room.disconnect(false); } catch (_) { /* já fechada */ } }
}

// ===================================================================
// app desktop no Linux: a call pelo servidor de mídia vai pelo Rust
// ===================================================================
// O WebKitGTK (motor do app no Linux) não tem WebRTC. Então só o TRANSPORTE sai daqui — a conexão
// com a sala do LiveKit roda no app (tauri/src-tauri/src/call.rs). Todo o resto continua igual:
//   microfone: getUserMedia → supressão de ruído, gate, nivelador, limitador (o grafo de sempre)
//              → worklet dusky-pcm-tap → blocos de 20 ms pro app → sala
//   quem fala: sala → app → call.pull() em laço → worklet dusky-pcm-player → MediaStream →
//              sfuTrackSubscribed, como se tivesse vindo do LiveKit do navegador (<audio>, volume
//              por pessoa, reforço acima de 100%, áudio espacial, indicador de fala)
//   tela dos outros: o app recebe o vídeo AINDA COMPRIMIDO (um assistente oculto "ver-<id>", ver
//              tauri/ e native/screencast/watch.go) → call.pullVideo() em laço → VideoDecoder
//              (WebCodecs, na placa de vídeo quando dá) → <canvas> → canvas.captureStream() →
//              sfuTrackSubscribed (o <video> de sempre), no fps que a pessoa manda
//   câmera dos outros (e a tela, com servidor antigo): o app manda JPEG (até 30 fps) → <canvas>
//   minha câmera: <video> escondido → <canvas> → JPEG → call.pushCamera() → sala
//   áudio da minha tela: o app manda direto pra sala (nem passa por aqui)
//   qualidade: um "receiver" de mentira com getStats() que pergunta pro app (call.stats)
const nativeCallApi = () => (window.duskyDesktop && window.duskyDesktop.call) || null;
const PCM_BRIDGE_URL = '/js/worklets/pcm-bridge.js?v=2';

// como o createMicWorklet, mas com mais paciência pra carregar o módulo: sem ele a call fica muda
// (o createMicWorklet desiste em 1 s, o que no WebKitGTK às vezes não dá na primeira vez)
async function createPcmBridgeNode(audioCtx, name, options) {
  if (!audioCtx.audioWorklet || typeof AudioWorkletNode === 'undefined') return null;
  try {
    await Promise.race([
      loadMicWorkletModule(audioCtx, PCM_BRIDGE_URL),
      new Promise((_, reject) => setTimeout(() => reject(new Error('tempo de carga excedido')), 15000)),
    ]);
    return new AudioWorkletNode(audioCtx, name, options);
  } catch (err) {
    console.warn('[sfu] (app) ponte de áudio indisponível:', name, err);
    return null;
  }
}

async function sfuConnectNative(ch, info, api) {
  const ctx = {
    native: true, api, room: null, lib: null, pubs: new Map(), queue: new Map(), reconnecting: false,
    players: new Map(), // sid da faixa -> { identity, source, node, track, pending }
    videos: new Map(), // sid -> { identity, source, canvas, g, track, drawing }
    videoLoop: false, camera: null, mic: null, unsubscribe: null,
  };
  const mine = (fn) => (...args) => { if (sfu === ctx) fn(...args); };
  ctx.unsubscribe = api.onEvent(mine((ev) => sfuNativeEvent(ctx, ev)));
  sfu = ctx;
  // já carrega a ponte de áudio enquanto conecta
  if (getAudioCtx().audioWorklet) loadMicWorkletModule(getAudioCtx(), PCM_BRIDGE_URL).catch(() => {});
  // ingresso do assistente oculto das telas (servidor novo responde viewer: true; o antigo não
  // conhece o parâmetro e devolveria o MEU ingresso — aí não usa, senão derrubaria a minha conexão)
  let viewerToken = null;
  try {
    const r = await fetch(`/api/rtc/sfu?channelId=${ch.id}&viewer=1`);
    const v = r.ok ? await r.json() : null;
    if (v && v.viewer === true && v.token) viewerToken = v.token;
  } catch (_) { /* sem: as telas vêm em JPEG */ }
  let res;
  try {
    res = await api.join({ path: info.path, token: info.token, micBitrate: AUDIO_MAX_BITRATE.mic, viewerToken });
  } catch (err) {
    res = { ok: false, reason: String((err && err.message) || err) };
  }
  if (!res || !res.ok) {
    if (sfu === ctx) sfu = null;
    ctx.unsubscribe();
    throw new Error((res && res.reason) || 'não consegui entrar na sala do servidor de mídia');
  }
  if (sfu !== ctx) { api.leave(); return false; }
  sfuNativePullLoop(ctx);
  return true;
}

function sfuNativeEvent(ctx, ev) {
  if (ev.ev === 'track') {
    if (ev.kind === 'audio') sfuNativeAddAudio(ctx, ev);
    else if (ev.encoded) sfuNativeAddEncodedVideo(ctx, ev);
    else sfuNativeAddVideo(ctx, ev);
  } else if (ev.ev === 'trackEnded') {
    sfuNativeRemoveAudio(ctx, ev.sid);
    sfuNativeRemoveVideo(ctx, ev.sid);
  } else if (ev.ev === 'reconnecting') {
    ctx.reconnecting = true;
    sfuMarkPeers(false);
  } else if (ev.ev === 'reconnected') {
    ctx.reconnecting = false;
    sfuMarkPeers(true);
  } else if (ev.ev === 'disconnected') {
    // caiu de vez: tenta voltar sozinho, igual ao LiveKit do navegador
    console.warn('[sfu] (app) conexão com o servidor de mídia caiu:', ev.reason);
    sfuNativeTeardown(ctx);
    sfu = null;
    sfuScheduleRetry();
  } else if (ev.ev === 'error') {
    console.warn('[sfu] (app)', ev.message);
  }
}

// uma faixa de áudio nova de alguém: tocador → MediaStream → o caminho de sempre
async function sfuNativeAddAudio(ctx, ev) {
  sfuNativeRemoveAudio(ctx, ev.sid);
  const channels = ev.channels === 2 ? 2 : 1;
  const entry = { identity: ev.identity, source: ev.source, node: null, track: null, pending: [] };
  ctx.players.set(ev.sid, entry);
  const audioCtx = getAudioCtx();
  const node = await createPcmBridgeNode(audioCtx, 'dusky-pcm-player', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels], processorOptions: { channels },
  });
  if (sfu !== ctx || ctx.players.get(ev.sid) !== entry) {
    if (node) node.port.postMessage('stop');
    return;
  }
  if (!node) {
    console.warn('[sfu] (app) não consegui montar o tocador de áudio de', ev.identity);
    return;
  }
  const dest = audioCtx.createMediaStreamDestination();
  node.connect(dest);
  entry.node = node;
  entry.dest = dest;
  entry.track = dest.stream.getAudioTracks()[0];
  for (const chunk of entry.pending.splice(0)) node.port.postMessage(chunk, [chunk.buffer]);
  sfuTrackSubscribed({ mediaStreamTrack: entry.track, kind: 'audio', receiver: sfuNativeStatsReceiver(ctx, ev.sid) }, { source: ev.source }, { identity: ev.identity });
}

// o site lê a qualidade de receiver.getStats() — aqui quem responde é o app
function sfuNativeStatsReceiver(ctx, sid) {
  return {
    getStats: async () => {
      const list = sfu === ctx ? await ctx.api.stats(sid) : [];
      return new Map((list || []).map((r) => [r.id, r]));
    },
  };
}

// tela/câmera de alguém: o app manda JPEG, a gente desenha num canvas e o canvas vira a faixa
function sfuNativeAddVideo(ctx, ev) {
  sfuNativeRemoveVideo(ctx, ev.sid);
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 9;
  const g = canvas.getContext('2d');
  const track = canvas.captureStream(30).getVideoTracks()[0];
  if (!track) {
    console.warn('[sfu] (app) este motor não consegue transformar canvas em vídeo');
    return;
  }
  const entry = { identity: ev.identity, source: ev.source, canvas, g, track, drawing: false };
  ctx.videos.set(ev.sid, entry);
  sfuTrackSubscribed({ mediaStreamTrack: track, kind: 'video', receiver: sfuNativeStatsReceiver(ctx, ev.sid) }, { source: ev.source }, { identity: ev.identity });
  if (!ctx.videoLoop) sfuNativeVideoLoop(ctx);
}

// tela de alguém, comprimida: decodifica aqui e desenha cada quadro assim que sai (o fps é o de
// quem manda — o canvas sem fps fixo vira um quadro de vídeo a cada desenho)
const NATIVE_VIDEO_CODECS = { 1: 'avc1.640034', 2: 'vp8', 3: 'vp09.00.10.08', 4: 'av01.0.08M.08' };

function sfuNativeAddEncodedVideo(ctx, ev) {
  sfuNativeRemoveVideo(ctx, ev.sid);
  const codec = NATIVE_VIDEO_CODECS[ev.codec];
  if (typeof VideoDecoder === 'undefined' || !codec) {
    console.warn('[sfu] (app) sem decodificador pra tela de', ev.identity, codec);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 9;
  // WebGL: o quadro vai pra placa como textura e é desenhado lá. O canvas 2D do WebKitGTK copia a
  // imagem inteira pela memória a cada quadro, o que derrubava o ritmo da página em 1080p/60
  // (dá pra forçar o canvas 2D com localStorage 'dusky:nativeVideo2d' = '1', pra comparar)
  let force2d = false;
  try { force2d = localStorage.getItem('dusky:nativeVideo2d') === '1'; } catch (_) { /* sem armazenamento */ }
  const gl = force2d ? null : createNativeVideoGl(canvas);
  const g = gl ? null : canvas.getContext('2d');
  const track = canvas.captureStream().getVideoTracks()[0];
  if (!track) return;
  track.duskyCanvas = canvas; // 19-call-ui.js mostra o canvas direto no lugar do <video>
  const entry = {
    identity: ev.identity, source: 'screen_share', canvas, g, gl, track, encoded: true, codec, codecId: ev.codec,
    decoder: null, needKey: true, configured: '', // configurado pra que tamanho (só no 1º quadro-chave)
    bytes: 0, frames: 0, shown: 0, statFrames: 0, statShown: 0, statAt: performance.now(),
    queue: [], // quadros já decodificados esperando a vez de aparecer (ver sfuNativePresent)
    received: 0, waitingKey: 0, failures: 0, softwareOnly: false, lastError: '',
    clock: null, // { ts, wall }: que marca de tempo de quem envia corresponde a que instante aqui
  };
  entry.reset = () => {
    if (entry.decoder && entry.decoder.state !== 'closed') { try { entry.decoder.close(); } catch (_) { /* já fechado */ } }
    entry.needKey = true;
    if (entry.fellBack) return;
    entry.decoder = new VideoDecoder({
      output: (frame) => {
        entry.frames++;
        // não desenha aqui: os quadros saem do decodificador em rajadas e, desenhando na hora, só o
        // último de cada rajada chegava a aparecer. Vão pra fila e aparecem um por atualização da
        // tela, no ritmo de quem manda (sfuNativePresent)
        entry.queue.push(frame);
        while (entry.queue.length > 12) entry.queue.shift().close(); // aba parada: não acumula memória
        if (!ctx.presenting) sfuNativePresent(ctx);
      },
      error: (err) => sfuNativeDecoderFailed(ctx, ev.sid, entry, err),
    });
    // a configuração espera o 1º quadro-chave (sfuNativeConfigure): precisa do tamanho do vídeo
    entry.configured = '';
  };
  // diz no terminal se o sistema tem decodificador pra esse codec (faltando plugin do GStreamer, não tem)
  Promise.all([
    VideoDecoder.isConfigSupported({ codec }).then((r) => r.supported).catch(() => false),
    VideoDecoder.isConfigSupported({ codec, hardwareAcceleration: 'prefer-software' }).then((r) => r.supported).catch(() => false),
  ]).then(([hw, sw]) => ctx.api.log(`tela de ${ev.identity}: ${codec} — decodificador ${hw ? 'disponível' : 'NÃO disponível'}${sw ? '' : ' (nem no processador)'}`));
  sfuNativeDiag(ctx);
  entry.reset();
  ctx.videos.set(ev.sid, entry);
  // garantia: se em 8 s nenhum quadro aparecer (decodificador que não dá erro mas também não
  // entrega nada, quadro-chave que nunca chega…), vai pelo caminho em JPEG
  setTimeout(() => {
    if (ctx.videos.get(ev.sid) === entry && entry.frames === 0) sfuNativeFallBack(ctx, entry, 'nenhum quadro em 8 s');
  }, 8000);
  const receiver = {
    // números da tela (resolução, fps, kbps) contados aqui mesmo
    // o fps mostrado é o de quadros que APARECERAM (não só decodificados)
    getStats: async () => {
      const now = performance.now();
      const secs = Math.max(0.001, (now - entry.statAt) / 1000);
      const shownFps = (entry.shown - entry.statShown) / secs;
      const decodedFps = (entry.frames - entry.statFrames) / secs;
      entry.statFrames = entry.frames;
      entry.statShown = entry.shown;
      entry.statAt = now;
      return new Map([['tela', {
        id: 'tela', type: 'inbound-rtp', kind: 'video', timestamp: now, bytesReceived: entry.bytes,
        frameWidth: canvas.width, frameHeight: canvas.height, framesPerSecond: shownFps, framesDecodedPerSecond: decodedFps,
      }]]);
    },
  };
  sfuTrackSubscribed({ mediaStreamTrack: track, kind: 'video', receiver }, { source: 'screen_share' }, { identity: ev.identity });
  if (!ctx.videoLoop) sfuNativeVideoLoop(ctx);
}

// desenhar um VideoFrame com WebGL: um retângulo do tamanho do canvas com o quadro de textura
function createNativeVideoGl(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, desynchronized: true });
  if (!gl) return null;
  // WebGL "de mentira" (sem placa de vídeo, desenhado no processador): aí o canvas 2D é mais leve.
  // (o WebKit costuma esconder o nome da placa — aí não dá pra saber e fica no WebGL)
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  if (/llvmpipe|softpipe|swiftshader|software/i.test(renderer)) return null;
  const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 t; void main(){ t = vec2((p.x + 1.0) / 2.0, (1.0 - p.y) / 2.0); gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 t; uniform sampler2D s; void main(){ gl_FragColor = texture2D(s, t); }'));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return gl;
}

function drawNativeVideoGl(gl, frame, w, h) {
  gl.viewport(0, 0, w, h);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Mostra os quadros decodificados no ritmo certo, como um player: um relógio liga a marca de tempo
// de quem envia ao relógio daqui, com ~40 ms de folga pra absorver as rajadas, e a cada atualização
// da tela aparece o quadro mais novo cuja hora já chegou. Assim 60 fps de origem viram 60 quadros
// distintos na tela (num monitor de 60 Hz ou mais), sem pular e repetir.
const NATIVE_PLAYOUT_DELAY_MS = 40;

function sfuNativePresent(ctx) {
  ctx.presenting = true;
  const tick = () => {
    if (sfu !== ctx) { ctx.presenting = false; return; }
    const now = performance.now();
    let any = false;
    for (const entry of ctx.videos.values()) {
      if (!entry.encoded) continue;
      any = true;
      const q = entry.queue;
      if (!q.length) continue;
      if (!entry.clock) entry.clock = { ts: q[0].timestamp, wall: now + NATIVE_PLAYOUT_DELAY_MS };
      let playout = entry.clock.ts + (now - entry.clock.wall) * 1000; // em µs, na escala de quem envia
      // muito atrasado (aba parada, travou) ou muito adiantado (quem envia pulou): realinha
      if (q[q.length - 1].timestamp < playout - 300000 || q[0].timestamp > playout + 200000) {
        entry.clock = { ts: q[q.length - 1].timestamp, wall: now };
        playout = entry.clock.ts;
      }
      // a fila cresceu além da folga (relógio de quem envia mais rápido que o daqui): adianta um pouco
      if (q.length > 4) entry.clock.wall -= 2;
      let pick = -1;
      for (let i = 0; i < q.length; i++) if (q[i].timestamp <= playout) pick = i;
      if (pick < 0) continue;
      const frame = q[pick];
      for (let i = 0; i < pick; i++) q[i].close(); // os que perderam a vez
      q.splice(0, pick + 1);
      const { canvas, g, gl } = entry;
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width = frame.displayWidth;
        canvas.height = frame.displayHeight;
      }
      try {
        if (gl) drawNativeVideoGl(gl, frame, canvas.width, canvas.height);
        else g.drawImage(frame, 0, 0);
      } catch (err) {
        console.warn('[sfu] (app) não consegui desenhar o quadro da tela:', err && err.message);
      }
      frame.close();
      entry.shown++;
    }
    if (any) requestAnimationFrame(tick);
    else ctx.presenting = false;
  };
  requestAnimationFrame(tick);
}

// tamanho do vídeo lido do quadro-chave. Vai junto na configuração do decodificador: sem ele o
// da NVIDIA no WebKitGTK (nvvp8dec/nvh264dec) recusa o vídeo ("caps not accepted" -> Decode error)
function sfuNativeFrameSize(codecId, b) {
  try {
    if (codecId === 2) { // VP8: código de início 9d 01 2a e depois largura/altura (14 bits cada)
      if (b.length < 10 || b[3] !== 0x9d || b[4] !== 0x01 || b[5] !== 0x2a) return null;
      return { w: (b[6] | (b[7] << 8)) & 0x3fff, h: (b[8] | (b[9] << 8)) & 0x3fff };
    }
    let pos = 0;
    let data = b;
    const bit = () => { const v = (data[pos >> 3] >> (7 - (pos & 7))) & 1; pos++; return v; };
    const bits = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v; };
    if (codecId === 3) { // VP9: cabeçalho descompactado
      const marker = bits(2);
      if (marker !== 2) return null;
      const profile = bit() | (bit() << 1);
      if (profile === 3) bit();
      if (bit()) return null; // show_existing_frame
      if (bit() !== 0) return null; // não é quadro-chave
      bits(2); // show_frame, error_resilient
      if (bits(24) !== 0x498342) return null;
      if (profile >= 2) bit();
      const cs = bits(3);
      if (cs !== 7) { bit(); if (profile === 1 || profile === 3) bits(3); } else if (profile === 1 || profile === 3) bit();
      return { w: bits(16) + 1, h: bits(16) + 1 };
    }
    if (codecId === 1) { // H.264: procura o SPS (NAL 7) e lê o tamanho dele
      for (let i = 0; i + 4 < b.length; i++) {
        if (!(b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1)) continue;
        if ((b[i + 3] & 0x1f) !== 7) continue;
        const raw = [];
        for (let j = i + 4; j < b.length; j++) {
          if (j + 2 < b.length && b[j] === 0 && b[j + 1] === 0 && b[j + 2] <= 1) break; // próxima NAL
          if (j >= i + 6 && b[j] === 3 && b[j - 1] === 0 && b[j - 2] === 0) continue; // byte de prevenção
          raw.push(b[j]);
        }
        data = raw; pos = 0;
        const ue = () => { let z = 0; while (bit() === 0 && z < 32) z++; return (1 << z) - 1 + bits(z); };
        const se = () => { const v = ue(); return v & 1 ? (v + 1) >> 1 : -(v >> 1); };
        const profile = bits(8); bits(16); ue();
        let chroma = 1;
        if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
          chroma = ue();
          if (chroma === 3) bit();
          ue(); ue(); bit();
          if (bit()) { // matrizes de escala
            for (let k = 0; k < (chroma === 3 ? 12 : 8); k++) {
              if (!bit()) continue;
              let last = 8; let next = 8;
              for (let m = 0; m < (k < 6 ? 16 : 64); m++) { if (next !== 0) next = (last + se() + 256) % 256; last = next === 0 ? last : next; }
            }
          }
        }
        ue(); // log2_max_frame_num
        const poc = ue();
        if (poc === 0) ue(); else if (poc === 1) { bit(); se(); se(); const n = ue(); for (let k = 0; k < n; k++) se(); }
        ue(); bit();
        const wMbs = ue() + 1; const hMaps = ue() + 1;
        const frameOnly = bit();
        if (!frameOnly) bit();
        bit();
        let cl = 0, cr = 0, ct = 0, cb = 0;
        if (bit()) { cl = ue(); cr = ue(); ct = ue(); cb = ue(); }
        const cx = chroma === 0 || chroma === 3 ? 1 : 2;
        const cy = (chroma === 1 ? 2 : 1) * (2 - frameOnly);
        return { w: wMbs * 16 - cx * (cl + cr), h: (2 - frameOnly) * hMaps * 16 - cy * (ct + cb) };
      }
      return null;
    }
  } catch (_) { /* cabeçalho estranho: usa o tamanho padrão */ }
  return null;
}

// configura o decodificador no 1º quadro-chave (e de novo se o tamanho mudar)
// 1ª tentativa: o decodificador que o sistema achar melhor (placa de vídeo); se falhar, só no
// processador; se falhar de novo, essa tela volta pro caminho em JPEG
function sfuNativeConfigure(ctx, sid, entry, data) {
  let size = sfuNativeFrameSize(entry.codecId, data);
  if (!size || size.w < 16 || size.h < 16 || size.w > 8192 || size.h > 8192) size = entry.size || { w: 1920, h: 1080 };
  entry.size = size;
  const tag = `${size.w}x${size.h}`;
  if (entry.configured === tag) return true;
  const cfg = { codec: entry.codec, optimizeForLatency: true, codedWidth: size.w, codedHeight: size.h };
  if (entry.softwareOnly) cfg.hardwareAcceleration = 'prefer-software';
  try {
    entry.decoder.configure(cfg);
    if (!entry.configured) ctx.api.log(`tela de ${entry.identity}: ${entry.codec} ${tag}`);
    entry.configured = tag;
    return true;
  } catch (err) {
    sfuNativeDecoderFailed(ctx, sid, entry, err);
    return false;
  }
}

// o decodificador da página falhou com essa tela: tenta só no processador e, se falhar de novo,
// pede pro app mandar essa tela pelo caminho em JPEG (o libwebrtc decodifica no Rust)
function sfuNativeDecoderFailed(ctx, sid, entry, err) {
  entry.failures++;
  entry.lastError = String((err && (err.message || err.name)) || err);
  entry.decoder = null;
  entry.needKey = true;
  if (sfu !== ctx || entry.fellBack) return;
  ctx.api.log(`tela de ${entry.identity}: decodificador falhou${entry.softwareOnly ? ' (no processador)' : ''}: ${entry.lastError}`);
  if (!entry.softwareOnly) {
    // o 1º costuma ser o da placa de vídeo (ex: NVDEC dentro do WebKitGTK): tenta no processador
    entry.softwareOnly = true;
    ctx.api.log(`tela de ${entry.identity}: tentando decodificar só no processador`);
    ctx.api.keyframe(sid);
    return;
  }
  sfuNativeFallBack(ctx, entry, 'o decodificador falhou');
}

// essa tela passa a vir pelo caminho em JPEG (o libwebrtc decodifica no Rust) — sempre funciona
function sfuNativeFallBack(ctx, entry, why) {
  if (entry.fellBack || sfu !== ctx) return;
  entry.fellBack = true;
  ctx.api.log(`tela de ${entry.identity}: ${why} — indo pelo caminho em JPEG (até 30 fps)`);
  const user = sfuUserId({ identity: entry.identity });
  if (user != null) ctx.api.screenFallback(user);
}

// uma linha no terminal do app a cada 5 s por tela comprimida: o que chegou, o que foi decodificado,
// o que apareceu e quantas vezes a página conseguiu se redesenhar (o teto de tudo)
function sfuNativeDiag(ctx) {
  if (ctx.diagTimer) return;
  let ticks = 0;
  const raf = () => { if (ctx.diagTimer) { ticks++; requestAnimationFrame(raf); } };
  let at = performance.now();
  const prev = new Map();
  ctx.diagTimer = setInterval(() => {
    const list = [...ctx.videos.values()].filter((e) => e.encoded);
    if (sfu !== ctx || !list.length) { clearInterval(ctx.diagTimer); ctx.diagTimer = null; return; }
    const now = performance.now();
    const secs = (now - at) / 1000;
    for (const e of list) {
      const p = prev.get(e) || { received: 0, frames: 0, shown: 0, waitingKey: 0 };
      prev.set(e, { received: e.received, frames: e.frames, shown: e.shown, waitingKey: e.waitingKey });
      const r = (k) => Math.round((e[k] - p[k]) / secs);
      ctx.api.log(`tela de ${e.identity}: ${r('received')} quadros/s chegando, ${r('frames')} decodificados, ${r('shown')} mostrados` +
        `${e.waitingKey - p.waitingKey ? `, ${e.waitingKey - p.waitingKey} descartados esperando quadro-chave` : ''}` +
        `, página redesenhando ${Math.round(ticks / secs)}x/s, ${e.canvas.width}x${e.canvas.height}, ` +
        `${e.gl ? 'WebGL' : 'canvas 2D'}${e.softwareOnly ? ', decod. no processador' : ''}` +
        `${e.lastError ? `, último erro: ${e.lastError}` : ''}`);
    }
    ticks = 0;
    at = now;
  }, 5000);
  requestAnimationFrame(raf);
}

function sfuNativeDecode(ctx, sid, key, ts, data) {
  const entry = ctx.videos.get(sid);
  if (!entry || !entry.encoded || entry.fellBack) return;
  entry.received++;
  if (!entry.decoder || entry.decoder.state === 'closed') entry.reset();
  if (!entry.decoder) return;
  if (entry.needKey && !key) { entry.waitingKey++; return; } // começou no meio: espera o quadro-chave
  if (key && !sfuNativeConfigure(ctx, sid, entry, data)) return;
  if (!entry.configured) return;
  // a página engasgou e acumulou: recomeça do próximo quadro-chave em vez de mostrar atrasado
  if (entry.decoder.decodeQueueSize > 30) {
    entry.reset();
    ctx.api.keyframe(sid);
    return;
  }
  try {
    entry.decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: ts, data }));
    entry.needKey = false;
    entry.bytes += data.byteLength;
  } catch (err) {
    console.warn('[sfu] (app) quadro da tela recusado:', err && err.message);
    entry.reset();
    ctx.api.keyframe(sid);
  }
}

function sfuNativeRemoveVideo(ctx, sid) {
  const entry = ctx.videos.get(sid);
  if (!entry) return;
  ctx.videos.delete(sid);
  if (entry.decoder && entry.decoder.state !== 'closed') { try { entry.decoder.close(); } catch (_) { /* já fechado */ } }
  if (entry.queue) { for (const f of entry.queue) f.close(); entry.queue = []; }
  sfuTrackUnsubscribed({ mediaStreamTrack: entry.track }, { source: entry.source }, { identity: entry.identity });
  entry.track.stop();
}

// busca os quadros novos (só quando tem alguém mandando vídeo)
async function sfuNativeVideoLoop(ctx) {
  ctx.videoLoop = true;
  const decoder = new TextDecoder();
  while (sfu === ctx && ctx.videos.size) {
    let buf;
    try {
      buf = await ctx.api.pullVideo();
    } catch (_) {
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    if (!(buf instanceof ArrayBuffer) || !buf.byteLength) continue;
    // repetido, cada um começando com o tipo (formato em tauri/src-tauri/src/call.rs, call_pull_video):
    //   0: [u16 tamanho do sid][sid][u32 largura][u32 altura][u32 bytes][JPEG]
    //   1: [u32 tamanho][u16 tamanho do sid][sid][u8 flags][u8 codec][u64 µs][dados comprimidos]
    const view = new DataView(buf);
    let off = 0;
    while (off + 5 <= buf.byteLength) {
      const type = view.getUint8(off);
      off += 1;
      if (type === 1) {
        const len = view.getUint32(off, true);
        const start = off + 4;
        off = start + len;
        const sidLen = view.getUint16(start, true);
        const sid = decoder.decode(new Uint8Array(buf, start + 2, sidLen));
        const p = start + 2 + sidLen;
        const key = (view.getUint8(p) & 1) === 1;
        const ts = view.getUint32(p + 2, true) + view.getUint32(p + 6, true) * 4294967296;
        sfuNativeDecode(ctx, sid, key, ts, new Uint8Array(buf.slice(p + 10, off)));
        continue;
      }
      const sidLen = view.getUint16(off, true);
      off += 2;
      const sid = decoder.decode(new Uint8Array(buf, off, sidLen));
      off += sidLen;
      const w = view.getUint32(off, true);
      const h = view.getUint32(off + 4, true);
      const len = view.getUint32(off + 8, true);
      off += 12;
      const jpeg = new Blob([new Uint8Array(buf, off, len)], { type: 'image/jpeg' });
      off += len;
      const entry = ctx.videos.get(sid);
      if (!entry || entry.drawing) continue; // ainda desenhando o anterior: pula esse
      entry.drawing = true;
      createImageBitmap(jpeg).then((bmp) => {
        if (entry.canvas.width !== w || entry.canvas.height !== h) {
          entry.canvas.width = w;
          entry.canvas.height = h;
        }
        entry.g.drawImage(bmp, 0, 0, w, h);
        bmp.close();
      }).catch(() => { /* quadro estragado: vem outro */ }).finally(() => { entry.drawing = false; });
    }
  }
  ctx.videoLoop = false;
}

function sfuNativeRemoveAudio(ctx, sid) {
  const entry = ctx.players.get(sid);
  if (!entry) return;
  ctx.players.delete(sid);
  if (entry.track) {
    sfuTrackUnsubscribed({ mediaStreamTrack: entry.track }, { source: entry.source }, { identity: entry.identity });
    entry.track.stop();
  }
  if (entry.node) {
    entry.node.port.postMessage('stop');
    try { entry.node.disconnect(); } catch (_) { /* já desligado */ }
  }
}

// busca o áudio de quem fala sem parar (o app segura a resposta até ter novidade, ~100 ms no máximo)
async function sfuNativePullLoop(ctx) {
  const decoder = new TextDecoder();
  while (sfu === ctx) {
    let buf;
    try {
      buf = await ctx.api.pull();
    } catch (_) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    if (sfu !== ctx) break;
    if (!(buf instanceof ArrayBuffer) || !buf.byteLength) continue;
    // repetido: [u16 tamanho do sid][sid][u8 canais][u32 nº de amostras][f32 × amostras]
    const view = new DataView(buf);
    let off = 0;
    while (off + 7 <= buf.byteLength) {
      const sidLen = view.getUint16(off, true);
      off += 2;
      const sid = decoder.decode(new Uint8Array(buf, off, sidLen));
      off += sidLen + 1;
      const count = view.getUint32(off, true);
      off += 4;
      const samples = new Float32Array(buf.slice(off, off + count * 4));
      off += count * 4;
      const entry = ctx.players.get(sid);
      if (!entry) continue;
      if (entry.node) entry.node.port.postMessage(samples, [samples.buffer]);
      else if (entry.pending.length < 50) entry.pending.push(samples); // tocador ainda carregando
    }
  }
}

function sfuNativeSetTrack(ctx, kind, track) {
  if (kind !== 'mic' && kind !== 'camera') {
    // tela pelo navegador não existe no app do Linux (a tela vai pelo auxiliar, que publica sozinho
    // — ver publishNativeToSfu — e o som dela vai pelo próprio app)
    return Promise.resolve();
  }
  const next = (ctx.queue.get(kind) || Promise.resolve())
    .then(() => (kind === 'mic' ? sfuNativeSetMic(ctx, track) : sfuNativeSetCamera(ctx, track)))
    .catch((err) => console.warn('[sfu] (app) não consegui ligar', kind, 'na call:', err));
  ctx.queue.set(kind, next);
  return next;
}

// o microfone já tratado (ou o cru, sem processamento) → blocos de 20 ms pro app
async function sfuNativeSetMic(ctx, track) {
  if (ctx.mic && ctx.mic.track === track) return;
  sfuNativeStopMic(ctx);
  if (!track || sfu !== ctx) return;
  const mic = { track, src: null, node: null, sink: null };
  ctx.mic = mic;
  const audioCtx = getAudioCtx();
  const node = await createPcmBridgeNode(audioCtx, 'dusky-pcm-tap', {
    numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1],
  });
  if (sfu !== ctx || ctx.mic !== mic) {
    if (node) node.port.postMessage('stop');
    return;
  }
  if (!node) {
    toast('não consegui ligar o microfone na call', 'error');
    return;
  }
  mic.node = node;
  mic.src = audioCtx.createMediaStreamSource(new MediaStream([track]));
  // o tap não toca nada: sai num ganho zero só pra o navegador manter ele rodando
  mic.sink = audioCtx.createGain();
  mic.sink.gain.value = 0;
  mic.src.connect(node);
  node.connect(mic.sink);
  mic.sink.connect(audioCtx.destination);
  node.port.onmessage = ({ data }) => {
    if (sfu === ctx && ctx.mic === mic) ctx.api.pushMic(data);
  };
}

// minha câmera: desenha o <video> num canvas ~30x por segundo e manda cada quadro em JPEG pro app
async function sfuNativeSetCamera(ctx, track) {
  if (ctx.camera && ctx.camera.track === track) return;
  sfuNativeStopCamera(ctx);
  if (!track || sfu !== ctx) return;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  await video.play().catch(() => { /* toca sozinho quando chegar o 1º quadro */ });
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  const cam = { track, video, canvas, timer: null, busy: false };
  ctx.camera = cam;
  const tick = () => {
    if (sfu !== ctx || ctx.camera !== cam) return;
    cam.timer = setTimeout(tick, 1000 / 30);
    if (cam.busy || !video.videoWidth || track.readyState !== 'live' || !track.enabled) return;
    const k = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
    const w = Math.max(2, Math.round(video.videoWidth * k) & ~1);
    const h = Math.max(2, Math.round(video.videoHeight * k) & ~1);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    g.drawImage(video, 0, 0, w, h);
    cam.busy = true;
    canvas.toBlob(async (blob) => {
      try {
        if (blob && sfu === ctx && ctx.camera === cam) await ctx.api.pushCamera(new Uint8Array(await blob.arrayBuffer()));
      } catch (_) { /* fora da call */ } finally {
        cam.busy = false;
      }
    }, 'image/jpeg', 0.85);
  };
  tick();
}

function sfuNativeStopCamera(ctx) {
  const cam = ctx.camera;
  ctx.camera = null;
  if (!cam) return;
  clearTimeout(cam.timer);
  cam.video.srcObject = null;
  ctx.api.stopCamera();
}

function sfuNativeStopMic(ctx) {
  const mic = ctx.mic;
  ctx.mic = null;
  if (!mic) return;
  if (mic.node) { mic.node.port.postMessage('stop'); mic.node.port.onmessage = null; }
  for (const n of [mic.src, mic.node, mic.sink]) { if (n) { try { n.disconnect(); } catch (_) { /* já desligado */ } } }
}

function sfuNativeTeardown(ctx) {
  if (ctx.unsubscribe) { ctx.unsubscribe(); ctx.unsubscribe = null; }
  sfuNativeStopMic(ctx);
  sfuNativeStopCamera(ctx);
  for (const sid of [...ctx.players.keys()]) sfuNativeRemoveAudio(ctx, sid);
  for (const sid of [...ctx.videos.keys()]) sfuNativeRemoveVideo(ctx, sid);
}
