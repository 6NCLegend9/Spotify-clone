import fs from "node:fs";
import path from "node:path";

const STORE_VERSION = 1;
const DEFAULTS = Object.freeze({
  version: STORE_VERSION,
  autoLaunch: false,
  autoUpdate: true,
  updateChannel: "stable",
  lastNotifiedVersion: "",
});

function sanitize(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    version: STORE_VERSION,
    autoLaunch: input.autoLaunch === true,
    autoUpdate: input.autoUpdate !== false,
    updateChannel: ["stable", "beta", "internal"].includes(input.updateChannel)
      ? input.updateChannel
      : "stable",
    lastNotifiedVersion: typeof input.lastNotifiedVersion === "string"
      ? input.lastNotifiedVersion.slice(0, 40)
      : "",
  };
}

export class NativeStore {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, "desktop-settings.json");
    this.value = { ...DEFAULTS };
    this.load();
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
    if (!(key in DEFAULTS) || key === "version") throw new Error("Unsupported desktop setting.");
    this.value = sanitize({ ...this.value, [key]: value });
    this.save();
    return this.getAll();
  }
}

export { STORE_VERSION };
