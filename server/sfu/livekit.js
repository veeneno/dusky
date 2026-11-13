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
    exp: now + 24 * 60 * 60, // 24 h: cobre reconexões numa call longa
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

// ------------------------------------------------------------------ repasse /livekit -> 127.0.0.1

const PREFIX = '/livekit';
const isProxyPath = (pathname) => pathname === PREFIX || pathname.startsWith(PREFIX + '/');

// WebSocket da sinalização: repassa os bytes crus (o pedido de upgrade é reescrito sem o prefixo)
function proxyUpgrade(req, socket, head) {
  if (!isReady()) { socket.destroy(); return; }
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
  ports: { http: HTTP_PORT, tcp: TCP_PORT, udp: UDP_PORT },
};
