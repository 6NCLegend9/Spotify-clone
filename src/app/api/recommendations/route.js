import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";

const DEFAULT_GENRES = ["Pop", "Rock", "Hip Hop", "Electronic"];

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
<<<<<<< Updated upstream
    maxResults: "8",
    q: `${query} official audio`,
=======
    maxResults: "15",
    q: `${query} official music`,
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
function buildGenreSeeds(profile) {
  const genres = profile?.genres?.length ? profile.genres : DEFAULT_GENRES;
  return genres.slice(0, 6).map((genre) => ({
    query: genre,
    reason: `Based on your ${genre} taste`,
    genre,
  }));
}

export async function GET(request) {
    if (isRateLimited(getClientKey(request), { windowMs: 60_000, max: 20 })) {
    return NextResponse.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429 });
  }
=======
// profile.genres is only set once a user picks favorite genres in Settings; real signals
// (followed artists, listening history, recent searches) are preferred when available.
function buildPersonalizedSeeds(profile) {
  const followed = Array.isArray(profile?.followedArtists) ? profile.followedArtists : [];
  const history = Array.isArray(profile?.songHistory) ? profile.songHistory : [];
  const recentChannels = [...new Set(history.map((song) => song?.channel).filter(Boolean))];
  const recentSearches = Array.isArray(profile?.searches) ? [...profile.searches].reverse() : [];
  const genres = profile?.genres?.length ? profile.genres : DEFAULT_GENRES;

  const historyCandidates = [
    ...followed.map((name) => ({ query: name, reason: `Because you follow ${name}` })),
    ...recentChannels.map((channel) => ({ query: channel, reason: `Because you played ${channel}` })),
    ...recentSearches.map((term) => ({ query: term, reason: `Because you searched "${term}"` })),
  ];
  
  const seeds = [];
  
  // First seed: Guarantee one of their favorite genres appears
  if (genres.length > 0) {
    seeds.push({ query: genres[0], reason: `Based on your ${genres[0]} taste` });
  }
  
  // Second seed: Pick a history/follow candidate to mix it up, otherwise use a second genre
  if (historyCandidates.length > 0 && historyCandidates[0].query !== genres[0]) {
    seeds.push(historyCandidates[0]);
  } else if (genres.length > 1) {
    seeds.push({ query: genres[1], reason: `Based on your ${genres[1]} taste` });
  }

  // Fallback to default if somehow empty
  if (seeds.length === 0) {
    return DEFAULT_GENRES.slice(0, 2).map((genre) => ({ query: genre, reason: `Based on your taste` }));
  }

  return seeds.slice(0, 2);
}

export async function GET(request) {
  // Rate Limiting block completely removed for testing
>>>>>>> Stashed changes

  if (!hasYouTubeApiKey()) {
    return NextResponse.json({ error: "Recommendations are not configured." }, { status: 503 });
  }

  try {
    const token = await getToken({ req: request, secret: process.env.JWT_SECRET });
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

    const seeds = buildGenreSeeds(mode === "personalized" ? profile : null);
    const groups = await Promise.all(
      seeds.map(({ query, reason, genre }) =>
        searchYouTube(query, reason, { seedQuery: query, genre }),
      ),
    );
    const playlists = await searchPlaylists(seeds[0].query);
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
  const token = await getToken({ req: request, secret: process.env.JWT_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  const body = await request.json();
  const genres = Array.isArray(body.genres)
    ? [...new Set(body.genres.filter((genre) => typeof genre === "string"))].slice(0, 12)
    : [];

  await dbConnect();
  const user = await User.findOne({ email: token.email });
  if (!user?.userData) {
    return NextResponse.json({ error: "User profile not found." }, { status: 404 });
  }
  const profile = await UserData.findByIdAndUpdate(
    user.userData,
    { $set: { genres } },
    { new: true, runValidators: true },
  ).lean();
  return NextResponse.json({ success: true, profile });
}