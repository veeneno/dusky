const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const { serverIconUpload } = require('../upload');

const router = express.Router();

const SERVER_NAME_MAX = 40;
const CHANNEL_NAME_MAX = 40;

function cleanServerName(raw) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, SERVER_NAME_MAX) : '';
}

function removeOldUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  fs.unlink(path.join(__dirname, '..', '..', 'public', url), () => {});
}

// middleware: carrega o servidor de :serverId e garante que quem pediu é membro. Pra quem não é,
// responde 404 (igual servidor inexistente) — não revela que o servidor existe.
function loadMemberServer(req, res, next) {
  const serverId = Number(req.params.serverId);
  const server = serverId ? access.getServer(serverId) : null;
  if (!server || !access.isServerMember(server.id, req.user.id)) {
    return res.status(404).json({ error: 'servidor não encontrado' });
  }
  req.server = server;
  next();
}

function requirePermission(key) {
  return (req, res, next) => access.hasServerPermission(req.server.id, req.user.id, key) ? next() : res.status(403).json({ error: 'seu cargo não permite essa ação' });
}

function requireOwner(req, res, next) {
  if (req.server.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'só o dono do servidor pode fazer isso' });
  }
  next();
}

// dono ou alguém com cargo de administrador
function requireAdmin(req, res, next) {
  if (!access.isServerAdmin(req.server.id, req.user.id)) {
    return res.status(403).json({ error: 'só administradores podem fazer isso' });
  }
  next();
}

// pode `actorId` moderar `targetId` (expulsar, desconectar, mexer nos cargos)? Ninguém mexe no
// dono, e só o dono mexe em outro administrador — senão dois admins podiam se derrubar em loop.
function canModerate(server, actorId, targetId) {
  if (targetId === server.owner_id) return false;
  if (actorId === server.owner_id) return true;
  return !access.isServerAdmin(server.id, targetId);
}

const CHANNEL_COLUMNS = 'id, name, type, position, server_id, category_id, private_view, private_connect, private_send, private_attach, private_react, private_pin';

// canais que `userId` consegue ver, cada um com o que ele pode fazer ali. Pra administradores vai
// junto a configuração de acesso (quais cargos veem/entram), usada na tela de editar canal.
function listChannels(serverId, userId) {
  const isAdmin = access.hasServerPermission(serverId, userId, 'manage_channels');
  const rows = db.prepare(
    `SELECT ${CHANNEL_COLUMNS} FROM channels WHERE server_id = ? ORDER BY type, position, id`
  ).all(serverId);
  const grants = isAdmin
    ? db.prepare(`
        SELECT a.channel_id, a.role_id, a.can_view, a.can_connect, a.can_send, a.can_attach, a.can_react, a.can_pin FROM channel_role_access a
        JOIN channels c ON c.id = a.channel_id WHERE c.server_id = ?
      `).all(serverId)
    : [];
  const out = [];
  for (const ch of rows) {
    const perms = access.channelPermissions(ch, userId);
    if (!perms.view) continue;
    const item = {
      ...ch,
      permissions: perms,
      private_view: !!ch.private_view,
      private_connect: !!ch.private_connect,
      can_connect: ch.type === 'voice' ? perms.connect : undefined,
    };
    if (isAdmin) {
      const mine = grants.filter((g) => g.channel_id === ch.id);
      for (const key of ['send', 'attach', 'react', 'pin']) item[key + '_role_ids'] = mine.filter(g => g['can_' + key]).map(g => g.role_id);
      item.view_role_ids = mine.filter((g) => g.can_view).map((g) => g.role_id);
      item.connect_role_ids = mine.filter((g) => g.can_connect).map((g) => g.role_id);
    }
    out.push(item);
  }
  return out;
}

function listRoles(serverId) {
  return db.prepare(
    'SELECT id, server_id, name, color, is_admin, hoist, position, permissions_json FROM roles WHERE server_id = ? ORDER BY position DESC, id'
  ).all(serverId).map((r) => ({ ...r, permissions: JSON.parse(r.permissions_json), is_admin: !!r.is_admin, hoist: !!r.hoist }));
}

