const AUTH_PATH =
  /^\/(?:login|signup|resend-verification|reset-password|verify-email)(?:\/|$)/;

export function isAuthPath(pathname) {
  return AUTH_PATH.test(String(pathname || "").split("?")[0]);
}
