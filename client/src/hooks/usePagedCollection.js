import { useEffect, useState } from "react";
import { api, withQuery } from "../lib/api";
import { useUser } from "../context/UserContext";

export function usePagedCollection(endpoint, query = {}, { enabled = true, pageSize = 30 } = {}) {
  const { user } = useUser();
  const queryKey = JSON.stringify(query);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState(null);

  const refresh = async () => {
    if (!user || !enabled) return;
    setLoading(true);
    try {
      const response = await api.get(withQuery(endpoint, { ...query, limit: pageSize }));
      setData(response.data || []);
      setNextCursor(response.nextCursor || null);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "This library collection is unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setData([]);
      setNextCursor(null);
      return;
    }
    refresh();
  }, [user?.id, endpoint, queryKey, enabled]);

  const loadMore = async () => {
    if (!user || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await api.get(withQuery(endpoint, { ...query, limit: pageSize, cursor: nextCursor }));
      setData((current) => [...current, ...(response.data || [])]);
      setNextCursor(response.nextCursor || null);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load more results");
    } finally {
      setLoadingMore(false);
    }
  };

  return { data, loading, loadingMore, error, nextCursor, refresh, loadMore };
}