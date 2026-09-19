import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  Notification,
  powerMonitor,
  protocol,
  session,
  shell,
  Tray,
  nativeImage,
} from "electron";
import {
  DESKTOP_API_VERSION,
  DESKTOP_CAPABILITIES,
  PRODUCT_NAME,
  desktopAppUrl,
} from "./config.mjs";
import {
  buildDesktopAuthorizeUrl,
  createDesktopAuthAttempt,
  desktopAuthAttemptExpired,
  isMatchingDesktopAuthState,
  normalizeDesktopSessionExchange,
  parseDesktopAuthDeepLink,
} from "./authFlow.mjs";
import { DiscordIpcClient } from "./discord/ipcClient.mjs";
import { NativeLogger } from "./nativeLogger.mjs";
import { NativeStore } from "./nativeStore.mjs";
import {
  AppearanceStore,
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUND_DIMENSION,
  appearanceAssetId,
} from "./appearanceStore.mjs";
import {
  accentFromBitmap,
  foregroundForAccent,
  isAllowedArtworkUrl,
} from "./artworkPalette.mjs";
import { DesktopPolicy, effectiveUpdateRolloutPercent } from "./policy.mjs";
import {
  assertTrustedIpcEvent,
  buildTrustedOrigins,
  isSafeDesktopOpenUrl,
  isSafeExternalUrl,
  isSafeHeyKasaDeepLink,
  isTrustedRendererUrl,
  shouldAllowRendererNavigation,
} from "./security.mjs";
import { DesktopUpdater } from "./updater.mjs";
import { isPlaybackCommand, sanitizePlaybackState } from "./playback.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_USER_MODEL_ID = "com.heykasa.desktop";
const PROTOCOL = "heykasa";
const APPEARANCE_PROTOCOL = "heykasa-media";
const DESKTOP_PARTITION = "persist:heykasa";
const MINI_PARTITION = "temp:heykasa-mini";
const CAPABILITY_POLICY = Object.freeze({
  authV1: "auth",
  discordPresenceV1: "discord",
  updaterV1: "updater",
});
const appUrl = desktopAppUrl({
  isPackaged: app.isPackaged,
  overrideUrl: process.env.HEYKASA_DESKTOP_URL || "",
});
const trustedOrigins = buildTrustedOrigins({ appUrl, isPackaged: app.isPackaged });

let mainWindow = null;
let store = null;
let appearanceStore = null;
let logger = null;
let updater = null;
let policy = null;
let tray = null;
let quitting = false;
let startupCompleted = false;
let safeMode = false;
let authAttempt = null;
let authStatus = { state: "idle", detail: "" };
const discord = new DiscordIpcClient();
let miniWindow = null;
let miniUserHidden = false;
let playbackState = sanitizePlaybackState(null);
let lastNativeUpdateNotificationVersion = "";
let resolvedAccent = "#00e6e6";
let appearanceGeneration = 0;
const artworkAccentCache = new Map();

