import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";

const emptyVideos = [];

export function useYouTubeSearch(query, limit = 12) {
  const [videos, setVideos] = useState(emptyVideos);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      setVideos(emptyVideos);
      setLoading(false);
      setError("");
      return () => { active = false; };
    }

    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(withQuery("/api/youtube/search", { query: normalizedQuery, limit }));
        if (!active) return;
        setVideos(response.data || []);
        setError("");
      } catch (requestError) {
        if (!active) return;
        setVideos(emptyVideos);
        setError(requestError.message || "YouTube search is unavailable");
      } finally {
        if (active) setLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, limit]);

  return { videos, loading, error };
}

export function useYouTubeTrending(limit = 8, region = "US") {
  const [videos, setVideos] = useState(emptyVideos);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get(withQuery("/api/youtube/trending", { limit, region }));
        if (!active) return;
        setVideos(response.data || []);
        setError("");
      } catch (requestError) {
        if (!active) return;
        setVideos(emptyVideos);
        setError(requestError.message || "YouTube videos are unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [limit, region]);

  return { videos, loading, error };
}