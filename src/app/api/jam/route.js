import { randomInt } from "node:crypto";
import JamRoom from "@/models/JamRoom";
import { apiError, apiSuccess, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { getSessionUser } from "@/utils/sessionAuth";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { isRateLimited } from "@/utils/rateLimit";
import { HOST_RECONNECT_GRACE_MS, JAM_CODE_ALPHABET, JAM_CODE_LENGTH, isJamCode } from "@/utils/jam.mjs";
import { jamPublicKey } from "@/utils/jamSigning";
import {
  isJamRoomName,
  jamRoomNameKey,
  normalizeJamRoomName,
  persistentRoomExpiry,
  summarizePersistentRoom,
} from "@/utils/jamRooms.mjs";

export const runtime = "nodejs";

function mintCode() {
  return Array.from({ length: JAM_CODE_LENGTH }, () => JAM_CODE_ALPHABET[randomInt(JAM_CODE_ALPHABET.length)]).join("");
}

function grant(room, userId, extra = {}) {
  return {
    code: room.code,
    roomId: String(room._id),
    role: room.hostId === userId ? "host" : "guest",
    startedAt: room.startedAt,
    publicKey: jamPublicKey(),
    name: room.name || "",
    persistent: Boolean(room.persistent),
    ...extra,
  };
}

async function createOneShot(userId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await JamRoom.create({
        code: mintCode(),
        hostId: userId,
        members: [userId],
        startedAt: Date.now(),
        expiresAt: new Date(Date.now() + 30_000),
        hostSeenAt: new Date(),
      });
    } catch (error) {
      if (error.code !== 11000 || attempt === 2) throw error;
    }
  }
  return null;
}

async function openNamedRoom(userId, name) {
  const roomName = normalizeJamRoomName(name);
  const nameKey = jamRoomNameKey(roomName);
  const existing = await JamRoom.findOne({ hostId: userId, nameKey, persistent: true });
  if (existing) {
    const live = !existing.closed && existing.expiresAt > new Date();
    existing.closed = false;
    existing.members = [...new Set([userId, ...(existing.members || [])])].slice(0, 50);
    existing.startedAt = Date.now();
    existing.expiresAt = persistentRoomExpiry();
    existing.hostSeenAt = new Date();
    await existing.save();
    return {
      room: existing,
      restored: !live && Boolean(existing.savedTrack?.id || existing.savedQueue?.length),
    };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const room = await JamRoom.create({
        code: mintCode(),
        hostId: userId,
        members: [userId],
        startedAt: Date.now(),
        expiresAt: persistentRoomExpiry(),
        hostSeenAt: new Date(),
        persistent: true,
        name: roomName,
        nameKey,
        savedQueue: [],
        savedTrack: null,
      });
      return { room, restored: false };
    } catch (error) {
      if (error.code !== 11000 || attempt === 2) throw error;
    }
  }
  return { room: null, restored: false };
}

export async function GET(request) {
  try {
    if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
    const user = await getSessionUser(request);
    if (!user) return apiError("UNAUTHORIZED");
    const rooms = await JamRoom.find({
      hostId: String(user._id),
      persistent: true,
    }).sort({ name: 1 }).limit(12).lean();
    return apiSuccess(
      { rooms: rooms.map(summarizePersistentRoom).filter(Boolean) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error, "Jam rooms");
  }
}

export async function POST(request) {
  try {
    if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
    const user = await getSessionUser(request);
    if (!user) return apiError("UNAUTHORIZED");
    const limited = await isRateLimited(`jam-connect:${user._id}`, { windowMs: 60_000, max: 20 });
    if (limited.limited) return apiError("RATE_LIMITED", { retryAfter: limited.retryAfter });
    const body = await readRequestJson(request);
    const userId = String(user._id);

    if (body.action === "create") {
      if (isJamRoomName(body.name)) {
        const opened = await openNamedRoom(userId, body.name);
        if (!opened.room) return apiError("INTERNAL_ERROR");
        return apiSuccess({
          ...grant(opened.room, userId, {
            restored: opened.restored,
            queue: opened.restored ? opened.room.savedQueue || [] : undefined,
            track: opened.restored ? opened.room.savedTrack || null : undefined,
          }),
        }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const room = await createOneShot(userId);
      return apiSuccess(grant(room, userId), { headers: { "Cache-Control": "private, no-store" } });
    }

    if (body.action !== "join" || !isJamCode(body.code) || body.code.length !== JAM_CODE_LENGTH) {
      return apiError("VALIDATION_ERROR");
    }
    const room = await JamRoom.findOneAndUpdate({
      code: body.code,
      closed: false,
      expiresAt: { $gt: new Date() },
      $and: [
        {
          $or: [
            { persistent: { $ne: true } },
            { hostSeenAt: { $gt: new Date(Date.now() - HOST_RECONNECT_GRACE_MS) } },
          ],
        },
        { $or: [{ members: userId }, { "members.49": { $exists: false } }] },
      ],
    }, { $addToSet: { members: userId } }, { new: true });
    if (!room) return apiError("NOT_FOUND", { message: "This Jam is no longer available or is full." });
    return apiSuccess(grant(room, userId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error, "Jam connection");
  }
}
