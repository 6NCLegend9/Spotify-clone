import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";
import { useUser } from "../context/UserContext";

export function usePlaylists() {
  const { user } = useUser();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState(null);

  const refresh = async () => {
    if (!user) {
      setPlaylists([]);
      setNextCursor(null);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(withQuery("/api/playlists", { limit: 30, scope: "library" }));
      setPlaylists(response.data || []);
      setNextCursor(response.nextCursor || null);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [user?.id]);

  const loadMore = async () => {
    if (!user || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await api.get(withQuery("/api/playlists", { limit: 30, scope: "library", cursor: nextCursor }));
      setPlaylists((current) => [...current, ...(response.data || [])]);
      setNextCursor(response.nextCursor || null);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const createPlaylist = async (values) => {
    const response = await api.post("/api/playlists", values);
    setPlaylists((current) => [response.data, ...current]);
    return response.data;
  };

  const updatePlaylist = async (playlistId, values) => {
    const response = await api.patch(`/api/playlists/${playlistId}`, values);
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? response.data : playlist));
    return response.data;
  };

  const deletePlaylist = async (playlistId) => {
    const previous = playlists;
    setPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));
    try {
      await api.delete(`/api/playlists/${playlistId}`);
    } catch (requestError) {
      setPlaylists(previous);
      throw requestError;
    }
  };

  const addTracks = async (playlistId, trackIds) => {
    const response = await api.post(`/api/playlists/${playlistId}/items`, { trackIds });
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? { ...playlist, itemCount: playlist.itemCount + response.addedTrackIds.length } : playlist));
    return response;
  };

  return { playlists, loading, loadingMore, error, nextCursor, refresh, loadMore, createPlaylist, updatePlaylist, deletePlaylist, addTracks };
}