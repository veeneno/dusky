const { WebSocketServer } = require('ws');
const wsTickets = require('./wsTickets');
const db = require('./db');
const access = require('./access');
const soundboard = require('./soundboard');
const world = require('./world');
const { createTables } = require('./games/duno');

const clients = new Set();
const onlineCounts = new Map(); // userId -> quantidade de conexões abertas (várias abas)

// pseudo-userId reservado pro bot de música — nunca existe na tabela users (ids reais começam
// em 1, autoincrement), então -1 nunca colide. Usado só pra presença (aparecer como "participante"
// na sidebar/call view) — o áudio do bot chega por um stream HTTP à parte (ver
// server/bots/musicBot/stream.js + routes/musicbot.js), não por uma RTCPeerConnection de
// verdade, então ele nunca troca rtc_signal e o front-end nunca tenta abrir peer connection
// com ele (ver tratamento especial de BOT_USER_ID em public/js/app/).
const BOT_USER_ID = -1;

// heartbeat em nível de aplicação (mensagens JSON, não frame de controle WS cru): manda
// tráfego de verdade periodicamente, o que (a) evita que proxies/NAT/Cloudflare derrubem a
// conexão por "ociosidade" achando que morreu, e (b) detecta conexões zumbis (aquelas que o
// SO ainda acha que estão abertas mas não respondem mais) bem mais rápido do que esperar o
// TCP falhar sozinho — sem isso, o estado de chamada de voz podia ficar "preso" por minutos
// depois de alguém perder conexão de verdade.
const HEARTBEAT_INTERVAL_MS = 20 * 1000; // intervalo entre pings — bem abaixo de timeouts
                                          // típicos de proxy ocioso (30-60s)
const HEARTBEAT_TIMEOUT_MS = 45 * 1000;  // sem pong há mais que isso = considera morta

// estado de chamada de voz em memória — chave: userId, valor: { channelId, serverId, muted, deafened, cameraOn, screenOn, ws }
// `ws` guarda qual conexão específica "é dona" desse estado, pra lidar direito com múltiplas abas.
// `serverId` é o servidor do canal de voz — eventos de voz só vão pros membros desse servidor.
const voiceStates = new Map();

function init(server) {
  // noServer: quem decide pra onde vai cada upgrade é o listener abaixo. Com `server` + `path`, o ws
  // respondia 400 pra QUALQUER outro caminho — e /livekit (sinalização do servidor de mídia, ver
  // server/sfu/livekit.js) divide o mesmo servidor HTTP.
  const wss = new WebSocketServer({
    noServer: true,
    verifyClient: (info, cb) => {
      const url = new URL(info.req.url, 'http://localhost');
      const ticket = url.searchParams.get('ticket');
      const entry = ticket ? wsTickets.consume(ticket) : null;
      if (!entry) return cb(false, 401, 'unauthorized');
      info.req.userId = entry.userId;
      cb(true);
    },
  });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (_) { /* url torta: não é nosso */ }
    if (pathname !== '/ws') return; // outro caminho: outro listener cuida (ver server/index.js)
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws, req) => {
    ws.userId = req.userId;
    ws.lastPongAt = Date.now(); // considera viva no momento em que conecta
    clients.add(ws);
    console.log(`[ws] conexão aberta — userId=${ws.userId} (total de clientes: ${clients.size})`);

    const prevCount = onlineCounts.get(ws.userId) || 0;
    onlineCounts.set(ws.userId, prevCount + 1);
    if (prevCount === 0) {
      sendToUsers(access.relatedUserIds(ws.userId), { type: 'presence_online', userId: ws.userId, status: presenceStatusOf(ws.userId) });
    }

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (_) {
        return; // mensagem malformada, ignora
      }
      handleClientMessage(ws, msg);
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[ws] conexão fechada — userId=${ws.userId} (restam: ${clients.size})`);

      // se essa conexão era a "dona" da presença em chamada de voz do usuário, sai da call
      leaveVoiceIfOwner(ws);
      // idem pro "jogando X": era o app dessa conexão que estava detectando o jogo
      clearActivityIfOwner(ws);

      const count = (onlineCounts.get(ws.userId) || 1) - 1;
      if (count <= 0) {
        onlineCounts.delete(ws.userId);
        sendToUsers(access.relatedUserIds(ws.userId), { type: 'presence_offline', userId: ws.userId });
      } else {
        onlineCounts.set(ws.userId, count);
      }
    });
    ws.on('error', () => {});
  });

  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const ws of clients) {
      if (now - ws.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[ws] userId=${ws.userId} sem pong há mais de ${HEARTBEAT_TIMEOUT_MS}ms — encerrando conexão zumbi`);
        ws.terminate(); // fecha à força (não espera handshake de close), dispara 'close' -> limpa estado de voz
        continue;
      }
      send(ws, { type: 'ping' });
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => clearInterval(heartbeatInterval));

  return wss;
}

