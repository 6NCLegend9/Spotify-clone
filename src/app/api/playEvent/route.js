import { NextResponse } from "next/server";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import UserData from "@/models/UserData";
import { mutateDocument } from "@/utils/documentMutation.mjs";
import { insightEvent, listeningSummary, retainedListeningEvents, MAX_INSIGHT_EVENTS } from "@/utils/listeningInsights.mjs";
import { shouldRecordWeekPulse } from "@/utils/weekPulse.mjs";
import { incrementWeekPulse } from "@/utils/weekPulseStore.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_ENTRIES = 200;

// Records whether a track played to the end or was skipped early. skippedTracks feeds
// recommendations.js's exclusion filter; completedPlays is stored for future use (e.g.
// a "most played" view) but isn't consumed by anything yet.
export async function POST(request) {
  try {
    const { user, userData, email } = await getAuthenticatedAccount(request);
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
    if (!["completed", "skipped", "stopped"].includes(event)) {
      return apiError("VALIDATION_ERROR", { message: "A valid event type is required" });
    }

    const field = event === "completed" ? "completedPlays" : "skippedTracks";
    if (userData.settings?.privateSession) {
      return NextResponse.json({
        success: true,
        message: "Private session enabled; play event not recorded",
        data: userData[field] || [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const observation = body.eventId ? insightEvent(body) : null;
    if (observation && body.owner !== `account:${user._id}`) return apiError("UNAUTHORIZED");
    if (observation && userData.settings?.listeningInsights !== true) {
      return NextResponse.json({ success: true, message: "Listening insights are off", data: [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    let addedObservation = false;
    const updated = await mutateDocument(UserData, userData._id, (current) => {
      if (current.settings?.privateSession) return null;
      const changes = {};
      if (!observation && event !== "stopped") {
        const existing = Array.isArray(current[field]) ? current[field] : [];
        if (!existing.includes(id)) changes[field] = [...existing, id].slice(-MAX_ENTRIES);
      }
      if (observation && current.settings?.listeningInsights === true) {
        const events = retainedListeningEvents(current.listeningEvents);
        if (!events.some((entry) => entry.eventId === observation.eventId)) {
          changes.listeningEvents = [...events, observation].slice(-MAX_INSIGHT_EVENTS);
          addedObservation = true;
        }
      }
      return Object.keys(changes).length ? changes : null;
    }, { "settings.privateSession": { $ne: true }, ...(observation ? { "settings.listeningInsights": true } : {}) });
    if (addedObservation && shouldRecordWeekPulse(observation, userData.settings)) {
      try {
        await incrementWeekPulse(observation.id);
      } catch {
        // Weekly pulse is anonymous and best-effort.
      }
    }
    return NextResponse.json({ success: true, message: "Recorded", data: updated[field] || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return handleApiError(e, "record play event");
  }
}

export async function GET(request) {
  try {
    const { userData } = await getAuthenticatedAccount(request);
    const days = new URL(request.url).searchParams.get("days") === "30" ? 30 : 7;
    const enabled = userData.settings?.listeningInsights === true;
    return NextResponse.json({ success: true, enabled, data: listeningSummary(enabled ? userData.listeningEvents : [], days) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error, "Read listening insights"); }
}

export async function DELETE(request) {
  try {
    const { userData } = await getAuthenticatedAccount(request);
    await UserData.updateOne({ _id: userData._id }, { $set: { listeningEvents: [] }, $inc: { __v: 1 } });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error, "Clear listening insights"); }
}
