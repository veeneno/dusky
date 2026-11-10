const crypto = require('crypto');

// tickets de curta duração pra autenticar a conexão WebSocket
// (o cookie de sessão não é acessível diretamente no handshake do WS,
// então o cliente pede um ticket autenticado via REST antes de conectar)
const tickets = new Map();
const TTL_MS = 30 * 1000;

function issue(userId) {
  const ticket = crypto.randomBytes(24).toString('hex');
  tickets.set(ticket, { userId, expires: Date.now() + TTL_MS });
  return ticket;
}

function consume(ticket) {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket); // uso único
  if (Date.now() > entry.expires) return null;
  return entry;
}

module.exports = { issue, consume };
