import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { buildNotificationItems, followedAtByChannel } from "@/utils/accountNotifications.mjs";
import { loadFollowedReleases } from "@/utils/followedReleases.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request) {
  try {
    const account = await getAuthenticatedAccount(request, { optional: true });
    if (!account) {
      return NextResponse.json(buildNotificationItems({ authenticated: false }), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const { userData, email } = account;
    const rateLimit = await isRateLimited(`notifications:${email}`, {
      windowMs: 15 * 60_000,
      max: 40,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many notification checks. Please wait a moment.",
      });
    }

    const releases = await loadFollowedReleases(userData);
    const followedCount = Math.max(
      Array.isArray(userData.followedArtists) ? userData.followedArtists.length : 0,
      Array.isArray(userData.followedArtistsMeta) ? userData.followedArtistsMeta.length : 0,
    );
    const payload = buildNotificationItems({
      authenticated: true,
      releases,
      followedCount,
      seenIds: userData.seenNotificationIds,
      followedAtByChannel: followedAtByChannel(userData),
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error, "Load notifications");
  }
}
