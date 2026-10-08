import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { NextResponse } from "next/server";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import UserData from "@/models/UserData";
import { mutateDocument } from "@/utils/documentMutation.mjs";
import { isArtistFollowed, updateArtistMembership } from "@/utils/followedArtistsList.mjs";
import { allowlistedMediaUrl } from "@/utils/mediaUrl.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_FOLLOWED_ARTISTS = 100;
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  try {
    const { userData } = await getAuthenticatedAccount(request);
    return NextResponse.json({
      success: true,
      message: "Followed artists found",
      data: userData.followedArtists || [],
      artists: userData.followedArtistsMeta || [],
    }, { headers: NO_STORE });
  } catch (e) {
    return handleApiError(e, "get followed artists");
  }
}

function readArtist(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
  if (!name || name.length > 100 || (channelId && !/^UC[A-Za-z0-9_-]{20,24}$/.test(channelId))
      || (body.channelId != null && typeof body.channelId !== "string")
      || (body.followed !== undefined && typeof body.followed !== "boolean")) return null;
  return { name, channelId, thumbnail: allowlistedMediaUrl(body.thumbnail) };
}

async function updateFollow(request, backfill) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`followed-artists${backfill ? "-meta" : ""}:${email}`, {
      windowMs: 15 * 60_000, max: backfill ? 80 : 40,
    });
    if (rateLimit.limited) return apiError("RATE_LIMITED", { retryAfter: rateLimit.retryAfter, message: "Too many follow updates. Please try again later." });
    const body = await readRequestJson(request);
    const artist = readArtist(body);
    if (!artist) return apiError("VALIDATION_ERROR", { message: "A valid artist and follow state are required." });
    let enabled;
    const updated = await mutateDocument(UserData, userData._id, current => {
      const present = isArtistFollowed(current, artist);
      if (backfill && !present) return null;
      enabled = backfill ? true : body.followed ?? !present;
      return updateArtistMembership(current, artist, enabled, MAX_FOLLOWED_ARTISTS);
    });
    if (backfill && enabled === undefined) return apiError("VALIDATION_ERROR", { message: "You are not following this artist." });
    return NextResponse.json({
      success: true,
      message: backfill ? "Updated" : enabled ? "Followed" : "Unfollowed",
      data: updated.followedArtists || [],
      artists: updated.followedArtistsMeta || [],
    }, { headers: NO_STORE });
  } catch (error) {
    return handleApiError(error, backfill ? "backfill followed artist" : "update followed artist");
  }
}

// New callers send explicit membership. Missing followed retains legacy toggle behavior.
export async function POST(request) {
  if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
  return updateFollow(request, false);
}

// Upgrade legacy name-only membership without toggling or replacing other artists.
export async function PATCH(request) {
  if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
  return updateFollow(request, true);
}
