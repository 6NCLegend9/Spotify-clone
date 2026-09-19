const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, listener) {
  if (typeof listener !== "function") return () => {};
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld("heykasaMini", Object.freeze({
  getState: () => ipcRenderer.invoke("heykasa:mini:state"),
  playPause: () => ipcRenderer.invoke("heykasa:mini:command", "play-pause"),
  skip: () => ipcRenderer.invoke("heykasa:mini:command", "skip"),
  prev: () => ipcRenderer.invoke("heykasa:mini:command", "prev"),
  openMain: () => ipcRenderer.invoke("heykasa:mini:open"),
  hide: () => ipcRenderer.invoke("heykasa:mini:hide"),
  onState: (listener) => subscribe("heykasa:playback:state", listener),
  appearance: Object.freeze({
    get: () => ipcRenderer.invoke("heykasa:mini:appearance"),
    onChanged: (listener) => subscribe("heykasa:appearance:changed", listener),
  }),
}));