// avisa o servidor que cargos/permissões mudaram — cada um recarrega o que vê — e derruba das
// calls quem perdeu o direito de estar nelas
function rolesChanged(serverId) {
  realtime.broadcastToServer(serverId, { type: 'roles_updated', serverId });
  realtime.enforceVoicePermissions(serverId);
}

function memberRow(serverId, userId) {
  const row = db.prepare(`
    SELECT ${access.PUBLIC_USER_COLUMNS.split(', ').map((c) => 'u.' + c).join(', ')}, sm.joined_at
    FROM server_members sm JOIN users u ON u.id = sm.user_id
    WHERE sm.server_id = ? AND sm.user_id = ?
  `).get(serverId, userId);
  return row ? { ...row, online: realtime.isOnline(row.id), status: realtime.presenceStatusOf(row.id), activity: realtime.activityOf(row.id) } : null;
}

// ------------------------------------------------------------------
// servidores
// ------------------------------------------------------------------

// GET /api/servers — servidores dos quais eu sou membro (na ordem em que entrei)
router.get('/', requireAuth, (req, res) => {
  const servers = db.prepare(`
    SELECT s.id, s.name, s.icon_url, s.owner_id, s.created_at
    FROM servers s JOIN server_members sm ON sm.server_id = s.id
    WHERE sm.user_id = ?
    ORDER BY sm.joined_at, s.id
  `).all(req.user.id).map((s) => ({ ...s, is_admin: access.isServerAdmin(s.id, req.user.id) }));
  res.json({ servers });
});

// POST /api/servers — cria um servidor novo (quem cria vira dono e primeiro membro)
router.post('/', requireAuth, (req, res) => {
  const name = cleanServerName((req.body || {}).name);
  if (!name) return res.status(400).json({ error: 'dá um nome pro servidor' });

  const server = db.transaction(() => {
    const { lastInsertRowid: serverId } = db.prepare(
      'INSERT INTO servers (name, owner_id) VALUES (?, ?)'
    ).run(name, req.user.id);
    db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(serverId, req.user.id);
    db.createDefaultChannels(serverId, req.user.id);
    return access.getServer(serverId);
  })();

  // outras abas da mesma pessoa também ficam sabendo
  realtime.sendToUsers([req.user.id], { type: 'server_joined', server });
  res.status(201).json({ server: { ...server, is_admin: true }, channels: listChannels(server.id, req.user.id) });
});

// GET /api/servers/:serverId
router.get('/:serverId', requireAuth, loadMemberServer, (req, res) => {
  res.json({ server: req.server });
});

// PATCH /api/servers/:serverId — renomear (só dono)
router.patch('/:serverId', requireAuth, loadMemberServer, requireAdmin, (req, res) => {
  const name = cleanServerName((req.body || {}).name);
  if (!name) return res.status(400).json({ error: 'dá um nome pro servidor' });

  db.prepare('UPDATE servers SET name = ? WHERE id = ?').run(name, req.server.id);
  const server = access.getServer(req.server.id);
  realtime.broadcastToServer(server.id, { type: 'server_updated', server });
  res.json({ server });
});

// POST /api/servers/:serverId/icon — trocar ícone (só dono)
router.post('/:serverId/icon', requireAuth, loadMemberServer, requireAdmin, (req, res) => {
  serverIconUpload.single('icon')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'não deu pra enviar essa imagem (máx. 15MB)' });
    if (!req.file) return res.status(400).json({ error: 'imagem inválida (use png, jpg, webp ou gif)' });

    const iconUrl = `/uploads/server/${req.file.filename}`;
    db.prepare('UPDATE servers SET icon_url = ? WHERE id = ?').run(iconUrl, req.server.id);
    removeOldUpload(req.server.icon_url);

    const server = access.getServer(req.server.id);
    realtime.broadcastToServer(server.id, { type: 'server_updated', server });
    res.json({ server });
  });
});

