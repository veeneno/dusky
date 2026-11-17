// dusky — Áudio da call: microfone, supressão de ruído, sons e bot de música
// Parte 18 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - chamada de voz (WebRTC)
//   - volume acima de 100%: UM caminho só
//   - supressão de ruído de verdade (RNNoise, WASM) — mesma família de técnica do Krisp
//   - supressão de ruído avançada (DeepFilterNet3) — a mais parecida com a Krisp do Discord
//   - áudio de cada pessoa da call
//   - áudio do bot de música (server/bots/musicBot)
//   - sincronia do bot entre todo mundo

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
// não sou eu.
//
// Contexto de áudio SÓ dos sons (sfxCtx), separado do da call (audioCtx). Antes os sons
// dividiam o contexto com a supressão de ruído (DeepFilterNet/RNNoise rodam em worklets nele):
// quando o processamento atrasava, ou o contexto estava suspenso/sendo montado no meio da
// entrada na call, o "blip" de entrar/sair se perdia ou saía picotado. Separado, o som nunca
// espera a call. Ele também segue a saída de áudio escolhida (applyOutputDeviceToAudioCtx).
let sfxCtx = null;
function getSfxCtx() {
  if (!sfxCtx) {
    sfxCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    applyOutputDeviceToSfxCtx();
  }
  return sfxCtx;
}
function applyOutputDeviceToSfxCtx() {
  if (!sfxCtx || typeof sfxCtx.setSinkId !== 'function') return;
  const id = getSavedDeviceId('speaker');
  sfxCtx.setSinkId(id && id !== 'default' ? id : '').catch(() => { /* dispositivo sumiu — segue no padrão */ });
}

// o mesmo som pedido duas vezes quase juntas (ex: evento repetido ao reconectar) toca uma vez só
const lastSoundAt = new Map();

function playChime(name, frequencies, opts = {}) {
  if (!getSavedNotificationSounds()) return;
  const nowMs = performance.now();
  if (nowMs - (lastSoundAt.get(name) || 0) < 150) return;
  lastSoundAt.set(name, nowMs);
  let ctx;
  try { ctx = getSfxCtx(); } catch (err) { console.warn('[sound] sem Web Audio:', err); return; }

  const schedule = () => {
    try {
      // começa um tiquinho no futuro: agendar exatamente em currentTime às vezes cai num bloco de
      // áudio que já foi processado, e o começo da nota (ou ela inteira) some
      const now = ctx.currentTime + 0.03;
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
      console.warn('[sound] não consegui tocar o som:', err);
    }
  };

  // contexto suspenso (navegador antes do primeiro clique, ou o sistema pausou o áudio): espera
  // ele voltar pra agendar — agendar antes faz as notas nascerem "no passado" quando ele retoma
  if (ctx.state === 'running') schedule();
  else ctx.resume().then(schedule).catch((err) => console.warn('[sound] áudio bloqueado pelo navegador:', err));
}

// o navegador só libera áudio depois de um gesto: destrava os sons no primeiro clique/tecla
['pointerdown', 'keydown'].forEach((evt) => document.addEventListener(evt, () => {
  try { const ctx = getSfxCtx(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); } catch (_) { /* sem Web Audio */ }
}, { capture: true, passive: true }));

// sons de call (alguém entrou/saiu, eu entrei/saí) tocam em qualquer status. Os de mensagem só
// com o status "ativo" (ver myPresenceStatus em 08-notifications.js).

// duas notas subindo — mesmo som pra "eu entrei" e "o outro entrou"
function playJoinSound() {
  playChime('join', [440, 660], { stepDuration: 0.09, noteDuration: 0.17 });
}

// duas notas descendo — o inverso do som de entrada, pra ficar reconhecível de ouvido
function playLeaveSound() {
  playChime('leave', [560, 360], { stepDuration: 0.09, noteDuration: 0.19 });
}

// nota única, mais curta e discreta — não deve competir com quem está falando numa call.
// Só toca com o status "ativo" (force: teste nas configurações, que sempre toca).
function playMessageSound(opts = {}) {
  if (!opts.force && myPresenceStatus() !== 'online') return;
  playChime('message', [740], { noteDuration: 0.11, volume: 0.13, type: 'triangle' });
}

