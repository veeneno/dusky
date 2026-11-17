const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DUSKY_DB_PATH (ou o nome antigo DIDISCORD_DB_PATH) aponta pra outro banco — ex: ':memory:' nos testes
const DB_PATH = process.env.DUSKY_DB_PATH || process.env.DIDISCORD_DB_PATH || defaultDbPath();
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// O projeto se chamava "didiscord": quem já tinha o banco server/db/didiscord.db continua com os
// mesmos dados. Se dusky.db ainda não existe e o antigo sim, passa tudo do -wal pro arquivo
// principal (checkpoint) e renomeia. Se algo der errado, segue usando o antigo, intacto.
function defaultDbPath() {
  const fresh = path.join(__dirname, 'dusky.db');
  const legacy = path.join(__dirname, 'didiscord.db');
  if (fs.existsSync(fresh) || !fs.existsSync(legacy)) return fresh;
  try {
    const old = new Database(legacy);
    old.pragma('wal_checkpoint(TRUNCATE)');
    old.pragma('journal_mode = DELETE'); // some com o -wal/-shm: o banco inteiro fica num arquivo só
    old.close();
    fs.renameSync(legacy, fresh);
    console.log('[db] banco didiscord.db renomeado pra dusky.db');
    return fresh;
  } catch (err) {
    console.warn('[db] não consegui renomear didiscord.db pra dusky.db, usando o antigo:', err.message);
    return legacy;
  }
}

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
// status escolhido pela pessoa: 'online' (ativo, bolinha verde) ou 'idle' (inativo, lua roxa).
// Só vale enquanto ela está conectada — desconectada continua aparecendo offline.
ensureColumn('users', 'presence_status', "TEXT NOT NULL DEFAULT 'online'");
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
// Organização não muda acesso: categorias agrupam canais, cada canal conserva suas regras.
db.exec(`CREATE TABLE IF NOT EXISTS channel_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'mentions', session_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS app_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL);`);
ensureColumn('channels', 'category_id', 'INTEGER REFERENCES channel_categories(id) ON DELETE SET NULL');
for (const key of ['send', 'attach', 'react', 'pin']) {
  ensureColumn('channels', 'private_' + key, 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('channel_role_access', 'can_' + key, 'INTEGER NOT NULL DEFAULT 0');
}
ensureColumn('roles', 'permissions_json', "TEXT NOT NULL DEFAULT '{}'");
// cargo "mostrado separado" na lista de membros (igual ao Discord): quem tem o cargo aparece num grupo próprio
ensureColumn('roles', 'hoist', 'INTEGER NOT NULL DEFAULT 0');

// painel de admin do site (routes/admin.js)
ensureColumn('users', 'is_site_admin', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'banned_at', 'TEXT');          // conta suspensa (null = normal)
ensureColumn('users', 'ban_reason', 'TEXT');
// sobe quando a senha é redefinida/a conta é suspensa: sessões antigas (cookie com versão menor) caem
ensureColumn('users', 'session_version', 'INTEGER NOT NULL DEFAULT 0');
// limites de anexo por conta, mudados no painel de admin (null = usa o padrão do .env, ver
// server/uploadLimits.js). O admin do site nunca tem limite, independente do que estiver aqui.
ensureColumn('users', 'upload_max_mb', 'INTEGER');    // tamanho máximo de UM arquivo
ensureColumn('users', 'upload_quota_mb', 'INTEGER');  // soma de todos os anexos da conta
// aparência (tema) de cada pessoa — ver routes/profile.js e public/js/themes.js
ensureColumn('users', 'theme_json', 'TEXT');
// efeito no nome (LED, neon, degradê…) — JSON {"effect","c1","c2"}, validado em routes/profile.js.
// Vai junto com os dados públicos do perfil: todo mundo vê o efeito no chat, DMs, membros e perfil
ensureColumn('users', 'name_style', 'TEXT');
// decorações do perfil (placa do nome, decoração do avatar, efeito do perfil) — ver server/decor.js
ensureColumn('users', 'nameplate', 'TEXT');
ensureColumn('users', 'avatar_deco', 'TEXT');
ensureColumn('users', 'profile_fx', 'TEXT');

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

// ------------------------------------------------------------------
// configurações do servidor (estilo Discord), banimentos, registro de auditoria e soundboard
// ------------------------------------------------------------------

// perfil do servidor: banner (pode ser gif) e descrição curta (aparece no convite e na lateral)
ensureColumn('servers', 'banner_url', 'TEXT');
ensureColumn('servers', 'description', 'TEXT');
// mensagens do sistema ("fulano chegou"): canal onde aparecem (NULL = desligado) e se avisa quem entra
ensureColumn('servers', 'system_channel_id', 'INTEGER REFERENCES channels(id) ON DELETE SET NULL');
ensureColumn('servers', 'system_welcome', 'INTEGER NOT NULL DEFAULT 1');
// canal AFK: quem fica sem falar por afk_timeout segundos numa call é levado pra ele (NULL = desligado)
ensureColumn('servers', 'afk_channel_id', 'INTEGER REFERENCES channels(id) ON DELETE SET NULL');
ensureColumn('servers', 'afk_timeout', 'INTEGER NOT NULL DEFAULT 300');
// cargo que todo mundo ganha ao entrar no servidor por convite (NULL = nenhum). Nunca pode ser admin.
ensureColumn('servers', 'join_role_id', 'INTEGER REFERENCES roles(id) ON DELETE SET NULL');
// permissões do "@everyone": o que TODO membro pode, mesmo sem cargo nenhum. Os cargos só somam.
// Soundboard (usar e usar sons de outros servidores) nasce liberado, igual no Discord.
ensureColumn('servers', 'everyone_permissions_json', `TEXT NOT NULL DEFAULT '{"use_soundboard":true,"use_external_sounds":true}'`);
// mundinho 3D (docs/MUNDINHO.md): canal de voz com cena 3D. NULL = canal de voz normal
ensureColumn('channels', 'world_scene', 'TEXT');
// cena que não existe mais (ex.: a 'lounge' da 1ª versão) vira a cena padrão — senão o site pediria
// um arquivo de cena que sumiu e o mundinho não carregaria
(function fixMissingScenes() {
  const dir = path.join(__dirname, '..', '..', 'public', 'world', 'scenes');
  const fix = db.prepare('UPDATE channels SET world_scene = ? WHERE world_scene = ?');
  for (const { world_scene: id } of db.prepare('SELECT DISTINCT world_scene FROM channels WHERE world_scene IS NOT NULL').all()) {
    if (!fs.existsSync(path.join(dir, `${id}.json`))) {
      fix.run('penthouse', id);
      console.log(`[db] canais-mundo com a cena "${id}" (que não existe mais) passaram pra "penthouse"`);
    }
  }
})();
// mensagem do sistema: system_type ('member_join'...) e de quem ela fala (system_user_id)
ensureColumn('messages', 'system_type', 'TEXT');
ensureColumn('messages', 'system_user_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');

db.exec(`
  -- banidos não voltam por convite enquanto o banimento existir
  CREATE TABLE IF NOT EXISTS server_bans (
    server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason     TEXT,
    banned_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (server_id, user_id)
  );
  -- quem fez o quê em cada servidor (ver server/audit.js)
  CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id    INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,
    target_type  TEXT,
    target_id    INTEGER,
    target_name  TEXT,
    details_json TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_server ON audit_log(server_id, id);
  -- sons do soundboard (ver server/soundboard.js). O arquivo já fica cortado e em mp3.
  CREATE TABLE IF NOT EXISTS soundboard_sounds (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    emoji       TEXT,
    volume      REAL NOT NULL DEFAULT 1,
    file_url    TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_soundboard_server ON soundboard_sounds(server_id);
`);

// canais padrão de um servidor recém-criado — usado por routes/servers.js
function createDefaultChannels(serverId, createdBy) {
  const insert = db.prepare(
    'INSERT INTO channels (name, type, position, created_by, server_id) VALUES (?, ?, ?, ?, ?)'
  );
  // igual ao Discord: servidor novo já vem com as categorias "canais de texto" e "canais de voz"
  const category = db.prepare('INSERT INTO channel_categories (server_id, name, position) VALUES (?, ?, ?)');
  const textCat = category.run(serverId, 'canais de texto', 0).lastInsertRowid;
  const voiceCat = category.run(serverId, 'canais de voz', 1).lastInsertRowid;
  const setCat = db.prepare('UPDATE channels SET category_id = ? WHERE id = ?');
  setCat.run(textCat, insert.run('geral', 'text', 0, createdBy, serverId).lastInsertRowid);
  setCat.run(voiceCat, insert.run('Geral', 'voice', 0, createdBy, serverId).lastInsertRowid);
}

db.createDefaultChannels = createDefaultChannels;
db.DB_PATH = DB_PATH;

module.exports = db;
