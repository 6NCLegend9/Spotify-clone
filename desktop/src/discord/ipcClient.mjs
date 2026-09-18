import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";

export const DISCORD_CLIENT_ID = "1550162988407857252";

const IPC_HANDSHAKE = 0;
const IPC_FRAME = 1;
const IPC_CLOSE = 2;
const IPC_PING = 3;
const IPC_PONG = 4;
const IPC_TIMEOUT_MS = 5000;
const MAX_FRAME_BYTES = 1024 * 1024;

function cleanText(value, max = 128) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : "";
}

function unixSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.floor(number > 100_000_000_000 ? number / 1000 : number);
}

function cleanUrl(value) {
  const text = String(value || "").trim();
  return /^https:\/\//i.test(text) ? text.slice(0, 300) : "";
}

function sanitizeParty(value) {
  const id = cleanText(value?.id, 128);
  if (!id) return null;
  const raw = Array.isArray(value.size) ? value.size : [];
  const current = Math.max(1, Math.min(50, Math.round(Number(raw[0]) || 1)));
  const max = Math.max(current, Math.min(50, Math.round(Number(raw[1]) || 50)));
  return { id, size: [current, max] };
}

function sanitizeSecrets(value) {
  const join = cleanText(value?.join, 128);
  return join ? { join } : null;
}

export function sanitizeActivity(value) {
  if (!value || typeof value !== "object") return null;
  const activity = {
    type: [0, 2, 3, 5].includes(Number(value.type)) ? Number(value.type) : 0,
  };

  const details = cleanText(value.details);
  const state = cleanText(value.state);
  if (details) activity.details = details;
  if (state) activity.state = state;

  const start = unixSeconds(value.timestamps?.start);
  const end = unixSeconds(value.timestamps?.end);
  if (start || end) {
    activity.timestamps = {
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    };
  }

  const largeImage = cleanText(value.assets?.large_image, 300);
  const largeText = cleanText(value.assets?.large_text);
  const smallImage = cleanText(value.assets?.small_image, 300);
  const smallText = cleanText(value.assets?.small_text);
  if (largeImage || largeText || smallImage || smallText) {
    activity.assets = {
      ...(largeImage ? { large_image: largeImage } : {}),
      ...(largeText ? { large_text: largeText } : {}),
      ...(smallImage ? { small_image: smallImage } : {}),
      ...(smallText ? { small_text: smallText } : {}),
    };
  }

  const party = sanitizeParty(value.party);
  const secrets = sanitizeSecrets(value.secrets);
  if (party) activity.party = party;
  if (secrets && party) {
    activity.secrets = secrets;
    activity.instance = value.instance !== false;
  } else if (Array.isArray(value.buttons)) {
    const buttons = value.buttons
      .slice(0, 2)
      .map((button) => ({
        label: cleanText(button?.label, 32),
        url: cleanUrl(button?.url),
      }))
      .filter((button) => button.label && button.url);
    if (buttons.length) activity.buttons = buttons;
  }

  return activity;
}

