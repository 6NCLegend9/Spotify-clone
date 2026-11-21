import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import NativePlaybackGrant from "@/models/NativePlaybackGrant";
import dbConnect from "@/utils/dbconnect";
import { mediaScopeHash } from "@/utils/mediaReceipts.mjs";

export const isNativePlaybackDeviceId = value => typeof value === "string"
  && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const hash = (value, secret) => mediaScopeHash(`native-playback/receipt-v1:${value}`, secret);
const live = () => ({ revokedAt: null, expiresAt: { $gt: new Date() } });

export function signNativePlaybackDeviceId(deviceId, secret) {
  return `${deviceId}.${mediaScopeHash(`native-playback/installation-v1:${deviceId}`, secret)}`;
}
export function verifyNativePlaybackDeviceId(cookie, secret) {
  if (typeof cookie !== "string" || cookie.length !== 101) return null;
  const [device, signature] = cookie.split(".");
  if (!isNativePlaybackDeviceId(device) || !/^[a-f0-9]{64}$/.test(signature || "")) return null;
  const expected = signNativePlaybackDeviceId(device, secret).split(".")[1];
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? device : null;
}

export function nativeGrantAllowsSelection(grant, selection) {
  return selection?.mode === "audio" && selection.profile === grant?.profile
    && Array.isArray(grant?.videoIds) && grant.videoIds.includes(selection.videoId);
}

export function validateNativePlaybackSelection(body) {
  if (!["mp4-aac", "webm-opus"].includes(body?.profile) || !Array.isArray(body?.videoIds)
    || !body.videoIds.length || body.videoIds.length > 100
    || body.videoIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id))) return null;
  return { profile: body.profile, videoIds: [...new Set(body.videoIds)] };
}

export async function issueNativePlaybackGrant(token, selection, receipt, deviceId, secret) {
  await dbConnect();
  const owner = { accountId: token.id, sessionVersion: token.sessionVersion, deviceId };
  if (await NativePlaybackGrant.countDocuments({ ...owner, ...live() }) >= 32) return null;
  const nativeGrant = `npr1_${randomBytes(32).toString("base64url")}`;
  const expiresAt = Math.min(Date.now() + 3600_000,
    Number.isFinite(token.exp) ? token.exp * 1000 : Infinity);
  if (expiresAt <= Date.now()) return null;
  const grantId = randomUUID();
  await NativePlaybackGrant.create({ ...owner, ...selection, grantId, tokenHash: hash(nativeGrant, secret),
    // The anchor is borrowed from an existing playback owner. A stale grant
    // must never cancel that owner's still-playing source during cleanup.
    jobs: [], expiresAt: new Date(expiresAt) });
  return { nativeGrant, grantId, expiresAt };
}

export async function findNativePlaybackGrant(value, secret) {
  if (typeof value !== "string" || !/^npr1_[A-Za-z0-9_-]{43}$/.test(value)) return null;
  await dbConnect();
  return NativePlaybackGrant.findOne({ tokenHash: hash(value, secret), ...live() }).lean();
}

export async function registerNativePlaybackJob(grant, job, owned = true) {
  await dbConnect();
  if (!owned) return Boolean(await NativePlaybackGrant.findOne({ grantId: grant.grantId, ...live() }).lean());
  const result = await NativePlaybackGrant.updateOne({ grantId: grant.grantId, ...live(),
    $or: [{ jobs: { $elemMatch: job } }, { "jobs.127": { $exists: false } }] }, { $addToSet: { jobs: job } });
  return result.matchedCount === 1;
}

export async function revokeNativePlaybackGrant(grant) {
  await dbConnect();
  return NativePlaybackGrant.findOneAndUpdate({ grantId: grant.grantId, revokedAt: null },
    { $set: { revokedAt: new Date() } }, { new: false }).lean();
}

export async function revokeDeviceNativePlaybackGrants(token, deviceId) {
  await dbConnect();
  const filter = { accountId: token.id, sessionVersion: token.sessionVersion, deviceId, ...live() };
  const grants = await NativePlaybackGrant.find(filter).lean();
  if (grants.length) await NativePlaybackGrant.updateMany({ grantId: { $in: grants.map(grant => grant.grantId) } },
    { $set: { revokedAt: new Date() } });
  return grants;
}
