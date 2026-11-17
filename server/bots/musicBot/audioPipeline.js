// pipeline de áudio de UMA faixa tocando: o yt-dlp extrai o áudio do vídeo e manda cru pro stdin
// do ffmpeg, que reencoda pra mp3 constante (128kbps CBR) e joga no stdout.
//
// Cada servidor toca a sua própria música (queue.js), então cada chamada de startTrack é
// independente — não existe "o pipeline atual" global; quem chama guarda o controle devolvido.
//
// IMPORTANTE: yt-dlp + ffmpeg processam MUITO mais rápido que tempo real (uma faixa de 3min fica
// pronta em segundos). Se os bytes fossem repassados assim que saem, o "fim da faixa" (onEnd)
// aconteceria muito antes de alguém terminar de ouvir. Por isso existe o "metrônomo" (drain): os
// bytes ficam num buffer em memória e são liberados no ritmo real do mp3 (BYTES_PER_SEC). onEnd
// dispara quando o buffer esvazia de vez — ou seja, quando a faixa acabou de tocar de verdade.
const { spawn } = require('child_process');

const BITRATE_KBPS = 128; // tem que bater com o '-b:a' passado pro ffmpeg logo abaixo
const BYTES_PER_SEC = (BITRATE_KBPS * 1000) / 8;
const DRAIN_INTERVAL_MS = 100; // granularidade do metrônomo
// volume-alvo da música (LUFS — quanto mais negativo, mais baixo). -20 fica perto de uma voz numa
// call. Dá pra ajustar com MUSIC_LUFS no .env (ex: -16 mais alto, -24 mais baixo).
const MUSIC_LUFS = (() => {
  const v = Number(process.env.MUSIC_LUFS);
  return Number.isFinite(v) && v <= -5 && v >= -40 ? v : -20;
})();

function killQuiet(child, signal) {
  if (!child) return;
  try { child.kill(signal); } catch (_) { /* processo já pode ter morrido sozinho (ou o sinal não existe no Windows) */ }
}

