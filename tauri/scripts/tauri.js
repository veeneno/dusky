// Roda o CLI do Tauri. No Linux, usa o clang 21+ pra compilar o SDK do LiveKit (webrtc-sys exige;
// o clang padrão do Ubuntu é velho demais). CC/CXX já definidos têm preferência.
const { spawnSync } = require('child_process');

const env = { ...process.env };
if (process.platform === 'linux') {
  if (!env.CC) env.CC = 'clang-21';
  if (!env.CXX) env.CXX = 'clang++-21';
}
const bin = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const r = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status == null ? 1 : r.status);
