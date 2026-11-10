'use strict';
// Ponte entre o site (que roda no domínio remoto) e o processo principal do Electron.
// Expõe só `window.didiscordDesktop` — o site (public/js/app.js) usa isso pro áudio da tela
// compartilhada. Nada de Node/ipcRenderer vaza pra página.

const { contextBridge, ipcRenderer } = require('electron');

const pcmListeners = new Set();
const screencastListeners = new Set();

ipcRenderer.on('screencast:event', (_event, ev) => {
  for (const listener of screencastListeners) {
    try { listener(ev); } catch (_) { /* idem */ }
  }
});

ipcRenderer.on('didiscord:pcm', (_event, bytes) => {
  if (!pcmListeners.size) return;
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const listener of pcmListeners) {
    try { listener(data); } catch (_) { /* um ouvinte com erro não pode derrubar os outros */ }
  }
});

contextBridge.exposeInMainWorld('didiscordDesktop', {
  platform: process.platform,

  // Depois do getDisplayMedia: como o áudio da tela vai ser obtido.
  //   { mode: 'none' }                                             sem áudio
  //   { mode: 'pcm', sampleRate, channels, isFloat, bitsPerSample } PCM chega por onPcmChunk
  getScreenAudioPlan: () => ipcRenderer.invoke('didiscord:getScreenAudioPlan'),

  // Recebe os pedaços de PCM (Uint8Array, float32 intercalado). Devolve a função que cancela.
  onPcmChunk: (callback) => {
    if (typeof callback !== 'function') return () => {};
    pcmListeners.add(callback);
    return () => pcmListeners.delete(callback);
  },

  // Encerram a captura de áudio da tela (as duas são seguras de chamar mais de uma vez).
  stopAppAudioCapture: () => ipcRenderer.invoke('didiscord:stopScreenAudio'),
  notifyScreenShareStopped: () => ipcRenderer.invoke('didiscord:stopScreenAudio'),

  // Compartilhamento de tela pela placa de vídeo (codifica UMA vez e manda o mesmo vídeo pra cada
  // pessoa — ver electron/screencast.js). O site cuida de repassar a sinalização de cada pessoa.
  screencast: {
    // { available, encoderName, hardware, reason, deps: { state, progress } }
    available: () => ipcRenderer.invoke('screencast:available'),
    // abre o seletor e começa: { ok, cancelled, reason, encoderName, hardware, width, height, kbps, sourceName }
    start: (opts) => ipcRenderer.invoke('screencast:start', opts),
    // { cmd: 'add'|'answer'|'candidate'|'remove', viewer, sdp?, candidate? }
    command: (msg) => ipcRenderer.send('screencast:command', msg),
    stop: () => ipcRenderer.invoke('screencast:stop'),
    // eventos: offer, candidate, state, stats, started, error, ended. Devolve a função que cancela.
    onEvent: (callback) => {
      if (typeof callback !== 'function') return () => {};
      screencastListeners.add(callback);
      return () => screencastListeners.delete(callback);
    },
  },
});

// Tela local de "conectando…" / escolher servidor (shell/loading.html, carregada do disco).
// Só existe nela — o site remoto nunca vê isso (e o processo principal confere de onde veio o pedido).
if (location.protocol === 'file:') {
  const statusListeners = new Set();
  ipcRenderer.on('shell:status', (_event, st) => {
    for (const listener of statusListeners) {
      try { listener(st); } catch (_) { /* idem */ }
    }
  });
  contextBridge.exposeInMainWorld('didiscordShell', {
    // { phase: 'setup'|'change'|'connecting'|'loading', url, attempts, since, fixedByEnv }
    getStatus: () => ipcRenderer.invoke('shell:getStatus'),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};
      statusListeners.add(callback);
      return () => statusListeners.delete(callback);
    },
    // { ok, error?, relaunching? }
    setServer: (input) => ipcRenderer.invoke('shell:setServer', String(input || '')),
    cancelChange: () => ipcRenderer.send('shell:cancelChange'),
  });
}
