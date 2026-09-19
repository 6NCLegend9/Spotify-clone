const BRIDGE_URL = "ws://127.0.0.1:64650";
const CONNECT_TIMEOUT_MS = 2500;
const COMMAND_TIMEOUT_MS = 8000;

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default class DiscordBridgeClient {
  constructor() {
    this.socket = null;
    this.connecting = null;
    this.pending = new Map();
    this.disconnectListeners = new Set();
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  onDisconnect(listener) {
    if (typeof listener !== "function") return () => {};
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  ensureConnected() {
    if (this.connected) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(BRIDGE_URL);
      const timer = window.setTimeout(() => {
        finish(new Error("HayKasa Discord Bridge did not answer."));
      }, CONNECT_TIMEOUT_MS);

      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error) {
          try { socket.close(); } catch { /* already closed */ }
          reject(error);
          return;
        }
        this.socket = socket;
        socket.onmessage = (event) => this.handleMessage(event.data);
        socket.onerror = () => {};
        socket.onclose = () => this.handleClose(socket);
        resolve();
      };

      socket.onopen = () => finish();
      socket.onerror = () => finish(new Error(
        "HayKasa Discord Bridge is not running. Start desktop-bridge/start-windows.bat, then keep Discord Desktop open.",
      ));
      socket.onclose = () => finish(new Error(
        "HayKasa Discord Bridge is not running. Start desktop-bridge/start-windows.bat, then keep Discord Desktop open.",
      ));
    });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const id = message?.id;
    if (!id || !this.pending.has(id)) return;
    const entry = this.pending.get(id);
    this.pending.delete(id);
    window.clearTimeout(entry.timer);
    if (message.ok === false) {
      entry.reject(new Error(message.error || "Discord Rich Presence failed."));
      return;
    }
    entry.resolve(message);
  }

  handleClose(socket) {
    if (this.socket !== socket) return;
    this.socket = null;
    const error = new Error("HayKasa Discord Bridge disconnected.");
    this.pending.forEach((entry) => {
      window.clearTimeout(entry.timer);
      entry.reject(error);
    });
    this.pending.clear();
    this.disconnectListeners.forEach((listener) => {
      try { listener(error); } catch { /* listener errors must not break cleanup */ }
    });
  }

  async command(action, activity = null) {
    await this.ensureConnected();
    if (!this.connected) throw new Error("HayKasa Discord Bridge is not connected.");
    const id = requestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("HayKasa Discord Bridge did not answer in time."));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, action, activity }));
      } catch (error) {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  setActivity(activity) {
    return this.command("setActivity", activity || null);
  }

  disconnect() {
    const socket = this.socket;
    this.socket = null;
    this.pending.forEach((entry) => {
      window.clearTimeout(entry.timer);
      entry.reject(new Error("HayKasa Discord Bridge disconnected."));
    });
    this.pending.clear();
    if (socket && socket.readyState <= WebSocket.OPEN) {
      try { socket.close(); } catch { /* already closed */ }
    }
  }
}
