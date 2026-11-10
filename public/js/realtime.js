// conexão websocket com reconexão automática + pub/sub simples
const Realtime = (function () {
  let socket = null;
  let connecting = false; // evita abrir 2 sockets em paralelo se connect() for chamado de novo no meio de uma tentativa
  let reconnectTimer = null;
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
    if (set) for (const cb of set) cb(payload);
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
      const res = await fetch('/api/ws/ticket');
      if (!res.ok) {
        // sem sessão válida ainda (ex: carregando a página de login) — não é erro de rede,
        // então não fica tentando de novo sozinho; quem faz login de novo chama connect() de novo.
        connecting = false;
        return;
      }
      const { ticket } = await res.json();

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const nextSocket = new WebSocket(`${proto}://${window.location.host}/ws?ticket=${ticket}`);

      nextSocket.addEventListener('message', (ev) => {
        let data;
        try {
          data = JSON.parse(ev.data);
        } catch (_) {
          return; // mensagem malformada, ignora
        }
        // heartbeat do servidor: responde na hora, não expõe pros listeners da aplicação
        if (data.type === 'ping') {
          send('pong');
          return;
        }
        emit(data.type, data);
      });

      nextSocket.addEventListener('open', () => {
        socket = nextSocket;
        connecting = false;
        reconnectDelay = 1000;
        emit('connection_status', { status: 'open' });
      });

      nextSocket.addEventListener('close', () => {
        connecting = false;
        if (socket === nextSocket) socket = null;
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

  return { connect, on, send };
})();
