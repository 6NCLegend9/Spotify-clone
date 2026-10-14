import { readRequestJson, ApiRouteError } from "@/utils/apiResponseCore.mjs";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { tokenOptions } from "@/utils/authToken";
import { resolveSessionUser } from "@/utils/sessionAuth";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { mediaServiceConfig, validateMediaRequest, callMediaService, normalizeMediaResult } from "@/utils/mediaService.mjs";
import { signMediaReceipt, verifyMediaReceipt, mediaScopeHash, newGuestIdentity } from "@/utils/mediaReceipts.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;
const COOKIE = "heykasa-media-guest";
const HEADERS = { "Cache-Control": "private, no-store" };
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: HEADERS });

function trusted(request) {
  if (isTrustedRequestOrigin(request)) return true;
  const origin = request.headers.get("origin");
  if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) return true;
  return process.env.NODE_ENV !== "production" && origin === request.nextUrl.origin;
}
async function handle(request, action, body) {
  const config = mediaServiceConfig();
  if (!config.enabled) return reply({ state: "failed", reason: "service_unconfigured" }, 503);
  try {
    const token = await getToken(tokenOptions(request));
    const user = token?.id ? await resolveSessionUser(token) : null;
    const guest = verifyMediaReceipt(request.cookies.get(COOKIE)?.value, null, config.secret);
    const identity = guest && /^[a-f0-9]{48}$/.test(guest.id || "") ? { id: guest.id } : newGuestIdentity(config.secret);
    const scope = mediaScopeHash(user ? `account:${user.id}:${token.sessionVersion}` : `guest:${identity.id}`, config.secret);
    let subscriber;
    const limits = action === "create" ? { max: 12, windowMs: 60_000 } : { max: 100, windowMs: 60_000 };
    const rate = await isRateLimited(`media:${action === "create" ? "create" : "poll"}:${getClientKey(request)}:${scope}`, limits);
    const clientRate = await isRateLimited(`media:client:${getClientKey(request)}`, { max: 140, windowMs: 60_000 });
    if (rate.limited || clientRate.limited) return reply({ state: "failed", reason: "rate_limited" }, 429);
    let result, selection;
    if (action === "create") {
      subscriber = mediaScopeHash(`subscriber:${scope}:${randomUUID()}`, config.secret);
      selection = validateMediaRequest(body);
      if (!selection) return reply({ state: "failed", reason: "invalid_request" }, 400);
      result = await callMediaService(config, "/v1/jobs", { method: "POST", body: selection, subscriber });
    } else {
      const receipt = verifyMediaReceipt(body?.receipt, scope, config.secret);
      if (!receipt || !/^[a-f0-9]{32}$/.test(receipt.jobId || "") || !validateMediaRequest(receipt.selection) || !/^[a-f0-9]{64}$/.test(receipt.subscriber || "")) return reply({ state: "failed", reason: "invalid_receipt" }, 403);
      selection = receipt.selection;
      subscriber = receipt.subscriber;
      result = await callMediaService(config, `/v1/jobs/${receipt.jobId}${action === "renew" ? "/renew" : ""}`, { method: action === "cancel" ? "DELETE" : action === "renew" ? "POST" : "GET", subscriber });
    }
    const response = action === "cancel" ? reply({ cancelled: true }) : reply({ ...normalizeMediaResult(result, config), receipt: signMediaReceipt({ scope, subscriber, jobId: result.jobId, selection, expiresAt: Date.now() + 4 * 3600_000 }, config.secret) });
    if (!user && identity.cookie) response.cookies.set(COOKIE, identity.cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 86400 });
    return response;
  } catch { return reply({ state: "failed", reason: "service_unavailable" }, 503); }
}
export async function GET(request) {
  if (!request.nextUrl.searchParams.has("receipt")) return reply({ enabled: mediaServiceConfig().enabled });
  return handle(request, "poll", { receipt: request.nextUrl.searchParams.get("receipt") });
}
export async function POST(request) {
  if (!trusted(request)) return reply({ state: "failed", reason: "forbidden" }, 403);
  let body;
  try {
    body = await readRequestJson(request, { maxBytes: 4096 });
  } catch (error) { return reply({ state: "failed", reason: "invalid_request" }, error instanceof ApiRouteError ? error.status : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ state: "failed", reason: "invalid_request" }, 400);
  const action = body.action || "create";
  if (!["create", "poll", "renew", "cancel"].includes(action)) return reply({ state: "failed", reason: "invalid_request" }, 400);
  return handle(request, action, body);
}
export async function DELETE(request) {
  if (!trusted(request)) return reply({ state: "failed", reason: "forbidden" }, 403);
  try {
    return handle(request, "cancel", await readRequestJson(request, { maxBytes: 4096 }));
  } catch (error) { return reply({ state: "failed", reason: "invalid_request" }, error instanceof ApiRouteError ? error.status : 400); }
}
