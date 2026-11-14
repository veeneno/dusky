'use strict';
// `npm run release:all` (pasta tauri/, no servidor Linux): compila o app pros DOIS sistemas aqui
// mesmo e publica tudo de uma vez com o scripts/release.js.
//
//   npm run release:all -- [--notes "texto"] [--so-linux | --so-windows] [--com-electron] [--dry]
//
// Em ordem, parando no primeiro erro:
//   a) confere as ferramentas (cargo, clang-21, cargo-xwin, makensis, a chave do atualizador) e
//      diz o que falta, com o comando de instalar;
//   b) Linux: o mesmo do `npm run build` (scripts/tauri.js escolhe o clang-21) → AppImage + .deb;
//   c) Windows (modo experimental do Tauri: compilar pro Windows no Linux): baixa o ffmpeg que vai
//      no instalador (scripts/fetch-ffmpeg.js) e roda
//      `tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc` com o llvm-21 no PATH
//      (clang-cl, lld-link, llvm-lib). O cargo-xwin baixa o kit da Microsoft na 1ª vez (~2 GB, em
//      ~/.cache/cargo-xwin). O instalador vai pra tauri/release-in/;
//   d) publica com o scripts/release.js. POR PADRÃO com --sem-electron (não mexe nos latest*.yml):
//      a migração do Electron só com --com-electron.
//
// Outras opções:
//   --so-linux / --so-windows   compila e publica só um sistema
//   --dry                       confere as ferramentas, mostra os comandos e roda o release em
//                               simulação (não compila nada)
//   CARGO_BUILD_JOBS=4          menos núcleos, se o site ficar lento durante o build

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TAURI = path.join(__dirname, '..');
const SRC = path.join(TAURI, 'src-tauri');
const INBOX = path.join(TAURI, 'release-in');
const WIN_TARGET = 'x86_64-pc-windows-msvc';
const LLVM_BIN = process.env.LLVM_BIN || '/usr/lib/llvm-21/bin';
const HOME = process.env.HOME || '';

const conf = JSON.parse(fs.readFileSync(path.join(SRC, 'tauri.conf.json'), 'utf8'));
const VERSION = conf.version;

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const flag = (name) => argv.includes(name);
const DRY = flag('--dry');
const SO_LINUX = flag('--so-linux');
const SO_WINDOWS = flag('--so-windows');
const LINUX = !SO_WINDOWS;
const WINDOWS = !SO_LINUX;

function say(msg) { console.log(`[release:all] ${msg}`); }
function die(msg) { console.error(`\n[release:all] ERRO: ${msg}`); process.exit(1); }

if (process.platform !== 'linux') die('este script é pro servidor Linux. No Windows use "npm run build" e copie o .exe pra release-in/.');
if (SO_LINUX && SO_WINDOWS) die('use --so-linux OU --so-windows, não os dois');

// ------------------------------------------------------------------ ambiente

// o rustup fica em ~/.cargo/bin (instalado sem sudo); o npm não carrega o ~/.cargo/env
const env = { ...process.env };
// e o ~/.local/bin (patchelf baixado sem sudo, ver abaixo)
for (const dir of [path.join(HOME, '.local', 'bin'), path.join(HOME, '.cargo', 'bin')]) {
  if (!env.PATH.split(':').includes(dir)) env.PATH = `${dir}:${env.PATH}`;
}

const has = (bin, args = ['--version'], e = env) => {
  const r = spawnSync(bin, args, { stdio: 'ignore', env: e });
  return !r.error && r.status === 0;
};