// ===================================================================
// sinalização de chamada de voz (WebRTC)
// o WS aqui só relaia mensagens entre os dois clientes — quem faz a
// lógica de RTCPeerConnection é o front (public/js/app/)
// ===================================================================

function handleClientMessage(ws, msg) {
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'pong':
      ws.lastPongAt = Date.now();
      return;
    case 'voice_join':
      return handleVoiceJoin(ws, msg);
    case 'voice_leave':
      return handleVoiceLeave(ws);
    case 'voice_update':
      return handleVoiceUpdate(ws, msg);
    case 'rtc_signal':
      return handleRtcSignal(ws, msg);
    case 'typing':
      return handleTyping(ws, msg);
    case 'voice_speaking':
      return handleVoiceSpeaking(ws, msg);
    case 'activity_set':
      return handleActivitySet(ws, msg);
    case 'status_set':
      return handleStatusSet(ws, msg);
    case 'soundboard_play':
      return handleSoundboardPlay(ws, msg);
    case 'world_move':
      return handleWorldMove(ws, msg);
    case 'world_tv':
      return handleWorldTv(ws, msg);
    case 'game':
      return handleGame(ws, msg);
    case 'piano':
      return handlePiano(ws, msg);
    default:
      return; // tipo desconhecido, ignora
  }
}

function handleVoiceJoin(ws, msg) {
  const channelId = Number(msg.channelId);
  if (!channelId) { console.log('[voice] voice_join sem channelId válido, ignorando:', msg); return; }

  // só entra em canal de voz que a pessoa pode ver E em que o cargo dela deixa entrar
  const ch = access.canConnectChannel(channelId, ws.userId);
  if (!ch) {
    console.log(`[voice] userId=${ws.userId} tentou entrar no canal ${channelId} sem permissão, ignorando`);
    send(ws, { type: 'voice_join_denied', channelId });
    return;
  }
  const serverId = ch.server_id;
  console.log(`[voice] userId=${ws.userId} entrando no canal ${channelId} (servidor ${serverId})`);

  // se essa pessoa já estava numa call (nessa aba ou em outra), sai dela primeiro — avisando todo
  // mundo menos esta conexão, que já sabe que está trocando de canal
  const prev = voiceStates.get(ws.userId);
  if (prev) removeVoiceState(ws.userId, prev, ws);

  // lastActiveAt: última vez que a pessoa falou (ou entrou) — o canal AFK usa (ver checkAfk)
  const state = { channelId, serverId, muted: false, deafened: false, cameraOn: false, screenOn: false, ws, lastActiveAt: Date.now() };
  // canal-mundo (docs/MUNDINHO.md): a pessoa nasce no ponto de entrada da cena
  if (ch.world_scene) { state.scene = ch.world_scene; state.world = world.spawn(ch.world_scene); }
  voiceStates.set(ws.userId, state);
  persistVoiceState(ws.userId, state);

  // manda pro recém-chegado a lista de quem já está na sala — é ele quem inicia a oferta WebRTC
  const participants = [...voiceStates.entries()]
    .filter(([userId, s]) => userId !== ws.userId && s.channelId === channelId)
    .map(([userId, s]) => ({ userId, muted: s.muted, deafened: s.deafened, cameraOn: s.cameraOn, screenOn: s.screenOn, world: s.world || null }));
  const bot = botStates.get(serverId);
  if (bot && bot.channelId === channelId) {
    participants.push({ userId: BOT_USER_ID, muted: bot.muted, deafened: bot.deafened, cameraOn: false, screenOn: false });
  }

  send(ws, { type: 'voice_channel_state', channelId, participants, self: state.world ? { world: state.world, scene: world.getScene(state.scene).id, tv: tvStates.get(channelId) || world.TV_OFF, games: gamesSnapshot(channelId, state.scene, ws.userId), now: Date.now() } : null });

  // avisa quem enxerga esse canal que alguém novo entrou (pra call e pra pré-visualização na sidebar)
  broadcastToChannel(channelId, { type: 'voice_user_joined', channelId, userId: ws.userId, muted: false, deafened: false, cameraOn: false, screenOn: false, world: state.world || null }, ws);
}

