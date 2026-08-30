import { NextResponse } from "next/server";
import { hasYouTubeApiKey, youtubeFetch } from "@/utils/youtubeApi";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function parseDuration(value = "") {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const [, hours = 0, minutes = 0, seconds = 0] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

export async function GET(request) {
  if (!hasYouTubeApiKey()) {
    return NextResponse.json(
      { error: "YouTube video details are not configured." },
      { status: 503 },
    );
  }

  const requestedIds = request.nextUrl.searchParams
    .getAll("id")
    .flatMap((value) => value.split(","));
  const ids = [...new Set(requestedIds.filter((id) => YOUTUBE_ID_PATTERN.test(id)))].slice(0, 50);

  if (ids.length === 0) {
    return NextResponse.json({ tracks: [] });
  }

  const params = {
    part: "snippet,contentDetails",
    id: ids.join(","),
  };

  try {
    const { ok, status, data } = await youtubeFetch("videos", params, { next: { revalidate: 3600 } });

    if (!ok) {
      return NextResponse.json(
        { error: "YouTube video details could not be loaded." },
        { status },
      );
    }

    const tracks = (data.items || []).map((item) => ({
      id: item.id,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      thumbnail:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url,
      duration: parseDuration(item.contentDetails?.duration),
    }));

    const order = new Map(ids.map((id, index) => [id, index]));
    tracks.sort((left, right) => order.get(left.id) - order.get(right.id));

    return NextResponse.json({ tracks });
  } catch (error) {
    console.error("YouTube video details error:", error);
    return NextResponse.json(
      { error: "Unable to reach YouTube." },
      { status: 502 },
    );
  }
}
