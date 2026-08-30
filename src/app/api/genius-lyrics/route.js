import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
  }

  const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;
  if (!GENIUS_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Missing Genius Access Token in environment variables" }, { status: 500 });
  }

  try {
    const searchRes = await axios.get(`https://api.genius.com/search`, {
      params: { q },
      headers: { Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}` }
    });

    const hits = searchRes.data.response.hits;
    if (hits.length === 0) {
      return NextResponse.json({ lyrics: "No lyrics found" });
    }

    const url = hits[0].result.url;
    
    // Unfortunately Genius API doesn't provide direct lyrics text, it only points to the URL.
    return NextResponse.json({ 
      url: url,
      title: hits[0].result.title,
      artist: hits[0].result.primary_artist.name,
      lyrics: "Genius doesn't return raw lyrics text via their API directly, you need to follow the URL to read them: \n\n" + url
    });

  } catch (error) {
    console.error("Genius API Error:", error.response?.data || error.message);
    return NextResponse.json({ error: "Failed to fetch from Genius API" }, { status: 500 });
  }
}
