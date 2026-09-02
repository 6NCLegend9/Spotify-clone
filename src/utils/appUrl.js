import {
  PRODUCTION_SITE_URL,
  normalizeAppUrl,
} from "@/utils/siteConfig";

export function getAppUrl(request) {
  const configuredUrl =
    normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeAppUrl(process.env.NEXTAUTH_URL);

  if (configuredUrl) return configuredUrl;

  if (process.env.NODE_ENV !== "production") {
    return (
      normalizeAppUrl(request?.nextUrl?.origin, { allowHttp: true }) ||
      "http://localhost:3000"
    );
  }

  return PRODUCTION_SITE_URL;
}

export function getPublicAssetUrl(pathname, request) {
  const publicBaseUrl =
    normalizeAppUrl(getAppUrl(request))
    || PRODUCTION_SITE_URL;
  const assetUrl = new URL(pathname, `${publicBaseUrl}/`);
  return assetUrl.href;
}
