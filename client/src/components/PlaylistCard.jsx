import { useState } from "react";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../context/ToastContext";
import { navigate } from "../hooks/useHashRoute";
import { api, withQuery } from "../lib/api";
import { Icon } from "./Icon";

async function loadPlaylistTracks(playlistId) {
  const tracks = [];
  const seenCursors = new Set();
  let cursor = null;

  while (true) {
    const response = await api.get(withQuery(`/api/playlists/${playlistId}/items`, { limit: 50, cursor }));
    tracks.push(...(response.data || []));
    const nextCursor = response.nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) return tracks;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
}

export function PlaylistCard({ playlist, subtitle }) {
  const { play } = usePlayer();
  const { notify } = useToast();
  const [startingPlayback, setStartingPlayback] = useState(false);

  const playPlaylist = async (event) => {
    event.stopPropagation();
    if (startingPlayback) return;
    setStartingPlayback(true);
    try {
      const tracks = await loadPlaylistTracks(playlist.id);
      if (!tracks.length) {
        notify("This playlist has no songs yet");
        return;
      }
      play(tracks[0], tracks, 0, { type: "playlist", refId: playlist.id });
    } catch (error) {
      notify(error.message || "Unable to start playlist", "error");
    } finally {
      setStartingPlayback(false);
    }
  };

  return <article className="playlist-card">
    <button className="playlist-card-main" onClick={() => navigate(`/playlist/${playlist.id}`)}>
      <img src={playlist.coverUrl || "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=800&q=80"} alt="" />
      <span className="playlist-card-copy"><strong>{playlist.name}</strong><small>{subtitle || playlist.description || `${playlist.itemCount} songs`}</small></span>
    </button>
    <button className="playlist-play" aria-label={`Play ${playlist.name}`} title="Play playlist" onClick={playPlaylist} disabled={startingPlayback}><Icon name={startingPlayback ? "loading" : "play"} /></button>
  </article>;
}