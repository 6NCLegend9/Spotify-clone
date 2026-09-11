"use client";

import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSession } from "next-auth/react";
import { setProgress } from "@/redux/features/loadingBarSlice";
import { setAutoAdd } from "@/redux/features/playerSlice";
import { requestJson } from "@/services/http";
import { getUserPlaylists } from "@/services/playlistApi";
import { toUserError } from "@/utils/userError";
import { accountOwner, readAccountCache, writeAccountCache } from "@/utils/accountCache.mjs";

const HOME_CACHE_KEY = "HeyKasa-home-recommendations-v3";
const HOME_CACHE_TTL = 5 * 60_000;

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

const readHomeCache = (owner) => {
  try {
    return readAccountCache(sessionStorage, HOME_CACHE_KEY, owner, HOME_CACHE_TTL);
  } catch {
    return null;
  }
};

const writeHomeCache = (owner, value) => {
  try {
    writeAccountCache(sessionStorage, HOME_CACHE_KEY, owner, value);
  } catch {
    // Storage may be unavailable.
  }
};

export default function useHomeFeed() {
  const dispatch = useDispatch();
  const { data: session, status } = useSession();
  const privateSession = useSelector((state) => state.settings.privateSession);
  const owner = accountOwner(session, status);
  const [home, setHome] = useState({ owner: null, data: null });
  const data = owner && home.owner === owner && home.privateSession === privateSession ? home.data : null;
  const [libraryOwner, setLibraryOwner] = useState(null);
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
    setHome({ owner, privateSession, data: null });
    setError(null);
    setLoading(true);
    if (!owner) return;
    const controller = new AbortController();
    let cancelled = false;
    const cached = privateSession ? null : readHomeCache(owner);
    if (cached) {
      setHome({ owner, privateSession, data: cached });
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
          setHome({ owner, privateSession, data: res });
          if (!privateSession) writeHomeCache(owner, res);
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
          if (!cached) setHome({ owner, privateSession, data: null });
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
    const onPreferencesChanged = () => {
      try { sessionStorage.removeItem(`${HOME_CACHE_KEY}:${encodeURIComponent(owner)}`); } catch {}
      setRetryKey((value) => value + 1);
    };
    window.addEventListener("favourites-changed", onPreferencesChanged);
    window.addEventListener("heykasa:preferences-changed", onPreferencesChanged);
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("favourites-changed", onPreferencesChanged);
      window.removeEventListener("heykasa:preferences-changed", onPreferencesChanged);
    };
  }, [dispatch, retryKey, owner, privateSession]);

  useEffect(() => {
    setLibraryOwner(owner);
    setHistory([]);
    setPlaylists([]);
    setReleases([]);
    try {
      localStorage.removeItem("songHistory");
      sessionStorage.removeItem("HeyKasa-home-recommendations-v2:authenticated");
    } catch {}
    if (!owner || owner === "guest") return undefined;
    try {
      setHistory(normalizeHistory(readAccountCache(localStorage, "heykasa:history:v1", owner, 30 * 86400_000)));
    } catch {}

    const controller = new AbortController();
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const json = await requestJson("/api/history", {
          signal: controller.signal,
          fallbackTitle: "Listen Again couldn’t sync",
          fallbackMessage: "Your saved listening history is still available on this device.",
        });
        const syncedHistory = normalizeHistory(json?.data);
        if (!cancelled && json?.success) {
          setHistory(syncedHistory);
          if (!privateSession) {
            try { writeAccountCache(localStorage, "heykasa:history:v1", owner, syncedHistory); } catch {}
          }
        }
      } catch {
        // Local history still fills Jump back in.
      }
    };

    const loadPlaylists = async () => {
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
    };

    const loadReleases = async () => {
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

    void loadHistory();
    void loadPlaylists();
    void loadReleases();

    const onPlaylistsChanged = () => {
      void getUserPlaylists().then((res) => {
        if (!cancelled && res?.success === true) {
          setPlaylists(
            Array.isArray(res.data?.playlists)
              ? res.data.playlists.filter(
                  (playlist) => playlist && typeof playlist === "object" && playlist._id,
                )
              : [],
          );
        }
      }).catch(() => {});
    };
    window.addEventListener("heykasa:playlists-changed", onPlaylistsChanged);

    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("heykasa:playlists-changed", onPlaylistsChanged);
    };
  }, [retryKey, owner, privateSession]);

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
    loading: !owner || home.owner !== owner || loading,
    refreshing,
    error: home.owner === owner ? error : null,
    retry: () => setRetryKey((value) => value + 1),
    isPersonalized,
    history: libraryOwner === owner ? history : [],
    playlists: libraryOwner === owner ? playlists : [],
    releases: libraryOwner === owner ? releases : [],
    ...feed,
    hasAny:
      (feed.trending?.length || 0) +
        (feed.charts?.length || 0) +
        (feed.newReleases?.length || 0) +
        (feed.featuredPlaylists?.length || 0) +
        (feed.genreSections || []).reduce((sum, section) => sum + (section.videos?.length || 0), 0) +
        (libraryOwner === owner ? history.length + playlists.length + releases.length : 0) >
      0,
  };
}
