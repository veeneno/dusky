// app desktop pra baixar: a pasta downloads/ (fora do git) recebe os instaladores pelo
// `npm run release` da pasta electron/. Daqui saem a página /baixar e a atualização automática.
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

// GET /api/downloads — versão atual de cada sistema (público: a página de instalação usa sem login)
router.get('/api/downloads', (req, res) => {
  const win = readYml('latest.yml');
  const linux = readYml('latest-linux.yml');
  const version = (linux && linux.version) || (win && win.version) || null;
  const deb = version ? fileInfo(`didiscord-${version}.deb`) : null;
  res.set('Cache-Control', 'no-store');
  res.json({
    version,
    date: (linux && linux.date) || (win && win.date) || null,
    windows: win && fileInfo(win.file),
    appimage: linux && fileInfo(linux.file),
    deb,
  });
});

// os arquivos em si. Os latest*.yml nunca ficam em cache (é por eles que o app descobre que tem
// versão nova); os instaladores podem, porque cada versão tem um nome diferente.
router.use('/downloads', express.static(DOWNLOADS_DIR, {
  fallthrough: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.yml')) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
    if (/\.(exe|AppImage|deb)$/.test(filePath)) res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  },
}));

router.get('/baixar', (req, res) => res.sendFile(path.join(__dirname, '..', '..', 'public', 'baixar.html')));

module.exports = router;
