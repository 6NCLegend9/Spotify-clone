import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

export async function GET(request) {
  if (isRateLimited(getClientKey(request), { windowMs: 60_000, max: 30 })) {
    return NextResponse.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429 });
  }

  if (!hasYouTubeApiKey()) {
    return NextResponse.json(
      { error: "YouTube playlists are not configured." },
      { status: 503 },
    );
  }

  const playlistId = request.nextUrl.searchParams.get("id");
  if (!playlistId || !PLAYLIST_ID_PATTERN.test(playlistId)) {
    return NextResponse.json({ error: "A valid playlist id is required." }, { status: 400 });
  }

  const params = {
    part: "snippet,status",
    playlistId,
    maxResults: "25",
  };

  try {
    const { ok, status, data } = await youtubeFetch("playlistItems", params, { next: { revalidate: 900 } });

    if (!ok) {
      return NextResponse.json(
        { error: "This playlist could not be loaded." },
        { status },
      );
    }

    const tracks = (data.items || [])
      .filter((item) => item.snippet?.resourceId?.videoId && item.status?.privacyStatus === "public")
      .map((item) => ({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        channel: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
        thumbnail:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url,
      }));

    return NextResponse.json({ tracks });
  } catch (error) {
    console.error("YouTube playlist error:", error);
    return NextResponse.json({ error: "Unable to reach YouTube." }, { status: 502 });
  }
}

