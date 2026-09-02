import { NextResponse } from "next/server";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 15;

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_ENTRIES = 200;

// Records whether a track played to the end or was skipped early. skippedTracks feeds
// recommendations.js's exclusion filter; completedPlays is stored for future use (e.g.
// a "most played" view) but isn't consumed by anything yet.
export async function POST(request) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`play-event:${email}`, {
      windowMs: 60_000,
      max: 120,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many activity updates. Please slow down.",
      });
    }
    const body = await readRequestJson(request);
    const { id, event } = body;
    if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) {
      return apiError("VALIDATION_ERROR", { message: "A valid track id is required" });
    }
    if (event !== "completed" && event !== "skipped") {
      return apiError("VALIDATION_ERROR", { message: "A valid event type is required" });
    }

    const field = event === "completed" ? "completedPlays" : "skippedTracks";
    if (userData.settings?.privateSession) {
      return NextResponse.json({
        success: true,
        message: "Private session enabled; play event not recorded",
        data: userData[field] || [],
      });
    }
    const existing = Array.isArray(userData[field]) ? userData[field] : [];
    if (!existing.includes(id)) {
      userData[field] = [...existing, id].slice(-MAX_ENTRIES);
      await userData.save();
    }
    return NextResponse.json({ success: true, message: "Recorded", data: userData[field] });
  } catch (e) {
    return handleApiError(e, "record play event");
  }
}
