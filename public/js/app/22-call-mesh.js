// didiscord — Calls em malha (conexão direta) e qualidade do áudio
// Parte 22 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - chamada em grupo — uma RTCPeerConnection por pessoa ("malha"/mesh)
//   - qualidade do áudio (Opus / RED)

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
  for (const node of [peer.boostGain, peer.screenBoostGain, peer.spatialPanner]) {
    if (node) { try { node.disconnect(); } catch (_) { /* já desconectado */ } }
  }
  peer.analyser = null;
  screenStatsPrev.delete(`in:${userId}`);
  refreshConnectionStatus();
}

function closeAllPeers() {
  for (const userId of [...peers.keys()]) closePeer(userId);
}
