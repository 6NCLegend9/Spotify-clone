const QUOTA_ERROR_REASONS = new Set([
  "quotaExceeded",
  "dailyLimitExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

// Supports YOUTUBE_API_KEYS="key1,key2,key3" for quota rotation, falling back to the
// single-key YOUTUBE_API_KEY env var for backward compatibility.
function getApiKeys() {
  const raw = process.env.YOUTUBE_API_KEYS || process.env.YOUTUBE_API_KEY || "";
  return raw.split(",").map((key) => key.trim()).filter(Boolean);
}

function isQuotaError(status, data) {
  if (status === 429) return true;
  if (status !== 403) return false;
  const reason = data?.error?.errors?.[0]?.reason;
  return QUOTA_ERROR_REASONS.has(reason);
}

export function hasYouTubeApiKey() {
  return getApiKeys().length > 0;
}

// Calls a YouTube Data API v3 endpoint, rotating through configured keys whenever one
// is quota-exhausted or rate-limited so a single key running out doesn't take a feature down.
export async function youtubeFetch(endpoint, params, fetchOptions) {
  const keys = getApiKeys();
  if (keys.length === 0) return { ok: false, status: 503, data: null };

  let lastResult = { ok: false, status: 503, data: null };
  for (const key of keys) {
    const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${new URLSearchParams({ ...params, key })}`;
    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error) {
      lastResult = { ok: false, status: 502, data: null };
      continue;
    }
    const data = await response.json().catch(() => null);
    lastResult = { ok: response.ok, status: response.status, data };
    if (response.ok || !isQuotaError(response.status, data)) return lastResult;
    // else: this key is exhausted/rate-limited, fall through and try the next one
  }
  return lastResult;
}
