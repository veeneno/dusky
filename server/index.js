const path = require('path');

// carrega o .env (chaves do Metered/GIPHY) antes de tudo — se o arquivo não existir, segue
// só com variáveis de ambiente do sistema (ex: em produção você pode preferir setar direto)
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (_) { /* sem .env — segue sem essas chaves, as rotas caem pro modo sem elas */ }

// cópia das últimas linhas de log pra página /admin (server/logBuffer.js)
require('./logBuffer').install();

const http = require('http');
const express = require('express');
const cookieSession = require('cookie-session');

const authRoutes = require('./routes/auth');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const wsRoutes = require('./routes/ws');
const profileRoutes = require('./routes/profile');
const botsRoutes = require('./routes/bots');
const musicbotRoutes = require('./routes/musicbot');
const rtcRoutes = require('./routes/rtc');
const giphyRoutes = require('./routes/giphy');
const serversRoutes = require('./routes/servers');
const invitesRoutes = require('./routes/invites');
const dmsRoutes = require('./routes/dms');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const activityRoutes = require('./routes/activity');
const embedRoutes = require('./routes/embeds');
const downloadRoutes = require('./routes/downloads');
const versionRoutes = require('./routes/version');
const realtime = require('./realtime');
const sfu = require('./sfu/livekit');

const app = express();
const PORT = process.env.PORT || 3000;

// em produção o app fica atrás de um proxy local (Caddy, ver deploy/setup-vm.sh) — sem isso,
// req.ip seria sempre 127.0.0.1 e o limite de tentativas de login trataria todo mundo como uma
// pessoa só. 'loopback' só confia no X-Forwarded-For quando quem fala com o Node é a própria máquina.
app.set('trust proxy', 'loopback');

// gerado uma vez e fixado aqui; se você mudar isso, todo mundo é deslogado
const SESSION_SECRET = process.env.SESSION_SECRET || 'troque-essa-chave-antes-de-expor-o-site-na-internet';

// server.requestTimeout fica desligado (lá embaixo) por causa dos anexos grandes, que têm prazo
// próprio em routes/messages.js. Todo o resto precisa terminar de mandar o corpo do pedido em
// 5 min — senão uma conexão que manda 1 byte por vez ficaria pendurada pra sempre.
const BODY_DEADLINE_MS = 5 * 60 * 1000;
const ATTACHMENT_PATH = /^\/api\/channels\/\d+\/messages\/attachment\/?$/;
app.use((req, res, next) => {
  if (req.complete || ATTACHMENT_PATH.test(req.path)) return next();
  const timer = setTimeout(() => { if (!req.complete) req.socket.destroy(); }, BODY_DEADLINE_MS);
  timer.unref();
  const done = () => clearTimeout(timer);
  req.once('end', done);
  req.once('close', done);
  next();
});

// sinalização do servidor de mídia (LiveKit) pelo mesmo endereço do site — antes do express.json,
// pra o corpo do pedido chegar intacto lá. Só responde quando SFU=livekit está ligado e de pé.
app.use(sfu.PREFIX, sfu.proxyHttp);

app.use(express.json({ limit: '1mb' })); // tema com CSS próprio passa dos 100kb padrão
app.use(express.urlencoded({ extended: true }));

app.use(cookieSession({
  // nome antigo de propósito: trocar deslogaria todo mundo
  name: 'didiscord_session',
  secret: SESSION_SECRET,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
  httpOnly: true,
  sameSite: 'lax',
}));
// pelo endereço https (túnel do Cloudflare) o cookie só viaja criptografado. Acesso direto por
// http (rede de casa, testes) continua funcionando: aí não dá pra marcar `secure`.
app.use((req, res, next) => {
  if (req.secure && req.sessionOptions) req.sessionOptions.secure = true;
  next();
});

// cabeçalhos de segurança em tudo. As páginas (.html) ganham ainda a política de conteúdo (CSP)
// lá no express.static. Outro site não pode embutir o dusky num iframe (clickjacking).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// Endereço antigo (didiscord.veneno.space): o mesmo túnel atende os dois endereços, então tudo
// continua funcionando nele — o app Electron já instalado só aceita navegar no endereço que tem
// salvo, e o atualizador dele lê /downloads/latest*.yml de lá. Com LEGACY_HOST_REDIRECT=1 no .env,
// quem abre o site ANTIGO num navegador comum (não o app) é mandado pro endereço novo. O login e as
// preferências do navegador ficam por endereço, então a pessoa entra de novo uma vez lá.
const LEGACY_HOST = /^didiscord\./i;
const NEW_HOST = (h) => h.replace(LEGACY_HOST, 'dusky.');
app.use((req, res, next) => {
  if (process.env.LEGACY_HOST_REDIRECT !== '1' || req.method !== 'GET' || !LEGACY_HOST.test(req.hostname || '')) return next();
  const ua = String(req.headers['user-agent'] || '');
  if (/Electron|dusky-desktop|didiscord-desktop/i.test(ua)) return next(); // apps desktop: nada muda
  if (/^\/(downloads|api|ws|livekit|uploads|vendor)(\/|$)/.test(req.path)) return next(); // atualizador, API, mídia
  res.redirect(301, `https://${NEW_HOST(req.hostname)}${req.originalUrl}`);
});

