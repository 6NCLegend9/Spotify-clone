export const USER_ERROR_CODES = {
  OFFLINE: "OFFLINE",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  UNAVAILABLE: "UNAVAILABLE",
  PLAYBACK_ERROR: "PLAYBACK_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN: "UNKNOWN",
};

export const USER_ERROR_CATALOG = {
  OFFLINE: {
    title: "You’re offline",
    message: "Check your internet connection, then try again.",
    retryable: true,
  },
  NETWORK_ERROR: {
    title: "Connection interrupted",
    message: "We couldn’t reach HeyKasa. Check your connection and try again.",
    retryable: true,
  },
  TIMEOUT: {
    title: "This is taking too long",
    message: "The request timed out. Please try again.",
    retryable: true,
  },
  UNAUTHORIZED: {
    title: "Please log in",
    message: "Log in to continue with this action.",
    retryable: false,
    action: "login",
  },
  FORBIDDEN: {
    title: "You can’t do that",
    message: "Your account doesn’t have permission to perform this action.",
    retryable: false,
  },
  NOT_FOUND: {
    title: "We couldn’t find that",
    message: "It may have been removed or is no longer available.",
    retryable: false,
  },
  VALIDATION_ERROR: {
    title: "Check your details",
    message: "Some information is missing or invalid. Review it and try again.",
    retryable: false,
  },
  CONFLICT: {
    title: "That already exists",
    message: "Use a different value or refresh to see the latest version.",
    retryable: false,
  },
  RATE_LIMITED: {
    title: "Please slow down",
    message: "There have been too many requests. Wait a moment, then try again.",
    retryable: true,
  },
  UNAVAILABLE: {
    title: "Temporarily unavailable",
    message: "This service is unavailable right now. Please try again shortly.",
    retryable: true,
  },
  PLAYBACK_ERROR: {
    title: "This track can’t play",
    message: "The source may be unavailable. Try again or skip to another track.",
    retryable: true,
  },
  INTERNAL_ERROR: {
    title: "Something went wrong",
    message: "We couldn’t complete that request. Please try again.",
    retryable: true,
  },
  UNKNOWN: {
    title: "Something went wrong",
    message: "We couldn’t complete that request. Please try again.",
    retryable: true,
  },
};

const CODE_ALIASES = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION_ERROR",
  429: "RATE_LIMITED",
  502: "UNAVAILABLE",
  503: "UNAVAILABLE",
  504: "TIMEOUT",
  BAD_REQUEST: "VALIDATION_ERROR",
  INVALID_REQUEST: "VALIDATION_ERROR",
  UNPROCESSABLE: "VALIDATION_ERROR",
  AUTH_REQUIRED: "UNAUTHORIZED",
  CREDENTIALSSIGNIN: "UNAUTHORIZED",
  ACCESSDENIED: "FORBIDDEN",
  BAD_GATEWAY: "UNAVAILABLE",
  SERVICE_UNAVAILABLE: "UNAVAILABLE",
  FETCH_ERROR: "NETWORK_ERROR",
  ABORT_ERROR: "TIMEOUT",
};

const TECHNICAL_MESSAGE =
  /(?:Mongo(?:Server)?Error|Mongoose|Prisma|ECONN|ENOTFOUND|EAI_AGAIN|Unexpected token|SyntaxError|TypeError|stack|node_modules|Cast to ObjectId|Internal Server Error|Failed to fetch|fetch failed|at\s+\S+\s+\([^)]+:\d+:\d+\))/i;

export function normalizeUserErrorCode(code, status) {
  const raw = String(code || status || "UNKNOWN").trim();
  const upper = raw.replace(/[-\s]/g, "_").toUpperCase();
  return USER_ERROR_CATALOG[upper]
    ? upper
    : CODE_ALIASES[upper] || CODE_ALIASES[status] || "UNKNOWN";
}

export function safeUserErrorOverride(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 220 || TECHNICAL_MESSAGE.test(trimmed)) return "";
  return trimmed;
}
