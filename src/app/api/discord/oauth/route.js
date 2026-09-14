import { apiError, apiSuccess, handleApiError, readRequestJson, ApiRouteError } from "@/utils/apiResponse";
import { isRateLimited, getClientKey } from "@/utils/rateLimit";
import { randomBytes } from "node:crypto";
import User from "@/models/User";
import { getSessionUser } from "@/utils/sessionAuth";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { hashToken } from "@/utils/tokenHash.mjs";
import {
  isDiscordPresenceConfigured,
  parseDiscordAccessToken,
  readDiscordClientId,
  readDiscordClientSecret,
  resolveDiscordRedirectUri,
} from "@/utils/discordOAuth.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

const DISCORD_API = "https://discord.com/api/v10";

function invalid(message) {
  throw new ApiRouteError("VALIDATION_ERROR", { message });
}

async function discordForm(path, body) {
  const response = await fetch(`${DISCORD_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

export async function POST(request) {
  try {
    if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
    const user = await getSessionUser(request);
    if (!user) return apiError("UNAUTHORIZED");
    if (!isDiscordPresenceConfigured()) {
      return apiError("SERVICE_UNAVAILABLE", {
        message: "Discord presence is not configured on this server.",
      });
    }

    const rateLimit = await isRateLimited(`discord-oauth:${user._id}:${getClientKey(request)}`, {
      windowMs: 15 * 60_000,
      max: 20,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many Discord connection attempts. Please wait and try again.",
      });
    }

    const body = await readRequestJson(request);
    const clientId = readDiscordClientId();
    const clientSecret = readDiscordClientSecret();

    if (body.action === "begin") {
      const state = randomBytes(32).toString("hex");
      const initialized = await User.updateOne({
        _id: user._id,
        sessionVersion: user.sessionVersion,
      }, { $set: {
        discordOAuthStateHash: hashToken(state),
        discordOAuthStateExpires: new Date(Date.now() + 5 * 60_000),
      } });
      if (!initialized.matchedCount) return apiError("UNAUTHORIZED");
      const result = await discordForm("/oauth2/token/rpc", new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
      }));
      const rpcToken = typeof result.payload?.rpc_token === "string" ? result.payload.rpc_token.trim() : "";
      if (!result.ok || !rpcToken) {
        return apiSuccess({ state, rpcToken: "" }, { headers: { "Cache-Control": "private, no-store" } });
      }
      return apiSuccess({ state, rpcToken }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (typeof body.state !== "string" || !/^[a-f0-9]{64}$/.test(body.state)) {
      return apiError("FORBIDDEN");
    }

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length < 8 || code.length > 256 || !/^[A-Za-z0-9._~+/-]+$/.test(code)) {
      invalid("Discord authorization code is missing or invalid.");
    }

    const redirectUri = resolveDiscordRedirectUri(body.redirectUri);
    const consumed = await User.findOneAndUpdate({
      _id: user._id,
      sessionVersion: user.sessionVersion,
      discordOAuthStateHash: hashToken(body.state),
      discordOAuthStateExpires: { $gt: new Date() },
    }, { $unset: { discordOAuthStateHash: 1, discordOAuthStateExpires: 1 } });
    if (!consumed) return apiError("FORBIDDEN");
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
    });
    if (redirectUri) params.set("redirect_uri", redirectUri);

    const result = await discordForm("/oauth2/token", params);
    const token = parseDiscordAccessToken(result.payload);
    if (!result.ok || !token) {
      return apiError("UNAUTHORIZED", {
        message: "Discord did not accept this connection.",
      });
    }

    return apiSuccess({
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error, "Discord OAuth");
  }
}
