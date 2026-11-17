// Servidor de mídia (SFU) — LiveKit rodando NESTE PC, ao lado do servidor do site.
//
// Com SFU=livekit no .env, as calls deixam de ser "cada um ligado direto em cada um" (malha): todo
// mundo manda voz, câmera e tela UMA vez pra cá, e o LiveKit repassa pros outros. Sem essa linha
// (ou com SFU=off) nada disso liga e as calls continuam em malha, como sempre foram — é a reserva.
//
// O que este arquivo faz:
//   - baixa o livekit-server na primeira vez (igual o yt-dlp do bot de música) e mantém ele de pé
//   - gera a chave/segredo do LiveKit uma vez (server/sfu/data/keys.json, fora do git)
//   - emite o "ingresso" (token) que deixa uma pessoa entrar na sala de um canal de voz
//   - repassa /livekit/* do site pro LiveKit: a sinalização dele passa pelo mesmo endereço do site
//     (e pelo túnel do Cloudflare). O ÁUDIO/VÍDEO não passa pelo túnel: vai direto pro seu IP,
//     pelas portas abertas no roteador (UDP 7882 e TCP 7881 por padrão).
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const WANTED = String(process.env.SFU || '').trim().toLowerCase() === 'livekit';
const VERSION = process.env.LIVEKIT_VERSION || '1.13.11'; // fixa: a biblioteca do navegador em public/vendor/livekit foi testada com ela
const HTTP_PORT = Number(process.env.LIVEKIT_HTTP_PORT) || 7880; // só nesta máquina (127.0.0.1)
const TCP_PORT = Number(process.env.LIVEKIT_TCP_PORT) || 7881;   // abrir no roteador (TCP) — reserva pra quem tem UDP bloqueado
const UDP_PORT = Number(process.env.LIVEKIT_UDP_PORT) || 7882;   // abrir no roteador (UDP) — é por aqui que a mídia passa
const NODE_IP = String(process.env.LIVEKIT_NODE_IP || '').trim(); // IP público fixo; vazio = descobre sozinho (STUN)

const BIN_DIR = path.join(__dirname, 'bin');
const DATA_DIR = path.join(__dirname, 'data');
const EXE = process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server';
const BIN_PATH = process.env.LIVEKIT_PATH || path.join(BIN_DIR, EXE);
const KEYS_PATH = path.join(DATA_DIR, 'keys.json');
const CONFIG_PATH = path.join(DATA_DIR, 'livekit.yaml');

const state = { ready: false, child: null, stopping: false, restarts: 0, keys: null };

function log(...args) { console.log('[sfu]', ...args); }

function loadKeys() {
  if (state.keys) return state.keys;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const k = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    if (k && k.apiKey && k.apiSecret) { state.keys = k; return k; }
  } catch (_) { /* primeira vez */ }
  const keys = { apiKey: 'DD' + crypto.randomBytes(8).toString('hex'), apiSecret: crypto.randomBytes(32).toString('hex') };
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys), { mode: 0o600 });
  state.keys = keys;
  return keys;
}

function writeConfig() {
  const { apiKey, apiSecret } = loadKeys();
  const lines = [
    '# gerado por server/sfu/livekit.js a cada início — não edite (mude pelo .env)',
    `port: ${HTTP_PORT}`,
    'bind_addresses:',
    '  - 127.0.0.1',
    'rtc:',
    `  tcp_port: ${TCP_PORT}`,
    `  udp_port: ${UDP_PORT}`,
  ];
  if (NODE_IP === 'local') {
    // só rede local / testes: não tenta descobrir IP público
    lines.push('  use_external_ip: false');
  } else if (NODE_IP) {
    lines.push('  use_external_ip: false', `  node_ip: ${NODE_IP}`, '  advertise_internal_ip: true');
  } else {
    // descobre o IP público sozinho e anuncia TAMBÉM o IP interno: quem está na mesma rede (ou no
    // próprio PC do servidor) conecta por dentro, sem depender do roteador devolver o tráfego.
    // A checagem de "consigo me alcançar pelo IP público?" fica desligada porque muitos roteadores
    // não deixam, mesmo com a porta aberta certinho pra quem vem de fora.
    lines.push('  use_external_ip: true', '  advertise_internal_ip: true', '  skip_external_ip_validation: true');
  }
  lines.push(
    'keys:',
    `  ${apiKey}: ${apiSecret}`,
    'room:',
    '  auto_create: true',
    '  empty_timeout: 60',
    'logging:',
    '  level: warn',
    '',
  );
  fs.writeFileSync(CONFIG_PATH, lines.join('\n'), { mode: 0o600 });
}

