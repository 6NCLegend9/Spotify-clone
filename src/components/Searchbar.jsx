"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import ItemMenu from "@/components/ItemMenu";
import { FiArrowLeft, FiArrowUpLeft, FiSearch, FiX } from "react-icons/fi";
import { BsPlayFill } from "react-icons/bs";
import { HiOutlineViewGrid, HiViewGrid } from "react-icons/hi";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useDispatch, useSelector } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import { playPause, startYoutubePlayback } from "@/redux/features/playerSlice";
import MediaImage from "@/components/MediaImage";
import AddToQueueButton from "@/components/AddToQueueButton";
import FavouriteTrackButton from "@/components/FavouriteTrackButton";
import { requestJson } from "@/services/http";
import { buildYoutubeSearchUrl } from "@/utils/youtubeSearchUrl.mjs";
import { interactiveYoutubeSearchCache, normalizeSearchRequestKey } from "@/utils/searchRequestCache.mjs";
import { artistPageHref } from "@/utils/artistNavigation.mjs";
import { cleanArtist, cleanTitle } from "@/utils/text";
import useMediaQuery from "@/hooks/useMediaQuery";
import { PHONE_QUERY } from "@/utils/responsivePolicy.mjs";
import { isTrackAllowed } from "@/utils/explicitContent.mjs";
import styles from "./Search/search.module.css";
import { uniqueSearchResults } from "@/utils/searchResults.mjs";

const Searchbar = () => {
  const { data: session, status } = useSession();
  const accountKey = status === "loading"
    ? null
    : session?.user?.id || session?.user?.email || "anonymous";
  return <AccountSearchbar accountKey={accountKey} />;
};

