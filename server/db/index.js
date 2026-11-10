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
// aparência (tema) de cada pessoa — ver routes/profile.js e public/js/themes.js
ensureColumn('users', 'theme_json', 'TEXT');

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

// ------------------------------------------------------------------
// leituras, menções, reações, fixadas e busca
// ------------------------------------------------------------------

// até onde cada pessoa leu cada canal (as "não lidas" sobrevivem a recarregar a página)
const hadReads = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'channel_reads'").get();
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_reads (
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, channel_id)
  );
  -- quem cada mensagem menciona (user_id 0 = @everyone) — pra contar menções não lidas
  CREATE TABLE IF NOT EXISTS message_mentions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_mentions_user ON message_mentions(user_id, message_id);
  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (message_id, user_id, emoji)
  );
`);
ensureColumn('messages', 'pinned_at', 'TEXT');
ensureColumn('messages', 'pinned_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(channel_id, pinned_at) WHERE pinned_at IS NOT NULL');

// primeira vez com a tabela de leituras: marca tudo que já existe como lido, senão todo mundo
// abriria o site com o histórico inteiro "não lido"
if (!hadReads) {
  db.exec(`
    INSERT OR IGNORE INTO channel_reads (user_id, channel_id, last_read_id)
      SELECT sm.user_id, c.id, COALESCE((SELECT MAX(id) FROM messages m WHERE m.channel_id = c.id), 0)
      FROM channels c JOIN server_members sm ON sm.server_id = c.server_id WHERE c.type = 'text';
    INSERT OR IGNORE INTO channel_reads (user_id, channel_id, last_read_id)
      SELECT dm.user_id, dm.channel_id, COALESCE((SELECT MAX(id) FROM messages m WHERE m.channel_id = dm.channel_id), 0)
      FROM dm_members dm;
  `);
  console.log('[db] leituras iniciadas (tudo que já existia conta como lido)');
}

// busca de mensagens (FTS5): sem diferença de acento nem maiúscula, mantida em dia por gatilhos
const hadFts = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'messages_fts'").get();
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content, content='messages', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF content ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
  END;
`);
if (!hadFts) {
  db.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')");
  console.log('[db] índice de busca criado');
}

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
