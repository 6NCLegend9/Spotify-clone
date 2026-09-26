import { normalizeYoutubeSearchPurpose } from "./youtubeSearchPurpose.mjs";

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeSearchRequestKey({ purpose = "interactive", query = "" } = {}) {
  return `${normalizeYoutubeSearchPurpose(purpose)}:${normalizeQuery(query)}`;
}

export function createSearchRequestCache({
  ttlMs = 30_000,
  maxEntries = 40,
  now = () => Date.now(),
} = {}) {
  const ttl = Math.max(1, Number(ttlMs) || 30_000);
  const limit = Math.max(1, Math.floor(Number(maxEntries) || 40));
  const entries = new Map();

  const deleteIfSame = (key, promise) => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  };

  const trim = () => {
    while (entries.size > limit) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
  };

  return {
    getOrCreate(key, factory) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) return Promise.resolve().then(factory);

      const currentTime = Number(now()) || 0;
      const existing = entries.get(normalizedKey);
      if (existing && existing.expiresAt > currentTime) return existing.promise;
      if (existing) entries.delete(normalizedKey);

      const promise = Promise.resolve().then(factory);
      entries.set(normalizedKey, {
        promise,
        expiresAt: currentTime + ttl,
      });
      trim();

      promise.catch(() => deleteIfSame(normalizedKey, promise));
      return promise;
    },
    has(key) {
      const entry = entries.get(String(key || "").trim());
      if (!entry) return false;
      if (entry.expiresAt <= (Number(now()) || 0)) {
        entries.delete(String(key || "").trim());
        return false;
      }
      return true;
    },
    size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}

export const interactiveYoutubeSearchCache = createSearchRequestCache({
  ttlMs: 30_000,
  maxEntries: 40,
});