// DELETE /api/servers/:serverId/icon — remover ícone (só dono)
router.delete('/:serverId/icon', requireAuth, loadMemberServer, requireAdmin, (req, res) => {
  db.prepare('UPDATE servers SET icon_url = NULL WHERE id = ?').run(req.server.id);
  removeOldUpload(req.server.icon_url);
  const server = access.getServer(req.server.id);
  realtime.broadcastToServer(server.id, { type: 'server_updated', server });
  res.json({ server });
});

// DELETE /api/servers/:serverId — apagar o servidor inteiro (só dono). Leva junto canais,
// mensagens e convites (cascade).
router.delete('/:serverId', requireAuth, loadMemberServer, requireOwner, (req, res) => {
  const serverId = req.server.id;
  const memberIds = access.serverMemberIds(serverId);

  realtime.kickFromServerVoice(serverId);

  // anexos das mensagens do servidor — apaga do disco depois que as linhas sumirem
  const attachments = db.prepare(`
    SELECT m.attachment_url FROM messages m JOIN channels c ON c.id = m.channel_id
    WHERE c.server_id = ? AND m.attachment_url LIKE '/uploads/%'
  `).all(serverId).map((r) => r.attachment_url);

  db.prepare('DELETE FROM servers WHERE id = ?').run(serverId);

  removeOldUpload(req.server.icon_url);
  attachments.forEach(removeOldUpload);

  realtime.sendToUsers(memberIds, { type: 'server_deleted', serverId });
  res.json({ ok: true });
});

// POST /api/servers/:serverId/leave — sair do servidor (o dono não pode sair; tem que apagar)
router.post('/:serverId/leave', requireAuth, loadMemberServer, (req, res) => {
  if (req.server.owner_id === req.user.id) {
    return res.status(400).json({ error: 'você é o dono — pra sair, apague o servidor' });
  }
  removeMember(req.server.id, req.user.id, 'left');
  res.json({ ok: true });
});

function removeMember(serverId, userId, reason) {
  realtime.kickFromServerVoice(serverId, userId);
  db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, userId);
  db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(serverId, userId);
  realtime.broadcastToServer(serverId, { type: 'member_left', serverId, userId });
  realtime.sendToUsers([userId], { type: 'server_removed', serverId, reason });
}

// ------------------------------------------------------------------
// membros
// ------------------------------------------------------------------

// GET /api/servers/:serverId/members
router.get('/:serverId/members', requireAuth, loadMemberServer, (req, res) => {
  const rows = db.prepare(`
    SELECT ${access.PUBLIC_USER_COLUMNS.split(', ').map((c) => 'u.' + c).join(', ')}, sm.joined_at
    FROM server_members sm JOIN users u ON u.id = sm.user_id
    WHERE sm.server_id = ?
    ORDER BY u.username COLLATE NOCASE
  `).all(req.server.id);
  const roleRows = db.prepare('SELECT user_id, role_id FROM member_roles WHERE server_id = ?').all(req.server.id);
  const members = rows.map((u) => ({
    ...u,
    online: realtime.isOnline(u.id), status: realtime.presenceStatusOf(u.id),
    activity: realtime.activityOf(u.id), // "jogando X", se o app dela estiver detectando um jogo
    role_ids: roleRows.filter((r) => r.user_id === u.id).map((r) => r.role_id),
  }));
  res.json({ members });
});

