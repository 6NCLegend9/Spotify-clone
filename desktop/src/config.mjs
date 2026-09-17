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

// The signed desktop release pipeline will set this to the public, immutable
// update root (for example a Vercel Blob directory). Until that feed exists,
// the updater reports `disabled` instead of probing a broken URL.
export const UPDATE_FEED_BASE_URL = "";

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_INITIAL_DELAY_MIN_MS = 30 * 1000;
export const UPDATE_INITIAL_DELAY_JITTER_MS = 60 * 1000;

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
