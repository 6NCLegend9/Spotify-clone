import { readRequestJson, ApiRouteError } from "@/utils/apiResponseCore.mjs";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { tokenOptions } from "@/utils/authToken";
import { resolveSessionUser } from "@/utils/sessionAuth";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { mediaServiceConfig, validateMediaRequest, callMediaService, normalizeMediaResult } from "@/utils/mediaService.mjs";
import { signMediaReceipt, verifyMediaReceipt, mediaScopeHash } from "@/utils/mediaReceipts.mjs";
import { findNativePlaybackGrant, issueNativePlaybackGrant,
  nativeGrantAllowsSelection, registerNativePlaybackJob, revokeDeviceNativePlaybackGrants,
  revokeNativePlaybackGrant, signNativePlaybackDeviceId, validateNativePlaybackSelection,
  verifyNativePlaybackDeviceId } from "@/utils/nativePlaybackGrants";

export const runtime = "nodejs";
export const maxDuration = 300;

const HEADERS = { "Cache-Control": "private, no-store" };
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: HEADERS });
const DEVICE_COOKIE = "__Secure-haykasa-native-playback";
const deviceId = (request, secret) => {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim())
    .find(part => part.startsWith(`${DEVICE_COOKIE}=`))?.slice(DEVICE_COOKIE.length + 1);
  return verifyNativePlaybackDeviceId(value, secret);
};
const validReceipt = receipt => receipt && /^[a-f0-9]{32}$/.test(receipt.jobId || "")
  && validateMediaRequest(receipt.selection) && /^[a-f0-9]{64}$/.test(receipt.subscriber || "");

async function cancelGrantJobs(config, grants) {
  let deliveriesCancelled = true;
  const unique = new Map();
  for (const grant of grants) for (const job of grant?.jobs || []) unique.set(`${job.jobId}:${job.subscriber}`, job);
  const jobs = [...unique.values()];
  // Authorization is revoked before cleanup starts. Bound concurrent worker
  // requests so a disconnected worker cannot stall device logout indefinitely.
  const deadline = Date.now() + 10_000;
  for (let offset = 0; offset < jobs.length; offset += 8) {
    if (Date.now() >= deadline) { deliveriesCancelled = false; break; }
    await Promise.all(jobs.slice(offset, offset + 8).map(async job => {
      try { await callMediaService(config, `/v1/jobs/${job.jobId}`, { method: "DELETE", subscriber: job.subscriber }); }
      catch { deliveriesCancelled = false; }
    }));
  }
  return deliveriesCancelled;
}

