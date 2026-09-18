import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DISCORD_CLIENT_ID = process.env.HEYKASA_DISCORD_CLIENT_ID || "1550162988407857252";
export const BRIDGE_HOST = "127.0.0.1";
export const BRIDGE_PORT = Number(process.env.HEYKASA_DISCORD_BRIDGE_PORT || 64650);

const IPC_HANDSHAKE = 0;
const IPC_FRAME = 1;
const IPC_CLOSE = 2;
const IPC_PING = 3;
const IPC_PONG = 4;
const IPC_TIMEOUT_MS = 5000;
const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_WS_MESSAGE_BYTES = 128 * 1024;
const WEB_ORIGINS = new Set([
  "https://haykasa.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:3003",
]);

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
  const uniqueRoots = [...new Set(roots)];
  return uniqueRoots.flatMap((root) => (
    Array.from({ length: 10 }, (_, index) => path.join(root, `discord-ipc-${index}`))
  ));
}

export function isAllowedWebOrigin(origin) {
  return WEB_ORIGINS.has(String(origin || ""));
}

class DiscordIpcClient {
  constructor(clientId) {
    this.clientId = clientId;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.connecting = null;
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
        console.log(`[HeyKasa Discord Bridge] Connected to ${ipcPath}`);
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
    const nonce = frame.payload?.nonce;
    if (!nonce || !this.pending.has(nonce)) return;
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

  async command(cmd, args) {
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
        socket.write(encodeIpcFrame(IPC_FRAME, { cmd, args, nonce }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(nonce);
        reject(error);
      }
    });
  }

  async setActivity(input) {
    const activity = sanitizeActivity(input);
    if (!activity) {
      await this.command("SET_ACTIVITY", { pid: process.pid });
      return;
    }

    const attempts = [activity];
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
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Discord rejected the Rich Presence update.");
  }

  disconnect() {
    this.rejectPending(new Error("Discord bridge stopped."));
    this.socket?.destroy();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }
}

function encodeWebSocketFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

class BrowserPeer {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.closed = false;
    socket.on("data", (chunk) => this.feed(chunk));
    socket.on("error", () => this.close());
    socket.on("close", () => this.close(false));
  }

  feed(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    try {
      while (this.buffer.length >= 2) {
        const first = this.buffer[0];
        const second = this.buffer[1];
        const fin = (first & 0x80) !== 0;
        const opcode = first & 0x0f;
        const masked = (second & 0x80) !== 0;
        let length = second & 0x7f;
        let offset = 2;

        if (length === 126) {
          if (this.buffer.length < 4) return;
          length = this.buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (this.buffer.length < 10) return;
          const big = this.buffer.readBigUInt64BE(2);
          if (big > BigInt(MAX_WS_MESSAGE_BYTES)) throw new Error("WebSocket message is too large.");
          length = Number(big);
          offset = 10;
        }
        if (length > MAX_WS_MESSAGE_BYTES) throw new Error("WebSocket message is too large.");
        if (!masked) throw new Error("Browser WebSocket frames must be masked.");
        if (this.buffer.length < offset + 4 + length) return;

        const mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
        const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
        this.buffer = this.buffer.subarray(offset + length);

        if (opcode === 0x8) {
          this.socket.write(encodeWebSocketFrame(0x8));
          this.close();
          return;
        }
        if (opcode === 0x9) {
          this.socket.write(encodeWebSocketFrame(0xA, payload));
          continue;
        }
        if (opcode === 0xA) continue;
        if (opcode !== 0x1 || !fin) throw new Error("Only complete text WebSocket messages are supported.");
        this.onMessage(payload.toString("utf8"), this);
      }
    } catch (error) {
      this.send({ type: "error", error: error.message || "Invalid WebSocket message." });
      this.close();
    }
  }

  send(value) {
    if (this.closed || this.socket.destroyed) return;
    const payload = Buffer.from(JSON.stringify(value), "utf8");
    this.socket.write(encodeWebSocketFrame(0x1, payload));
  }

  close(destroy = true) {
    if (this.closed) return;
    this.closed = true;
    if (destroy && !this.socket.destroyed) this.socket.destroy();
    this.onClose(this);
  }
}

export function createBridgeServer({
  clientId = DISCORD_CLIENT_ID,
  host = BRIDGE_HOST,
  port = BRIDGE_PORT,
} = {}) {
  const discord = new DiscordIpcClient(clientId);
  const peers = new Set();
  let clearTimer = null;

  const scheduleClear = () => {
    if (clearTimer) clearTimeout(clearTimer);
    if (peers.size) return;
    clearTimer = setTimeout(() => {
      discord.setActivity(null).catch(() => {});
    }, 4000);
  };

  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({
        ok: true,
        bridge: "HeyKasa Discord Bridge",
        discordConnected: discord.connected,
        clientId,
      }));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  server.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    const key = request.headers["sec-websocket-key"];
    const upgrade = String(request.headers.upgrade || "").toLowerCase();
    if (!isAllowedWebOrigin(origin) || !key || upgrade !== "websocket") {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }

    const accept = crypto
      .createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n",
    ].join("\r\n"));

    const onMessage = async (raw, currentPeer) => {
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        currentPeer.send({ ok: false, error: "Invalid JSON message." });
        return;
      }
      const id = typeof message?.id === "string" ? message.id : "";
      try {
        if (message?.action === "ping") {
          currentPeer.send({ id, ok: true, discordConnected: discord.connected });
          return;
        }
        if (message?.action !== "setActivity") {
          throw new Error("Unsupported bridge command.");
        }
        await discord.setActivity(message.activity || null);
        currentPeer.send({ id, ok: true, discordConnected: true });
      } catch (error) {
        currentPeer.send({
          id,
          ok: false,
          error: error instanceof Error ? error.message : "Discord Rich Presence failed.",
        });
      }
    };
    const onClose = (currentPeer) => {
      peers.delete(currentPeer);
      scheduleClear();
    };
    const peer = new BrowserPeer(socket, onMessage, onClose);
    peers.add(peer);
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    peer.send({ type: "ready", version: 1, clientId });
    if (head?.length) peer.feed(head);
  });

  server.on("close", () => discord.disconnect());

  return {
    server,
    discord,
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    async close() {
      for (const peer of peers) peer.close();
      await discord.setActivity(null).catch(() => {});
      discord.disconnect();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

async function main() {
  const bridge = createBridgeServer();
  await bridge.listen();
  console.log(`[HeyKasa Discord Bridge] Listening on ws://${BRIDGE_HOST}:${BRIDGE_PORT}`);
  console.log(`[HeyKasa Discord Bridge] Discord application ${DISCORD_CLIENT_ID}`);
  console.log("[HeyKasa Discord Bridge] Keep this window open while using HeyKasa.");

  const shutdown = async () => {
    console.log("\n[HeyKasa Discord Bridge] Shutting down...");
    await bridge.close().catch(() => {});
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const launchedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (launchedDirectly) {
  main().catch((error) => {
    console.error(`[HeyKasa Discord Bridge] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
