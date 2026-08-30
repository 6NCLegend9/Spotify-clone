function normalizeUrl(value) {
  const trimmed = (value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getAppUrl(request) {
  return (
    normalizeUrl(process.env.NEXTAUTH_URL) ||
    normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeUrl(process.env.VERCEL_URL) ||
    normalizeUrl(request?.nextUrl?.origin) ||
    "http://localhost:3000"
  );
}
