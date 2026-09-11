import { NextResponse } from "next/server";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import UserData from "@/models/UserData";
import { mutateDocument } from "@/utils/documentMutation.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_HISTORY_ENTRIES = 20;

// Fetch the signed-in user's server-synced listening history.
export async function GET(request) {
  try {
    const { userData } = await getAuthenticatedAccount(request);
    return NextResponse.json({
      success: true,
      message: "History found",
      data: userData.songHistory || [],
    });
  } catch (e) {
    return handleApiError(e, "get history");
  }
}

// Record a played track in the signed-in user's server-synced listening history.
export async function POST(request) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`history:${email}`, {
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
    const raw = body.entry;
    const clip = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
    const entry = raw && typeof raw === "object" && !Array.isArray(raw) && typeof raw.id === "string"
      ? {
          id: raw.id.trim(),
          source: "youtube",
          title: clip(raw.title, 200),
          channel: clip(raw.channel, 120),
          thumbnail: clip(raw.thumbnail, 500),
        }
      : null;
    if (!entry || !YOUTUBE_ID_PATTERN.test(entry.id)) {
      return apiError("VALIDATION_ERROR", {
        message: "A valid YouTube track entry is required",
      });
    }

    if (userData.settings?.privateSession) {
      return NextResponse.json({
        success: true,
        message: "Private session enabled; history not updated",
        data: userData.songHistory || [],
      });
    }
    const updated = await mutateDocument(UserData, userData._id, (current) => {
      if (current.settings?.privateSession) return null;
      const existing = Array.isArray(current.songHistory) ? current.songHistory : [];
      return { songHistory: [entry, ...existing.filter((song) => song?.id !== entry.id)].slice(0, MAX_HISTORY_ENTRIES) };
    }, { "settings.privateSession": { $ne: true } });
    return NextResponse.json({ success: true, message: "History updated", data: updated.songHistory }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return handleApiError(e, "update history");
  }
}
