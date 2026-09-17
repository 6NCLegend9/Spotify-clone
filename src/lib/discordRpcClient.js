import { setDiscordPresenceStatus } from "@/utils/discordPresenceStatus";

const RPC_PORTS = [6463, 6464, 6465, 6466, 6467, 6468, 6469, 6470, 6471, 6472];
const TOKEN_STORAGE_KEY = "heykasa:discord-rpc:v1";
const CONNECT_TIMEOUT_MS = 1500;
const COMMAND_TIMEOUT_MS = 20000;
const PROCESS_ID = 1;
const ACTIVITY_SCOPES = ["identify", "rpc", "rpc.activities.write"];

function randomNonce() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.accessToken || Number(parsed.expiresAt) <= Date.now()) return "";
    return parsed.accessToken;
  } catch {
    return "";
  }
}

function writeStoredToken(token) {
  try {
    if (!token?.accessToken) {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    }));
  } catch {
    // sessionStorage can be blocked
  }
}

function payloadError(payload) {
  if (payload?.evt !== "ERROR") return "";
  return payload?.data?.message || `Discord RPC error ${payload?.data?.code || ""}`.trim();
}

export default class DiscordRpcClient {
  constructor(clientId) {
    this.clientId = clientId;
    this.socket = null;
    this.pending = new Map();
    this.authenticated = false;
    this.connecting = null;
    this.closed = false;
  }

  disconnect() {
    this.closed = true;
    this.authenticated = false;
    this.pending.forEach((entry) => {
      window.clearTimeout(entry.timer);
      entry.reject(new Error("Discord presence disconnected."));
    });
    this.pending.clear();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  async ensureConnected() {
    if (this.closed) this.closed = false;
    if (this.authenticated && this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async connect() {
    setDiscordPresenceStatus({ state: "connecting", detail: "" });
    const socket = await this.openSocket();
    this.socket = socket;
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => {
      this.authenticated = false;
      this.socket = null;
    };
    await this.authenticate();
    setDiscordPresenceStatus({ state: "connected", detail: "" });
  }

  openSocket() {
    return RPC_PORTS.reduce(
      (previous, port) => previous.catch(() => this.tryPort(port)),
      Promise.reject(new Error("start")),
    ).catch(() => {
      throw new Error("Discord desktop is not available on this computer.");
    });
  }

  tryPort(port) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(`ws://127.0.0.1:${port}/?v=1&client_id=${encodeURIComponent(this.clientId)}&encoding=json`);
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.onmessage = null;
        if (error) {
          try { socket.close(); } catch { /* already closed */ }
          reject(error);
        } else {
          resolve(socket);
        }
      };
      const timer = window.setTimeout(() => finish(new Error("timeout")), CONNECT_TIMEOUT_MS);
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.evt === "READY") finish();
        } catch {
          finish(new Error("socket"));
        }
      };
      socket.onerror = () => finish(new Error("socket"));
      socket.onclose = () => finish(new Error("closed"));
    });
  }

  handleMessage(raw) {
    let payload;
    try {
      payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    const nonce = payload?.nonce;
    if (!nonce || !this.pending.has(nonce)) return;
    const entry = this.pending.get(nonce);
    this.pending.delete(nonce);
    window.clearTimeout(entry.timer);
    const error = payloadError(payload);
    if (error) entry.reject(new Error(error));
    else entry.resolve(payload.data || payload);
  }

  command(cmd, args = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Discord presence is not connected."));
    }
    const nonce = randomNonce();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(nonce);
        reject(new Error("Discord did not answer in time."));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(nonce, { resolve, reject });
      this.pending.get(nonce).timer = timer;
      this.socket.send(JSON.stringify({ nonce, cmd, args }));
    });
  }

  async authenticate() {
    const stored = readStoredToken();
    if (stored) {
      try {
        await this.command("AUTHENTICATE", { access_token: stored });
        this.authenticated = true;
        return;
      } catch {
        writeStoredToken(null);
      }
    }

    const token = await this.authorize();
    await this.command("AUTHENTICATE", { access_token: token.accessToken });
    this.authenticated = true;
  }

  async authorize() {
    // Rich Presence updates need both local RPC access and rpc.activities.write.
    // Do not fall back to a smaller scope set: authentication can succeed while
    // SET_ACTIVITY is guaranteed to fail afterwards.
    const begin = await fetch("/api/discord/oauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "begin" }),
    });
    const started = await begin.json();
    const { state, rpcToken } = started?.data || {};
    if (!begin.ok || !state) throw new Error(started?.message || "Log in to connect Discord.");

    const authorized = await this.command("AUTHORIZE", {
      client_id: this.clientId,
      scopes: ACTIVITY_SCOPES,
      ...(rpcToken ? { rpc_token: rpcToken } : {}),
    });
    const response = await fetch("/api/discord/oauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: authorized?.code,
        state,
        redirectUri: window.location.origin,
      }),
    });
    const json = await response.json();
    const token = json?.data || json;
    if (!response.ok || !token?.accessToken) {
      throw new Error(json?.message || "Discord token exchange failed.");
    }
    writeStoredToken(token);
    return token;
  }

  async setActivity(activity) {
    await this.ensureConnected();
    if (!activity) {
      await this.command("SET_ACTIVITY", { pid: PROCESS_ID });
      return;
    }
    try {
      await this.command("SET_ACTIVITY", { pid: PROCESS_ID, activity });
    } catch (error) {
      if (!activity.buttons) throw error;
      const { buttons, ...withoutButtons } = activity;
      await this.command("SET_ACTIVITY", { pid: PROCESS_ID, activity: withoutButtons });
    }
  }
}
