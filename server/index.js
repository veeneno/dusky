const path = require('path');

// carrega o .env (chaves do Metered/GIPHY) antes de tudo — se o arquivo não existir, segue
// só com variáveis de ambiente do sistema (ex: em produção você pode preferir setar direto)
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (_) { /* sem .env — segue sem essas chaves, as rotas caem pro modo sem elas */ }

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
const VENDOR_DIR = path.join(__dirname, '..', 'public', 'vendor') + path.sep;
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.startsWith(VENDOR_DIR)) res.setHeader('Cache-Control', 'public, max-age=2592000');
    else res.setHeader('Cache-Control', 'no-store');
  },
}));

// app desktop: /baixar, /downloads/*, /api/downloads (público, sem login)
app.use(downloadRoutes);

// rotas de autenticação (registro, login, logout, /me)
app.use('/api/auth', authRoutes);
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
// os outros upgrades: /livekit vai pro servidor de mídia; qualquer outra coisa é recusada
server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (_) { /* url torta */ }
  if (pathname === '/ws') return; // já tratado pelo realtime
  if (sfu.isProxyPath(pathname)) return sfu.proxyUpgrade(req, socket, head);
  socket.destroy();
});

// o Node (18+) mata qualquer request que passe de 5min por padrão (server.requestTimeout).
// isso é curto demais pra upload de anexo de até 2GB numa conexão mais lenta — desativado aqui
// (0 = sem limite). headersTimeout continua com um teto baixo (só os HEADERS da request, não
// o corpo/arquivo), então isso não abre brecha pra conexões penduradas sem nunca mandar nada.
server.requestTimeout = 0;
server.headersTimeout = 60000;

server.listen(PORT, () => {
  console.log(`dusky rodando em http://localhost:${PORT}`);
  // deixa o yt-dlp/ffmpeg do bot de música prontos sem esperar o primeiro /play
  require('./bots/musicBot/binaries').warmUp();
  // servidor de mídia das calls (só com SFU=livekit no .env; sem isso as calls seguem em malha)
  sfu.start();
});
