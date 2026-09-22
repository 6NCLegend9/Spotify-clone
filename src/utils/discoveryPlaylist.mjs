export function discoveryPlaylistHref(playlist) {
  if (!playlist.playlistId) return `/mix/${encodeURIComponent(playlist.id)}`;
  const params = new URLSearchParams({ title: playlist.title || "Playlist" });
  if (playlist.thumbnail) params.set("thumbnail", playlist.thumbnail);
  if (playlist.channel) params.set("creator", playlist.channel);
  return `/youtube-playlist/${encodeURIComponent(playlist.playlistId)}?${params}`;
}

export function mergePlaylistTracks(previous, incoming) {
  const seen = new Set();
  return [...previous, ...(Array.isArray(incoming) ? incoming : [])].filter((track) => {
    if (!track?.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export function collectionPlayback(collection, tracks, trackId) {
  const queue = mergePlaylistTracks([], tracks).map((track) => ({
    ...track, seedQuery: collection.query || collection.title, genre: collection.title,
  }));
  if (!queue.length) return null;
  return {
    queue, track: queue.find((track) => track.id === trackId) || queue[0],
    queueMode: "collection", autoExtend: false,
    context: { type: "playlist", id: String(collection.playlistId || collection.id), name: collection.title || "Playlist" },
  };
}
