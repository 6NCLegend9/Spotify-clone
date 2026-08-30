import yts from 'yt-search';

export function hasYouTubeApiKey() {
  return true; // yt-search doesn't need an API key!
}

export async function youtubeFetch(endpoint, params, fetchOptions) {
  try {
    if (endpoint === "search") {
      const query = params.q || "";
      const maxResults = parseInt(params.maxResults || "10", 10);
      const isPlaylist = params.type === "playlist";

      // Use yt-search to scrape YouTube
      const results = await yts(query);
      
      let items = [];
      if (isPlaylist) {
        items = results.playlists.slice(0, maxResults).map(p => ({
          id: { playlistId: p.listId },
          snippet: {
            title: p.title,
            channelTitle: p.author?.name || "YouTube",
            description: "",
            thumbnails: { high: { url: p.thumbnail } }
          }
        }));
      } else {
        items = results.videos.slice(0, maxResults).map(v => ({
          id: { videoId: v.videoId },
          snippet: {
            title: v.title,
            channelTitle: v.author?.name || "YouTube",
            description: v.description || "",
            publishedAt: v.ago || "",
            thumbnails: { high: { url: v.thumbnail } }
          },
          status: {
            embeddable: true,
            privacyStatus: "public",
          }
        }));
      }
      
      return { ok: true, status: 200, data: { items } };
    }
    
    // For 'videos' endpoint (trending or specific IDs)
    if (endpoint === "videos") {
        if (params.chart === "mostPopular") {
            // yt-search doesn't have a direct "trending" endpoint, so we simulate it with a broad search
            const results = await yts("Top songs this week");
            const items = results.videos.slice(0, parseInt(params.maxResults || "24", 10)).map(v => ({
                id: v.videoId, // Note: videos endpoint uses raw id, not id.videoId
                snippet: {
                  title: v.title,
                  channelTitle: v.author?.name || "YouTube",
                  description: v.description || "",
                  thumbnails: { high: { url: v.thumbnail } }
                },
                status: { embeddable: true, privacyStatus: "public" }
            }));
            return { ok: true, status: 200, data: { items } };
        }
    }

    return { ok: false, status: 404, data: null };
  } catch (err) {
    console.error("yt-search error:", err);
    return { ok: false, status: 502, data: null };
  }
}
