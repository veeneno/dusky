const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const { avatarUpload, bannerUpload } = require('../upload');

const router = express.Router();
const SALT_ROUNDS = 12;
const USERNAME_RE = /^[\p{L}0-9 _-]+$/u;
const BIO_MAX_LEN = 190;
const STATUS_MAX_LEN = 80;

function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

// só quem divide servidor/DM com a pessoa recebe a atualização (inclui ela mesma, pras outras abas)
function broadcastProfileUpdate(user) {
  realtime.sendToUsers(access.relatedUserIds(user.id), { type: 'profile_updated', user: publicUser(user) });
}

// remove um arquivo antigo de upload com segurança (best-effort, ignora erro)
function removeOldUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const filePath = path.join(__dirname, '..', '..', 'public', url);
  fs.unlink(filePath, () => {});
}

// PATCH /api/profile — atualiza nome, status, bio, cor de destaque e/ou cor secundária (degradê)
router.patch('/', requireAuth, (req, res) => {
  const { username, accent_color, accent_color_2, bio, status_text } = req.body || {};
  const updates = [];
  const values = [];

  if (username !== undefined) {
    const cleanUsername = String(username).trim().replace(/\s+/g, ' ');
    if (cleanUsername.length < 2 || cleanUsername.length > 32) {
      return res.status(400).json({ error: 'usuário deve ter entre 2 e 32 caracteres' });
    }
    if (!USERNAME_RE.test(cleanUsername)) {
      return res.status(400).json({ error: 'usuário só pode ter letras, números, espaço, _ ou -' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
      .get(cleanUsername, req.user.id);
    if (existing) {
      return res.status(409).json({ error: 'esse nome de usuário já está em uso' });
    }
    updates.push('username = ?');
    values.push(cleanUsername);
  }

  if (accent_color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(accent_color)) {
      return res.status(400).json({ error: 'cor inválida' });
    }
    updates.push('accent_color = ?');
    values.push(accent_color);
  }

  // accent_color_2 é opcional: null/vazio limpa (volta pra cor sólida), hex válido ativa o degradê
  if (accent_color_2 !== undefined) {
    if (accent_color_2 === null || accent_color_2 === '') {
      updates.push('accent_color_2 = NULL');
    } else if (/^#[0-9a-fA-F]{6}$/.test(accent_color_2)) {
      updates.push('accent_color_2 = ?');
      values.push(accent_color_2);
    } else {
      return res.status(400).json({ error: 'cor secundária inválida' });
    }
  }

  // bio é opcional: string vazia/null limpa, senão precisa caber no limite
  if (bio !== undefined) {
    if (bio === null || bio === '') {
      updates.push('bio = NULL');
    } else if (typeof bio === 'string' && bio.length <= BIO_MAX_LEN) {
      updates.push('bio = ?');
      values.push(bio);
    } else {
      return res.status(400).json({ error: `bio pode ter no máximo ${BIO_MAX_LEN} caracteres` });
    }
  }

  // status personalizado (frase curta embaixo do nome) — vazio/null limpa
  if (status_text !== undefined) {
    const clean = typeof status_text === 'string' ? status_text.trim().replace(/\s+/g, ' ') : '';
    if (!clean) {
      updates.push('status_text = NULL');
    } else if (clean.length <= STATUS_MAX_LEN) {
      updates.push('status_text = ?');
      values.push(clean);
    } else {
      return res.status(400).json({ error: `status pode ter no máximo ${STATUS_MAX_LEN} caracteres` });
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'nada pra atualizar' });
  }

  values.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  broadcastProfileUpdate(user);
  res.json({ user: publicUser(user) });
});

// POST /api/profile/password — troca de senha
router.post('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'preencha a senha atual e a nova' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'a nova senha precisa ter pelo menos 6 caracteres' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'senha atual incorreta' });
  }

  const newHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  res.json({ ok: true });
});

// POST /api/profile/avatar — upload de foto de perfil (imagem ou gif)
router.post('/avatar', requireAuth, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'não deu pra enviar essa imagem' });
    if (!req.file) return res.status(400).json({ error: 'imagem inválida (use png, jpg, webp ou gif)' });

    const oldUser = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
    const url = `/uploads/avatars/${req.file.filename}`;

    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id);
    if (oldUser?.avatar_url) removeOldUpload(oldUser.avatar_url);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    broadcastProfileUpdate(user);
    res.json({ user: publicUser(user) });
  });
});

// POST /api/profile/banner — upload de banner (imagem ou gif)
router.post('/banner', requireAuth, (req, res) => {
  bannerUpload.single('banner')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'não deu pra enviar essa imagem' });
    if (!req.file) return res.status(400).json({ error: 'imagem inválida (use png, jpg, webp ou gif)' });

    const oldUser = db.prepare('SELECT banner_url FROM users WHERE id = ?').get(req.user.id);
    const url = `/uploads/banners/${req.file.filename}`;

    db.prepare('UPDATE users SET banner_url = ? WHERE id = ?').run(url, req.user.id);
    if (oldUser?.banner_url) removeOldUpload(oldUser.banner_url);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    broadcastProfileUpdate(user);
    res.json({ user: publicUser(user) });
  });
});

// DELETE /api/profile/banner — remove o banner de imagem/gif, volta pra cor de destaque (sólida ou degradê)
router.delete('/banner', requireAuth, (req, res) => {
  const oldUser = db.prepare('SELECT banner_url FROM users WHERE id = ?').get(req.user.id);
  db.prepare('UPDATE users SET banner_url = NULL WHERE id = ?').run(req.user.id);
  if (oldUser?.banner_url) removeOldUpload(oldUser.banner_url);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  broadcastProfileUpdate(user);
  res.json({ user: publicUser(user) });
});

module.exports = router;
