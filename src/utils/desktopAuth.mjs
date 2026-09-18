import crypto from "node:crypto";

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

function boundedBase64Url(value, min, max) {
  const text = String(value || "").trim();
  return text.length >= min && text.length <= max && BASE64URL.test(text) ? text : "";
}

export function normalizeDesktopAuthState(value) {
  return boundedBase64Url(value, 32, 128);
}

export function normalizeDesktopAuthCode(value) {
  return boundedBase64Url(value, 32, 128);
}

export function normalizeDesktopPkceChallenge(value) {
  const text = boundedBase64Url(value, 43, 43);
  return text || "";
}

export function normalizeDesktopPkceVerifier(value) {
  const text = String(value || "").trim();
  return PKCE_VERIFIER.test(text) ? text : "";
}

export function hashDesktopAuthValue(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function desktopPkceChallenge(verifier) {
  const normalized = normalizeDesktopPkceVerifier(verifier);
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized, "utf8").digest("base64url");
}

export function safeHashEqual(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
