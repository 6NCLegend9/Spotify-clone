import { PRODUCTION_APP_URL } from "./config.mjs";

function parsedUrl(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

export function buildTrustedOrigins({ appUrl = PRODUCTION_APP_URL, isPackaged = true } = {}) {
  const origins = new Set([new URL(PRODUCTION_APP_URL).origin]);
  const parsed = parsedUrl(appUrl);
  if (!isPackaged && parsed
    && (parsed.protocol === "http:" || parsed.protocol === "https:")
    && ["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    origins.add(parsed.origin);
  }
  return origins;
}

export function isTrustedRendererUrl(value, trustedOrigins) {
  const parsed = parsedUrl(value);
  if (!parsed || !trustedOrigins?.has(parsed.origin)) return false;
  return parsed.protocol === "https:"
    || ["localhost", "127.0.0.1"].includes(parsed.hostname);
}

export function isSafeExternalUrl(value) {
  const parsed = parsedUrl(value);
  return Boolean(
    parsed
    && parsed.protocol === "https:"
    && !parsed.username
    && !parsed.password
    && parsed.hostname
  );
}

export function isSafeDesktopOpenUrl(value, { allowLoopbackHttp = false } = {}) {
  if (isSafeExternalUrl(value)) return true;
  if (!allowLoopbackHttp) return false;
  const parsed = parsedUrl(value);
  return Boolean(
    parsed
    && parsed.protocol === "http:"
    && !parsed.username
    && !parsed.password
    && ["localhost", "127.0.0.1"].includes(parsed.hostname)
  );
}

export function shouldAllowRendererNavigation(url, trustedOrigins, { isMainFrame = true } = {}) {
  if (isMainFrame === false) return true;
  return isTrustedRendererUrl(url, trustedOrigins);
}

export function isSafeHeyKasaDeepLink(value) {
  const parsed = parsedUrl(value);
  if (!parsed || parsed.protocol !== "heykasa:") return false;
  if (parsed.username || parsed.password) return false;
  return ["open", "auth"].includes(parsed.hostname);
}

export function assertTrustedIpcEvent(event, trustedOrigins) {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || "";
  if (!isTrustedRendererUrl(senderUrl, trustedOrigins)) {
    throw new Error("Blocked native request from an untrusted renderer.");
  }
}
