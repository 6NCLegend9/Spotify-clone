const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, listener) {
  if (typeof listener !== "function") return () => {};
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = Object.freeze({
  getInfo: () => ipcRenderer.invoke("heykasa:get-info"),
  auth: Object.freeze({
    start: () => ipcRenderer.invoke("heykasa:auth:start"),
    getStatus: () => ipcRenderer.invoke("heykasa:auth:status"),
    onStatus: (listener) => subscribe("heykasa:auth:status-changed", listener),
  }),
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
  preferences: Object.freeze({
    get: () => ipcRenderer.invoke("heykasa:preferences:get"),
    set: (key, value) => ipcRenderer.invoke("heykasa:preferences:set", key, value),
  }),
});

contextBridge.exposeInMainWorld("heykasaDesktop", api);
