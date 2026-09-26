import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const STORE_VERSION = 2;
const CRASH_WINDOW_MS = 10 * 60 * 1000;
const SAFE_MODE_THRESHOLD = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULTS = Object.freeze({
  version: STORE_VERSION,
  installationId: "",
  autoLaunch: false,
  autoUpdate: true,
  closeToTray: true,
  updateChannel: "stable",
  lastNotifiedVersion: "",
  rendererCacheSchema: 0,
  lastStartAt: 0,
  lastCleanExitAt: 0,
  crashStreak: 0,
  rendererCrashCount: 0,
  safeMode: false,
});

function finiteTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function boundedCount(value, max = 1000) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? Math.min(max, number) : 0;
}

function sanitize(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    version: STORE_VERSION,
    installationId: UUID.test(String(input.installationId || "")) ? input.installationId : "",
    autoLaunch: input.autoLaunch === true,
    autoUpdate: input.autoUpdate !== false,
    closeToTray: input.closeToTray !== false,
    updateChannel: ["stable", "beta", "internal"].includes(input.updateChannel)
      ? input.updateChannel
      : "stable",
    lastNotifiedVersion: typeof input.lastNotifiedVersion === "string"
      ? input.lastNotifiedVersion.slice(0, 40)
      : "",
    rendererCacheSchema: boundedCount(input.rendererCacheSchema, 1000),
    lastStartAt: finiteTimestamp(input.lastStartAt),
    lastCleanExitAt: finiteTimestamp(input.lastCleanExitAt),
    crashStreak: boundedCount(input.crashStreak, 20),
    rendererCrashCount: boundedCount(input.rendererCrashCount, 20),
    safeMode: input.safeMode === true,
  };
}

export class NativeStore {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, "desktop-settings.json");
    this.value = { ...DEFAULTS };
    this.load();
    if (!this.value.installationId) {
      this.value.installationId = crypto.randomUUID();
      this.save();
    }
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      this.value = sanitize(JSON.parse(raw));
    } catch {
      this.value = { ...DEFAULTS };
    }
    return this.getAll();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(this.value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  getAll() {
    return { ...this.value };
  }

  get(key) {
    return this.value[key];
  }

  set(key, value) {
    if (!(key in DEFAULTS) || key === "version" || key === "installationId") {
      throw new Error("Unsupported desktop setting.");
    }
    this.value = sanitize({ ...this.value, [key]: value });
    this.save();
    return this.getAll();
  }

  patch(values) {
    const input = values && typeof values === "object" ? values : {};
    for (const key of Object.keys(input)) {
      if (!(key in DEFAULTS) || key === "version" || key === "installationId") {
        throw new Error("Unsupported desktop setting.");
      }
    }
    this.value = sanitize({ ...this.value, ...input });
    this.save();
    return this.getAll();
  }

  recordStart(now = Date.now()) {
    const previousStart = this.value.lastStartAt;
    const previousCleanExit = this.value.lastCleanExitAt;
    const previousEndedCleanly = previousStart > 0 && previousCleanExit >= previousStart;
    const recentUncleanExit = previousStart > 0
      && !previousEndedCleanly
      && now >= previousStart
      && now - previousStart <= CRASH_WINDOW_MS;
    const crashStreak = recentUncleanExit ? Math.min(20, this.value.crashStreak + 1) : 0;
    const safeMode = crashStreak >= SAFE_MODE_THRESHOLD;
    this.value = sanitize({
      ...this.value,
      lastStartAt: now,
      crashStreak,
      rendererCrashCount: 0,
      safeMode,
    });
    this.save();
    return { crashStreak, safeMode };
  }

  recordRendererCrash() {
    const rendererCrashCount = Math.min(20, this.value.rendererCrashCount + 1);
    const safeMode = this.value.safeMode || rendererCrashCount >= SAFE_MODE_THRESHOLD;
    this.value = sanitize({ ...this.value, rendererCrashCount, safeMode });
    this.save();
    return { rendererCrashCount, safeMode };
  }

  recordCleanExit(now = Date.now()) {
    this.value = sanitize({
      ...this.value,
      lastCleanExitAt: now,
      crashStreak: 0,
      rendererCrashCount: 0,
      safeMode: false,
    });
    this.save();
    return this.getAll();
  }
}

export { CRASH_WINDOW_MS, SAFE_MODE_THRESHOLD, STORE_VERSION };