function handleVoiceLeave(ws) {
  console.log(`[voice] userId=${ws.userId} mandou voice_leave`);
  leaveVoiceIfOwner(ws);
}

function handleVoiceUpdate(ws, msg) {
  const state = voiceStates.get(ws.userId);
  if (!state || state.ws !== ws) return; // não está em call, ou é uma aba "fantasma"
  if (state.muted && !msg.muted) state.lastActiveAt = Date.now(); // desmutou: está ali
  const startedScreen = !state.screenOn && !!msg.screenOn;
  state.muted = !!msg.muted;
  state.deafened = !!msg.deafened;
  state.cameraOn = !!msg.cameraOn;
  state.screenOn = !!msg.screenOn;
  // call-mundo: começou a compartilhar e a TV está desligada → vai pra TV; parou → a TV desliga
  if (state.world) {
    const tv = tvStates.get(state.channelId);
    if (startedScreen && (!tv || tv.mode === 'off')) setTv(state.channelId, { mode: 'screen', userId: ws.userId, by: ws.userId });
    else if (!state.screenOn && tv && tv.mode === 'screen' && tv.userId === ws.userId) setTv(state.channelId, world.TV_OFF);
  }
  persistVoiceState(ws.userId, state);
  broadcastToChannel(state.channelId, { type: 'voice_state_update', channelId: state.channelId, userId: ws.userId, muted: state.muted, deafened: state.deafened, cameraOn: state.cameraOn, screenOn: state.screenOn });
}

// quem está falando agora (anel verde): o site de quem fala avisa quando começa e para; aqui só
// repassa pra quem enxerga o canal — inclusive quem não está na call, pra prévia da barra lateral
function handleVoiceSpeaking(ws, msg) {
  const state = voiceStates.get(ws.userId);
  if (!state || state.ws !== ws) return;
  const speaking = !!msg.speaking;
  if (state.speaking === speaking) return;
  state.speaking = speaking;
  if (speaking) state.lastActiveAt = Date.now();
  broadcastToChannel(state.channelId, { type: 'voice_speaking', channelId: state.channelId, userId: ws.userId, speaking }, ws);
}

// ------------------------------------------------------------------
// "jogando X" (rich presence): o app desktop da pessoa detecta o jogo aberto e avisa por aqui
// (electron/presence.js -> public/js/app/ -> activity_set). Fica só em memória e só vai pra quem
// já enxerga essa pessoa (divide servidor ou DM). `ws` = a conexão que detectou: se ela cair, some.
// ------------------------------------------------------------------
const activities = new Map(); // userId -> { name, startedAt, ws }

function activityOf(userId) {
  const a = activities.get(userId);
  return a ? { type: 'playing', name: a.name, startedAt: a.startedAt } : null;
}

function broadcastActivity(userId) {
  sendToUsers(access.relatedUserIds(userId), { type: 'activity_update', userId, activity: activityOf(userId) });
}

function clearActivityIfOwner(ws) {
  const cur = activities.get(ws.userId);
  if (!cur || cur.ws !== ws) return;
  activities.delete(ws.userId);
  broadcastActivity(ws.userId);
}

// { name, startedAt? } — nome vazio (ou a pessoa desligou a opção) = não está jogando nada
function handleActivitySet(ws, msg) {
  const name = typeof msg.name === 'string'
    ? msg.name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64)
    : '';
  if (!name) { clearActivityIfOwner(ws); return; }
  const cur = activities.get(ws.userId);
  if (cur && cur.ws === ws && cur.name === name) return;
  const now = Date.now();
  const started = Number(msg.startedAt);
  // aceita o horário do app (o jogo pode ter aberto antes de o site conectar), dentro do razoável
  const startedAt = Number.isFinite(started) && started <= now + 60000 && started > now - 7 * 24 * 3600 * 1000 ? Math.min(now, Math.floor(started)) : now;
  activities.set(ws.userId, { name, startedAt, ws });
  broadcastActivity(ws.userId);
}

// ------------------------------------------------------------------
// status escolhido (ativo / inativo): fica salvo na conta (users.presence_status), então vale em
// qualquer aparelho e sobrevive a reiniciar o servidor. Cache em memória pra não consultar o banco
// a cada membro listado.
// ------------------------------------------------------------------
const PRESENCE_STATUSES = new Set(['online', 'idle']);
const statusCache = new Map(); // userId -> 'online' | 'idle'

