import { createUserError, toUserError } from "../utils/userError.js";
import { recordDiagnostic } from "../utils/diagnostics.mjs";

const DEFAULT_TIMEOUT = 15000;

function abortReason(signal) {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error("Request cancelled");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal.aborted) throw abortReason(signal);
}

function waitForRetry(delay, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchWithRecovery(url, options, retry) {
  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(options.signal);
    try {
      const response = await fetch(url, options);
      if (!retry || attempt >= 2 || ![502, 503, 504].includes(response.status)
        || response.headers.has("retry-after")) return response;
      await response.body?.cancel();
    } catch (error) {
      if (!retry || attempt >= 2 || options.signal.aborted || !(error instanceof TypeError)) throw error;
    }
    await waitForRetry(250 * (2 ** attempt), options.signal);
  }
}

function codeForStatus(status) {
  if (status === 400 || status === 422) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 502 || status === 503) return "UNAVAILABLE";
  if (status === 504) return "TIMEOUT";
  return "INTERNAL_ERROR";
}

async function parseResponseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const clientCache = new Map();
let cacheGeneration = 0;
const CACHEABLE_GET_ROUTES = [
  "/api/genres",
];
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateClientCache(urlPattern) {
  cacheGeneration += 1;
  if (!urlPattern) {
    clientCache.clear();
    return;
  }
  for (const key of clientCache.keys()) {
    if (key.includes(urlPattern)) clientCache.delete(key);
  }
}

export async function requestJson(url, options = {}) {
  const startedAt = performance.now();
  const {
    body,
    timeout = DEFAULT_TIMEOUT,
    fallbackCode,
    fallbackTitle,
    fallbackMessage,
    headers,
    signal,
    useCache = true,
    retry = true,
    ...fetchOptions
  } = options;

  const method = (fetchOptions.method || "GET").toUpperCase();
  const requestGeneration = cacheGeneration;
  const isGet = method === "GET" && body === undefined;
  const pathname = String(url).split(/[?#]/, 1)[0];
  const isCacheable = useCache && isGet && CACHEABLE_GET_ROUTES.includes(pathname);

  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");

  if (isCacheable && clientCache.has(url)) {
    const cached = clientCache.get(url);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    clientCache.delete(url);
  }

  const controller = new AbortController();
  const timeoutId = timeout > 0
    ? setTimeout(() => controller.abort("timeout"), timeout)
    : null;
  const forwardAbort = () => controller.abort(signal?.reason);

  if (signal) {
    if (signal.aborted) forwardAbort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const response = await fetchWithRecovery(url, {
      ...fetchOptions,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined
        ? fetchOptions.body
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
      signal: controller.signal,
    }, isGet && retry);
    const data = await parseResponseBody(response);
    recordDiagnostic("request", { route: url, durationMs: performance.now() - startedAt, status: response.status,
      requestId: response.headers.get("x-request-id") });

    if (!response.ok) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      throw createUserError(data?.code || fallbackCode || codeForStatus(response.status), {
        status: response.status,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
        title: data?.title || fallbackTitle,
        message: data?.message || fallbackMessage,
      });
    }

    const cacheDirectives = (response.headers.get("cache-control") || "")
      .toLowerCase().split(",").map((value) => value.trim().split("=")[0]);
    const isPublicResponse = cacheDirectives.includes("public")
      && !cacheDirectives.some((value) => ["private", "no-store", "no-cache"].includes(value));
    if (isCacheable && isPublicResponse && data && requestGeneration === cacheGeneration) {
      clientCache.set(url, { timestamp: Date.now(), data });
    } else if (!isGet) {
      invalidateClientCache();
    }

    return data;
  } catch (error) {
    if (!signal?.aborted) recordDiagnostic("request", { route: url, durationMs: performance.now() - startedAt,
      code: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR" });
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (error instanceof Error && error.name === "UserFacingError") throw error;
    const timedOut = controller.signal.aborted && !signal?.aborted;
    throw toUserError(error, {
      status: error?.status,
      title: fallbackTitle,
      message: fallbackMessage,
      ...(timedOut ? { fallbackCode: "TIMEOUT" } : {}),
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export function isUserError(error, code) {
  return error?.name === "UserFacingError" && (!code || error.code === code);
}
