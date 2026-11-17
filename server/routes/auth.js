const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const limits = require('../limits');

const router = express.Router();
const SALT_ROUNDS = 12;

// limite simples de tentativas por IP (em memória): como o cadastro agora é aberto, isso segura
// ataque de força bruta em senha e criação de conta em massa sem precisar de nada externo
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = { login: 20, register: 5 };
const attempts = new Map(); // `${kind}:${ip}` -> [timestamps]

function rateLimited(kind, req) {
  const key = `${kind}:${req.ip}`;
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  attempts.set(key, list);
  return list.length > RATE_MAX[kind];
}

setInterval(() => {
  const now = Date.now();
  for (const [key, list] of attempts) {
    const fresh = list.filter((t) => now - t < RATE_WINDOW_MS);
    if (fresh.length) attempts.set(key, fresh); else attempts.delete(key);
  }
}, RATE_WINDOW_MS).unref();

function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

// aceita letras (com acento), números, espaço, _ e -
const USERNAME_RE = /^[\p{L}0-9 _-]+$/u;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  if (rateLimited('register', req)) {
    return res.status(429).json({ error: 'muitas contas criadas daqui — tenta de novo daqui a pouco' });
  }
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'usuário e senha são obrigatórios' });
  }

  const cleanUsername = username.trim().replace(/\s+/g, ' ');

  if (cleanUsername.length < 2 || cleanUsername.length > 32) {
    return res.status(400).json({ error: 'usuário deve ter entre 2 e 32 caracteres' });
  }
  if (!USERNAME_RE.test(cleanUsername)) {
    return res.status(400).json({ error: 'usuário só pode ter letras, números, espaço, _ ou -' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'senha precisa ter pelo menos 6 caracteres' });
  }
  if (password.length > 200) {
    return res.status(400).json({ error: 'senha comprida demais (máximo 200 caracteres)' });
  }

  // sem limite de contas: qualquer um pode se cadastrar. O que controla quem vê o quê agora são
  // os servidores — uma conta nova não enxerga nada até entrar num servidor por convite.
  const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
  if (existing) {
    return res.status(409).json({ error: 'esse usuário já existe' });
  }

  // assíncrono: o cálculo (proposital, ~250 ms) roda fora da thread principal e não trava o site
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // enquanto o hash era calculado, outro pedido pode ter criado o mesmo nome: confere de novo
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername)) {
    return res.status(409).json({ error: 'esse usuário já existe' });
  }
  let result;
  try {
    result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(cleanUsername, passwordHash);
  } catch (_) {
    return res.status(409).json({ error: 'esse usuário já existe' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  req.session.userId = user.id;
  req.session.sv = user.session_version || 0;
  res.status(201).json({ user: publicUser(user) });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  if (rateLimited('login', req)) {
    return res.status(429).json({ error: 'muitas tentativas — espera uns minutos e tenta de novo' });
  }
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'usuário e senha são obrigatórios' });
  }

  // além do limite por IP: limite por CONTA, pra quem tenta a senha de alguém a partir de vários IPs
  if (limits.hit('login-user', username.trim().toLowerCase(), 30, RATE_WINDOW_MS)) {
    return res.status(429).json({ error: 'muitas tentativas nessa conta — espera uns minutos e tenta de novo' });
  }
  if (password.length > 200 || username.length > 64) {
    return res.status(401).json({ error: 'usuário ou senha incorretos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  // mensagem genérica de propósito, não dá pra saber se o usuário existe ou não
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'usuário ou senha incorretos' });
  }

  if (user.banned_at) {
    return res.status(403).json({ error: user.ban_reason ? `sua conta foi suspensa: ${user.ban_reason}` : 'sua conta foi suspensa' });
  }
  req.session.userId = user.id;
  req.session.sv = user.session_version || 0;
  res.json({ user: publicUser(user) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
