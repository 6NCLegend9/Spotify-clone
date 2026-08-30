import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";
import { getClientKey, isRateLimited } from "@/utils/rateLimit";

export const runtime = "nodejs";

export async function GET(request) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const type = request.nextUrl.searchParams.get("type") || "video";

  if (!query) {
    return NextResponse.json({ error: "A search query is required." }, { status: 400 });
  }

  if (query.length > 100 || !["video", "playlist"].includes(type)) {
    return NextResponse.json({ error: "Invalid search parameters." }, { status: 400 });
  }

  if (isRateLimited(getClientKey(request), { windowMs: 60_000, max: 30 })) {
    return NextResponse.json({ error: "Too many search requests. Please slow down." }, { status: 429 });
  }

  if (!hasYouTubeApiKey()) {
    return NextResponse.json(
      { error: "YouTube search is not configured." },
      { status: 503 },
    );
  }

  const params = {
    part: "snippet",
    type,
    maxResults: "12",
    q: type === "video" ? `${query} official audio` : query,
  };
  if (type === "video") {
    params.videoCategoryId = "10";
    params.videoEmbeddable = "true";
    params.videoSyndicated = "true";
  }

  try {
    const { ok, status, data } = await youtubeFetch("search", params, { next: { revalidate: 3600 } });

    if (!ok) {
      return NextResponse.json(
        { error: "YouTube search failed." },
        { status },
      );
    }

    const results = (data.items || [])
      .filter((item) => item.id?.videoId || item.id?.channelId || item.id?.playlistId)
      .map((item) => ({
        id: item.id.videoId || item.id.channelId || item.id.playlistId,
        type,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnail:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url,
        seedQuery: query,
        genre: query,
      }));

    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("YouTube search error:", error);
    return NextResponse.json(
      { error: "Unable to reach YouTube." },
      { status: 502 },
    );
  }
}

