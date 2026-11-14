'use strict';
// `npm run release` (pasta tauri/, no servidor Linux): publica a versão nova do app na pasta
// downloads/ do servidor (servida em https://dusky.veneno.space/downloads/). Dali saem:
//   - a página /baixar e o /api/downloads;
//   - a atualização automática do app novo: latest.json + os arquivos (o servidor completa o
//     endereço de cada um, ver server/routes/downloads.js);
//   - a MIGRAÇÃO de quem ainda está no app Electron: latest.yml (Windows) e latest-linux.yml
//     (AppImage/.deb) apontando pros instaladores do app novo, com sha512 e tamanho no formato do
//     electron-updater. O Electron baixa, confere e roda o instalador novo como se fosse uma
//     versão dele (ver "Migração do app antigo" no tauri/README.md).
//
// De onde vêm os arquivos:
//   Linux:   src-tauri/target/release/bundle/{appimage,deb}/  (o `npm run build` deste PC)
//   Windows: tauri/release-in/dusky_<versão>_x64-setup.exe — posto lá pelo `npm run release:all`
//            (compila pro Windows aqui mesmo, ver scripts/build-all.js) ou copiado de um PC com
//            Windows (pendrive, rede, scp…). Senão procura em src-tauri/target/x86_64-pc-windows-msvc/
//            release/bundle/nsis/ (cross-build) — ou --windows caminho/do/arquivo.exe
// Só publica a versão do tauri.conf.json; arquivo de outra versão é ignorado (com aviso).
//
// Assinatura: cada arquivo é assinado aqui com a chave PRIVADA do atualizador (fica só neste PC):
//   TAURI_SIGNING_PRIVATE_KEY_PATH, ou tauri/updater-key/dusky-updater.key (padrão, fora do git).
//   Senha da chave em TAURI_SIGNING_PRIVATE_KEY_PASSWORD (a gerada pro dusky não tem senha).
//
// Opções:
//   --windows <arquivo.exe>   instalador do Windows (em vez de procurar em release-in/)
//   --notes "texto"           novidades (aparece no /baixar)
//   --sem-electron            não mexe nos latest*.yml (o Electron fica sem receber a migração)
//   --so-linux / --so-windows publica só um sistema (o latest.json mantém o outro, se for da mesma versão)
//   --dry                     só mostra o que faria

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TAURI = path.join(__dirname, '..');
const ROOT = path.join(TAURI, '..');
const OUT = path.join(ROOT, 'downloads');
const BUNDLE = path.join(TAURI, 'src-tauri', 'target', 'release', 'bundle');
const BUNDLE_WIN_CROSS = path.join(TAURI, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle');
const INBOX = path.join(TAURI, 'release-in');
const KEEP_VERSIONS = 2;

const conf = JSON.parse(fs.readFileSync(path.join(TAURI, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const pkg = require('../package.json');
const VERSION = conf.version;
const CODENAME = pkg.codename || null;

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const flag = (name) => argv.includes(name);
const DRY = flag('--dry');

function die(msg) { console.error(`[release] ${msg}`); process.exit(1); }
function say(msg) { console.log(`[release] ${msg}`); }

// ------------------------------------------------------------------ achar os arquivos

function newest(dir, re) {
  try {
    return fs.readdirSync(dir).filter((f) => re.test(f))
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
  } catch (_) {
    return null;
  }
}

function checkVersion(file, what) {
  if (!file) return null;
  const base = path.basename(file);
  if (!base.includes(`_${VERSION}_`)) {
    console.warn(`[release] aviso: ${what} ${base} não é da versão ${VERSION} — ignorado (rodou o build depois de mudar a versão?)`);
    return null;
  }
  return file;
}

const SO_LINUX = flag('--so-linux');
const SO_WINDOWS = flag('--so-windows');
const files = {
  appimage: SO_WINDOWS ? null : checkVersion(newest(path.join(BUNDLE, 'appimage'), /\.AppImage$/), 'AppImage'),
  deb: SO_WINDOWS ? null : checkVersion(newest(path.join(BUNDLE, 'deb'), /\.deb$/), '.deb'),
  // release-in/ (copiado do Windows ou pelo build-all.js) > build do Windows feito no Linux
  // (target/x86_64-pc-windows-msvc/…) > build feito no próprio Windows (target/release/…)
  windows: SO_LINUX ? null : checkVersion(opt('--windows') || newest(INBOX, /-setup\.exe$/)
    || newest(path.join(BUNDLE_WIN_CROSS, 'nsis'), /-setup\.exe$/) || newest(path.join(BUNDLE, 'nsis'), /-setup\.exe$/), 'instalador do Windows'),
};
if (!files.appimage && !files.deb && !files.windows) {
  die(`nada pra publicar da versão ${VERSION}. Rode "npm run build" (Linux) e/ou copie o dusky_${VERSION}_x64-setup.exe do Windows pra ${INBOX}`);
}
if (!files.windows && !SO_LINUX) console.warn(`[release] aviso: sem instalador do Windows (${INBOX}/dusky_${VERSION}_x64-setup.exe) — o Windows fica na versão anterior`);
if (!files.appimage && !SO_WINDOWS) console.warn('[release] aviso: sem AppImage — o Linux fica na versão anterior');

// ------------------------------------------------------------------ assinatura

function keyPath() {
  const p = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || path.join(TAURI, 'updater-key', 'dusky-updater.key');
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !fs.existsSync(p)) {
    die(`não achei a chave privada do atualizador (${p}). Ela é a mesma que gerou a "pubkey" do tauri.conf.json — sem ela o app recusa a atualização.`);
  }
  return p;
}

function sign(file) {
  const cli = path.join(TAURI, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri');
  if (!fs.existsSync(cli)) die('falta o CLI do Tauri: rode "npm install" na pasta tauri/');
  const args = ['signer', 'sign', '-p', process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || ''];
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) args.push('-f', keyPath());
  args.push(file);
  const r = spawnSync(cli, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) die(`falhou ao assinar ${path.basename(file)}:\n${r.stderr || r.stdout}`);
  return fs.readFileSync(`${file}.sig`, 'utf8').trim();
}

// sha512 em base64 + tamanho, do jeito que o electron-updater confere
function electronHash(file) {
  const sha512 = crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
  return { sha512, size: fs.statSync(file).size };
}

// ------------------------------------------------------------------ publicar

if (!DRY) fs.mkdirSync(OUT, { recursive: true });
const releaseDate = new Date().toISOString();
const notes = opt('--notes') || `dusky ${CODENAME ? `${CODENAME} ` : ''}${VERSION}`;
const platforms = {};
const published = {};

for (const [kind, file] of Object.entries(files)) {
  if (!file) continue;
  const name = path.basename(file);
  say(`${kind}: ${name} (${(fs.statSync(file).size / 1024 / 1024).toFixed(0)} MB)`);
  if (DRY) { published[kind] = name; continue; }
  const signature = sign(file);
  fs.copyFileSync(file, path.join(OUT, name));
  fs.writeFileSync(path.join(OUT, `${name}.sig`), signature + '\n');
  try { fs.unlinkSync(`${file}.sig`); } catch (_) { /* ok */ }
  published[kind] = name;
  // o servidor troca o nome do arquivo pelo endereço completo (ver server/routes/downloads.js)
  const entry = { signature, url: name };
  if (kind === 'appimage') { platforms['linux-x86_64'] = entry; platforms['linux-x86_64-appimage'] = entry; }
  if (kind === 'deb') platforms['linux-x86_64-deb'] = entry;
  if (kind === 'windows') { platforms['windows-x86_64'] = entry; platforms['windows-x86_64-nsis'] = entry; }
}

if (!DRY) {
  // latest.json: o que já estava publicado de outro sistema continua (ex: publicou só o Linux agora)
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(path.join(OUT, 'latest.json'), 'utf8')); } catch (_) { /* primeira vez */ }
  const keep = previous.version === VERSION ? previous.platforms || {} : {};
  const manifest = {
    version: VERSION,
    codename: CODENAME,
    notes,
    pub_date: releaseDate,
    platforms: { ...keep, ...platforms },
  };
  fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  say('latest.json');

  // migração do Electron: latest.yml / latest-linux.yml no formato do electron-builder
  if (!flag('--sem-electron')) {
    const yml = (list) => {
      const lines = [`version: ${VERSION}`, 'files:'];
      for (const f of list) lines.push(`  - url: ${f.name}`, `    sha512: ${f.sha512}`, `    size: ${f.size}`);
      lines.push(`path: ${list[0].name}`, `sha512: ${list[0].sha512}`, `releaseDate: '${releaseDate}'`);
      return lines.join('\n') + '\n';
    };
    if (files.windows) {
      fs.writeFileSync(path.join(OUT, 'latest.yml'), yml([{ name: published.windows, ...electronHash(files.windows) }]));
      say('latest.yml (Electron no Windows → instalador novo)');
    }
    const linux = [];
    if (files.appimage) linux.push({ name: published.appimage, ...electronHash(files.appimage) });
    if (files.deb) linux.push({ name: published.deb, ...electronHash(files.deb) });
    if (linux.length) {
      fs.writeFileSync(path.join(OUT, 'latest-linux.yml'), yml(linux));
      say('latest-linux.yml (Electron no Linux → AppImage/.deb novos)');
    }
  }

  // apaga versões velhas do app novo (fica a nova + a anterior). Os arquivos do Electron
  // (didiscord-*) ficam: não atrapalham e servem de volta atrás.
  const versionOf = (f) => (/^dusky_(\d+\.\d+\.\d+)_/.exec(f) || [])[1];
  const cmp = (a, b) => a.split('.').map(Number).reduce((r, n, i) => r || n - Number(b.split('.')[i]), 0);
  const versions = [...new Set(fs.readdirSync(OUT).map(versionOf).filter(Boolean))].sort(cmp).reverse();
  const keepVersions = new Set(versions.slice(0, KEEP_VERSIONS));
  for (const f of fs.readdirSync(OUT)) {
    const v = versionOf(f);
    if (v && !keepVersions.has(v)) { fs.unlinkSync(path.join(OUT, f)); say(`apaguei a versão velha ${f}`); }
  }

  // o que veio do Windows já foi publicado: limpa a caixa de entrada
  if (files.windows && files.windows.startsWith(INBOX + path.sep)) { try { fs.unlinkSync(files.windows); } catch (_) { /* ok */ } }
}

console.log(`\n[release] dusky ${CODENAME ? `${CODENAME} ` : ''}${VERSION} ${DRY ? '(simulação) ' : ''}publicado em ${OUT}`);
console.log('[release] o app novo procura atualização ao abrir e a cada 3 h; o Electron (migração) também a cada 3 h.');
