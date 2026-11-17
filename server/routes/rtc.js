const express = require('express');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');
const access = require('../access');
const sfu = require('../sfu/livekit');
const realtime = require('../realtime');

const router = express.Router();

// STUN público do Google + TURN público do Open Relay Project (credencial estática e
// compartilhada, sem limite de geração — ao contrário da do Metered) como fallback pra quando
// o Metered falhar (cota estourada, chave inválida, serviço fora do ar etc). Sem isso, calls
// entre redes diferentes (ex.: celular no 4G + PC em casa) tendem a falhar sem relay TURN.
const FALLBACK_STUN = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

// cache em memória da credencial TURN — o Metered pede uma credencial nova por chamada à API,
// mas o plano free tem uma cota TOTAL de credenciais criadas (não por hora). Gerar uma credencial
// nova a cada entrada em call esgota essa cota rapidíssimo com pouquíssimo uso. Como a credencial
// dura 1h (expiryInSeconds abaixo) e é a mesma pros dois usuários do servidor, cacheamos e
// reusamos por até 50min antes de pedir uma nova — cai de "1 credencial por join" pra "no máximo
// ~1 credencial por 50min", não importa quantas vezes vocês entrem/saiam de call.
const CREDENTIAL_TTL_MS = 50 * 60 * 1000; // 50min (credencial real dura 60min — folga de 10min)
let cachedIceServers = null;
let cachedAt = 0;

// GET /api/rtc/ice-servers — devolve a lista de ICE servers (STUN + TURN) pro cliente montar
// o RTCPeerConnection. A secret key do Metered NUNCA sai do servidor: aqui a gente troca ela
// por uma credencial de curta duração (1h) e só devolve essa credencial pro navegador.
router.get('/ice-servers', requireAuth, async (req, res) => {
  if (!config.meteredDomain || !config.meteredSecretKey) {
    return res.json({ iceServers: FALLBACK_STUN });
  }

  const isCacheFresh = cachedIceServers && (Date.now() - cachedAt) < CREDENTIAL_TTL_MS;
  if (isCacheFresh) {
    return res.json({ iceServers: cachedIceServers });
  }

  try {
    // 1. gera uma credencial TURN de curta duração usando a secret key da conta
    const credRes = await fetch(
      `https://${config.meteredDomain}/api/v1/turn/credential?secretKey=${encodeURIComponent(config.meteredSecretKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiryInSeconds: 3600, label: 'dusky-shared' }),
      }
    );
    if (!credRes.ok) throw new Error(`credencial TURN: HTTP ${credRes.status}`);
    const { apiKey } = await credRes.json();
    if (!apiKey) throw new Error('resposta sem apiKey');

    // 2. troca essa credencial pela lista pronta de iceServers (stun + turn), já formatada
    //    do jeito que o RTCPeerConnection espera
    const iceRes = await fetch(
      `https://${config.meteredDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`
    );
    if (!iceRes.ok) throw new Error(`iceServers: HTTP ${iceRes.status}`);
    const iceServers = await iceRes.json();

    if (!Array.isArray(iceServers) || iceServers.length === 0) throw new Error('lista de iceServers vazia');

    cachedIceServers = iceServers;
    cachedAt = Date.now();
    res.json({ iceServers });
  } catch (err) {
    console.error('[rtc] erro ao buscar credenciais TURN do Metered, caindo pra STUN puro:', err.message);
    // se já tínhamos uma credencial em cache (mesmo vencida), ainda vale mais que STUN puro —
    // só descarta de vez se nunca tivemos nenhuma
    if (cachedIceServers) {
      return res.json({ iceServers: cachedIceServers });
    }
    res.json({ iceServers: FALLBACK_STUN });
  }
});

// Com &screen=1 o ingresso é pro auxiliar de tela do app desktop: ele entra na mesma sala como um
// participante à parte, "tela-<id da conta>", que só envia o vídeo da tela (ver native/
// screencast/sfu.go). O site junta esse vídeo à pessoa certa pelo número no nome.
// GET /api/rtc/sfu?channelId=N — as calls passam pelo servidor de mídia (LiveKit) deste PC?
// { enabled: false } = não: o site usa a malha (conexão direta entre as pessoas), como sempre.
// { enabled: true, path, token } = sim: `token` deixa ESTA pessoa entrar na sala DESTE canal e só
// é emitido pra quem pode entrar na call (mesma regra do voice_join, em access.js).
router.get('/sfu', requireAuth, (req, res) => {
  if (!sfu.isReady()) return res.json({ enabled: false });
  const channelId = Number(req.query.channelId);
  const ch = channelId ? access.canConnectChannel(channelId, req.user.id) : null;
  if (!ch) return res.status(403).json({ error: 'você não pode entrar nessa call' });
  const room = sfu.roomForChannel(ch.id);
  // o ingresso só vale pra quem está (ou está entrando agora) NESTA call — ver "quem pode estar na
  // mídia" em sfu/livekit.js. O app conecta na mídia um instante antes de mandar o voice_join,
  // então quem ainda não está na call ganha uma janela curta pra entrar; se não entrar, sai da sala.
  const inThisCall = realtime.voiceChannelOf(req.user.id) === ch.id;
  const needEntry = () => {
    if (inThisCall) return true;
    if (sfu.openEntryWindow(req.user.id, ch.id)) return true;
    res.status(429).json({ error: 'entre na call antes de conectar no servidor de mídia' });
    return false;
  };
  // viewer=1: o app do Linux assiste as telas por um participante oculto à parte (o Pion entrega o
  // vídeo sem decodificar e a página decodifica no fps original — ver tauri/ e native/screencast/watch.go)
  if (req.query.viewer === '1') {
    if (!needEntry()) return;
    return res.json({
      enabled: true, viewer: true, path: sfu.PREFIX,
      token: sfu.createToken({ room, identity: `ver-${req.user.id}`, name: `${req.user.username} (assistindo)`, watchOnly: true }),
    });
  }
  // screen=1: o auxiliar de tela só faz sentido com a pessoa já na call
  if (req.query.screen === '1') {
    if (!inThisCall) return res.status(403).json({ error: 'entre na call antes de compartilhar a tela' });
    return res.json({
      enabled: true, path: sfu.PREFIX,
      token: sfu.createToken({ room, identity: `tela-${req.user.id}`, name: `${req.user.username} (tela)`, publishOnly: true }),
    });
  }
  if (!needEntry()) return;
  res.json({ enabled: true, path: sfu.PREFIX, token: sfu.createToken({ room, identity: req.user.id, name: req.user.username }) });
});

module.exports = router;
