const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');
const access = require('../access');
const crypto = require('crypto');
const config = require('../config');
const { avatarUpload, bannerUpload, themeBackgroundUpload, decorUpload, UPLOADS_ROOT } = require('../upload');
const decor = require('../decor'); // placa do nome, decoração do avatar, efeito do perfil
const limits = require('../limits');
const uploadLimits = require('../uploadLimits');

const router = express.Router();
const SALT_ROUNDS = 12;
const USERNAME_RE = /^[\p{L}0-9 _-]+$/u;
const BIO_MAX_LEN = 190;
const STATUS_MAX_LEN = 80;
const { cleanNameStyle } = require('../nameStyle'); // efeito no nome (LED, neon…)

// sem senha, e-mail e segredos das 2 etapas: isto vai pra quem divide servidor com a pessoa
const { stripPrivate: publicUser } = require('../userPrivate');

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
  const { username, accent_color, accent_color_2, bio, status_text, name_style } = req.body || {};
  const updates = [];
  const values = [];

  // decorações: "preset:<nome>", null (tira) ou a mesma imagem que já está (continua). Imagem
  // nova só por POST /api/profile/decor/:slot. Imagem que sair é apagada depois de salvar.
  const decorCurrent = db.prepare('SELECT nameplate, avatar_deco, profile_fx FROM users WHERE id = ?').get(req.user.id) || {};
  const decorDropped = [];
  for (const slot of decor.SLOTS) {
    if (req.body?.[slot] === undefined) continue;
    let clean;
    try { clean = decor.cleanDecor(slot, req.body[slot], decorCurrent[slot]); } catch (err) { return res.status(400).json({ error: err.message }); }
    if (clean.value === decorCurrent[slot]) continue;
    updates.push(`${slot} = ?`);
    values.push(clean.value);
    if (decor.isDecorUpload(decorCurrent[slot])) decorDropped.push(decorCurrent[slot]);
  }

  // efeito no nome: { effect, c1, c2 } ou null (tira o efeito)
  if (name_style !== undefined) {
    let clean;
    try { clean = cleanNameStyle(name_style); } catch (err) { return res.status(400).json({ error: err.message }); }
    if (clean === null) {
      updates.push('name_style = NULL');
    } else {
      updates.push('name_style = ?');
      values.push(clean);
    }
  }

  if (username !== undefined) {
    const cleanUsername = String(username).trim().replace(/\s+/g, ' ');
    if (cleanUsername.length < 2 || cleanUsername.length > 32) {
      return res.status(400).json({ error: 'usuário deve ter entre 2 e 32 caracteres' });
    }
    if (!USERNAME_RE.test(cleanUsername)) {
      return res.status(400).json({ error: 'usuário só pode ter letras, números, espaço, _ ou -' });
    }
    if (require('../accountDeletion').DELETED_NAME.test(cleanUsername)) {
      return res.status(400).json({ error: 'esse nome é reservado' });
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
  for (const url of decorDropped) removeOldUpload(url);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  broadcastProfileUpdate(user);
  res.json({ user: publicUser(user) });
});

// GET /api/profile/upload-limits — limite de anexo desta conta (o composer confere antes de enviar)
router.get('/upload-limits', requireAuth, (req, res) => {
  const l = uploadLimits.limitsFor(req.user.id);
  res.json({ unlimited: l.unlimited, maxMB: l.maxMB, quotaMB: l.quotaMB, usedMB: l.usedMB });
});

