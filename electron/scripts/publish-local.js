'use strict';
// `npm run release`: depois do electron-builder gerar os instaladores em electron/dist/, copia a
// versão nova pra pasta downloads/ do servidor (servida em https://dusky.veneno.space/downloads/).
// Dali saem a página de instalação (/baixar) e a atualização automática do app.
//
// Mantém só a versão nova e a anterior (a anterior serve pra atualização baixar só a diferença).

const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const DIST = path.join(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '..', '..', 'downloads');
const KEEP_VERSIONS = 2;

const version = pkg.version;
fs.mkdirSync(OUT, { recursive: true });

const wanted = fs.readdirSync(DIST).filter((f) =>
  /^latest(-linux)?\.yml$/.test(f)
  || (f.includes(version) && /\.(exe|exe\.blockmap|AppImage|deb|blockmap)$/.test(f)));
if (!wanted.some((f) => f.endsWith('.yml'))) {
  console.error(`[release] não achei latest.yml em ${DIST} — o electron-builder rodou com "publish" configurado?`);
  process.exit(1);
}

for (const f of wanted) {
  fs.copyFileSync(path.join(DIST, f), path.join(OUT, f));
  console.log(`[release] ${f}`);
}

// apaga versões velhas (fica a nova + a anterior)
const versionOf = (f) => (f.match(/(\d+\.\d+\.\d+)/) || [])[1];
const cmp = (a, b) => a.split('.').map(Number).reduce((r, n, i) => r || n - Number(b.split('.')[i]), 0);
const versions = [...new Set(fs.readdirSync(OUT).map(versionOf).filter(Boolean))].sort(cmp).reverse();
const keep = new Set(versions.slice(0, KEEP_VERSIONS));
for (const f of fs.readdirSync(OUT)) {
  const v = versionOf(f);
  if (v && !keep.has(v)) { fs.unlinkSync(path.join(OUT, f)); console.log(`[release] apaguei a versão velha ${f}`); }
}

console.log(`\n[release] versão ${version} publicada em ${OUT}`);
console.log('[release] quem está com o app aberto recebe a atualização em até 3 horas (ou em Ajuda → Procurar atualizações).');
