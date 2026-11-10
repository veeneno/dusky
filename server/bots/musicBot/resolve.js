// resolve o que a pessoa mandou no /play (link do youtube, link/playlist do spotify, ou só um
// nome de música) numa lista de "faixas" tocáveis.
//
// IMPORTANTE sobre o Spotify: a API pública do Spotify não expõe áudio pra terceiros — só dá
// metadado (nome, artista, duração, capa). Então pra links do Spotify a gente só usa a API pra
// pegar o metadado da(s) faixa(s); o áudio de verdade sempre vem do YouTube. Pra não travar um
// /play de uma playlist de 80 músicas fazendo 80 buscas no YouTube na hora, a busca por vídeo
// equivalente é feita sob demanda, só quando a faixa está prestes a tocar (ver `ensurePlayable`,
// chamado pelo queue.js dentro de `playNext`).
const { execFile } = require('child_process');
const config = require('../../config');
const binaries = require('./binaries');

async function runYtDlp(args, { timeoutMs = 30000 } = {}) {
  const bin = await binaries.ensureYtDlp();
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || '').trim().split('\n').pop() || err.message;
        return reject(new Error(msg.slice(0, 300)));
      }
      resolve(stdout);
    });
  });
}

// yt-dlp com --dump-json manda um objeto JSON por linha (uma linha por vídeo, no caso de listas)
function parseJsonLines(stdout) {
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
    .filter(Boolean);
}

function formatDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return '??:??';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function trackFromYtInfo(info, requestedBy) {
  const thumb = info.thumbnail
    || (Array.isArray(info.thumbnails) && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : null);
  return {
    title: info.title || 'sem título',
    artist: info.uploader || info.channel || null,
    durationSec: typeof info.duration === 'number' ? info.duration : null,
    thumbnail: thumb,
    youtubeUrl: info.webpage_url || (info.id ? `https://www.youtube.com/watch?v=${info.id}` : null),
    source: 'youtube',
    requestedBy,
  };
}

async function searchYoutube(query, requestedBy) {
  const stdout = await runYtDlp(
    ['--dump-json', '--no-warnings', '--skip-download', '--default-search', 'ytsearch1', query],
    { timeoutMs: 20000 }
  );
  const [info] = parseJsonLines(stdout);
  if (!info) throw new Error(`nada encontrado no youtube pra "${query}"`);
  return trackFromYtInfo(info, requestedBy);
}

// igual searchYoutube, mas devolve os `limit` primeiros resultados em vez de só o topo — usado
// pelo /search, que mostra uma lista numerada (tipo os bots de música clássicos do Discord) pra
// pessoa escolher qual tocar com /play <número>, em vez de confiar cegamente no resultado 1
async function searchYoutubeMulti(query, limit, requestedBy) {
  const stdout = await runYtDlp(
    ['--dump-json', '--no-warnings', '--skip-download', '--default-search', `ytsearch${limit}`, query],
    { timeoutMs: 30000 }
  );
  const infos = parseJsonLines(stdout);
  if (!infos.length) throw new Error(`nada encontrado no youtube pra "${query}"`);
  return infos.map((info) => trackFromYtInfo(info, requestedBy));
}

// sugestões pro autocompletar do /play (enquanto a pessoa digita). Usa --flat-playlist, que lê só
// a página de resultados da busca (sem abrir cada vídeo) — bem mais rápido que searchYoutubeMulti.
// Guarda em cache por 10 min: digitar, apagar e digitar de novo não repete a busca.
const suggestCache = new Map(); // query normalizada -> { at, results }
const suggestInFlight = new Map(); // query normalizada -> Promise (pedidos iguais simultâneos viram 1)
const SUGGEST_TTL_MS = 10 * 60 * 1000;

async function suggestYoutube(query, limit = 5) {
  const key = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return [];
  const cached = suggestCache.get(key);
  if (cached && Date.now() - cached.at < SUGGEST_TTL_MS) return cached.results;
  if (suggestInFlight.has(key)) return suggestInFlight.get(key);

  const job = (async () => {
    const stdout = await runYtDlp(
      ['--flat-playlist', '--dump-single-json', '--no-warnings', `ytsearch${limit}:${query}`],
      { timeoutMs: 20000 }
    );
    let data = null;
    try { data = JSON.parse(stdout); } catch (_) { /* resposta inesperada */ }
    const results = ((data && data.entries) || []).filter((e) => e && e.id).slice(0, limit).map((e) => ({
      title: e.title || 'sem título',
      artist: e.channel || e.uploader || null,
      durationSec: typeof e.duration === 'number' ? e.duration : null,
      duration: typeof e.duration === 'number' ? formatDuration(e.duration) : null,
      url: `https://www.youtube.com/watch?v=${e.id}`,
      thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
    }));
    suggestCache.set(key, { at: Date.now(), results });
    if (suggestCache.size > 300) suggestCache.delete(suggestCache.keys().next().value); // não cresce pra sempre
    return results;
  })().finally(() => suggestInFlight.delete(key));

  suggestInFlight.set(key, job);
  return job;
}

const YT_PLAYLIST_RE = /[?&]list=([a-zA-Z0-9_-]+)/;
const YT_VIDEO_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([a-zA-Z0-9_-]{6,})/;

