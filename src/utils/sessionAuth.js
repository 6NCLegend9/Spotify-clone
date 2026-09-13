import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";
import { hasSessionIdentity, isCurrentSession } from "@/utils/sessionIdentity.mjs";
import { logServerDiagnostic } from "@/utils/diagnostics.mjs";

export class SessionLookupUnavailableError extends Error {
  constructor(cause) {
    super("Session lookup is temporarily unavailable", { cause });
    this.name = "SessionLookupUnavailableError";
  }
}

const SESSION_LOOKUP_TTL_MS = 4_000;
const lookupCache = globalThis.__HeyKasaSessionLookup || new Map();
globalThis.__HeyKasaSessionLookup = lookupCache;

function lookupKey(token) {
  return `${token.id}:${token.sessionVersion}`;
}

export async function resolveSessionUser(token, { fresh = false } = {}) {
  if (!hasSessionIdentity(token)) return null;
  const key = lookupKey(token);
  if (!fresh) {
    const cached = lookupCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.user) return null;
      if (isCurrentSession(token, cached.user)) return cached.user;
      lookupCache.delete(key);
    }
  }

  const started = performance.now();
  try {
    await dbConnect();
    const user = await User.findById(token.id);
    const current = isCurrentSession(token, user) ? user : null;
    lookupCache.set(key, {
      user: current,
      expiresAt: Date.now() + SESSION_LOOKUP_TTL_MS,
    });
    return current;
  } catch (error) {
    throw new SessionLookupUnavailableError(error);
  } finally {
    logServerDiagnostic("session_lookup", { durationMs: performance.now() - started });
  }
}

export async function getSessionUser(req) {
  return resolveSessionUser(await getToken(tokenOptions(req)), { fresh: true });
}