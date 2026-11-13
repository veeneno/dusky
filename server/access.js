// regras de acesso centralizadas: quem pode ver qual canal/servidor, e pra quem cada evento em
// tempo real deve ser entregue. Tudo que decide "essa pessoa pode ver isso?" passa por aqui, pra
// não ficar espalhado (e inconsistente) entre as rotas e o realtime.js.
const db = require('./db');

// colunas públicas de um usuário (nunca inclui password_hash)
const PUBLIC_USER_COLUMNS = 'id, username, avatar_url, banner_url, accent_color, accent_color_2, bio, status_text, created_at';

function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

function getUser(userId) {
  return db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(userId);
}

// colunas públicas de um servidor (o que vai pros membros no server_updated). As permissões do
// @everyone vão como objeto em `everyone_permissions`.
const SERVER_COLUMNS = 'id, name, icon_url, owner_id, created_at, banner_url, description, system_channel_id, system_welcome, afk_channel_id, afk_timeout, join_role_id, everyone_permissions_json';

function getServer(serverId) {
  const row = db.prepare(`SELECT ${SERVER_COLUMNS} FROM servers WHERE id = ?`).get(serverId);
  if (!row) return row;
  const { everyone_permissions_json, ...rest } = row;
  return { ...rest, system_welcome: !!rest.system_welcome, everyone_permissions: everyonePermissions(everyone_permissions_json) };
}

function isServerMember(serverId, userId) {
  return !!db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
}

function isBanned(serverId, userId) {
  return !!db.prepare('SELECT 1 FROM server_bans WHERE server_id = ? AND user_id = ?').get(serverId, userId);
}

function serverMemberIds(serverId) {
  return db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(serverId).map((r) => r.user_id);
}

function getChannel(channelId) {
  return db.prepare('SELECT id, name, type, position, server_id, category_id, world_scene, private_view, private_connect, private_send, private_attach, private_react, private_pin FROM channels WHERE id = ?').get(channelId);
}

// ------------------------------------------------------------------
// cargos
// ------------------------------------------------------------------

function memberRoleIds(serverId, userId) {
  return db.prepare('SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?').all(serverId, userId).map((r) => r.role_id);
}

// dono do servidor ou alguém com um cargo de administrador
function isServerAdmin(serverId, userId) {
  const server = getServer(serverId);
  if (!server) return false;
  if (server.owner_id === userId) return true;
  return !!db.prepare(`
    SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id
    WHERE mr.server_id = ? AND mr.user_id = ? AND r.is_admin = 1 LIMIT 1
  `).get(serverId, userId);
}

// permissões que um cargo (ou o @everyone) pode dar. Administrador tem todas.
//   manage_server       editar perfil do servidor, mensagens do sistema, AFK e convites
//   view_audit_log      ver o registro de auditoria
//   ban_members         banir e desbanir
//   manage_soundboard   adicionar, editar e apagar sons do soundboard
//   use_soundboard      tocar sons numa call deste servidor
//   use_external_sounds tocar, numa call deste servidor, sons de OUTROS servidores
const SERVER_PERMISSIONS = [
  'manage_server', 'manage_channels', 'manage_messages', 'kick_members', 'ban_members',
  'moderate_voice', 'view_audit_log', 'manage_soundboard', 'use_soundboard', 'use_external_sounds',
];

// lê o JSON das permissões do @everyone, só com as chaves conhecidas
function everyonePermissions(json) {
  let grants = {};
  try { grants = JSON.parse(json || '{}') || {}; } catch (_) { grants = {}; }
  return Object.fromEntries(SERVER_PERMISSIONS.map((k) => [k, grants[k] === true]));
}

function serverPermissions(serverId, userId) {
  const result = Object.fromEntries(SERVER_PERMISSIONS.map(k => [k, false]));
  if (!isServerMember(serverId, userId)) return result;
  if (isServerAdmin(serverId, userId)) return Object.fromEntries(SERVER_PERMISSIONS.map(k => [k, true]));
  // base: o que todo membro pode (@everyone); os cargos da pessoa só acrescentam
  const base = db.prepare('SELECT everyone_permissions_json FROM servers WHERE id = ?').get(serverId);
  Object.assign(result, everyonePermissions(base && base.everyone_permissions_json));
  const roles = db.prepare(`SELECT r.permissions_json FROM roles r JOIN member_roles mr ON mr.role_id = r.id
    WHERE mr.server_id = ? AND mr.user_id = ?`).all(serverId, userId);
  for (const role of roles) {
    let grants = {}; try { grants = JSON.parse(role.permissions_json); } catch (_) {}
    for (const key of SERVER_PERMISSIONS) if (grants[key] === true) result[key] = true;
  }
  return result;
}
function hasServerPermission(serverId, userId, key) { return serverPermissions(serverId, userId)[key] === true; }
function canChannelAction(channel, userId, action) {
  if (!channel || !canAccessChannel(channel.id, userId)) return false;
  if (channel.server_id == null) return true;
  return channelPermissions(channel, userId)[action] === true;
}

// algum cargo dessa pessoa tem a permissão `column` ('can_view' ou 'can_connect') nesse canal?
function hasChannelRoleGrant(channelId, serverId, userId, column) {
  return !!db.prepare(`
    SELECT 1 FROM member_roles mr JOIN channel_role_access a ON a.role_id = mr.role_id
    WHERE mr.server_id = ? AND mr.user_id = ? AND a.channel_id = ? AND a.${column} = 1 LIMIT 1
  `).get(serverId, userId, channelId);
}

