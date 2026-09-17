import crypto from "node:crypto";
import DesktopAuthGrant from "@/models/DesktopAuthGrant";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import {
  hashDesktopAuthValue,
  normalizeDesktopAuthState,
  normalizeDesktopPkceChallenge,
} from "@/utils/desktopAuth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_TTL_MS = 5 * 60 * 1000;

function noStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function loginRedirect(request, state, challenge) {
  const requestUrl = new URL(request.url);
  const callback = `/api/desktop/auth/authorize?state=${encodeURIComponent(state)}&challenge=${encodeURIComponent(challenge)}`;
  const login = new URL("/login", requestUrl.origin);
  login.searchParams.set("callbackUrl", callback);
  return Response.redirect(login, 302);
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const state = normalizeDesktopAuthState(requestUrl.searchParams.get("state"));
  const challenge = normalizeDesktopPkceChallenge(requestUrl.searchParams.get("challenge"));
  if (!state || !challenge) {
    return Response.json({ error: "Invalid desktop authentication request." }, {
      status: 400,
      headers: noStoreHeaders(),
    });
  }

  const account = await getAuthenticatedAccount(request, { optional: true });
  if (!account) return loginRedirect(request, state, challenge);

  const rateLimit = await isRateLimited(`desktop-auth-issue:${account.email}`, {
    windowMs: 15 * 60_000,
    max: 12,
  });
  if (rateLimit.limited) {
    return Response.json({ error: "Too many desktop sign-in requests. Try again later." }, {
      status: 429,
      headers: {
        ...noStoreHeaders(),
        "Retry-After": String(rateLimit.retryAfter),
      },
    });
  }

  const code = crypto.randomBytes(32).toString("base64url");
  await DesktopAuthGrant.create({
    codeHash: hashDesktopAuthValue(code),
    stateHash: hashDesktopAuthValue(state),
    pkceChallenge: challenge,
    userId: account.user._id,
    expiresAt: new Date(Date.now() + AUTH_TTL_MS),
  });

  const deepLink = new URL("heykasa://auth");
  deepLink.searchParams.set("code", code);
  deepLink.searchParams.set("state", state);
  return new Response(null, {
    status: 303,
    headers: {
      ...noStoreHeaders(),
      Location: deepLink.href,
    },
  });
}
