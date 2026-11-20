// Ponte entre as páginas e o processo em Rust (o equivalente do electron/preload.js).
// Roda no começo de TODA página da janela (initialization_script) e decide o que expor pelo endereço:
//   site do dusky  -> window.duskyDesktop   (mesma API do app Electron)
//   ui/loading.html    -> window.duskyShell
//   ui/picker.html     -> window.pickerApi
// O Rust confere de novo de onde veio cada pedido (o site só chama o que é do site, etc).
(function () {
  'use strict';
  if (window.__duskyBridge) return;
  window.__duskyBridge = true;

  const T = window.__TAURI_INTERNALS__;
  if (!T || typeof T.invoke !== 'function') return;
  const invoke = (cmd, args) => T.invoke(cmd, args || {});
  // "manda e esquece" (o Electron usava ipcRenderer.send): erro não vira unhandledrejection
  const fire = (cmd, args) => { invoke(cmd, args).catch((err) => console.warn('[dusky]', cmd, err)); };

  // eventos que o Rust manda com webview.eval("window.__duskyEmit(nome, dados)")
  const listeners = new Map(); // nome -> Set<função>
  function on(name, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    return () => listeners.get(name).delete(callback);
  }
  Object.defineProperty(window, '__duskyEmit', {
    value: (name, payload) => {
      const set = listeners.get(name);
      if (!set || !set.size) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error('[dusky]', name, err); }
      }
    },
    writable: false,
    configurable: false,
  });

  // páginas do próprio app (ui/): tauri://localhost, http://tauri.localhost ou, no npm run dev, o
  // servidor de desenvolvimento do Tauri (o Rust diz qual em __DUSKY_LOCAL_ORIGIN__)
  const isLocal = location.protocol === 'tauri:' || location.hostname === 'tauri.localhost'
    || (!!window.__DUSKY_LOCAL_ORIGIN__ && location.origin === window.__DUSKY_LOCAL_ORIGIN__);
  const platform = navigator.userAgent.includes('Windows') ? 'win32' : 'linux';

  if (isLocal && location.pathname.endsWith('/picker.html')) {
    window.pickerApi = {
      mode: new URLSearchParams(location.search).get('mode') || 'sources',
      getSources: () => invoke('picker_get_sources'),
      // exclude: { own, apps } — "não levar o som de" da tela inteira (null = só o dusky)
      choose: (id, exclude) => { fire('picker_choose', { id: String(id), exclude: exclude || null }); },
      getAudioApps: () => invoke('picker_get_audio_apps'),
      chooseAudio: (choice) => { fire('picker_choose_audio', { choice: choice || {} }); },
      cancel: () => { fire('picker_cancel'); },
    };
    return;
  }

  if (isLocal) {
    window.duskyShell = {
      appInfo: window.__DUSKY_APP_INFO__ || null,
      getStatus: () => invoke('shell_get_status'),
      onStatus: (cb) => on('shell:status', cb),
      setServer: (input) => invoke('shell_set_server', { input: String(input || '') }),
      cancelChange: () => { fire('shell_cancel_change'); },
    };
    return;
  }

  // ---------- site do dusky ----------

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

  const appInfo = window.__DUSKY_APP_INFO__ || { name: 'dusky', shell: 'tauri' };
  window.duskyDesktop = {
    platform,
    shell: 'tauri',
    // { name, version, codename, label ("dusky Mist 1.0"), shell, os }
    appInfo,
    appVersion: appInfo.version || null,

    setBadge: (count) => { fire('desktop_set_badge', { count: Number(count) || 0 }); },
    focusWindow: () => { fire('desktop_focus'); },
    // procura versão nova (as respostas aparecem em janelinhas do próprio app)
    // aceleração de hardware (reinicia o app). appInfo.gpu.hardwareAcceleration diz como está
    setHardwareAcceleration: (on) => { fire('app_set_hardware_acceleration', { on: !!on }); },
    // uso de memória: 'alto' | 'equilibrado' | 'minimo' (reinicia o app). appInfo.gpu.memoryMode diz qual está
    setMemoryMode: (mode) => { fire('app_set_memory_mode', { mode: String(mode || '') }); },
    checkForUpdates: () => invoke('update_check').catch((err) => console.warn('[dusky] atualização', err)),
    // abre a pasta com o dusky.log (pra mandar quando algo der errado)
    openLogs: () => { fire('app_open_logs'); },
    // abre um endereço no navegador do sistema (links de fora são mandados pra cá sozinhos, abaixo)
    openExternal: (url) => invoke('desktop_open_external', { url: String(url || '') }),
    // tela cheia da janela: true/false liga/desliga, null alterna. -> como estava antes
    setFullscreen: (on) => invoke('desktop_fullscreen', { on: on == null ? null : !!on }),
    // a página está numa call: a bandeja não descarrega a página (src/tray_watch.rs)
    setBusy: (busy) => { fire('desktop_set_busy', { busy: !!busy }); },
    // nível de notificação ('all' | 'mentions' | 'none') pros avisos da bandeja com a página descarregada
    trayConfig: (level) => { fire('desktop_tray_config', { level: String(level || '') }); },
    // iniciar com o sistema (desligado por padrão). set(on) -> como ficou
    autostart: {
      enabled: !!appInfo.autostart,
      set: (on) => invoke('app_set_autostart', { on: !!on }),
    },
    // aba "desempenho" (src/perf.rs): CPU, RAM e placa de vídeo de cada processo do dusky
    // -> { os, cpus, totalMemoryBytes, memoryKind, gpuSource, gpuNote, processes: [{ pid, ppid, name, role,
    //      cpuPercent, memoryBytes, gpuPercent, gpuMemoryBytes }] } (null = não deu pra medir)
    perfSnapshot: () => invoke('perf_snapshot'),
    // arrastar arquivo no Linux (src/drops.rs): os arquivos que a pessoa acabou de soltar, como File.
    // [] = nada (ou não é o caso). Grande demais: vem { tooBig: [nomes] } junto.
    droppedFiles: async () => {
      const list = await invoke('drop_files').catch(() => []);
      const files = [];
      const tooBig = [];
      for (const f of list || []) {
        if (f.too_big) { tooBig.push(f.name); continue; }
        const buf = await invoke('drop_read', { id: f.id }).catch(() => null);
        if (buf && buf.byteLength === f.size) files.push(new File([buf], f.name, { type: f.type }));
      }
      return { files, tooBig };
    },

    status: {
      report: (status) => { fire('status_report', { status: String(status || '') }); },
      onSetRequest: (cb) => on('status:set', cb),
    },

    // "jogando X": o app descobre o jogo aberto e avisa o site (ver src/presence.rs)
    presence: {
      // { enabled, custom: [{ exe, name }] } — desligado = não lê nem envia nada
      configure: (cfg) => { fire('presence_configure', { cfg: cfg || {} }); },
      // [{ exe, label }] programas abertos que podem ser um jogo (pra "adicionar jogo")
      candidates: () => invoke('presence_candidates').catch(() => []),
      // { name, startedAt } | null
      current: () => invoke('presence_current').catch(() => null),
      // chamado com { name, startedAt } quando um jogo abre/troca, ou null quando fecha
      onActivity: (cb) => on('presence:activity', cb),
    },

    getScreenAudioPlan: () => invoke('screen_audio_plan'),
    onPcmChunk: (callback) => {
      if (typeof callback !== 'function') return () => {};
      pcmListeners.add(callback);
      return () => pcmListeners.delete(callback);
    },
    stopAppAudioCapture: () => invoke('screen_audio_stop'),
    notifyScreenShareStopped: () => invoke('screen_audio_stop'),

    // atalhos globais (src/shortcuts.rs): [{ id, accel: "Ctrl+Shift+KeyM", description }] ->
    // { backend: hotkey|portal|none, active, errors, bound, hint }. onShortcut: { id, down }
    shortcuts: {
      configure: (list) => invoke('shortcuts_configure', { list: Array.isArray(list) ? list : [] }),
      onShortcut: (cb) => on('shortcut', cb),
    },

    screencast: {
      // -> { available, encoderName, hardware, encoderMode: 'auto' | 'cpu', ... }
      available: () => invoke('screencast_available'),
      // 'auto' (placa de vídeo primeiro) | 'cpu' (processador). Vale no próximo compartilhamento -> modo
      setEncoder: (mode) => invoke('screencast_set_encoder', { mode: String(mode || '') }),
      start: (opts) => invoke('screencast_start', { opts: opts || {} }),
      command: (msg) => { fire('screencast_command', { msg: msg || {} }); },
      stop: () => invoke('screencast_stop'),
      onEvent: (cb) => on('screencast:event', cb),
    },
  };

  // nome antigo: páginas de antes do "dusky" procuravam window.didiscordDesktop
  window.didiscordDesktop = window.duskyDesktop;

  // ---------- links de fora: sempre no navegador do sistema ----------
  // O clique não depende mais do motor web pedir uma janela nova (no Linux, às vezes não chegava
  // nada e o link não abria). Escuta no fim da propagação: se o site tratou o clique (convite, pular
  // pra mensagem...), defaultPrevented já vem true e fica com ele. Links do próprio site sem
  // target=_blank continuam navegando normal.
  const openOutside = (href) => { invoke('desktop_open_external', { url: href }).catch((err) => console.warn('[dusky] link', err)); };
  const outsideUrl = (href, blank) => {
    let u;
    try { u = new URL(href, location.href); } catch (_) { return null; }
    if (!/^(https?|mailto):$/.test(u.protocol)) return null;
    if (u.origin === location.origin && !blank) return null;
    return u.href;
  };
  const onLinkClick = (e) => {
    if (e.defaultPrevented || (e.button !== 0 && e.button !== 1)) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download')) return;
    const href = outsideUrl(a.getAttribute('href'), a.target === '_blank' || e.button === 1 || e.ctrlKey || e.shiftKey);
    if (!href) return;
    e.preventDefault();
    openOutside(href);
  };
  window.addEventListener('click', onLinkClick);
  window.addEventListener('auxclick', onLinkClick);
  const nativeOpen = window.open;
  window.open = function (url, target, features) {
    const href = url == null ? null : outsideUrl(String(url), true);
    if (href) { openOutside(href); return null; }
    return nativeOpen.call(window, url, target, features);
  };

  // ---------- tela cheia ----------
  // F11 alterna a tela cheia da janela (Linux e Windows). No Windows, o vídeo/tela em tela cheia
  // (requestFullscreen) só ocupava a área da página: aqui a janela acompanha. Ao sair do vídeo,
  // volta como estava (se já estava no F11, continua).
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F11' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat) return;
    e.preventDefault();
    invoke('desktop_fullscreen', { on: null }).catch(() => {});
  }, true);
  if (platform === 'win32') {
    let windowWasFullscreen = null;
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        if (windowWasFullscreen !== null) return;
        invoke('desktop_fullscreen', { on: true }).then((was) => { windowWasFullscreen = !!was; }).catch(() => {});
      } else {
        const was = windowWasFullscreen;
        windowWasFullscreen = null;
        if (!was) invoke('desktop_fullscreen', { on: false }).catch(() => {});
      }
    });
  }

  // Linux: a call pelo servidor de mídia vai pelo Rust (o WebKitGTK não tem RTCPeerConnection).
  // O site (21-call-sfu.js) usa isto no lugar do LiveKit do navegador quando existe.
  if (window.__DUSKY_NATIVE_CALL__) {
    window.duskyDesktop.call = {
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
      // o decodificador perdeu o fio: pede um quadro-chave da tela
      keyframe: (sid) => { fire('call_keyframe', { sid: String(sid) }); },
      // uma linha de diagnóstico no terminal do app
      log: (text) => { fire('call_log', { text: String(text) }); },
      // a página não consegue decodificar a tela dessa pessoa: o app passa a mandar em JPEG
      screenFallback: (userId) => { fire('call_screen_fallback', { userId: Number(userId) }); },
      // eventos: participant, participantLeft, track, trackEnded, reconnecting, reconnected, disconnected, error
      onEvent: (cb) => on('call:event', cb),
    };
  }
})();