// o que essa pessoa pode fazer nesse canal de servidor: { view, connect, admin }. Quem não é membro
// não pode nada. Admin/dono pode tudo. Canal sem restrição: todo membro vê e entra.
function channelPermissions(channel, userId) {
  const none = { view: false, connect: false, admin: false, send: false, attach: false, react: false, pin: false };
  if (!channel || channel.server_id == null) return none;
  if (!isServerMember(channel.server_id, userId)) return none;
  if (isServerAdmin(channel.server_id, userId)) return { view: true, connect: true, admin: true, send: true, attach: true, react: true, pin: true };
  const view = !channel.private_view || hasChannelRoleGrant(channel.id, channel.server_id, userId, 'can_view');
  const connect = view && (!channel.private_connect || hasChannelRoleGrant(channel.id, channel.server_id, userId, 'can_connect'));
  const actions = {};
  for (const key of ['send', 'attach', 'react', 'pin']) actions[key] = view && (!channel['private_' + key] || hasChannelRoleGrant(channel.id, channel.server_id, userId, 'can_' + key));
  actions.attach = actions.attach && actions.send;
  return { view, connect, admin: false, ...actions };
}

// pode entrar na call desse canal de voz?
function canConnectChannel(channelId, userId) {
  const ch = getChannel(channelId);
  if (!ch || ch.type !== 'voice' || ch.server_id == null) return null;
  return channelPermissions(ch, userId).connect ? ch : null;
}

function dmMemberIds(channelId) {
  return db.prepare('SELECT user_id FROM dm_members WHERE channel_id = ?').all(channelId).map((r) => r.user_id);
}

// devolve o canal se `userId` pode vê-lo (membro do servidor dele, ou participante da DM), senão null
// (canal de servidor: precisa poder VER pelos cargos — ver channelPermissions)
function canAccessChannel(channelId, userId) {
  const ch = getChannel(channelId);
  if (!ch) return null;
  if (ch.server_id != null) return channelPermissions(ch, userId).view ? ch : null;
  return db.prepare('SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?').get(ch.id, userId) ? ch : null;
}

// quem deve receber eventos de um canal (mensagens novas/apagadas, entrar/sair da call etc.) —
// num canal restrito, só quem consegue vê-lo
function channelAudience(channelId) {
  const ch = getChannel(channelId);
  if (!ch) return [];
  if (ch.server_id == null) return dmMemberIds(ch.id);
  if (!ch.private_view) return serverMemberIds(ch.server_id);
  return db.prepare(`
    SELECT sm.user_id FROM server_members sm JOIN servers s ON s.id = sm.server_id
    WHERE sm.server_id = ? AND (
      s.owner_id = sm.user_id
      OR EXISTS (SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id
                 WHERE mr.server_id = sm.server_id AND mr.user_id = sm.user_id AND r.is_admin = 1)
      OR EXISTS (SELECT 1 FROM member_roles mr JOIN channel_role_access a ON a.role_id = mr.role_id
                 WHERE mr.server_id = sm.server_id AND mr.user_id = sm.user_id AND a.channel_id = ? AND a.can_view = 1)
    )
  `).all(ch.server_id, ch.id).map((r) => r.user_id);
}

// todo mundo que "enxerga" esse usuário: quem divide algum servidor ou alguma DM com ele (inclui
// ele mesmo). Usado pra entregar presença online/offline e atualização de perfil só pra quem
// realmente aparece na tela dessa pessoa, em vez de pra todo mundo cadastrado no site.
function relatedUserIds(userId) {
  const rows = db.prepare(`
    SELECT sm2.user_id AS id FROM server_members sm1
      JOIN server_members sm2 ON sm2.server_id = sm1.server_id
      WHERE sm1.user_id = ?
    UNION
    SELECT dm2.user_id AS id FROM dm_members dm1
      JOIN dm_members dm2 ON dm2.channel_id = dm1.channel_id
      WHERE dm1.user_id = ?
  `).all(userId, userId);
  const ids = new Set(rows.map((r) => r.id));
  ids.add(userId);
  return [...ids];
}

function sharesServer(userA, userB) {
  return !!db.prepare(`
    SELECT 1 FROM server_members a
      JOIN server_members b ON b.server_id = a.server_id
      WHERE a.user_id = ? AND b.user_id = ?
      LIMIT 1
  `).get(userA, userB);
}

function sharesDm(userA, userB) {
  return !!db.prepare(`
    SELECT 1 FROM dm_members a
      JOIN dm_members b ON b.channel_id = a.channel_id
      WHERE a.user_id = ? AND b.user_id = ?
      LIMIT 1
  `).get(userA, userB);
}

function mutualServers(userA, userB) {
  return db.prepare(`
    SELECT s.id, s.name, s.icon_url FROM servers s
      JOIN server_members a ON a.server_id = s.id AND a.user_id = ?
      JOIN server_members b ON b.server_id = s.id AND b.user_id = ?
      ORDER BY s.name COLLATE NOCASE
  `).all(userA, userB);
}

module.exports = {
  SERVER_PERMISSIONS, serverPermissions, everyonePermissions, SERVER_COLUMNS, hasServerPermission, canChannelAction,
  PUBLIC_USER_COLUMNS,
  publicUser,
  getUser,
  getServer,
  isServerMember,
  isBanned,
  serverMemberIds,
  getChannel,
  dmMemberIds,
  canAccessChannel,
  canConnectChannel,
  channelPermissions,
  channelAudience,
  memberRoleIds,
  isServerAdmin,
  relatedUserIds,
  sharesServer,
  sharesDm,
  mutualServers,
};
