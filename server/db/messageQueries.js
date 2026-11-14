// colunas/joins compartilhados de mensagem — usados tanto pro histórico (routes/messages.js) quanto
// pra devolver uma mensagem recém-inserida já com autor/reply prontos pro broadcast (inclusive
// mensagens de bot, em bots/musicBot/post.js). `server_id` vai junto pro front saber de qual
// servidor (ou DM, quando null) a mensagem é — usado pra marcar não lidas fora do canal aberto.
const MESSAGE_COLUMNS = `
    SELECT m.id, m.channel_id, m.content, m.attachment_url, m.attachment_type, m.attachment_name, m.attachment_size, m.bot_name, m.embed_json, m.created_at, m.reply_to_id, m.edited, m.pinned_at, m.pinned_by,
           m.system_type, m.system_user_id, su.username AS system_username, su.avatar_url AS system_avatar_url,
           c.server_id, c.name AS channel_name,
           u.id AS user_id, u.username, u.avatar_url, u.accent_color, u.accent_color_2, u.name_style,
           r.content AS reply_content, r.attachment_type AS reply_attachment_type, r.bot_name AS reply_bot_name,
           ru.username AS reply_username
    FROM messages m
    JOIN channels c ON c.id = m.channel_id
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN users su ON su.id = m.system_user_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = r.user_id
`;

const MESSAGE_SELECT_BY_ID = `${MESSAGE_COLUMNS} WHERE m.id = ?`;

module.exports = { MESSAGE_COLUMNS, MESSAGE_SELECT_BY_ID };
