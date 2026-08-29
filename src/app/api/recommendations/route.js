import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import UserData from "@/models/UserData";
import dbConnect from "@/utils/dbconnect";

const GUEST_SEEDS = ["top English songs", "new English music", "English indie music"];
const DEFAULT_GENRES = ["pop", "rock", "hip hop", "electronic"];

function normalizeVideo(item, reason) {
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
  };
}

async function searchYouTube(query, apiKey, reason) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "8",
    q: `${query} official music`,
    key: apiKey,
  });
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`,
    { next: { revalidate: 300 } },
  );
  if (!response.ok) return [];
  const data = await response.json();
  return (data.items || [])
    .filter((item) => item.id?.videoId)
    .map((item) => normalizeVideo(item, reason));
}

async function getPopularMusic(apiKey) {
  const params = new URLSearchParams({
    part: "snippet,status",
    chart: "mostPopular",
    videoCategoryId: "10",
    regionCode: "US",
    maxResults: "24",
    key: apiKey,
  });
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${params}`,
    { next: { revalidate: 900 } },
  );
  if (!response.ok) return [];
  const data = await response.json();
  return (data.items || [])
    .filter(
      (item) =>
        item.id &&
        item.status?.embeddable &&
        item.status?.privacyStatus === "public",
    )
    .map((item) => normalizeVideo(item, "Trending on YouTube"));
}

async function searchPlaylists(query, apiKey) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "playlist",
    maxResults: "6",
    q: `${query} official playlist`,
    key: apiKey,
  });
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`,
    { next: { revalidate: 300 } },
  );
  if (!response.ok) return [];
  const data = await response.json();
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

export async function GET(request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
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

    const genres = profile?.genres?.length ? profile.genres : DEFAULT_GENRES;
    const seeds = mode === "personalized"
      ? genres.slice(0, 3).map((genre) => ({ query: genre, reason: `Based on your ${genre} taste` }))
      : GUEST_SEEDS.map((query) => ({ query, reason: "Editorial pick for everyone" }));
    const groups = await Promise.all(
      seeds.map(({ query, reason }) => searchYouTube(query, apiKey, reason)),
    );
    const playlists = await searchPlaylists(seeds[0].query, apiKey);
    const excluded = new Set(profile?.notInterested || []);
    const snoozed = new Set(profile?.snoozedTracks || []);
    const recent = new Set((profile?.songHistory || []).map((song) => song?.id || song));
    const explicitDisabled = mode === "guest" || profile?.settings?.explicitContent === false;
    const filterRecommendations = (videos) => videos
      .filter((video) => !excluded.has(video.id) && !snoozed.has(video.id) && !recent.has(video.id))
      .filter((video) => !explicitDisabled || !/explicit|uncensored|18\+/i.test(`${video.title} ${video.description}`))
      .filter((video, index, all) => all.findIndex((item) => item.id === video.id) === index);
    let source = "search";
    let recommendations = filterRecommendations(groups.flat());

    if (recommendations.length === 0) {
      source = "youtube-chart";
      recommendations = filterRecommendations(await getPopularMusic(apiKey));
    }
    recommendations = recommendations.slice(0, 24);

    return NextResponse.json({
      mode,
      source,
      sections: {
        trending: recommendations.slice(0, 8),
        charts: recommendations.slice(8, 16),
        newReleases: recommendations.slice(16, 24),
        featuredPlaylists: playlists,
      },
      profile: profile
        ? {
            genres: profile.genres || [],
            explicitContent: profile.settings?.explicitContent ?? profile.explicitContent,
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
    { $set: { genres, explicitContent: Boolean(body.explicitContent) } },
    { new: true, runValidators: true },
  ).lean();
  return NextResponse.json({ success: true, profile });
}