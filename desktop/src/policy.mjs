import crypto from "node:crypto";

const POLICY_REFRESH_MS = 15 * 60 * 1000;
const POLICY_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_POLICY = Object.freeze({
  formatVersion: 1,
  maintenance: false,
  maintenanceMessage: "",
  updateRolloutPercent: 100,
  features: Object.freeze({
    auth: true,
    discord: true,
    updater: true,
  }),
});

function safeText(value, max = 240) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function rolloutPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 100;
}

export function sanitizeDesktopPolicy(value) {
  if (!value || typeof value !== "object" || value.formatVersion !== 1) return null;
  const features = value.features && typeof value.features === "object" ? value.features : {};
  return {
    formatVersion: 1,
    maintenance: value.maintenance === true,
    maintenanceMessage: safeText(value.maintenanceMessage),
    updateRolloutPercent: rolloutPercent(value.updateRolloutPercent),
    features: {
      auth: features.auth !== false,
      discord: features.discord !== false,
      updater: features.updater !== false,
    },
  };
}

export function installationRolloutBucket(installationId) {
  const id = String(installationId || "").trim();
  if (!id) return 99;
  const digest = crypto.createHash("sha256").update(id, "utf8").digest();
  return digest.readUInt32BE(0) % 100;
}

export function installationEligibleForRollout(installationId, percent) {
  const bounded = rolloutPercent(percent);
  if (bounded >= 100) return true;
  if (bounded <= 0) return false;
  return installationRolloutBucket(installationId) < bounded;
}

export function effectiveUpdateRolloutPercent(snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.updatedAt) || snapshot.updatedAt <= 0) return 0;
  return rolloutPercent(snapshot.updateRolloutPercent);
}

export class DesktopPolicy {
  constructor({ url, fetchImpl = globalThis.fetch, onChange = () => {}, requestTimeoutMs = POLICY_REQUEST_TIMEOUT_MS }) {
    this.url = String(url || "");
    this.fetchImpl = fetchImpl;
    this.onChange = onChange;
    this.requestTimeoutMs = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
      ? Math.min(requestTimeoutMs, POLICY_REQUEST_TIMEOUT_MS) : POLICY_REQUEST_TIMEOUT_MS;
    this.value = {
      ...DEFAULT_POLICY,
      features: { ...DEFAULT_POLICY.features },
    };
    this.updatedAt = 0;
    this.timer = null;
    this.refreshing = null;
    this.requestController = null;
    this.disposed = false;
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
    if (this.disposed) return this.snapshot();
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.load().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async load() {
    if (this.disposed || !this.url || typeof this.fetchImpl !== "function") return this.snapshot();
    const controller = new AbortController();
    this.requestController = controller;
    let cancel;
    const aborted = new Promise((_, reject) => {
      cancel = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", cancel, { once: true });
    });
    const deadline = setTimeout(() => controller.abort(new Error("Desktop policy request timed out.")), this.requestTimeoutMs);
    try {
      // Bound headers AND JSON body. Racing cancellation also releases startup
      // if a fetch implementation does not honor AbortSignal; late work cannot
      // mutate policy because only the winning result is applied here.
      const next = await Promise.race([aborted, (async () => {
        const response = await this.fetchImpl(this.url, {
          method: "GET",
          headers: { Accept: "application/json", "Cache-Control": "no-cache" },
          signal: controller.signal,
        });
        if (!response?.ok) throw new Error(`Desktop policy returned ${response?.status || "an error"}.`);
        const parsed = sanitizeDesktopPolicy(await response.json());
        if (!parsed) throw new Error("Desktop policy payload is invalid.");
        return parsed;
      })()]);
      if (this.disposed || controller.signal.aborted) return this.snapshot();
      this.value = next;
      this.updatedAt = Date.now();
      this.onChange(this.snapshot());
    } catch {
      // A transient policy outage never grants capabilities that a previously
      // loaded policy disabled. Keep the last valid snapshot until refresh.
    } finally {
      clearTimeout(deadline);
      controller.signal.removeEventListener("abort", cancel);
      controller.abort(); // Also stop unread bodies from unsuccessful responses.
      if (this.requestController === controller) this.requestController = null;
    }
    return this.snapshot();
  }

  start() {
    if (this.disposed || this.timer) return;
    this.timer = setInterval(() => void this.refresh(), POLICY_REFRESH_MS);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.requestController?.abort();
  }
}

export { DEFAULT_POLICY, POLICY_REFRESH_MS, POLICY_REQUEST_TIMEOUT_MS };
