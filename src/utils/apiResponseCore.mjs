export const API_ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  UNPROCESSABLE: "UNPROCESSABLE",
  BAD_GATEWAY: "BAD_GATEWAY",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

export const DEFAULT_API_ERRORS = {
  PAYLOAD_TOO_LARGE: {
    status: 413,
    title: "Request too large",
    message: "The submitted information exceeds the size limit.",
  },
  VALIDATION_ERROR: {
    status: 400,
    title: "Check your request",
    message: "Some information is missing or invalid.",
  },
  UNAUTHORIZED: {
    status: 401,
    title: "Please log in",
    message: "You must be logged in to continue.",
  },
  FORBIDDEN: {
    status: 403,
    title: "Action not allowed",
    message: "You do not have permission to perform this action.",
  },
  NOT_FOUND: {
    status: 404,
    title: "Not found",
    message: "The requested item could not be found.",
  },
  CONFLICT: {
    status: 409,
    title: "Already exists",
    message: "That item already exists.",
  },
  RATE_LIMITED: {
    status: 429,
    title: "Too many requests",
    message: "Please wait a moment before trying again.",
  },
  UNPROCESSABLE: {
    status: 422,
    title: "Check your details",
    message: "The submitted information could not be processed.",
  },
  BAD_GATEWAY: {
    status: 502,
    title: "Service unavailable",
    message: "A service HayKasa depends on is temporarily unavailable.",
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    title: "Temporarily unavailable",
    message: "This service is temporarily unavailable.",
  },
  INTERNAL_ERROR: {
    status: 500,
    title: "Something went wrong",
    message: "We could not complete your request. Please try again.",
  },
};

export class ApiRouteError extends Error {
  constructor(code, options = {}) {
    const defaults = DEFAULT_API_ERRORS[code] || DEFAULT_API_ERRORS.INTERNAL_ERROR;
    super(options.message || defaults.message);
    this.name = "ApiRouteError";
    this.code = code || "INTERNAL_ERROR";
    this.status = options.status || defaults.status;
    this.title = options.title || defaults.title;
    this.publicMessage = options.message || defaults.message;
    this.headers = options.headers;
  }
}

export function buildApiErrorEnvelope(code = "INTERNAL_ERROR", options = {}) {
  const defaults = DEFAULT_API_ERRORS[code] || DEFAULT_API_ERRORS.INTERNAL_ERROR;
  const message = options.message || defaults.message;
  return {
    success: false,
    code,
    title: options.title || defaults.title,
    message,
    error: message,
    data: null,
    ...(options.details ? { details: options.details } : {}),
  };
}

export function apiErrorStatus(code = "INTERNAL_ERROR", options = {}) {
  const defaults = DEFAULT_API_ERRORS[code] || DEFAULT_API_ERRORS.INTERNAL_ERROR;
  return options.status || defaults.status;
}

export async function readRequestText(request, { maxBytes = 64 * 1024 } = {}) {
  const length = request.headers?.get?.("content-length");
  if (length !== null && length !== undefined && (!/^\d{1,10}$/.test(length) || Number(length) > maxBytes)) {
    await request.body?.cancel().catch(() => {});
    throw new ApiRouteError("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  let complete = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  request.signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (request.signal?.aborted) throw new Error("Request cancelled");
      const { value, done } = await reader.read();
      if (request.signal?.aborted) throw new Error("Request cancelled");
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > maxBytes) throw new ApiRouteError("PAYLOAD_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof ApiRouteError) throw error;
    throw new ApiRouteError("VALIDATION_ERROR", { message: "The request body could not be read." });
  } finally {
    request.signal?.removeEventListener("abort", abort);
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readRequestJson(request, options = {}) {
  let body;
  try {
    body = JSON.parse(await readRequestText(request, options));
  } catch (error) {
    if (error instanceof ApiRouteError) throw error;
    throw new ApiRouteError("VALIDATION_ERROR", {
      message: options.message || "The request body must be valid JSON.",
    });
  }
  const validObject = body && typeof body === "object" && !Array.isArray(body);
  if (!validObject && options.allowPrimitive !== true) {
    throw new ApiRouteError("VALIDATION_ERROR", {
      message: options.message || "The request body must be valid JSON.",
    });
  }
  return body;
}