function trusted(request) {
  if (isTrustedRequestOrigin(request)) return true;
  const origin = request.headers.get("origin");
  if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) return true;
  return process.env.NODE_ENV !== "production" && origin === request.nextUrl.origin;
}
async function handle(request, action, body) {
  const config = mediaServiceConfig();
  if (config.internal) config.deliveryOrigin = request.nextUrl.origin;
  if (!config.enabled) return reply({ state: "failed", reason: "service_unconfigured" }, 503);
  if (config.internal && !config.playbackEnabled && !["cancel", "revokeNativeGrant", "revokeNativeGrants"].includes(action)) return reply({ state: "failed", reason: "service_disabled" }, 503);
  try {
    const hasAuthorization = request.headers.has("authorization");
    const authorization = request.headers.get("authorization");
    const grant = authorization ? await findNativePlaybackGrant(authorization.startsWith("Bearer ") ? authorization.slice(7) : "", config.secret) : null;
    // A malformed/revoked bearer must never fall back to ambient browser cookies.
    if (hasAuthorization && !grant) return reply({ state: "failed", reason: "native_authorization_required" }, 401);
    const token = grant ? { id: grant.accountId, sub: grant.accountId, sessionVersion: grant.sessionVersion }
      : await getToken(tokenOptions(request));
    const user = token?.id ? await resolveSessionUser(token, { fresh: true }) : null;
    if (!user) return reply({ state: "failed", reason: "authentication_required" }, 401);
    if (grant && !["create", "poll", "renew", "cancel", "revokeNativeGrant"].includes(action)) return reply({ state: "failed", reason: "forbidden" }, 403);
    const scope = mediaScopeHash(`account:${user.id}:${token.sessionVersion}`, config.secret);
    let subscriber;
    const limits = action === "create" ? { max: 12, windowMs: 60_000 } : { max: 100, windowMs: 60_000 };
    const rate = await isRateLimited(`media:${action === "create" ? "create" : "poll"}:${getClientKey(request)}:${scope}`, limits);
    const clientRate = await isRateLimited(`media:client:${getClientKey(request)}`, { max: 140, windowMs: 60_000 });
    if ((rate.limited || clientRate.limited) && !["revokeNativeGrant", "revokeNativeGrants"].includes(action)) return reply({ state: "failed", reason: "rate_limited" }, 429);
    if (action === "nativeGrant") {
      const selection = validateNativePlaybackSelection(body);
      const receipt = body.receipt === undefined ? null : verifyMediaReceipt(body.receipt, scope, config.secret);
      if (!selection || body.receipt !== undefined && (!validReceipt(receipt) || !nativeGrantAllowsSelection(selection, receipt.selection))) {
        return reply({ state: "failed", reason: "invalid_request" }, 400);
      }
      const device = deviceId(request, config.secret) || randomUUID();
      const issued = await issueNativePlaybackGrant(token, selection, receipt, device, config.secret);
      if (!issued) return reply({ state: "failed", reason: "native_grant_limit" }, 429);
      const response = reply(issued);
      response.cookies.set(DEVICE_COOKIE, signNativePlaybackDeviceId(device, config.secret), { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 365 * 24 * 3600 });
      return response;
    }
    if (action === "revokeNativeGrants") {
      const device = deviceId(request, config.secret);
      const revoked = device ? await revokeDeviceNativePlaybackGrants(token, device) : [];
      return reply({ revoked: true, deliveriesCancelled: await cancelGrantJobs(config, revoked) });
    }
    if (action === "revokeNativeGrant") {
      if (!grant) return reply({ state: "failed", reason: "forbidden" }, 403);
      const revoked = await revokeNativePlaybackGrant(grant);
      return reply({ revoked: true, deliveriesCancelled: await cancelGrantJobs(config, revoked ? [revoked] : []) });
    }
    let result, selection;
    if (action === "create") {
      subscriber = mediaScopeHash(`subscriber:${scope}:${randomUUID()}`, config.secret);
      selection = validateMediaRequest(body);
      if (!selection) return reply({ state: "failed", reason: "invalid_request" }, 400);
      if (grant && !nativeGrantAllowsSelection(grant, selection)) return reply({ state: "failed", reason: "forbidden" }, 403);
      result = await callMediaService(config, "/v1/jobs", { method: "POST", body: selection, subscriber });
    } else {
      const receipt = verifyMediaReceipt(body?.receipt, scope, config.secret);
      if (!validReceipt(receipt) || grant && !nativeGrantAllowsSelection(grant, receipt.selection)) return reply({ state: "failed", reason: "invalid_receipt" }, 403);
      selection = receipt.selection;
      subscriber = receipt.subscriber;
      result = await callMediaService(config, `/v1/jobs/${receipt.jobId}${action === "renew" ? "/renew" : ""}`, { method: action === "cancel" ? "DELETE" : action === "renew" ? "POST" : "GET", subscriber });
    }
    const normalized = action === "cancel" ? null : normalizeMediaResult(result, config);
    // Register before publishing any delivery. Revocation racing an in-flight
    // create/renew wins, and the private worker job is removed instead.
    const owned = grant && (action === "create" || grant.jobs.some(job => job.jobId === result.jobId && job.subscriber === subscriber));
    if (grant && action !== "cancel" && !await registerNativePlaybackJob(grant, { jobId: result.jobId, subscriber }, owned)) {
      if (owned) await cancelGrantJobs(config, [{ jobs: [{ jobId: result.jobId, subscriber }] }]);
      return reply({ state: "failed", reason: "native_authorization_required" }, 401);
    }
    const response = action === "cancel" ? reply({ cancelled: true }) : reply({ ...normalized, receipt: signMediaReceipt({ scope, subscriber, jobId: result.jobId, selection, expiresAt: Date.now() + 4 * 3600_000 }, config.secret) });
    return response;
  } catch { return reply({ state: "failed", reason: "service_unavailable" }, 503); }
}
export async function GET(request) {
  if (!request.nextUrl.searchParams.has("receipt")) {
    const config = mediaServiceConfig();
    if (!config.enabled) return reply({ enabled: false, reason: "service_unconfigured" });
    if (config.internal && !config.playbackEnabled) return reply({ enabled: false, reason: "service_disabled" });
    try {
      const token = await getToken(tokenOptions(request));
      const user = token?.id ? await resolveSessionUser(token) : null;
      return reply({ enabled: Boolean(user), reason: user ? null : "authentication_required" });
    } catch { return reply({ enabled: false, reason: "service_unavailable" }); }
  }
  return handle(request, "poll", { receipt: request.nextUrl.searchParams.get("receipt") });
}
export async function POST(request) {
  if (!request.headers.has("authorization") && !trusted(request)) return reply({ state: "failed", reason: "forbidden" }, 403);
  let body;
  try {
    body = await readRequestJson(request, { maxBytes: 4096 });
  } catch (error) { return reply({ state: "failed", reason: "invalid_request" }, error instanceof ApiRouteError ? error.status : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ state: "failed", reason: "invalid_request" }, 400);
  const action = body.action || "create";
  if (!["create", "poll", "renew", "cancel", "nativeGrant", "revokeNativeGrant", "revokeNativeGrants"].includes(action)) return reply({ state: "failed", reason: "invalid_request" }, 400);
  return handle(request, action, body);
}
export async function DELETE(request) {
  if (!trusted(request)) return reply({ state: "failed", reason: "forbidden" }, 403);
  try {
    return handle(request, "cancel", await readRequestJson(request, { maxBytes: 4096 }));
  } catch (error) { return reply({ state: "failed", reason: "invalid_request" }, error instanceof ApiRouteError ? error.status : 400); }
}