async function resolveYoutubeUrl(url, requestedBy) {
  if (YT_PLAYLIST_RE.test(url)) {
    // --flat-playlist é rápido (não abre cada vídeo individualmente), mas às vezes vem sem
    // duração — nesse caso a faixa mostra "??:??" até tocar de verdade
    const stdout = await runYtDlp(
      ['--flat-playlist', '--dump-json', '--no-warnings', url],
      { timeoutMs: 45000 }
    );
    const entries = parseJsonLines(stdout);
    if (!entries.length) throw new Error('playlist vazia ou inválida');
    return entries.map((e) => ({
      title: e.title || 'sem título',
      artist: e.uploader || e.channel || null,
      durationSec: typeof e.duration === 'number' ? e.duration : null,
      thumbnail: Array.isArray(e.thumbnails) && e.thumbnails.length ? e.thumbnails[e.thumbnails.length - 1].url : null,
      youtubeUrl: e.url && e.url.startsWith('http') ? e.url : (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null),
      source: 'youtube',
      requestedBy,
    }));
  }

  const stdout = await runYtDlp(
    ['--dump-json', '--no-warnings', '--no-playlist', url],
    { timeoutMs: 20000 }
  );
  const [info] = parseJsonLines(stdout);
  if (!info) throw new Error('não consegui ler esse link do youtube');
  return [trackFromYtInfo(info, requestedBy)];
}

// ---------- spotify ----------
let spotifyTokenCache = { token: null, expiresAt: 0 };

async function getSpotifyToken() {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    throw new Error('spotify não configurado (faltam SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET no .env)');
  }
  if (spotifyTokenCache.token && Date.now() < spotifyTokenCache.expiresAt) return spotifyTokenCache.token;

  const basic = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`falha ao autenticar no spotify (${res.status})`);
  const data = await res.json();
  spotifyTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return spotifyTokenCache.token;
}

async function spotifyFetch(path) {
  const token = await getSpotifyToken();
  const url = path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`spotify api erro ${res.status} em ${path}`);
  return res.json();
}

const SPOTIFY_RE = /open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/;

function spotifyTrackToPending(t, images, requestedBy) {
  const artists = (t.artists || []).map((a) => a.name).join(', ');
  return {
    title: t.name,
    artist: artists,
    durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
    thumbnail: (t.album && t.album.images && t.album.images[0] && t.album.images[0].url) || (images && images[0] && images[0].url) || null,
    youtubeUrl: null, // resolvido sob demanda em ensurePlayable()
    source: 'spotify',
    spotifyQuery: `${t.name} ${artists}`,
    requestedBy,
  };
}

async function resolveSpotifyUrl(url, requestedBy) {
  const m = SPOTIFY_RE.exec(url);
  if (!m) throw new Error('link do spotify não reconhecido');
  const [, kind, id] = m;

  if (kind === 'track') {
    const t = await spotifyFetch(`/tracks/${id}`);
    return [spotifyTrackToPending(t, null, requestedBy)];
  }

  if (kind === 'album') {
    const album = await spotifyFetch(`/albums/${id}`);
    const items = album.tracks?.items || [];
    if (!items.length) throw new Error('álbum do spotify vazio');
    return items.map((t) => spotifyTrackToPending(t, album.images, requestedBy));
  }

  // playlist — pagina até 300 faixas (3 páginas de 100), evita loop infinito numa playlist gigante
  let items = [];
  let next = `/playlists/${id}/tracks?limit=100`;
  let guard = 0;
  while (next && guard < 3) {
    const page = await spotifyFetch(next);
    items = items.concat((page.items || []).map((i) => i.track).filter(Boolean));
    next = page.next || null;
    guard++;
  }
  if (!items.length) throw new Error('playlist do spotify vazia ou privada');
  return items.map((t) => spotifyTrackToPending(t, null, requestedBy));
}

// resolve uma faixa vinda do spotify pro vídeo equivalente no youtube — chamado só na hora de
// tocar (não no /play), pra não travar playlists grandes fazendo dezenas de buscas de uma vez
async function ensurePlayable(track) {
  if (track.youtubeUrl) return track;
  if (track.source === 'spotify') {
    const found = await searchYoutube(track.spotifyQuery, track.requestedBy);
    track.youtubeUrl = found.youtubeUrl;
    if (!track.durationSec) track.durationSec = found.durationSec;
    if (!track.thumbnail) track.thumbnail = found.thumbnail;
    return track;
  }
  throw new Error('faixa sem fonte de áudio');
}

async function resolveInput(input, requestedBy) {
  const trimmed = input.trim();
  if (SPOTIFY_RE.test(trimmed)) return resolveSpotifyUrl(trimmed, requestedBy);
  if (YT_VIDEO_RE.test(trimmed) || YT_PLAYLIST_RE.test(trimmed)) return resolveYoutubeUrl(trimmed, requestedBy);
  if (/^https?:\/\//i.test(trimmed)) throw new Error('só entendo links do youtube ou do spotify por enquanto');
  return [await searchYoutube(trimmed, requestedBy)];
}

module.exports = { resolveInput, ensurePlayable, searchYoutube, searchYoutubeMulti, suggestYoutube, formatDuration };
