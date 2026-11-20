// Todo upload passa aqui ANTES do express.static: não confundir URL aleatória com autorização.
const path = require('path');
const db = require('../db');
const access = require('../access');
const { requireAuth } = require('../middleware/auth');
const { UPLOADS_ROOT } = require('../upload');
const INLINE_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg',
};
module.exports = function serveUpload(req, res, next) {
  let url;
  try { url = path.posix.normalize(decodeURIComponent(req.path)); }
  catch (_) { return res.sendStatus(400); }
  if (url !== '/uploads' && !url.startsWith('/uploads/')) return next();
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin' });
  if (!['GET', 'HEAD'].includes(req.method)) return res.sendStatus(405);
  const match = /^\/uploads\/(attachments|avatars|banners|server|themes|decor|sounds)\/([a-f0-9]{32}(?:\.[a-z0-9]{1,10})?)$/.exec(url);
  if (!match) return res.sendStatus(404); // nunca cai no static público
  const [, folder, filename] = match;
  const send = () => {
    const type = INLINE_TYPES[path.extname(filename)];
    if (!type) res.attachment(filename);
    res.type(type || 'application/octet-stream');
    // sendFile preserva Range/HEAD para vídeos, mas não pode cachear dados privados.
    res.sendFile(path.join(folder, filename), { root: UPLOADS_ROOT, cacheControl: false, dotfiles: 'deny' }, err => {
      if (!err) return;
      if (res.headersSent) return res.destroy();
      res.sendStatus(err.statusCode === 404 ? 404 : 500);
    });
  };
  if (folder !== 'attachments') {
    // avatar, banner, tema, som...: públicos e o nome é aleatório (arquivo novo = nome novo), então o
    // navegador pode guardar. Sem isso o GIF do avatar era baixado INTEIRO de novo toda vez que
    // voltava a animar (decor-catalog.js troca o quadro parado pelo GIF) — e cancelado no meio se o
    // mouse saía antes: "GIF que não toca". 'private' = só o navegador guarda, não a Cloudflare.
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    return send(); // imagens de perfil e sons continuam funcionando
  }
  requireAuth(req, res, () => {
    const rows = db.prepare('SELECT channel_id FROM messages WHERE attachment_url = ?').all(url);
    if (!rows.some(row => access.canAccessChannel(row.channel_id, req.user.id))) return res.sendStatus(404);
    send();
  });
};
