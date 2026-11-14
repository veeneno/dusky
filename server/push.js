// A assinatura pertence a um aparelho e conta. Nunca enviamos conteúdo no push:
// o worker busca a mensagem com a sessão atual e as permissões atuais.
// Sem o pacote instalado (faltou rodar npm install) o site sobe normalmente, só sem push.
let webpush = null;
try { webpush = require('web-push'); } catch (_) { console.log('[push] pacote web-push não instalado — rode npm install pra ter notificações com o site fechado'); }
const db = require('./db');
const access = require('./access');
const transport = { send: (...args) => webpush.sendNotification(...args) };
let keys;
function getKeys() {
  if (!webpush) return null;
  if (keys) return keys;
  const saved = db.prepare("SELECT value FROM app_secrets WHERE name = 'vapid'").get();
  keys = saved ? JSON.parse(saved.value) : webpush.generateVAPIDKeys();
  if (!saved) db.prepare("INSERT INTO app_secrets (name, value) VALUES ('vapid', ?)").run(JSON.stringify(keys));
  return keys;
}
function eligible(sub, message) {
  if (sub.user_id === message.user_id || sub.level === 'none') return false;
  if (!access.canAccessChannel(message.channel_id, sub.user_id)) return false;
  const user = db.prepare('SELECT banned_at, session_version, presence_status FROM users WHERE id = ?').get(sub.user_id);
  if (!user || user.banned_at || user.session_version !== sub.session_version) return false;
  if (user.presence_status === 'idle') return false; // inativo: mensagem não avisa (ver realtime.js)
  return sub.level === 'all' || message.server_id == null || !!db.prepare('SELECT 1 FROM message_mentions WHERE message_id = ? AND user_id IN (0, ?)').get(message.id, sub.user_id);
}
async function notifyMessage(message) {
  const vapid = getKeys();
  if (!vapid) return;
  // só as inscrições de quem enxerga o canal (em vez de ler a tabela inteira a cada mensagem)
  const audience = access.channelAudience(message.channel_id).filter(id => id !== message.user_id);
  if (!audience.length) return;
  const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${audience.map(() => '?').join(',')})`).all(...audience).filter(s => eligible(s, message));
  // Pequenos lotes evitam abrir uma conexão por usuário de uma vez.
  for (let i = 0; i < subs.length; i += 8) await Promise.all(subs.slice(i, i + 8).map(async sub => {
    try {
      await transport.send(JSON.parse(sub.subscription), JSON.stringify({ messageId: message.id, userId: sub.user_id }), {
        TTL: 300, timeout: 10000,
        vapidDetails: { subject: process.env.WEB_PUSH_SUBJECT || 'https://dusky.veneno.space', ...vapid },
      });
    } catch (err) {
      if ([404, 410].includes(err.statusCode)) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND subscription = ?').run(sub.endpoint, sub.subscription);
      else console.error('[push] falha de entrega', err.statusCode || err.code || 'rede');
    }
  }));
}
module.exports = { getKeys, eligible, notifyMessage, transport };
