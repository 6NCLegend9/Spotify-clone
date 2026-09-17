export const PRODUCT_NAME = "HeyKasa";
export const PRODUCTION_APP_URL = "https://haykasa.vercel.app";
export const DESKTOP_API_VERSION = 1;
export const DESKTOP_CAPABILITIES = Object.freeze([
  "discordPresenceV1",
  "updaterV1",
  "autoLaunchV1",
  "desktopPreferencesV1",
  "trayV1",
  "diagnosticsV1",
]);

// The signed installer never receives a Vercel Blob write token or a raw
// storage hostname. It checks the production manifest first, then uses this
// same-origin read-only proxy for electron-updater metadata and binaries.
export const UPDATE_MANIFEST_URL = `${PRODUCTION_APP_URL}/api/desktop/manifest`;
export const UPDATE_FEED_BASE_URL = `${PRODUCTION_APP_URL}/api/desktop/update`;

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_INITIAL_DELAY_MIN_MS = 30 * 1000;
export const UPDATE_INITIAL_DELAY_JITTER_MS = 60 * 1000;
export const UPDATE_PREFLIGHT_TIMEOUT_MS = 8 * 1000;

export function desktopAppUrl({ isPackaged = true, overrideUrl = "" } = {}) {
  if (!isPackaged && overrideUrl) {
    try {
      const url = new URL(overrideUrl);
      if ((url.protocol === "http:" || url.protocol === "https:")
        && ["localhost", "127.0.0.1"].includes(url.hostname)) {
        return url.href.replace(/\/$/, "");
      }
    } catch {
      // Ignore invalid development overrides.
    }
  }
  return PRODUCTION_APP_URL;
}
