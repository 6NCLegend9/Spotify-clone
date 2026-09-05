import { NextResponse } from "next/server";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 15;

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_SNOOZED = 200;

// Snoozing a track adds it to the exclusion set that recommendations.js already
// reads (previously a no-op, since nothing wrote to this field).
export async function POST(request) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`snoozed-tracks:${email}`, {
      windowMs: 15 * 60_000,
      max: 100,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many preference updates. Please wait before trying again.",
      });
    }
    const body = await readRequestJson(request);
    const { id } = body;
    if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) {
      return apiError("VALIDATION_ERROR", { message: "A valid track id is required" });
    }

    const existing = Array.isArray(userData.snoozedTracks) ? userData.snoozedTracks : [];
    if (!existing.includes(id)) {
      userData.snoozedTracks = [...existing, id].slice(-MAX_SNOOZED);
      await userData.save();
    }
    return NextResponse.json({ success: true, message: "Track snoozed", data: userData.snoozedTracks });
  } catch (e) {
    return handleApiError(e, "save snoozed track");
  }
}
