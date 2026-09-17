import fs from "node:fs";
import path from "node:path";

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_FIELD_LENGTH = 1000;
const SENSITIVE_KEY = /token|cookie|password|secret|authorization|credential|verifier|challenge|code$/i;

function safePrimitive(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, MAX_FIELD_LENGTH);
  return undefined;
}

function sanitizeFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, raw] of Object.entries(value).slice(0, 30)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    const primitive = safePrimitive(raw);
    if (primitive !== undefined) output[key] = primitive;
  }
  return output;
}

export class NativeLogger {
  constructor(userDataDir) {
    this.directory = path.join(userDataDir, "logs");
    this.file = path.join(this.directory, "desktop.log");
  }

  rotateIfNeeded() {
    try {
      const stat = fs.statSync(this.file);
      if (stat.size < MAX_LOG_BYTES) return;
      fs.mkdirSync(this.directory, { recursive: true });
      const previous = `${this.file}.1`;
      fs.rmSync(previous, { force: true });
      fs.renameSync(this.file, previous);
    } catch {
      // No existing log or an inaccessible log directory is non-fatal.
    }
  }

  write(level, event, fields = {}) {
    try {
      this.rotateIfNeeded();
      fs.mkdirSync(this.directory, { recursive: true });
      const entry = {
        at: new Date().toISOString(),
        level: ["debug", "info", "warn", "error"].includes(level) ? level : "info",
        event: String(event || "desktop_event").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80),
        ...sanitizeFields(fields),
      };
      fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch {
      // Diagnostics must never crash the application.
    }
  }

  info(event, fields) {
    this.write("info", event, fields);
  }

  warn(event, fields) {
    this.write("warn", event, fields);
  }

  error(event, fields) {
    this.write("error", event, fields);
  }

  tail(limit = 100) {
    const count = Math.max(1, Math.min(250, Number(limit) || 100));
    try {
      const lines = fs.readFileSync(this.file, "utf8").trim().split("\n").filter(Boolean);
      return lines.slice(-count).map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  clear() {
    try {
      fs.rmSync(this.file, { force: true });
      fs.rmSync(`${this.file}.1`, { force: true });
    } catch {
      // Best-effort diagnostic cleanup.
    }
  }
}

export { MAX_LOG_BYTES, sanitizeFields };
