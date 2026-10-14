import { isTrustedRequestOrigin } from "@/utils/trustedOrigin";
import { NextResponse } from "next/server";
import UserData from "@/models/UserData";
import Genre from "@/models/Genre";
import { youtubeFetch } from "@/utils/youtubeApi";
import { cleanArtist, cleanTitle } from "@/utils/text";
import { isTrackAllowed } from "@/utils/explicitContent.mjs";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";
import { ensureSystemGenres } from "@/services/genreCatalog";
import { normalizeGenreName } from "@/utils/genreTaxonomy";
import {
  resolveGenrePreferences,
  resolveRecommendationPlan,
} from "@/utils/recommendationSeeds.mjs";
import { buildOfficialMusicQuery, filterMusicPlaybackResults, rankOfficialMusicResults } from "@/utils/officialMusicSearch.mjs";
import { canonicalSongIdentity } from "@/utils/songIdentity.mjs";
import {
  ApiRouteError,
  apiError,
  handleApiError,
  readRequestJson,
} from "@/utils/apiResponse";
import { getAuthenticatedAccount } from "@/utils/userAccount";
import { activeSnoozedTracks } from "@/utils/recommendationFeedback.mjs";
import { randomInt } from "node:crypto";
import { discoverySeenIds, discoveryPlaylistIds, MAX_DISCOVERY_SEEN, MAX_DISCOVERY_PLAYLISTS_SEEN, isNewDiscoveryArtist, selectBalancedHomeDiscovery, selectHomePlaylists } from "@/utils/homeDiscovery.mjs";

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
    title: cleanTitle(item?.snippet?.title || ""),
    channel: cleanArtist(item?.snippet?.channelTitle || ""),
    channelId: item?.snippet?.channelId || "",
    description: cleanTitle(item?.snippet?.description || ""),
    publishedAt: item?.snippet?.publishedAt || "",
    thumbnail:
      item?.snippet?.thumbnails?.high?.url ||
      item?.snippet?.thumbnails?.medium?.url ||
      item?.snippet?.thumbnails?.default?.url ||
      "",
    reason,
    ...extra,
  };
}

async function searchYouTube(query, reason, extra = {}, { fresh = false } = {}) {
  const cutoff = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10) + "T00:00:00Z";
  const cacheKey = `videos:${query.toLowerCase()}:${fresh ? cutoff : "relevance"}`;
  const cached = getCachedSearches(cacheKey);
  if (cached) return cached.map((video) => ({ ...video, reason, ...extra }));
  const params = {
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "32",
    q: buildOfficialMusicQuery(query),
    safeSearch: "moderate",
    ...(fresh ? { order: "date", publishedAfter: cutoff } : {}),
  };
  const { ok, data } = await youtubeFetch("search", params, { next: { revalidate: 3600 } });
  if (!ok) return [];
  const videos = (Array.isArray(data?.items) ? data.items : [])
    .filter((item) => item?.id?.videoId)
    .filter((item) => !fresh || Date.parse(item?.snippet?.publishedAt) >= Date.parse(cutoff))
    .map((item) => normalizeVideo(item));
  const ranked = rankOfficialMusicResults(filterMusicPlaybackResults(videos, query), query);
  if (ranked.length) cacheSearches(cacheKey, ranked);
  return ranked.map((video) => ({ ...video, reason, ...extra }));
}

async function getPopularMusic() {
  const params = {
    part: "snippet,status",
    chart: "mostPopular",
    videoCategoryId: "10",
    regionCode: "US",
    maxResults: "50",
  };
  const { ok, data } = await youtubeFetch("videos", params, { next: { revalidate: 900 } });
  if (!ok) return [];
  const videos = (Array.isArray(data?.items) ? data.items : [])
    .filter(
      (item) =>
        item?.id &&
        item?.status?.embeddable &&
        item?.status?.privacyStatus === "public",
    )
    .map((item) => normalizeVideo(item, "Trending on YouTube"));
  return filterMusicPlaybackResults(videos, "popular music");
}

async function searchPlaylists(query) {
  const cacheKey = `playlists:${query.toLowerCase()}`;
  const cached = getCachedSearches(cacheKey);
  if (cached) return cached;
  const params = {
    part: "snippet",
    type: "playlist",
    maxResults: "6",
    q: `${query} official playlist`,
  };
  const { ok, data } = await youtubeFetch("search", params, { next: { revalidate: 3600 } });
  if (!ok) return [];
  const playlists = (Array.isArray(data?.items) ? data.items : [])
    .filter((item) => item?.id?.playlistId)
    .map((item) => ({
      id: item.id.playlistId,
      title: cleanTitle(item.snippet?.title || ""),
      channel: cleanArtist(item.snippet?.channelTitle || ""),
      thumbnail:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        "",
    }));
  if (playlists.length) cacheSearches(cacheKey, playlists);
  return playlists;
}

function uniqueSongs(videos) {
  const ids = new Set();
  const identities = new Set();
  return videos.filter((video) => {
    if (!video?.id || ids.has(video.id)) return false;
    const identity = canonicalSongIdentity(video);
    if (identity && identities.has(identity)) return false;
    ids.add(video.id);
    if (identity) identities.add(identity);
    return true;
  });
}

