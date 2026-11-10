// onde estão os programas externos que o bot de música usa: yt-dlp (busca e baixa o áudio do
// YouTube) e ffmpeg (converte pra mp3).
//
// yt-dlp: o bot cuida dele sozinho. Na primeira vez que precisar, baixa a versão oficial
// "standalone" (não precisa de Python) do GitHub do projeto pra server/bots/musicBot/bin/, e uma
// vez por dia pede pra ele se atualizar (`yt-dlp -U`) — o YouTube muda com frequência e versões
// velhas do yt-dlp param de funcionar do nada. Ordem de preferência:
//   1. YTDLP_PATH no .env (se você quiser usar um específico)
//   2. o que o bot baixou/baixa em bin/
//   3. um `yt-dlp` instalado no sistema (PATH), se o download falhar
//
// ffmpeg: precisa estar instalado no sistema (apt install ffmpeg / winget install ffmpeg), ou
// apontado por FFMPEG_PATH no .env. Se não existir, o bot avisa com uma mensagem clara.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const BIN_DIR = path.join(__dirname, 'bin');
const IS_WIN = process.platform === 'win32';
const MANAGED_YTDLP = path.join(BIN_DIR, IS_WIN ? 'yt-dlp.exe' : 'yt-dlp');
const UPDATE_EVERY_MS = 24 * 60 * 60 * 1000;

// nome do arquivo de release oficial pra esse sistema/arquitetura
// (https://github.com/yt-dlp/yt-dlp/releases)
function releaseAsset() {
  if (IS_WIN) return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  if (process.platform === 'linux') {
    if (process.arch === 'x64') return 'yt-dlp_linux';
    if (process.arch === 'arm64') return 'yt-dlp_linux_aarch64';
    if (process.arch === 'arm') return 'yt-dlp_linux_armv7l';
  }
  return null;
}

function runVersion(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 15000 }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim());
    });
  });
}

async function download(asset) {
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  console.log(`[musicBot] baixando yt-dlp (${asset}) de ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download do yt-dlp falhou (HTTP ${res.status})`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length < 1024 * 1024) throw new Error('download do yt-dlp veio incompleto');
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const tmp = `${MANAGED_YTDLP}.download`;
  fs.writeFileSync(tmp, data, { mode: 0o755 });
  fs.renameSync(tmp, MANAGED_YTDLP); // troca de uma vez — nunca deixa um binário pela metade no lugar
}

// atualiza em segundo plano, no máximo uma vez por dia (não atrasa nenhum comando)
let updating = false;
function maybeSelfUpdate() {
  if (updating || !fs.existsSync(MANAGED_YTDLP)) return;
  const age = Date.now() - fs.statSync(MANAGED_YTDLP).mtimeMs;
  if (age < UPDATE_EVERY_MS) return;
  updating = true;
  execFile(MANAGED_YTDLP, ['-U'], { timeout: 120000 }, (err, stdout) => {
    updating = false;
    // marca como verificado hoje mesmo se não tinha versão nova (senão tentaria de novo a cada uso)
    try { const now = new Date(); fs.utimesSync(MANAGED_YTDLP, now, now); } catch (_) { /* ok */ }
    if (err) console.warn('[musicBot] não deu pra atualizar o yt-dlp:', err.message);
    else console.log('[musicBot] yt-dlp:', String(stdout).trim().split('\n').pop());
  });
}

let ytdlpPath = null;     // caminho já verificado e funcionando
let ytdlpPromise = null;  // verificação/download em andamento (compartilhado entre pedidos)

// garante um yt-dlp funcionando e devolve o caminho dele. Lança um erro com mensagem amigável
// (vai pro chat como "⚠️ ...") se não houver jeito.
function ensureYtDlp() {
  if (ytdlpPath) {
    if (ytdlpPath === MANAGED_YTDLP) maybeSelfUpdate();
    return Promise.resolve(ytdlpPath);
  }
  if (ytdlpPromise) return ytdlpPromise;

  ytdlpPromise = (async () => {
    if (process.env.YTDLP_PATH) {
      if (await runVersion(process.env.YTDLP_PATH)) return process.env.YTDLP_PATH;
      throw new Error(`YTDLP_PATH (${process.env.YTDLP_PATH}) não funciona — confere o caminho no .env`);
    }

    if (fs.existsSync(MANAGED_YTDLP) && await runVersion(MANAGED_YTDLP)) {
      maybeSelfUpdate();
      return MANAGED_YTDLP;
    }

    const asset = releaseAsset();
    let downloadError = null;
    if (asset) {
      try {
        await download(asset);
        const version = await runVersion(MANAGED_YTDLP);
        if (version) {
          console.log(`[musicBot] yt-dlp ${version} pronto em ${MANAGED_YTDLP}`);
          return MANAGED_YTDLP;
        }
        downloadError = new Error('o yt-dlp baixado não rodou neste sistema');
      } catch (err) {
        downloadError = err;
      }
    }

    // último recurso: um yt-dlp instalado no sistema
    const systemBin = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
    if (await runVersion(systemBin)) return systemBin;

    throw new Error(
      `não achei o yt-dlp e não consegui baixar (${downloadError ? downloadError.message : 'sistema não suportado'}). `
      + 'Instale manualmente (https://github.com/yt-dlp/yt-dlp#installation) ou aponte YTDLP_PATH no .env.'
    );
  })()
    .then((p) => { ytdlpPath = p; return p; })
    .finally(() => { ytdlpPromise = null; });

  return ytdlpPromise;
}

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
let ffmpegOk = null;

async function ensureFfmpeg() {
  if (ffmpegOk) return FFMPEG_BIN;
  const ok = await new Promise((resolve) => {
    execFile(FFMPEG_BIN, ['-version'], { timeout: 15000 }, (err) => resolve(!err));
  });
  if (!ok) {
    throw new Error(
      'o ffmpeg não está instalado no servidor. Linux: `sudo apt install ffmpeg` · Windows: `winget install ffmpeg` '
      + '(ou aponte FFMPEG_PATH no .env).'
    );
  }
  ffmpegOk = true;
  return FFMPEG_BIN;
}

// já deixa tudo pronto quando o servidor sobe (sem travar a inicialização)
function warmUp() {
  ensureYtDlp().catch((err) => console.warn('[musicBot]', err.message));
  ensureFfmpeg().catch((err) => console.warn('[musicBot]', err.message));
}

module.exports = { ensureYtDlp, ensureFfmpeg, warmUp, MANAGED_YTDLP };
