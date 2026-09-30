import { normalizeYoutubeSearchPurpose } from "./youtubeSearchPurpose.mjs";

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("Request cancelled");
  error.name = "AbortError";
  return error;
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

  const deleteIfSame = (key, entry) => {
    if (entries.get(key) === entry) entries.delete(key);
  };

  const trim = () => {
    while (entries.size > limit) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
  };

  const maybeAbortUnused = (key, entry) => {
    if (entry.settled || entry.consumers > 0) return;
    deleteIfSame(key, entry);
    entry.controller.abort();
  };

  const consume = (key, entry, signal) => {
    if (signal?.aborted) {
      maybeAbortUnused(key, entry);
      return Promise.reject(abortError(signal));
    }

    entry.consumers += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener("abort", onAbort);
        entry.consumers = Math.max(0, entry.consumers - 1);
        maybeAbortUnused(key, entry);
        return true;
      };
      const onAbort = () => {
        if (!finish()) return;
        reject(abortError(signal));
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      entry.promise.then(
        (value) => {
          if (!finish()) return;
          resolve(value);
        },
        (error) => {
          if (!finish()) return;
          reject(error);
        },
      );
    });
  };

  return {
    getOrCreate(key, factory, { signal } = {}) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        if (signal?.aborted) return Promise.reject(abortError(signal));
        return Promise.resolve().then(() => factory?.(signal));
      }

      const currentTime = Number(now()) || 0;
      let entry = entries.get(normalizedKey);
      if (entry && entry.expiresAt <= currentTime) {
        entries.delete(normalizedKey);
        entry = null;
      }

      if (!entry) {
        const controller = new AbortController();
        entry = {
          controller,
          consumers: 0,
          settled: false,
          expiresAt: currentTime + ttl,
          promise: null,
        };
        entry.promise = Promise.resolve().then(() => factory(controller.signal));
        entries.set(normalizedKey, entry);
        trim();

        entry.promise.then(
          () => {
            entry.settled = true;
          },
          () => {
            entry.settled = true;
            deleteIfSame(normalizedKey, entry);
          },
        );
      }

      return consume(normalizedKey, entry, signal);
    },
    has(key) {
      const normalizedKey = String(key || "").trim();
      const entry = entries.get(normalizedKey);
      if (!entry) return false;
      if (entry.expiresAt <= (Number(now()) || 0)) {
        entries.delete(normalizedKey);
        return false;
      }
      return true;
    },
    size() {
      return entries.size;
    },
    clear() {
      for (const entry of entries.values()) {
        if (!entry.settled) entry.controller.abort();
      }
      entries.clear();
    },
  };
}

export const interactiveYoutubeSearchCache = createSearchRequestCache({
  ttlMs: 30_000,
  maxEntries: 40,
});
