import { AUTH_CODES } from "./authErrors.js";
import {
  USER_ERROR_CATALOG,
  USER_ERROR_CODES,
  normalizeUserErrorCode,
  safeUserErrorOverride,
} from "./userErrorMapping.mjs";

export { USER_ERROR_CODES };

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export class UserFacingError extends Error {
  constructor(code = "UNKNOWN", options = {}) {
    const normalizedCode = normalizeUserErrorCode(code, options.status);
    const defaults = USER_ERROR_CATALOG[normalizedCode] || USER_ERROR_CATALOG.UNKNOWN;
    const message = safeUserErrorOverride(options.message) || defaults.message;
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "UserFacingError";
    this.code = normalizedCode;
    this.title = safeUserErrorOverride(options.title) || defaults.title;
    this.retryable = options.retryable ?? defaults.retryable;
    this.action = options.action || defaults.action;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.public = true;
  }
}

export function createUserError(code, options = {}) {
  return new UserFacingError(code, options);
}

export function toUserError(error, options = {}) {
  if (error instanceof UserFacingError) return error;

  if (isOffline()) {
    return createUserError("OFFLINE", { ...options, cause: error });
  }

  if (error?.name === "AbortError" || error?.code === "ABORT_ERR") {
    return createUserError("TIMEOUT", { ...options, cause: error });
  }

  const authCode = typeof error === "string" ? error : error?.code;
  if (authCode && AUTH_CODES[authCode]) {
    return createUserError(
      authCode === "AccessDenied" ? "FORBIDDEN" : "UNAUTHORIZED",
      {
        ...options,
        title: AUTH_CODES[authCode].title,
        message: AUTH_CODES[authCode].message,
        cause: error,
      },
    );
  }

  const status = Number(error?.status || error?.response?.status) || undefined;
  const code = normalizeUserErrorCode(
    error?.code || error?.data?.code || options.fallbackCode,
    status,
  );
  const looksLikeNetworkFailure =
    error instanceof TypeError
    || /network|fetch|connection/i.test(String(error?.message || ""));

  return createUserError(
    looksLikeNetworkFailure && code === "UNKNOWN" ? "NETWORK_ERROR" : code,
    {
      ...options,
      status,
      retryAfter: error?.retryAfter,
      cause: error,
    },
  );
}

export function userErrorDetails(error, options = {}) {
  const normalized = toUserError(error, options);
  return {
    code: normalized.code,
    title: normalized.title,
    message: normalized.message,
    retryable: normalized.retryable,
    action: normalized.action,
    status: normalized.status,
    retryAfter: normalized.retryAfter,
  };
}