// DELETE /api/servers/:serverId/members/:userId — expulsar alguém (administradores; ver canModerate)
router.delete('/:serverId/members/:userId', requireAuth, loadMemberServer, requirePermission('kick_members'), (req, res) => {
  const targetId = Number(req.params.userId);
  if (targetId === req.user.id) return res.status(400).json({ error: 'você não pode se expulsar' });
  if (!access.isServerMember(req.server.id, targetId)) {
    return res.status(404).json({ error: 'essa pessoa não está no servidor' });
  }
  if (!canModerate(req.server, req.user.id, targetId)) {
    return res.status(403).json({ error: 'você não pode expulsar essa pessoa' });
  }
  removeMember(req.server.id, targetId, 'kicked');
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// canais
// ------------------------------------------------------------------

// GET /api/servers/:serverId/channels
router.get('/:serverId/channels', requireAuth, loadMemberServer, (req, res) => {
  res.json({
    categories: db.prepare('SELECT * FROM channel_categories WHERE server_id = ? ORDER BY position, id').all(req.server.id),
    channels: listChannels(req.server.id, req.user.id),
    me: { permissions: access.serverPermissions(req.server.id, req.user.id), is_admin: access.isServerAdmin(req.server.id, req.user.id), role_ids: access.memberRoleIds(req.server.id, req.user.id) },
  });
});

// POST /api/servers/:serverId/channels — cria canal (administradores)
router.post('/:serverId/channels', requireAuth, loadMemberServer, requirePermission('manage_channels'), (req, res) => {
  const { name, type } = req.body || {};
  const categoryId = req.body.category_id == null ? null : Number(req.body.category_id);
  if (categoryId !== null && !db.prepare('SELECT 1 FROM channel_categories WHERE id = ? AND server_id = ?').get(categoryId, req.server.id)) return res.status(400).json({ error: 'categoria inválida' });
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'nome do canal é obrigatório' });
  }
  if (type !== 'text' && type !== 'voice') {
    return res.status(400).json({ error: 'tipo de canal inválido' });
  }

  // canais de texto seguem o jeito do Discord: minúsculo e com hífen no lugar de espaço
  let cleanName = name.trim().slice(0, CHANNEL_NAME_MAX);
  if (type === 'text') cleanName = cleanName.toLowerCase().replace(/\s+/g, '-');

  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS m FROM channels WHERE server_id = ? AND type = ?'
  ).get(req.server.id, type).m;

  const result = db.prepare(
    'INSERT INTO channels (name, type, position, created_by, server_id) VALUES (?, ?, ?, ?, ?)'
  ).run(cleanName, type, maxPos + 1, req.user.id, req.server.id);

  db.prepare('UPDATE channels SET category_id = ? WHERE id = ?').run(categoryId, result.lastInsertRowid);
  const created = access.getChannel(result.lastInsertRowid);
  // canal novo nasce aberto pra todo mundo do servidor
  const channel = { ...created, private_view: false, private_connect: false, can_connect: type === 'voice' ? true : undefined };
  realtime.broadcastToServer(req.server.id, { type: 'channel_created', serverId: req.server.id, channel });
  res.status(201).json({ channel });
});

// ------------------------------------------------------------------
// convites
// ------------------------------------------------------------------

// código curto, legível e sem caracteres ambíguos (0/O, 1/l/I)
const INVITE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateInviteCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const b of bytes) code += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return code;
}

const ALLOWED_MAX_AGE_HOURS = [1, 24, 24 * 7, 24 * 30, 0]; // 0 = nunca expira

