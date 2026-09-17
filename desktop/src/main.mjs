import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  powerMonitor,
  session,
  shell,
  Tray,
} from "electron";
import {
  DESKTOP_API_VERSION,
  DESKTOP_CAPABILITIES,
  PRODUCT_NAME,
  desktopAppUrl,
} from "./config.mjs";
import { DiscordIpcClient } from "./discord/ipcClient.mjs";
import { NativeStore } from "./nativeStore.mjs";
import {
  assertTrustedIpcEvent,
  buildTrustedOrigins,
  isSafeExternalUrl,
  isSafeHeyKasaDeepLink,
  isTrustedRendererUrl,
} from "./security.mjs";
import { DesktopUpdater } from "./updater.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_USER_MODEL_ID = "com.heykasa.desktop";
const PROTOCOL = "heykasa";
const appUrl = desktopAppUrl({
  isPackaged: app.isPackaged,
  overrideUrl: process.env.HEYKASA_DESKTOP_URL || "",
});
const trustedOrigins = buildTrustedOrigins({ appUrl, isPackaged: app.isPackaged });

let mainWindow = null;
let store = null;
let updater = null;
let tray = null;
let quitting = false;
const discord = new DiscordIpcClient();

function resourceIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.resolve(__dirname, "../../public/icon-256x256.png");
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function handleDeepLink(value) {
  if (!isSafeHeyKasaDeepLink(value)) return false;
  // Deep-link command handling is intentionally conservative in v1. The
  // protocol can focus the running app, but auth/open payloads are not trusted
  // until the one-time server exchange is implemented.
  focusMainWindow();
  return true;
}

function registerProtocol() {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function registerSingleInstance() {
  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return false;
  }
  app.on("second-instance", (_event, argv) => {
    const deepLink = argv.find((value) => String(value || "").startsWith(`${PROTOCOL}://`));
    if (deepLink) handleDeepLink(deepLink);
    focusMainWindow();
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
  return true;
}

function configureSession(ses) {
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  if (typeof ses.setDevicePermissionHandler === "function") {
    ses.setDevicePermissionHandler(() => false);
  }
}

async function clearDesktopWebCaches(ses) {
  const origin = new URL(appUrl).origin;
  await Promise.allSettled([
    ses.clearCache(),
    ses.clearStorageData({
      origin,
      storages: ["serviceworkers", "cachestorage"],
    }),
  ]);
}

function installNavigationGuards(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedRendererUrl(url, trustedOrigins)) {
      void window.loadURL(url);
      return { action: "deny" };
    }
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url, trustedOrigins)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });
}

async function showOfflineScreen(window) {
  if (!window || window.isDestroyed()) return;
  try {
    await window.loadFile(path.join(__dirname, "offline.html"));
  } catch {
    // If even the bundled recovery page cannot load there is no useful renderer
    // action left; the next application launch will retry production.
  }
}

async function loadApplication(window) {
  try {
    await window.loadURL(appUrl, { extraHeaders: "Cache-Control: no-cache\n" });
  } catch {
    await showOfflineScreen(window);
  }
}

