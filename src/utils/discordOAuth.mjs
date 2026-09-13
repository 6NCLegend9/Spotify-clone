import { PRODUCTION_SITE_URL, normalizeAppUrl } from "./siteConfig.js";

export const DISCORD_CLIENT_ID_PATTERN = /^\d{17,22}$/;
const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3003",
];

export function readDiscordClientId(env = process.env) {
  const id = String(env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "").trim();
  return DISCORD_CLIENT_ID_PATTERN.test(id) ? id : "";
}

export function readDiscordClientSecret(env = process.env) {
  const secret = String(env.DISCORD_CLIENT_SECRET || "").trim();
  return secret.length >= 8 && secret.length <= 128 ? secret : "";
}

export function isDiscordPresenceConfigured(env = process.env) {
  return Boolean(readDiscordClientId(env) && readDiscordClientSecret(env));
}

export function allowedDiscordRedirectUris(env = process.env) {
  const origins = new Set([PRODUCTION_SITE_URL]);
  const configured = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL) || normalizeAppUrl(env.NEXTAUTH_URL);
  if (configured) origins.add(configured);
  if (env.NODE_ENV !== "production") {
    LOCAL_DEV_ORIGINS.forEach((origin) => origins.add(origin));
  }
  return origins;
}

export function resolveDiscordRedirectUri(requested, env = process.env) {
  const allowed = allowedDiscordRedirectUris(env);
  const origin = normalizeAppUrl(requested, { allowHttp: env.NODE_ENV !== "production" });
  if (origin && allowed.has(origin)) return origin;
  const configured = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL) || normalizeAppUrl(env.NEXTAUTH_URL);
  if (configured && allowed.has(configured)) return configured;
  return PRODUCTION_SITE_URL;
}

export function parseDiscordAccessToken(payload) {
  const accessToken = typeof payload?.access_token === "string" ? payload.access_token.trim() : "";
  const expiresIn = Number(payload?.expires_in);
  if (!accessToken || accessToken.length < 16 || accessToken.length > 256) return null;
  const lifetimeMs = Number.isFinite(expiresIn) && expiresIn > 30
    ? (expiresIn - 30) * 1000
    : 6 * 60 * 60 * 1000;
  return {
    accessToken,
    expiresAt: Date.now() + lifetimeMs,
  };
}
