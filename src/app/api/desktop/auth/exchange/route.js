import { encode } from "next-auth/jwt";
import DesktopAuthGrant from "@/models/DesktopAuthGrant";
import User from "@/models/User";
import { authSecret } from "@/utils/authToken";
import dbConnect from "@/utils/dbconnect";
import {
  desktopPkceChallenge,
  hashDesktopAuthValue,
  normalizeDesktopAuthCode,
  normalizeDesktopAuthState,
  normalizeDesktopPkceVerifier,
  safeHashEqual,
  safeUtf8Equal,
} from "@/utils/desktopAuth.mjs";
import { isRateLimited } from "@/utils/rateLimit";
import { sessionIdentity } from "@/utils/sessionIdentity.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status, headers: responseHeaders() });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid desktop sign-in payload.");
  }

  const code = normalizeDesktopAuthCode(body?.code);
  const state = normalizeDesktopAuthState(body?.state);
  const verifier = normalizeDesktopPkceVerifier(body?.verifier);
  if (!code || !state || !verifier) return jsonError("Invalid desktop sign-in payload.");

  const codeHash = hashDesktopAuthValue(code);
  const rateLimit = await isRateLimited(`desktop-auth-exchange:${codeHash.slice(0, 24)}`, {
    windowMs: 15 * 60_000,
    max: 8,
  });
  if (rateLimit.limited) {
    return Response.json({ error: "Too many desktop sign-in attempts. Start a new sign-in request." }, {
      status: 429,
      headers: { ...responseHeaders(), "Retry-After": String(rateLimit.retryAfter) },
    });
  }

  await dbConnect();
  const now = new Date();
  const grant = await DesktopAuthGrant.findOne({
    codeHash,
    consumedAt: null,
    expiresAt: { $gt: now },
  }).lean();
  if (!grant) return jsonError("This desktop sign-in request expired or was already used.", 401);

  const expectedStateHash = hashDesktopAuthValue(state);
  if (!safeHashEqual(grant.stateHash, expectedStateHash)) {
    return jsonError("Desktop sign-in state did not match.", 401);
  }
  if (!safeUtf8Equal(desktopPkceChallenge(verifier), grant.pkceChallenge)) {
    return jsonError("Desktop sign-in proof did not match.", 401);
  }

  const consumed = await DesktopAuthGrant.findOneAndUpdate(
    { _id: grant._id, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } },
    { new: true },
  ).lean();
  if (!consumed) return jsonError("This desktop sign-in request was already used.", 401);

  const user = await User.findById(grant.userId);
  const identity = sessionIdentity(user);
  if (!user || user.isVerified !== true || !identity) {
    return jsonError("The account is no longer available for desktop sign-in.", 401);
  }

  const secret = authSecret();
  if (!secret) return jsonError("Desktop sign-in is temporarily unavailable.", 503);

  const sessionToken = await encode({
    secret,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      ...identity,
      email: user.email,
      name: user.userName,
      picture: user.imageUrl,
      userName: user.userName,
      imageUrl: user.imageUrl,
      isVerified: true,
    },
  });
  const secure = new URL(request.url).protocol === "https:";
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;

  return Response.json({
    sessionToken,
    cookieName: secure ? "__Secure-next-auth.session-token" : "next-auth.session-token",
    expiresAt,
  }, { headers: responseHeaders() });
}
