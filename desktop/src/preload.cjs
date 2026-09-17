const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, listener) {
  if (typeof listener !== "function") return () => {};
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = Object.freeze({
  getInfo: () => ipcRenderer.invoke("heykasa:get-info"),
  discord: Object.freeze({
    setActivity: (activity) => ipcRenderer.invoke("heykasa:discord:set-activity", activity),
    clearActivity: () => ipcRenderer.invoke("heykasa:discord:clear"),
    disconnect: () => ipcRenderer.invoke("heykasa:discord:disconnect"),
    getStatus: () => ipcRenderer.invoke("heykasa:discord:status"),
  }),
  updates: Object.freeze({
    getStatus: () => ipcRenderer.invoke("heykasa:updates:status"),
    check: () => ipcRenderer.invoke("heykasa:updates:check"),
    install: () => ipcRenderer.invoke("heykasa:updates:install"),
    onStatus: (listener) => subscribe("heykasa:updates:status-changed", listener),
  }),
  startup: Object.freeze({
    get: () => ipcRenderer.invoke("heykasa:startup:get"),
    set: (enabled) => ipcRenderer.invoke("heykasa:startup:set", enabled === true),
  }),
});

contextBridge.exposeInMainWorld("heykasaDesktop", api);