// mutar/desmutar e ensurdecer: cliques curtos, graves pra "desligou" e agudos pra "ligou"
function playMuteSound() { playChime('mute', [520, 390], { stepDuration: 0.05, noteDuration: 0.08, volume: 0.12, type: 'triangle' }); }
function playUnmuteSound() { playChime('unmute', [390, 520], { stepDuration: 0.05, noteDuration: 0.08, volume: 0.12, type: 'triangle' }); }
function playDeafenSound() { playChime('deafen', [440, 330, 247], { stepDuration: 0.05, noteDuration: 0.09, volume: 0.12, type: 'triangle' }); }
function playUndeafenSound() { playChime('undeafen', [247, 330, 440], { stepDuration: 0.05, noteDuration: 0.09, volume: 0.12, type: 'triangle' }); }

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
  applyOutputDeviceToSfxCtx();
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
      const { DeepFilterNet3Core } = await import(`${DEEPFILTER_BASE}/index.esm.js?v=6`);
      // Os níveis são limites de atenuação em dB (ver NOISE_SUPPRESSION_LEVELS). Já nasce no nível
      // salvo pra não ter um instante com a intensidade errada.
      const core = new DeepFilterNet3Core({ sampleRate: 48000, noiseReductionLevel: getSavedNoiseSuppressionLevel(), assetConfig: { cdnUrl: DEEPFILTER_BASE } });
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
        setPostFilterBeta: (beta) => core.setPostFilterBeta(beta, node),
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
    createMicWorklet(ctx, 'dusky-mic-limiter', '/js/worklets/mic-limiter.js?v=2'),
    createMicWorklet(ctx, 'dusky-mic-gate', '/js/worklets/mic-gate.js?v=3', { numberOfInputs: 2 }),
    wantsLeveler
      ? createMicWorklet(ctx, 'dusky-mic-leveler', '/js/worklets/mic-leveler.js?v=2', { processorOptions: { initialGainDb: lastLevelerGainDb } })
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
      setSuppressionLevel: ns.setSuppressionLevel, setPostFilterBeta: ns.setPostFilterBeta, teardown,
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
    graph.setPostFilterBeta?.(noiseSuppressionPostFilterBeta(getSavedNoiseSuppressionLevel()));
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
  if (!webkitGtkApp()) el.muted = isDeafened; // Linux: nunca (ver webkitGtkApp)
  const savedSpeaker = getSavedDeviceId('speaker');
  if (SUPPORTS_SINK_ID && savedSpeaker && el.sinkId !== savedSpeaker) {
    el.setSinkId(savedSpeaker).catch(() => { /* dispositivo pode ter sido desconectado — segue no padrão */ });
  }
  return el;
}

function connectPeerAudio(peer) {
  const el = getPeerAudioEl(peer);
  // Linux: o som vai só pelo reforço (Web Audio) — o elemento fica sem fonte (ver webkitGtkApp)
  if (webkitGtkApp()) {
    if (el.srcObject) el.srcObject = null;
  } else if (el.srcObject !== peer.audioStream) {
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
    // call-mundo (27-world.js): o som inteiro passa por aqui e por um PannerNode — vem da direção
    // e da distância do boneco da pessoa. Fora do mundo, o caminho continua igual a antes.
    if (worldCallActive()) {
      peer.spatialPanner = createWorldPanner(ctx);
      peer.boostGain.connect(peer.spatialPanner);
      peer.spatialPanner.connect(boostOutput(ctx));
      updateSpatialFor(peer.userId);
    } else {
      peer.spatialPanner = null;
      peer.boostGain.connect(boostOutput(ctx));
    }
    peer.boostSource = peer.audioStream;
  } catch (err) {
    console.warn('[call] não consegui montar o reforço de volume acima de 100%:', err);
  }
}

// call pelo Rust (app do Linux, 21-call-sfu.js → sfuConnectNative): o som das pessoas só toca
// pela Web Audio, nunca por <audio>/<video> (ver applyLocalOverridesToRemoteAudio)
function nativeCallAudio() {
  return typeof sfu !== 'undefined' && !!sfu && !!sfu.native;
}

// App do Linux (Tauri/WebKitGTK): o `.muted`/`.volume` de um <audio>/<video> vira o mudo/volume
// do FLUXO no PipeWire, e o WirePlumber guarda isso por aplicativo ("dusky", em
// ~/.local/state/wireplumber/stream-properties). Mutou um elemento uma vez (ex.: o <audio> de
// alguém, que ficava sempre mudo pra o som ir pela Web Audio) e TODO som que o app abrir depois
// nasce mudo — vozes, bot, tudo que passa pelo audioCtx — e nada dentro do app desfaz.
// Por isso, no app do Linux, nenhum elemento da call carrega áudio nem é mutado/abaixado:
// o som vai só pela Web Audio e volume, silenciar e ensurdecer são feitos nos GainNodes.
function webkitGtkApp() {
  const d = window.duskyDesktop;
  return !!(d && d.shell === 'tauri' && d.platform === 'linux');
}

