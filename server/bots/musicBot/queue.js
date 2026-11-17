// fila do bot de música — UMA POR SERVIDOR. Cada servidor tem a sua sessão: fila, música
// tocando, volume, busca pendente do /search, canal de voz onde o bot está e o seu próprio stream
// de áudio (stream.js). Assim, tocar algo num servidor não mexe em nada nos outros.
//
// Tudo em memória: se o processo reiniciar, as filas zeram (aceitável — é só música).
//
// O avanço de faixa não depende de timer simulando a duração: é o próprio pipeline (onEnd) que
// avisa quando a faixa terminou de tocar de verdade.
const { postBotMessage } = require('./post');
const resolve = require('./resolve');
const embeds = require('./embeds');
const audioPipeline = require('./audioPipeline');
const stream = require('./stream');
const binaries = require('./binaries');
const realtime = require('../../realtime');
const access = require('../../access');

const PAGE_SIZE = 10;
const SEARCH_TTL_MS = 3 * 60 * 1000; // resultado de /search vale por 3 min
const ALONE_GRACE_MS = 20 * 1000;    // call vazia: espera isso antes de parar (alguém pode só ter caído)
// fila acabou: o bot fica na call esse tempo esperando outro /play antes de sair. Sem isso ele saía
// na hora, e um /play logo depois fazia ele entrar de novo (o áudio de todo mundo reconectava)
const IDLE_LEAVE_MS = 60 * 1000;
// folga mandada de uma vez quando a música começa depois de um silêncio. Pequena de propósito: os
// ouvintes já estão tocando ao vivo (o stream manda silêncio quando não tem música, ver stream.js),
// então uma folga grande só deixaria todo mundo atrasado em relação a quem entrar depois
const INITIAL_LEAD_SEC = 0.5;

const sessions = new Map(); // serverId -> sessão

function newSession(serverId) {
  return {
    serverId,
    channelId: null,      // último canal de TEXTO onde usaram um comando — é pra lá que o bot responde
    voiceChannelId: null, // canal de VOZ onde o bot está
    tracks: [],           // histórico + fila; currentIndex separa o que já tocou do que falta
    currentIndex: -1,
    volume: 100,          // 0–200%, aplicado no app de cada um (ver musicbot_volume)
    playing: false,
    paused: false,
    pipeline: null,       // controle { pause, resume, stop } da faixa atual
    pendingSearch: null,  // { channelId, results, expiresAt } do último /search
    aloneTimer: null,
    idleTimer: null,      // fila acabou: sai da call quando disparar (ver IDLE_LEAVE_MS)
    playToken: 0,         // invalida respostas atrasadas de faixas que já foram puladas
  };
}

function sessionOf(serverId) {
  let s = sessions.get(serverId);
  if (!s) { s = newSession(serverId); sessions.set(serverId, s); }
  return s;
}

// o bot só funciona em canais de servidor — a sessão vem do servidor do canal de texto
function sessionForChannel(channelId) {
  const ch = access.getChannel(channelId);
  if (!ch || ch.server_id == null) return null;
  const s = sessionOf(ch.server_id);
  s.channelId = channelId;
  return s;
}

const current = (s) => (s.currentIndex >= 0 && s.currentIndex < s.tracks.length ? s.tracks[s.currentIndex] : null);
const upcoming = (s) => s.tracks.slice(s.currentIndex + 1);

// ---------- presença do bot na call ----------

function joinVoice(s, voiceChannelId) {
  if (s.voiceChannelId === voiceChannelId) return;
  if (s.voiceChannelId != null) realtime.botLeaveVoice(s.serverId);
  s.voiceChannelId = voiceChannelId;
  realtime.botJoinVoice(s.serverId, voiceChannelId);
}

function leaveVoice(s) {
  if (s.voiceChannelId == null) return;
  s.voiceChannelId = null;
  realtime.botLeaveVoice(s.serverId);
}

// para tudo e esvazia a fila (sem mandar mensagem — quem chama decide o que dizer)
function resetSession(s) {
  s.playToken++;
  if (s.pipeline) { s.pipeline.stop(); s.pipeline = null; }
  s.tracks = [];
  s.currentIndex = -1;
  s.playing = false;
  s.paused = false;
  clearTimeout(s.aloneTimer);
  s.aloneTimer = null;
  clearTimeout(s.idleTimer);
  s.idleTimer = null;
  stream.reset(s.serverId);
  leaveVoice(s);
}

// ---------- tocar ----------

// voiceChannelId: a call de quem pediu (index.js já confirmou que é deste servidor)
async function enqueue(channelId, tracks, requestedByUser, voiceChannelId) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  s.tracks.push(...tracks);
  postBotMessage(channelId, '', embeds.addedEmbed(tracks, requestedByUser.username));
  // estava esperando na call depois da fila acabar: continua nela, sem sair e entrar de novo
  clearTimeout(s.idleTimer);
  s.idleTimer = null;
  joinVoice(s, voiceChannelId);
  if (!s.playing) {
    // nada tocando: a próxima a tocar é a PRIMEIRA que acabou de entrar. Sem isso, depois da fila
    // acabar (currentIndex fica além do fim) o playNext pulava a música nova e "não tocava nada"
    s.currentIndex = s.tracks.length - tracks.length - 1;
    await playNext(s);
  }
}

