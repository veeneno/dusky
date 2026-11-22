const crypto = require('crypto');

// tickets de curta duração pra autenticar a conexão WebSocket
// (o cookie de sessão não é acessível diretamente no handshake do WS,
// então o cliente pede um ticket autenticado via REST antes de conectar)
const tickets = new Map();
const TTL_MS = 30 * 1000;

// sv = versão da sessão (users.session_version) de quem pediu: trocar a senha derruba só os
// WebSockets das sessões antigas (realtime.dropOtherSessions)
function issue(userId, sv = 0) {
  const ticket = crypto.randomBytes(24).toString('hex');
  tickets.set(ticket, { userId, sv, expires: Date.now() + TTL_MS });
  return ticket;
}

function consume(ticket) {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket); // uso único
  if (Date.now() > entry.expires) return null;
  return entry;
}

// ticket pedido e nunca usado (aba fechada no meio, conexão que falhou) só saía do Map quando
// alguém tentava usá-lo: ficava pra sempre. A cada minuto os vencidos vão embora. unref pra esse
// timer não segurar o processo aberto (testes, desligamento).
setInterval(() => {
  const now = Date.now();
  for (const [ticket, entry] of tickets) if (now > entry.expires) tickets.delete(ticket);
}, 60 * 1000).unref();

module.exports = { issue, consume };