// aplica volume (0–200%) + silenciar-localmente no áudio de uma pessoa da call. Nunca mexe em
// `.muted` do elemento além do ensurdecer (isDeafened).
function applyLocalOverridesToRemoteAudio(userId) {
  const peer = peers.get(userId);
  if (!peer || !peer.audioEl) return;
  const override = getLocalOverride(userId);
  const vol = getSavedVolume(userId); // 0–200
  const factor = override.mutedLocal ? 0 : vol / 100;
  // acima de 100%: o elemento fica mudo e o reforço leva o som inteiro (um caminho só — ver boostOutput).
  // Na call-mundo é sempre assim: o som tem que passar pelo PannerNode (áudio espacial).
  // No app do Linux (call pelo Rust) também: o WebKitGTK toca SILÊNCIO num <audio> cujo srcObject
  // vem de um MediaStreamAudioDestinationNode (o som chega certinho no stream, mas o elemento não
  // toca) — então lá o som sempre vai pela Web Audio, o mesmo caminho do bot de música.
  if (webkitGtkApp()) {
    // Linux: elemento intocado (sem fonte, sem mudo); volume/silenciar/ensurdecer só no ganho
    if (peer.boostGain) peer.boostGain.gain.setTargetAtTime(isDeafened ? 0 : factor, getAudioCtx().currentTime, 0.03);
    return;
  }
  const boosted = !!peer.boostGain && (factor > 1 || !!peer.spatialPanner || nativeCallAudio());
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
  if (!webkitGtkApp()) el.muted = isDeafened; // Linux: o ganho zera (ver webkitGtkApp)
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
  ensureBotAudioBoostGraph(el);
  if (el.dataset.stream !== wanted) {
    el.dataset.stream = wanted;
    // começa em silêncio e só sobe (com fade) depois de saber o volume do /volume deste servidor —
    // antes tocava o primeiro instante em 100% e só depois baixava: "entrava muito alto"
    if (botAudioBoostGainNode) botAudioBoostGainNode.gain.setValueAtTime(0, getAudioCtx().currentTime);
    botVolumeReady = false;
    el.src = wanted;
    botSeekedToLive = false;
    loadMusicbotState(serverId).finally(() => {
      if (el.dataset.stream !== wanted) return; // trocou de servidor enquanto carregava
      botVolumeReady = true;
      applyLocalOverridesToBotAudio({ fadeIn: true });
    });
  } else {
    applyLocalOverridesToBotAudio();
  }
  el.play().catch((err) => {
    console.warn('[musicbot] autoplay do áudio do bot foi bloqueado pelo navegador:', err);
  });
  startBotCatchUp(el);
}

