'use strict';
// Áudio do compartilhamento de tela do app desktop.
//
// O Chromium do Electron só sabe pegar o áudio do sistema inteiro (e só no Windows/macOS), o que
// devolveria a voz de quem está na call pra própria call. Então cada plataforma usa um captador
// próprio (linux.js / windows.js) que entrega PCM cru pro processo principal, que repassa pro site
// pelo IPC. O site (public/js/app.js, capturePcmAudioTrack) monta uma MediaStreamTrack com isso.
//
// Fluxo:
//   1. o seletor de tela devolve a fonte escolhida -> prepare()      (decide o plano, não inicia nada)
//   2. o site termina o getDisplayMedia e pede o plano -> start()    (começa a mandar PCM)
//   3. a pessoa para de compartilhar / sai da call     -> stop()

const PCM_FORMAT = { sampleRate: 48000, channels: 2, isFloat: true, bitsPerSample: 32 };
const NO_AUDIO = { mode: 'none' };

function loadPlatform() {
  if (process.platform === 'linux') return require('./linux');
  if (process.platform === 'win32') return require('./windows');
  return null; // macOS: sem captura de áudio por enquanto
}

function createScreenAudio({ log }) {
  const platform = loadPlatform();
  let pending = null; // { start } preparado, mas ainda não iniciado
  let running = null; // { stop } captura em andamento

  function stop() {
    pending = null;
    if (running) {
      const r = running;
      running = null;
      try { r.stop(); } catch (_) { /* já parou */ }
    }
  }

  // Chamado quando a pessoa escolhe uma fonte no seletor.
  // audioChoice: no Wayland o som é escolhido à parte, no nosso seletor (ver linux.js, prepare)
  async function prepare({ source, audioRequested, audioChoice }) {
    stop();
    if (!platform || !audioRequested) return;
    try {
      pending = await platform.prepare({ source, ownPid: process.pid, log, audioChoice });
    } catch (err) {
      log('falha ao preparar o áudio da tela: ' + err.message);
      pending = null;
    }
  }

  // Chamado quando o site pede o plano; é aqui que a captura realmente começa.
  function start(onChunk) {
    if (running) return { mode: 'pcm', ...PCM_FORMAT };
    if (!pending) return NO_AUDIO;
    const job = pending;
    pending = null;
    try {
      const handle = job.start(onChunk, () => { if (running === handle) running = null; });
      running = handle;
    } catch (err) {
      log('falha ao iniciar a captura de áudio da tela: ' + err.message);
      return NO_AUDIO;
    }
    return { mode: 'pcm', ...PCM_FORMAT };
  }

  // apps tocando som agora — só faz sentido no Linux (lista do seletor do Wayland)
  async function listAudioApps() {
    if (!platform || typeof platform.listAudioApps !== 'function') return { available: false, apps: [] };
    return platform.listAudioApps(process.pid);
  }

  return { prepare, start, stop, listAudioApps };
}

module.exports = { createScreenAudio };
