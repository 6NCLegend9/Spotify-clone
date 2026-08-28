import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";
import { useUser } from "../context/UserContext";

export function useRecommendations(windowType = "standard", limit = 12, revision = 0) {
  const { user } = useUser();
  const [recommendations, setRecommendations] = useState([]);
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((value) => value + 1);

  useEffect(() => {
    let active = true;
    if (!user) {
      setRecommendations([]);
      return () => { active = false; };
    }
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get(withQuery("/api/recommendations", { window: windowType, limit }));
        if (active) {
          setRecommendations(response.data || []);
          setPlaylist(response.playlist || null);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [user?.id, windowType, limit, revision, refreshKey]);

  return { recommendations, playlist, loading, error, refresh };
}