// conexão websocket com reconexão automática + pub/sub simples
const Realtime = (function () {
  let socket = null;
  let connecting = false; // evita abrir 2 sockets em paralelo se connect() for chamado de novo no meio de uma tentativa
  let reconnectTimer = null;
  let lastMessageAt = 0;
  const listeners = new Map(); // event type -> Set(callback)
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY_MS = 15000;

  function on(type, cb) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(cb);
    return () => listeners.get(type).delete(cb);
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (set) for (const cb of set) {
      try { Promise.resolve(cb(payload)).catch((err) => console.error('[ws] listener', type, err)); }
      catch (err) { console.error('[ws] listener', type, err); }
    }
  }

  // manda uma mensagem pro servidor (usado pela sinalização WebRTC e pelo estado de voz)
  function send(type, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, ...(payload || {}) }));
    return true;
  }

  // agenda uma nova tentativa de conexão com backoff exponencial (até um teto), cancelando
  // qualquer tentativa já agendada — sem isso, uma falha rápida seguida de outra podia empilhar
  // múltiplos setTimeout e gerar tentativas de conexão em paralelo.
  function scheduleReconnect() {
    if (reconnectTimer) return; // já tem uma tentativa agendada, não duplica
    emit('connection_status', { status: 'reconnecting' });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.6, MAX_RECONNECT_DELAY_MS);
  }

  async function connect() {
    if (connecting || (socket && socket.readyState === WebSocket.OPEN)) return;
    connecting = true;
    try {
      const res = await fetch('/api/ws/ticket', { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        // sem sessão válida ainda (ex: carregando a página de login) — não é erro de rede,
        // então não fica tentando de novo sozinho; quem faz login de novo chama connect() de novo.
        connecting = false;
        if (res.status !== 401 && res.status !== 403) scheduleReconnect();
        return;
      }
      const { ticket } = await res.json();

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const nextSocket = new WebSocket(`${proto}://${window.location.host}/ws?ticket=${ticket}`);
      socket = nextSocket;
      const handshakeTimer = setTimeout(() => {
        if (socket !== nextSocket || nextSocket.readyState === WebSocket.OPEN) return;
        socket = null;
        connecting = false;
        nextSocket.close();
        scheduleReconnect();
      }, 15000);

      nextSocket.addEventListener('message', (ev) => {
        if (socket !== nextSocket) return;
        lastMessageAt = Date.now();
        let data;
        try {
          data = JSON.parse(ev.data);
        } catch (_) {
          return; // mensagem malformada, ignora
        }
        // heartbeat do servidor: responde na hora, não expõe pros listeners da aplicação
        if (data.type === 'ping') {
          nextSocket.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (data.type !== 'pong') emit(data.type, data);
      });

      nextSocket.addEventListener('open', () => {
        if (socket !== nextSocket) return;
        clearTimeout(handshakeTimer);
        lastMessageAt = Date.now();
        connecting = false;
        reconnectDelay = 1000;
        emit('connection_status', { status: 'open' });
      });

      nextSocket.addEventListener('close', (ev) => {
        clearTimeout(handshakeTimer);
        if (socket !== nextSocket) return;
        console.warn('[ws] conexão fechada', { code: ev.code, wasClean: ev.wasClean });
        connecting = false;
        socket = null;
        scheduleReconnect();
      });

      nextSocket.addEventListener('error', () => {
        // 'error' quase sempre é seguido de 'close' no WebSocket — deixa o close cuidar
        // de agendar a reconexão, só evita ficar preso em connecting=true se não vier close.
      });
    } catch (_) {
      connecting = false;
      scheduleReconnect();
    }
  }

  // Se a rede sumir sem gerar close, não fica preso para sempre em OPEN.
  setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastMessageAt <= 75000) return;
    const stale = socket;
    socket = null;
    connecting = false;
    stale.close();
    scheduleReconnect();
  }, 15000);

  // voltou a internet, o PC acordou ou a janela voltou pra frente: não espera o backoff (até 15 s)
  // nem o vigia de 75 s acima. Socket "aberto" mas mudo há mais de 2 pings (o servidor manda um a
  // cada 20 s) provavelmente morreu junto com a rede — troca por um novo na hora.
  function reviveNow() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (Date.now() - lastMessageAt <= 45000) return;
      const stale = socket;
      socket = null;
      connecting = false;
      try { stale.close(); } catch (_) { /* já fechado */ }
      emit('connection_status', { status: 'reconnecting' });
    } else if (!reconnectTimer) {
      return; // nunca conectou (tela de login) ou já está tentando agora
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectDelay = 1000;
    connect();
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('online', reviveNow);
    window.addEventListener('focus', reviveNow);
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reviveNow(); });
  }

  return { connect, on, send };
})();