const AccountSearchbar = ({ accountKey }) => {
  const dispatch = useDispatch();
  const playingId = useSelector(state => state.player.youtubeVideo?.id);
  const allowExplicit = useSelector((state) => state.settings.explicitContent === true);
  const privateSession = useSelector((state) => state.settings.privateSession === true);
  const router = useRouter();
  const pathname = usePathname();
  const browseActive = pathname === "/search";
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [songs, setSongs] = useState([]);
  const [suggestionArtists, setSuggestionArtists] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsRetry, setSuggestionsRetry] = useState(0);
  const [recentQueries, setRecentQueries] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const inputId = useId();
  const listboxId = useId();
  const abortRef = useRef(null);
  const recentsAbortRef = useRef(null);
  const recentsLoadedAtRef = useRef(0);
  const activeAccountRef = useRef(null);
  const resolvedAccountRef = useRef(null);
  const inputRef = useRef(null);
  const openingNavbarRef = useRef(null);
  const blurTimerRef = useRef(null);
  const desktopSearchTimerRef = useRef(null);
  const clusterRef = useRef(null);
  const [compactPlaceholder, setCompactPlaceholder] = useState(false);
  const [overlayBox, setOverlayBox] = useState({ top: 64, bottom: 0 });
  const overlaySuggestions = useMediaQuery(PHONE_QUERY);

  useLayoutEffect(() => {
    activeAccountRef.current = accountKey;
    const previousAccount = resolvedAccountRef.current;
    if (!accountKey) {
      if (!previousAccount) return;
      window.clearTimeout(desktopSearchTimerRef.current);
      abortRef.current?.abort();
      recentsAbortRef.current?.abort();
      recentsAbortRef.current = null;
      recentsLoadedAtRef.current = 0;
      setOpen(false);
      setActiveIndex(-1);
      setSongs([]);
      setSuggestionArtists([]);
      setSearchTerm("");
      setRecentQueries([]);
      setRecentLoading(false);
      return;
    }

    resolvedAccountRef.current = accountKey;
    if (!previousAccount || previousAccount === accountKey) return;

    window.clearTimeout(desktopSearchTimerRef.current);
    abortRef.current?.abort();
    recentsAbortRef.current?.abort();
    recentsAbortRef.current = null;
    recentsLoadedAtRef.current = 0;
    setSearchTerm("");
    setOpen(false);
    setActiveIndex(-1);
    setSongs([]);
    setSuggestionArtists([]);
    setRecentQueries([]);
    setRecentLoading(false);
  }, [accountKey]);

  useEffect(() => { window.clearTimeout(desktopSearchTimerRef.current); }, [pathname]);

  useEffect(() => () => {
    abortRef.current?.abort();
    recentsAbortRef.current?.abort();
    window.clearTimeout(blurTimerRef.current);
    window.clearTimeout(desktopSearchTimerRef.current);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const isModK = (event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K");
      const isSlash = event.key === "/" && !isEditable && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (isModK || isSlash) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpenSearch = () => {
      const input = inputRef.current;
      if (!input) return;
      const navbar = input.closest(".app-navbar");
      if (!input.getClientRects().length && navbar?.closest('[data-route="home"]')) {
        // Reveal before focusing so mobile keyboards retain the original tap gesture.
        navbar.setAttribute("data-search-opening", "true");
        openingNavbarRef.current = navbar;
      }
      input.focus({ preventScroll: true });
      input.select();
    };
    window.addEventListener("heykasa:open-search", onOpenSearch);
    return () => {
      window.removeEventListener("heykasa:open-search", onOpenSearch);
      openingNavbarRef.current?.removeAttribute("data-search-opening");
    };
  }, []);

  useLayoutEffect(() => {
    if (pathname === "/" && open) return;
    openingNavbarRef.current?.removeAttribute("data-search-opening");
    openingNavbarRef.current = null;
  }, [pathname, open]);

  useEffect(() => {
    const node = inputRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width || 0;
      setCompactPlaceholder(width > 0 && width < 196);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    if (pathname === "/search") {
      setSearchTerm("");
      return;
    }
    if (!pathname?.startsWith("/search/")) return;
    const encoded = pathname.slice("/search/".length);
    try {
      setSearchTerm(decodeURIComponent(encoded.replace(/\+/g, " ")).trim());
    } catch {
      setSearchTerm("");
    }
  }, [pathname]);

  const removeRecent = async (term) => {
    const requestAccount = accountKey;
    await requestJson("/api/searches", { method: "DELETE", body: { term } });
    if (!requestAccount || activeAccountRef.current !== requestAccount) return;
    setRecentQueries((queries) => queries.filter((value) => value.toLowerCase() !== term.toLowerCase()));
    setActiveIndex(-1);
    recentsLoadedAtRef.current = 0;
  };

  const loadRecents = useCallback(async () => {
    const requestAccount = accountKey;
    if (!requestAccount || privateSession) return;
    const now = Date.now();
    if (recentLoading || now - recentsLoadedAtRef.current < 15_000) return;

    recentsAbortRef.current?.abort();
    const controller = new AbortController();
    recentsAbortRef.current = controller;
    recentsLoadedAtRef.current = now;
    setRecentLoading(true);
    try {
      const data = await requestJson("/api/searches", { signal: controller.signal });
      if (controller.signal.aborted || activeAccountRef.current !== requestAccount) return;
      const searches = Array.isArray(data?.data) ? data.data : [];
      setRecentQueries(searches.filter((query) => typeof query === "string" && query.trim()).slice(0, 8));
    } catch {
      if (!controller.signal.aborted && activeAccountRef.current === requestAccount) {
        setRecentQueries([]);
      }
    } finally {
      if (recentsAbortRef.current === controller) recentsAbortRef.current = null;
      if (!controller.signal.aborted && activeAccountRef.current === requestAccount) {
        setRecentLoading(false);
      }
    }
  }, [accountKey, privateSession, recentLoading]);

  useEffect(() => {
    if (!accountKey || !open || searchTerm.trim()) return;
    void loadRecents();
  }, [accountKey, loadRecents, open, searchTerm]);

  useEffect(() => {
    const term = searchTerm.trim();
    setSongs([]);
    setSuggestionArtists([]);
    setSuggestionsError(false);
    if (!open || !overlaySuggestions || term.length < 2) {
      setSuggestionsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setSuggestionsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const key = normalizeSearchRequestKey({ purpose: "interactive", query: term });
        const load = (type) => interactiveYoutubeSearchCache.getOrCreate(`${key}:${type}`,
          (signal) => requestJson(buildYoutubeSearchUrl({ type, q: term }, "interactive"), {
            signal, fallbackTitle: "Search unavailable", fallbackMessage: "We couldn’t load suggestions.",
          }), { signal: controller.signal });
        const [videos, channels] = await Promise.allSettled([load("video"), load("channel")]);
        if (controller.signal.aborted) return;
        setSuggestionsError(videos.status === "rejected" || channels.status === "rejected");
        setSongs(videos.status === "fulfilled" ? uniqueSearchResults(videos.value?.results).slice(0, 7) : []);
        setSuggestionArtists(channels.status === "fulfilled" ? uniqueSearchResults(channels.value?.results).slice(0, 2) : []);
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchTerm, open, accountKey, suggestionsRetry, overlaySuggestions]);

  const scheduleDesktopSearch = (value) => {
    window.clearTimeout(desktopSearchTimerRef.current);
    if (overlaySuggestions) return;
    const term = value.trim().slice(0, 100);
    if (term.length === 1 || (!term && !pathname?.startsWith("/search/"))) return;
    const target = term ? `/search/${encodeURIComponent(term)}` : "/search";
    if (pathname === target) return;
    desktopSearchTimerRef.current = window.setTimeout(() => router.replace(target, { scroll: false }), 350);
  };

  useEffect(() => { if (!open) window.clearTimeout(desktopSearchTimerRef.current); }, [open]);

  const items = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return (privateSession ? [] : recentQueries).map((query, index) => ({ type: "recent-query", key: `recent-query-${index}-${query}`, query }));
    if (term.length < 2) return [];
    const eligibleSongs = songs.filter((song) => isTrackAllowed(song, allowExplicit));
    const candidates = [term, ...(privateSession ? [] : recentQueries.filter(query => query.toLocaleLowerCase().includes(term.toLocaleLowerCase()))),
      ...eligibleSongs.map(song => { const title = cleanTitle(song.title || song.name); return title.toLocaleLowerCase().includes(term.toLocaleLowerCase()) ? title : `${term} ${title}`; })];
    const seen = new Set();
    const queries = candidates.map(query => query.slice(0, 100)).filter(query => { const key = query.trim().toLocaleLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; }).slice(0, 5);
    return [
      ...queries.map(query => ({ type: "query", key: `query-${query}`, query })),
      ...suggestionArtists.map(artist => ({ type: "artist", key: `artist-${artist.id}`, artist })),
      ...eligibleSongs.map(song => ({ type: "song", key: `song-${song.id}`, song })),
    ];
  }, [searchTerm, songs, suggestionArtists, recentQueries, allowExplicit, privateSession]);

  const recordSearch = (term) => {
    if (accountKey && activeAccountRef.current === accountKey && accountKey !== "anonymous" && !privateSession) {
      void requestJson("/api/searches", { method: "POST", body: { term: term.trim().slice(0, 100) } }).catch(() => {});
      recentsLoadedAtRef.current = 0;
    }
  };

  const go = (query) => {
    window.clearTimeout(desktopSearchTimerRef.current);
    const next = String(query || "").trim().slice(0, 100);
    if (!next) return;
    setSearchTerm(next);
    setOpen(false);
    setActiveIndex(-1);
    dispatch(setIsTyping(false));
    router.push(`/search/${encodeURIComponent(next)}`);
  };

  const playSong = (song) => {
    if (!song?.id) return;
    const title = cleanTitle(song.title || song.name, "Song");
    const artist = cleanArtist(song.channel || song.artist || song.author);
    const seedQuery = song.seedQuery || song.genre || [artist, title].filter(Boolean).join(" ");
    const track = {
      ...song,
      title,
      channel: artist || song.channel,
      seedQuery,
      genre: song.genre || artist || seedQuery,
    };
    dispatch(startYoutubePlayback({ queue: [track], track }));
    dispatch(playPause(true));
    setOpen(false);
    setActiveIndex(-1);
    dispatch(setIsTyping(false));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    go(searchTerm);
  };

  const selectItem = (item) => {
    if (!item) return;
    if (item.type === "recent-query" || item.type === "query") go(item.query);
    else if (item.type === "artist") {
      setOpen(false); setActiveIndex(-1); dispatch(setIsTyping(false));
      recordSearch(searchTerm || item.artist.title);
      router.push(artistPageHref(item.artist.id, item.artist.title));
    } else playSong(item.song);
  };

  const showRecentState = open && !searchTerm.trim() && !privateSession;
  const suggestionsVisible = open && (overlaySuggestions || !searchTerm.trim());
  const selectedIndex = activeIndex >= 0 && activeIndex < items.length ? activeIndex : -1;

  useEffect(() => {
    if (open && selectedIndex >= 0 && document.activeElement === inputRef.current) {
      document.getElementById(`${listboxId}-option-${selectedIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, selectedIndex, listboxId]);

  useEffect(() => {
    if (!privateSession) return;
    recentsAbortRef.current?.abort();
    recentsLoadedAtRef.current = 0;
    setRecentQueries([]);
    setRecentLoading(false);
  }, [privateSession]);

  const isSearchUi = (node) => {
    if (!(node instanceof Element)) return false;
    return Boolean(
      clusterRef.current?.contains(node)
      || node.closest("[data-search-suggest='true']")
      || node.closest('[data-track-actions-portal="true"]')
      || node.closest('[data-item-actions-menu="true"]'),
    );
  };

  useLayoutEffect(() => {
    if (!open || !overlaySuggestions) return undefined;
    const syncBox = () => {
      const nav = document.querySelector(".app-navbar");
      const chrome = [document.querySelector(".app-player"), document.querySelector(".app-tabbar")].find(node => node?.getBoundingClientRect().height > 0);
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
      const top = Math.max(viewportTop, nav?.getBoundingClientRect().bottom || 56);
      const bottom = Math.min(viewportBottom, chrome?.getBoundingClientRect().top || window.innerHeight);
      setOverlayBox({ top: Math.round(top), bottom: Math.max(0, Math.round(window.innerHeight - Math.max(top, bottom))) });
    };
    syncBox();
    window.addEventListener("resize", syncBox);
    window.visualViewport?.addEventListener("resize", syncBox);
    window.visualViewport?.addEventListener("scroll", syncBox);
    const observer = new ResizeObserver(syncBox);
    document.querySelectorAll(".app-player, .app-tabbar").forEach(node => observer.observe(node));
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBox);
      window.visualViewport?.removeEventListener("resize", syncBox);
      window.visualViewport?.removeEventListener("scroll", syncBox);
    };
  }, [open, overlaySuggestions]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (isSearchUi(event.target)) return;
      setOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const closeAfterBlur = () => {
    const finish = () => {
      if (document.querySelector('[data-track-actions-portal="true"], [data-item-actions-menu="true"]')) {
        blurTimerRef.current = window.setTimeout(finish, 100);
        return;
      }
      if (isSearchUi(document.activeElement)) return;
      setOpen(false);
      setActiveIndex(-1);
    };
    window.clearTimeout(blurTimerRef.current);
    blurTimerRef.current = window.setTimeout(finish, 150);
  };

  return (
    <form ref={clusterRef} role="search" aria-label="Search music" onSubmit={handleSubmit} autoComplete="off" className="search-cluster-form">
      <div className={`search-field ${browseActive ? "is-browse" : ""}`}>
        {overlaySuggestions && open && <button type="button" aria-label="Close search suggestions" className={styles.backButton} onClick={() => { setOpen(false); setActiveIndex(-1); inputRef.current?.blur(); }}><FiArrowLeft aria-hidden="true" /></button>}
        <label htmlFor={inputId} className="search-field-icon-hit">
          <FiSearch aria-hidden="true" className="search-field-icon" />
          <span className="sr-only">Search songs, artists, playlists, and genres</span>
        </label>
        <input
          id={inputId}
          ref={inputRef}
          name="search-field"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck="false"
          maxLength={100}
          placeholder={compactPlaceholder ? "Search" : "What do you want to play?"}
          value={searchTerm}
          role="combobox"
          aria-busy={suggestionsLoading}
          aria-autocomplete="list"
          aria-haspopup="grid"
          aria-expanded={suggestionsVisible}
          aria-controls={suggestionsVisible ? listboxId : undefined}
          aria-activedescendant={suggestionsVisible && selectedIndex >= 0 ? `${listboxId}-option-${selectedIndex}` : undefined}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            scheduleDesktopSearch(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            dispatch(setIsTyping(true));
            setOpen(true);
            void loadRecents();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (open) event.preventDefault();
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (event.key === "ArrowDown" && suggestionsVisible && items.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => index < 0 || index >= items.length - 1 ? 0 : index + 1);
              return;
            }
            if (event.key === "ArrowUp" && suggestionsVisible && items.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => index <= 0 ? items.length - 1 : index - 1);
              return;
            }
            if (event.key === "Home" && suggestionsVisible && items.length > 0) {
              event.preventDefault();
              setActiveIndex(0);
              return;
            }
            if (event.key === "End" && suggestionsVisible && items.length > 0) {
              event.preventDefault();
              setActiveIndex(items.length - 1);
              return;
            }
            if (event.key === "Enter" && suggestionsVisible && selectedIndex >= 0) {
              event.preventDefault();
              selectItem(items[selectedIndex]);
            }
          }}
          onBlur={() => {
            dispatch(setIsTyping(false));
            closeAfterBlur();
          }}
          className="search-field-input"
        />
        {searchTerm ? (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            title="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setSearchTerm("");
              scheduleDesktopSearch("");
              setSongs([]);
              setOpen(true);
              setActiveIndex(-1);
              void loadRecents();
              inputRef.current?.focus();
            }}
          >
            <FiX aria-hidden="true" />
          </button>
        ) : null}
        <span className="search-split" aria-hidden="true" />
        <Link href="/search" aria-label="Browse all" title="Browse all" aria-current={browseActive ? "page" : undefined} className={`search-browse ${browseActive ? "is-active" : ""}`}>
          {browseActive ? <HiViewGrid aria-hidden="true" /> : <HiOutlineViewGrid aria-hidden="true" />}
        </Link>
      </div>
      {(() => {
        if (!suggestionsVisible) return null;
        const list = (
          <ul
            id={listboxId}
            role="grid"
            data-search-suggest="true"
            aria-label={showRecentState ? "Recent searches" : "Search suggestions"}
            className={`search-suggest${overlaySuggestions ? " search-suggest--overlay" : ""}`}
            style={overlaySuggestions ? { top: overlayBox.top, bottom: overlayBox.bottom } : undefined}
          >
            {showRecentState && recentLoading && items.length === 0 ? (
              <li role="row" className="px-4 py-3 text-sm text-[#b3b3b3]"><span role="gridcell">Loading recents…</span></li>
            ) : null}
            {showRecentState && !recentLoading && items.length === 0 ? (
              <li role="row" className="px-4 py-4 text-sm text-[#b3b3b3]"><span role="gridcell">Your recent searches will appear here.</span></li>
            ) : null}
            {!showRecentState && searchTerm.trim().length < 2 ? (
              <li role="row" className="px-4 py-4 text-sm text-[#b3b3b3]"><span role="gridcell">Type at least 2 characters to search.</span></li>
            ) : null}
            {!showRecentState && searchTerm.trim().length >= 2 && !recentLoading && items.length === 0 ? (
              <li role="row" className="px-4 py-4 text-sm text-[#b3b3b3]"><span role="gridcell">No suggestions yet. Press Enter to search.</span></li>
            ) : null}
            {suggestionsError && !suggestionsLoading && <li role="row" className="px-4 py-2 text-xs text-[var(--muted)]"><span role="gridcell">Some suggestions couldn’t load. <button type="button" onClick={() => setSuggestionsRetry(value => value + 1)} className="min-h-11 underline">Try again</button></span></li>}
            {suggestionsLoading && <li role="row" className="px-4 py-2 text-xs text-[var(--muted)]"><span role="gridcell">Searching…</span></li>}
            {items.map((item, index) => item.type === "query" ? (
              <li key={item.key} role="row" className={styles.queryRow} onMouseMove={() => setActiveIndex(index)}>
                <button id={`${listboxId}-option-${index}`} type="button" role="gridcell" aria-selected={selectedIndex === index} onClick={() => go(item.query)}><FiSearch aria-hidden="true" className="shrink-0" /><span>{item.query}</span></button>
                <span role="gridcell"><button type="button" aria-label={`Use suggestion ${item.query}`} onClick={() => { setSearchTerm(item.query.slice(0, 100)); setOpen(true); setActiveIndex(-1); inputRef.current?.focus(); }}><FiArrowUpLeft aria-hidden="true" /></button></span>
              </li>
            ) : item.type === "artist" ? (
              <li key={item.key} role="row" onMouseMove={() => setActiveIndex(index)}>
                <button id={`${listboxId}-option-${index}`} type="button" role="gridcell" aria-selected={selectedIndex === index} aria-label={`Open artist ${item.artist.title}`} onClick={() => selectItem(item)} className={styles.liveArtist}>
                  <MediaImage src={item.artist.thumbnail} alt="" /><span className="min-w-0"><strong className="truncate">{cleanTitle(item.artist.title)}</strong><small>Artist</small></span>
                </button>
              </li>
            ) : item.type === "recent-query" ? (
              <ContextMenuTarget as="li" key={item.key} role="row" className="flex items-center" onMouseMove={() => setActiveIndex(index)}>
                <button id={`${listboxId}-option-${index}`} type="button" role="gridcell" aria-selected={selectedIndex === index} onClick={() => go(item.query)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white ${selectedIndex === index ? "bg-white/10" : "hover:bg-white/10"}`}>
                  <FiSearch aria-hidden="true" className="shrink-0 text-[#9aa8b5]" />
                  <span className="min-w-0 flex-1 truncate">{item.query}</span>
                </button>
                <span role="gridcell"><ItemMenu label={`Options for search ${item.query}`} actions={[
                  { label: "Search again", onSelect: () => go(item.query) },
                  { label: "Delete search", destructive: true, onSelect: () => removeRecent(item.query) },
                ]} /></span>
              </ContextMenuTarget>
            ) : (
              <ContextMenuTarget as="li" key={item.key} role="row" onMouseMove={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-1 px-2 py-1 text-sm text-white ${selectedIndex === index ? "bg-white/10" : "hover:bg-white/10"}`}>
                <button
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="gridcell"
                  aria-label={`Play ${cleanTitle(item.song.title || item.song.name, "Song")}`}
                  aria-selected={selectedIndex === index}
                  onClick={() => playSong(item.song)}
                  className="group/search-song flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded">
                    <MediaImage src={item.song.thumbnail || item.song?.image?.[1]?.url || item.song?.image?.[0]?.url} size="mq" alt="" className="h-12 w-12 object-cover" />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/55 text-lg text-white md:group-hover/search-song:flex"
                    >
                      <BsPlayFill />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${playingId === item.song.id ? styles.livePlaying : ""}`}>{cleanTitle(item.song.title || item.song.name, "Song")}</span>
                    <span className="block truncate text-[11px] text-[#9aa8b5]">Song · {cleanArtist(item.song.channel || item.song.artist || item.song.author)}</span>
                  </span>
                </button>
                <span role="gridcell"><AddToQueueButton track={item.song} className="z-[90]" /></span>
                <span role="gridcell"><FavouriteTrackButton track={item.song} className="!h-11 !w-11" /></span>
                <span role="gridcell" className="hidden shrink-0 px-1 text-[10px] uppercase tracking-wide text-[#9aa8b5] sm:inline">Song</span>
              </ContextMenuTarget>
            ))}
          </ul>
        );
        if (overlaySuggestions && typeof document !== "undefined") {
          return createPortal(list, document.body);
        }
        return list;
      })()}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {open && searchTerm.trim().length >= 2
          ? items.length > 0
            ? `${items.length} suggestions available. Use the up and down arrow keys to review them.`
            : "No suggestions yet. Press Enter to see full results."
          : showRecentState && items.length > 0
            ? `${items.length} recent searches available.`
            : ""}
      </p>
    </form>
  );
};

export default Searchbar;