function presenceStatusOf(userId) {
  if (statusCache.has(userId)) return statusCache.get(userId);
  const row = db.prepare('SELECT presence_status FROM users WHERE id = ?').get(userId);
  const status = row && PRESENCE_STATUSES.has(row.presence_status) ? row.presence_status : 'online';
  statusCache.set(userId, status);
  return status;
}

function handleStatusSet(ws, msg) {
  const status = typeof msg.status === 'string' ? msg.status : '';
  if (!PRESENCE_STATUSES.has(status)) return;
  if (presenceStatusOf(ws.userId) === status) return; // nada mudou (o site reenvia ao reconectar)
  db.prepare('UPDATE users SET presence_status = ? WHERE id = ?').run(status, ws.userId);
  statusCache.set(ws.userId, status);
  // relatedUserIds já inclui a própria pessoa: as outras abas/aparelhos dela atualizam também
  sendToUsers(access.relatedUserIds(ws.userId), { type: 'presence_status', userId: ws.userId, status });
}

// "fulano está digitando…": o site manda a cada ~3s enquanto a pessoa digita; aqui só confere se ela
// vê o canal e repassa pra quem também vê. No máximo 1 aviso a cada 2s por conexão e canal.
function handleTyping(ws, msg) {
  const channelId = Number(msg.channelId);
  if (!channelId) return;
  const now = Date.now();
  if (!ws.typingAt) ws.typingAt = new Map();
  if (now - (ws.typingAt.get(channelId) || 0) < 2000) return;
  ws.typingAt.set(channelId, now);
  if (!access.canChannelAction(access.getChannel(channelId), ws.userId, 'send')) return;
  broadcastToChannel(channelId, { type: 'typing', channelId, userId: ws.userId }, ws);
}

// relay de sinalização (offer/answer/ice candidate/assistir tela) entre duas pessoas NA MESMA call.
// Vai só pra aba que está de fato na call do destinatário — com várias abas abertas, as outras
// não têm conexão nenhuma pra negociar. Fora da mesma call, não entrega nada.
function handleRtcSignal(ws, msg) {
  const targetUserId = Number(msg.to);
  if (!targetUserId || !msg.data) return;
  const mine = voiceStates.get(ws.userId);
  const theirs = voiceStates.get(targetUserId);
  if (!mine || mine.ws !== ws || !theirs || !theirs.ws || theirs.channelId !== mine.channelId) return;
  send(theirs.ws, { type: 'rtc_signal', from: ws.userId, data: msg.data });
}

// ===================================================================
// API usada pelo bot de música (server/bots/musicBot) pra aparecer como "presente" num canal de
// voz sem ser uma conexão ws de verdade — o áudio em si vai por HTTP (routes/musicbot.js)
// ===================================================================

// bot "entra" no canal de voz — não persiste no banco (voice_state tem FK pra users(id), e o
// bot não é uma linha real ali; além disso o estado dele é puramente efêmero mesmo)
// cada servidor tem o seu bot (ver musicBot/queue.js): a presença dele fica aqui, uma por servidor,
// separada de voiceStates (que é por pessoa). Pros clientes ele sempre aparece como BOT_USER_ID —
// como cada pessoa só está numa call por vez, ninguém vê dois bots ao mesmo tempo.
const botStates = new Map(); // serverId -> { channelId, serverId, muted, deafened, cameraOn, screenOn }

function botJoinVoice(serverId, channelId) {
  const ch = access.getChannel(channelId);
  if (!ch || ch.server_id !== serverId) return;
  botLeaveVoice(serverId);
  botStates.set(serverId, { channelId, serverId, muted: true, deafened: false, cameraOn: false, screenOn: false });
  broadcastToChannel(channelId, { type: 'voice_user_joined', channelId, userId: BOT_USER_ID, muted: true, deafened: false, cameraOn: false, screenOn: false });
}

function botLeaveVoice(serverId) {
  const state = botStates.get(serverId);
  if (!state) return;
  botStates.delete(serverId);
  broadcastToChannel(state.channelId, { type: 'voice_user_left', channelId: state.channelId, userId: BOT_USER_ID });
}

