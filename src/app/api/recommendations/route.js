import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import Genre from "@/models/Genre";
import dbConnect from "@/utils/dbconnect";
import { youtubeFetch } from "@/utils/youtubeApi";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { tokenOptions } from "@/utils/authToken";
import { ensureSystemGenres } from "@/services/genreCatalog";
import { normalizeGenreName } from "@/utils/genreTaxonomy";
import {
  buildGenreSeeds,
  buildPersonalizedSeeds,
  resolveGenrePreferences,
} from "@/utils/recommendationSeeds.mjs";
import {
  ApiRouteError,
  apiError,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";
import {
  ensureUserData,
  getAuthenticatedAccount,
  normalizeAccountEmail,
} from "@/utils/userAccount";

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 40;
const searchCache = new Map();

export const runtime = "nodejs";
export const maxDuration = 30;

function getCachedSearches(key) {
  const cached = searchCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return cached.value;
}

function cacheSearches(key, value) {
  if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    value,
  });
}

function normalizeVideo(item, reason, extra = {}) {
  return {
    id: typeof item?.id === "string" ? item.id : item?.id?.videoId,
    title: item?.snippet?.title || "",
    channel: item?.snippet?.channelTitle || "",
    description: item?.snippet?.description || "",
    thumbnail:
      item?.snippet?.thumbnails?.high?.url ||
      item?.snippet?.thumbnails?.medium?.url ||
      item?.snippet?.thumbnails?.default?.url ||
      "",
    reason,
    ...extra,
  };
}

function upstreamError(status, message) {
  const code = status === 429
    ? "RATE_LIMITED"
    : status === 503
      ? "SERVICE_UNAVAILABLE"
      : "BAD_GATEWAY";
  return new ApiRouteError(code, { message });
}

async function searchYouTube(query, reason, extra = {}) {
  const params = {
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "8",
    q: `${query} official audio`,
  };
  const { ok, status, data } = await youtubeFetch("search", params, { next: { revalidate: 3600 } });
  if (!ok) throw upstreamError(status, "Music recommendations are temporarily unavailable.");
  return (Array.isArray(data?.items) ? data.items : [])
    .filter((item) => item?.id?.videoId)
    .map((item) => normalizeVideo(item, reason, extra));
}

async function getPopularMusic() {
  const params = {
    part: "snippet,status",
    chart: "mostPopular",
    videoCategoryId: "10",
    regionCode: "US",
    maxResults: "24",
  };
  const { ok, status, data } = await youtubeFetch("videos", params, { next: { revalidate: 900 } });
  if (!ok) throw upstreamError(status, "Music recommendations are temporarily unavailable.");
  return (Array.isArray(data?.items) ? data.items : [])
    .filter(
      (item) =>
        item?.id &&
        item?.status?.embeddable &&
        item?.status?.privacyStatus === "public",
    )
    .map((item) => normalizeVideo(item, "Trending on YouTube"));
}

async function searchPlaylists(query) {
  const params = {
    part: "snippet",
    type: "playlist",
    maxResults: "6",
    q: `${query} official playlist`,
  };
  const { ok, status, data } = await youtubeFetch("search", params, { next: { revalidate: 3600 } });
  if (!ok) throw upstreamError(status, "Featured playlists are temporarily unavailable.");
  return (Array.isArray(data?.items) ? data.items : [])
    .filter((item) => item?.id?.playlistId)
    .map((item) => ({
      id: item.id.playlistId,
      title: item.snippet?.title || "",
      channel: item.snippet?.channelTitle || "",
      thumbnail:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        "",
    }));
}

