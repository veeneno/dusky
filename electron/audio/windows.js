'use strict';
// Áudio do compartilhamento de tela no Windows, via dusky-audiocap.exe (WASAPI Process
// Loopback — ver electron/native/audiocap.cpp). O helper escreve PCM cru no stdout (float32
// intercalado, 48 kHz, estéreo) e para sozinho quando o stdin fecha.
//
//   janela escolhida -> --capture include <pid da janela>  (só aquele app e os filhos)
//   tela inteira     -> --capture exclude <pid do dusky> (tudo menos o dusky, senão a voz de
//                       quem está na call voltaria pra ele em eco)

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function helperPath() {
  // instalado: o electron-builder copia o .exe pra <resources>/audiocap (ver "extraResources")
  const packaged = path.join(process.resourcesPath || '', 'audiocap', 'dusky-audiocap.exe');
  if (fs.existsSync(packaged)) return packaged;
  // rodando do código-fonte (npm run dev)
  const dev = path.join(__dirname, '..', 'native', 'bin', 'dusky-audiocap.exe');
  return fs.existsSync(dev) ? dev : null;
}

function windowPid(helper, hwnd) {
  return new Promise((resolve) => {
    execFile(helper, ['--window-info', String(hwnd)], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        const line = String(stdout).split(/\r?\n/).find((l) => l.trim().startsWith('{'));
        const info = line ? JSON.parse(line) : null;
        resolve(info && info.pid ? Number(info.pid) : null);
      } catch (_) {
        resolve(null);
      }
    });
  });
}

async function prepare({ source, ownPid, log }) {
  const helper = helperPath();
  if (!helper) {
    log('dusky-audiocap.exe não encontrado — compartilhando sem áudio');
    return null;
  }
  const [kind, idPart] = String(source.id).split(':');
  let mode;
  let target;
  if (kind === 'window') {
    target = await windowPid(helper, idPart);
    if (!target) {
      log('não consegui descobrir o processo dessa janela — compartilhando sem áudio');
      return null;
    }
    mode = 'include';
  } else {
    mode = 'exclude';
    target = ownPid;
  }
  return { start: (onChunk, onEnd) => startCapture({ helper, mode, target, onChunk, onEnd, log }) };
}

function startCapture({ helper, mode, target, onChunk, onEnd, log }) {
  const child = spawn(helper, ['--capture', mode, String(target)], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stopped = false;

  child.stdout.on('data', (chunk) => { if (!stopped) onChunk(chunk); });
  child.stderr.on('data', (d) => log('[audiocap] ' + String(d).trim()));
  child.stdin.on('error', () => { /* o helper já fechou */ });
  child.on('error', (err) => { log('falha ao iniciar o audiocap: ' + err.message); finish(); });
  child.on('exit', () => finish());

  function finish() {
    if (stopped) return;
    stopped = true;
    try { child.stdin.end(); } catch (_) { /* já fechado */ }
    setTimeout(() => { try { child.kill(); } catch (_) { /* já saiu */ } }, 1500);
    if (onEnd) onEnd();
  }

  return { stop: finish };
}

module.exports = { prepare };
