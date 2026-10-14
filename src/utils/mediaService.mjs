import { createHmac } from "node:crypto";

export function mediaServiceConfig(env = process.env) {
  const internal = String(env.MEDIA_SERVICE_INTERNAL_URL || "").trim();
  const raw = internal || String(env.MEDIA_SERVICE_URL || "").trim();
  const apiKey = internal && (env.JWT_SECRET || "").length >= 32
    ? createHmac("sha256", env.JWT_SECRET).update("HayKasa/media-service/api/v1").digest("hex")
    : env.MEDIA_SERVICE_API_KEY || "";
  const secret = env.MEDIA_RECEIPT_SECRET || env.NEXTAUTH_SECRET || env.JWT_SECRET || "";
  if (!raw) return { enabled: false, origin: "", apiKey, secret };
  try {
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:" && env.NODE_ENV !== "production")) || url.username || url.password || url.search || url.hash || (!internal && !["", "/"].includes(url.pathname))) throw new Error();
    return { enabled: apiKey.length >= 32 && secret.length >= 32, origin: url.origin, baseUrl: internal ? `${url.href.replace(/\/$/, "")}/` : `${url.origin}/`, internal: Boolean(internal), apiKey, secret };
  } catch { return { enabled: false, origin: "", apiKey, secret }; }
}
export function validateMediaRequest(body) {
  if (!body || typeof body.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(body.videoId || "") || !["audio", "video"].includes(body.mode) || ![1080, 1440, 2160].includes(body.maxHeight) || !["webm-opus", "mp4-aac"].includes(body.profile)) return null;
  return { videoId: body.videoId, mode: body.mode, maxHeight: body.maxHeight, profile: body.profile };
}
export async function callMediaService(config, path, { method = "GET", body, subscriber }) {
  const response = await fetch(new URL(path.replace(/^\//, ""), config.baseUrl || `${config.origin}/`), {
    method, signal: AbortSignal.timeout(config.internal && method === "POST" && (path === "/v1/jobs" || path === "/v1/probes/storage") ? 240_000 : 8000), cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${config.apiKey}`, "X-Media-Subscriber": subscriber, "Content-Type": "application/json", ...(config.internal ? { "X-Media-Public-Origin": config.deliveryOrigin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = new Error("Media service unavailable");
    error.status = response.status;
    throw error;
  }
  const raw = await response.text();
  if (raw.length > 64_000) throw new Error("Media response too large");
  return JSON.parse(raw);
}
export function normalizeMediaResult(value, config) {
  if (!/^[a-f0-9]{32}$/.test(value?.jobId || "") || !["pending", "ready", "failed"].includes(value?.state)) throw new Error("Invalid media response");
  const result = { jobId: value.jobId, state: value.state };
  if (value.state === "failed") result.reason = "source_unavailable";
  if (value.state === "ready") {
    const asset = value.asset;
    const url = new URL(asset?.url || "");
    if (url.origin !== (config.deliveryOrigin || config.origin) || !/^\/v1\/assets\/[a-f0-9]{32}$/.test(url.pathname) || url.username || url.password || url.hash || !Number.isFinite(asset.expiresAt) || asset.expiresAt <= Date.now() || !Number.isFinite(asset.duration) || asset.duration <= 0 || asset.duration > 1801 || !["audio/webm", "video/webm", "audio/mp4", "video/mp4"].includes(asset.mimeType) || !["opus", "aac", "vp9/opus", "h264/aac"].includes(asset.codec)) throw new Error("Invalid media asset");
    const bitrate = (n) => Number.isFinite(n) && n > 0 && n < 2000 ? n : null;
    const height = (n) => Number.isInteger(n) && n > 0 && n <= 2160 ? n : null;
    result.asset = { url: url.href, expiresAt: asset.expiresAt, mimeType: asset.mimeType, duration: asset.duration, codec: asset.codec, audioBitrateKbps: bitrate(asset.audioBitrateKbps), height: height(asset.height) };
    result.qualities = (Array.isArray(value.qualities) ? value.qualities : []).slice(0, 20).map((q) => ({ height: height(q.height), codec: ["vp9/opus", "h264/aac"].includes(q.codec) ? q.codec : "", audioBitrateKbps: bitrate(q.audioBitrateKbps) })).filter((q) => q.height && q.codec);
  }
  return result;
}
