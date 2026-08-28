import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";

const emptyResults = { tracks: [], artists: [], albums: [], playlists: [], genres: [] };

export function useGroupedSearch(query, limit = 8) {
  const [results, setResults] = useState(emptyResults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settledQuery, setSettledQuery] = useState("");

  useEffect(() => {
    let active = true;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setResults(emptyResults);
      setError("");
      setLoading(false);
      setSettledQuery("");
      return () => { active = false; };
    }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(withQuery("/api/search", { query: normalizedQuery, limit }));
        if (!active) return;
        setResults({
          tracks: response.tracks || [],
          artists: response.artists || [],
          albums: response.albums || [],
          playlists: response.playlists || [],
          genres: response.genres || [],
        });
        setError("");
      } catch (requestError) {
        if (!active) return;
        setResults(emptyResults);
        setError(requestError.message || "Search is unavailable");
      } finally {
        if (active) {
          setLoading(false);
          setSettledQuery(query);
        }
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, limit]);

  return { ...results, loading, error, settledQuery };
}