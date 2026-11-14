// prévia de links: o site manda o link, o servidor busca a página e devolve título, descrição,
// imagem e (pra YouTube) o id do vídeo. Buscar daqui (e não do navegador) evita bloqueio de CORS e
// deixa guardar em cache — o mesmo link mandado por várias pessoas só é buscado uma vez.
const express = require('express');
const dns = require('dns').promises;
const net = require('net');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 800;
const MAX_HTML_BYTES = 1024 * 1024;
const TIMEOUT_MS = 6000;
// muitos sites só mandam as tags de prévia (og:*) pra robôs conhecidos de chat
const USER_AGENT = 'Mozilla/5.0 (compatible; dusky/1.0; +https://dusky.veneno.space; like Discordbot/2.0)';

const cache = new Map(); // url -> { at, data }
const inflight = new Map(); // url -> Promise

function cacheGet(url) {
  const hit = cache.get(url);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(url); return undefined; }
  return hit.data;
}
function cacheSet(url, data) {
  cache.set(url, { at: Date.now(), data });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// não deixa o servidor ser usado pra espiar a rede de casa (roteador, localhost, etc.)
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublicUrl(url) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocolo não suportado');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('endereço não permitido');
}

// fetch seguindo no máximo 4 redirecionamentos, conferindo cada destino
async function safeFetch(url, opts = {}) {
  let current = url;
  for (let i = 0; i < 5; i++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', ...(opts.headers || {}) },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error('redirecionamentos demais');
}

async function readLimited(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    // as tags de prévia ficam no <head>: chegou no <body>, já dá
    if (/<body[\s>]/i.test(Buffer.from(value).toString('latin1'))) break;
  }
  try { await reader.cancel(); } catch (_) { /* já terminou */ }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, max);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function parseMeta(html) {
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const content = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (key && content != null && !(key.toLowerCase() in meta)) meta[key.toLowerCase()] = decodeEntities(content).trim();
  }
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  if (title) meta._title = decodeEntities(title).replace(/\s+/g, ' ').trim();
  return meta;
}

const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || null);

function youtubeId(u) {
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
    return m ? m[1] : null;
  }
  return null;
}

async function youtubeEmbed(url, id) {
  let info = {};
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.ok) info = await r.json();
  } catch (_) { /* sem título, só a miniatura */ }
  const start = (() => {
    const t = new URL(url).searchParams.get('t');
    if (!t) return 0;
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
  })();
  return {
    type: 'youtube', url, video_id: id, start,
    title: clip(info.title, 200), author: clip(info.author_name, 100), site: 'YouTube', color: '#ff0033',
    image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

// X/Twitter não mostra prévia pra robôs: o FxTwitter (serviço aberto) devolve o post em JSON
async function tweetEmbed(url, u) {
  const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!m) return null;
  const r = await fetch(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) return null;
  const { tweet } = await r.json();
  if (!tweet) return null;
  const photo = tweet.media && tweet.media.photos && tweet.media.photos[0];
  const video = tweet.media && tweet.media.videos && tweet.media.videos[0];
  return {
    type: 'link', url, site: 'X', color: '#1d9bf0',
    title: clip(`${tweet.author.name} (@${tweet.author.screen_name})`, 200),
    description: clip(tweet.text, 600),
    image: photo ? photo.url : (video ? video.thumbnail_url : null),
    large_image: !!(photo || video),
  };
}

async function buildEmbed(url) {
  const u = new URL(url);
  const ytId = youtubeId(u);
  if (ytId && /^[\w-]{6,20}$/.test(ytId)) return youtubeEmbed(url, ytId);
  const host = u.hostname.replace(/^www\./, '');
  if (['x.com', 'twitter.com', 'mobile.twitter.com', 'fxtwitter.com', 'vxtwitter.com'].includes(host)) {
    const t = await tweetEmbed(url, u).catch(() => null);
    if (t) return t;
  }

  const { res, finalUrl } = await safeFetch(url);
  if (!res.ok) { try { await res.body?.cancel(); } catch (_) {} return null; }
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type.startsWith('image/')) { try { await res.body?.cancel(); } catch (_) {} return { type: 'image', url, image: finalUrl }; }
  if (type.startsWith('video/')) { try { await res.body?.cancel(); } catch (_) {} return { type: 'video', url, video: finalUrl }; }
  if (!type.includes('html')) { try { await res.body?.cancel(); } catch (_) {} return null; }

  const html = (await readLimited(res, MAX_HTML_BYTES)).toString('utf8');
  const meta = parseMeta(html);
  const title = meta['og:title'] || meta['twitter:title'] || meta._title;
  const description = meta['og:description'] || meta['twitter:description'] || meta.description;
  let image = meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'];
  if (image) { try { image = new URL(image, finalUrl).href; } catch (_) { image = null; } }
  if (!title && !description && !image) return null;
  const card = meta['twitter:card'] || '';
  return {
    type: 'link', url,
    site: clip(meta['og:site_name'] || new URL(finalUrl).hostname.replace(/^www\./, ''), 80),
    title: clip(title, 200),
    description: clip(description, 400),
    image: image && /^https:\/\//.test(image) ? image : null,
    large_image: card === 'summary_large_image' || !!meta['og:image:width'] && Number(meta['og:image:width']) >= 400,
    color: /^#[0-9a-f]{6}$/i.test(meta['theme-color'] || '') ? meta['theme-color'] : null,
  };
}

// GET /api/embed?url=... -> { embed: {...} | null }
router.get('/', requireAuth, async (req, res) => {
  let url;
  try {
    url = new URL(String(req.query.url || '')).href;
    if (!/^https?:/.test(url) || url.length > 2000) throw new Error();
  } catch (_) {
    return res.status(400).json({ error: 'link inválido' });
  }
  const cached = cacheGet(url);
  if (cached !== undefined) return res.json({ embed: cached });
  if (!inflight.has(url)) {
    inflight.set(url, buildEmbed(url).catch(() => null).then((data) => {
      cacheSet(url, data);
      inflight.delete(url);
      return data;
    }));
  }
  res.json({ embed: await inflight.get(url) });
});

module.exports = router;
