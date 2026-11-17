// Limites contra abuso: quantas vezes alguém pode fazer algo num intervalo (rateLimit / middleware
// perUser) e quantos processos pesados (yt-dlp, ffmpeg) podem rodar ao mesmo tempo (semaphore).
// Tudo em memória — reiniciar o servidor zera as contagens, o que é aceitável pra isso.

// ------------------------------------------------------------------ frequência

const buckets = new Map(); // `${kind}:${key}` -> [timestamps]

// true = estourou. `max` ações dentro de `windowMs`. Conta a tentativa mesmo quando recusa, pra
// quem insiste continuar barrado em vez de entrar de novo assim que uma antiga expira.
function hit(kind, key, max, windowMs) {
  const id = `${kind}:${key}`;
  const now = Date.now();
  const list = (buckets.get(id) || []).filter((t) => now - t < windowMs);
  list.push(now);
  buckets.set(id, list);
  return list.length > max;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, list] of buckets) {
    // a maior janela usada é 1 h: o que for mais velho que isso não conta pra nada
    const fresh = list.filter((t) => now - t < 60 * 60 * 1000);
    if (fresh.length) buckets.set(id, fresh); else buckets.delete(id);
  }
}, 5 * 60 * 1000).unref();

// middleware do express: por conta (req.user, depois do requireAuth) ou por IP quando não tem login.
// O admin do site não passa por limite nenhum.
const adminCache = new Map(); // userId -> { admin, at } (60 s, pra não consultar o banco a cada pedido)
function isSiteAdmin(userId) {
  const cached = adminCache.get(userId);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.admin;
  const row = require('./db').prepare('SELECT is_site_admin FROM users WHERE id = ?').get(userId);
  const admin = !!(row && row.is_site_admin);
  adminCache.set(userId, { admin, at: Date.now() });
  return admin;
}

function perUser(kind, max, windowMs, message) {
  return (req, res, next) => {
    if (req.user && req.user.is_site_admin) return next();
    // antes do requireAuth (montado no index.js) ainda não tem req.user, mas o id da sessão (cookie
    // assinado) já identifica a conta
    const uid = req.user ? req.user.id : (req.session && req.session.userId);
    if (uid && !req.user && isSiteAdmin(uid)) return next();
    const key = uid ? `u${uid}` : `ip${req.ip}`;
    if (hit(kind, key, max, windowMs)) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message || 'calma aí — muitas tentativas seguidas, tenta de novo daqui a pouco' });
    }
    next();
  };
}

// ------------------------------------------------------------------ concorrência

// Fila simples: no máximo `limit` tarefas rodando; as outras esperam (até `maxQueue`, depois disso
// recusa na hora pra fila não crescer sem fim).
function semaphore(limit, maxQueue = 50) {
  let running = 0;
  const waiting = [];
  const release = () => {
    running--;
    const next = waiting.shift();
    if (next) { running++; next(); }
  };
  return async function run(task) {
    if (running >= limit) {
      if (waiting.length >= maxQueue) throw new Error('servidor ocupado — tenta de novo daqui a pouco');
      await new Promise((resolve) => waiting.push(resolve));
    } else {
      running++;
    }
    try { return await task(); } finally { release(); }
  };
}

module.exports = { hit, perUser, semaphore };
