import { NextResponse } from "next/server";

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

export async function GET(request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube playlists are not configured." },
      { status: 503 },
    );
  }

  const playlistId = request.nextUrl.searchParams.get("id");
  if (!playlistId || !PLAYLIST_ID_PATTERN.test(playlistId)) {
    return NextResponse.json({ error: "A valid playlist id is required." }, { status: 400 });
  }

  const params = new URLSearchParams({
    part: "snippet,status",
    playlistId,
    maxResults: "25",
    key: apiKey,
  });

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
      { next: { revalidate: 900 } },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "This playlist could not be loaded." },
        { status: response.status },
      );
    }

    const data = await response.json();
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
