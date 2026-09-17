const POLICY_REFRESH_MS = 15 * 60 * 1000;
const DEFAULT_POLICY = Object.freeze({
  formatVersion: 1,
  maintenance: false,
  maintenanceMessage: "",
  features: Object.freeze({
    auth: true,
    discord: true,
    updater: true,
  }),
});

function safeText(value, max = 240) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sanitizeDesktopPolicy(value) {
  if (!value || typeof value !== "object" || value.formatVersion !== 1) return null;
  const features = value.features && typeof value.features === "object" ? value.features : {};
  return {
    formatVersion: 1,
    maintenance: value.maintenance === true,
    maintenanceMessage: safeText(value.maintenanceMessage),
    features: {
      auth: features.auth !== false,
      discord: features.discord !== false,
      updater: features.updater !== false,
    },
  };
}

export class DesktopPolicy {
  constructor({ url, fetchImpl = globalThis.fetch, onChange = () => {} }) {
    this.url = String(url || "");
    this.fetchImpl = fetchImpl;
    this.onChange = onChange;
    this.value = {
      ...DEFAULT_POLICY,
      features: { ...DEFAULT_POLICY.features },
    };
    this.updatedAt = 0;
    this.timer = null;
    this.refreshing = null;
  }

  snapshot() {
    return {
      ...this.value,
      features: { ...this.value.features },
      updatedAt: this.updatedAt,
    };
  }

  feature(name) {
    return this.value.maintenance !== true && this.value.features?.[name] !== false;
  }

  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.load().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async load() {
    if (!this.url || typeof this.fetchImpl !== "function") return this.snapshot();
    try {
      const response = await this.fetchImpl(this.url, {
        method: "GET",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      });
      if (!response?.ok) throw new Error(`Desktop policy returned ${response?.status || "an error"}.`);
      const next = sanitizeDesktopPolicy(await response.json());
      if (!next) throw new Error("Desktop policy payload is invalid.");
      this.value = next;
      this.updatedAt = Date.now();
      this.onChange(this.snapshot());
    } catch {
      // A transient policy outage never grants capabilities that a previously
      // loaded policy disabled. Keep the last valid snapshot until refresh.
    }
    return this.snapshot();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), POLICY_REFRESH_MS);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export { DEFAULT_POLICY, POLICY_REFRESH_MS };
