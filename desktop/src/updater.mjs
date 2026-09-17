import updaterPackage from "electron-updater";
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FEED_BASE_URL,
  UPDATE_INITIAL_DELAY_JITTER_MS,
  UPDATE_INITIAL_DELAY_MIN_MS,
} from "./config.mjs";

const { autoUpdater } = updaterPackage;

function cleanChannel(value) {
  return ["stable", "beta", "internal"].includes(value) ? value : "stable";
}

export class DesktopUpdater {
  constructor({ app, store, onStatus = () => {} }) {
    this.app = app;
    this.store = store;
    this.onStatus = onStatus;
    this.status = { state: "idle", version: app.getVersion(), progress: 0, detail: "" };
    this.started = false;
    this.initialTimer = null;
    this.intervalTimer = null;
    this.feedBaseUrl = String(process.env.HEYKASA_DESKTOP_UPDATE_URL || UPDATE_FEED_BASE_URL || "").trim();

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on("checking-for-update", () => this.emit({ state: "checking" }));
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
    autoUpdater.on("update-downloaded", (info) => this.emit({
      state: "ready",
      version: info?.version || "",
      progress: 100,
      detail: "Update downloaded. Restart HeyKasa to install it.",
    }));
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

  configuredFeedUrl() {
    if (!this.feedBaseUrl) return "";
    const root = this.feedBaseUrl.replace(/\/+$/, "");
    return `${root}/${cleanChannel(this.store.get("updateChannel"))}`;
  }

  canCheck() {
    return this.app.isPackaged
      && this.store.get("autoUpdate") !== false
      && Boolean(this.configuredFeedUrl());
  }

  configureFeed() {
    const url = this.configuredFeedUrl();
    if (!url) return false;
    const channel = cleanChannel(this.store.get("updateChannel"));
    autoUpdater.channel = channel;
    autoUpdater.allowPrerelease = channel !== "stable";
    autoUpdater.setFeedURL({ provider: "generic", url });
    return true;
  }

  async checkNow({ manual = false } = {}) {
    if (!this.app.isPackaged) {
      this.emit({ state: "disabled", detail: "Updates are disabled in development builds." });
      return this.getStatus();
    }
    if (!this.store.get("autoUpdate") && !manual) {
      this.emit({ state: "disabled", detail: "Automatic updates are turned off." });
      return this.getStatus();
    }
    if (!this.configureFeed()) {
      this.emit({ state: "disabled", detail: "The signed desktop update feed has not been published yet." });
      return this.getStatus();
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.emit({ state: "error", detail: error instanceof Error ? error.message : "Update check failed." });
    }
    return this.getStatus();
  }

  clearSchedule() {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.initialTimer = null;
    this.intervalTimer = null;
  }

  schedule() {
    this.clearSchedule();
    if (!this.started) return;
    if (!this.app.isPackaged) {
      this.emit({ state: "disabled", detail: "Updates are disabled in development builds." });
      return;
    }
    if (this.store.get("autoUpdate") === false) {
      this.emit({ state: "disabled", detail: "Automatic updates are turned off." });
      return;
    }
    if (!this.feedBaseUrl) {
      this.emit({ state: "disabled", detail: "The signed desktop update feed has not been published yet." });
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
