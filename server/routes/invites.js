const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const { memberRow } = require('./servers');
const extras = require('../chatExtras');

const router = express.Router();

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// devolve o convite (com o servidor) e o motivo de não poder ser usado, se for o caso
function loadInvite(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{4,32}$/.test(code)) return { invite: null };
  const invite = db.prepare(`
    SELECT i.code, i.server_id, i.uses, i.max_uses, i.expires_at, i.created_by,
           s.name AS server_name, s.icon_url AS server_icon_url,
           u.username AS inviter_username
    FROM invites i
    JOIN servers s ON s.id = i.server_id
    LEFT JOIN users u ON u.id = i.created_by
    WHERE i.code = ?
  `).get(code);
  if (!invite) return { invite: null };

  let problem = null;
  if (invite.expires_at && invite.expires_at < nowSql()) problem = 'esse convite expirou';
  else if (invite.max_uses && invite.uses >= invite.max_uses) problem = 'esse convite já atingiu o limite de usos';
  return { invite, problem };
}

// GET /api/invites/:code — prévia do convite. Não exige login: a tela de entrar/criar conta usa
// isso pra mostrar "fulano te convidou pra X" antes da pessoa ter conta. Só expõe nome, ícone e
// contagem de membros — nada de conteúdo do servidor.
router.get('/:code', (req, res) => {
  const { invite, problem } = loadInvite(req.params.code);
  if (!invite) return res.status(404).json({ error: 'convite inválido ou apagado' });

  const memberCount = db.prepare('SELECT COUNT(*) AS c FROM server_members WHERE server_id = ?').get(invite.server_id).c;
  const memberIds = access.serverMemberIds(invite.server_id);
  const onlineCount = memberIds.filter((id) => realtime.isOnline(id)).length;

  const userId = req.session && req.session.userId;
  const alreadyMember = !!(userId && access.isServerMember(invite.server_id, userId));

  res.json({
    invite: {
      code: invite.code,
      inviter: invite.inviter_username || null,
      expires_at: invite.expires_at,
      usable: !problem,
      problem,
      already_member: alreadyMember,
      server: {
        id: invite.server_id,
        name: invite.server_name,
        icon_url: invite.server_icon_url,
        member_count: memberCount,
        online_count: onlineCount,
      },
    },
  });
});

// POST /api/invites/:code/accept — entra no servidor do convite
router.post('/:code/accept', requireAuth, (req, res) => {
  const { invite, problem } = loadInvite(req.params.code);
  if (!invite) return res.status(404).json({ error: 'convite inválido ou apagado' });

  const server = access.getServer(invite.server_id);

  // já é membro: não gasta um uso do convite, só leva a pessoa pro servidor
  if (access.isServerMember(server.id, req.user.id)) {
    return res.json({ server, already_member: true });
  }
  if (problem) return res.status(410).json({ error: problem });

  db.transaction(() => {
    db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(server.id, req.user.id);
    db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').run(invite.code);
    extras.markServerRead(server.id, req.user.id); // histórico antigo não chega como "não lido"
  })();

  const member = memberRow(server.id, req.user.id);
  realtime.broadcastToServer(server.id, { type: 'member_joined', serverId: server.id, member }, null);
  realtime.sendToUsers([req.user.id], { type: 'server_joined', server });
  res.json({ server });
});

module.exports = router;
