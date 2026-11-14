'use strict';
// "Jogando X" (rich presence): descobre qual jogo está aberto neste computador e avisa o site, que
// mostra pros amigos (lista de membros e cartão de perfil). Só o app desktop consegue fazer isso —
// uma página de navegador não enxerga os programas abertos.
//
// Como um jogo é reconhecido, nesta ordem:
//   1. jogos que a própria pessoa cadastrou (configurações → app → atividade): nome do executável
//   2. uma lista pequena de jogos conhecidos que não são da Steam (KNOWN, abaixo)
//   3. qualquer programa rodando de dentro de .../steamapps/common/<pasta>/ — o nome certo vem do
//      appmanifest da Steam; se não der pra ler, usa o nome da pasta
//
// Privacidade: a lista de programas abertos nunca sai deste processo. Pro site vai só o NOME do
// jogo detectado (e, quando a pessoa abre "adicionar jogo", os candidatos pra ela escolher). Com a
// opção desligada, nada é lido nem enviado.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const SCAN_EVERY_MS = process.platform === 'win32' ? 20000 : 15000; // no Windows cada leitura abre um PowerShell

// executável (minúsculo, sem .exe) -> nome mostrado
const KNOWN = {
  'valorant-win64-shipping': 'VALORANT',
  'league of legends': 'League of Legends',
  'leagueclientux': 'League of Legends',
  'fortniteclient-win64-shipping': 'Fortnite',
  'robloxplayerbeta': 'Roblox',
  'minecraft.windows': 'Minecraft',
  'gta5': 'Grand Theft Auto V',
  'gta5_enhanced': 'Grand Theft Auto V',
  'overwatch': 'Overwatch 2',
  'r5apex': 'Apex Legends',
  'r5apex_dx12': 'Apex Legends',
  'rocketleague': 'Rocket League',
  'cs2': 'Counter-Strike 2',
  'dota2': 'Dota 2',
  'osu!': 'osu!',
  'genshinimpact': 'Genshin Impact',
  'starrail': 'Honkai: Star Rail',
  'wow': 'World of Warcraft',
  'diablo iv': 'Diablo IV',
  'hearthstone': 'Hearthstone',
  'eldenring': 'ELDEN RING',
  'rainbowsix': 'Rainbow Six Siege',
  'cod': 'Call of Duty',
  'modernwarfare': 'Call of Duty',
  'eafc25': 'EA SPORTS FC 25',
  'fc26': 'EA SPORTS FC 26',
  'pathofexile': 'Path of Exile',
  'pathofexile_x64': 'Path of Exile',
  'terraria': 'Terraria',
  'stardew valley': 'Stardew Valley',
  'among us': 'Among Us',
};

// pastas de steamapps/common que não são jogo
const STEAM_NOT_GAMES = /^(proton|steamlinuxruntime|steam linux runtime|steamworks|steam controller|steamvr)/i;
// nomes de pasta da Steam que não batem com o nome do jogo (só usados se o appmanifest não abrir)
const STEAM_FOLDER_ALIASES = {
  'counter-strike global offensive': 'Counter-Strike 2',
  'dota 2 beta': 'Dota 2',
};
// programas que rodam da pasta do usuário mas não são jogo (pra lista de "adicionar jogo")
const NOT_GAME_EXES = /^(steam|steamwebhelper|steamservice|wineserver|wine|wine64|wine-preloader|wine64-preloader|services|explorer|winedevice|plugplay|rpcss|svchost|conhost|start|cmd|electron|dusky|chrome|chromium|firefox|code|node|bash|zsh|fish|sh|python\d*|python3|java|javaw|discord|spotify|gamescope|mangohud|gamemoded|pressure-vessel.*|reaper|steam-launch-wrapper|crashhandler|crashpad_handler|easyanticheat.*|battleye.*|riotclientservices|riotclientux|riotclientuxrender|riotclientcrashhandler|epicgameslauncher|epicwebhelper|unitycrashhandler64|gldriverquery.*|vulkandriverquery.*|xdg-.*|dbus-.*|dusky-.*)$/i;

const exeKey = (p) => path.posix.basename(String(p || '').replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');

// caminho como o processo escreveu -> caminho que dá pra abrir aqui (no Wine, Z:\home\x vira /home/x)
function toLocalPath(p) {
  let s = String(p || '').replace(/\\/g, '/');
  if (process.platform !== 'win32') s = s.replace(/^[zZ]:/, '');
  return s;
}

// ------------------------------------------------------------------ programas abertos

// devolve [{ exe: caminho do executável, args: resto da linha de comando (só Linux) }]
function listProcessesLinux() {
  const out = [];
  let pids = [];
  try { pids = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)); } catch (_) { return out; }
  for (const pid of pids) {
    try {
      const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!raw) continue; // thread do kernel
      const argv = raw.split('\0').filter(Boolean);
      if (argv[0]) out.push({ exe: argv[0], args: argv.slice(1, 12).join(' ') });
    } catch (_) { /* o processo acabou no meio da leitura */ }
  }
  return out;
}

function listProcessesWindows() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-Process | Where-Object { $_.Path } | ForEach-Object { $_.Path }'],
    { timeout: 12000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve([...new Set(String(stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean))].map((exe) => ({ exe, args: '' })));
    });
  });
}

async function listProcesses() {
  if (process.platform === 'linux') return listProcessesLinux();
  if (process.platform === 'win32') return listProcessesWindows();
  return []; // macOS: por enquanto sem detecção
}

// ------------------------------------------------------------------ Steam

const steamNames = new Map(); // pasta steamapps -> { at, names: Map(installdir minúsculo -> nome) }

