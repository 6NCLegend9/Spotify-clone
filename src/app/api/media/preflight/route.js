import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { mediaServiceConfig, callMediaService, normalizeMediaResult } from "@/utils/mediaService.mjs";
import { mediaScopeHash } from "@/utils/mediaReceipts.mjs";
import { isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 300;
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// Opt-in preview diagnostic only. No arbitrary source IDs, user sessions, or
// credentials are accepted or returned. Disabled in every production build.
export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.MEDIA_SERVICE_DEPLOYMENT_PROBE !== "1") return reply({ error: "not_found" }, 404);
  const config = mediaServiceConfig();
  if (!config.enabled || !config.internal) return reply({ ready: false, stage: "configuration" }, 503);
  const rate = await isRateLimited("media:deployment-preflight", { max: 1, windowMs: 3600_000 });
  if (rate.limited) return reply({ ready: false, stage: "rate_limit" }, 429);
  config.deliveryOrigin = request.nextUrl.origin;
  const subscriber = mediaScopeHash(`deployment-probe:${randomUUID()}`, config.secret);
  let jobId;
  let stage = "extraction";
  try {
    const value = await callMediaService(config, "/v1/jobs", { method: "POST", subscriber, body: { videoId: "BaW_jenozKc", mode: "audio", maxHeight: 1080, profile: "mp4-aac" } });
    jobId = value.jobId;
    if (value.state !== "ready") return reply({ ready: false, stage, reason: value.reason || "source_unavailable" }, 503);
    const result = normalizeMediaResult(value, config);
    stage = "cross_instance_read";
    const renewed = normalizeMediaResult(await callMediaService(config, `/v1/jobs/${jobId}/renew`, { method: "POST", subscriber }), config);
    stage = "byte_range";
    // Call the service privately while requesting its public signed asset path.
    const asset = new URL(renewed.asset.url);
    const url = new URL(`${asset.pathname.replace(/^\//, "")}${asset.search}`, config.baseUrl);
    const response = await fetch(url, { headers: { Range: "bytes=0-1023" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (response.status !== 206 || bytes.length !== 1024 || !/^bytes 0-1023\/\d+$/.test(response.headers.get("content-range") || "")) throw new Error("range_invalid");
    return reply({ ready: true, extraction: "passed", persistence: "passed", range: "passed", mimeType: result.asset.mimeType, duration: result.asset.duration, bytes: bytes.length });
  } catch { return reply({ ready: false, stage }, 503); }
  finally {
    if (jobId) {
      try { await callMediaService(config, `/v1/jobs/${jobId}`, { method: "DELETE", subscriber }); } catch { /* TTL sweep also bounds interrupted probes. */ }
    }
  }
}
