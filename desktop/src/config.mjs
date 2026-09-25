import {
  DESKTOP_API_VERSION,
  DESKTOP_CAPABILITIES,
} from "./generated/desktopContract.mjs";

export { DESKTOP_API_VERSION, DESKTOP_CAPABILITIES };

export const PRODUCT_NAME = "HayKasa";
export const PRODUCTION_APP_URL = "https://haykasa.vercel.app";

// The packaged client receives no GitHub write credentials, release signing
// secrets, or artifact-origin configuration. It checks the production manifest
// first, then uses the stable same-origin compatibility API for updater files.
export const UPDATE_MANIFEST_URL = `${PRODUCTION_APP_URL}/api/desktop/manifest`;
export const UPDATE_FEED_BASE_URL = `${PRODUCTION_APP_URL}/api/desktop/update`;

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_INITIAL_DELAY_MIN_MS = 30 * 1000;
export const UPDATE_INITIAL_DELAY_JITTER_MS = 60 * 1000;
export const UPDATE_PREFLIGHT_TIMEOUT_MS = 8 * 1000;
export const LOCAL_DEV_APP_URL = "http://localhost:3003";

function loopbackAppUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if ((url.protocol === "http:" || url.protocol === "https:")
      && ["localhost", "127.0.0.1"].includes(url.hostname)) {
      return url.href.replace(/\/$/, "");
    }
  } catch {
    // Ignore invalid development overrides.
  }
  return "";
}

export function desktopAppUrl({ isPackaged = true, overrideUrl = "" } = {}) {
  if (!isPackaged) {
    return loopbackAppUrl(overrideUrl) || LOCAL_DEV_APP_URL;
  }
  return PRODUCTION_APP_URL;
}
