'use strict';
// Narrow, typed bridge between the sandboxed UI and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('remoNative', {
  platform: process.platform,
  request: (req) => ipcRenderer.invoke('remo:request', req),
  discover: (timeoutMs) => ipcRenderer.invoke('remo:discover', timeoutMs),
  openExternal: (url) => ipcRenderer.send('remo:open-external', url),
  setTray: (state) => ipcRenderer.send('remo:set-tray', state),
  onTrayAction: (cb) => ipcRenderer.on('remo:tray-action', (_e, action, id) => cb(action, id)),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('remo:auto-launch', enabled),
});
