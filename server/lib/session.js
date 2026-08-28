export const SESSION_COOKIE = "musicon_session";

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (typeof secret === "string" && secret.trim()) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be configured in production");
  return "musicon-local-development-session-secret";
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 14,
    path: "/",
  };
}

export function setSession(res, userId) {
  res.cookie(SESSION_COOKIE, String(userId), { ...cookieOptions(), signed: true });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export function getSessionUserId(req) {
  return req.signedCookies?.[SESSION_COOKIE] || null;
}