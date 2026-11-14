// Baixa o ffmpeg que vai DENTRO do instalador do Windows (src-tauri/vendor/ffmpeg/, fora do git).
// Roda sozinho antes do `npm run dev` / `npm run build` no Windows (ver scripts/tauri.js) e antes
// do build do Windows feito no Linux (scripts/build-all.js).
//
// Versão FIXA e conferida pelo SHA-256: arquivo diferente = descartado.
// Build "essentials" do gyan.dev (https://www.gyan.dev/ffmpeg/builds/), ffmpeg 8.1.2: tem NVENC,
// AMF, Quick Sync, ddagrab e gdigrab. 8.1 e não 9.x: a 9 exige driver NVIDIA 610+. Licença GPL
// (o LICENSE vai junto no instalador).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const VERSION = '8.1.2';
const URL = `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-${VERSION}-essentials_build.zip`;
const SHA256 = 'db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec';

const dir = path.join(__dirname, '..', 'src-tauri', 'vendor', 'ffmpeg');
const exe = path.join(dir, 'ffmpeg.exe');
const license = path.join(dir, 'LICENSE.txt');
const stamp = path.join(dir, 'VERSION');

// Abre o .zip com o que tiver no sistema. Windows: tar.exe (vem no Windows 10 1803+ e abre .zip).
// Linux (cross-build do instalador, ver scripts/build-all.js): unzip, senão bsdtar, senão 7z.
function unzip(zip, dest) {
  const tries = process.platform === 'win32'
    ? [[path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dest]]]
    : [['unzip', ['-q', '-o', zip, '-d', dest]], ['bsdtar', ['-xf', zip, '-C', dest]], ['7z', ['x', '-y', `-o${dest}`, zip]]];
  for (const [bin, args] of tries) {
    const r = spawnSync(bin, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.error && r.error.code === 'ENOENT') continue; // programa não instalado: tenta o próximo
    if (r.status === 0) return;
    throw new Error(`não consegui abrir o .zip do ffmpeg (${bin} saiu com ${r.status})`);
  }
  throw new Error('não achei como abrir o .zip do ffmpeg: instale o unzip (sudo apt install unzip)');
}

async function main() {
  if (fs.existsSync(exe) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === VERSION) return;
  fs.mkdirSync(dir, { recursive: true });
  console.log(`[ffmpeg] baixando ffmpeg ${VERSION} pro instalador do Windows (~105 MB, uma vez só)…`);
  const res = await fetch(URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download falhou (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  if (digest !== SHA256) throw new Error('o arquivo baixado não bate com o SHA-256 esperado — descartado');

  const zip = path.join(dir, 'ffmpeg.zip');
  fs.writeFileSync(zip, buf);
  const tmp = path.join(dir, 'tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  unzip(zip, tmp);
  const root = path.join(tmp, `ffmpeg-${VERSION}-essentials_build`);
  fs.copyFileSync(path.join(root, 'bin', 'ffmpeg.exe'), exe);
  fs.copyFileSync(path.join(root, 'LICENSE'), license);
  fs.writeFileSync(stamp, VERSION);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  console.log('[ffmpeg] pronto em', exe);
}

main().catch((err) => {
  console.error('[ffmpeg]', err.message);
  process.exit(1);
});
