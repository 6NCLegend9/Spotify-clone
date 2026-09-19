import { NextResponse } from "next/server";
import { getSessionUser } from "@/utils/sessionAuth";
import UserData from "@/models/UserData";
import Playlist from "@/models/Playlist";
import Genre from "@/models/Genre";
import Tag from "@/models/Tag";
import { apiError, handleApiError } from "@/utils/apiResponse";
import { isRateLimited } from "@/utils/rateLimit";
import { retainedListeningEvents } from "@/utils/listeningInsights.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request) {
  try {
    const user = await getSessionUser(request);
    if (!user) return apiError("UNAUTHORIZED");
    const userEmail = user.email;

    const rateLimit = await isRateLimited(`export-account:${userEmail}`, {
      windowMs: 60_000,
      max: 5,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", { retryAfter: rateLimit.retryAfter });
    }

    const [userData, playlists, personalGenres, personalTags] = await Promise.all([
      user.userData ? UserData.findById(user.userData).lean() : Promise.resolve(null),
      Playlist.find({ user: user._id }).lean(),
      Genre.find({ scope: "personal", ownerId: user._id }).select("displayName parentId category createdAt updatedAt").lean(),
      Tag.find({ scope: "personal", ownerId: user._id }).select("displayName category createdAt updatedAt").lean(),
    ]);

    const exportPayload = {
      formatVersion: 2,
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
            completedPlays: userData.completedPlays,
            skippedTracks: userData.skippedTracks,
            notInterested: userData.notInterested,
            snoozedTracks: userData.snoozedTracks,
            snoozedUntil: userData.snoozedUntil,
            listeningEvents: retainedListeningEvents(userData.listeningEvents),
            searches: userData.searches,
            genres: userData.genres,
            tags: userData.tags,
            followedArtists: userData.followedArtists,
            followedArtistsMeta: userData.followedArtistsMeta,
            seenNotificationIds: userData.seenNotificationIds,
            genreIds: userData.genreIds,
            tagIds: userData.tagIds,
            likedPlaylists: userData.likedPlaylists,
            explicitContent: userData.explicitContent,
            language: userData.language,
            settings: userData.settings,
            createdAt: userData.createdAt,
            updatedAt: userData.updatedAt,
          }
        : null,
      playlists: (playlists || []).map((playlist) => ({
        id: playlist._id,
        name: playlist.name,
        songs: playlist.songs,
        songAddedAt: playlist.songAddedAt,
        visibility: playlist.visibility,
        category: playlist.category,
        subgenre: playlist.subgenre,
        pinned: playlist.pinned,
        smartShuffle: playlist.smartShuffle,
        coverImage: playlist.coverImage,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
      })),
      personalGenres: personalGenres.map(({ _id, displayName, parentId, createdAt, updatedAt }) => ({ id: _id, displayName, parentId, createdAt, updatedAt })),
      personalTags: personalTags.map(({ _id, displayName, category, createdAt, updatedAt }) => ({ id: _id, displayName, category, createdAt, updatedAt })),
    };

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="heykasa-account-data.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "Account export");
  }
}
