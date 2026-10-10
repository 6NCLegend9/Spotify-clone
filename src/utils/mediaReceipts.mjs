import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
export const mediaScopeHash = (value, secret) => createHmac("sha256", secret).update(value).digest("hex");
export function signMediaReceipt(payload, secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Media signing unavailable");
  const data = encode(payload);
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
export function verifyMediaReceipt(token, scope, secret) {
  if (typeof token !== "string" || token.length > 2048 || !secret || secret.length < 32) return null;
  const [data, supplied, extra] = token.split(".");
  if (!data || !supplied || extra) return null;
  const expected = createHmac("sha256", secret).update(data).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now() || payload.expiresAt > Date.now() + 25 * 3600_000 || (scope !== null && payload.scope !== scope)) return null;
    return payload;
  } catch { return null; }
}
export function newGuestIdentity(secret) {
  const id = randomBytes(24).toString("hex");
  return { id, cookie: signMediaReceipt({ id, expiresAt: Date.now() + 24 * 3600_000 }, secret) };
}
