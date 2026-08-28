import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";
import { useUser } from "../context/UserContext";

export function useLikedTracks() {
  const { user } = useUser();
  const [likedTracks, setLikedTracks] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState(null);

  const refresh = async () => {
    if (!user) {
      setLikedTracks([]);
      setLikedIds(new Set());
      setNextCursor(null);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(withQuery("/api/likes", { limit: 30 }));
      const tracks = response.data || [];
      setLikedTracks(tracks);
      setLikedIds(new Set(tracks.map((track) => track.id)));
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
      const response = await api.get(withQuery("/api/likes", { limit: 30, cursor: nextCursor }));
      const tracks = response.data || [];
      setLikedTracks((current) => [...current, ...tracks]);
      setLikedIds((current) => new Set([...current, ...tracks.map((track) => track.id)]));
      setNextCursor(response.nextCursor || null);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleLike = async (track) => {
    if (!user || !track?.id) throw new Error("A demo session is required to save songs");
    const wasLiked = likedIds.has(track.id);
    const previousTracks = likedTracks;
    const previousIds = likedIds;
    const nextIds = new Set(likedIds);
    if (wasLiked) nextIds.delete(track.id); else nextIds.add(track.id);
    setLikedIds(nextIds);
    setLikedTracks((current) => wasLiked ? current.filter((item) => item.id !== track.id) : [{ ...track, likedAt: new Date().toISOString() }, ...current]);

    try {
      if (wasLiked) await api.delete(`/api/likes/${track.id}`); else await api.post(`/api/likes/${track.id}`);
      return !wasLiked;
    } catch (requestError) {
      setLikedIds(previousIds);
      setLikedTracks(previousTracks);
      throw requestError;
    }
  };

  return { likedTracks, likedIds, loading, loadingMore, error, nextCursor, refresh, loadMore, toggleLike };
}