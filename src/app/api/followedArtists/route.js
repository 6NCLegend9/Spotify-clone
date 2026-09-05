import { NextResponse } from "next/server";
import { apiError, handleApiError, readRequestJson } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { getAuthenticatedAccount } from "@/utils/userAccount";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_FOLLOWED_ARTISTS = 100;

export async function GET(request) {
  try {
    const { userData } = await getAuthenticatedAccount(request);
    return NextResponse.json({
      success: true,
      message: "Followed artists found",
      data: userData.followedArtists || [],
      artists: userData.followedArtistsMeta || [],
    });
  } catch (e) {
    return handleApiError(e, "get followed artists");
  }
}

// Toggles a followed channel/artist by name (the name is the recommendations seed);
// channelId/thumbnail are also stored so the UI can link to the profile and show releases.
export async function POST(request) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`followed-artists:${email}`, {
      windowMs: 15 * 60_000,
      max: 40,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many follow updates. Please wait before trying again.",
      });
    }
    const body = await readRequestJson(request);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const channelId = typeof body.channelId === "string" ? body.channelId.trim().slice(0, 48) : "";
    const thumbnail = typeof body.thumbnail === "string" ? body.thumbnail.trim().slice(0, 500) : "";
    if (!name) {
      return apiError("VALIDATION_ERROR", { message: "An artist name is required" });
    }

    const existing = Array.isArray(userData.followedArtists) ? userData.followedArtists : [];
    const existingMeta = Array.isArray(userData.followedArtistsMeta) ? userData.followedArtistsMeta : [];
    const alreadyFollowing = existing.some((value) => value.toLowerCase() === name.toLowerCase());
    if (alreadyFollowing) {
      userData.followedArtists = existing.filter((value) => value.toLowerCase() !== name.toLowerCase());
      userData.followedArtistsMeta = existingMeta.filter(
        (item) => (item?.name || "").toLowerCase() !== name.toLowerCase(),
      );
    } else {
      userData.followedArtists = [...existing, name].slice(-MAX_FOLLOWED_ARTISTS);
      userData.followedArtistsMeta = [
        ...existingMeta.filter((item) => (item?.name || "").toLowerCase() !== name.toLowerCase()),
        { name, channelId, thumbnail, followedAt: new Date() },
      ].slice(-MAX_FOLLOWED_ARTISTS);
    }
    await userData.save();
    return NextResponse.json({
      success: true,
      message: alreadyFollowing ? "Unfollowed" : "Followed",
      data: userData.followedArtists,
      artists: userData.followedArtistsMeta,
    });
  } catch (e) {
    return handleApiError(e, "update followed artist");
  }
}

// Backfills channel metadata (channelId/thumbnail) for an artist the user already
// follows, without toggling the follow. Used to repair legacy follows that were saved
// with only a name so the Following page can show avatars and link to the channel.
export async function PATCH(request) {
  try {
    const { userData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`followed-artists-meta:${email}`, {
      windowMs: 15 * 60_000,
      max: 80,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many updates. Please wait before trying again.",
      });
    }
    const body = await readRequestJson(request);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const channelId = typeof body.channelId === "string" ? body.channelId.trim().slice(0, 48) : "";
    const thumbnail = typeof body.thumbnail === "string" ? body.thumbnail.trim().slice(0, 500) : "";
    if (!name) {
      return apiError("VALIDATION_ERROR", { message: "An artist name is required" });
    }

    const existing = Array.isArray(userData.followedArtists) ? userData.followedArtists : [];
    const isFollowed = existing.some((value) => value.toLowerCase() === name.toLowerCase());
    if (!isFollowed) {
      return apiError("VALIDATION_ERROR", { message: "You are not following this artist." });
    }

    const existingMeta = Array.isArray(userData.followedArtistsMeta) ? userData.followedArtistsMeta : [];
    const current = existingMeta.find((item) => (item?.name || "").toLowerCase() === name.toLowerCase());
    userData.followedArtistsMeta = [
      ...existingMeta.filter((item) => (item?.name || "").toLowerCase() !== name.toLowerCase()),
      {
        name,
        channelId: channelId || current?.channelId || "",
        thumbnail: thumbnail || current?.thumbnail || "",
        followedAt: current?.followedAt || new Date(),
      },
    ].slice(-MAX_FOLLOWED_ARTISTS);
    await userData.save();
    return NextResponse.json({
      success: true,
      message: "Updated",
      data: userData.followedArtists,
      artists: userData.followedArtistsMeta,
    });
  } catch (e) {
    return handleApiError(e, "backfill followed artist");
  }
}
