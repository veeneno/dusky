// didiscord — Calls pelo servidor de mídia (LiveKit)
// Parte 21 de 25 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
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
