import crypto from "crypto";
import RateLimit from "@/models/RateLimit";
import dbConnect from "@/utils/dbconnect";

const buckets = new Map();
const MAX_BUCKETS = 10_000;

function hashKey(key) {
  const secret = (
    process.env.RATE_LIMIT_SECRET
    || process.env.NEXTAUTH_SECRET
    || process.env.JWT_SECRET
    || "local-rate-limit-secret"
  );
  return crypto
    .createHmac("sha256", secret)
    .update(String(key))
    .digest("hex");
}

function windowDetails(windowMs) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = windowStart + windowMs;
  return {
    now,
    windowStart,
    expiresAt,
    retryAfter: Math.max(1, Math.ceil((expiresAt - now) / 1_000)),
  };
}

function inMemoryRateLimit(keyHash, max, timing) {
  const entry = buckets.get(keyHash);
  if (!entry || timing.now >= entry.expiresAt) {
    if (buckets.size >= MAX_BUCKETS) {
      buckets.delete(buckets.keys().next().value);
    }
    buckets.set(keyHash, { count: 1, expiresAt: timing.expiresAt });
    return {
      limited: false,
      remaining: Math.max(0, max - 1),
      retryAfter: timing.retryAfter,
    };
  }

  entry.count += 1;
  return {
    limited: entry.count > max,
    remaining: Math.max(0, max - entry.count),
    retryAfter: timing.retryAfter,
  };
}

export async function isRateLimited(key, { windowMs = 60_000, max = 20 } = {}) {
  const safeWindowMs = Math.max(1_000, Math.floor(windowMs));
  const safeMax = Math.max(1, Math.floor(max));
  const keyHash = hashKey(key);
  const timing = windowDetails(safeWindowMs);

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return inMemoryRateLimit(keyHash, safeMax, timing);
  }

  await dbConnect();
  const filter = {
    keyHash,
    windowStart: new Date(timing.windowStart),
  };
  let bucket;
  try {
    bucket = await RateLimit.findOneAndUpdate(
      filter,
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(timing.expiresAt) },
      },
      {
        upsert: true,
        new: true,
      },
    ).select("count").lean();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    bucket = await RateLimit.findOneAndUpdate(
      filter,
      { $inc: { count: 1 } },
      { new: true },
    ).select("count").lean();
    if (!bucket) throw error;
  }

  const count = bucket?.count || 1;
  return {
    limited: count > safeMax,
    remaining: Math.max(0, safeMax - count),
    retryAfter: timing.retryAfter,
  };
}

export function getClientKey(request) {
  const client =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const pathname = request.nextUrl?.pathname || "request";
  return `${pathname}:${client}`;
}
