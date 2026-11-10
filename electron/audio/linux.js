'use strict';
// Áudio do compartilhamento de tela no Linux (PipeWire / pipewire-pulse).
//
// O Chromium do Electron não sabe capturar o áudio de UM app no Linux, e o `audio: 'loopback'` dele
// não existe aqui. Então fazemos por fora: abrimos um `pw-record` que NÃO se conecta a nada sozinho
// (node.autoconnect = false) e ligamos (pw-link) as saídas dos apps certos nas entradas dele. Ligar
// uma saída a mais não desvia o som: o app continua tocando normal nos alto-falantes, a captura é só
// uma cópia. O PCM sai pelo stdout (float32 intercalado, 48 kHz, estéreo) e vai pro site pelo IPC.
//
//   janela escolhida -> só os streams de áudio do processo dessa janela (e dos filhos dele)
//   tela inteira     -> todos os streams, MENOS os do próprio didiscord (senão a voz de quem está
//                       na call voltaria pra ele mesmo, em eco)
//
// Streams novos (app que abriu depois) são ligados por um laço de verificação a cada ~0,8 s.

const { spawn, execFile } = require('child_process');
const fs = require('fs');

const POLL_MS = 800;

function pwEnv() {
  const env = { ...process.env };
  if (!env.XDG_RUNTIME_DIR && typeof process.getuid === 'function') {
    env.XDG_RUNTIME_DIR = `/run/user/${process.getuid()}`;
  }
  return env;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env: pwEnv(), maxBuffer: 64 * 1024 * 1024, timeout: 6000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout));
    });
  });
}

// ---------- árvore de processos (via /proc) ----------

function parentPid(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    // o nome do processo (comm) vem entre parênteses e pode ter espaços — corta depois do último ')'
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return Number(rest[1]) || 0;
  } catch (_) {
    return 0;
  }
}

function isInTree(pid, rootPid) {
  let cur = pid;
  for (let i = 0; i < 64 && cur > 1; i++) {
    if (cur === rootPid) return true;
    cur = parentPid(cur);
  }
  return cur === rootPid;
}

