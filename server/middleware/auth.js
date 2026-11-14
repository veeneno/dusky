const db = require('../db');

/**
 * Middleware que exige login. Se autenticado, popula req.user
 * (sem o hash da senha, óbvio) e deixa passar.
 */
function requireAuth(req, res, next) {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'não autenticado' });
  }

  const row = db.prepare(
    'SELECT id, username, avatar_url, banner_url, accent_color, accent_color_2, name_style, bio, status_text, presence_status, created_at, is_site_admin, banned_at, ban_reason, session_version FROM users WHERE id = ?'
  ).get(userId);

  if (!row) {
    // sessão aponta pra um usuário que não existe mais
    req.session = null;
    return res.status(401).json({ error: 'não autenticado' });
  }

  // conta suspensa pelo admin do site: cai na hora, em qualquer pedido
  if (row.banned_at) {
    req.session = null;
    return res.status(403).json({ error: row.ban_reason ? `sua conta foi suspensa: ${row.ban_reason}` : 'sua conta foi suspensa', suspended: true });
  }
  // senha redefinida (ou conta suspensa): sessões abertas antes disso não valem mais
  if ((req.session.sv || 0) !== (row.session_version || 0)) {
    req.session = null;
    return res.status(401).json({ error: 'sua sessão expirou — entre de novo' });
  }

  const { banned_at, ban_reason, session_version, is_site_admin, ...user } = row;
  req.user = { ...user, is_site_admin: !!is_site_admin };
  next();
}

module.exports = { requireAuth };
