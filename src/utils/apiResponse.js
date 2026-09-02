import { NextResponse } from "next/server";
import {
  API_ERROR_CODES,
  ApiRouteError,
  apiErrorStatus,
  buildApiErrorEnvelope,
  readRequestJson,
} from "./apiResponseCore.mjs";

export { API_ERROR_CODES, ApiRouteError, readRequestJson };

export function apiError(code = "INTERNAL_ERROR", options = {}) {
  const headers = new Headers(options.headers);

  if (options.retryAfter) headers.set("Retry-After", String(options.retryAfter));

  return NextResponse.json(
    buildApiErrorEnvelope(code, options),
    { status: apiErrorStatus(code, options), headers },
  );
}

export function apiSuccess(data = {}, options = {}) {
  const payload = options.preserveShape
    ? { ...data, success: data.success ?? true }
    : {
        success: true,
        message: options.message,
        data,
      };
  return NextResponse.json(payload, { status: options.status || 200, headers: options.headers });
}

export function handleApiError(error, context = "API request") {
  if (error instanceof ApiRouteError) {
    return apiError(error.code, {
      status: error.status,
      title: error.title,
      message: error.publicMessage,
      headers: error.headers,
    });
  }

  const logMessage = error instanceof Error ? error.message : String(error);
  console.error(`${context} failed:`, logMessage);
  return apiError("INTERNAL_ERROR");
}
