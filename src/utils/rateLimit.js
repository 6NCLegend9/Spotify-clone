const buckets = new Map();

// Best-effort per-instance limiter: not perfectly accurate across multiple
// serverless regions/cold starts, but meaningfully blocks a single client from
// burning through shared YouTube API quota with rapid repeat requests, without
// needing external infrastructure like Redis.
export function isRateLimited(key, { windowMs = 60_000, max = 20 } = {}) {
  if (process.env.NODE_ENV === "development") return false;
  
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

export function getClientKey(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
