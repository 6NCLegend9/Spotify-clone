import { NextResponse } from "next/server";
import {
  LEGACY_SITE_ORIGINS,
  PRODUCTION_SITE_URL,
} from "./utils/appOrigin.mjs";

const LEGACY_HOSTS = new Set(
  [...LEGACY_SITE_ORIGINS].map((origin) => new URL(origin).host),
);

export function middleware(request) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase();
  const requestHost = forwardedHost || request.nextUrl.host.toLowerCase();
  if (!LEGACY_HOSTS.has(requestHost)) return NextResponse.next();

  const destination = request.nextUrl.clone();
  const canonical = new URL(PRODUCTION_SITE_URL);
  destination.protocol = canonical.protocol;
  destination.host = canonical.host;
  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon-|manifest.webmanifest|sw.js).*)",
  ],
};
