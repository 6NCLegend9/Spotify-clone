"use client";

import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { setProgress } from "@/redux/features/loadingBarSlice";
import { setAutoAdd } from "@/redux/features/playerSlice";
import { requestJson } from "@/services/http";
import { getUserPlaylists } from "@/services/playlistApi";
import { toUserError } from "@/utils/userError";

const HOME_CACHE_KEY = "HeyKasa-home-recommendations-v2";

const normalizeHistory = (value) =>
  (Array.isArray(value) ? value : []).filter(
    (song) =>
      song &&
      typeof song === "object" &&
      ((typeof song.id === "string" && song.id.trim()) ||
        (typeof song.id === "number" && Number.isFinite(song.id))) &&
      ((typeof song.name === "string" && song.name.trim()) ||
        (typeof song.title === "string" && song.title.trim())),
  );

const readHomeCache = (status) => {
  try {
    const raw = sessionStorage.getItem(`${HOME_CACHE_KEY}:${status}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeHomeCache = (status, value) => {
  try {
    sessionStorage.setItem(`${HOME_CACHE_KEY}:${status}`, JSON.stringify(value));
  } catch {
    // Storage may be unavailable.
  }
};

export default function useHomeFeed() {
  const dispatch = useDispatch();
  const { status } = useSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [history, setHistory] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [releases, setReleases] = useState([]);

  useEffect(() => {
    try {
      dispatch(setAutoAdd(localStorage.getItem("autoAdd") === "true"));
    } catch {
      dispatch(setAutoAdd(false));
    }
  }, [dispatch]);

  useEffect(() => {
    if (status === "loading") return;
    const controller = new AbortController();
    let cancelled = false;
    const cached = readHomeCache(status);
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    const fetchData = async () => {
      setRefreshing(true);
      setError(null);
      if (!cached) {
        setLoading(true);
        dispatch(setProgress(70));
      }
      try {
        const res = await requestJson("/api/recommendations", {
          signal: controller.signal,
          fallbackTitle: "Home is temporarily unavailable",
          fallbackMessage: "We couldn’t load your recommendations. Please try again.",
        });
        if (cancelled) return;
        if (res?.sections) {
          setData(res);
          writeHomeCache(status, res);
        } else {
          throw toUserError(
            { code: "INTERNAL_ERROR" },
            {
              title: "Home is temporarily unavailable",
              message: "We couldn’t load your recommendations. Please try again.",
            },
          );
        }
      } catch (caught) {
        if (!cancelled && !controller.signal.aborted) {
          setError(
            toUserError(caught, {
              title: "Home is temporarily unavailable",
              message: "We couldn’t load your recommendations. Please try again.",
            }),
          );
          if (!cached) setData(null);
        }
      } finally {
        if (!cancelled) {
          dispatch(setProgress(100));
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dispatch, retryKey, status]);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      setHistory([]);
      setPlaylists([]);
      setReleases([]);
      try {
        localStorage.removeItem("songHistory");
      } catch {
        // Listening history is best-effort when browser storage is blocked.
      }
      return undefined;
    }

    try {
      setHistory(normalizeHistory(JSON.parse(localStorage.getItem("songHistory") || "[]")));
    } catch {
      setHistory([]);
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadAccount = async () => {
      try {
        const json = await requestJson("/api/history", {
          signal: controller.signal,
          fallbackTitle: "Listen Again couldn’t sync",
          fallbackMessage: "Your saved listening history is still available on this device.",
        });
        const syncedHistory = normalizeHistory(json?.data);
        if (!cancelled && json?.success && syncedHistory.length > 0) {
          setHistory(syncedHistory);
        }
      } catch {
        // Local history still fills Jump back in.
      }

      try {
        const res = await getUserPlaylists();
        if (!cancelled && res?.success === true) {
          setPlaylists(
            Array.isArray(res.data?.playlists)
              ? res.data.playlists.filter(
                  (playlist) => playlist && typeof playlist === "object" && playlist._id,
                )
              : [],
          );
        }
      } catch {
        if (!cancelled) setPlaylists([]);
      }

      try {
        const json = await requestJson("/api/followedArtists/releases", {
          signal: controller.signal,
          fallbackTitle: "New releases unavailable",
          fallbackMessage: "We couldn’t load new songs from artists you follow.",
        });
        if (cancelled) return;
        const list = Array.isArray(json?.releases) ? json.releases : [];
        setReleases(list);
      } catch {
        if (!cancelled) setReleases([]);
      }
    };

    void loadAccount();

    const onPlaylistsChanged = () => {
      void getUserPlaylists().then((res) => {
        if (res?.success === true) {
          setPlaylists(
            Array.isArray(res.data?.playlists)
              ? res.data.playlists.filter(
                  (playlist) => playlist && typeof playlist === "object" && playlist._id,
                )
              : [],
          );
        }
      });
    };
    window.addEventListener("heykasa:playlists-changed", onPlaylistsChanged);

    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("heykasa:playlists-changed", onPlaylistsChanged);
    };
  }, [retryKey, status]);

  const isPersonalized = data?.mode === "personalized";

  const feed = useMemo(() => {
    const sections = data?.sections || {};
    return {
      trending: sections.trending || [],
      charts: sections.charts || [],
      newReleases: sections.newReleases || [],
      featuredPlaylists: sections.featuredPlaylists || [],
      genreSections: Array.isArray(sections.genres) ? sections.genres : [],
    };
  }, [data]);

  return {
    status,
    loading,
    refreshing,
    error,
    retry: () => setRetryKey((value) => value + 1),
    isPersonalized,
    history,
    playlists,
    releases,
    ...feed,
    hasAny:
      (feed.trending?.length || 0) +
        (feed.charts?.length || 0) +
        (feed.newReleases?.length || 0) +
        (feed.featuredPlaylists?.length || 0) +
        genreSections.reduce((sum, section) => sum + (section.videos?.length || 0), 0) +
        history.length +
        playlists.length +
        releases.length >
      0,
  };
}
