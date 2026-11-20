// Baixa o ffmpeg que vai DENTRO do instalador do Windows (src-tauri/vendor/ffmpeg/, fora do git).
// Roda sozinho antes do `npm run dev` / `npm run build` no Windows (ver scripts/tauri.js) e antes
// do build do Windows feito no Linux (scripts/build-all.js).
//
// Versão FIXA e conferida pelo SHA-256: arquivo diferente = descartado.
// Build "win64-gpl" do BtbN (https://github.com/BtbN/FFmpeg-Builds), ffmpeg 8.1.3: tem NVENC, AMF,
// Quick Sync, ddagrab, gfxcapture e scale_d3d11. Por que BtbN e não mais o gyan.dev: o 8.1.2 do gyan
// foi compilado com o SDK 13.1 da NVIDIA e exige driver 610+ — com driver normal (ex.: 581) a NVENC
// era recusada ("Driver does not support the required nvenc API version") e TODA NVIDIA caía no
// processador. Os builds 8.1 do BtbN usam o SDK 13.0 (driver 570+). Mesma versão do download de
// reserva do app (src-tauri/src/deps.rs). Licença GPL (o LICENSE vai junto no instalador).
//
// O BtbN apaga builds antigos do GitHub: se a cópia em FFMPEG_MIRROR (padrão: a pasta
// ffmpeg-mirror ao lado do código, no servidor) existir, usa ela; senão baixa.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const VERSION = 'btbn-n8.1.3-39-g660b5aa7db';
const NAME = 'ffmpeg-n8.1.3-39-g660b5aa7db-win64-gpl-8.1';
const URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-20-12-40/${NAME}.zip`;
const SHA256 = '0a0d10072704c7f0b9a4aab1ca9937ef04b32ef25d4f940a0d639868c657d1b5';
const MIRROR = process.env.FFMPEG_MIRROR || path.join(__dirname, '..', '..', '..', 'ffmpeg-mirror');

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
  const local = path.join(MIRROR, `${NAME}.zip`);
  let buf;
  if (fs.existsSync(local)) {
    console.log(`[ffmpeg] usando a cópia em ${local}`);
    buf = fs.readFileSync(local);
  } else {
    console.log(`[ffmpeg] baixando ffmpeg ${VERSION} pro instalador do Windows (~190 MB, uma vez só)…`);
    const res = await fetch(URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`download falhou (HTTP ${res.status}) — o BtbN apaga builds antigos; ponha o .zip em ${MIRROR}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  if (digest !== SHA256) throw new Error('o arquivo baixado não bate com o SHA-256 esperado — descartado');

  const zip = path.join(dir, 'ffmpeg.zip');
  fs.writeFileSync(zip, buf);
  const tmp = path.join(dir, 'tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  unzip(zip, tmp);
  const root = path.join(tmp, NAME);
  fs.copyFileSync(path.join(root, 'bin', 'ffmpeg.exe'), exe);
  fs.copyFileSync(path.join(root, 'LICENSE.txt'), license);
  fs.writeFileSync(stamp, VERSION);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  console.log('[ffmpeg] pronto em', exe);
}

main().catch((err) => {
  console.error('[ffmpeg]', err.message);
  process.exit(1);
});
