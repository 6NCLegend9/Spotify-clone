import { randomInt } from "node:crypto";
import JamRoom from "@/models/JamRoom";
import { apiError, apiSuccess, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { getSessionUser } from "@/utils/sessionAuth";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { isRateLimited } from "@/utils/rateLimit";
import { JAM_CODE_ALPHABET, JAM_CODE_LENGTH, isJamCode } from "@/utils/jam.mjs";
import { jamPublicKey } from "@/utils/jamSigning";

export const runtime = "nodejs";
export async function POST(request) {
  try {
    if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
    const user = await getSessionUser(request);
    if (!user) return apiError("UNAUTHORIZED");
    const limited = await isRateLimited(`jam-connect:${user._id}`, { windowMs: 60_000, max: 20 });
    if (limited.limited) return apiError("RATE_LIMITED", { retryAfter: limited.retryAfter });
    const body = await readRequestJson(request);
    const userId = String(user._id);
    let room;
    if (body.action === "create") {
      const publicKey = jamPublicKey();
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = Array.from({ length: JAM_CODE_LENGTH }, () => JAM_CODE_ALPHABET[randomInt(JAM_CODE_ALPHABET.length)]).join("");
        try {
          room = await JamRoom.create({ code, hostId: userId, members: [userId], startedAt: Date.now(), expiresAt: new Date(Date.now() + 30_000) });
          break;
        } catch (error) { if (error.code !== 11000 || attempt === 2) throw error; }
      }
      return apiSuccess({ code: room.code, roomId: String(room._id), role: "host", startedAt: room.startedAt, publicKey }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action !== "join" || !isJamCode(body.code) || body.code.length !== JAM_CODE_LENGTH) return apiError("VALIDATION_ERROR");
    room = await JamRoom.findOneAndUpdate({
      code: body.code, closed: false, expiresAt: { $gt: new Date() },
      $or: [{ members: userId }, { "members.49": { $exists: false } }],
    }, { $addToSet: { members: userId } }, { new: true });
    if (!room) return apiError("NOT_FOUND", { message: "This Jam is no longer available or is full." });
    return apiSuccess({ code: room.code, roomId: String(room._id), role: room.hostId === userId ? "host" : "guest", startedAt: room.startedAt, publicKey: jamPublicKey() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error, "Jam connection"); }
}