export async function GET(request) {
  try {
    const rateLimit = await isRateLimited(getClientKey(request), { windowMs: 60_000, max: 12 });
    if (rateLimit.limited) {
      return apiError("RATE_LIMITED", {
        retryAfter: rateLimit.retryAfter,
        message: "Too many requests. Please slow down and try again shortly.",
      });
    }

    const account = await getAuthenticatedAccount(request, { optional: true });
    const mode = account ? "personalized" : "guest";
    const profile = account?.userData || null;

    const rawSeen = new URL(request.url).searchParams.get("seen") || "";
    if (rawSeen.length > MAX_DISCOVERY_SEEN * 12) {
      return apiError("VALIDATION_ERROR", { message: "Too many discovery exclusions." });
    }
    const seenIds = discoverySeenIds(rawSeen.split(","));
    const rawSeenPlaylists = new URL(request.url).searchParams.get("seenPlaylists") || "";
    if (rawSeenPlaylists.length > MAX_DISCOVERY_PLAYLISTS_SEEN * 101) {
      return apiError("VALIDATION_ERROR", { message: "Too many playlist exclusions." });
    }
    const seenPlaylistIds = discoveryPlaylistIds(rawSeenPlaylists.split(","));
    const rotation = randomInt(0x7fffffff);
    const plan = resolveRecommendationPlan(mode, profile, { rotation });
    const excluded = new Set(profile?.notInterested || []);
    const snoozed = new Set(activeSnoozedTracks(profile));
    const skipped = new Set(profile?.skippedTracks || []);
    const recent = new Set((profile?.songHistory || []).map((song) => song?.id || song));
    const recentIdentities = new Set((profile?.songHistory || []).filter((song) => song && typeof song === "object").map(canonicalSongIdentity).filter(Boolean));
    const explicitDisabled = mode === "guest" || profile?.settings?.explicitContent !== true;
    const filterRecommendations = (videos) => uniqueSongs(videos
      .filter((video) => !excluded.has(video.id) && !snoozed.has(video.id) && !skipped.has(video.id) && !recent.has(video.id))
      .filter((video) => !recentIdentities.has(canonicalSongIdentity(video)))
      .filter((video) => isTrackAllowed(video, !explicitDisabled)));

    let source = "search";
    let recommendations = [];
    let playlists = [];
    const genreSections = [];
    let forYou = { tracks: [], playlists: [] };
    let explore = { tracks: [], playlists: [] };

    if (plan.kind === "popular") {
      const cacheKey = "guest:popular";
      const cached = getCachedSearches(cacheKey);
      let popular;
      if (cached?.popular) {
        popular = cached.popular;
        playlists = cached.playlists || [];
      } else {
        const [popularVideos, featuredPlaylists] = await Promise.all([
          getPopularMusic(),
          searchPlaylists("popular music"),
        ]);
        popular = popularVideos;
        playlists = featuredPlaylists;
        cacheSearches(cacheKey, { popular, playlists });
      }
      source = "youtube-chart";
      recommendations = filterRecommendations(popular || []);
      if (recommendations.length === 0) {
        source = "search";
        recommendations = filterRecommendations(
          await searchYouTube("popular music", "Popular right now"),
        );
      }
      const selected = selectBalancedHomeDiscovery([recommendations], [recommendations], { seenIds, rotation });
      const selectedPlaylists = selectHomePlaylists(playlists, playlists, { rotation, seenPlaylistIds });
      forYou = { tracks: selected.forYou, playlists: selectedPlaylists.forYou };
      explore = { tracks: selected.explore, playlists: selectedPlaylists.explore };
    } else {
      const seeds = plan.seeds;
      const explorationSeeds = plan.explorationSeeds;
      const [groups, explorationGroups, familiarPlaylists, explorationPlaylists] = await Promise.all([
        Promise.all(seeds.map(({ query, reason, genre }) => searchYouTube(query, reason, { seedQuery: query, genre }))),
        Promise.all(explorationSeeds.map(async (seed) => {
          const extra = { seedQuery: seed.query, genre: seed.genre };
          const knownArtists = [...(profile?.followedArtists || []), ...(profile?.followedArtistsMeta || []).map((artist) => artist?.name), ...(seed.excludeArtist ? [seed.excludeArtist] : [])].filter(Boolean);
          const allowed = (video) => isNewDiscoveryArtist(video, knownArtists);
          const fresh = (await searchYouTube(seed.query, seed.reason, extra, { fresh: true })).filter(allowed);
          return fresh.length ? fresh : (await searchYouTube(seed.query, seed.reason, extra)).filter(allowed);
        })),
        Promise.all(seeds.map((seed) => searchPlaylists(seed.query))),
        Promise.all(explorationSeeds.map((seed) => searchPlaylists(seed.query))),
      ]);
      const selection = selectBalancedHomeDiscovery(groups.map(filterRecommendations), explorationGroups.map(filterRecommendations), { seenIds, rotation });
      const selectedPlaylists = selectHomePlaylists(familiarPlaylists.flat(), explorationPlaylists.flat(), { rotation, seenPlaylistIds });
      forYou = { tracks: selection.forYou, playlists: selectedPlaylists.forYou };
      explore = { tracks: selection.explore, playlists: selectedPlaylists.explore };
      if (forYou.tracks.length + explore.tracks.length === 0) {
        source = "youtube-chart";
        const popular = filterRecommendations(await getPopularMusic());
        const fallback = selectBalancedHomeDiscovery([popular], [popular], { seenIds, rotation });
        forYou.tracks = fallback.forYou;
        explore.tracks = fallback.explore;
      }
    }
    recommendations = [...forYou.tracks, ...explore.tracks];
    playlists = [...forYou.playlists, ...explore.playlists];

    return NextResponse.json({
      mode,
      source,
      basis: source === "youtube-chart" ? "popular" : plan.basis,
      sections: {
        forYou,
        explore,
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
    }, {
      // Cache provider candidates, never a user's rotated/excluded selection.
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    return handleApiError(error, "Load recommendations");
  }
}

export async function POST(request) {
  if (!isTrustedRequestOrigin(request)) return apiError("FORBIDDEN");
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
