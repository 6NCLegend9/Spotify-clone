import crypto from "node:crypto";

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const AUTH_MAX_AGE_MS = 10 * 60 * 1000;

function cleanBase64Url(value, min, max) {
  const text = String(value || "").trim();
  return text.length >= min && text.length <= max && BASE64URL.test(text) ? text : "";
}

export function createDesktopAuthAttempt(now = Date.now()) {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier, "utf8").digest("base64url");
  return { verifier, state, challenge, createdAt: now };
}

export function desktopAuthAttemptExpired(attempt, now = Date.now()) {
  return !attempt || !Number.isFinite(attempt.createdAt) || now - attempt.createdAt > AUTH_MAX_AGE_MS;
}

export function buildDesktopAuthorizeUrl(appUrl, attempt) {
  const url = new URL("/api/desktop/auth/authorize", appUrl);
  url.searchParams.set("state", attempt.state);
  url.searchParams.set("challenge", attempt.challenge);
  return url.href;
}

export function parseDesktopAuthDeepLink(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return null;
  }
  if (url.protocol !== "heykasa:" || url.hostname !== "auth" || url.username || url.password) return null;
  const code = cleanBase64Url(url.searchParams.get("code"), 32, 128);
  const state = cleanBase64Url(url.searchParams.get("state"), 32, 128);
  return code && state ? { code, state } : null;
}

export function isMatchingDesktopAuthState(attempt, state) {
  if (!attempt || desktopAuthAttemptExpired(attempt)) return false;
  const left = Buffer.from(String(attempt.state || ""), "utf8");
  const right = Buffer.from(String(state || ""), "utf8");
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function normalizeDesktopSessionExchange(value) {
  if (!value || typeof value !== "object") return null;
  const sessionToken = typeof value.sessionToken === "string" ? value.sessionToken.trim() : "";
  const cookieName = typeof value.cookieName === "string" ? value.cookieName.trim() : "";
  const expiresAt = Number(value.expiresAt);
  if (!sessionToken || sessionToken.length > 16_384) return null;
  if (!["__Secure-next-auth.session-token", "next-auth.session-token"].includes(cookieName)) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return null;
  return { sessionToken, cookieName, expiresAt: Math.floor(expiresAt) };
}

export { AUTH_MAX_AGE_MS };