// avança pra próxima faixa e começa o áudio dela. Usado no fluxo normal (faixa acabou) e por
// /skip e /skipto, que só ajustam currentIndex antes.
async function playNext(s) {
  const token = ++s.playToken;
  if (s.pipeline) { s.pipeline.stop(); s.pipeline = null; }
  s.paused = false;
  const channelId = s.channelId;
  const nextIndex = s.currentIndex + 1;

  if (nextIndex >= s.tracks.length) {
    const hadSomething = s.playing;
    s.playing = false;
    s.currentIndex = s.tracks.length;
    stream.reset(s.serverId);
    // não sai na hora: fica na call esperando IDLE_LEAVE_MS (o stream manda silêncio enquanto isso)
    clearTimeout(s.idleTimer);
    s.idleTimer = setTimeout(() => {
      s.idleTimer = null;
      if (s.playing || s.voiceChannelId == null) return; // alguém pôs música (ou já saiu por outro motivo)
      leaveVoice(s);
    }, IDLE_LEAVE_MS);
    s.idleTimer.unref();
    if (hadSomething && channelId) postBotMessage(channelId, '', embeds.simpleEmbed('⏹️ fila acabou', 'fico na call mais 1 minuto — manda um /play se quiser mais.'));
    return;
  }

  s.currentIndex = nextIndex;
  s.playing = true;
  const track = s.tracks[nextIndex];

  let bins;
  try {
    bins = { ytdlpBin: await binaries.ensureYtDlp(), ffmpegBin: await binaries.ensureFfmpeg() };
  } catch (err) {
    // sem yt-dlp/ffmpeg nenhuma faixa toca — para tudo em vez de "pular" a fila inteira
    resetSession(s);
    if (channelId) postBotMessage(channelId, '', embeds.errorEmbed(err.message));
    return;
  }

  try {
    await resolve.ensurePlayable(track);
  } catch (err) {
    if (token !== s.playToken) return;
    if (channelId) postBotMessage(channelId, '', embeds.errorEmbed(`não consegui tocar **${track.title}** (${err.message}) — pulando.`));
    return playNext(s);
  }
  if (token !== s.playToken) return; // pularam/pararam enquanto resolvia

  if (channelId) postBotMessage(channelId, '', embeds.nowPlayingEmbed(track, s.volume));

  s.pipeline = audioPipeline.startTrack(track.youtubeUrl, {
    ...bins,
    initialLeadSec: stream.isIdle(s.serverId) ? INITIAL_LEAD_SEC : 0,
    onData: (chunk) => stream.broadcastChunk(s.serverId, chunk),
    onEnd: () => {
      if (token !== s.playToken) return;
      s.pipeline = null;
      playNext(s);
    },
    onError: (err) => {
      if (token !== s.playToken) return;
      s.pipeline = null;
      if (s.channelId) postBotMessage(s.channelId, '', embeds.errorEmbed(`não consegui tocar **${track.title}** (${err.message}) — pulando.`));
      playNext(s);
    },
  });
}

// ---------- call vazia: o bot para sozinho ----------
realtime.onVoiceLeave((channelId, userId) => {
  if (userId === realtime.BOT_USER_ID) return;
  for (const s of sessions.values()) {
    if (s.voiceChannelId !== channelId) continue;
    if (realtime.humansInChannel(channelId).length > 0) return;
    clearTimeout(s.aloneTimer);
    s.aloneTimer = setTimeout(() => {
      s.aloneTimer = null;
      if (s.voiceChannelId !== channelId || realtime.humansInChannel(channelId).length > 0) return;
      const textChannel = s.channelId;
      resetSession(s);
      if (textChannel) postBotMessage(textChannel, '', embeds.simpleEmbed('👋 todo mundo saiu da call', 'parei a música e limpei a fila.'));
    }, ALONE_GRACE_MS);
  }
});

// ---------- comandos ----------

function stop(channelId) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const hadSomething = s.playing || s.tracks.length > 0;
  resetSession(s);
  postBotMessage(channelId, '', hadSomething
    ? embeds.simpleEmbed('⏹️ parei', 'limpei a fila inteira.')
    : embeds.simpleEmbed('⏹️ nada tocando', 'não tinha nada tocando.'));
}

function shuffle(channelId) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const rest = upcoming(s);
  if (rest.length < 2) {
    postBotMessage(channelId, '', embeds.errorEmbed('não tem música suficiente na fila pra embaralhar.'));
    return;
  }
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  s.tracks.splice(s.currentIndex + 1, rest.length, ...rest);
  postBotMessage(channelId, '', embeds.simpleEmbed('🔀 fila embaralhada', null));
}