// em qual canal de voz um usuário específico está agora (null se não está em nenhum) — usado
// pelo comando /play pra descobrir pra onde o bot deve entrar
function voiceChannelOf(userId) {
  const state = voiceStates.get(userId);
  return state ? state.channelId : null;
}

// lista os userIds de humanos (exclui o próprio BOT_USER_ID) presentes num canal de voz agora —
// usado pelo bot pra saber se ainda tem alguém ouvindo (ex: pra decidir se sai sozinho do canal
// quando o último humano sai no meio de uma música tocando)
function humansInChannel(channelId) {
  const ids = [];
  for (const [userId, s] of voiceStates.entries()) {
    if (userId !== BOT_USER_ID && s.channelId === channelId) ids.push(userId);
  }
  return ids;
}

// sai da chamada de voz se essa conexão específica é a "dona" do estado do usuário
function leaveVoiceIfOwner(ws) {
  const state = voiceStates.get(ws.userId);
  if (!state || state.ws !== ws) return;
  removeVoiceState(ws.userId, state);
}

// quem quer saber quando alguém sai de uma call (o bot de música usa pra parar quando a call esvazia)
const voiceLeaveListeners = [];
function onVoiceLeave(fn) { voiceLeaveListeners.push(fn); }

function removeVoiceState(userId, state, except) {
  voiceStates.delete(userId);
  // mundinho: quem estava na TV saiu → TV desliga; call vazia → esquece a TV
  const tv = tvStates.get(state.channelId);
  if (tv) {
    if (humansInChannel(state.channelId).length === 0) tvStates.delete(state.channelId);
    else if (tv.mode === 'screen' && tv.userId === userId) setTv(state.channelId, world.TV_OFF);
  }
  if (state.world) {
    if (humansInChannel(state.channelId).length === 0) gameTables.clearChannel(state.channelId);
    else gameTables.onLeaveCall(state.channelId, userId);
  }
  persistVoiceState(userId, { channelId: null, muted: false, deafened: false, cameraOn: false, screenOn: false });
  // avisa quem enxerga o canal (e a própria pessoa, caso ela já não enxergue mais — ex: foi
  // expulsa ou perdeu o cargo — e precise saber que caiu da call)
  const audience = new Set(access.channelAudience(state.channelId));
  audience.add(userId);
  sendToUsers([...audience], { type: 'voice_user_left', channelId: state.channelId, userId }, except);
  for (const fn of voiceLeaveListeners) {
    try { fn(state.channelId, userId); } catch (err) { console.error('[voice] erro num ouvinte de saída:', err); }
  }
}

// ------------------------------------------------------------------
// moderação de voz (admin): desconectar, mover, e derrubar quem perdeu permissão
// ------------------------------------------------------------------

function voiceStateOf(userId) {
  const s = voiceStates.get(userId);
  return s ? { channelId: s.channelId, serverId: s.serverId } : null;
}

// tira alguém da call. `by` = quem fez (pra mostrar no aviso). false se a pessoa não estava em call.
function disconnectUser(userId, by) {
  const state = voiceStates.get(userId);
  if (!state || userId === BOT_USER_ID) return false;
  if (state.ws) send(state.ws, { type: 'voice_disconnected', channelId: state.channelId, by: by || null });
  removeVoiceState(userId, state);
  return true;
}

// manda a aba que está na call da pessoa trocar pra outro canal de voz. A troca em si (fechar as
// conexões e abrir as novas) acontece no navegador dela, igual quando ela mesma clica no canal.
function moveUser(userId, channel, by, reason) {
  const state = voiceStates.get(userId);
  if (!state || !state.ws || state.channelId === channel.id) return false;
  send(state.ws, {
    type: 'voice_move',
    channel: { id: channel.id, name: channel.name, type: channel.type, server_id: channel.server_id },
    by: by || null,
    reason: reason || null,
  });
  return true;
}

// ------------------------------------------------------------------
// canal AFK: quem passa afk_timeout segundos sem falar numa call é levado pro canal AFK do
// servidor (configurações do servidor → visão geral). Conta só a voz de verdade (o anel verde,
// voice_speaking): estar mudo também conta como parado, igual no Discord.
// ------------------------------------------------------------------
const AFK_CHECK_MS = 30 * 1000;
function checkAfk() {
  const now = Date.now();
  const servers = new Map(); // cache por rodada
  for (const [uid, state] of voiceStates.entries()) {
    // quem está com câmera ou tela ligada não está "parado"
    if (uid === BOT_USER_ID || !state.ws || state.speaking || state.cameraOn || state.screenOn) continue;
    if (!servers.has(state.serverId)) servers.set(state.serverId, access.getServer(state.serverId));
    const server = servers.get(state.serverId);
    if (!server || !server.afk_channel_id || state.channelId === server.afk_channel_id) continue;
    if (now - (state.lastActiveAt || now) < Math.max(60, server.afk_timeout || 300) * 1000) continue;
    const afk = access.canConnectChannel(server.afk_channel_id, uid);
    state.lastActiveAt = now; // não tenta de novo a cada rodada se não der
    if (afk) moveUser(uid, afk, null, 'afk');
  }
}
setInterval(checkAfk, AFK_CHECK_MS).unref();

