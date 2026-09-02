import { createUserError, toUserError } from "@/utils/userError";

const DEFAULT_TIMEOUT = 15000;

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

export async function requestJson(url, options = {}) {
  const {
    body,
    timeout = DEFAULT_TIMEOUT,
    fallbackCode,
    fallbackTitle,
    fallbackMessage,
    headers,
    signal,
    ...fetchOptions
  } = options;
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
    const response = await fetch(url, {
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
    });
    const data = await parseResponseBody(response);

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

    return data;
  } catch (error) {
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