// pid dono de uma janela X11 (a propriedade _NET_WM_PID). Em Wayland não existe, então devolve null.
async function windowPid(xid) {
  try {
    const out = await run('xprop', ['-id', String(xid), '_NET_WM_PID']);
    const m = out.match(/=\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch (_) {
    return null;
  }
}

// ---------- grafo do PipeWire ----------

const props = (o) => (o && o.info && o.info.props) || {};

function portsOf(dump, nodeId, direction) {
  return dump
    .filter((o) => o.type === 'PipeWire:Interface:Port' && o.info && o.info.direction === direction && Number(props(o)['node.id']) === nodeId)
    .map((o) => ({ id: o.id, channel: props(o)['audio.channel'] || '' }))
    .sort((a, b) => a.id - b.id);
}

async function hasPipeWire() {
  try {
    await run('pw-record', ['--version']);
    await run('pw-link', ['--version']);
    return true;
  } catch (_) {
    return false;
  }
}

// O pw-record escrevendo no stdout NÃO manda PCM cru por padrão: manda no formato AU (.snd) — um
// cabeçalho de 24 bytes e as amostras em BIG-ENDIAN. Lido como float32 little-endian, isso vira um
// chiado alto (era o bug do "som da tela só faz xiado"). Com --raw sai cru, na ordem da máquina.
// pw-record antigo sem --raw: tira o cabeçalho e inverte os bytes aqui mesmo.
let rawSupport = null;
async function pwRecordHasRaw() {
  if (rawSupport === null) {
    try {
      rawSupport = /--raw\b/.test(await run('pw-record', ['--help']));
    } catch (err) {
      // --help pode sair com código != 0 em algumas versões, mas o texto vem no stdout/stderr
      rawSupport = /--raw\b/.test(String((err && (err.stdout || err.stderr)) || ''));
    }
  }
  return rawSupport;
}

// desfaz o AU: pula o cabeçalho (tamanho no byte 4, big-endian) e troca a ordem dos bytes de cada float
function createAuDecoder() {
  let header = null; // bytes ainda faltando do cabeçalho; null = ainda não leu o tamanho
  let pending = Buffer.alloc(0);
  return (chunk) => {
    let data = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    pending = Buffer.alloc(0);
    if (header === null) {
      if (data.length < 8) { pending = data; return null; }
      header = data.readUInt32BE(4);
    }
    if (header > 0) {
      const skip = Math.min(header, data.length);
      data = data.subarray(skip);
      header -= skip;
      if (!data.length) return null;
    }
    const usable = data.length - (data.length % 4);
    if (usable < data.length) pending = Buffer.from(data.subarray(usable));
    if (!usable) return null;
    const out = Buffer.from(data.subarray(0, usable));
    out.swap32();
    return out;
  };
}

// "identidade" de um app no PipeWire: o nome do executável (estável entre os vários streams do
// mesmo app, ex: um navegador com várias abas tocando), com o nome amigável como reserva
function appKeyOf(p) {
  return String(p['application.process.binary'] || p['application.name'] || '').trim();
}

// apps tocando áudio agora (menos o próprio didiscord) — pro seletor do Wayland, onde não dá pra
// descobrir de quem é a janela escolhida e a pessoa escolhe o app do som numa lista
async function listAudioApps(ownPid) {
  if (!(await hasPipeWire())) return { available: false, apps: [] };
  try {
    const dump = JSON.parse(await run('pw-dump', []));
    const apps = new Map();
    for (const o of dump) {
      if (o.type !== 'PipeWire:Interface:Node' || props(o)['media.class'] !== 'Stream/Output/Audio') continue;
      const p = props(o);
      const pid = Number(p['application.process.id']);
      if (Number.isFinite(pid) && isInTree(pid, ownPid)) continue;
      const key = appKeyOf(p);
      if (!key || apps.has(key)) continue;
      apps.set(key, { key, name: String(p['application.name'] || key) });
    }
    return { available: true, apps: [...apps.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (_) {
    return { available: true, apps: [] };
  }
}

// ---------- API do módulo ----------

// Decide, a partir da fonte escolhida no seletor, quais streams entram. Devolve null se não dá pra
// capturar áudio (sem PipeWire, ou janela de um app que não conseguimos identificar).
//
// audioChoice (Wayland): a pessoa escolheu o som à parte, no nosso seletor —
//   { mode: 'system' }               todo o som do PC menos o didiscord
//   { mode: 'app', appKey }          só os streams desse app (inclusive os que começarem depois)
//   { mode: 'none' }                 sem som
async function prepare({ source, ownPid, log, audioChoice }) {
  if (!(await hasPipeWire())) {
    log('pw-record/pw-link não encontrados — compartilhando sem áudio');
    return null;
  }
  const raw = await pwRecordHasRaw();
  if (audioChoice) {
    if (audioChoice.mode === 'none') return null;
    let accepts;
    if (audioChoice.mode === 'app' && audioChoice.appKey) {
      const wanted = String(audioChoice.appKey);
      accepts = (streamPid, p) => appKeyOf(p) === wanted && !(Number.isFinite(streamPid) && isInTree(streamPid, ownPid));
    } else {
      accepts = (streamPid) => !(Number.isFinite(streamPid) && isInTree(streamPid, ownPid));
    }
    return { start: (onChunk, onEnd) => startCapture({ accepts, onChunk, onEnd, log, raw }) };
  }
  const [kind, idPart] = String(source.id).split(':');
  let accepts;
  if (kind === 'window') {
    const pid = await windowPid(idPart);
    if (!pid) {
      log('não consegui descobrir o processo dessa janela (Wayland?) — compartilhando sem áudio');
      return null;
    }
    accepts = (streamPid) => Number.isFinite(streamPid) && isInTree(streamPid, pid);
  } else {
    accepts = (streamPid) => !(Number.isFinite(streamPid) && isInTree(streamPid, ownPid));
  }
  return { start: (onChunk, onEnd) => startCapture({ accepts, onChunk, onEnd, log, raw }) };
}

function startCapture({ accepts, onChunk, onEnd, log, raw }) {
  if (!raw) log('pw-record sem --raw: convertendo o formato AU na mão');
  const nodeName = `didiscord-share-${process.pid}`;
  const rec = spawn('pw-record', [
    '-P', `{ node.autoconnect = false, node.name = ${nodeName}, node.description = didiscord-share, node.dont-reconnect = true }`,
    ...(raw ? ['--raw'] : []),
    '--format', 'f32', '--rate', '48000', '--channels', '2', '--latency', '20ms', '-',
  ], { env: pwEnv(), stdio: ['ignore', 'pipe', 'pipe'] });

  let stopped = false;
  let polling = false;
  // ligações pedidas há pouco (o pw-link ainda pode estar rodando) — não repete por alguns segundos.
  // O que vale de verdade é o grafo: a cada volta confere as ligações que EXISTEM no pw-dump. Antes
  // guardava pares de ids pra sempre, mas o PipeWire reaproveita ids: um app que fechava e abria o
  // som de novo (próxima música, próximo vídeo) ganhava o id antigo e nunca mais era ligado.
  const pending = new Map(); // `${saída}>${entrada}` -> quando pediu
  const PENDING_MS = 3000;

  const decode = raw ? null : createAuDecoder();
  rec.stdout.on('data', (chunk) => {
    if (stopped) return;
    const pcm = decode ? decode(chunk) : chunk;
    if (pcm && pcm.length) onChunk(pcm);
  });
  rec.stderr.on('data', (d) => log('[pw-record] ' + String(d).trim()));
  rec.on('error', (err) => { log('falha ao iniciar o pw-record: ' + err.message); finish(); });
  rec.on('exit', () => finish());

  function finish() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try { rec.kill('SIGTERM'); } catch (_) { /* já morreu */ }
    if (onEnd) onEnd();
  }

  async function poll() {
    if (stopped || polling) return;
    polling = true;
    try {
      const dump = JSON.parse(await run('pw-dump', []));
      const capture = dump.find((o) => o.type === 'PipeWire:Interface:Node' && props(o)['node.name'] === nodeName);
      if (!capture) return; // o pw-record ainda não registrou o node dele
      const inputs = portsOf(dump, capture.id, 'input');
      if (!inputs.length) return;

      const existing = new Set(dump
        .filter((o) => o.type === 'PipeWire:Interface:Link' && o.info)
        .map((o) => `${o.info['output-port-id']}>${o.info['input-port-id']}`));
      const now = Date.now();
      for (const [key, at] of pending) if (now - at > PENDING_MS || existing.has(key)) pending.delete(key);

      const streams = dump.filter((o) => o.type === 'PipeWire:Interface:Node' && props(o)['media.class'] === 'Stream/Output/Audio');
      for (const stream of streams) {
        const streamPid = Number(props(stream)['application.process.id']);
        if (!accepts(streamPid, props(stream))) continue;
        for (const out of portsOf(dump, stream.id, 'output')) {
          // canal por canal (FL→FL, FR→FR); stream mono vai pros dois lados
          let dests = inputs.filter((p) => p.channel && p.channel === out.channel);
          if (!dests.length) dests = out.channel === 'MONO' || !out.channel ? inputs : [inputs[0]];
          for (const dest of dests) {
            const key = `${out.id}>${dest.id}`;
            if (existing.has(key) || pending.has(key)) continue;
            pending.set(key, now);
            run('pw-link', [String(out.id), String(dest.id)]).catch(() => { /* link já existe ou o stream sumiu */ });
          }
        }
      }
    } catch (err) {
      log('verificação do PipeWire falhou: ' + err.message);
    } finally {
      polling = false;
    }
  }

  const timer = setInterval(poll, POLL_MS);
  setTimeout(poll, 300);

  return { stop: finish };
}

module.exports = { prepare, listAudioApps };