// POST /api/servers/:serverId/invites — gera um link de convite (qualquer membro pode)
// body opcional: { max_age_hours: 1|24|168|720|0, max_uses: número|0 (0 = ilimitado) }
router.post('/:serverId/invites', requireAuth, loadMemberServer, (req, res) => {
  const body = req.body || {};
  let maxAgeHours = Number(body.max_age_hours);
  if (!ALLOWED_MAX_AGE_HOURS.includes(maxAgeHours)) maxAgeHours = 24 * 7; // padrão: 7 dias, igual o Discord
  let maxUses = Math.floor(Number(body.max_uses) || 0);
  if (maxUses < 0 || maxUses > 1000) maxUses = 0;

  const expiresAt = maxAgeHours > 0
    ? new Date(Date.now() + maxAgeHours * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    : null;

  let code;
  for (let i = 0; i < 5; i++) {
    code = generateInviteCode();
    if (!db.prepare('SELECT 1 FROM invites WHERE code = ?').get(code)) break;
  }

  db.prepare(
    'INSERT INTO invites (code, server_id, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(code, req.server.id, req.user.id, maxUses || null, expiresAt);

  res.status(201).json({ invite: { code, server_id: req.server.id, max_uses: maxUses || null, expires_at: expiresAt, uses: 0 } });
});

// ------------------------------------------------------------------
// cargos
// ------------------------------------------------------------------

const ROLE_NAME_MAX = 32;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// GET /api/servers/:serverId/roles — todo membro vê os cargos (pra cor dos nomes e etiquetas)
router.get('/:serverId/roles', requireAuth, loadMemberServer, (req, res) => {
  res.json({ roles: listRoles(req.server.id) });
});

// POST /api/servers/:serverId/roles { name, color?, is_admin? } — cria cargo
router.post('/:serverId/roles', requireAuth, loadMemberServer, requireAdmin, (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, ROLE_NAME_MAX) : '';
  if (!name) return res.status(400).json({ error: 'dá um nome pro cargo' });
  if (body.is_admin && req.server.owner_id !== req.user.id) return res.status(403).json({ error: 'só o dono pode criar administradores' });
  const color = COLOR_RE.test(body.color || '') ? body.color : null;
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM roles WHERE server_id = ?').get(req.server.id).m;
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO roles (server_id, name, color, is_admin, hoist, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.server.id, name, color, body.is_admin ? 1 : 0, body.hoist ? 1 : 0, maxPos + 1);
  rolesChanged(req.server.id);
  res.status(201).json({ role: listRoles(req.server.id).find((r) => r.id === lastInsertRowid) });
});

function loadRole(req, res, next) {
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(Number(req.params.roleId), req.server.id);
  if (!role) return res.status(404).json({ error: 'cargo não encontrado' });
  req.role = role;
  next();
}

// PATCH /api/servers/:serverId/roles/:roleId { name?, color?, is_admin?, position? }
router.patch('/:serverId/roles/:roleId', requireAuth, loadMemberServer, requireAdmin, loadRole, (req, res) => {
  const body = req.body || {};
  const sets = [];
  const vals = [];
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, ROLE_NAME_MAX) : '';
    if (!name) return res.status(400).json({ error: 'dá um nome pro cargo' });
    sets.push('name = ?'); vals.push(name);
  }
  if (body.color !== undefined) {
    sets.push('color = ?'); vals.push(COLOR_RE.test(body.color || '') ? body.color : null);
  }
  if (body.permissions !== undefined) {
    if (!body.permissions || typeof body.permissions !== 'object' || Array.isArray(body.permissions)) return res.status(400).json({ error: 'permissões inválidas' });
    const grants = Object.fromEntries(access.SERVER_PERMISSIONS.map(k => [k, body.permissions[k] === true]));
    sets.push('permissions_json = ?'); vals.push(JSON.stringify(grants));
  }
  if (body.hoist !== undefined) {
    sets.push('hoist = ?'); vals.push(body.hoist ? 1 : 0);
  }
  if (body.is_admin !== undefined) {
    // tirar/dar admin de um cargo muda quem pode moderar quem — só o dono decide isso
    if (req.server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'só o dono pode mudar quem é administrador' });
    }
    sets.push('is_admin = ?'); vals.push(body.is_admin ? 1 : 0);
  }
  if (body.position !== undefined && Number.isFinite(Number(body.position))) {
    sets.push('position = ?'); vals.push(Math.floor(Number(body.position)));
  }
  if (sets.length) db.prepare(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.role.id);
  rolesChanged(req.server.id);
  res.json({ role: listRoles(req.server.id).find((r) => r.id === req.role.id) });
});

