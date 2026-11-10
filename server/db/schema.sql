-- Schema do banco didiscord

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_url    TEXT,             -- pode ser gif
  banner_url    TEXT,             -- pode ser gif
  accent_color  TEXT DEFAULT '#8b5cf6',
  accent_color_2 TEXT,             -- opcional; se definida, o banner vira um degradê accent_color -> accent_color_2
  bio           TEXT,              -- bio curta do perfil (estilo Discord "sobre mim")
  status_text   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Servidores (guilds). Qualquer usuário pode criar quantos quiser; quem cria vira dono.
CREATE TABLE IF NOT EXISTS servers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  icon_url    TEXT,
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Quem está em qual servidor
CREATE TABLE IF NOT EXISTS server_members (
  server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (server_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);

-- Convites por link (/invite/<code>)
CREATE TABLE IF NOT EXISTS invites (
  code        TEXT PRIMARY KEY,
  server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uses        INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER,             -- null = ilimitado
  expires_at  TEXT,                -- null = nunca expira
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Canais (texto ou voz). server_id é adicionado por migração em db/index.js:
--   server_id preenchido  -> canal de um servidor
--   server_id NULL        -> conversa de mensagem direta (participantes em dm_members)
CREATE TABLE IF NOT EXISTS channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text', 'voice')),
  position    INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mensagens de canais de texto
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id),          -- null = mensagem de bot
  bot_name    TEXT,                                    -- preenchido se foi um bot que mandou
  content     TEXT NOT NULL,
  attachment_url  TEXT,
  attachment_type TEXT,                                  -- 'image' ou 'video'
  reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL, -- mensagem que esta responde (opcional)
  embed_json  TEXT,                                    -- embed estruturado do bot de música (JSON), null em mensagens normais
  edited      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);

-- configurações do antigo servidor único — só é lida uma vez, pela migração que transforma
-- ele no primeiro registro de `servers` (ver db/index.js). Mantida pra não quebrar bancos antigos.
CREATE TABLE IF NOT EXISTS server_settings (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  name     TEXT NOT NULL DEFAULT 'servidor geral',
  icon_url TEXT
);
INSERT OR IGNORE INTO server_settings (id, name) VALUES (1, 'servidor geral');

-- Participantes de cada conversa de mensagem direta (sempre 2 pessoas)
CREATE TABLE IF NOT EXISTS dm_members (
  channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dm_members_user ON dm_members(user_id);

-- Estado de presença/participação em call de voz (efêmero, mas persiste caso o server reinicie)
CREATE TABLE IF NOT EXISTS voice_state (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  channel_id  INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  muted       INTEGER NOT NULL DEFAULT 0,   -- mic mutado
  deafened    INTEGER NOT NULL DEFAULT 0,   -- audio mutado (surdo)
  camera_on   INTEGER NOT NULL DEFAULT 0,
  screen_on   INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================================================================
-- cargos (por servidor)
-- Modelo simples: cada cargo tem nome, cor e uma chave de "administrador". Canais podem ser
-- restritos a alguns cargos — pra ver (private_view) e/ou, em canais de voz, pra entrar na call
-- (private_connect). Dono do servidor e administradores sempre veem e entram em tudo.
-- ===================================================================
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,     -- maior = aparece primeiro / cor que vale no nome
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id);

-- quem tem qual cargo
CREATE TABLE IF NOT EXISTS member_roles (
  server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_member_roles_server_user ON member_roles(server_id, user_id);

-- quais cargos podem ver / entrar num canal restrito
CREATE TABLE IF NOT EXISTS channel_role_access (
  channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  role_id      INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  can_view     INTEGER NOT NULL DEFAULT 0,
  can_connect  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, role_id)
);
