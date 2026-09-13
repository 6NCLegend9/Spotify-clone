import {
  PRODUCTION_SITE_URL,
  isLocalAppOrigin,
  normalizeAppOrigin,
} from "@/utils/appOrigin.mjs";
import { trustedAppOrigins } from "@/utils/trustedOrigin";

function configuredLocalOrigin() {
  for (const value of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
  ]) {
    const origin = normalizeAppOrigin(value, { allowLocalHttp: true });
    if (origin && isLocalAppOrigin(origin)) return origin;
  }
  return "";
}

function localRequestOrigin(request) {
  if (process.env.NODE_ENV === "production") return "";

  try {
    const value =
      request?.nextUrl?.origin
      || (request?.url ? new URL(request.url).origin : "");
    const origin = normalizeAppOrigin(value, { allowLocalHttp: true });
    return isLocalAppOrigin(origin) && trustedAppOrigins().has(origin)
      ? origin
      : "";
  } catch {
    return "";
  }
}

export function getAppUrl(request) {
  if (process.env.NODE_ENV === "production") return PRODUCTION_SITE_URL;
  return localRequestOrigin(request) || configuredLocalOrigin() || "http://localhost:3000";
}

export function getAppLink(pathname, request) {
  const publicBaseUrl = normalizeAppOrigin(getAppUrl(request), {
    allowLocalHttp: process.env.NODE_ENV !== "production",
  }) || PRODUCTION_SITE_URL;
  return new URL(pathname, `${publicBaseUrl}/`).href;
}

export function getPublicAssetUrl(pathname, request) {
  return getAppLink(pathname, request);
}
