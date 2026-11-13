// registro de auditoria: quem fez o quê em cada servidor (aba "registro de auditoria" das
// configurações do servidor). As rotas chamam log() depois que a ação deu certo. Guarda só nomes e
// ids — nada de conteúdo de mensagem — e apaga sozinho o que passou de AUDIT_DAYS dias.
const db = require('./db');

const AUDIT_DAYS = 90;

// ações conhecidas (o front-end mostra um texto pra cada uma, ver 25-server-settings.js)
const ACTIONS = new Set([
  'server_update', 'server_icon', 'server_banner', 'everyone_permissions',
  'channel_create', 'channel_update', 'channel_delete',
  'category_create', 'category_update', 'category_delete',
  'role_create', 'role_update', 'role_delete', 'member_roles',
  'member_kick', 'member_ban', 'member_unban',
  'invite_create', 'invite_delete',
  'voice_disconnect', 'voice_move',
  'sound_create', 'sound_update', 'sound_delete',
  'message_delete',
]);

let insertsSinceCleanup = 0;

// actorId: quem fez; target: { type, id, name } (opcional); details: objeto pequeno (opcional)
function log(serverId, actorId, action, target, details) {
  if (!serverId || !ACTIONS.has(action)) return;
  try {
    db.prepare(`
      INSERT INTO audit_log (server_id, actor_id, action, target_type, target_id, target_name, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      serverId, actorId || null, action,
      target ? target.type || null : null,
      target && Number.isFinite(Number(target.id)) ? Number(target.id) : null,
      target && target.name != null ? String(target.name).slice(0, 100) : null,
      details && Object.keys(details).length ? JSON.stringify(details).slice(0, 2000) : null,
    );
    if (++insertsSinceCleanup >= 200) {
      insertsSinceCleanup = 0;
      db.prepare(`DELETE FROM audit_log WHERE created_at < datetime('now', ?)`).run(`-${AUDIT_DAYS} days`);
    }
  } catch (err) {
    // registro nunca derruba a ação que já aconteceu
    console.error('[audit] não deu pra registrar:', err.message);
  }
}

// página do registro, do mais novo pro mais antigo. before = id (paginação), action/actorId = filtros
function list(serverId, { before, action, actorId, limit } = {}) {
  const where = ['a.server_id = ?'];
  const vals = [serverId];
  if (Number(before) > 0) { where.push('a.id < ?'); vals.push(Number(before)); }
  if (action && ACTIONS.has(action)) { where.push('a.action = ?'); vals.push(action); }
  if (Number(actorId) > 0) { where.push('a.actor_id = ?'); vals.push(Number(actorId)); }
  const n = Math.min(100, Math.max(1, Number(limit) || 50));
  const rows = db.prepare(`
    SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.target_name, a.details_json, a.created_at,
           u.username AS actor_username, u.avatar_url AS actor_avatar_url
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
    WHERE ${where.join(' AND ')}
    ORDER BY a.id DESC LIMIT ?
  `).all(...vals, n + 1);
  const hasMore = rows.length > n;
  return {
    entries: rows.slice(0, n).map(({ details_json, ...r }) => {
      let details = null;
      try { details = details_json ? JSON.parse(details_json) : null; } catch (_) { details = null; }
      return { ...r, details };
    }),
    has_more: hasMore,
  };
}

module.exports = { log, list, ACTIONS: [...ACTIONS] };
