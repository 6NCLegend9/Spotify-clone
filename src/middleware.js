import { NextResponse } from "next/server";
import {
  LEGACY_SITE_ORIGINS,
  PRODUCTION_SITE_URL,
} from "./utils/appOrigin.mjs";
import { isEmbedPath } from "./utils/embedPaths.mjs";

const LEGACY_HOSTS = new Set(
  [...LEGACY_SITE_ORIGINS].map((origin) => new URL(origin).host),
);

export function middleware(request) {
  const requestHeaders = new Headers(request.headers);
  if (isEmbedPath(request.nextUrl.pathname)) {
    requestHeaders.set("x-kasa-embed", "1");
  }

  if (process.env.NODE_ENV === "production") {
    const forwardedHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim()
      ?.toLowerCase();
    const requestHost = forwardedHost || request.nextUrl.host.toLowerCase();
    if (LEGACY_HOSTS.has(requestHost)) {
      const destination = request.nextUrl.clone();
      const canonical = new URL(PRODUCTION_SITE_URL);
      destination.protocol = canonical.protocol;
      destination.host = canonical.host;
      return NextResponse.redirect(destination, 308);
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon-|manifest.webmanifest|sw.js).*)",
  ],
};
