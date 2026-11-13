// Roda o CLI do Tauri. No Linux, escolhe um clang 21+ pra compilar o SDK do LiveKit (o webrtc-sys
// exige clang, e novo). Ordem: CC/CXX já definidos > clang-21 (Ubuntu/Debian via apt.llvm.org)
// > clang (Arch, Fedora: já vem novo). CC/CXX definidos à mão sempre têm preferência.
const { spawnSync } = require('child_process');

const has = (bin) => spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0;

const env = { ...process.env };
if (process.platform === 'linux') {
  if (!env.CC) env.CC = has('clang-21') ? 'clang-21' : 'clang';
  if (!env.CXX) env.CXX = has('clang++-21') ? 'clang++-21' : 'clang++';
}
// Windows: o ffmpeg vai dentro do instalador (compartilhar tela pela placa de vídeo sem depender
// de nada instalado). Baixa uma vez antes de compilar.
if (process.platform === 'win32' && ['dev', 'build'].includes(process.argv[2])) {
  const f = spawnSync(process.execPath, [require('path').join(__dirname, 'fetch-ffmpeg.js')], { stdio: 'inherit' });
  if (f.status !== 0) process.exit(f.status || 1);
}

const bin = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const r = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status == null ? 1 : r.status);
