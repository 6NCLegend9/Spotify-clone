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

const DEFAULT_GENRES = ["Pop", "Rock", "Hip Hop", "Electronic"];
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 40;
const searchCache = new Map();

export const runtime = "nodejs";

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
    id: typeof item.id === "string" ? item.id : item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    description: item.snippet.description,
    thumbnail:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.medium?.url ||
      item.snippet.thumbnails?.default?.url,
    reason,
    ...extra,
  };
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
  const { ok, data } = await youtubeFetch("search", params, { next: { revalidate: 3600 } });
  if (!ok) return [];
  return (data.items || [])
    .filter((item) => item.id?.videoId)
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
  const { ok, data } = await youtubeFetch("videos", params, { next: { revalidate: 900 } });
  if (!ok) return [];
  return (data.items || [])
    .filter(
      (item) =>
        item.id &&
        item.status?.embeddable &&
        item.status?.privacyStatus === "public",
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
  const { ok, data } = await youtubeFetch("search", params, { next: { revalidate: 3600 } });
  if (!ok) return [];
  return (data.items || [])
    .filter((item) => item.id?.playlistId)
    .map((item) => ({
      id: item.id.playlistId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url,
    }));
}

function buildGenreSeeds(profile) {
  const genres = profile?.genres?.length ? profile.genres : DEFAULT_GENRES;
  return genres.slice(0, 3).map((genre) => ({
    query: genre,
    reason: `Based on your ${genre} taste`,
    genre,
  }));
}

function addSeed(seeds, seen, query, reason, extra = {}) {
  const normalized = typeof query === "string" ? query.trim() : "";
  const key = normalized.toLowerCase();
  if (!normalized || seen.has(key) || seeds.length >= 3) return;
  seen.add(key);
  seeds.push({ query: normalized, reason, ...extra });
}

function buildPersonalizedSeeds(profile) {
  const seeds = [];
  const seen = new Set();

  (profile?.followedArtists || []).forEach((artist) => {
    addSeed(seeds, seen, artist, `Because you follow ${artist}`);
  });
  (profile?.songHistory || []).forEach((song) => {
    const channel = typeof song?.channel === "string" ? song.channel : "";
    addSeed(seeds, seen, channel, `Because you listened to ${channel}`);
  });
  (profile?.searches || []).forEach((term) => {
    addSeed(seeds, seen, term, `Because you searched for ${term}`);
  });
  (profile?.genres || []).forEach((genre) => {
    addSeed(seeds, seen, genre, `Based on your ${genre} taste`, { genre });
  });

  return seeds.length ? seeds : buildGenreSeeds(null);
}

function resolveGenrePreferences(values, catalog) {
  const genresByKey = new Map();
  catalog.forEach((genre) => {
    [genre.normalizedName, ...(genre.aliasKeys || [])].forEach((key) => {
      if (key && !genresByKey.has(key)) genresByKey.set(key, genre);
    });
  });

  const seen = new Set();
  return values.reduce((preferences, value) => {
    const displayName = value.trim().replace(/\s+/g, " ");
    const normalizedName = normalizeGenreName(displayName);
    if (!normalizedName || seen.has(normalizedName)) return preferences;

    const genre = genresByKey.get(normalizedName);
    const resolvedName = genre?.displayName || displayName;
    const resolvedKey = normalizeGenreName(resolvedName);
    if (seen.has(resolvedKey)) return preferences;
    seen.add(resolvedKey);
    preferences.push({ name: resolvedName, id: genre?._id });
    return preferences;
  }, []);
}

export async function GET(request) {
  if (isRateLimited(getClientKey(request), { windowMs: 60_000, max: 20 })) {
    return NextResponse.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429 });
  }

  try {
    const token = await getToken(tokenOptions(request));
    let mode = "guest";
    let profile = null;

    if (token?.email) {
      await dbConnect();
      const user = await User.findOne({ email: token.email }).select("userData").lean();
      if (user?.userData) {
        profile = await UserData.findById(user.userData).lean();
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
    console.error("Recommendations error:", error);
    return NextResponse.json({ error: "Unable to load recommendations." }, { status: 500 });
  }
}

export async function POST(request) {
  const token = await getToken(tokenOptions(request));
  if (!token?.email) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const requestedGenres = Array.isArray(body?.genres)
    ? body.genres.filter((genre) => typeof genre === "string").slice(0, 12)
    : [];

  await dbConnect();
  const [systemGenres, user] = await Promise.all([
    ensureSystemGenres(),
    User.findOne({ email: token.email }).select("_id userData").lean(),
  ]);
  if (!user?.userData) {
    return NextResponse.json({ error: "User profile not found." }, { status: 404 });
  }
  const personalGenres = await Genre.find({
    scope: "personal",
    ownerId: user._id,
  }).select("_id displayName normalizedName aliasKeys").lean();
  const preferences = resolveGenrePreferences(requestedGenres, [...systemGenres, ...personalGenres]);
  const profile = await UserData.findByIdAndUpdate(
    user.userData,
    {
      $set: {
        genres: preferences.map((preference) => preference.name),
        genreIds: preferences.flatMap((preference) => preference.id ? [preference.id] : []),
      },
    },
    { new: true, runValidators: true },
  ).lean();
  return NextResponse.json({ success: true, profile });
}
