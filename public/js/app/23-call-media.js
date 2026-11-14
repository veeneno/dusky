// dusky — Câmera, compartilhar tela e entrar/sair da call
// Parte 23 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - câmera
//   - compartilhamento de tela

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
  if (window.duskyDesktop) {
    try {
      const plan = await window.duskyDesktop.getScreenAudioPlan();
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
// identificado pela descrição do sink (device.description=dusky-app-share, ver main.js), que
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
// (dusky-audio-helper.exe, via WASAPI Process Loopback — ver electron/main.js e
// electron/native/audio-helper/AudioHelper.cpp) despeja pro processo principal e repassa aqui
// por IPC (window.duskyDesktop.onPcmChunk, ver electron/preload.js). Usa
// MediaStreamTrackGenerator (WebCodecs Insertable Streams) pra transformar cada pedaço de PCM
// num AudioData de verdade, que vira uma MediaStreamTrack normal — o resto do pipeline
// (screenAudioTransceiver, RTCPeerConnection) não sabe nem precisa saber que essa track não veio
// de um getUserMedia/getDisplayMedia normal.
async function capturePcmAudioTrack(plan) {
  if (typeof MediaStreamTrackGenerator === 'undefined' || typeof AudioData === 'undefined') {
    console.warn('[call] este Chromium não suporta MediaStreamTrackGenerator/AudioData — sem áudio da tela (Windows)');
    return null;
  }
  if (!window.duskyDesktop || typeof window.duskyDesktop.onPcmChunk !== 'function') {
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

  pcmAudioUnsubscribe = window.duskyDesktop.onPcmChunk((bytes) => {
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
    clearTimeout(nativeSfuRetryTimer);
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
    if (window.duskyDesktop) {
      // devolve o stream daquele app pro sink de áudio padrão do sistema (senão ele continua
      // mudo/isolado depois que a gente para de compartilhar) — não bloqueia o resto da limpeza
      window.duskyDesktop.stopAppAudioCapture().catch((err) => console.warn('[call] falha ao devolver o roteamento de áudio do app:', err));
    }
  }
  // no-op se o plano não era 'pcm' (Linux/mac, ou compartilhamento sem áudio) — só desmonta o
  // MediaStreamTrackGenerator quando o áudio da tela veio via WASAPI Process Loopback (Windows)
  stopPcmAudioCapture();
  // sempre avisa o processo principal que o compartilhamento acabou, independente do modo —
  // no modo 'system' (tela inteira) isso encerra o recheck periódico que mantém o próprio
  // dusky fora do sink padrão (ver startSelfAwayWatch em electron/main.js); nos outros
  // modos é um no-op inofensivo.
  if (window.duskyDesktop) {
    window.duskyDesktop.notifyScreenShareStopped().catch((err) => console.warn('[call] falha ao avisar o fim do compartilhamento pro processo principal:', err));
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
    leaveVoiceCall({ silent: true, noSound: true }); // trocando de canal: só o som de entrar
  }

  // som de entrar já no clique: antes ele só tocava depois de abrir o microfone e carregar a
  // supressão de ruído (até alguns segundos), e às vezes nem chegava a tocar
  playJoinSound();

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
  if (!opts.noSound) playLeaveSound();
  if (!opts.silent) Realtime.send('voice_leave');

  closeAllPeers();
  sfuDisconnect();
  worldReset(); // mundinho 3D: some com os bonecos e desliga o renderizador (27-world.js)
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
