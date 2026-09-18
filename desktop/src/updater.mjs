import updaterPackage from "electron-updater";
import {
  DESKTOP_API_VERSION,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FEED_BASE_URL,
  UPDATE_INITIAL_DELAY_JITTER_MS,
  UPDATE_INITIAL_DELAY_MIN_MS,
  UPDATE_MANIFEST_URL,
  UPDATE_PREFLIGHT_TIMEOUT_MS,
} from "./config.mjs";
import { installationEligibleForRollout } from "./policy.mjs";
import { versionOlderThan } from "./version.mjs";

const { autoUpdater } = updaterPackage;

function cleanChannel(value) {
  return ["stable", "beta", "internal"].includes(value) ? value : "stable";
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizedGate(value) {
  if (value === false) return { allowed: false, detail: "This desktop release is not available to this installation yet." };
  if (!value || typeof value !== "object") return { allowed: true, detail: "" };
  return {
    allowed: value.allowed !== false,
    detail: typeof value.detail === "string" ? value.detail.slice(0, 240) : "",
  };
}

export class DesktopUpdater {
  constructor({ app, store, onStatus = () => {}, canCheckRelease = () => ({ allowed: true }) }) {
    this.app = app;
    this.store = store;
    this.onStatus = onStatus;
    this.canCheckRelease = canCheckRelease;
    this.status = { state: "idle", version: app.getVersion(), progress: 0, detail: "" };
    this.started = false;
    this.initialTimer = null;
    this.intervalTimer = null;
    this.checkingPromise = null;

    this.feedBaseUrl = String(
      app.isPackaged
        ? UPDATE_FEED_BASE_URL
        : process.env.HEYKASA_DESKTOP_UPDATE_URL || UPDATE_FEED_BASE_URL || "",
    ).trim();
    this.manifestBaseUrl = String(
      app.isPackaged
        ? UPDATE_MANIFEST_URL
        : process.env.HEYKASA_DESKTOP_MANIFEST_URL || UPDATE_MANIFEST_URL || "",
    ).trim();

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.disableWebInstaller = true;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on("checking-for-update", () => this.emit({ state: "checking", progress: 0 }));
    autoUpdater.on("update-available", (info) => this.emit({
      state: "available",
      version: info?.version || "",
      detail: "A newer HeyKasa Desktop version is available.",
    }));
    autoUpdater.on("update-not-available", () => this.emit({
      state: "up-to-date",
      version: this.app.getVersion(),
      progress: 0,
      detail: "HeyKasa Desktop is up to date.",
    }));
    autoUpdater.on("download-progress", (progress) => this.emit({
      state: "downloading",
      progress: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
    }));
    autoUpdater.on("update-downloaded", (info) => {
      this.clearSchedule();
      this.emit({
        state: "ready",
        version: info?.version || "",
        progress: 100,
        detail: "Update downloaded. Restart HeyKasa to install it.",
      });
    });
    autoUpdater.on("error", (error) => this.emit({
      state: "error",
      detail: error instanceof Error ? error.message : "Desktop update failed.",
    }));
  }

  emit(next) {
    this.status = {
      ...this.status,
      ...next,
      checkedAt: Date.now(),
    };
    this.onStatus(this.getStatus());
  }

  getStatus() {
    return { ...this.status };
  }

  channel() {
    return cleanChannel(this.store.get("updateChannel"));
  }

  configuredFeedUrl() {
    const base = httpsUrl(this.feedBaseUrl);
    if (!base) return "";
    return `${base.replace(/\/+$/, "")}/${this.channel()}`;
  }

  configuredManifestUrl() {
    const base = httpsUrl(this.manifestBaseUrl);
    if (!base) return "";
    const url = new URL(base);
    url.searchParams.set("channel", this.channel());
    return url.href;
  }

  configureFeed() {
    const url = this.configuredFeedUrl();
    if (!url) return false;
    const releaseChannel = this.channel();
    autoUpdater.channel = "latest";
    // electron-updater enables downgrades when the channel is assigned. Reset
    // the flag immediately so switching release channels cannot install an
    // older binary.
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = releaseChannel !== "stable";
    autoUpdater.setFeedURL({ provider: "generic", url, channel: "latest" });
    return true;
  }

  async releaseManifest() {
    const url = this.configuredManifestUrl();
    if (!url) throw new Error("The desktop release manifest endpoint is not configured.");
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(UPDATE_PREFLIGHT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Desktop release manifest returned ${response.status}.`);
    const manifest = await response.json();
    if (!manifest || typeof manifest !== "object") throw new Error("Desktop release manifest is invalid.");
    if (manifest.channel !== this.channel()) throw new Error("Desktop release manifest channel mismatch.");
    return manifest;
  }

  async rolloutGate({ manual = false } = {}) {
    try {
      return normalizedGate(await this.canCheckRelease({ manual, channel: this.channel() }));
    } catch {
      return { allowed: false, detail: "Desktop update eligibility could not be verified. HeyKasa will try again later." };
    }
  }

  manifestRolloutAllows(manifest) {
    if (this.channel() !== "stable") return true;
    if (versionOlderThan(this.app.getVersion(), manifest?.minimum)) return true;
    if ((Number(manifest?.desktopApiVersion) || 0) > DESKTOP_API_VERSION) return true;
    return installationEligibleForRollout(
      this.store.get("installationId"),
      manifest?.updateRolloutPercent ?? 100,
    );
  }

  async runCheck({ manual = false } = {}) {
    if (!this.app.isPackaged) {
      this.emit({ state: "disabled", detail: "Updates are disabled in development builds." });
      return this.getStatus();
    }
    if (this.status.state === "ready") return this.getStatus();
    if (this.store.get("autoUpdate") === false && !manual) {
      this.emit({ state: "disabled", detail: "Automatic updates are turned off." });
      return this.getStatus();
    }

    const gate = await this.rolloutGate({ manual });
    if (!gate.allowed) {
      this.emit({
        state: "deferred",
        progress: 0,
        detail: gate.detail || "The current release is rolling out gradually. HeyKasa will check again automatically.",
      });
      return this.getStatus();
    }

    if (!this.configureFeed()) {
      this.emit({ state: "disabled", detail: "The signed desktop update feed is not configured." });
      return this.getStatus();
    }

    this.emit({ state: "checking", progress: 0, detail: "Checking the signed desktop release channel." });
    try {
      const manifest = await this.releaseManifest();
      if (manifest.published !== true || !httpsUrl(manifest.downloadUrl)) {
        this.emit({
          state: "disabled",
          detail: `No signed ${this.channel()} desktop release has been published yet.`,
        });
        return this.getStatus();
      }
      if (!this.manifestRolloutAllows(manifest)) {
        this.emit({
          state: "deferred",
          version: manifest.latest || this.app.getVersion(),
          progress: 0,
          detail: "A newer HeyKasa Desktop release is rolling out gradually. This installation will update automatically when its rollout group becomes eligible.",
        });
        return this.getStatus();
      }
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.emit({
        state: "error",
        detail: error instanceof Error ? error.message : "Update check failed.",
      });
    }
    return this.getStatus();
  }

  checkNow(options = {}) {
    if (this.checkingPromise) return this.checkingPromise;
    this.checkingPromise = this.runCheck(options).finally(() => {
      this.checkingPromise = null;
    });
    return this.checkingPromise;
  }

  clearSchedule() {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.initialTimer = null;
    this.intervalTimer = null;
  }

  schedule() {
    this.clearSchedule();
    if (!this.started || this.status.state === "ready") return;
    if (!this.app.isPackaged) {
      this.emit({ state: "disabled", detail: "Updates are disabled in development builds." });
      return;
    }
    if (this.store.get("autoUpdate") === false) {
      this.emit({ state: "disabled", detail: "Automatic updates are turned off." });
      return;
    }
    if (!this.configuredFeedUrl() || !this.configuredManifestUrl()) {
      this.emit({ state: "disabled", detail: "The signed desktop update feed is not configured." });
      return;
    }

    const initialDelay = UPDATE_INITIAL_DELAY_MIN_MS + Math.floor(Math.random() * UPDATE_INITIAL_DELAY_JITTER_MS);
    this.initialTimer = setTimeout(() => void this.checkNow(), initialDelay);
    this.intervalTimer = setInterval(() => void this.checkNow(), UPDATE_CHECK_INTERVAL_MS);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.schedule();
  }

  preferencesChanged() {
    if (!this.started) return;
    this.schedule();
  }

  async installReadyUpdate() {
    if (this.status.state !== "ready") throw new Error("No downloaded desktop update is ready to install.");
    autoUpdater.quitAndInstall(false, true);
  }

  dispose() {
    this.started = false;
    this.clearSchedule();
  }
}
