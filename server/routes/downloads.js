// app desktop pra baixar: a pasta downloads/ (fora do git) recebe os instaladores pelo
// `npm run release` da pasta tauri/ (app novo; antes, da pasta electron/). Daqui saem a página
// /baixar, a atualização automática do app novo (latest.json) e a do Electron antigo (latest*.yml,
// que agora apontam pro app novo — é assim que quem tem o Electron migra sem reinstalar).
const express = require('express');
const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'downloads');
const router = express.Router();

// lê o essencial de um latest*.yml do electron-builder (version, arquivo, tamanho, data)
function readYml(name) {
  try {
    const text = fs.readFileSync(path.join(DOWNLOADS_DIR, name), 'utf8');
    const get = (re) => { const m = text.match(re); return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null; };
    return {
      version: get(/^version:\s*(.+)$/m),
      file: get(/^\s*-\s*url:\s*(.+)$/m) || get(/^path:\s*(.+)$/m),
      size: Number(get(/^\s+size:\s*(\d+)$/m)) || null,
      date: get(/^releaseDate:\s*(.+)$/m),
    };
  } catch (_) {
    return null;
  }
}

function fileInfo(file) {
  if (!file || file.includes('/') || file.includes('\\')) return null;
  try {
    const st = fs.statSync(path.join(DOWNLOADS_DIR, file));
    return { file, url: `/downloads/${encodeURIComponent(file)}`, size: st.size };
  } catch (_) {
    return null;
  }
}

// GET /api/downloads — versão atual de cada sistema (público: a página de instalação usa sem login).
// App novo (tauri/, latest.json) primeiro; sem ele, o que o app Electron antigo publicou (latest*.yml).
function readManifest() {
  try { return JSON.parse(fs.readFileSync(path.join(DOWNLOADS_DIR, 'latest.json'), 'utf8')); } catch (_) { return null; }
}

router.get('/api/downloads', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const m = readManifest();
  if (m && m.platforms) {
    const p = m.platforms;
    const pick = (...keys) => { for (const k of keys) if (p[k] && p[k].url) return fileInfo(path.basename(p[k].url)); return null; };
    return res.json({
      app: 'tauri',
      version: m.version || null,
      codename: m.codename || null,
      notes: m.notes || null,
      date: m.pub_date || null,
      windows: pick('windows-x86_64-nsis', 'windows-x86_64'),
      appimage: pick('linux-x86_64-appimage', 'linux-x86_64'),
      deb: pick('linux-x86_64-deb'),
    });
  }
  const win = readYml('latest.yml');
  const linux = readYml('latest-linux.yml');
  const version = (linux && linux.version) || (win && win.version) || null;
  const deb = version ? (fileInfo(`dusky-${version}.deb`) || fileInfo(`didiscord-${version}.deb`)) : null; // nome antigo dos arquivos
  res.json({
    app: 'electron',
    version,
    codename: null,
    notes: null,
    date: (linux && linux.date) || (win && win.date) || null,
    windows: win && fileInfo(win.file),
    appimage: linux && fileInfo(linux.file),
    deb,
  });
});

// latest.json do app novo (tauri/, atualizador assinado). O `npm run release` grava só o nome de
// cada arquivo; aqui ele vira endereço completo no MESMO endereço por onde o app perguntou
// (dusky.veneno.space, o antigo, um IP de teste…) — assim um latest.json serve pra todos.
router.get('/downloads/latest.json', (req, res, next) => {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(DOWNLOADS_DIR, 'latest.json'), 'utf8'));
  } catch (_) {
    return next(); // sem app novo publicado: 404 normal (o app entende como "sem atualização")
  }
  const base = `${req.protocol}://${req.get('host')}/downloads/`;
  for (const p of Object.values(manifest.platforms || {})) {
    if (p && p.url && !/^https?:\/\//i.test(p.url)) p.url = base + encodeURIComponent(p.url);
  }
  res.set('Cache-Control', 'no-cache');
  res.json(manifest);
});

// os arquivos em si. Os latest*.yml nunca ficam em cache (é por eles que o app descobre que tem
// versão nova); os instaladores podem, porque cada versão tem um nome diferente.
router.use('/downloads', express.static(DOWNLOADS_DIR, {
  fallthrough: false,
  setHeaders: (res, filePath) => {
    if (/\.(yml|json)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
    if (/\.(exe|AppImage|deb)$/.test(filePath)) res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  },
}));

router.get('/baixar', (req, res) => res.sendFile(path.join(__dirname, '..', '..', 'public', 'baixar.html')));

module.exports = router;