// página do admin do site: só abre pra quem é admin (as rotas /api/admin já conferem de novo)
app.get(['/admin', '/admin.html'], (req, res, next) => {
  const uid = req.session && req.session.userId;
  const row = uid ? require('./db').prepare('SELECT is_site_admin, banned_at, session_version FROM users WHERE id = ?').get(uid) : null;
  const ok = row && row.is_site_admin && !row.banned_at && (req.session.sv || 0) === (row.session_version || 0);
  if (!ok) return res.redirect(uid ? '/app.html' : '/login.html');
  if (req.path === '/admin') return res.redirect('/admin.html');
  next();
});

// termos de uso e política de privacidade (páginas estáticas em public/)
app.get('/termos', (req, res) => res.redirect('/termos.html'));
app.get('/privacidade', (req, res) => res.redirect('/privacidade.html'));

// raiz redireciona pra login ou pro app, dependendo da sessão
app.get('/', (req, res) => {
  const dest = (req.session && req.session.userId) ? '/app.html' : '/login.html';
  res.redirect(dest);
});

// link de convite (https://seu.site/invite/CODIGO) — quem já está logado cai direto no app com a
// tela de "entrar no servidor"; quem não está vai pro login/cadastro, que leva o convite junto
app.get('/invite/:code', (req, res) => {
  const code = String(req.params.code || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  const dest = (req.session && req.session.userId) ? '/app.html' : '/login.html';
  res.redirect(`${dest}?invite=${encodeURIComponent(code)}`);
});

// arquivos estáticos (html/css/js/uploads) — nunca deixa nada em cache (nem no navegador, nem em
// proxy/CDN no meio do caminho tipo Cloudflare), senão depois de um deploy o outro lado pode
// continuar vendo js/css velhos sem perceber
//
// EXCEÇÃO: public/vendor/ (bibliotecas de terceiros — motor/modelo de supressão de ruído, ~24 MB).
// Esses arquivos nunca mudam no mesmo endereço (versão nova = pasta nova), então ficam no cache
// do navegador — sem isso, a pessoa baixaria 24 MB de novo toda vez que entrasse numa call.
// Política de conteúdo das páginas. A parte que já vale (CSP_ENFORCED) não quebra nada: proíbe
// embutir o site, plugins e formulários pra fora. A completa (só scripts do próprio site etc.) roda
// primeiro em modo "só relatar": o navegador avisa em /api/csp-report o que ela bloquearia, sem
// bloquear — depois de uns dias sem avisos estranhos no log, ela passa pra CSP_ENFORCED.
const CSP_ENFORCED = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' wss: ipc: http://ipc.localhost https://cloudflareinsights.com",
  "frame-src https://www.youtube-nocookie.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'report-uri /api/csp-report',
].join('; ');
app.post('/api/csp-report', express.json({ type: ['application/csp-report', 'application/json', 'application/reports+json'], limit: '16kb' }), (req, res) => {
  const { hit } = require('./limits');
  if (!hit('csp-report', req.ip, 30, 60 * 1000)) {
    const r = (req.body && req.body['csp-report']) || req.body || {};
    const clip = (v) => String(v || '').slice(0, 200);
    console.warn(`[csp] ${clip(r['violated-directive'] || r.effectiveDirective)} bloquearia ${clip(r['blocked-uri'] || r.blockedURL)} em ${clip(r['document-uri'] || r.documentURL)}`);
  }
  res.sendStatus(204);
});

const DECOR_MEDIA_DIR = path.join(__dirname, '..', 'public', 'decor', 'media') + path.sep;
const VENDOR_DIR = path.join(__dirname, '..', 'public', 'vendor') + path.sep;
app.use(require('./routes/uploads'));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', CSP_ENFORCED);
      res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
    }
    if (filePath.startsWith(DECOR_MEDIA_DIR)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (filePath.startsWith(VENDOR_DIR)) res.setHeader('Cache-Control', 'public, max-age=2592000');
    else res.setHeader('Cache-Control', 'no-store');
  },
}));

// app desktop: /baixar, /downloads/*, /api/downloads (público, sem login)
app.use(downloadRoutes);
app.use(versionRoutes); // /api/version (público)