// ------------------------------------------------------------------
// mundinho 3D: onde está o boneco de cada um numa call-mundo (ver server/world.js e
// docs/MUNDINHO.md). Vai só pras abas que estão NA call — quem só vê o canal na lateral não precisa.
// ------------------------------------------------------------------
function sendToCall(channelId, event, exceptUserId) {
  const payload = JSON.stringify(event);
  for (const [uid, s] of voiceStates.entries()) {
    if (uid !== exceptUserId && s.channelId === channelId && s.ws && s.ws.readyState === s.ws.OPEN) s.ws.send(payload);
  }
}

// TV de cada call-mundo (só em memória: call vazia = TV desligada)
const tvStates = new Map(); // channelId -> estado (ver world.applyTv)
function setTv(channelId, tv) {
  if (!tv || tv.mode === 'off') tvStates.delete(channelId); else tvStates.set(channelId, tv);
  sendToCall(channelId, { type: 'world_tv_state', channelId, tv: tv || world.TV_OFF, now: Date.now() });
}

function handleWorldTv(ws, msg) {
  const state = voiceStates.get(ws.userId);
  if (!state || state.ws !== ws || !state.world) return;
  const now = Date.now();
  if (!ws.tvBucket || now - ws.tvBucket.t >= 1000) ws.tvBucket = { t: now, n: 0 };
  if (++ws.tvBucket.n > 6) return;
  const screenOn = (uid) => {
    const s = voiceStates.get(uid);
    return !!(s && s.channelId === state.channelId && s.screenOn);
  };
  const { tv, error } = world.applyTv(tvStates.get(state.channelId), msg, { userId: ws.userId, now, screenOn });
  if (error) { send(ws, { type: 'world_tv_denied', error }); return; }
  setTv(state.channelId, tv);
}

function handleWorldMove(ws, msg) {
  const state = voiceStates.get(ws.userId);
  if (!state || state.ws !== ws || !state.world) return;
  if (!world.allowMove(ws)) return;
  const occupied = (seatId) => {
    for (const [uid, s] of voiceStates.entries()) {
      if (uid !== ws.userId && s.channelId === state.channelId && s.world && s.world.seat === seatId) return true;
    }
    return false;
  };
  const { state: next, corrected } = world.applyMove(state.scene, state.world, msg, occupied);
  const prevSeat = state.world.seat;
  if (next.action !== 'stand' || next.x !== state.world.x || next.z !== state.world.z || next.y !== state.world.y) state.lastActiveAt = Date.now();
  state.world = next;
  if (corrected) send(ws, { type: 'world_correction', world: next });
  sendToCall(state.channelId, { type: 'world_state', channelId: state.channelId, userId: ws.userId, ...next }, ws.userId);
  // sentou/levantou numa cadeira de mesa de jogos: o jogo fica sabendo (host, jogar/assistir)
  if (prevSeat !== next.seat) {
    const def = world.tableForSeat(state.scene, next.seat);
    const prevDef = world.tableForSeat(state.scene, prevSeat);
    if (def || prevDef) gameTables.onSeat(state.channelId, ws.userId, def, next.seat, prevDef);
  }
}

// ------------------------------------------------------------------
// jogos nas mesas do mundinho (server/games/duno.js). Cada um da call recebe a SUA visão da mesa
// (quem joga só vê a própria mão).
// ------------------------------------------------------------------
const gameTables = createTables({ onChange: broadcastGame });

function broadcastGame(channelId, tableId) {
  for (const [uid, s] of voiceStates.entries()) {
    if (s.channelId !== channelId || !s.ws || !s.scene) continue;
    const def = world.tableById(s.scene, tableId);
    if (def) send(s.ws, { type: 'game_state', channelId, state: gameTables.viewFor(channelId, def, uid), now: Date.now() });
  }
}