// ---------- sincronia do bot entre todo mundo ----------
// o stream é uma rádio ao vivo; quem conecta no meio recebe alguns segundos "de reserva" pra
// começar a tocar na hora (server/bots/musicBot/stream.js) — e fica esses segundos atrás de quem
// já estava ouvindo. Aqui o app mede quanto áudio tem guardado à frente do que está tocando e,
// se estiver atrasado, acelera de leve (sem mudar o tom) até ficar perto do ao vivo. Resultado:
// todo mundo ouve o bot com ~1s de diferença no máximo, e sem travar por falta de reserva.
const BOT_TARGET_LEAD_S = 1.0; // reserva ideal (protege contra oscilação da internet)
const BOT_SEEK_LEAD_S = 2.5;   // atrasado demais: tenta pular direto pra perto do ao vivo
let botCatchUpTimer = null;
let botSeekedToLive = false;   // já pulou pro ao vivo nesta conexão?
let botVolumeReady = false;    // já sabe o volume do /volume deste servidor?

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
    // logo que começa a tocar: se chegou com mais reserva que o ideal, pula pro ponto dos outros
    if (!botSeekedToLive && el.currentTime > 0) {
      botSeekedToLive = true;
      if (lead > BOT_TARGET_LEAD_S + 0.4) {
        try { el.currentTime = el.buffered.end(el.buffered.length - 1) - BOT_TARGET_LEAD_S; } catch (_) { /* sem seek: a aceleração resolve */ }
      }
    }
    if (lead > BOT_SEEK_LEAD_S) {
      try { el.currentTime = el.buffered.end(el.buffered.length - 1) - BOT_TARGET_LEAD_S; } catch (_) { /* stream sem seek: a aceleração resolve */ }
    }
    // atrasado: acelera de leve (sem mudar o tom) — mais forte quanto mais atrás estiver
    const rate = lead > BOT_TARGET_LEAD_S + 1.2 ? 1.12 : lead > BOT_TARGET_LEAD_S + 0.4 ? 1.06 : (lead < BOT_TARGET_LEAD_S + 0.1 ? 1.0 : el.playbackRate);
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
  botVolumeReady = false;
  botSeekedToLive = false;
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
    botAudioBoostGainNode.gain.value = 0; // sobe com applyLocalOverridesToBotAudio, nunca entra no máximo
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
// Ensurdecido = bot em silêncio. O som do bot passa pela Web Audio (elemento → ganho → saída), e
// nesse caminho o `muted` do elemento NÃO silencia em todo navegador (no app do Linux não
// silenciava) — por isso o ensurdecer zera o próprio ganho, além do muted.
// opts.fadeIn: sobe devagar (~0,5 s) em vez de entrar de uma vez
function applyLocalOverridesToBotAudio(opts = {}) {
  const el = document.getElementById('musicbotAudio');
  if (!el) return;
  const override = getLocalOverride(BOT_USER_ID);
  const vol = getSavedVolume(BOT_USER_ID); // 0–200
  const silenced = override.mutedLocal || isDeafened || !botVolumeReady;
  const factor = silenced ? 0 : vol / 100;
  if (!webkitGtkApp()) el.muted = isDeafened; // Linux: só o ganho (ver webkitGtkApp)
  if (botAudioBoostGainNode) {
    // todo o som do bot já passa pelo ganho: o elemento fica em 100% e o ganho faz 0–200%
    el.volume = 1;
    botAudioBoostGainNode.gain.setTargetAtTime(factor, getAudioCtx().currentTime, opts.fadeIn ? 0.15 : 0.03);
  } else if (!webkitGtkApp()) {
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
  // 0–200%; na call-mundo, a TV pode estar mutada/mais baixa só pra mim (27-world.js)
  const factor = (getSavedScreenVolume(userId) / 100) * worldScreenAudioFactor(userId);
  // acima de 100%: o <video> fica mudo e o reforço leva o som inteiro (um caminho só). No app do
  // Linux, sempre pelo reforço (ver nativeCallAudio)
  if (webkitGtkApp()) {
    // Linux: o <video> da tela não carrega áudio (19-call-ui.js); sem tile = sem som
    if (peer.screenBoostGain) peer.screenBoostGain.gain.setTargetAtTime(el && !isDeafened ? factor : 0, getAudioCtx().currentTime, 0.03);
    return;
  }
  const boosted = (factor > 1 || nativeCallAudio()) && !!peer.screenBoostGain && !!el;
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
  // apertar para falar (30-shortcuts.js): sem a tecla apertada o microfone fica fechado, mesmo desmutado
  const pttOpen = typeof pushToTalkAllowsTransmit === 'function' ? pushToTalkAllowsTransmit() : true;
  const off = isMuted || !pttOpen;
  callMicGraph?.gate.mute(off);
  if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = !off));
  if (rawMicStream && rawMicStream !== localStream) {
    rawMicStream.getAudioTracks().forEach((track) => { track.enabled = !off; });
  }
  if (typeof updatePushToTalkIndicator === 'function') updatePushToTalkIndicator();
}

// opts.quiet: sem som (ex: ensurdecer muta junto e já toca o som próprio dele)
function setMuted(val, opts = {}) {
  // desmutar o microfone ensurdecido = desensurdecer (igual Discord): volta a ouvir e a falar
  if (!val && isDeafened) {
    setDeafened(false);
    return;
  }
  const changed = isMuted !== val;
  isMuted = val;
  applyLocalTrackState();
  if (isMuted) publishLocalSpeaking(false);
  muteBtn.classList.toggle('active', isMuted);
  callViewMuteBtn.classList.toggle('active', isMuted);
  if (changed && !opts.quiet) (isMuted ? playMuteSound : playUnmuteSound)();
  syncLocalVoiceState();
}

function setDeafened(val) {
  const changed = isDeafened !== val;
  isDeafened = val;
  if (changed) (isDeafened ? playDeafenSound : playUndeafenSound)();
  for (const peer of peers.values()) {
    applyLocalOverridesToRemoteAudio(peer.userId);
    applyLocalOverrideToRemoteScreenAudio(peer.userId);
  }
  applyLocalOverridesToBotAudio(); // bot também fica mudo ensurdecido (ganho zerado, não só o muted)
  deafenBtn.classList.toggle('active', isDeafened);
  callViewDeafenBtn.classList.toggle('active', isDeafened);
  if (isDeafened && !isMuted) {
    setMuted(true, { quiet: true }); // ensurdecer também muta o microfone, igual Discord
  } else if (!isDeafened && changed && isMuted && !muteBtn.disabled) { // sem microfone: segue mutado
    // desensurdecer libera ouvir E falar — sempre, mesmo se o microfone já estava mutado antes
    setMuted(false, { quiet: true });
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