// DELETE /api/servers/:serverId/roles/:roleId
router.delete('/:serverId/roles/:roleId', requireAuth, loadMemberServer, requireAdmin, loadRole, (req, res) => {
  if (req.role.is_admin && req.server.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'só o dono pode apagar um cargo de administrador' });
  }
  db.prepare('DELETE FROM roles WHERE id = ?').run(req.role.id);
  rolesChanged(req.server.id);
  res.json({ ok: true });
});

// PUT /api/servers/:serverId/members/:userId/roles { role_ids: [...] } — define os cargos de alguém
router.put('/:serverId/members/:userId/roles', requireAuth, loadMemberServer, requireAdmin, (req, res) => {
  const targetId = Number(req.params.userId);
  if (!access.isServerMember(req.server.id, targetId)) {
    return res.status(404).json({ error: 'essa pessoa não está no servidor' });
  }
  const isOwner = req.server.owner_id === req.user.id;
  if (targetId !== req.user.id && !canModerate(req.server, req.user.id, targetId)) {
    return res.status(403).json({ error: 'você não pode mudar os cargos dessa pessoa' });
  }
  const valid = new Map(listRoles(req.server.id).map((r) => [r.id, r]));
  const wanted = [...new Set((Array.isArray((req.body || {}).role_ids) ? req.body.role_ids : []).map(Number))].filter((id) => valid.has(id));
  const current = access.memberRoleIds(req.server.id, targetId);
  // só o dono dá ou tira cargo de administrador (admin não cria outro admin, nem se rebaixa sem querer)
  if (!isOwner) {
    const touchesAdmin = [...new Set([...wanted, ...current])]
      .filter((id) => wanted.includes(id) !== current.includes(id))
      .some((id) => valid.get(id) && valid.get(id).is_admin);
    if (touchesAdmin) return res.status(403).json({ error: 'só o dono pode dar ou tirar cargo de administrador' });
  }
  db.transaction(() => {
    db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(req.server.id, targetId);
    const add = db.prepare('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)');
    for (const id of wanted) add.run(req.server.id, targetId, id);
  })();
  rolesChanged(req.server.id);
  res.json({ role_ids: wanted });
});

// ------------------------------------------------------------------
// moderação de voz
// ------------------------------------------------------------------

function loadVoiceTarget(req, res, next) {
  const targetId = Number(req.params.userId);
  const state = realtime.voiceStateOf(targetId);
  if (!state || state.serverId !== req.server.id) {
    return res.status(404).json({ error: 'essa pessoa não está numa call deste servidor' });
  }
  if (targetId !== req.user.id && !canModerate(req.server, req.user.id, targetId)) {
    return res.status(403).json({ error: 'você não pode mexer na call dessa pessoa' });
  }
  req.targetId = targetId;
  req.voiceState = state;
  next();
}

// POST /api/servers/:serverId/voice/:userId/disconnect — tira alguém da call
router.post('/:serverId/voice/:userId/disconnect', requireAuth, loadMemberServer, requirePermission('moderate_voice'), loadVoiceTarget, (req, res) => {
  realtime.disconnectUser(req.targetId, req.user.username);
  res.json({ ok: true });
});

// POST /api/servers/:serverId/voice/:userId/move { channel_id } — leva alguém pra outro canal de voz
router.post('/:serverId/voice/:userId/move', requireAuth, loadMemberServer, requirePermission('moderate_voice'), loadVoiceTarget, (req, res) => {
  const channel = access.getChannel(Number((req.body || {}).channel_id));
  if (!channel || channel.server_id !== req.server.id || channel.type !== 'voice') {
    return res.status(400).json({ error: 'escolha um canal de voz deste servidor' });
  }
  if (!access.canConnectChannel(channel.id, req.targetId)) {
    return res.status(403).json({ error: 'essa pessoa não tem permissão pra entrar nesse canal' });
  }
  if (req.voiceState.channelId === channel.id) return res.json({ ok: true, unchanged: true });
  realtime.moveUser(req.targetId, channel, req.user.username);
  res.json({ ok: true });
});

module.exports = router;
module.exports.memberRow = memberRow;
module.exports.listChannels = listChannels;
