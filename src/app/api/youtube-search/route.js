import { NextResponse } from "next/server";

export async function GET(request) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const type = request.nextUrl.searchParams.get("type") || "video";
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!query) {
    return NextResponse.json({ error: "A search query is required." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube search is not configured." },
      { status: 503 },
    );
  }

  const params = new URLSearchParams({
    part: "snippet",
    type,
    maxResults: "12",
    q: type === "video" ? `${query} official audio` : query,
    key: apiKey,
  });
  if (type === "video") params.set("videoCategoryId", "10");

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
      { next: { revalidate: 300 } },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "YouTube search failed." },
        { status: response.status },
      );
    }

    const data = await response.json();
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