function steamLibraryNames(steamappsDir) {
  const cached = steamNames.get(steamappsDir);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.names;
  const names = new Map();
  try {
    for (const file of fs.readdirSync(steamappsDir)) {
      if (!/^appmanifest_\d+\.acf$/.test(file)) continue;
      try {
        const text = fs.readFileSync(path.join(steamappsDir, file), 'utf8');
        const name = /"name"\s+"([^"]+)"/.exec(text);
        const dir = /"installdir"\s+"([^"]+)"/.exec(text);
        if (name && dir) names.set(dir[1].toLowerCase(), name[1]);
      } catch (_) { /* manifesto ilegível: pula */ }
    }
  } catch (_) { /* pasta inacessível: fica só com o nome da pasta do jogo */ }
  steamNames.set(steamappsDir, { at: Date.now(), names });
  return names;
}

function steamGameOf(exePath) {
  const local = toLocalPath(exePath);
  const m = /^(.*\/steamapps)\/common\/([^/]+)\//i.exec(local);
  if (!m || STEAM_NOT_GAMES.test(m[2])) return null;
  const folder = m[2];
  return steamLibraryNames(m[1]).get(folder.toLowerCase()) || STEAM_FOLDER_ALIASES[folder.toLowerCase()] || folder;
}

// ------------------------------------------------------------------ detecção

function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
}

// devolve os jogos abertos agora, do mais confiável pro menos: [{ name, key }]
function detect(processes, custom) {
  const found = [];
  const add = (rank, name, key) => { if (name) found.push({ rank, name: cleanName(name), key }); };
  for (const p of processes) {
    const key = exeKey(p.exe);
    if (!key) continue;
    if (custom.has(key)) { add(0, custom.get(key), key); continue; }
    if (KNOWN[key]) { add(1, KNOWN[key], key); continue; }
    // Minecraft (Java): o executável é só "java"; o que entrega é a linha de comando / o caminho
    if ((key === 'java' || key === 'javaw') && /net\.minecraft|[\\/]\.?minecraft[\\/]|minecraft/i.test(`${p.exe} ${p.args}`)) { add(1, 'Minecraft', key); continue; }
    const steam = steamGameOf(p.exe);
    if (steam && !NOT_GAME_EXES.test(key)) add(2, steam, key);
  }
  return found.sort((a, b) => a.rank - b.rank);
}

// programas que PODEM ser um jogo, pra pessoa escolher em "adicionar jogo": [{ exe, label }]
function candidates(processes) {
  const home = os.homedir().replace(/\\/g, '/').toLowerCase();
  const seen = new Map();
  for (const p of processes) {
    const key = exeKey(p.exe);
    if (!key || NOT_GAME_EXES.test(key) || seen.has(key)) continue;
    const local = toLocalPath(p.exe).toLowerCase();
    let plausible;
    if (process.platform === 'win32') {
      plausible = !/^[a-z]:\/windows\//.test(local) && !/\/(microsoft|windowsapps|common files)\//.test(local);
    } else {
      // no Linux: programa do Windows (Wine/Proton) ou algo rodando fora das pastas do sistema
      plausible = /\.exe$/i.test(p.exe) || local.startsWith(home + '/') || /^\/(opt|mnt|media|run\/media|games)\//.test(local);
      if (/\/(\.cache|\.config|\.local\/share\/(applications|icons)|node_modules|\.vscode|\.cargo|\.rustup|\.nvm)\//.test(local)) plausible = false;
    }
    if (!plausible) continue;
    seen.set(key, { exe: key, label: path.posix.basename(String(p.exe).replace(/\\/g, '/')) });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label)).slice(0, 80);
}

// ------------------------------------------------------------------ ciclo

function createPresence({ log, onChange }) {
  let enabled = false;
  let custom = new Map();
  let timer = null;
  let scanning = false;
  let current = null; // { name, key, startedAt }

  function publish(next) {
    const same = (current && next && current.name === next.name) || (!current && !next);
    current = next;
    if (same) return;
    try { onChange(current ? { name: current.name, startedAt: current.startedAt } : null); } catch (_) { /* a janela pode ter fechado */ }
  }

  async function scan() {
    if (scanning || !enabled) return;
    scanning = true;
    try {
      const found = detect(await listProcesses(), custom);
      if (!enabled) return;
      // o jogo que já estava sendo mostrado continua enquanto estiver aberto (não fica trocando
      // quando tem dois abertos); senão vale o primeiro achado
      const keep = current && found.find((g) => g.name === current.name);
      if (keep) return;
      publish(found[0] ? { name: found[0].name, key: found[0].key, startedAt: Date.now() } : null);
    } catch (err) {
      log('[presence] não consegui ler os programas abertos:', err && err.message);
    } finally {
      scanning = false;
    }
  }

  function configure(cfg) {
    const next = new Map();
    for (const item of Array.isArray(cfg && cfg.custom) ? cfg.custom.slice(0, 100) : []) {
      const key = exeKey(item && item.exe);
      const name = cleanName(item && item.name);
      if (key && name) next.set(key, name);
    }
    custom = next;
    enabled = !!(cfg && cfg.enabled);
    clearInterval(timer);
    timer = null;
    if (!enabled) { publish(null); return; }
    current = null; // reavalia do zero: a lista de jogos pode ter mudado
    timer = setInterval(scan, SCAN_EVERY_MS);
    scan();
  }

  async function listCandidates() {
    try { return candidates(await listProcesses()); } catch (_) { return []; }
  }

  function stop() {
    enabled = false;
    clearInterval(timer);
    timer = null;
    current = null;
  }

  return { configure, listCandidates, stop, getCurrent: () => (current ? { name: current.name, startedAt: current.startedAt } : null) };
}

module.exports = { createPresence, detect, candidates, steamGameOf, exeKey };
