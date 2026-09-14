import { createECDH, createHash, createPrivateKey, createPublicKey, randomUUID, sign } from "node:crypto";
import { authSecret } from "./authToken";

// Domain-separated key derivation lets server instances share an EC signing key
// without exposing the authentication secret or requiring a browser-side secret.
function signingKey() {
  const secret = authSecret();
  if (!secret) throw new Error("Jam signing is not configured");
  const hash = createHash("sha256").update(`heykasa:jam-signing:v1:${secret}`).digest("hex");
  const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const scalar = (BigInt(`0x${hash}`) % (order - 1n) + 1n).toString(16).padStart(64, "0");
  const d = Buffer.from(scalar, "hex");
  const curve = createECDH("prime256v1");
  curve.setPrivateKey(d);
  const point = curve.getPublicKey();
  return createPrivateKey({ format: "jwk", key: {
    kty: "EC", crv: "P-256", d: d.toString("base64url"),
    x: point.subarray(1, 33).toString("base64url"),
    y: point.subarray(33).toString("base64url"),
  } });
}
export function jamPublicKey() {
  return createPublicKey(signingKey()).export({ format: "jwk" });
}
export function signJamEvent({ roomId, event, senderId, role, payload }) {
  const message = JSON.stringify({ roomId, event, senderId, role, payload, at: Date.now(), id: randomUUID() });
  const signature = sign("sha256", Buffer.from(message), { key: signingKey(), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return { message, signature };
}