function gamesSnapshot(channelId, sceneId, userId) {
  return (world.getScene(sceneId).tables || []).map((def) => gameTables.viewFor(channelId, def, userId));
}

function handleGame(ws, msg) {
  const state = voiceStates.get(ws.userId);
  if (!state || state.ws !== ws || !state.world) return;
  const now = Date.now();
  if (!ws.gameBucket || now - ws.gameBucket.t >= 1000) ws.gameBucket = { t: now, n: 0 };
  if (++ws.gameBucket.n > 10) return;
  const def = world.tableById(state.scene, msg && msg.table);
  if (!def) return;
  const { error } = gameTables.handle(state.channelId, def, ws.userId, msg);
  if (error) send(ws, { type: 'game_denied', table: def.id, error });
}

// piano: só quem está sentado no banco toca; as notas vão pros outros da call (cada um sintetiza)
function handlePiano(ws, msg) {
  const state = voiceStates.get(ws.userId);
  if (!state || state.ws !== ws || !state.world) return;
  if (!state.world.seat || state.world.seat !== world.pianoSeat(state.scene)) return;
  const note = Number(msg.note);
  if (!Number.isInteger(note) || note < 21 || note > 108) return;
  const now = Date.now();
  if (!ws.pianoBucket || now - ws.pianoBucket.t >= 1000) ws.pianoBucket = { t: now, n: 0 };
  if (++ws.pianoBucket.n > 60) return;
  state.lastActiveAt = now;
  sendToCall(state.channelId, { type: 'piano_note', channelId: state.channelId, userId: ws.userId, note, on: !!msg.on }, ws.userId);
}

// ------------------------------------------------------------------
// soundboard: "toquei o som X" — confere as permissões (ver server/soundboard.js) e avisa cada
// pessoa da mesma call, na aba que está na call. Cada navegador baixa e toca o som sozinho.
// ------------------------------------------------------------------
function handleSoundboardPlay(ws, msg) {
  const state = voiceStates.get(ws.userId);
  if (!state || state.ws !== ws) return;
  const sound = soundboard.getSound(msg.soundId);
  const denied = state.deafened ? 'tire o ensurdecer pra usar o soundboard' : soundboard.playDenied(ws.userId, state.serverId, sound);
  if (denied) { send(ws, { type: 'soundboard_denied', soundId: Number(msg.soundId) || null, error: denied }); return; }
  if (!soundboard.takeCooldown(ws.userId)) { send(ws, { type: 'soundboard_denied', soundId: sound.id, error: 'calma — espera um pouquinho entre um som e outro', cooldown: true }); return; }
  state.lastActiveAt = Date.now();
  const event = {
    type: 'soundboard_play', channelId: state.channelId, userId: ws.userId,
    sound: { id: sound.id, server_id: sound.server_id, name: sound.name, emoji: sound.emoji, url: sound.url, volume: sound.volume, duration_ms: sound.duration_ms },
  };
  const payload = JSON.stringify(event);
  for (const s of voiceStates.values()) {
    if (s.channelId === state.channelId && s.ws && s.ws.readyState === s.ws.OPEN) s.ws.send(payload);
  }
}

// depois de mudar cargos/permissões: quem está numa call em que não pode mais estar cai dela
function enforceVoicePermissions(serverId) {
  for (const [uid, state] of [...voiceStates.entries()]) {
    if (state.serverId !== serverId || uid === BOT_USER_ID) continue;
    if (!access.canConnectChannel(state.channelId, uid)) {
      if (state.ws) send(state.ws, { type: 'voice_disconnected', channelId: state.channelId, reason: 'permission' });
      removeVoiceState(uid, state);
    }
  }
}

// tira alguém da call se ela for de um canal desse servidor — usado quando a pessoa sai/é
// expulsa do servidor, ou quando o servidor é apagado (userId omitido = todo mundo)
function kickFromServerVoice(serverId, userId) {
  for (const [uid, state] of [...voiceStates.entries()]) {
    if (state.serverId !== serverId) continue;
    if (userId != null && uid !== userId) continue;
    removeVoiceState(uid, state);
  }
  if (userId == null) botLeaveVoice(serverId); // servidor apagado: o bot sai junto
}

