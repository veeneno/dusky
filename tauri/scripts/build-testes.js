'use strict';
// `npm run release:testes` (pasta tauri/, no servidor Linux): compila uma BUILD DE TESTE pros dois
// sistemas e publica em downloads/testes/ — aparece na seção "testes" do /baixar.
//
//   npm run release:testes -- --titulo "texto" [--nota "mudança"]... [--testar "o que testar"]...
//                             [--so-linux | --so-windows] [--dry]
//
// Diferente do `npm run release:all`:
//   - NÃO mexe no downloads/latest.json: ninguém recebe a build de teste pela atualização automática;
//     só quem baixar na seção "testes";
//   - a versão é a próxima da atual com "-teste.N" (1.1.2 → 1.1.3-teste.1, 1.1.3-teste.2…), passada
//     pro Tauri com --config (o tauri.conf.json não muda). Quem instala uma build de teste continua
//     ouvindo o latest.json de sempre: quando sair a 1.1.3 normal, ela é "maior" que 1.1.3-teste.N e o
//     app de teste se atualiza sozinho pra ela;
//   - não assina nada (quem instala é a pessoa, não o atualizador).
//
// Rode da cópia da branch testes (git worktree, ver tauri/README.md → "Builds de teste"). Os arquivos
// vão pra <raiz do código>/downloads/testes/ — no worktree, downloads/ é um link pra pasta do site.
//
// Compilar é igual ao release:all (scripts/build-all.js): Linux pelo scripts/tauri.js e Windows pelo
// cargo-xwin com o llvm-21. CARGO_BUILD_JOBS=4 deixa o site menos lento durante o build.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TAURI = path.join(__dirname, '..');
const ROOT = path.join(TAURI, '..');
const SRC = path.join(TAURI, 'src-tauri');
const OUT = path.join(ROOT, 'downloads', 'testes');
const WIN_TARGET = 'x86_64-pc-windows-msvc';
const LLVM_BIN = process.env.LLVM_BIN || '/usr/lib/llvm-21/bin';
const HOME = process.env.HOME || '';
const KEEP_VERSIONS = 2; // a build de teste nova + a anterior

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const opts = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] != null ? [argv[i + 1]] : []));
const flag = (name) => argv.includes(name);
const DRY = flag('--dry');
const SO_LINUX = flag('--so-linux');
const SO_WINDOWS = flag('--so-windows');
const LINUX = !SO_WINDOWS;
const WINDOWS = !SO_LINUX;

function say(msg) { console.log(`[testes] ${msg}`); }
function die(msg) { console.error(`\n[testes] ERRO: ${msg}`); process.exit(1); }

if (process.platform !== 'linux') die('este script é pro servidor Linux');
if (SO_LINUX && SO_WINDOWS) die('use --so-linux OU --so-windows, não os dois');

const env = { ...process.env };
// node_modules/.bin: o scripts/tauri.js chama o CLI "tauri" pelo PATH (o npm põe essa pasta no PATH;
// rodando "node scripts/build-testes.js" direto, não)
for (const dir of [path.join(TAURI, 'node_modules', '.bin'), path.join(HOME, '.local', 'bin'), path.join(HOME, '.cargo', 'bin')]) {
  if (!env.PATH.split(':').includes(dir)) env.PATH = `${dir}:${env.PATH}`;
}

const git = (...args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
};
const BRANCH = git('rev-parse', '--abbrev-ref', 'HEAD');
const COMMIT = git('rev-parse', 'HEAD');
if (BRANCH === 'main') console.warn('[testes] aviso: você está na main — build de teste normalmente sai da branch testes');
if (git('status', '--porcelain', '--untracked-files=no')) console.warn('[testes] aviso: tem mudança não commitada — a build não bate com nenhum commit');

// ------------------------------------------------------------------ versão

const conf = JSON.parse(fs.readFileSync(path.join(SRC, 'tauri.conf.json'), 'utf8'));
const [maj, min, pat] = conf.version.split(/[.-]/).map(Number);
const BASE = `${maj}.${min}.${pat + 1}`;
let previous = null;
try { previous = JSON.parse(fs.readFileSync(path.join(OUT, 'testes.json'), 'utf8')); } catch (_) { /* primeira build de teste */ }
const prevN = previous && typeof previous.version === 'string' && previous.version.startsWith(`${BASE}-teste.`)
  ? Number(previous.version.slice(`${BASE}-teste.`.length)) || 0 : 0;
// --so-linux depois de --so-windows (ou o contrário) da MESMA build: --mesma-versao reaproveita o número
const N = flag('--mesma-versao') && prevN ? prevN : prevN + 1;
const VERSION = `${BASE}-teste.${N}`;
const CONFIG = JSON.stringify({ version: VERSION });
// o próprio app sabe que é build de teste e qual (configurações → app e versões, bandeja, log):
// lidos na compilação pelo app.rs (APP_VERSION / CHANNEL)
env.DUSKY_BUILD_VERSION = VERSION;
env.DUSKY_CHANNEL = 'testes';

