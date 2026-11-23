'use strict';
// "site de teste": quem liga a chave (configurações → app e versões) recebe o SITE (html/js/css) da
// branch testes — a pasta do git worktree ../dusky-testes, ver tauri/README.md → "Builds de teste" —
// em vez do da main. Só muda o que sai de public/: o servidor (API, calls, banco) é o mesmo pra todo
// mundo, então serve pra novidade que mexe só no site (o FSR e a geração de quadros, por exemplo).
// Quem não liga não vê diferença nenhuma. Funciona no navegador e nos apps, sem build nova.
//
// Liga e desliga com um cookie (dusky_site=testes), lido em todo pedido de arquivo do site:
//   GET    /api/site-testes   { available, on, commit }  (a chave só aparece se a pasta existe)
//   PUT    /api/site-testes   liga
//   DELETE /api/site-testes   desliga
//   GET    /site-teste/sair   desliga e volta pro app: saída de emergência pelo navegador, caso o site
//                             de teste quebre a ponto de não abrir as configurações
//
// A pasta: DUSKY_TESTES_PUBLIC no .env, senão ../dusky-testes/public ao lado da pasta do site.
// Arquivo que não existe lá cai no site normal (o express.static de baixo). Anexos, downloads,
// vendor/ e decor/media/ saem sempre do site normal: são arquivos grandes ou da pessoa, não código.
// A branch muda sem reiniciar o servidor: um `git pull` no worktree já vale no próximo pedido (os
// arquivos são revalidados a cada uso, como no site normal). Se um dia a branch mexer em server/,
// isso NÃO vai junto: aí é testar com um servidor à parte.

const fs = require('fs');
const path = require('path');
const express = require('express');

const COOKIE = 'dusky_site';
const COOKIE_RE = new RegExp(`(?:^|;\\s*)${COOKIE}=testes(?:;|$)`);
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60 * 1000; // 90 dias
// nunca saem da pasta da branch: API/tempo real (não são arquivo), anexos (routes/uploads.js),
// downloads do app, bibliotecas e mídia grandes
const SKIP = /^\/(api|ws|livekit|uploads|downloads|vendor|decor\/media)(\/|$)/;

// commit em que uma pasta do git está, sem precisar do git instalado. Entende worktree (o .git é
// um arquivo "gitdir: ..." e a ref fica na pasta comum, apontada pelo "commondir")
function gitCommit(root) {
  try {
    let gitDir = path.join(root, '.git');
    if (fs.statSync(gitDir).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(gitDir, 'utf8'));
      if (!m) return null;
      gitDir = path.resolve(root, m[1].trim());
    }
    let common = gitDir;
    try { common = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim()); } catch (_) { /* repositório normal */ }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head.slice(0, 7);
    const ref = head.slice(4).trim();
    for (const dir of [gitDir, common]) {
      try { return fs.readFileSync(path.join(dir, ref), 'utf8').trim().slice(0, 7); } catch (_) { /* tenta a próxima */ }
    }
    const packed = fs.readFileSync(path.join(common, 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(' ' + ref));
    return line ? line.slice(0, 7) : null;
  } catch (_) {
    return null;
  }
}

function create({ dir, mainDir } = {}) {
  const testesDir = path.resolve(dir);
  const sameAsMain = mainDir && path.resolve(mainDir) === testesDir;
  // a pasta pode sumir ou voltar (worktree removido/recriado): confere de novo a cada 5 s
  let checkedAt = 0;
  let exists = false;
  function available() {
    if (sameAsMain) return false;
    const now = Date.now();
    if (now - checkedAt > 5000) {
      checkedAt = now;
      try { exists = fs.statSync(path.join(testesDir, 'app.html')).isFile(); } catch (_) { exists = false; }
    }
    return exists;
  }
  const isOn = (req) => COOKIE_RE.test(String(req.headers.cookie || ''));
  const cookieOptions = (req) => ({ httpOnly: true, sameSite: 'lax', secure: !!req.secure, path: '/' });

  const router = express.Router();
  router.get('/api/site-testes', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ok = available();
    res.json({ available: ok, on: ok && isOn(req), commit: ok ? gitCommit(path.dirname(testesDir)) : null });
  });
  router.put('/api/site-testes', (req, res) => {
    if (!available()) return res.status(404).json({ error: 'o site de teste não está neste servidor' });
    res.cookie(COOKIE, 'testes', { ...cookieOptions(req), maxAge: COOKIE_MAX_AGE });
    res.json({ on: true });
  });
  router.delete('/api/site-testes', (req, res) => {
    res.clearCookie(COOKIE, cookieOptions(req));
    res.json({ on: false });
  });
  router.get('/site-teste/sair', (req, res) => {
    res.clearCookie(COOKIE, cookieOptions(req));
    res.set('Cache-Control', 'no-store');
    res.redirect('/app.html');
  });

  // vai ANTES do express.static do site normal, com as mesmas opções (CSP nas páginas etc.)
  function staticMiddleware(options = {}) {
    const serve = express.static(testesDir, {
      ...options,
      setHeaders: (res, filePath, stat) => {
        if (options.setHeaders) options.setHeaders(res, filePath, stat);
        // private: a Cloudflare nunca guarda a versão de teste (o endereço é o mesmo do site normal)
        res.setHeader('Cache-Control', 'private, no-cache');
        res.setHeader('Vary', 'Cookie');
      },
    });
    return (req, res, next) => {
      if (!isOn(req) || SKIP.test(req.path) || !available()) return next();
      serve(req, res, next);
    };
  }

  return { router, staticMiddleware, available, isOn };
}

const ROOT = path.join(__dirname, '..');
const DEFAULT_DIR = process.env.DUSKY_TESTES_PUBLIC || path.join(ROOT, '..', 'dusky-testes', 'public');

module.exports = create({ dir: DEFAULT_DIR, mainDir: path.join(ROOT, 'public') });
module.exports.create = create;
module.exports.gitCommit = gitCommit;