export async function GET(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 20 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many requests. Please slow down and try again shortly.",
      });
    }

    const token = await getToken(tokenOptions(request));
    let mode = "guest";
    let profile = null;

    if (token?.email) {
      await dbConnect();
      const user = await User.findOne({ email: normalizeAccountEmail(token.email) });
      if (user) {
        profile = await ensureUserData(user);
        mode = "personalized";
      }
    }

    const seeds = mode === "personalized"
      ? buildPersonalizedSeeds(profile)
      : buildGenreSeeds(null);
    const cacheKey = seeds.map((seed) => seed.query).join("|");
    let groups;
    let playlists;
    const cached = getCachedSearches(cacheKey);
    if (cached) {
      groups = cached.groups;
      playlists = cached.playlists;
    } else {
      const [searchGroups, featuredPlaylists] = await Promise.all([
        Promise.all(
          seeds.map(({ query, reason, genre }) =>
            searchYouTube(query, reason, { seedQuery: query, genre }),
          ),
        ),
        searchPlaylists(seeds[0].query),
      ]);
      groups = searchGroups;
      playlists = featuredPlaylists;
      cacheSearches(cacheKey, { groups, playlists });
    }

    const excluded = new Set(profile?.notInterested || []);
    const snoozed = new Set(profile?.snoozedTracks || []);
    const skipped = new Set(profile?.skippedTracks || []);
    const recent = new Set((profile?.songHistory || []).map((song) => song?.id || song));
    const explicitDisabled = mode === "guest" || profile?.settings?.explicitContent === false;
    const filterRecommendations = (videos) => videos
      .filter((video) => !excluded.has(video.id) && !snoozed.has(video.id) && !skipped.has(video.id) && !recent.has(video.id))
      .filter((video) => !explicitDisabled || !/explicit|uncensored|18\+/i.test(`${video.title} ${video.description}`))
      .filter((video, index, all) => all.findIndex((item) => item.id === video.id) === index);
    let source = "search";
    let recommendations = filterRecommendations(groups.flat());

    if (recommendations.length === 0) {
      source = "youtube-chart";
      recommendations = filterRecommendations(await getPopularMusic());
    }
    recommendations = recommendations.slice(0, 24);
    const genreSections = seeds
      .map((seed, index) => ({
        id: seed.query.toLowerCase().replace(/\s+/g, "-"),
        title: seed.query,
        videos: filterRecommendations(groups[index] || []),
      }))
      .filter((section) => section.videos.length > 0);

    return NextResponse.json({
      mode,
      source,
      sections: {
        trending: recommendations.slice(0, 8),
        charts: recommendations.slice(8, 16),
        newReleases: recommendations.slice(16, 24),
        featuredPlaylists: playlists,
        genres: genreSections,
      },
      profile: profile
        ? {
            genres: profile.genres || [],
            explicitContent: profile.settings?.explicitContent ?? false,
            privateSession: profile.settings?.privateSession ?? false,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, "Load recommendations");
  }
}

export async function POST(request) {
  try {
    const { user, userData: accountData, email } = await getAuthenticatedAccount(request);
    const rateLimit = await isRateLimited(`recommendations:${email}`, {
      windowMs: 15 * 60_000,
      max: 30,
    });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many preference updates. Please wait before trying again.",
      });
    }

    const body = await readRequestJson(request);
    if (
      !Array.isArray(body.genres)
      || body.genres.length > 12
      || body.genres.some((genre) => (
        typeof genre !== "string"
        || genre.trim().length < 2
        || genre.trim().length > 80
        || normalizeGenreName(genre).length < 2
      ))
    ) {
      throw new ApiRouteError("VALIDATION_ERROR", {
        message: "genres must contain at most 12 names between 2 and 80 characters.",
      });
    }
    const requestedGenres = body.genres.map((genre) => genre.trim().replace(/\s+/g, " "));

    const [systemGenres, personalGenres] = await Promise.all([
      ensureSystemGenres(),
      Genre.find({
        scope: "personal",
        ownerId: user._id,
      }).select("_id displayName normalizedName aliasKeys").lean(),
    ]);
    const preferences = resolveGenrePreferences(requestedGenres, [...systemGenres, ...personalGenres]);
    const profile = await UserData.findByIdAndUpdate(
      accountData._id,
      {
        $set: {
          genres: preferences.map((preference) => preference.name),
          genreIds: preferences.flatMap((preference) => preference.id ? [preference.id] : []),
        },
      },
      { new: true, runValidators: true },
    ).select("genres").lean();
    if (!profile) {
      return apiError("NOT_FOUND", { message: "User profile not found." });
    }
    return NextResponse.json({
      success: true,
      profile: { genres: profile.genres || [] },
    });
  } catch (error) {
    return handleApiError(error, "Update recommendation preferences");
  }
}
