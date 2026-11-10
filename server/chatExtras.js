// "extras" das mensagens: menções, reações, fixadas e até onde cada um leu. Fica separado das rotas
// porque tanto o envio normal (routes/messages.js) quanto o bot de música e o histórico usam.
const db = require('./db');

// ------------------------------------------------------------------
// menções
// ------------------------------------------------------------------
// No texto salvo, uma menção é <@123> (o id, como no Discord): o nome pode mudar e ter espaço, o id
// não. O site troca isso por "@nome" na hora de mostrar. @everyone e @here avisam todo mundo do canal.

const MENTION_RE = /<@(\d{1,10})>/g;
const EVERYONE_RE = /(^|[^\w`])@(everyone|here)\b/;
const EVERYONE_ID = 0;

function mentionedIds(content) {
  const ids = new Set();
  if (typeof content !== 'string') return ids;
  for (const m of content.matchAll(MENTION_RE)) ids.add(Number(m[1]));
  return ids;
}

function mentionsEveryone(content) {
  return typeof content === 'string' && EVERYONE_RE.test(content);
}

// grava quem a mensagem menciona (substitui o que tinha — serve também pra edição)
function saveMentions(messageId, content) {
  const ids = [...mentionedIds(content)];
  if (mentionsEveryone(content)) ids.push(EVERYONE_ID);
  db.prepare('DELETE FROM message_mentions WHERE message_id = ?').run(messageId);
  if (!ids.length) return;
  const existing = new Set(
    db.prepare(`SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((r) => r.id)
  );
  const ins = db.prepare('INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)');
  for (const id of ids) if (id === EVERYONE_ID || existing.has(id)) ins.run(messageId, id);
}

// ------------------------------------------------------------------
// reações
// ------------------------------------------------------------------

const MAX_REACTIONS_PER_MESSAGE = 20; // emojis diferentes por mensagem

// emoji "de verdade": uma sequência curta de pictogramas (com modificador de cor de pele, ZWJ,
// bandeiras e teclas como 1️⃣). Recusa texto comum, pra reação não virar um jeito de mandar recado.
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣|[‍️\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}])+$/u;

function isEmoji(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= 32 && EMOJI_RE.test(s);
}

// reações agrupadas por emoji, na ordem em que apareceram: [{ emoji, user_ids: [...] }]
function reactionsFor(messageIds) {
  const out = new Map();
  if (!messageIds.length) return out;
  const rows = db.prepare(`
    SELECT message_id, emoji, user_id, MIN(created_at) OVER (PARTITION BY message_id, emoji) AS first_at, created_at
    FROM message_reactions WHERE message_id IN (${messageIds.map(() => '?').join(',')})
    ORDER BY message_id, first_at, emoji, created_at
  `).all(...messageIds);
  for (const r of rows) {
    if (!out.has(r.message_id)) out.set(r.message_id, []);
    const list = out.get(r.message_id);
    let group = list.find((g) => g.emoji === r.emoji);
    if (!group) { group = { emoji: r.emoji, user_ids: [] }; list.push(group); }
    group.user_ids.push(r.user_id);
  }
  return out;
}

// ------------------------------------------------------------------
// completa as mensagens que vão pro site: reações + nome de quem foi mencionado
// ------------------------------------------------------------------

function decorateMessages(rows) {
  if (!rows.length) return rows;
  const reactions = reactionsFor(rows.map((r) => r.id));
  const ids = new Set();
  for (const r of rows) {
    for (const id of mentionedIds(r.content)) ids.add(id);
    for (const id of mentionedIds(r.reply_content)) ids.add(id);
  }
  const users = ids.size
    ? new Map(db.prepare(`SELECT id, username, accent_color FROM users WHERE id IN (${[...ids].map(() => '?').join(',')})`).all(...ids).map((u) => [u.id, u]))
    : new Map();
  for (const r of rows) {
    r.reactions = reactions.get(r.id) || [];
    const mine = new Set([...mentionedIds(r.content), ...mentionedIds(r.reply_content)]);
    r.mention_users = [...mine].map((id) => users.get(id)).filter(Boolean);
    r.mentions_everyone = mentionsEveryone(r.content);
    r.pinned = !!r.pinned_at;
  }
  return rows;
}

function decorateMessage(row) {
  return row ? decorateMessages([row])[0] : row;
}

// ------------------------------------------------------------------
// leituras
// ------------------------------------------------------------------

// avança (nunca volta) até onde `userId` leu o canal
function markRead(userId, channelId, messageId) {
  const id = Number(messageId) || 0;
  db.prepare(`
    INSERT INTO channel_reads (user_id, channel_id, last_read_id) VALUES (?, ?, ?)
    ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)
  `).run(userId, channelId, id);
  return db.prepare('SELECT last_read_id FROM channel_reads WHERE user_id = ? AND channel_id = ?').get(userId, channelId).last_read_id;
}

function lastMessageId(channelId) {
  return db.prepare('SELECT MAX(id) AS id FROM messages WHERE channel_id = ?').get(channelId).id || 0;
}

// entrou num servidor: o histórico que já existia não conta como "não lido"
function markServerRead(serverId, userId) {
  db.prepare(`
    INSERT INTO channel_reads (user_id, channel_id, last_read_id)
      SELECT ?, c.id, COALESCE((SELECT MAX(id) FROM messages m WHERE m.channel_id = c.id), 0)
      FROM channels c WHERE c.server_id = ? AND c.type = 'text'
    ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)
  `).run(userId, serverId);
}

module.exports = {
  EVERYONE_ID, mentionedIds, mentionsEveryone, saveMentions,
  MAX_REACTIONS_PER_MESSAGE, isEmoji, reactionsFor,
  decorateMessages, decorateMessage,
  markRead, lastMessageId, markServerRead,
};
