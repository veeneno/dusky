// Ponte entre as páginas e o processo em Rust (o equivalente do electron/preload.js).
// Roda no começo de TODA página da janela (initialization_script) e decide o que expor pelo endereço:
//   site do didiscord  -> window.didiscordDesktop   (mesma API do app Electron)
//   ui/loading.html    -> window.didiscordShell
//   ui/picker.html     -> window.pickerApi
// O Rust confere de novo de onde veio cada pedido (o site só chama o que é do site, etc).
(function () {
  'use strict';
  if (window.__didiscordBridge) return;
  window.__didiscordBridge = true;

  const T = window.__TAURI_INTERNALS__;
  if (!T || typeof T.invoke !== 'function') return;
  const invoke = (cmd, args) => T.invoke(cmd, args || {});
  // "manda e esquece" (o Electron usava ipcRenderer.send): erro não vira unhandledrejection
  const fire = (cmd, args) => { invoke(cmd, args).catch((err) => console.warn('[didiscord]', cmd, err)); };

  // eventos que o Rust manda com webview.eval("window.__didiscordEmit(nome, dados)")
  const listeners = new Map(); // nome -> Set<função>
  function on(name, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    return () => listeners.get(name).delete(callback);
  }
  Object.defineProperty(window, '__didiscordEmit', {
    value: (name, payload) => {
      const set = listeners.get(name);
      if (!set || !set.size) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error('[didiscord]', name, err); }
      }
    },
    writable: false,
    configurable: false,
  });

  // páginas do próprio app (ui/): tauri://localhost, http://tauri.localhost ou, no npm run dev, o
  // servidor de desenvolvimento do Tauri (o Rust diz qual em __DIDISCORD_LOCAL_ORIGIN__)
  const isLocal = location.protocol === 'tauri:' || location.hostname === 'tauri.localhost'
    || (!!window.__DIDISCORD_LOCAL_ORIGIN__ && location.origin === window.__DIDISCORD_LOCAL_ORIGIN__);
  const platform = navigator.userAgent.includes('Windows') ? 'win32' : 'linux';

  if (isLocal && location.pathname.endsWith('/picker.html')) {
    window.pickerApi = {
      mode: new URLSearchParams(location.search).get('mode') || 'sources',
      getSources: () => invoke('picker_get_sources'),
      choose: (id) => { fire('picker_choose', { id: String(id) }); },
      getAudioApps: () => invoke('picker_get_audio_apps'),
      chooseAudio: (choice) => { fire('picker_choose_audio', { choice: choice || {} }); },
      cancel: () => { fire('picker_cancel'); },
    };
    return;
  }

  if (isLocal) {
    window.didiscordShell = {
      getStatus: () => invoke('shell_get_status'),
      onStatus: (cb) => on('shell:status', cb),
      setServer: (input) => invoke('shell_set_server', { input: String(input || '') }),
      cancelChange: () => { fire('shell_cancel_change'); },
    };
    return;
  }

  // ---------- site do didiscord ----------

  // PCM do áudio da tela chega em base64 (pedaços de ~20-40 ms); vira Uint8Array aqui
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const pcmListeners = new Set();
  on('pcm', (b64) => {
    if (!pcmListeners.size) return;
    const bytes = b64ToBytes(b64);
    for (const fn of pcmListeners) {
      try { fn(bytes); } catch (_) { /* um ouvinte com erro não derruba os outros */ }
    }
  });

  window.didiscordDesktop = {
    platform,
    shell: 'tauri',

    setBadge: (count) => { fire('desktop_set_badge', { count: Number(count) || 0 }); },
    focusWindow: () => { fire('desktop_focus'); },

    status: {
      report: (status) => { fire('status_report', { status: String(status || '') }); },
      onSetRequest: (cb) => on('status:set', cb),
    },

    getScreenAudioPlan: () => invoke('screen_audio_plan'),
    onPcmChunk: (callback) => {
      if (typeof callback !== 'function') return () => {};
      pcmListeners.add(callback);
      return () => pcmListeners.delete(callback);
    },
    stopAppAudioCapture: () => invoke('screen_audio_stop'),
    notifyScreenShareStopped: () => invoke('screen_audio_stop'),

    screencast: {
      available: () => invoke('screencast_available'),
      start: (opts) => invoke('screencast_start', { opts: opts || {} }),
      command: (msg) => { fire('screencast_command', { msg: msg || {} }); },
      stop: () => invoke('screencast_stop'),
      onEvent: (cb) => on('screencast:event', cb),
    },
  };

  // Linux: a call pelo servidor de mídia vai pelo Rust (o WebKitGTK não tem RTCPeerConnection).
  // O site (21-call-sfu.js) usa isto no lugar do LiveKit do navegador quando existe.
  if (window.__DIDISCORD_NATIVE_CALL__) {
    window.didiscordDesktop.call = {
      // { path, token, micBitrate } -> { ok, reason? }
      join: (opts) => invoke('call_join', { opts: opts || {} }),
      leave: () => { fire('call_leave'); },
      // Float32Array (48 kHz mono, já tratado) -> corpo cru, sem virar JSON
      pushMic: (samples) => {
        const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
        T.invoke('call_push_mic', bytes).catch(() => { /* fora da call */ });
      },
      // ArrayBuffer com o áudio de cada faixa (formato em src/call.rs, call_pull)
      pull: () => invoke('call_pull'),
      setSubscribed: (userId, screen, on) => { fire('call_set_subscribed', { userId: Number(userId), screen: !!screen, on: !!on }); },
      // ArrayBuffer com os quadros novos de vídeo (JPEG) de cada faixa (formato em call_pull_video)
      pullVideo: () => invoke('call_pull_video'),
      // um quadro da minha câmera (Uint8Array com um JPEG) -> true se foi
      pushCamera: (jpeg) => T.invoke('call_push_camera', jpeg),
      stopCamera: () => { fire('call_stop_camera'); },
      // números de qualidade de uma faixa (lista no formato do getStats() do navegador)
      stats: (sid) => invoke('call_stats', { sid: String(sid) }),
      // eventos: participant, participantLeft, track, trackEnded, reconnecting, reconnected, disconnected, error
      onEvent: (cb) => on('call:event', cb),
    };
  }
})();