// todo mundo sai de um canal de voz específico — usado quando o canal é apagado
function kickFromChannelVoice(channelId) {
  for (const [uid, state] of [...voiceStates.entries()]) {
    if (state.channelId !== channelId) continue;
    removeVoiceState(uid, state);
  }
  for (const [serverId, bot] of [...botStates.entries()]) {
    if (bot.channelId === channelId) botLeaveVoice(serverId);
  }
}

function persistVoiceState(userId, state) {
  try {
    db.prepare(`
      INSERT INTO voice_state (user_id, channel_id, muted, deafened, camera_on, screen_on, updated_at)
      VALUES (@userId, @channelId, @muted, @deafened, @cameraOn, @screenOn, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        muted = excluded.muted,
        deafened = excluded.deafened,
        camera_on = excluded.camera_on,
        screen_on = excluded.screen_on,
        updated_at = excluded.updated_at
    `).run({
      userId,
      channelId: state.channelId ?? null,
      muted: state.muted ? 1 : 0,
      deafened: state.deafened ? 1 : 0,
      cameraOn: state.cameraOn ? 1 : 0,
      screenOn: state.screenOn ? 1 : 0,
    });
  } catch (err) {
    console.error('erro ao persistir voice_state:', err.message);
  }
}

// envia um evento pra todos os clientes conectados (exceto `except`, se passado) — só pra coisas
// realmente globais; o normal é usar sendToUsers / broadcastToServer / broadcastToChannel
function broadcast(event, except) {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws !== except && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// envia um evento pra todas as conexões (abas) desses usuários
function sendToUsers(userIds, event, except) {
  const targets = new Set(userIds);
  if (targets.size === 0) return;
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws !== except && targets.has(ws.userId) && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function broadcastToServer(serverId, event, except) {
  sendToUsers(access.serverMemberIds(serverId), event, except);
}

// membros do servidor do canal, ou os 2 participantes se for DM
function broadcastToChannel(channelId, event, except) {
  sendToUsers(access.channelAudience(channelId), event, except);
}

function send(ws, event) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
}

function isOnline(userId) {
  return (onlineCounts.get(userId) || 0) > 0;
}

// manda um último aviso e fecha todas as abas conectadas dessa pessoa (conta suspensa, senha redefinida)
function dropUserConnections(userId, finalEvent) {
  for (const ws of [...clients]) {
    if (ws.userId !== userId) continue;
    try {
      if (finalEvent) ws.send(JSON.stringify(finalEvent));
      ws.close(4001, 'sessão encerrada');
    } catch (_) { /* já fechada */ }
  }
}

// quem está em qual call agora, em todo o site (só o painel de admin usa)
function voiceOccupancyAll() {
  const out = [...voiceStates.entries()].map(([userId, s]) => ({ userId, channelId: s.channelId, serverId: s.serverId }));
  for (const bot of botStates.values()) out.push({ userId: BOT_USER_ID, channelId: bot.channelId, serverId: bot.serverId });
  return out;
}

function onlineUserIds() {
  return [...onlineCounts.keys()];
}

// snapshot de quem está em qual canal de voz agora (pra pré-visualização na sidebar, inclusive
// pra canais que o usuário não está ocupando no momento) — filtrado pros servidores dos quais
// `viewerId` é membro, pra ninguém ver quem está em call num servidor que não é o seu
function voiceOccupancy(viewerId) {
  const visible = new Map(); // channelId -> pode ver? (cache, pra não consultar o banco por pessoa)
  const canSee = (channelId) => {
    if (!visible.has(channelId)) visible.set(channelId, !!access.canAccessChannel(channelId, viewerId));
    return visible.get(channelId);
  };
  const entries = [...voiceStates.entries()];
  for (const bot of botStates.values()) entries.push([BOT_USER_ID, bot]);
  return entries
    .filter(([, s]) => canSee(s.channelId))
    .map(([userId, s]) => ({
      userId,
      channelId: s.channelId,
      muted: s.muted,
      deafened: s.deafened,
      cameraOn: s.cameraOn,
      screenOn: s.screenOn,
    }));
}

module.exports = {
  init, broadcast, sendToUsers, broadcastToServer, broadcastToChannel,
  isOnline, onlineUserIds, voiceOccupancy, kickFromServerVoice, kickFromChannelVoice,
  voiceStateOf, disconnectUser, moveUser, enforceVoicePermissions, onVoiceLeave,
  dropUserConnections, voiceOccupancyAll, activityOf, presenceStatusOf,
  BOT_USER_ID, botJoinVoice, botLeaveVoice,
  humansInChannel, voiceChannelOf,
};
