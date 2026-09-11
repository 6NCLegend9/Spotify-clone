const ACCOUNT_ID = /^[a-f0-9]{24}$/i;

export function hasSessionIdentity(token) {
  return Boolean(token && typeof token.id === "string" && ACCOUNT_ID.test(token.id)
    && token.sub === token.id
    && Number.isSafeInteger(token.sessionVersion) && token.sessionVersion >= 0);
}

export function isCurrentSession(token, user) {
  if (!hasSessionIdentity(token) || !user?._id || user.isVerified !== true) return false;
  const version = user.sessionVersion ?? 0;
  return Number.isSafeInteger(version) && version >= 0
    && String(user._id) === token.id && version === token.sessionVersion;
}

export function sessionIdentity(user) {
  const id = user?._id?.toString();
  const claims = { id, sub: id, sessionVersion: user?.sessionVersion ?? 0 };
  return isCurrentSession(claims, user) ? claims : null;
}