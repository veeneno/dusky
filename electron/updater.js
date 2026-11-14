'use strict';
// Atualização automática do app desktop. As versões novas ficam no próprio servidor do dusky,
// em <servidor>/downloads/ (o `npm run release` da pasta electron/ gera e copia pra lá). O app
// confere ao abrir e a cada 3 horas; quando acha, baixa em segundo plano e, terminando, pergunta
// se quer reiniciar agora (se não, instala sozinho ao fechar).
//
// Funciona no instalador do Windows (NSIS) e no AppImage do Linux. No .deb, o electron-updater
// também instala, mas pede a senha de administrador (pkexec) — por isso o AppImage é o recomendado.

const { app, dialog } = require('electron');

const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;

// onQuitForUpdate: avisa o main.js que é pra fechar DE VERDADE (fechar a janela só esconde o app)
function createUpdater({ log, getWindow, getSiteUrl, onQuitForUpdate }) {
  let autoUpdater = null;
  let timer = null;
  let downloadedVersion = null;
  let manualCheck = false;

  function load() {
    if (autoUpdater) return autoUpdater;
    try {
      ({ autoUpdater } = require('electron-updater'));
    } catch (err) {
      log('atualização automática indisponível (electron-updater não instalado):', err.message);
      return null;
    }
    autoUpdater.logger = { info: (m) => log('[update]', m), warn: (m) => log('[update]', m), error: (m) => log('[update] erro:', m), debug: () => {} };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on('update-not-available', () => {
      if (manualCheck) dialog.showMessageBox(getWindow() || undefined, { type: 'info', message: 'O dusky já está na versão mais nova.', detail: `versão ${app.getVersion()}` });
      manualCheck = false;
    });
    autoUpdater.on('update-available', (info) => {
      log('[update] versão nova disponível:', info && info.version);
      if (manualCheck) dialog.showMessageBox(getWindow() || undefined, { type: 'info', message: `Baixando a versão ${info.version}…`, detail: 'Quando terminar, eu aviso.' });
      manualCheck = false;
    });
    autoUpdater.on('error', (err) => {
      log('[update] falhou:', err && err.message);
      if (manualCheck) dialog.showMessageBox(getWindow() || undefined, { type: 'error', message: 'Não deu pra procurar atualização.', detail: String(err && err.message || err) });
      manualCheck = false;
    });
    autoUpdater.on('update-downloaded', async (info) => {
      if (downloadedVersion === info.version) return;
      downloadedVersion = info.version;
      const win = getWindow();
      const { response } = await dialog.showMessageBox(win || undefined, {
        type: 'info',
        buttons: ['Reiniciar agora', 'Depois'],
        defaultId: 0,
        cancelId: 1,
        title: 'dusky',
        message: `A versão ${info.version} do dusky está pronta.`,
        detail: 'Reinicia agora pra usar, ou ela é instalada sozinha quando você sair do app (ícone da bandeja → Sair).',
      });
      if (response === 0) {
        if (onQuitForUpdate) onQuitForUpdate();
        setImmediate(() => autoUpdater.quitAndInstall(false, true));
      }
    });
    return autoUpdater;
  }

  // o endereço das atualizações acompanha o servidor escolhido (dusky.veneno.space, ou outro)
  function feedUrl() {
    const site = getSiteUrl();
    if (!site || !/^https?:/.test(site)) return null;
    return new URL('/downloads/', site).href;
  }

  function check(manual = false) {
    if (!app.isPackaged) {
      if (manual) dialog.showMessageBox(getWindow() || undefined, { type: 'info', message: 'Atualização automática só funciona no app instalado.', detail: 'Rodando pelo código (npm start), atualize com git pull.' });
      return;
    }
    const updater = load();
    const url = feedUrl();
    if (!updater || !url) return;
    manualCheck = manual;
    updater.setFeedURL({ provider: 'generic', url, useMultipleRangeRequest: false });
    updater.checkForUpdates().catch((err) => log('[update] falhou:', err && err.message));
  }

  function start() {
    if (!app.isPackaged) return;
    setTimeout(() => check(false), 15 * 1000);
    clearInterval(timer);
    timer = setInterval(() => check(false), CHECK_EVERY_MS);
  }

  return { start, check };
}

module.exports = { createUpdater };
