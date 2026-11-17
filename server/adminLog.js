// Registro do que o admin do site fez (suspender, apagar servidor, denúncias…), pra página /admin.
const db = require('./db');

function record(req, action, { type = null, id = null, name = null, details = null } = {}) {
  try {
    db.prepare(`INSERT INTO site_admin_log (admin_id, action, target_type, target_id, target_name, details)
      VALUES (?, ?, ?, ?, ?, ?)`).run(req.user ? req.user.id : null, action, type, id, name ? String(name).slice(0, 100) : null,
      details ? String(details).slice(0, 500) : null);
  } catch (err) {
    console.warn('[admin] não deu pra registrar a ação:', err.message);
  }
}

function list(limit = 300) {
  return db.prepare(`SELECT l.*, u.username AS admin FROM site_admin_log l LEFT JOIN users u ON u.id = l.admin_id
    ORDER BY l.id DESC LIMIT ?`).all(limit);
}

module.exports = { record, list };