// o volume é aplicado no app de cada um (instantâneo, sem reiniciar o ffmpeg) — o evento avisa
// só quem está neste servidor
function setVolume(channelId, raw) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 200) {
    postBotMessage(channelId, '', embeds.errorEmbed('uso: `/volume 0-200`'));
    return;
  }
  s.volume = Math.round(v);
  realtime.broadcastToServer(s.serverId, { type: 'musicbot_volume', serverId: s.serverId, volume: s.volume });
  postBotMessage(channelId, '', embeds.simpleEmbed('🔊 volume ajustado', `${s.volume}%`));
}

// /queue <página> — lista paginada
function list(channelId, pageArg) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const cur = current(s);
  const rest = upcoming(s);
  if (!cur && !rest.length) {
    postBotMessage(channelId, '', embeds.simpleEmbed('📜 fila de reprodução', 'vazia. manda `/play <link ou nome>` pra começar.'));
    return;
  }
  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  let page = Number(pageArg);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  const startIndex = (page - 1) * PAGE_SIZE;
  postBotMessage(channelId, '', embeds.queueEmbed({
    current: cur, shown: rest.slice(startIndex, startIndex + PAGE_SIZE), startIndex, totalUpcoming: rest.length, page, totalPages,
  }));
}

// /queue clear — limpa o que vem depois (a atual continua)
function clearQueue(channelId) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const removed = upcoming(s).length;
  s.tracks.length = s.currentIndex + 1;
  postBotMessage(channelId, '', embeds.queueClearedEmbed(removed));
}

function skip(channelId) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const cur = current(s);
  if (!s.playing || !cur) {
    postBotMessage(channelId, '', embeds.errorEmbed('nada tocando pra pular.'));
    return;
  }
  postBotMessage(channelId, '', embeds.skippedEmbed(cur));
  playNext(s);
}

// /skipto <n> — posição n da lista "a seguir" (mesma numeração do /queue)
async function skipTo(channelId, posArg) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const rest = upcoming(s);
  const n = Number(posArg);
  if (!s.playing && !rest.length) {
    postBotMessage(channelId, '', embeds.errorEmbed('nada tocando e a fila tá vazia.'));
    return;
  }
  if (!Number.isInteger(n) || n < 1 || n > rest.length) {
    postBotMessage(channelId, '', embeds.errorEmbed(
      rest.length ? `uso: \`/skipto <número>\` (1 a ${rest.length})` : 'não tem próxima música na fila pra pular pra ela.'
    ));
    return;
  }
  postBotMessage(channelId, '', embeds.skipToEmbed(rest[n - 1], n));
  s.currentIndex = s.currentIndex + n - 1; // playNext soma +1 e cai exatamente no alvo
  await playNext(s);
}

function pause(channelId) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const cur = current(s);
  if (!s.playing || !cur || !s.pipeline) {
    postBotMessage(channelId, '', embeds.errorEmbed('nada tocando pra pausar.'));
    return;
  }
  if (s.paused) {
    s.paused = false;
    s.pipeline.resume();
    postBotMessage(channelId, '', embeds.resumedEmbed(cur));
  } else {
    s.paused = true;
    s.pipeline.pause();
    postBotMessage(channelId, '', embeds.pausedEmbed(cur));
  }
}

// /search <termo> — top 5 do youtube, guardado pra /play <número> escolher
async function search(channelId, query, requestedByUser) {
  const s = sessionForChannel(channelId);
  if (!s) return;
  const results = await resolve.searchYoutubeMulti(query, 5, requestedByUser.username);
  s.pendingSearch = { channelId, results, expiresAt: Date.now() + SEARCH_TTL_MS };
  postBotMessage(channelId, '', embeds.searchResultsEmbed(results, query));
}

function hasPendingSearchResult(channelId, n) {
  const s = sessionForChannel(channelId);
  const p = s && s.pendingSearch;
  return !!p && p.channelId === channelId && Date.now() < p.expiresAt
    && Number.isInteger(n) && n >= 1 && n <= p.results.length;
}

function takePendingSearchResult(channelId, n, requestedBy) {
  const s = sessionForChannel(channelId);
  const track = { ...s.pendingSearch.results[n - 1], requestedBy };
  s.pendingSearch = null;
  return track;
}

// ---------- consultas (rotas / index.js) ----------

// em qual canal de voz o bot está tocando neste servidor (null = em nenhum)
function botVoiceChannel(serverId) {
  const s = sessions.get(serverId);
  return s && s.playing ? s.voiceChannelId : null;
}

function snapshot(serverId) {
  const s = sessions.get(serverId) || newSession(serverId);
  const cur = current(s);
  return {
    playing: s.playing,
    paused: s.paused,
    volume: s.volume,
    track: cur ? { title: cur.title, artist: cur.artist, thumbnail: cur.thumbnail } : null,
  };
}

module.exports = {
  enqueue, stop, shuffle, setVolume, list, clearQueue,
  skip, skipTo, pause,
  search, hasPendingSearchResult, takePendingSearchResult,
  botVoiceChannel, snapshot,
};