function minutes(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`;
}

function run(what, bin, args, e = env) {
  say(`${what}: ${bin} ${args.join(' ')}`);
  if (DRY) return 0;
  const t0 = Date.now();
  const r = spawnSync(bin, args, { cwd: TAURI, stdio: 'inherit', env: e });
  if (r.error) die(`${what}: não consegui rodar ${bin} (${r.error.message})`);
  if (r.status !== 0) die(`${what} falhou (código ${r.status}). Veja as mensagens acima.`);
  const ms = Date.now() - t0;
  say(`${what}: ok em ${minutes(ms)}`);
  return ms;
}

// ------------------------------------------------------------------ a) ferramentas

function checkTools() {
  const missing = [];
  if (!has('cargo')) missing.push(['cargo (Rust)', "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"]);
  if (!fs.existsSync(path.join(TAURI, 'node_modules', '.bin', 'tauri'))) missing.push(['CLI do Tauri', 'cd tauri && npm install']);
  if (LINUX && !has('clang-21') && !has('clang')) missing.push(['clang 21', 'wget https://apt.llvm.org/llvm.sh && sudo bash llvm.sh 21']);
  // o AppImage leva os plugins do GStreamer (bundleMediaFramework em tauri.linux.conf.json: sem
  // eles o WebKitGTK de dentro do AppImage fica sem microfone e sem som) e o script que copia os
  // plugins usa o patchelf
  if (LINUX && !has('patchelf')) missing.push(['patchelf (AppImage com GStreamer)', 'sudo apt install patchelf']);
  if (WINDOWS) {
    for (const b of ['clang-cl', 'lld-link', 'llvm-lib']) {
      if (!fs.existsSync(path.join(LLVM_BIN, b))) missing.push([`${b} (llvm-21, em ${LLVM_BIN})`, 'wget https://apt.llvm.org/llvm.sh && sudo bash llvm.sh 21']);
    }
    if (!has('cargo-xwin')) missing.push(['cargo-xwin', 'cargo install --locked cargo-xwin']);
    const targets = spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8', env });
    if (!targets.error && !String(targets.stdout).includes(WIN_TARGET)) missing.push([`target ${WIN_TARGET} do Rust`, `rustup target add ${WIN_TARGET}`]);
    if (!has('makensis', ['-VERSION'])) missing.push(['makensis (NSIS)', 'sudo apt install nsis']);
    if (!has('lld', ['-flavor', 'ld', '--version']) && !fs.existsSync(path.join(LLVM_BIN, 'lld'))) missing.push(['lld', 'sudo apt install lld']);
    if (!has('unzip', ['-v']) && !has('bsdtar') && !has('7z', ['i'])) missing.push(['unzip (abre o .zip do ffmpeg)', 'sudo apt install unzip']);
  }
  const key = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || path.join(TAURI, 'updater-key', 'dusky-updater.key');
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !fs.existsSync(key)) {
    missing.push([`chave privada do atualizador (${key})`, 'restaure do backup — sem ela nenhum app instalado aceita a versão nova (ver "A chave do atualizador" no README)']);
  }
  if (missing.length) {
    die('falta coisa pra compilar:\n' + missing.map(([what, how]) => `  - ${what}\n      ${how}`).join('\n'));
  }
  say('ferramentas ok');
}

// ------------------------------------------------------------------ b) Linux

function buildLinux() {
  return run('build do Linux', process.execPath, [path.join(__dirname, 'tauri.js'), 'build']);
}

// ------------------------------------------------------------------ c) Windows

function buildWindows() {
  const t0 = Date.now();
  run('ffmpeg do instalador do Windows', process.execPath, [path.join(__dirname, 'fetch-ffmpeg.js')]);
  // só o llvm-21 na frente: o cargo-xwin usa clang-cl/lld-link/llvm-lib dali. Sem CC/CXX do Linux,
  // pra não confundir o build dos pacotes C pro Windows.
  const winEnv = { ...env, PATH: `${LLVM_BIN}:${env.PATH}` };
  delete winEnv.CC;
  delete winEnv.CXX;
  run('build do Windows', path.join(TAURI, 'node_modules', '.bin', 'tauri'),
    ['build', '--runner', 'cargo-xwin', '--target', WIN_TARGET], winEnv);
  if (DRY) return 0;

  const nsis = path.join(SRC, 'target', WIN_TARGET, 'release', 'bundle', 'nsis');
  const name = `dusky_${VERSION}_x64-setup.exe`;
  const exe = path.join(nsis, name);
  if (!fs.existsSync(exe)) die(`o build do Windows terminou mas não achei ${exe}`);
  fs.mkdirSync(INBOX, { recursive: true });
  fs.copyFileSync(exe, path.join(INBOX, name));
  say(`instalador copiado pra release-in/${name} (${(fs.statSync(exe).size / 1024 / 1024).toFixed(0)} MB)`);
  return Date.now() - t0;
}

// ------------------------------------------------------------------ d) publicar

function release() {
  const args = [path.join(__dirname, 'release.js')];
  const notes = opt('--notes');
  if (notes) args.push('--notes', notes);
  if (!flag('--com-electron')) args.push('--sem-electron');
  if (SO_WINDOWS) args.push('--so-windows');
  if (SO_LINUX) args.push('--so-linux');
  if (DRY) args.push('--dry');
  say(`publicando: node scripts/release.js ${args.slice(1).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
  const r = spawnSync(process.execPath, args, { cwd: TAURI, stdio: 'inherit', env });
  if (r.status !== 0) die('o release falhou (mensagens acima). Os builds ficaram prontos: dá pra rodar "npm run release" de novo.');
}

// ------------------------------------------------------------------

const t0 = Date.now();
say(`dusky ${VERSION}: ${LINUX && WINDOWS ? 'Linux + Windows' : LINUX ? 'só Linux' : 'só Windows'}${flag('--com-electron') ? ' + MIGRAÇÃO DO ELECTRON' : ''}${DRY ? ' (simulação)' : ''}`);
checkTools();
const times = {};
if (LINUX) times.linux = buildLinux();
if (WINDOWS) times.windows = buildWindows();
release();
if (!DRY) {
  if (times.linux) say(`tempo do Linux: ${minutes(times.linux)}`);
  if (times.windows) say(`tempo do Windows: ${minutes(times.windows)}`);
  say(`total: ${minutes(Date.now() - t0)}`);
}