// frequência por conta (ou por IP, sem login) — ver server/limits.js. Mensagens e anexos têm os
// limites deles em routes/messages.js. Os números são folgados pro uso normal: só pega abuso.
const { perUser } = require('./limits');
const HOUR = 60 * 60 * 1000;
app.use('/api', perUser('api', 900, 60 * 1000, 'muitos pedidos seguidos — espera um minuto'));
app.post('/api/servers', perUser('server-create', 10, HOUR, 'você criou servidores demais em pouco tempo'));
app.post('/api/servers/:serverId/invites', perUser('invite-create', 40, HOUR, 'muitos convites criados — espera um pouco'));
app.post('/api/invites/:code/accept', perUser('invite-accept', 20, 10 * 60 * 1000, 'muitas tentativas de convite — espera uns minutos'));
app.get('/api/invites/:code', perUser('invite-peek', 60, 10 * 60 * 1000, 'muitas tentativas de convite — espera uns minutos'));
app.post('/api/dms', perUser('dm-create', 30, 10 * 60 * 1000));
app.get('/api/embed', perUser('embed', 120, 60 * 1000));
app.get('/api/giphy/search', perUser('giphy', 60, 60 * 1000));
app.get('/api/musicbot/search', perUser('music-search', 40, 60 * 1000, 'muitas buscas seguidas — espera um pouco'));
app.use('/api/soundboard', perUser('soundboard', 60, 10 * 60 * 1000));
app.use('/api/servers/:serverId/soundboard', perUser('soundboard', 60, 10 * 60 * 1000));
app.use('/api/profile', (req, res, next) => (req.method === 'GET' ? next() : perUser('profile', 60, 10 * 60 * 1000)(req, res, next)));
app.get('/api/rtc/sfu', perUser('rtc-sfu', 60, 60 * 1000));
app.use('/api/auth/email', perUser('auth-email', 30, 10 * 60 * 1000, 'muitos pedidos — espera uns minutos'));

// rotas de autenticação (registro, login, logout, /me)
app.use('/api/auth', authRoutes);
app.use('/api/account', require('./routes/account')); // e-mail, 2 etapas, exportar e excluir conta
app.use('/api/reports', require('./routes/reports'));
app.use('/api/channels', channelRoutes);
app.use('/api/channels/:channelId/messages', messageRoutes);
app.use('/api/ws', wsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/bots', botsRoutes);
app.use('/api/musicbot', musicbotRoutes);
app.use('/api/rtc', rtcRoutes);
app.use('/api/giphy', giphyRoutes);
app.use('/api/servers/:serverId/categories', require('./routes/categories'));
app.use('/api/servers/:serverId/soundboard', require('./routes/soundboard').serverRouter);
app.use('/api/soundboard', require('./routes/soundboard'));
app.use('/api/servers', serversRoutes);
app.use('/api/push', require('./routes/push'));
app.use('/api/invites', invitesRoutes);
app.use('/api/dms', dmsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', activityRoutes); // /api/unread, /api/search
app.use('/api/embed', embedRoutes);

const server = http.createServer(app);
realtime.init(server); // liga o WebSocket em /ws no mesmo servidor HTTP
// amarra a sala do LiveKit à call do site: só entra na mídia quem está na call, e sair da call
// (por vontade própria, expulsão, perda de permissão ou suspensão) tira da sala na hora
sfu.setVoiceLookup(realtime.voiceChannelOf);
realtime.onVoiceLeave(sfu.onLeftCall);
// os outros upgrades: /livekit vai pro servidor de mídia; qualquer outra coisa é recusada
server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (_) { /* url torta */ }
  if (pathname === '/ws') return; // já tratado pelo realtime
  if (sfu.isProxyPath(pathname)) return sfu.proxyUpgrade(req, socket, head);
  socket.destroy();
});

// o Node (18+) mata qualquer request que passe de 5min por padrão (server.requestTimeout).
// isso é curto demais pra anexo grande numa conexão lenta — desativado aqui (0 = sem limite), e
// no lugar dele: prazo de 5 min pro corpo dos pedidos comuns (middleware no topo deste arquivo) e,
// nos anexos, 60 s sem chegar nada ou 30 min no total (routes/messages.js). headersTimeout continua
// com um teto baixo (só os HEADERS da request).
server.requestTimeout = 0;
server.headersTimeout = 30000;

server.listen(PORT, () => {
  console.log(`dusky rodando em http://localhost:${PORT}`);
  // deixa o yt-dlp/ffmpeg do bot de música prontos sem esperar o primeiro /play
  require('./bots/musicBot/binaries').warmUp();
  // servidor de mídia das calls (só com SFU=livekit no .env; sem isso as calls seguem em malha)
  sfu.start();
});