export function encodeIpcFrame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload ?? {}), "utf8");
  const header = Buffer.allocUnsafe(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export function decodeIpcFrames(input) {
  let offset = 0;
  const frames = [];
  while (input.length - offset >= 8) {
    const opcode = input.readUInt32LE(offset);
    const length = input.readUInt32LE(offset + 4);
    if (length > MAX_FRAME_BYTES) throw new Error("Discord IPC frame is too large.");
    if (input.length - offset < 8 + length) break;
    const raw = input.subarray(offset + 8, offset + 8 + length).toString("utf8");
    const payload = raw ? JSON.parse(raw) : {};
    frames.push({ opcode, payload });
    offset += 8 + length;
  }
  return { frames, rest: input.subarray(offset) };
}

export function discordIpcPaths(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    return Array.from({ length: 10 }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`);
  }
  const roots = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, "/tmp"].filter(Boolean);
  return [...new Set(roots)].flatMap((root) => (
    Array.from({ length: 10 }, (_, index) => path.join(root, `discord-ipc-${index}`))
  ));
}

export class DiscordIpcClient {
  constructor(clientId = DISCORD_CLIENT_ID) {
    this.clientId = clientId;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.connecting = null;
    this.everConnected = false;
    this.joinHandler = null;
    this.subscribedJoin = false;
  }

  onJoin(handler) {
    this.joinHandler = typeof handler === "function" ? handler : null;
  }

  get connected() {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  async ensureConnected() {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectAny().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async connectAny() {
    let lastError = null;
    for (const ipcPath of discordIpcPaths()) {
      try {
        await this.connectPipe(ipcPath);
        this.everConnected = true;
        console.info(`[HeyKasa Desktop] Discord IPC connected: ${ipcPath}`);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    const detail = lastError instanceof Error ? ` (${lastError.message})` : "";
    throw new Error(`Discord Desktop is not running or its IPC pipe is unavailable${detail}`);
  }

  connectPipe(ipcPath) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(ipcPath);
      let buffer = Buffer.alloc(0);
      let settled = false;
      const timer = setTimeout(() => finish(new Error("Discord IPC handshake timed out.")), 1500);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off("error", onError);
        socket.off("close", onClose);
        socket.off("data", onData);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          socket.destroy();
          reject(error);
          return;
        }
        this.attachSocket(socket, buffer);
        resolve();
      };
      const onError = (error) => finish(error);
      const onClose = () => finish(new Error("Discord IPC closed during handshake."));
      const onData = (chunk) => {
        try {
          buffer = Buffer.concat([buffer, chunk]);
          const decoded = decodeIpcFrames(buffer);
          buffer = decoded.rest;
          for (const frame of decoded.frames) {
            if (frame.opcode === IPC_PING) {
              socket.write(encodeIpcFrame(IPC_PONG, frame.payload));
              continue;
            }
            if (frame.opcode === IPC_CLOSE) {
              finish(new Error(frame.payload?.message || "Discord rejected the IPC handshake."));
              return;
            }
            if (frame.opcode === IPC_FRAME && frame.payload?.evt === "ERROR") {
              finish(new Error(frame.payload?.data?.message || "Discord rejected the IPC handshake."));
              return;
            }
            if (frame.opcode === IPC_FRAME && frame.payload?.evt === "READY") {
              finish();
              return;
            }
          }
        } catch (error) {
          finish(error);
        }
      };

      socket.once("error", onError);
      socket.once("close", onClose);
      socket.on("data", onData);
      socket.once("connect", () => {
        socket.write(encodeIpcFrame(IPC_HANDSHAKE, { v: 1, client_id: this.clientId }));
      });
    });
  }

  attachSocket(socket, initialBuffer) {
    if (this.socket && this.socket !== socket) this.socket.destroy();
    this.socket = socket;
    this.buffer = initialBuffer;
    socket.on("data", (chunk) => this.handleData(socket, chunk));
    socket.on("error", () => {});
    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.buffer = Buffer.alloc(0);
      this.rejectPending(new Error("Discord IPC connection closed."));
    });
    if (this.buffer.length) this.handleData(socket, Buffer.alloc(0));
  }

  handleData(socket, chunk) {
    if (this.socket !== socket) return;
    try {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const decoded = decodeIpcFrames(this.buffer);
      this.buffer = decoded.rest;
      for (const frame of decoded.frames) this.handleFrame(frame);
    } catch (error) {
      this.rejectPending(error);
      socket.destroy();
    }
  }

  handleFrame(frame) {
    if (frame.opcode === IPC_PING) {
      this.socket?.write(encodeIpcFrame(IPC_PONG, frame.payload));
      return;
    }
    if (frame.opcode === IPC_CLOSE) {
      const error = new Error(frame.payload?.message || "Discord closed the IPC connection.");
      this.rejectPending(error);
      this.socket?.destroy();
      return;
    }
    if (frame.opcode !== IPC_FRAME) return;
    const evt = frame.payload?.evt;
    const nonce = frame.payload?.nonce;
    if (!nonce || !this.pending.has(nonce)) {
      if (evt === "ACTIVITY_JOIN" && frame.payload?.data?.secret) {
        this.joinHandler?.(String(frame.payload.data.secret));
      }
      if (evt === "ACTIVITY_JOIN_REQUEST" && frame.payload?.data?.user?.id) {
        void this.command("SEND_ACTIVITY_JOIN_INVITE", {
          user_id: String(frame.payload.data.user.id),
        }).catch(() => {});
      }
      return;
    }
    const entry = this.pending.get(nonce);
    this.pending.delete(nonce);
    clearTimeout(entry.timer);
    if (frame.payload?.evt === "ERROR") {
      entry.reject(new Error(frame.payload?.data?.message || `Discord RPC error ${frame.payload?.data?.code || ""}`.trim()));
      return;
    }
    entry.resolve(frame.payload?.data ?? frame.payload);
  }

  rejectPending(error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  async command(cmd, args, extra = {}) {
    await this.ensureConnected();
    const socket = this.socket;
    if (!socket || socket.destroyed) throw new Error("Discord IPC is not connected.");
    const nonce = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nonce);
        reject(new Error("Discord did not answer the Rich Presence command in time."));
      }, IPC_TIMEOUT_MS);
      this.pending.set(nonce, { resolve, reject, timer });
      try {
        socket.write(encodeIpcFrame(IPC_FRAME, { cmd, args, nonce, ...extra }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(nonce);
        reject(error);
      }
    });
  }

  async subscribeJoinEvents() {
    if (this.subscribedJoin) return;
    this.subscribedJoin = true;
    try {
      await this.command("SUBSCRIBE", {}, { evt: "ACTIVITY_JOIN" });
      await this.command("SUBSCRIBE", {}, { evt: "ACTIVITY_JOIN_REQUEST" });
    } catch {
      this.subscribedJoin = false;
    }
  }

  async setActivity(input) {
    const activity = sanitizeActivity(input);
    if (!activity) {
      await this.command("SET_ACTIVITY", { pid: process.pid });
      return;
    }

    const attempts = [activity];
    if (activity.secrets) {
      const { secrets, party, instance, ...withoutJoin } = activity;
      attempts.push(withoutJoin);
    }
    if (activity.buttons) {
      const { buttons, ...withoutButtons } = activity;
      attempts.push(withoutButtons);
    }
    const last = attempts[attempts.length - 1];
    if (last.assets) {
      const { assets, ...minimal } = last;
      attempts.push(minimal);
    }

    let lastError = null;
    for (const candidate of attempts) {
      try {
        await this.command("SET_ACTIVITY", { pid: process.pid, activity: candidate });
        void this.subscribeJoinEvents();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Discord rejected the Rich Presence update.");
  }

  async clearActivity() {
    if (!this.connected && !this.everConnected) return;
    await this.setActivity(null);
  }

  disconnect() {
    this.subscribedJoin = false;
    this.rejectPending(new Error("Discord desktop connection closed."));
    this.socket?.destroy();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }
}
