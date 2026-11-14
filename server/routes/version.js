// GET /api/version — versão do site (package.json) + commit que está rodando (lido do .git, sem
// precisar do git instalado). A tela de configurações mostra isso junto com a versão do app.
const express = require('express');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const pkg = require(path.join(ROOT, 'package.json'));

function readCommit() {
  try {
    const gitDir = path.join(ROOT, '.git');
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head.slice(0, 7);
    const ref = head.slice(4).trim();
    try { return fs.readFileSync(path.join(gitDir, ref), 'utf8').trim().slice(0, 7); } catch (_) { /* pode estar no packed-refs */ }
    const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(' ' + ref));
    return line ? line.slice(0, 7) : null;
  } catch (_) {
    return null;
  }
}

// lido uma vez: o servidor reinicia a cada deploy (git pull + npm start)
const INFO = { name: 'dusky', version: pkg.version, codename: pkg.codename || null, commit: readCommit() };

const router = express.Router();
router.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(INFO);
});

module.exports = router;
module.exports.INFO = INFO;