// ------------------------------------------------------------------ compilar

function minutes(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`;
}

function run(what, bin, args, e = env) {
  say(`${what}: ${bin} ${args.join(' ')}`);
  if (DRY) return;
  const t0 = Date.now();
  const r = spawnSync(bin, args, { cwd: TAURI, stdio: 'inherit', env: e });
  if (r.error) die(`${what}: não consegui rodar ${bin} (${r.error.message})`);
  if (r.status !== 0) die(`${what} falhou (código ${r.status}). Veja as mensagens acima.`);
  say(`${what}: ok em ${minutes(Date.now() - t0)}`);
}

function buildLinux() {
  run('build do Linux', process.execPath, [path.join(__dirname, 'tauri.js'), 'build', '--config', CONFIG]);
}

function buildWindows() {
  run('ffmpeg do instalador do Windows', process.execPath, [path.join(__dirname, 'fetch-ffmpeg.js')]);
  const winEnv = { ...env, PATH: `${LLVM_BIN}:${env.PATH}` };
  delete winEnv.CC;
  delete winEnv.CXX;
  run('build do Windows', path.join(TAURI, 'node_modules', '.bin', 'tauri'),
    ['build', '--runner', 'cargo-xwin', '--target', WIN_TARGET, '--config', CONFIG], winEnv);
}

// ------------------------------------------------------------------ publicar

function find(dir, suffix) {
  const name = `dusky_${VERSION}_${suffix}`;
  const p = path.join(dir, name);
  if (DRY) return name;
  if (!fs.existsSync(p)) die(`o build terminou mas não achei ${p}`);
  return p;
}

function publish(built) {
  if (DRY) {
    say(`publicaria em ${OUT}: ${Object.values(built).join(', ')}`);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const files = {};
  for (const [kind, file] of Object.entries(built)) {
    const name = path.basename(file);
    fs.copyFileSync(file, path.join(OUT, name));
    if (kind === 'appimage') fs.chmodSync(path.join(OUT, name), 0o755);
    files[kind] = { file: name, size: fs.statSync(file).size };
    say(`${kind}: ${name} (${(files[kind].size / 1024 / 1024).toFixed(0)} MB)`);
  }
  // publicou só um sistema: o outro continua se for da mesma build
  const keep = previous && previous.version === VERSION ? previous.files || {} : {};
  const manifest = {
    version: VERSION,
    branch: BRANCH,
    commit: COMMIT,
    pub_date: new Date().toISOString(),
    title: opt('--titulo') || (previous && previous.version === VERSION ? previous.title : null) || `build de teste ${VERSION}`,
    notes: opts('--nota').length ? opts('--nota') : (previous && previous.version === VERSION ? previous.notes || [] : []),
    test: opts('--testar').length ? opts('--testar') : (previous && previous.version === VERSION ? previous.test || [] : []),
    files: { ...keep, ...files },
  };
  fs.writeFileSync(path.join(OUT, 'testes.json'), JSON.stringify(manifest, null, 2) + '\n');
  say('testes.json');

  // apaga builds de teste velhas (fica a nova + a anterior)
  const versionOf = (f) => (/^dusky_(\d+\.\d+\.\d+-teste\.\d+)_/.exec(f) || [])[1];
  const key = (v) => v.split(/[.-]/).filter((x) => x !== 'teste').map(Number);
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  const versions = [...new Set(fs.readdirSync(OUT).map(versionOf).filter(Boolean))].sort(cmp).reverse();
  const keepVersions = new Set(versions.slice(0, KEEP_VERSIONS));
  for (const f of fs.readdirSync(OUT)) {
    const v = versionOf(f);
    if (v && !keepVersions.has(v)) { fs.unlinkSync(path.join(OUT, f)); say(`apaguei a build velha ${f}`); }
  }
}

// ------------------------------------------------------------------

const t0 = Date.now();
say(`dusky ${VERSION} (${BRANCH || '?'} @ ${COMMIT.slice(0, 7) || '?'}): ${LINUX && WINDOWS ? 'Linux + Windows' : LINUX ? 'só Linux' : 'só Windows'}${DRY ? ' (simulação)' : ''}`);
const built = {};
if (LINUX) {
  buildLinux();
  const bundle = path.join(SRC, 'target', 'release', 'bundle');
  built.appimage = find(path.join(bundle, 'appimage'), 'amd64.AppImage');
  built.deb = find(path.join(bundle, 'deb'), 'amd64.deb');
}
if (WINDOWS) {
  buildWindows();
  built.windows = find(path.join(SRC, 'target', WIN_TARGET, 'release', 'bundle', 'nsis'), 'x64-setup.exe');
}
publish(built);
say(`pronto em ${minutes(Date.now() - t0)} — aparece em /baixar#testes`);
