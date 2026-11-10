'use strict';
// Ponte só da janelinha de escolher tela/janela (picker.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pickerApi', {
  // 'sources' (X11/Windows: telas e janelas com miniatura) ou 'audio' (Wayland: só o som)
  mode: new URLSearchParams(window.location.search).get('mode') || 'sources',
  getSources: () => ipcRenderer.invoke('picker:getSources'),
  choose: (id) => ipcRenderer.send('picker:choose', id),
  getAudioApps: () => ipcRenderer.invoke('picker:getAudioApps'),
  chooseAudio: (choice) => ipcRenderer.send('picker:chooseAudio', choice),
  cancel: () => ipcRenderer.send('picker:cancel'),
});
