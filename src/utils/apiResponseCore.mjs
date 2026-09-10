export const API_ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
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
    message: "A service HeyKasa depends on is temporarily unavailable.",
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

export async function readRequestJson(request, options = {}) {
  const body = await request.json().catch(() => {
    throw new ApiRouteError("VALIDATION_ERROR", {
      message: options.message || "The request body must be valid JSON.",
    });
  });
  const validObject = body && typeof body === "object" && !Array.isArray(body);
  if (!validObject && options.allowPrimitive !== true) {
    throw new ApiRouteError("VALIDATION_ERROR", {
      message: options.message || "The request body must be valid JSON.",
    });
  }
  return body;
}