// POST /api/profile/password — troca de senha
router.post('/password', requireAuth, limits.perUser('password', 10, 15 * 60 * 1000, 'muitas tentativas de trocar a senha — espera uns minutos'), async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'preencha a senha atual e a nova' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'a nova senha precisa ter pelo menos 8 caracteres' });
  }
  if (newPassword.length > 200) {
    return res.status(400).json({ error: 'senha comprida demais (máximo 200 caracteres)' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  // bcrypt assíncrono: o cálculo roda numa thread à parte e não trava o servidor pra todo mundo
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(401).json({ error: 'senha atual incorreta' });
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  // senha nova desloga os OUTROS aparelhos (session_version); este continua entrado
  db.prepare('UPDATE users SET password_hash = ?, session_version = COALESCE(session_version, 0) + 1 WHERE id = ?').run(newHash, req.user.id);
  const sv = db.prepare('SELECT session_version FROM users WHERE id = ?').get(req.user.id).session_version;
  req.session.sv = sv;
  realtime.dropOtherSessions(req.user.id, sv, { type: 'session_revoked' });
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

// ---------- avatar escolhido no GIPHY ----------
// O site manda só o ID do gif (o mesmo da busca em /api/giphy/search), nunca uma URL: o servidor
// pergunta pro GIPHY qual é o arquivo, baixa (só de *.giphy.com, até 15MB, tem que começar com
// "GIF8") e guarda em /uploads/avatars como qualquer avatar enviado. Assim o avatar não depende
// do GIPHY continuar no ar e quem vê o perfil não faz pedido nenhum pro GIPHY.
const GIPHY_ID_RE = /^[A-Za-z0-9]{1,64}$/;
const GIPHY_AVATAR_MAX = 15 * 1024 * 1024;
// fixed_height (200 px de altura, ~0,5–2 MB) sobra pro maior avatar do app (cartão de perfil); o
// downsized_medium chegava a 7 MB — pesado demais pra algo que aparece em toda mensagem/lista.
// Os outros só se o GIPHY não tiver esse
const GIPHY_RENDITIONS = ['fixed_height', 'downsized', 'downsized_medium', 'original'];

function giphyFileUrl(gif) {
  const imgs = (gif && gif.images) || {};
  for (const key of GIPHY_RENDITIONS) {
    const r = imgs[key];
    if (!r || !r.url) continue;
    const size = Number(r.size) || 0;
    if (size > GIPHY_AVATAR_MAX) continue;
    try {
      const u = new URL(r.url);
      if (u.protocol === 'https:' && (u.hostname === 'giphy.com' || u.hostname.endsWith('.giphy.com'))) return u.toString();
    } catch (_) { /* url estranha: tenta a próxima */ }
  }
  return null;
}

// baixa no máximo `max` bytes; passou disso, desiste
async function downloadLimited(url, max) {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > max) throw new Error('grande demais');
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > max) throw new Error('grande demais');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

// POST /api/profile/avatar/giphy { id } — usa um gif do GIPHY como avatar
router.post('/avatar/giphy', requireAuth, async (req, res) => {
  const id = String((req.body && req.body.id) || '');
  if (!GIPHY_ID_RE.test(id)) return res.status(400).json({ error: 'gif inválido' });
  if (!config.giphyApiKey) return res.status(503).json({ error: 'GIPHY não configurado no servidor' });

  let buf;
  try {
    const info = await fetch(`https://api.giphy.com/v1/gifs/${id}?api_key=${encodeURIComponent(config.giphyApiKey)}`, { signal: AbortSignal.timeout(10000) });
    if (!info.ok) return res.status(info.status === 404 ? 404 : 502).json({ error: info.status === 404 ? 'esse gif não existe mais' : 'o GIPHY não respondeu' });
    const url = giphyFileUrl((await info.json()).data);
    if (!url) return res.status(400).json({ error: 'esse gif é grande demais pra avatar' });
    buf = await downloadLimited(url, GIPHY_AVATAR_MAX);
  } catch (err) {
    console.error('[giphy] avatar:', err.message);
    return res.status(502).json({ error: 'não deu pra baixar esse gif agora' });
  }
  if (buf.length < 6 || buf.toString('latin1', 0, 4) !== 'GIF8') {
    return res.status(400).json({ error: 'o GIPHY não mandou um gif' });
  }

  const filename = crypto.randomBytes(16).toString('hex') + '.gif';
  try {
    await fs.promises.writeFile(path.join(UPLOADS_ROOT, 'avatars', filename), buf);
  } catch (err) {
    console.error('[giphy] avatar: não salvou:', err.message);
    return res.status(500).json({ error: 'não deu pra salvar o avatar' });
  }

  const oldUser = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(`/uploads/avatars/${filename}`, req.user.id);
  if (oldUser?.avatar_url) removeOldUpload(oldUser.avatar_url);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  broadcastProfileUpdate(user);
  res.json({ user: publicUser(user) });
});

// POST /api/profile/decor/:slot — imagem própria pra uma decoração (campo "image"): placa do nome
// (nameplate), decoração do avatar (avatar_deco) ou efeito do perfil (profile_fx). Salva na hora,
// igual ao avatar; a imagem anterior dessa decoração (se era enviada) é apagada.
router.post('/decor/:slot', requireAuth, (req, res) => {
  const slot = req.params.slot;
  if (!decor.SLOTS.includes(slot)) return res.status(404).json({ error: 'decoração inválida' });
  decorUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'imagem grande demais (até 10MB)' : 'não deu pra enviar essa imagem' });
    if (!req.file) return res.status(400).json({ error: 'imagem inválida (use png, webp, gif ou jpg)' });

    const url = `/uploads/decor/${req.file.filename}`;
    const old = db.prepare(`SELECT ${slot} AS v FROM users WHERE id = ?`).get(req.user.id);
    db.prepare(`UPDATE users SET ${slot} = ? WHERE id = ?`).run(url, req.user.id);
    if (decor.isDecorUpload(old?.v)) removeOldUpload(old.v);

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

// ------------------------------------------------------------------
// tema (aparência) de cada pessoa — o JSON é montado e validado no site (js/themes.js); aqui só
// guarda, com limite de tamanho. Vale em todos os aparelhos da pessoa.
// ------------------------------------------------------------------

const THEME_MAX_BYTES = 400 * 1024;

// GET /api/profile/theme -> { theme, saved }
router.get('/theme', requireAuth, (req, res) => {
  const row = db.prepare('SELECT theme_json FROM users WHERE id = ?').get(req.user.id);
  let data = {};
  try { data = row && row.theme_json ? JSON.parse(row.theme_json) : {}; } catch (_) { data = {}; }
  res.json({ theme: data.theme || null, saved: Array.isArray(data.saved) ? data.saved : [] });
});

// PUT /api/profile/theme { theme, saved }
router.put('/theme', requireAuth, (req, res) => {
  const { theme, saved } = req.body || {};
  if (theme != null && typeof theme !== 'object') return res.status(400).json({ error: 'tema inválido' });
  const json = JSON.stringify({ theme: theme || null, saved: Array.isArray(saved) ? saved.slice(0, 20) : [] });
  if (Buffer.byteLength(json) > THEME_MAX_BYTES) return res.status(413).json({ error: 'tema grande demais (o CSS próprio tem limite)' });
  db.prepare('UPDATE users SET theme_json = ? WHERE id = ?').run(json, req.user.id);
  // o fundo enviado saiu do tema (trocou por link, degradê ou outro fundo): o arquivo vai embora
  sweepThemeBackgrounds(req.user.id);
  res.json({ ok: true });
});

// Imagem de fundo do tema: cada envio cria um arquivo novo, e antes o antigo ficava no disco pra
// sempre. Agora users.theme_bg_url guarda os fundos que a pessoa enviou e ainda estão no disco
// (JSON com uma lista; o último é o atual). A cada envio e a cada tema salvo, os que não são o
// atual são apagados — mas só se nenhum tema (nem os "meus temas" da pessoa, nem o de um amigo que
// copiou o código do tema) ainda aponta pra eles. Só apaga arquivo que a própria pessoa enviou.
// É uma lista, e não um só, porque o fundo antigo pode continuar no tema até o próximo "salvar"
// (enviou outro e ainda não salvou): com um só, esse antigo perderia o dono e ficaria pra sempre.
// Fundo enviado há menos de THEME_BG_GRACE_MS nunca é apagado: um "salvar" que saiu do navegador
// antes do envio terminar (o tema salva sozinho 0,7 s depois de cada mudança) ainda não tem a URL nova.
const THEME_BG_TRACK_MAX = 30;
const THEME_BG_GRACE_MS = 2 * 60 * 1000;
function isFreshUpload(url) {
  try { return Date.now() - fs.statSync(path.join(UPLOADS_ROOT, url.slice('/uploads/'.length))).mtimeMs < THEME_BG_GRACE_MS; } catch (_) { return false; }
}
function themeBgList(userId) {
  const raw = db.prepare('SELECT theme_bg_url FROM users WHERE id = ?').get(userId)?.theme_bg_url;
  try { const list = JSON.parse(raw || '[]'); return Array.isArray(list) ? list.filter((u) => typeof u === 'string') : []; } catch (_) { return []; }
}
function sweepThemeBackgrounds(userId, current) {
  const list = themeBgList(userId);
  const used = db.prepare('SELECT 1 FROM users WHERE instr(theme_json, ?) > 0 LIMIT 1');
  const keep = [];
  for (const url of list) {
    if (url === current || used.get(url) || isFreshUpload(url)) keep.push(url);
    else removeOldUpload(url);
  }
  if (current && !keep.includes(current)) keep.push(current);
  db.prepare('UPDATE users SET theme_bg_url = ? WHERE id = ?')
    .run(keep.length ? JSON.stringify(keep.slice(-THEME_BG_TRACK_MAX)) : null, userId);
}

// POST /api/profile/theme/background — imagem de fundo do tema (png/jpg/webp/gif até 15MB)
router.post('/theme/background', requireAuth, (req, res) => {
  themeBackgroundUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'imagem grande demais (máximo 15MB)' : 'não deu pra enviar essa imagem' });
    if (!req.file) return res.status(400).json({ error: 'imagem inválida (use png, jpg, webp ou gif)' });
    const url = `/uploads/themes/${req.file.filename}`;
    sweepThemeBackgrounds(req.user.id, url);
    res.json({ url });
  });
});

module.exports = router;
