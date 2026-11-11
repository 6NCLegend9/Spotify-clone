import { NextResponse } from "next/server";
import JamRoom from "@/models/JamRoom";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { isJamCode, normalizeJamCode } from "@/utils/jam.mjs";
import { jamPublicKey, signJamEvent } from "@/utils/jamSigning";
import { crowdTerms } from "@/utils/crowdProfiles.mjs";

export const runtime = "nodejs";
export async function POST(request) {
  try {
    if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
    const { user, userData } = await getAuthenticatedAccount(request);
    const limited = await isRateLimited(`crowd-profile:${user._id}`, { windowMs: 60_000, max: 30 });
    if (limited.limited) return apiError("RATE_LIMITED", { retryAfter: limited.retryAfter });
    const body = await readRequestJson(request);
    const code = normalizeJamCode(body?.code);
    if (!isJamCode(code)) return apiError("VALIDATION_ERROR");
    const senderId = String(user._id);
    const room = await JamRoom.findOne({ code, closed: false, expiresAt: { $gt: new Date() }, members: senderId }).select("_id").lean();
    if (!room) return apiError("NOT_FOUND");
    const roomId = String(room._id);
    const envelope = signJamEvent({ roomId, event: "crowd-profile", senderId, role: "member", payload: {
      name: (user.userName || "Listener").slice(0, 60),
      artists: crowdTerms(userData?.followedArtists), genres: crowdTerms(userData?.genres),
    } });
    return NextResponse.json({ roomId, publicKey: jamPublicKey(), envelope }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error, "Crowd profile"); }
}
