import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { tokenOptions } from "@/utils/authToken";
import User from "@/models/User";
import UserData from "@/models/UserData";
import Playlist from "@/models/Playlist";
import dbConnect from "@/utils/dbconnect";
import { apiError, handleApiError } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request) {
  try {
    const token = await getToken(tokenOptions(request));
    const userEmail =
      typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
    if (!userEmail) return apiError("UNAUTHORIZED");

    const rateLimit = await isRateLimited(`export-account:${userEmail}`, {
      windowMs: 60_000,
      max: 5,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", { retryAfter: rateLimit.retryAfter });
    }

    await dbConnect();
    const user = await User.findOne({ email: userEmail }).lean();
    if (!user) return apiError("NOT_FOUND", { message: "Account not found." });

    const [userData, playlists] = await Promise.all([
      user.userData ? UserData.findById(user.userData).lean() : Promise.resolve(null),
      Playlist.find({ user: user._id }).lean(),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      account: {
        userName: user.userName,
        email: user.email,
        imageUrl: user.imageUrl,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      profile: userData
        ? {
            favourites: userData.favourites,
            favouriteAddedAt: userData.favouriteAddedAt,
            songHistory: userData.songHistory,
            searches: userData.searches,
            genres: userData.genres,
            tags: userData.tags,
            followedArtists: userData.followedArtists,
            language: userData.language,
            settings: userData.settings,
          }
        : null,
      playlists: (playlists || []).map((playlist) => ({
        name: playlist.name,
        songs: playlist.songs,
        visibility: playlist.visibility,
        category: playlist.category,
        createdAt: playlist.createdAt,
      })),
    };

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="heykasa-data-${userEmail}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "Account export");
  }
}
