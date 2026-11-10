// helper compartilhado pelo bot de música pra postar mensagens no chat como se fosse um
// participante — mesmo mecanismo que uma mensagem normal (INSERT + broadcast via WS), só que
// com user_id nulo e bot_name preenchido (o schema já prevê isso desde o início).
const db = require('../../db');
const realtime = require('../../realtime');
const { MESSAGE_SELECT_BY_ID } = require('../../db/messageQueries');

const BOT_NAME = 'DJ didiscord';

// `embed` (opcional): { title, description, thumbnail, color, fields: [{name, value}], footer }
function postBotMessage(channelId, content, embed) {
  const clean = String(content || '').slice(0, 4000);
  const embedJson = embed ? JSON.stringify(embed) : null;

  const result = db.prepare(
    'INSERT INTO messages (channel_id, bot_name, content, embed_json) VALUES (?, ?, ?, ?)'
  ).run(channelId, BOT_NAME, clean, embedJson);

  const message = db.prepare(MESSAGE_SELECT_BY_ID).get(result.lastInsertRowid);
  realtime.broadcastToChannel(channelId, { type: 'message_created', message });
  return message;
}

module.exports = { postBotMessage, BOT_NAME };
