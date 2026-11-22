// Excluir conta (LGPD): os dados pessoais somem e a conta vira "conta excluída N".
// A linha em `users` continua existindo só porque mensagens, canais e servidores apontam pra ela;
// nome, e-mail, senha, fotos, bio, tema, 2 etapas, sessões e notificações são apagados.
// Com deleteMessages, as mensagens (e os anexos) que a pessoa mandou também são apagadas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('./db');
const realtime = require('./realtime');
const access = require('./access');
const { stripPrivate } = require('./userPrivate');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_URL = /^\/uploads\/[a-z]+\/[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/;
const DELETED_NAME = /^conta exclu[ií]da/i;

function deletedName(id) {
  return `conta excluída ${id}`;
}

// todas as /uploads/... que aparecem num valor (texto puro ou JSON de tema/decoração)
function uploadUrlsIn(value) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      if (UPLOAD_URL.test(v)) out.add(v);
      else if (v.includes('/uploads/')) { try { walk(JSON.parse(v)); } catch (_) { /* texto comum */ } }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}

// apaga o arquivo só se mais ninguém usa (tema importado por outra pessoa, mensagem encaminhada…)
function unlinkIfUnused(url, userId) {
  if (!UPLOAD_URL.test(url)) return;
  const like = `%${url}%`;
  const used = db.prepare(`
    SELECT 1 FROM users WHERE id != ? AND (avatar_url = ? OR banner_url = ? OR theme_json LIKE ?
      OR nameplate LIKE ? OR avatar_deco LIKE ? OR profile_fx LIKE ?)
    UNION ALL SELECT 1 FROM messages WHERE attachment_url = ?
    UNION ALL SELECT 1 FROM servers WHERE icon_url = ? OR banner_url = ?
    LIMIT 1`).get(userId, url, url, like, like, like, like, url, url, url);
  if (!used) fs.unlink(path.join(PUBLIC_DIR, url), () => {});
}

function deleteAccount(user, { deleteMessages = false } = {}) {
  const related = access.relatedUserIds(user.id).filter((id) => id !== user.id);
  const serverIds = db.prepare('SELECT server_id FROM server_members WHERE user_id = ?').all(user.id).map((r) => r.server_id);
  const files = new Set();
  for (const v of [user.avatar_url, user.banner_url, user.theme_json, user.nameplate, user.avatar_deco, user.profile_fx]) {
    for (const u of uploadUrlsIn(v)) files.add(u);
  }

  realtime.disconnectUser(user.id); // sai da call, se estiver
  for (const sid of serverIds) realtime.kickFromServerVoice(sid, user.id);

  // senha que ninguém sabe (nem a pessoa): a conta não entra mais de jeito nenhum
  const lockedHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 4);
  let removedMessages = [];
  db.transaction(() => {
    if (deleteMessages) {
      removedMessages = db.prepare('SELECT id, channel_id, attachment_url FROM messages WHERE user_id = ?').all(user.id);
      db.prepare('DELETE FROM messages WHERE user_id = ?').run(user.id);
    }
    for (const t of ['server_members', 'member_roles', 'push_subscriptions', 'auth_codes', 'channel_reads', 'message_reactions', 'voice_state', 'user_blocks']) {
      db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(user.id);
    }
    db.prepare(`UPDATE users SET
        username = ?, password_hash = ?, avatar_url = NULL, banner_url = NULL, accent_color = NULL,
        accent_color_2 = NULL, bio = NULL, status_text = NULL, theme_json = NULL, name_style = NULL,
        nameplate = NULL, avatar_deco = NULL, profile_fx = NULL, email = NULL, email_pending = NULL,
        email_verified_at = NULL, totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = 0,
        totp_last_step = NULL, twofa_email = 0, recovery_codes = NULL, upload_max_mb = NULL,
        upload_quota_mb = NULL, session_version = COALESCE(session_version, 0) + 1,
        deleted_at = datetime('now')
      WHERE id = ?`).run(deletedName(user.id), lockedHash, user.id);
  })();

  for (const m of removedMessages) if (m.attachment_url) files.add(m.attachment_url);
  for (const url of files) unlinkIfUnused(url, user.id);

  realtime.dropUserConnections(user.id, { type: 'account_deleted' });
  for (const sid of serverIds) realtime.broadcastToServer(sid, { type: 'member_left', serverId: sid, userId: user.id });
  for (const m of removedMessages.slice(0, 5000)) {
    realtime.broadcastToChannel(m.channel_id, { type: 'message_deleted', channelId: m.channel_id, messageId: m.id });
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (related.length) realtime.sendToUsers(related, { type: 'profile_updated', user: stripPrivate(row) });
  return { removedMessages: removedMessages.length };
}

module.exports = { deleteAccount, deletedName, DELETED_NAME, unlinkIfUnused };
