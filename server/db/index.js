const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'didiscord.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// aplica o schema (idempotente, usa IF NOT EXISTS)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// migrações leves — adiciona colunas que schema.sql não tinha quando o banco já existia
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('messages', 'attachment_type', 'TEXT');
ensureColumn('messages', 'attachment_name', 'TEXT'); // nome original do arquivo (anexos genéricos, não imagem/vídeo)
ensureColumn('messages', 'attachment_size', 'INTEGER'); // tamanho em bytes do anexo (pra exibir no chip de arquivo)
ensureColumn('messages', 'reply_to_id', 'INTEGER REFERENCES messages(id) ON DELETE SET NULL');
ensureColumn('users', 'accent_color_2', 'TEXT'); // cor secundária opcional — forma um degradê com accent_color no banner
ensureColumn('users', 'bio', 'TEXT'); // bio curta do perfil
ensureColumn('messages', 'embed_json', 'TEXT'); // embed estruturado (bot de música) — JSON: {title, description, thumbnail, color, fields, footer}
// canal pertence a um servidor; NULL = conversa de DM (ver dm_members). ON DELETE CASCADE: apagar
// o servidor leva junto canais (e, pelo cascade de messages, todo o histórico deles)
ensureColumn('channels', 'server_id', 'INTEGER REFERENCES servers(id) ON DELETE CASCADE');
db.exec('CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id, type, position)');
// histórico do chat em páginas (routes/messages.js, ?before=<id>)
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id, id)');
// cargos: canal restrito a alguns cargos pra ver (private_view) e/ou entrar na call (private_connect)
ensureColumn('channels', 'private_view', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('channels', 'private_connect', 'INTEGER NOT NULL DEFAULT 0');
// cargo "mostrado separado" na lista de membros (igual ao Discord): quem tem o cargo aparece num grupo próprio
ensureColumn('roles', 'hoist', 'INTEGER NOT NULL DEFAULT 0');

// painel de admin do site (routes/admin.js)
ensureColumn('users', 'is_site_admin', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'banned_at', 'TEXT');          // conta suspensa (null = normal)
ensureColumn('users', 'ban_reason', 'TEXT');
// sobe quando a senha é redefinida/a conta é suspensa: sessões antigas (cookie com versão menor) caem
ensureColumn('users', 'session_version', 'INTEGER NOT NULL DEFAULT 0');

// admin do site: marcado UMA vez, pra conta com o nome em SITE_ADMINS (.env, padrão "veneno"). Fica
// gravado no banco — trocar de nick não tira o admin, e criar outra conta com o mesmo nome depois
// não dá admin pra ninguém (só marca enquanto não existir nenhum admin).
(function markSiteAdmins() {
  const hasAdmin = db.prepare('SELECT 1 FROM users WHERE is_site_admin = 1 LIMIT 1').get();
  if (hasAdmin) return;
  const names = String(process.env.SITE_ADMINS || 'veneno').split(',').map((n) => n.trim()).filter(Boolean);
  const mark = db.prepare('UPDATE users SET is_site_admin = 1 WHERE username = ? COLLATE NOCASE');
  for (const n of names) {
    if (mark.run(n).changes) console.log(`[db] ${n} marcado como admin do site`);
  }
})();

// migração do modelo antigo (um servidor só, implícito) pro modelo de vários servidores: canais
// "órfãos" (sem servidor e que não são DM) viram um servidor de verdade, usando o nome/ícone que
// estavam em server_settings. O usuário mais antigo vira dono e todo mundo que já tinha conta entra
// como membro — assim ninguém perde histórico nem acesso. Só roda quando existe algo pra migrar.
function migrateLegacyServer() {
  const orphanCount = db.prepare(`
    SELECT COUNT(*) AS c FROM channels
    WHERE server_id IS NULL AND id NOT IN (SELECT channel_id FROM dm_members)
  `).get().c;
  if (orphanCount === 0) return;

  const owner = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  if (!owner) return; // sem nenhum usuário ainda — tenta de novo no próximo boot

  const settings = db.prepare('SELECT name, icon_url FROM server_settings WHERE id = 1').get() || {};

  db.transaction(() => {
    const { lastInsertRowid: serverId } = db.prepare(
      'INSERT INTO servers (name, icon_url, owner_id) VALUES (?, ?, ?)'
    ).run(settings.name || 'servidor geral', settings.icon_url || null, owner.id);

    db.prepare(`
      UPDATE channels SET server_id = ?
      WHERE server_id IS NULL AND id NOT IN (SELECT channel_id FROM dm_members)
    `).run(serverId);

    db.prepare(`
      INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at)
      SELECT ?, id, created_at FROM users
    `).run(serverId);

    console.log(`[db] servidor antigo migrado pra servers.id=${serverId} (${orphanCount} canais)`);
  })();
}
migrateLegacyServer();

// canais padrão de um servidor recém-criado — usado por routes/servers.js
function createDefaultChannels(serverId, createdBy) {
  const insert = db.prepare(
    'INSERT INTO channels (name, type, position, created_by, server_id) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run('geral', 'text', 0, createdBy, serverId);
  insert.run('Geral', 'voice', 0, createdBy, serverId);
}

db.createDefaultChannels = createDefaultChannels;

module.exports = db;
