import JamRoom from "@/models/JamRoom";
import { apiError, apiSuccess, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { getSessionUser } from "@/utils/sessionAuth";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { isRateLimited } from "@/utils/rateLimit";
import { jamEventRole } from "@/utils/jamAuthorization.mjs";
import { signJamEvent } from "@/utils/jamSigning";
import { persistentRoomExpiry, sanitizeArcadeScore, sanitizeSavedQueue, sanitizeSavedTrack } from "@/utils/jamRooms.mjs";

export const runtime = "nodejs";
export async function POST(request) {
  try {
    if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
    const user = await getSessionUser(request);
    if (!user) return apiError("UNAUTHORIZED");
    const limited = await isRateLimited(`jam-events:${user._id}`, { windowMs: 60_000, max: 120 });
    if (limited.limited) return apiError("RATE_LIMITED", { retryAfter: limited.retryAfter });
    const body = await readRequestJson(request);
    if (!/^[a-f0-9]{24}$/i.test(body.roomId || "") || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload) || JSON.stringify(body.payload).length > 64_000) return apiError("VALIDATION_ERROR");
    const room = await JamRoom.findById(body.roomId);
    const userId = String(user._id);
    const role = jamEventRole(room, userId, body.event);
    if (!role) return apiError("FORBIDDEN");
    const payload = { ...body.payload, participantId: userId, role, name: user.userName || "Listener", startedAt: room.startedAt };
    if (role === "host" && body.event === "heartbeat" && Number.isFinite(body.payload.startedAt)
      && body.payload.startedAt > 0 && body.payload.startedAt <= Date.now()) {
      payload.startedAt = body.payload.startedAt;
    }
    if (body.event === "sync") payload.at = Date.now();
    if (body.event === "arcade-score") Object.assign(payload, sanitizeArcadeScore({ ...body.payload, name: payload.name }));
    if (body.event === "member-left") {
      if (role === "host") body.event = "ended";
      else await JamRoom.updateOne({ _id: room._id }, { $pull: { members: userId } });
    }
    if (body.event === "ended") {
      if (room.persistent) {
        await JamRoom.updateOne({ _id: room._id, hostId: userId }, {
          $set: {
            closed: true,
            expiresAt: persistentRoomExpiry(),
            savedQueue: sanitizeSavedQueue(body.payload.queue || room.savedQueue),
            savedTrack: sanitizeSavedTrack(body.payload.track || room.savedTrack),
          },
        });
      } else {
        await JamRoom.updateOne({ _id: room._id, hostId: userId }, { $set: { closed: true } });
      }
    } else if (role === "host") {
      const update = {
        expiresAt: room.persistent ? persistentRoomExpiry() : new Date(Date.now() + 30_000),
        startedAt: payload.startedAt,
        hostSeenAt: new Date(),
      };
      if (room.persistent && body.event === "sync") {
        update.savedQueue = sanitizeSavedQueue(body.payload.queue);
        update.savedTrack = sanitizeSavedTrack(body.payload.track);
      }
      await JamRoom.updateOne({ _id: room._id, closed: false }, { $set: update });
    }
    return apiSuccess(signJamEvent({ roomId: String(room._id), event: body.event, senderId: userId, role, payload }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error, "Jam event"); }
}
