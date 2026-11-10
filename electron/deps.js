'use strict';
// Dependências que o app desktop baixa sozinho na primeira vez que precisa — hoje, o ffmpeg do
// compartilhamento de tela pela placa de vídeo (ver screencast.js).
//
// Segurança: versão FIXA (não "a mais nova"), de uma build com mais de duas semanas de publicada, e o
// arquivo baixado só é usado se o SHA-256 bater com o valor oficial gravado aqui embaixo. Arquivo
// diferente = descartado.
//
// Fonte: builds estáticas do ffmpeg por BtbN (https://github.com/BtbN/FFmpeg-Builds), as mais usadas
// pra Linux/Windows, com NVENC (NVIDIA), AMF (AMD), QSV/VA-API (Intel) e captura de tela. Licença GPL.
// Versão 8.1.3: a 9.x exige driver NVIDIA 610+ — a 8.1 funciona com drivers bem mais antigos.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app } = require('electron');

const FFMPEG_BUILDS = {
  linux: {
    version: 'n8.1.3',
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-26-13-03/ffmpeg-n8.1.3-linux64-gpl-8.1.tar.xz',
    sha256: 'add729675e76163d04ba7e5b7e09c2439a20f66a4eaa23994b20d63f8ad75cb7',
    size: 150325156,
    archive: 'ffmpeg.tar.xz',
    exe: 'ffmpeg',
  },
  win32: {
    version: 'n8.1.3',
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-26-13-03/ffmpeg-n8.1.3-win64-gpl-8.1.zip',
    sha256: 'd20ef03f0f4161453b9f46a72471eb5370f56b6410fe8bca14a4b0220c6c924a',
    size: 193111781,
    archive: 'ffmpeg.zip',
    exe: 'ffmpeg.exe',
  },
};

function createDeps({ log }) {
  const build = process.arch === 'x64' ? FFMPEG_BUILDS[process.platform] : null;
  const dir = build ? path.join(app.getPath('userData'), 'deps', 'ffmpeg', build.version) : null;
  const exePath = build ? path.join(dir, build.exe) : null;

  // estado pra quem quiser mostrar na tela: idle | downloading | ready | failed | unsupported
  const status = { state: build ? 'idle' : 'unsupported', progress: 0, error: null };
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) { try { fn({ ...status }); } catch (_) { /* ok */ } } };

  let downloading = null;

  function managedFfmpeg() {
    return exePath && fs.existsSync(exePath) ? exePath : null;
  }

  function extract(archivePath) {
    // só o executável: o pacote tem também ffprobe/ffplay/docs, que o app não usa
    const pattern = `*/bin/${build.exe}`;
    const tar = process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') // vem no Windows 10 1803+
      : 'tar';
    const args = process.platform === 'win32'
      ? ['-xf', archivePath, '-C', dir, pattern]
      : ['-xJf', archivePath, '-C', dir, '--wildcards', pattern];
    return new Promise((resolve, reject) => {
      const p = spawn(tar, args, { windowsHide: true });
      let err = '';
      p.stderr.on('data', (d) => { err += d; });
      p.on('error', reject);
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`extração falhou: ${err.trim() || code}`))));
    });
  }

  function findExtracted(root) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        const hit = findExtracted(full);
        if (hit) return hit;
      } else if (entry.name === build.exe && path.basename(path.dirname(full)) === 'bin') {
        return full;
      }
    }
    return null;
  }

  async function download() {
    fs.mkdirSync(dir, { recursive: true });
    const archivePath = path.join(dir, build.archive + '.part');
    status.state = 'downloading';
    status.progress = 0;
    status.error = null;
    notify();
    log(`baixando ffmpeg ${build.version} (${Math.round(build.size / 1e6)} MB)`);

    const res = await fetch(build.url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`download falhou (HTTP ${res.status})`);
    const hash = crypto.createHash('sha256');
    const file = fs.createWriteStream(archivePath);
    let received = 0;
    let lastNotify = 0;
    try {
      for await (const chunk of res.body) {
        hash.update(chunk);
        received += chunk.length;
        if (!file.write(chunk)) await new Promise((r) => file.once('drain', r));
        if (Date.now() - lastNotify > 500) {
          lastNotify = Date.now();
          status.progress = Math.min(0.99, received / build.size);
          notify();
        }
      }
    } finally {
      await new Promise((r) => file.end(r));
    }

    const digest = hash.digest('hex');
    if (digest !== build.sha256) {
      fs.unlink(archivePath, () => {});
      throw new Error('o arquivo baixado não bate com a verificação oficial — descartado');
    }

    await extract(archivePath);
    const extracted = findExtracted(dir);
    if (!extracted) throw new Error('não achei o ffmpeg dentro do pacote baixado');
    fs.renameSync(extracted, exePath);
    if (process.platform !== 'win32') fs.chmodSync(exePath, 0o755);
    // limpa o pacote e as pastas que sobraram da extração
    fs.unlink(archivePath, () => {});
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
    }
    status.state = 'ready';
    status.progress = 1;
    notify();
    log(`ffmpeg ${build.version} pronto em ${exePath}`);
    return exePath;
  }

  // baixa (uma vez) se ainda não tiver. Não lança: em caso de erro, devolve null e status = failed
  // (tenta de novo da próxima vez que alguém pedir).
  function ensureFfmpeg() {
    if (!build) return Promise.resolve(null);
    const existing = managedFfmpeg();
    if (existing) {
      status.state = 'ready';
      status.progress = 1;
      return Promise.resolve(existing);
    }
    if (!downloading) {
      downloading = download()
        .catch((err) => {
          log('falha ao baixar o ffmpeg: ' + err.message);
          status.state = 'failed';
          status.error = err.message;
          notify();
          return null;
        })
        .finally(() => { downloading = null; });
    }
    return downloading;
  }

  return {
    managedFfmpeg,
    ensureFfmpeg,
    getStatus: () => ({ ...status }),
    onStatus: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

module.exports = { createDeps };