function assetName() {
  const os = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[process.platform];
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!os || !arch) return null;
  return `livekit_${VERSION}_${os}_${arch}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore', ...opts });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}`))));
  });
}

async function ensureBinary() {
  if (fs.existsSync(BIN_PATH)) return;
  if (process.env.LIVEKIT_PATH) throw new Error(`LIVEKIT_PATH aponta pra um arquivo que não existe: ${BIN_PATH}`);
  const asset = assetName();
  if (!asset) throw new Error(`sem livekit-server pronto pra ${process.platform}/${process.arch} — instale à mão e aponte LIVEKIT_PATH`);
  const url = `https://github.com/livekit/livekit/releases/download/v${VERSION}/${asset}`;
  log(`baixando o livekit-server ${VERSION} (${asset})…`);
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download falhou: HTTP ${res.status}`);
  const archive = path.join(BIN_DIR, asset);
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  // o tar do sistema abre os dois formatos (no Windows 10+ o tar.exe também lê .zip)
  await run('tar', ['-xf', archive, '-C', BIN_DIR]);
  fs.rmSync(archive, { force: true });
  if (!fs.existsSync(BIN_PATH)) throw new Error('o arquivo baixado não tinha o livekit-server dentro');
  if (process.platform !== 'win32') fs.chmodSync(BIN_PATH, 0o755);
  log('livekit-server pronto em', BIN_PATH);
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: HTTP_PORT, path: '/', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode > 0);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// espera o livekit-server responder. Não desiste enquanto ele estiver de pé: com use_external_ip ele
// só começa a atender depois de descobrir o IP público, o que demora se a internet estiver lenta.
async function waitReady(child) {
  for (let i = 0; ; i++) {
    if (state.child !== child || state.stopping) return false;
    if (await ping()) return true;
    if (i === 40) {
      log('o livekit-server ainda não respondeu. Se continuar assim, ele não está conseguindo descobrir o IP público:');
      log('  ponha LIVEKIT_NODE_IP=<seu IP público> no .env e reinicie. Enquanto isso as calls seguem em malha.');
    }
    await new Promise((r) => setTimeout(r, i < 40 ? 500 : 3000));
  }
}

function launch() {
  writeConfig();
  const child = spawn(BIN_PATH, ['--config', CONFIG_PATH], { stdio: ['ignore', 'pipe', 'pipe'] });
  state.child = child;
  const startedAt = Date.now();
  const relay = (buf) => {
    for (const line of String(buf).split('\n')) if (line.trim()) console.log('[livekit]', line.trim());
  };
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('error', (err) => log('não consegui iniciar o livekit-server:', err.message));
  child.on('exit', (code) => {
    if (state.child === child) { state.child = null; state.ready = false; }
    if (state.stopping) return;
    // caiu sozinho: tenta de novo, cada vez esperando mais (até 30 s). Enquanto isso as calls
    // novas entram em malha (a rota /api/rtc/sfu responde enabled:false).
    state.restarts = Date.now() - startedAt > 60000 ? 0 : state.restarts + 1;
    const wait = Math.min(30000, 1000 * 2 ** Math.min(state.restarts, 5));
    log(`livekit-server parou (código ${code}) — tentando de novo em ${Math.round(wait / 1000)} s`);
    setTimeout(() => { if (!state.stopping) launch(); }, wait).unref();
  });
  waitReady(child).then((ok) => {
    if (!ok || state.child !== child) return;
    state.ready = true;
    log(`no ar — as calls passam por este PC. Portas que precisam estar abertas no roteador: UDP ${UDP_PORT} e TCP ${TCP_PORT}`);
  });
}

// chamado uma vez pelo server/index.js. Nunca derruba o site: se algo falhar, fica em malha.
async function start() {
  if (!WANTED) return;
  try {
    await ensureBinary();
    launch();
  } catch (err) {
    log('servidor de mídia indisponível, as calls seguem em malha (conexão direta):', err.message);
  }
}

function stop() {
  state.stopping = true;
  state.ready = false;
  if (state.child) { try { state.child.kill(); } catch (_) { /* já morreu */ } }
}
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { stop(); process.exit(0); });
}

function isReady() { return WANTED && state.ready; }

// ------------------------------------------------------------------ ingresso (token)

const b64url = (input) => Buffer.from(input).toString('base64url');

// JWT HS256 no formato que o LiveKit espera. Vale pra UMA sala e identifica a pessoa pelo id da conta.
// `publishOnly`: participante que só envia (o auxiliar de tela do app desktop) — não recebe nada da sala.
// publishOnly: o auxiliar de tela ("tela-<id>") só manda. watchOnly: o assistente do app do Linux
// ("ver-<id>") só recebe e fica oculto — ninguém vê ele na sala.
function createToken({ room, identity, name, publishOnly, watchOnly }) {
  const { apiKey, apiSecret } = loadKeys();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKey,
    sub: String(identity),
    name: name || String(identity),
    nbf: now - 10,
    // curto de propósito: enquanto a pessoa está conectada o próprio LiveKit renova o ingresso
    // sozinho (manda um novo pro cliente de tempos em tempos), então call longa não cai por isso.
    // Um ingresso vazado/guardado só serve por esse tempo — e, mesmo dentro dele, a porta de
    // entrada (gate, abaixo) só deixa passar quem está na call de verdade.
    exp: now + TOKEN_TTL_SEC,
    video: {
      room, roomJoin: true, canPublish: !watchOnly, canSubscribe: !publishOnly, canPublishData: false,
      ...(watchOnly ? { hidden: true } : {}),
    },
  };
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', apiSecret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const roomForChannel = (channelId) => `canal-${channelId}`;

// ------------------------------------------------------------------ quem pode estar na mídia
//
// A interface mostra quem está na call pelo estado do site (realtime.js → voiceStates). O LiveKit
// tem o dele. Sem amarrar os dois, alguém expulso (ou um cliente modificado) podia continuar
// ouvindo e falando na sala do LiveKit sem aparecer pra ninguém. A regra agora:
//
//   1. a porta de entrada (proxy /livekit) só deixa conectar quem está na call daquele canal no
//      site — ou quem acabou de pedir o ingresso pra entrar (janela de ENTRY_WINDOW_MS, porque o
//      app conecta na mídia um instante ANTES de mandar o voice_join);
//   2. se a janela fecha e a pessoa não entrou na call, ela é tirada da sala;
//   3. sair da call no site (sair, ser desconectado/movido, perder permissão, ser suspenso)
//      tira da sala do LiveKit na hora, com a pessoa e os auxiliares dela (tela-<id>, ver-<id>).
//
// Quem é o "estado do site" vem do realtime.js, ligado pelo index.js (setVoiceLookup) — este
// arquivo não importa o realtime pra não criar dependência circular.

const TOKEN_TTL_SEC = 15 * 60;
const ENTRY_WINDOW_MS = 30 * 1000;
const ENTRY_STRIKE_MS = 2 * 60 * 1000; // pediu ingresso e não entrou: 2 min sem janela de entrada

let voiceChannelOf = () => null; // (userId) -> channelId em que a pessoa está na call, ou null
function setVoiceLookup(fn) { voiceChannelOf = fn; }

const entryWindows = new Map(); // `${userId}:${channelId}` -> expira em (ms)
const entryStrikes = new Map(); // userId -> até quando não ganha janela de entrada

const inCall = (userId, channelId) => voiceChannelOf(Number(userId)) === Number(channelId);

// chamado pela rota /api/rtc/sfu ao emitir o ingresso principal (ou o do assistente "ver-")
// pra quem AINDA não está na call. false = recusado (insistiu sem entrar).
function openEntryWindow(userId, channelId) {
  const strike = entryStrikes.get(userId);
  if (strike && strike > Date.now()) return false;
  const key = `${userId}:${channelId}`;
  entryWindows.set(key, Date.now() + ENTRY_WINDOW_MS);
  // não é cancelado por um pedido novo: cada janela é conferida no fim dela
  setTimeout(() => {
    const exp = entryWindows.get(key);
    // sumiu: a pessoa entrou na call e já saiu (onLeftCall fecha a janela e cuida da sala)
    if (!exp) return;
    // tem uma janela mais nova aberta: quem confere é o timer dela
    if (exp > Date.now()) return;
    entryWindows.delete(key);
    if (inCall(userId, channelId)) return;
    log(`conta ${userId} pegou ingresso do canal ${channelId} e não entrou na call — tirando da sala`);
    entryStrikes.set(userId, Date.now() + ENTRY_STRIKE_MS);
    kickUser(channelId, userId);
  }, ENTRY_WINDOW_MS + 500).unref();
  return true;
}

function hasEntryWindow(userId, channelId) {
  const exp = entryWindows.get(`${userId}:${channelId}`);
  return !!exp && exp > Date.now();
}

// a pessoa saiu da call no site: fecha a janela e, se ela não voltou pra MESMA call logo em
// seguida (trocar de aba faz sair e entrar de novo no mesmo instante), tira da sala do LiveKit
function onLeftCall(channelId, userId) {
  if (userId < 0) return; // bot de música não está no LiveKit
  entryWindows.delete(`${userId}:${channelId}`);
  setImmediate(() => { if (!inCall(userId, channelId)) kickUser(channelId, userId); });
}

const IDENTITY_RE = /^(?:(tela|ver)-)?(\d+)$/;
const ROOM_RE = /^canal-(\d+)$/;

// pode estar na sala? `helper` = auxiliar de tela ("tela-") ou assistente ("ver-")
function mediaAllowed(identity, room) {
  const im = IDENTITY_RE.exec(String(identity || ''));
  const rm = ROOM_RE.exec(String(room || ''));
  if (!im || !rm) return false;
  const userId = Number(im[2]);
  const channelId = Number(rm[1]);
  if (inCall(userId, channelId)) return true;
  // o auxiliar de tela só existe com a pessoa já na call; o principal e o assistente podem
  // conectar um instante antes do voice_join
  return im[1] !== 'tela' && hasEntryWindow(userId, channelId);
}

// confere a assinatura e a validade de um ingresso (nosso, ou o renovado pelo próprio LiveKit — os
// dois são assinados com o mesmo segredo). Devolve o conteúdo ou null.
function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || token.length > 8192) return null;
  const { apiKey, apiSecret } = loadKeys();
  const expected = crypto.createHmac('sha256', apiSecret).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try { given = Buffer.from(parts[2], 'base64url'); } catch (_) { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch (_) { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (!payload || payload.iss !== apiKey) return null;
  if (typeof payload.exp === 'number' && payload.exp < now - 5) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  return payload;
}

// porta de entrada do proxy: o ingresso vem na URL (?access_token=) ou no cabeçalho Authorization
function gateRequest(req) {
  let token = null;
  try { token = new URL(req.url, 'http://localhost').searchParams.get('access_token'); } catch (_) { /* url torta */ }
  if (!token) {
    const auth = String(req.headers.authorization || '');
    if (/^Bearer\s+/i.test(auth)) token = auth.replace(/^Bearer\s+/i, '').trim();
  }
  // pedidos sem ingresso (ex: a página inicial do LiveKit) não abrem sala nenhuma
  if (!token) return { ok: true };
  const payload = verifyToken(token);
  if (!payload || !payload.video || !payload.video.room) return { ok: false, status: 401, why: 'ingresso inválido' };
  if (!mediaAllowed(payload.sub, payload.video.room)) {
    return { ok: false, status: 403, why: `${payload.sub} não está na call de ${payload.video.room}` };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ tirar alguém da sala

function adminToken(room) {
  const { apiKey, apiSecret } = loadKeys();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: apiKey, nbf: now - 10, exp: now + 60, video: { room, roomAdmin: true } }));
  const sig = crypto.createHmac('sha256', apiSecret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

// API do LiveKit (Twirp): POST /twirp/livekit.RoomService/RemoveParticipant. Não estar na sala
// (404) é o caso normal de quem já saiu sozinho — não é erro.
function removeParticipant(room, identity) {
  if (!isReady()) return Promise.resolve(false);
  const payload = JSON.stringify({ room, identity: String(identity) });
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port: HTTP_PORT, method: 'POST',
      path: '/twirp/livekit.RoomService/RemoveParticipant',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: `Bearer ${adminToken(room)}` },
      timeout: 5000,
    }, (res) => {
      res.resume();
      if (res.statusCode === 200) log(`tirei ${identity} da sala ${room}`);
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end(payload);
  });
}

// tira a pessoa E os auxiliares dela (tela, assistente) da sala do canal
function kickUser(channelId, userId) {
  const room = roomForChannel(channelId);
  return Promise.all([String(userId), `tela-${userId}`, `ver-${userId}`].map((id) => removeParticipant(room, id)));
}

// ------------------------------------------------------------------ repasse /livekit -> 127.0.0.1

const PREFIX = '/livekit';
const isProxyPath = (pathname) => pathname === PREFIX || pathname.startsWith(PREFIX + '/');

// WebSocket da sinalização: repassa os bytes crus (o pedido de upgrade é reescrito sem o prefixo)
function proxyUpgrade(req, socket, head) {
  if (!isReady()) { socket.destroy(); return; }
  const gate = gateRequest(req);
  if (!gate.ok) {
    log(`entrada recusada na mídia: ${gate.why}`);
    socket.end(`HTTP/1.1 ${gate.status} ${gate.status === 401 ? 'Unauthorized' : 'Forbidden'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    return;
  }
  socket.setTimeout(0); // sinalização fica aberta a call inteira
  const upstream = net.connect(HTTP_PORT, '127.0.0.1', () => {
    const target = req.url.slice(PREFIX.length) || '/';
    let raw = `${req.method} ${target.startsWith('/') ? target : '/' + target} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const key = req.rawHeaders[i];
      raw += `${key}: ${key.toLowerCase() === 'host' ? `127.0.0.1:${HTTP_PORT}` : req.rawHeaders[i + 1]}\r\n`;
    }
    upstream.write(raw + '\r\n');
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  const close = () => { socket.destroy(); upstream.destroy(); };
  upstream.on('error', close);
  socket.on('error', close);
  upstream.on('close', close);
  socket.on('close', close);
}

// pedidos HTTP comuns do cliente do LiveKit (ex: /rtc/validate, quando a conexão falha)
function proxyHttp(req, res) {
  if (!isReady()) { res.status(503).json({ error: 'servidor de mídia fora do ar' }); return; }
  // a API de administração do LiveKit (twirp) fica só pra este servidor, nunca pelo site
  if (/^\/twirp(\/|$)/i.test(req.path || req.url)) { res.status(404).end(); return; }
  const gate = gateRequest(req);
  if (!gate.ok) { res.status(gate.status).json({ error: gate.why }); return; }
  const upstream = http.request({
    host: '127.0.0.1', port: HTTP_PORT, method: req.method, path: req.url,
    headers: { ...req.headers, host: `127.0.0.1:${HTTP_PORT}` },
  }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.end(); });
  req.pipe(upstream);
}

module.exports = {
  start, stop, isReady, createToken, roomForChannel, proxyUpgrade, proxyHttp, isProxyPath, PREFIX,
  setVoiceLookup, openEntryWindow, onLeftCall, kickUser, mediaAllowed, verifyToken, TOKEN_TTL_SEC,
  ports: { http: HTTP_PORT, tcp: TCP_PORT, udp: UDP_PORT },
};
