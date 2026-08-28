import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";

export function useSearch(query, filters = {}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settledQuery, setSettledQuery] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(withQuery("/api/tracks", { query, genre: filters.genre || "", sort: filters.sort || "relevance", limit: filters.limit || 30 }));
        if (active) {
          setResults(response.data || []);
          setError("");
        }
      } catch (requestError) {
        if (active) {
          setResults([]);
          setError(requestError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
          setSettledQuery(query);
        }
      }
    }, query ? 300 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, filters.genre, filters.sort, filters.limit]);

  const artists = [...new Map(results.map((track) => [track.artistName, { name: track.artistName, coverUrl: track.coverUrl }])).values()];
  const genres = [...new Set(results.flatMap((track) => track.genres || []))];
  return { results, artists, genres, loading, error, settledQuery };
}