async function createMainWindow() {
  const ses = session.fromPartition("persist:heykasa");
  configureSession(ses);
  await clearDesktopWebCaches(ses);

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: "#07111f",
    title: PRODUCT_NAME,
    icon: resourceIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      partition: "persist:heykasa",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  installNavigationGuards(window);

  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (quitting || store?.get("closeToTray") === false) return;
    event.preventDefault();
    window.hide();
  });
  window.webContents.on("did-fail-load", (_event, errorCode, _description, _validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    void showOfflineScreen(window);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(JSON.stringify({
      level: "error",
      event: "renderer_crash",
      reason: details?.reason || "unknown",
      exitCode: details?.exitCode,
    }));
    void showOfflineScreen(window);
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  mainWindow = window;
  await loadApplication(window);
  return window;
}

function createTray() {
  if (tray && !tray.isDestroyed()) return tray;
  tray = new Tray(resourceIconPath());
  tray.setToolTip(PRODUCT_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Open HeyKasa",
      click: () => focusMainWindow(),
    },
    {
      label: "Check for updates",
      click: () => void updater?.checkNow({ manual: true }),
    },
    { type: "separator" },
    {
      label: "Quit HeyKasa",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("click", () => focusMainWindow());
  return tray;
}

function desktopPreferences() {
  return {
    autoUpdate: store?.get("autoUpdate") !== false,
    closeToTray: store?.get("closeToTray") !== false,
    updateChannel: ["stable", "beta", "internal"].includes(store?.get("updateChannel"))
      ? store.get("updateChannel")
      : "stable",
  };
}

function setDesktopPreference(key, value) {
  if (!store) throw new Error("Desktop preferences are not ready yet.");
  if (key === "autoUpdate" || key === "closeToTray") {
    store.set(key, value === true);
  } else if (key === "updateChannel") {
    if (!["stable", "beta", "internal"].includes(value)) throw new Error("Unsupported desktop update channel.");
    store.set(key, value);
  } else {
    throw new Error("Unsupported desktop preference.");
  }

  if (key === "autoUpdate" || key === "updateChannel") updater?.preferencesChanged();
  return desktopPreferences();
}

function sendUpdateStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const currentUrl = mainWindow.webContents.getURL();
  if (!isTrustedRendererUrl(currentUrl, trustedOrigins)) return;
  mainWindow.webContents.send("heykasa:updates:status-changed", status);
}

function secureHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpcEvent(event, trustedOrigins);
    return handler(...args);
  });
}

function registerIpcHandlers() {
  secureHandle("heykasa:get-info", () => ({
    productName: PRODUCT_NAME,
    desktopVersion: app.getVersion(),
    apiVersion: DESKTOP_API_VERSION,
    capabilities: [...DESKTOP_CAPABILITIES],
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  }));

  secureHandle("heykasa:discord:set-activity", async (activity) => {
    await discord.setActivity(activity);
    return { connected: discord.connected };
  });
  secureHandle("heykasa:discord:clear", async () => {
    await discord.clearActivity();
    return { connected: discord.connected };
  });
  secureHandle("heykasa:discord:disconnect", async () => {
    await discord.clearActivity().catch(() => {});
    discord.disconnect();
    return { connected: false };
  });
  secureHandle("heykasa:discord:status", () => ({
    connected: discord.connected,
    previouslyConnected: discord.everConnected,
  }));

  secureHandle("heykasa:updates:status", () => updater?.getStatus() || { state: "idle" });
  secureHandle("heykasa:updates:check", () => updater?.checkNow({ manual: true }) || { state: "disabled" });
  secureHandle("heykasa:updates:install", async () => {
    await updater?.installReadyUpdate();
    return { ok: true };
  });

  secureHandle("heykasa:startup:get", () => ({
    enabled: app.getLoginItemSettings().openAtLogin === true,
  }));
  secureHandle("heykasa:startup:set", (enabled) => {
    const next = enabled === true;
    app.setLoginItemSettings({ openAtLogin: next, openAsHidden: false });
    store.set("autoLaunch", next);
    return { enabled: app.getLoginItemSettings().openAtLogin === true };
  });

  secureHandle("heykasa:preferences:get", () => desktopPreferences());
  secureHandle("heykasa:preferences:set", (key, value) => setDesktopPreference(key, value));
}

async function shutdownNativeIntegrations() {
  updater?.dispose();
  await discord.clearActivity().catch(() => {});
  discord.disconnect();
  tray?.destroy();
  tray = null;
}

if (registerSingleInstance()) {
  registerProtocol();

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_USER_MODEL_ID);
    store = new NativeStore(app.getPath("userData"));
    // The OS is authoritative. Keep the local preference aligned if Windows
    // changed the login item outside HeyKasa.
    const actualAutoLaunch = app.getLoginItemSettings().openAtLogin === true;
    if (store.get("autoLaunch") !== actualAutoLaunch) store.set("autoLaunch", actualAutoLaunch);

    updater = new DesktopUpdater({ app, store, onStatus: sendUpdateStatus });
    registerIpcHandlers();
    await createMainWindow();
    createTray();
    updater.start();

    powerMonitor.on("resume", () => {
      if (updater && store.get("autoUpdate") !== false) void updater.checkNow();
    });

    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) void createMainWindow();
      else focusMainWindow();
    });
  }).catch((error) => {
    console.error(`[HeyKasa Desktop] ${error instanceof Error ? error.stack || error.message : error}`);
    app.quit();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    quitting = true;
    void shutdownNativeIntegrations();
  });
}
