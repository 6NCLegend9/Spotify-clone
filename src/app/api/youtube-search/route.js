import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";

export async function GET(request) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const type = request.nextUrl.searchParams.get("type") || "video";

  if (!query) {
    return NextResponse.json({ error: "A search query is required." }, { status: 400 });
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
      }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("YouTube search error:", error);
    return NextResponse.json(
      { error: "Unable to reach YouTube." },
      { status: 502 },
    );
  }
}

