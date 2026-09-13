export const PRODUCTION_SITE_URL = "https://haykasa.vercel.app";
export const LEGACY_SITE_ORIGINS = new Set([
  "https://spotify-clone-iota-pink.vercel.app",
]);

export const LOCAL_APP_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3003",
]);

export function normalizeAppOrigin(value, { allowLocalHttp = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`,
    );
    const localHttp =
      allowLocalHttp
      && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (url.protocol !== "https:" && !localHttp) return "";
    if (url.username || url.password) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function isLocalAppOrigin(value) {
  const origin = normalizeAppOrigin(value, { allowLocalHttp: true });
  if (!origin) return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function decodedRedirect(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function safeReturnPath(value, baseOrigin = PRODUCTION_SITE_URL) {
  const raw = String(value || "").trim();
  const base = normalizeAppOrigin(baseOrigin, { allowLocalHttp: true });
  if (!raw || !base || /[\u0000-\u001f\u007f\\]/.test(raw)) return "/";

  const decoded = decodedRedirect(raw).trim();
  if (
    decoded.startsWith("//")
    || /[\u0000-\u001f\u007f\\]/.test(decoded)
  ) {
    return "/";
  }

  try {
    const url = new URL(raw, `${base}/`);
    if (url.origin !== base || url.username || url.password) return "/";
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("/") && !path.startsWith("//") ? path : "/";
  } catch {
    return "/";
  }
}

export function loginPath(returnTo = "/", baseOrigin = PRODUCTION_SITE_URL) {
  const safePath = safeReturnPath(returnTo, baseOrigin);
  return `/login?callbackUrl=${encodeURIComponent(safePath)}`;
}

export function isSuccessfulAuthResponseUrl(value, currentOrigin) {
  const origin = normalizeAppOrigin(currentOrigin, { allowLocalHttp: true });
  if (!origin || !value) return false;

  try {
    const url = new URL(String(value), `${origin}/`);
    return (
      url.origin === origin
      && url.searchParams.get("csrf") !== "true"
      && url.searchParams.get("error") == null
    );
  } catch {
    return false;
  }
}
