import { NextResponse } from "next/server";
import { youtubeFetch } from "@/utils/youtubeApi";
import { cleanTitle } from "@/utils/text";
import { isJamCode, normalizeJamCode } from "@/utils/jam.mjs";
import { isRateLimited } from "@/utils/rateLimit";
import {
  ApiRouteError,
  apiError,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 30;
// A YouTube search costs 100 quota units, so the room shares one pool per seed set.
const MAX_SEEDS_PER_REQUEST = 6;
const MAX_OWNERS_PER_SEED = 12;
const RESULTS_PER_SEED = 8;

const poolCache = new Map();

function cacheKey(code, seeds) {
  const signature = seeds
    .map((seed) => `${seed.kind}:${seed.term.toLowerCase()}`)
    .sort()
    .join("|");
  return `${code}::${signature}`;
}

function readCache(key) {
  const entry = poolCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    poolCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  if (poolCache.size >= MAX_CACHE_ENTRIES) {
    poolCache.delete(poolCache.keys().next().value);
  }
  poolCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

function validatedSeeds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiRouteError("VALIDATION_ERROR", { message: "seeds must be a non-empty array." });
  }
  return value.slice(0, MAX_SEEDS_PER_REQUEST).map((seed) => {
    const term = typeof seed?.term === "string" ? seed.term.trim().replace(/\s+/g, " ") : "";
    const kind = seed?.kind === "artist" || seed?.kind === "genre" ? seed.kind : null;
    if (term.length < 2 || term.length > 60 || !kind) {
      throw new ApiRouteError("VALIDATION_ERROR", {
        message: "Each seed needs a term of 2-60 characters and a kind of artist or genre.",
      });
    }
    const owners = (Array.isArray(seed?.owners) ? seed.owners : [])
      .filter((owner) => typeof owner === "string" && owner.trim())
      .slice(0, MAX_OWNERS_PER_SEED)
      .map((owner) => owner.trim().slice(0, 64));
    const ownerNames = (Array.isArray(seed?.ownerNames) ? seed.ownerNames : [])
      .filter((name) => typeof name === "string" && name.trim())
      .slice(0, MAX_OWNERS_PER_SEED)
      .map((name) => name.trim().slice(0, 60));
    if (owners.length === 0) {
      throw new ApiRouteError("VALIDATION_ERROR", { message: "Each seed needs at least one owner." });
    }
    return { term, kind, owners, ownerNames };
  });
}

/** Human-readable attribution shown on every track in the room. */
function seedReason({ term, ownerNames }) {
  const [first, second] = ownerNames;
  if (!first) return `Because the room likes ${term}`;
  if (ownerNames.length === 1) return `Because ${first} listens to ${term}`;
  if (ownerNames.length === 2) return `${first} and ${second} both like ${term}`;
  return `${first}, ${second} and ${ownerNames.length - 2} others like ${term}`;
}

function normalizeVideo(item, seed) {
  return {
    id: item?.id?.videoId,
    title: cleanTitle(item?.snippet?.title || ""),
    channel: cleanTitle(item?.snippet?.channelTitle || ""),
    thumbnail:
      item?.snippet?.thumbnails?.high?.url
      || item?.snippet?.thumbnails?.medium?.url
      || item?.snippet?.thumbnails?.default?.url
      || "",
    seedQuery: seed.term,
    genre: seed.kind === "genre" ? seed.term : "",
    owner: seed.owners[0],
    owners: seed.owners,
    ownerNames: seed.ownerNames,
    reason: seedReason(seed),
  };
}

async function searchSeed(seed) {
  const suffix = seed.kind === "artist" ? "songs" : "music";
  const { ok, status, data } = await youtubeFetch(
    "search",
    {
      part: "snippet",
      type: "video",
      videoCategoryId: "10",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      maxResults: String(RESULTS_PER_SEED),
      q: `${seed.term} ${suffix}`,
    },
    { next: { revalidate: 3600 } },
  );
  if (!ok) {
    const error = new Error(`Seed search failed (${status})`);
    error.status = status;
    throw error;
  }
  return (Array.isArray(data?.items) ? data.items : [])
    .filter((item) => item?.id?.videoId)
    .map((item) => normalizeVideo(item, seed));
}

export async function POST(request) {
  try {
    const { email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`crowd-radio:${email}`, {
      windowMs: 5 * 60_000,
      max: 20,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Kasa Crowd is refreshing too often. Please wait a moment.",
      });
    }

    const body = await readRequestJson(request);
    const code = normalizeJamCode(body?.code);
    if (!isJamCode(code)) {
      throw new ApiRouteError("VALIDATION_ERROR", { message: "A valid room code is required." });
    }
    const seeds = validatedSeeds(body?.seeds);

    const key = cacheKey(code, seeds);
    const cached = readCache(key);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    // One failing seed (quota, network) must not empty the room's station.
    const settled = await Promise.allSettled(seeds.map((seed) => searchSeed(seed)));
    const tracks = settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
    if (tracks.length === 0) {
      const rateLimited = settled.some((entry) => entry.status === "rejected" && entry.reason?.status === 429);
      throw new ApiRouteError(rateLimited ? "RATE_LIMITED" : "BAD_GATEWAY", {
        message: "Kasa Crowd could not reach YouTube right now. Please try again shortly.",
      });
    }

    const value = {
      tracks,
      seeds: seeds.map(({ term, kind, owners, ownerNames }) => ({
        term,
        kind,
        owners,
        ownerNames,
        reason: seedReason({ term, ownerNames }),
      })),
    };
    writeCache(key, value);
    return NextResponse.json({ ...value, cached: false });
  } catch (error) {
    return handleApiError(error, "Kasa Crowd radio");
  }
}