protocol.registerSchemesAsPrivileged([
  {
    scheme: APPEARANCE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

function resourceIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.resolve(__dirname, "../../public/icon-256x256.png");
}

function desktopSession() {
  return session.fromPartition(DESKTOP_PARTITION);
}

const appearanceProtocolSessions = new WeakSet();

function installAppearanceProtocol(ses) {
  if (!ses || appearanceProtocolSessions.has(ses)) return;
  ses.protocol.handle(APPEARANCE_PROTOCOL, async (request) => {
    const assetId = appearanceAssetId(request.url);
    const file = appearanceStore?.assetPath(assetId) || "";
    if (!assetId || !file) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const bytes = await fs.promises.readFile(file);
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  appearanceProtocolSessions.add(ses);
}

function resolvedAppearance() {
  const appearance = appearanceStore?.resolve() || null;
  if (!appearance) return null;
  return {
    ...appearance,
    resolvedAccent,
    accentForeground: foregroundForAccent(resolvedAccent),
  };
}

function broadcastAppearance() {
  const appearance = resolvedAppearance();
  if (!appearance) return;
  if (canMessageRenderer()) mainWindow.webContents.send("heykasa:appearance:changed", appearance);
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send("heykasa:appearance:changed", appearance);
  }
}

async function chooseBackgroundFile() {
  const options = {
    title: "Choose a HayKasa background",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true };

  const source = result.filePaths[0];
  const extension = path.extname(source).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  const stat = await fs.promises.stat(source);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BACKGROUND_BYTES) {
    throw new Error("Background images must be smaller than 20 MB.");
  }
  let image = nativeImage.createFromPath(source);
  if (image.isEmpty()) throw new Error("HayKasa could not read that image.");
  const size = image.getSize();
  if (
    size.width <= 0
    || size.height <= 0
    || size.width > MAX_BACKGROUND_DIMENSION
    || size.height > MAX_BACKGROUND_DIMENSION
  ) {
    throw new Error("That image is too large. Choose one under 12,000 pixels per side.");
  }

  const scale = Math.min(1, 3840 / size.width, 2160 / size.height);
  if (scale < 1) {
    image = image.resize({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
      quality: "best",
    });
  }
  const encoded = image.toJPEG(90);
  if (!encoded.length || encoded.length > MAX_BACKGROUND_BYTES) {
    throw new Error("HayKasa could not optimize that image.");
  }

  const id = crypto.randomUUID();
  const storedFile = path.join(appearanceStore.backgroundsDirectory, `${id}.jpg`);
  await fs.promises.mkdir(appearanceStore.backgroundsDirectory, { recursive: true });
  const tempFile = `${storedFile}.tmp`;
  try {
    await fs.promises.writeFile(tempFile, encoded, { mode: 0o600 });
    await fs.promises.rename(tempFile, storedFile);
    const asset = appearanceStore.registerAsset({ id, fileName: path.basename(source) });
    return {
      canceled: false,
      asset: {
        id: asset.id,
        fileName: asset.fileName,
        url: `${APPEARANCE_PROTOCOL}://background/${asset.id}`,
      },
    };
  } catch (error) {
    await fs.promises.rm(tempFile, { force: true }).catch(() => {});
    await fs.promises.rm(storedFile, { force: true }).catch(() => {});
    throw error;
  }
}

async function accentFromArtwork(url) {
  if (!isAllowedArtworkUrl(url)) return "";
  if (artworkAccentCache.has(url)) return artworkAccentCache.get(url);
  const response = await net.fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Artwork was unavailable.");
  const contentType = response.headers.get("content-type") || "";
  const announcedSize = Number(response.headers.get("content-length") || 0);
  if (!contentType.startsWith("image/") || announcedSize > 5 * 1024 * 1024) {
    throw new Error("Artwork response was not a supported image.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Artwork image was too large.");
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new Error("Artwork could not be decoded.");
  const sample = image.resize({ width: 32, height: 32, quality: "good" }).toBitmap();
  const accent = accentFromBitmap(sample);
  artworkAccentCache.set(url, accent);
  if (artworkAccentCache.size > 80) artworkAccentCache.delete(artworkAccentCache.keys().next().value);
  return accent;
}

async function refreshAppearanceAccent() {
  const generation = ++appearanceGeneration;
  const profile = appearanceStore?.activeProfile();
  const fallback = profile?.accent?.fixedColor || "#00e6e6";
  if (profile?.accent?.mode !== "album" || !playbackState.artwork) {
    resolvedAccent = fallback;
    broadcastAppearance();
    return;
  }
  try {
    const accent = await accentFromArtwork(playbackState.artwork);
    if (generation !== appearanceGeneration) return;
    resolvedAccent = accent || fallback;
  } catch {
    if (generation !== appearanceGeneration) return;
    resolvedAccent = fallback;
  }
  broadcastAppearance();
}

function policyFeature(name) {
  return policy?.feature(name) !== false;
}

function runtimeFeature(name) {
  if (safeMode && (name === "discord" || name === "updater")) return false;
  return policyFeature(name);
}

function effectiveCapabilities() {
  return DESKTOP_CAPABILITIES.filter((capability) => {
    const feature = CAPABILITY_POLICY[capability];
    return !feature || runtimeFeature(feature);
  });
}

function featureDisabledMessage(feature) {
  if (safeMode && (feature === "discord" || feature === "updater")) {
    return "HayKasa Desktop is running in safe mode after repeated crashes. Nonessential native integrations are temporarily disabled.";
  }
  const snapshot = policy?.snapshot();
  if (snapshot?.maintenance && snapshot.maintenanceMessage) return snapshot.maintenanceMessage;
  const labels = {
    auth: "Desktop sign-in",
    discord: "Discord Rich Presence",
    updater: "Desktop updates",
  };
  return `${labels[feature] || "This desktop feature"} is temporarily disabled.`;
}

function hideMiniPlayer() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.hide();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function focusMainWindow() {
  showMainWindow();
}

function canMessageRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return isTrustedRendererUrl(mainWindow.webContents.getURL(), trustedOrigins);
}

function sendAuthStatus(status) {
  if (canMessageRenderer()) mainWindow.webContents.send("heykasa:auth:status-changed", status);
}

function setAuthStatus(state, detail = "") {
  authStatus = {
    state,
    detail: typeof detail === "string" ? detail.slice(0, 240) : "",
  };
  logger?.info("auth_status", { state: authStatus.state });
  sendAuthStatus({ ...authStatus });
  return { ...authStatus };
}

async function startDesktopAuth() {
  if (!runtimeFeature("auth")) return setAuthStatus("disabled", featureDisabledMessage("auth"));
  authAttempt = createDesktopAuthAttempt();
  const authorizeUrl = buildDesktopAuthorizeUrl(appUrl, authAttempt);
  if (!isSafeDesktopOpenUrl(authorizeUrl, { allowLoopbackHttp: !app.isPackaged })) {
    authAttempt = null;
    return setAuthStatus("error", "Desktop sign-in URL is not allowed.");
  }
  setAuthStatus("waiting", "Complete sign-in in your browser, then return to HayKasa.");
  try {
    await shell.openExternal(authorizeUrl);
  } catch (error) {
    authAttempt = null;
    return setAuthStatus("error", error instanceof Error ? error.message : "Could not open the sign-in browser.");
  }
  return { ...authStatus };
}

async function exchangeDesktopAuth(value) {
  if (!runtimeFeature("auth")) {
    authAttempt = null;
    setAuthStatus("disabled", featureDisabledMessage("auth"));
    return false;
  }
  const deepLink = parseDesktopAuthDeepLink(value);
  if (!deepLink || !authAttempt || desktopAuthAttemptExpired(authAttempt)
    || !isMatchingDesktopAuthState(authAttempt, deepLink.state)) {
    authAttempt = null;
    setAuthStatus("error", "This desktop sign-in request is invalid or expired. Start sign-in again.");
    return false;
  }

  setAuthStatus("exchanging", "Finishing desktop sign-in…");
  try {
    const response = await net.fetch(new URL("/api/desktop/auth/exchange", appUrl).href, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        code: deepLink.code,
        state: deepLink.state,
        verifier: authAttempt.verifier,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Desktop sign-in failed with status ${response.status}.`);
    }
    const exchange = normalizeDesktopSessionExchange(payload);
    if (!exchange) throw new Error("Desktop sign-in returned an invalid session.");

    const ses = desktopSession();
    const origin = new URL(appUrl).origin;
    const secure = origin.startsWith("https://");
    await ses.cookies.set({
      url: `${origin}/`,
      name: exchange.cookieName,
      value: exchange.sessionToken,
      httpOnly: true,
      secure,
      sameSite: "lax",
      expirationDate: exchange.expiresAt,
    });
    const otherCookie = exchange.cookieName === "__Secure-next-auth.session-token"
      ? "next-auth.session-token"
      : "__Secure-next-auth.session-token";
    await ses.cookies.remove(`${origin}/`, otherCookie).catch(() => {});

    authAttempt = null;
    setAuthStatus("authenticated", "Desktop sign-in completed.");
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(appUrl, { extraHeaders: "Cache-Control: no-cache\n" });
    }
    focusMainWindow();
    return true;
  } catch (error) {
    authAttempt = null;
    logger?.error("auth_exchange_failed", { error: error instanceof Error ? error.message : "unknown" });
    setAuthStatus("error", error instanceof Error ? error.message : "Desktop sign-in could not be completed.");
    focusMainWindow();
    return false;
  }
}

async function handleDeepLink(value) {
  if (!isSafeHeyKasaDeepLink(value)) return false;
  const url = new URL(value);
  if (url.hostname === "auth") await exchangeDesktopAuth(value);
  else focusMainWindow();
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
    if (deepLink) void handleDeepLink(deepLink);
    focusMainWindow();
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    void handleDeepLink(url);
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

function navigationUrl(event, deprecatedUrl) {
  return String(event?.url || deprecatedUrl || "");
}

function isMainFrameNavigation(event, deprecatedIsMainFrame) {
  if (typeof event?.isMainFrame === "boolean") return event.isMainFrame;
  if (typeof deprecatedIsMainFrame === "boolean") return deprecatedIsMainFrame;
  return true;
}

function denyGuestContents(contents) {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
}

function installPopupGuard(contents, { allowTrustedInApp = false } = {}) {
  contents.setWindowOpenHandler(({ url }) => {
    if (allowTrustedInApp && isTrustedRendererUrl(url, trustedOrigins) && mainWindow && !mainWindow.isDestroyed()) {
      void mainWindow.loadURL(url);
      return { action: "deny" };
    }
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

function guardRendererNavigation(event, deprecatedUrl, deprecatedIsMainFrame) {
  const url = navigationUrl(event, deprecatedUrl);
  const isMainFrame = isMainFrameNavigation(event, deprecatedIsMainFrame);
  if (shouldAllowRendererNavigation(url, trustedOrigins, { isMainFrame })) return;
  event.preventDefault();
  if (isSafeExternalUrl(url)) void shell.openExternal(url);
}

function installNavigationGuards(window) {
  const contents = window.webContents;
  denyGuestContents(contents);
  installPopupGuard(contents, { allowTrustedInApp: true });
  contents.on("will-navigate", guardRendererNavigation);
  contents.on("will-redirect", guardRendererNavigation);
}

async function showOfflineScreen(window) {
  if (!window || window.isDestroyed()) return;
  try {
    await window.loadFile(path.join(__dirname, "offline.html"));
  } catch {
    logger?.error("offline_screen_failed");
  }
}

async function loadApplication(window) {
  try {
    await window.loadURL(appUrl, { extraHeaders: "Cache-Control: no-cache\n" });
  } catch (error) {
    logger?.warn("renderer_load_failed", { error: error instanceof Error ? error.message : "unknown" });
    await showOfflineScreen(window);
  }
}

async function enterSafeMode() {
  if (safeMode) return;
  safeMode = true;
  logger?.warn("safe_mode_entered", {
    crashStreak: store?.get("crashStreak") || 0,
    rendererCrashCount: store?.get("rendererCrashCount") || 0,
  });
  updateTrayMenu();
  await discord.clearActivity().catch(() => {});
  discord.disconnect();
  updater?.dispose();
}

async function createMainWindow() {
  const ses = desktopSession();
  configureSession(ses);
  installAppearanceProtocol(ses);
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
      partition: DESKTOP_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  installNavigationGuards(window);

  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (quitting || store?.get("closeToTray") === false) {
      if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
      miniWindow = null;
      return;
    }
    event.preventDefault();
    window.hide();
  });
  window.webContents.on("did-fail-load", (_event, errorCode, description, _validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    logger?.warn("renderer_navigation_failed", { errorCode, description });
    void showOfflineScreen(window);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(JSON.stringify({
      level: "error",
      event: "renderer_crash",
      reason: details?.reason || "unknown",
      exitCode: details?.exitCode,
    }));
    logger?.error("renderer_crash", {
      reason: details?.reason || "unknown",
      exitCode: details?.exitCode,
    });
    const crashState = store?.recordRendererCrash();
    if (crashState?.safeMode) void enterSafeMode();
    void showOfflineScreen(window);
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  mainWindow = window;
  await loadApplication(window);
  return window;
}

function sendPlaybackCommand(command) {
  if (!isPlaybackCommand(command) || !canMessageRenderer()) return false;
  mainWindow.webContents.send("heykasa:playback:command", command);
  return true;
}

function broadcastPlayback() {
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(
      playbackState.hasTrack
        ? `${playbackState.playing ? "Playing" : "Paused"} · ${playbackState.title || PRODUCT_NAME}`
        : PRODUCT_NAME,
    );
  }
  updateTrayMenu();
  updateThumbar();
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send("heykasa:playback:state", playbackState);
  }
  if (playbackState.hasTrack && !miniUserHidden) {
    const window = createMiniPlayer();
    if (!window.isVisible()) {
      positionMiniPlayer();
      window.webContents.send("heykasa:playback:state", playbackState);
      window.showInactive();
    }
  }
  void refreshAppearanceAccent();
}

function positionMiniPlayer() {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  const { width, height } = miniWindow.getBounds();
  const trayBounds = tray && !tray.isDestroyed() ? tray.getBounds() : null;
  const cursor = trayBounds || { x: 24, y: 24, width: 0, height: 0 };
  const x = Math.max(8, cursor.x + cursor.width - width);
  const y = cursor.y > height + 24 ? cursor.y - height - 8 : cursor.y + cursor.height + 8;
  miniWindow.setPosition(Math.round(x), Math.round(y));
}

function createMiniPlayer() {
  if (miniWindow && !miniWindow.isDestroyed()) return miniWindow;
  const miniSession = session.fromPartition(MINI_PARTITION);
  installAppearanceProtocol(miniSession);
  miniWindow = new BrowserWindow({
    width: 360,
    height: 148,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: "#07111f",
    webPreferences: {
      preload: path.join(__dirname, "miniPreload.cjs"),
      partition: MINI_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      navigateOnDragDrop: false,
      devTools: !app.isPackaged,
    },
  });
  denyGuestContents(miniWindow.webContents);
  installPopupGuard(miniWindow.webContents);
  miniWindow.setMenu(null);
  miniWindow.setAlwaysOnTop(true, "floating");
  miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  miniWindow.on("closed", () => {
    miniWindow = null;
  });
  miniWindow.webContents.on("did-finish-load", () => {
    if (!miniWindow || miniWindow.isDestroyed()) return;
    miniWindow.webContents.send("heykasa:playback:state", playbackState);
    const appearance = resolvedAppearance();
    if (appearance) miniWindow.webContents.send("heykasa:appearance:changed", appearance);
  });
  void miniWindow.loadFile(path.join(__dirname, "miniPlayer.html"));
  return miniWindow;
}

function toggleMiniPlayer() {
  const window = createMiniPlayer();
  if (window.isVisible()) {
    miniUserHidden = true;
    window.hide();
    return;
  }
  miniUserHidden = false;
  positionMiniPlayer();
  window.webContents.send("heykasa:playback:state", playbackState);
  window.show();
}

function updateThumbar() {
  if (!mainWindow || mainWindow.isDestroyed() || process.platform !== "win32") return;
  const icon = nativeImage.createFromPath(resourceIconPath()).resize({ width: 16, height: 16 });
  mainWindow.setThumbarButtons([
    {
      tooltip: "Previous",
      icon,
      flags: playbackState.canPrev ? [] : ["disabled"],
      click: () => sendPlaybackCommand("prev"),
    },
    {
      tooltip: playbackState.playing ? "Pause" : "Play",
      icon,
      flags: playbackState.canPlay ? [] : ["disabled"],
      click: () => sendPlaybackCommand("play-pause"),
    },
    {
      tooltip: "Skip",
      icon,
      flags: playbackState.canSkip ? [] : ["disabled"],
      click: () => sendPlaybackCommand("skip"),
    },
  ]);
}

function assertMiniOrTrustedIpcEvent(event) {
  if (miniWindow && !miniWindow.isDestroyed() && event?.sender === miniWindow.webContents) {
    return;
  }
  assertTrustedIpcEvent(event, trustedOrigins);
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: playbackState.hasTrack
        ? `${playbackState.playing ? "Playing" : "Paused"} · ${playbackState.title || "Now playing"}`
        : "Nothing playing",
      enabled: false,
    },
    {
      label: "Previous",
      enabled: playbackState.canPrev,
      click: () => sendPlaybackCommand("prev"),
    },
    {
      label: playbackState.playing ? "Pause" : "Play",
      enabled: playbackState.canPlay,
      click: () => sendPlaybackCommand("play-pause"),
    },
    {
      label: "Skip",
      enabled: playbackState.canSkip,
      click: () => sendPlaybackCommand("skip"),
    },
    { type: "separator" },
    {
      label: "Open HayKasa",
      click: () => focusMainWindow(),
    },
    {
      label: "Check for updates",
      enabled: runtimeFeature("updater"),
      click: () => void updater?.checkNow({ manual: true }),
    },
    { type: "separator" },
    {
      label: "Quit HayKasa",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]));
}

function createTray() {
  if (tray && !tray.isDestroyed()) return tray;
  tray = new Tray(resourceIconPath());
  tray.setToolTip(PRODUCT_NAME);
  updateTrayMenu();
  tray.on("click", () => toggleMiniPlayer());
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

  logger?.info("desktop_preference_changed", { key });
  if (key === "autoUpdate" || key === "updateChannel") updater?.preferencesChanged();
  return desktopPreferences();
}

function showNativeUpdateNotification(status) {
  if (status?.state !== "ready" || process.platform !== "win32" || !Notification.isSupported()) return;
  const version = String(status.version || "").trim();
  const key = version || "ready";
  if (lastNativeUpdateNotificationVersion === key) return;
  lastNativeUpdateNotificationVersion = key;

  try {
    const notification = new Notification({
      title: version ? `HayKasa Desktop ${version} is ready` : "HayKasa Desktop update is ready",
      body: "The update finished downloading. Open HayKasa to restart and install it.",
      icon: resourceIconPath(),
      silent: false,
    });
    notification.on("click", () => {
      showMainWindow();
      if (canMessageRenderer()) mainWindow.webContents.send("heykasa:updates:status-changed", status);
    });
    notification.show();
  } catch (error) {
    logger?.warn("native_update_notification_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

function sendUpdateStatus(status) {
  if (["checking", "available", "ready", "up-to-date", "error", "disabled"].includes(status?.state)) {
    logger?.info("update_status", {
      state: status.state,
      version: status.version || "",
    });
  }
  showNativeUpdateNotification(status);
  if (canMessageRenderer()) mainWindow.webContents.send("heykasa:updates:status-changed", status);
}

async function applyPolicy(snapshot) {
  logger?.info("desktop_policy", {
    maintenance: snapshot?.maintenance === true,
    auth: snapshot?.features?.auth !== false,
    discord: snapshot?.features?.discord !== false,
    updater: snapshot?.features?.updater !== false,
  });
  updateTrayMenu();
  if (snapshot?.maintenance || snapshot?.features?.auth === false) {
    authAttempt = null;
    setAuthStatus("disabled", featureDisabledMessage("auth"));
  } else if (authStatus.state === "disabled") {
    setAuthStatus("idle", "");
  }

  if (!runtimeFeature("discord")) {
    await discord.clearActivity().catch(() => {});
    discord.disconnect();
  }

  if (!runtimeFeature("updater")) {
    updater?.dispose();
  } else if (updater) {
    updater.start();
  }
}

function requireRuntimeFeature(feature) {
  if (!runtimeFeature(feature)) throw new Error(featureDisabledMessage(feature));
}

function secureHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpcEvent(event, trustedOrigins);
    try {
      return await handler(...args);
    } catch (error) {
      logger?.error("native_ipc_failed", {
        channel,
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  });
}

function registerIpcHandlers() {
  discord.onJoin((secret) => {
    const code = String(secret || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length !== 6) return;
    if (canMessageRenderer()) mainWindow.webContents.send("heykasa:discord:join", code);
    showMainWindow();
  });

  secureHandle("heykasa:get-info", () => ({
    productName: PRODUCT_NAME,
    desktopVersion: app.getVersion(),
    apiVersion: DESKTOP_API_VERSION,
    capabilities: effectiveCapabilities(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    safeMode,
    policy: policy?.snapshot() || null,
  }));

  secureHandle("heykasa:auth:start", () => startDesktopAuth());
  secureHandle("heykasa:auth:status", () => ({ ...authStatus }));

  secureHandle("heykasa:discord:set-activity", async (activity) => {
    requireRuntimeFeature("discord");
    await discord.setActivity(activity);
    return { connected: discord.connected };
  });
  secureHandle("heykasa:discord:clear", async () => {
    if (!runtimeFeature("discord")) return { connected: false };
    await discord.clearActivity();
    return { connected: discord.connected };
  });
  secureHandle("heykasa:discord:disconnect", async () => {
    await discord.clearActivity().catch(() => {});
    discord.disconnect();
    return { connected: false };
  });
  secureHandle("heykasa:discord:status", () => ({
    connected: runtimeFeature("discord") && discord.connected,
    previouslyConnected: discord.everConnected,
    enabled: runtimeFeature("discord"),
  }));

  secureHandle("heykasa:playback:report", (state) => {
    playbackState = sanitizePlaybackState(state);
    broadcastPlayback();
    return playbackState;
  });
  ipcMain.handle("heykasa:mini:state", (event) => {
    assertMiniOrTrustedIpcEvent(event);
    return playbackState;
  });
  ipcMain.handle("heykasa:mini:command", (event, command) => {
    assertMiniOrTrustedIpcEvent(event);
    if (!isPlaybackCommand(command)) return { ok: false };
    return { ok: sendPlaybackCommand(command) };
  });
  ipcMain.handle("heykasa:mini:open", (event) => {
    assertMiniOrTrustedIpcEvent(event);
    showMainWindow();
    return { ok: true };
  });
  ipcMain.handle("heykasa:mini:hide", (event) => {
    assertMiniOrTrustedIpcEvent(event);
    miniUserHidden = true;
    hideMiniPlayer();
    return { ok: true };
  });
  ipcMain.handle("heykasa:mini:appearance", (event) => {
    assertMiniOrTrustedIpcEvent(event);
    return resolvedAppearance();
  });

  secureHandle("heykasa:updates:status", () => (
    runtimeFeature("updater")
      ? updater?.getStatus() || { state: "idle" }
      : { state: "disabled", detail: featureDisabledMessage("updater") }
  ));
  secureHandle("heykasa:updates:check", () => {
    requireRuntimeFeature("updater");
    return updater?.checkNow({ manual: true }) || { state: "disabled" };
  });
  secureHandle("heykasa:updates:install", async () => {
    requireRuntimeFeature("updater");
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
    logger?.info("auto_launch_changed", { enabled: next });
    return { enabled: app.getLoginItemSettings().openAtLogin === true };
  });

  secureHandle("heykasa:preferences:get", () => desktopPreferences());
  secureHandle("heykasa:preferences:set", (key, value) => setDesktopPreference(key, value));
  secureHandle("heykasa:appearance:get", () => resolvedAppearance());
  secureHandle("heykasa:appearance:import-background", () => chooseBackgroundFile());
  secureHandle("heykasa:appearance:discard-background", (assetId) => ({
    discarded: appearanceStore.discardAsset(assetId),
  }));
  secureHandle("heykasa:appearance:save-profile", async (profile) => {
    appearanceStore.saveProfile(profile);
    await refreshAppearanceAccent();
    return resolvedAppearance();
  });
  secureHandle("heykasa:appearance:activate", async (profileId) => {
    appearanceStore.activate(profileId);
    await refreshAppearanceAccent();
    return resolvedAppearance();
  });
  secureHandle("heykasa:appearance:duplicate", async (profileId) => {
    appearanceStore.duplicate(profileId);
    await refreshAppearanceAccent();
    return resolvedAppearance();
  });
  secureHandle("heykasa:appearance:delete", async (profileId) => {
    appearanceStore.delete(profileId);
    await refreshAppearanceAccent();
    return resolvedAppearance();
  });
  secureHandle("heykasa:appearance:reset", async () => {
    appearanceStore.reset();
    await refreshAppearanceAccent();
    return resolvedAppearance();
  });
  secureHandle("heykasa:appearance:relink", async (profileId) => {
    const profile = appearanceStore.getAll().profiles.find((item) => item.id === String(profileId || ""));
    if (!profile) throw new Error("Appearance profile not found.");
    const imported = await chooseBackgroundFile();
    if (imported.canceled) return { canceled: true, appearance: resolvedAppearance() };
    appearanceStore.saveProfile({
      ...profile,
      background: {
        ...profile.background,
        assetId: imported.asset.id,
        fileName: imported.asset.fileName,
      },
    });
    await refreshAppearanceAccent();
    return { canceled: false, appearance: resolvedAppearance() };
  });
  secureHandle("heykasa:diagnostics:get", () => ({
    safeMode,
    crashStreak: store?.get("crashStreak") || 0,
    rendererCrashCount: store?.get("rendererCrashCount") || 0,
    policy: policy?.snapshot() || null,
    update: updater?.getStatus() || null,
    discord: {
      enabled: runtimeFeature("discord"),
      connected: runtimeFeature("discord") && discord.connected,
      previouslyConnected: discord.everConnected,
    },
    logs: logger?.tail(100) || [],
  }));
  secureHandle("heykasa:diagnostics:clear-logs", () => {
    logger?.clear();
    logger?.info("diagnostic_logs_cleared");
    return { ok: true };
  });
}

async function shutdownNativeIntegrations() {
  policy?.dispose();
  updater?.dispose();
  await discord.clearActivity().catch(() => {});
  discord.disconnect();
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
  miniWindow = null;
  tray?.destroy();
  tray = null;
}

if (registerSingleInstance()) {
  registerProtocol();
  app.enableSandbox();
  app.on("certificate-error", (_event, _webContents, _url, _error, _certificate, callback) => {
    callback(false);
  });
  app.on("web-contents-created", (_event, contents) => {
    denyGuestContents(contents);
    installPopupGuard(contents);
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_USER_MODEL_ID);
    configureSession(session.defaultSession);
    const userDataDir = app.getPath("userData");
    store = new NativeStore(userDataDir);
    appearanceStore = new AppearanceStore(userDataDir);
    resolvedAccent = appearanceStore.activeProfile()?.accent?.fixedColor || "#00e6e6";
    logger = new NativeLogger(userDataDir);
    const startState = store.recordStart();
    safeMode = startState.safeMode;
    logger.info("desktop_start", {
      version: app.getVersion(),
      packaged: app.isPackaged,
      safeMode,
      crashStreak: startState.crashStreak,
      platform: process.platform,
      arch: process.arch,
    });
    const actualAutoLaunch = app.getLoginItemSettings().openAtLogin === true;
    if (store.get("autoLaunch") !== actualAutoLaunch) store.set("autoLaunch", actualAutoLaunch);

    policy = new DesktopPolicy({
      url: new URL("/api/desktop/policy", appUrl).href,
      fetchImpl: (url, options) => net.fetch(url, options),
      onChange: (snapshot) => void applyPolicy(snapshot),
    });
    await policy.refresh();

    updater = new DesktopUpdater({
      app,
      store,
      onStatus: sendUpdateStatus,
      rolloutPercent: () => effectiveUpdateRolloutPercent(policy?.snapshot()),
    });
    registerIpcHandlers();
    await createMainWindow();
    createTray();
    if (runtimeFeature("updater")) updater.start();
    policy.start();
    startupCompleted = true;
    logger.info("desktop_ready", { safeMode });

    powerMonitor.on("resume", () => {
      logger?.info("system_resume");
      void policy?.refresh();
      if (runtimeFeature("updater") && updater && store.get("autoUpdate") !== false) void updater.checkNow();
      if (authAttempt && desktopAuthAttemptExpired(authAttempt)) {
        authAttempt = null;
        setAuthStatus("idle", "");
      }
    });

    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) void createMainWindow();
      else focusMainWindow();
    });
  }).catch((error) => {
    logger?.error("desktop_start_failed", { error: error instanceof Error ? error.message : "unknown" });
    console.error(`[HayKasa Desktop] ${error instanceof Error ? error.stack || error.message : error}`);
    app.quit();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    quitting = true;
    logger?.info("desktop_exit", { clean: startupCompleted });
    if (startupCompleted) store?.recordCleanExit();
    void shutdownNativeIntegrations();
  });
}
