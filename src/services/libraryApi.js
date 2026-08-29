const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function validYouTubeIds(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && YOUTUBE_ID_PATTERN.test(value)))];
}

export async function hydrateYouTubeTracks(values = []) {
  const ids = validYouTubeIds(values);
  const batches = [];

  for (let index = 0; index < ids.length; index += 50) {
    batches.push(ids.slice(index, index + 50));
  }

  const responses = await Promise.all(
    batches.map(async (batch) => {
      const params = new URLSearchParams();
      batch.forEach((id) => params.append("id", id));
      const response = await fetch(`/api/youtube-videos?${params}`);
      if (!response.ok) throw new Error("Saved tracks could not be loaded.");
      const data = await response.json();
      return data.tracks || [];
    }),
  );

  const tracksById = new Map(responses.flat().map((track) => [track.id, track]));
  return ids.map((id) => tracksById.get(id)).filter(Boolean);
}

export async function getFavouriteLibrary() {
  const response = await fetch("/api/favourite");
  if (!response.ok) throw new Error("Liked Songs could not be loaded.");
  const data = await response.json();
  return data.data || { favourites: [], favouriteAddedAt: {} };
}

export async function getPublicLibrary() {
  const response = await fetch("/api/recommendations");
  if (!response.ok) throw new Error("Featured playlists could not be loaded.");
  return response.json();
}

export function valueFromDateMap(dateMap, id) {
  if (!dateMap) return null;
  if (dateMap instanceof Map) return dateMap.get(id) || null;
  return dateMap[id] || null;
}