// inicia o pipeline pra `youtubeUrl`. Opções:
//   onData(chunk)    — pedaço de mp3 pronto pros ouvintes, já no ritmo real da faixa
//   onEnd()          — a faixa terminou de tocar de verdade (buffer drenado no ritmo real)
//   onError(err)     — yt-dlp ou ffmpeg falharam — trate como "pula a faixa"
//   initialLeadSec   — quantos segundos mandar de uma vez logo no começo (folga pros ouvintes
//                      não travarem quando o stream estava parado e acabou de começar)
//   ytdlpBin/ffmpegBin — caminhos já verificados por binaries.js
// devolve { pause(), resume(), stop() }
function startTrack(youtubeUrl, { onData, onEnd, onError, initialLeadSec = 0, ytdlpBin = 'yt-dlp', ffmpegBin = 'ffmpeg' }) {
  const yt = spawn(ytdlpBin, [
    '-f', 'bestaudio/best',
    '-o', '-',
    '--no-playlist',
    '--quiet',
    '--no-warnings',
    // força o client "android" do youtube: com o padrão, o CDN do youtube passou a devolver 403
    // no DOWNLOAD (não na extração) sem cookies de navegador logado. O "android" simples segue
    // funcionando sem cookies — devolve um formato combinado (~96kbps AAC), sem problema, porque o
    // ffmpeg reencoda tudo pra mp3 128kbps de qualquer forma.
    '--extractor-args', 'youtube:player_client=android',
    youtubeUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const ff = spawn(ffmpegBin, [
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-vn',
    // volume igual pra toda música: as do YouTube vêm masterizadas MUITO mais altas que voz (e
    // diferentes entre si), então o bot "entrava gritando" por cima da call. O loudnorm deixa tudo
    // em MUSIC_LUFS (perto do nível de uma voz numa call), sem estourar (TP = pico máximo).
    '-af', `loudnorm=I=${MUSIC_LUFS}:TP=-2:LRA=11`,
    '-ac', '2',
    '-ar', '44100',
    '-f', 'mp3',
    '-codec:a', 'libmp3lame',
    '-b:a', `${BITRATE_KBPS}k`,
    // sem tag ID3 nem quadro "Xing" no começo de cada faixa: o stream é uma sequência contínua de
    // músicas, e esses cabeçalhos no meio dele faziam o navegador engasgar na troca de faixa
    '-id3v2_version', '0',
    '-write_xing', '0',
    'pipe:1',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  const entry = {
    ended: false,
    paused: false,
    buffer: [],           // Buffers gerados pelo ffmpeg ainda não liberados pro onData
    producerDone: false,  // ffmpeg terminou com sucesso (só falta drenar o buffer)
    drainTimer: null,
    leadBytes: Math.round(BYTES_PER_SEC * Math.max(0, initialLeadSec)),
  };

  function finish(cb) {
    if (entry.ended) return;
    entry.ended = true;
    if (entry.drainTimer) { clearInterval(entry.drainTimer); entry.drainTimer = null; }
    killQuiet(ff, 'SIGKILL');
    killQuiet(yt, 'SIGKILL');
    if (cb) cb();
  }
  const fail = (err) => finish(() => onError && onError(err));

  yt.stdout.pipe(ff.stdin);
  // o yt-dlp às vezes ainda escreve depois que o ffmpeg fechou o stdin (ex: stop no meio) — sem
  // esse handler isso derrubaria o processo Node inteiro com um EPIPE não tratado
  ff.stdin.on('error', () => {});

  let ytStderr = '';
  yt.stderr.on('data', (d) => { ytStderr += d.toString(); });
  yt.on('error', (err) => { if (!entry.ended) fail(err); });
  yt.on('close', (code) => {
    if (entry.ended) return;
    if (code !== 0 && code !== null) {
      const lastLine = ytStderr.trim().split('\n').pop() || `yt-dlp saiu com código ${code}`;
      fail(new Error(lastLine.slice(0, 300)));
    }
  });

  let ffStderr = '';
  ff.stderr.on('data', (d) => { ffStderr += d.toString(); });
  ff.stdout.on('data', (chunk) => { if (!entry.ended) entry.buffer.push(chunk); });
  ff.on('error', (err) => { if (!entry.ended) fail(err); });
  ff.on('close', (code) => {
    if (entry.ended) return;
    if (code === 0 || code === null) {
      entry.producerDone = true; // o metrônomo dispara onEnd quando o buffer esvaziar
    } else {
      const lastLine = ffStderr.trim().split('\n').pop() || `ffmpeg saiu com código ${code}`;
      fail(new Error(lastLine.slice(0, 300)));
    }
  });

  // o metrônomo: libera BYTES_PER_SEC por segundo (mais a folga inicial, uma vez só)
  entry.drainTimer = setInterval(() => {
    if (entry.ended || entry.paused) return;
    let budget = Math.round(BYTES_PER_SEC * (DRAIN_INTERVAL_MS / 1000));
    if (entry.leadBytes > 0) {
      const available = entry.buffer.reduce((n, b) => n + b.length, 0);
      const extra = Math.min(entry.leadBytes, Math.max(0, available - budget));
      budget += extra;
      entry.leadBytes -= extra;
    }
    while (budget > 0 && entry.buffer.length) {
      const chunk = entry.buffer[0];
      if (chunk.length <= budget) {
        entry.buffer.shift();
        budget -= chunk.length;
        if (onData) onData(chunk);
      } else {
        entry.buffer[0] = chunk.subarray(budget);
        if (onData) onData(chunk.subarray(0, budget));
        budget = 0;
      }
    }
    if (entry.producerDone && entry.buffer.length === 0) {
      finish(() => onEnd && onEnd());
    }
  }, DRAIN_INTERVAL_MS);

  return {
    pause() {
      if (entry.ended) return;
      entry.paused = true;
      // congela os processos também (Linux/macOS) — evita seguir baixando à toa enquanto pausado
      killQuiet(yt, 'SIGSTOP');
      killQuiet(ff, 'SIGSTOP');
    },
    resume() {
      if (entry.ended) return;
      entry.paused = false;
      killQuiet(yt, 'SIGCONT');
      killQuiet(ff, 'SIGCONT');
    },
    // para sem disparar onEnd/onError — usado por /stop, /skip etc.
    stop() {
      finish(null);
    },
  };
}

module.exports = { startTrack, BYTES_PER_SEC };
