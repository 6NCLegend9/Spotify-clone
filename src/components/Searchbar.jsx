"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import ItemMenu from "@/components/ItemMenu";
import { FiSearch, FiX } from "react-icons/fi";
import { HiOutlineViewGrid, HiViewGrid } from "react-icons/hi";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useDispatch } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import MediaImage from "@/components/MediaImage";
import AddToQueueButton from "@/components/AddToQueueButton";
import { requestJson } from "@/services/http";
import { cleanArtist, cleanTitle } from "@/utils/text";
import useMediaQuery from "@/hooks/useMediaQuery";

function songSearchQuery(song) {
  return [
    cleanTitle(song?.title || song?.name || ""),
    cleanArtist(song?.channel || song?.artist || song?.author || ""),
  ].filter(Boolean).join(" ").trim();
}

const Searchbar = () => {
  const { data: session, status } = useSession();
  return <AccountSearchbar key={session?.user?.id || session?.user?.email || status} />;
};

const AccountSearchbar = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const browseActive = pathname === "/search";
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [songs, setSongs] = useState([]);
  const [recentQueries, setRecentQueries] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const inputId = useId();
  const listboxId = useId();
  const abortRef = useRef(null);
  const recentsLoadedAtRef = useRef(0);
  const inputRef = useRef(null);
  const clusterRef = useRef(null);
  const [compactPlaceholder, setCompactPlaceholder] = useState(false);
  const [overlayBox, setOverlayBox] = useState({ top: 64, bottom: 0 });
  const overlaySuggestions = useMediaQuery("(max-width: 767px)");

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
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("heykasa:open-search", onOpenSearch);
    return () => window.removeEventListener("heykasa:open-search", onOpenSearch);
  }, []);

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
    await requestJson("/api/searches", { method: "DELETE", body: { term } });
    setRecentQueries((queries) => queries.filter((value) => value.toLowerCase() !== term.toLowerCase()));
    setActiveIndex(-1);
    recentsLoadedAtRef.current = 0;
  };

  const loadRecents = async () => {
    const now = Date.now();
    if (recentLoading || now - recentsLoadedAtRef.current < 15_000) return;
    recentsLoadedAtRef.current = now;
    setRecentLoading(true);
    try {
      const data = await requestJson("/api/searches");
      const searches = Array.isArray(data?.data) ? data.data : [];
      setRecentQueries(searches.filter((query) => typeof query === "string" && query.trim()).slice(0, 8));
    } finally {
      setRecentLoading(false);
    }
  };

  useEffect(() => {
    const term = searchTerm.trim();
    if (!open || term.length < 2) {
      setSongs([]);
      return undefined;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const data = await requestJson(`/api/youtube-search?type=video&q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          fallbackTitle: "Search unavailable",
          fallbackMessage: "We couldn’t load suggestions.",
        });
        const list = Array.isArray(data?.results) ? data.results.slice(0, 7) : [];
        if (!controller.signal.aborted) setSongs(list);
      } catch {
        if (!controller.signal.aborted) setSongs([]);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, open]);

  const items = useMemo(() => {
    if (searchTerm.trim()) return songs.map((song) => ({ type: "song", key: `song-${song.id}`, song }));
    return recentQueries.map((query, index) => ({ type: "recent-query", key: `recent-query-${index}-${query}`, query }));
  }, [searchTerm, songs, recentQueries]);

  const go = (query) => {
    const next = String(query || "").trim();
    if (!next) return;
    setSearchTerm(next);
    setOpen(false);
    setActiveIndex(-1);
    dispatch(setIsTyping(false));
    router.push(`/search/${encodeURIComponent(next)}`);
  };

  const searchSong = (song) => {
    const query = songSearchQuery(song);
    if (query) go(query);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    go(searchTerm);
  };

  const selectItem = (item) => {
    if (!item) return;
    if (item.type === "recent-query") go(item.query);
    else searchSong(item.song);
  };

  const showRecentState = open && !searchTerm.trim();
  const suggestionsVisible = open;
  const selectedIndex = activeIndex >= 0 && activeIndex < items.length ? activeIndex : -1;

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
      const chrome = document.querySelector(".app-tabbar") || document.querySelector(".app-player");
      const top = nav?.getBoundingClientRect().bottom;
      const chromeTop = chrome?.getBoundingClientRect().top;
      setOverlayBox({
        top: Number.isFinite(top) ? Math.round(top) : 64,
        bottom: Number.isFinite(chromeTop) ? Math.max(0, Math.round(window.innerHeight - chromeTop)) : 0,
      });
    };
    syncBox();
    window.addEventListener("resize", syncBox);
    window.visualViewport?.addEventListener("resize", syncBox);
    return () => {
      window.removeEventListener("resize", syncBox);
      window.visualViewport?.removeEventListener("resize", syncBox);
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
        window.setTimeout(finish, 100);
        return;
      }
      if (isSearchUi(document.activeElement)) return;
      setOpen(false);
      setActiveIndex(-1);
    };
    window.setTimeout(finish, 150);
  };

  return (
    <form ref={clusterRef} role="search" aria-label="Search music" onSubmit={handleSubmit} autoComplete="off" className="search-cluster-form">
      <div className={`search-field ${browseActive ? "is-browse" : ""}`}>
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
          placeholder={compactPlaceholder ? "Search" : "What do you want to play?"}
          value={searchTerm}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={suggestionsVisible}
          aria-controls={suggestionsVisible ? listboxId : undefined}
          aria-activedescendant={suggestionsVisible && selectedIndex >= 0 ? `${listboxId}-option-${selectedIndex}` : undefined}
          onChange={(event) => {
            setSearchTerm(event.target.value);
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
            if (event.key === "ArrowDown" && items.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => index < 0 || index >= items.length - 1 ? 0 : index + 1);
              return;
            }
            if (event.key === "ArrowUp" && items.length > 0) {
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
            role="listbox"
            data-search-suggest="true"
            aria-label={showRecentState ? "Recent searches" : "Search suggestions"}
            className={`search-suggest${overlaySuggestions ? " search-suggest--overlay" : ""}`}
            style={overlaySuggestions ? { top: overlayBox.top, bottom: overlayBox.bottom } : undefined}
          >
            {showRecentState && recentLoading && items.length === 0 ? (
              <li role="presentation" className="px-4 py-3 text-sm text-[#b3b3b3]">Loading recents…</li>
            ) : null}
            {showRecentState && !recentLoading && items.length === 0 ? (
              <li role="presentation" className="px-4 py-4 text-sm text-[#b3b3b3]">Your recent searches will appear here.</li>
            ) : null}
            {!showRecentState && searchTerm.trim().length < 2 ? (
              <li role="presentation" className="px-4 py-4 text-sm text-[#b3b3b3]">Type at least 2 characters to search.</li>
            ) : null}
            {!showRecentState && searchTerm.trim().length >= 2 && !recentLoading && items.length === 0 ? (
              <li role="presentation" className="px-4 py-4 text-sm text-[#b3b3b3]">No suggestions yet. Press Enter to search.</li>
            ) : null}
            {items.map((item, index) => item.type === "recent-query" ? (
              <ContextMenuTarget as="li" key={item.key} role="none" className="flex items-center" onMouseMove={() => setActiveIndex(index)}>
                <button id={`${listboxId}-option-${index}`} type="button" role="option" aria-selected={selectedIndex === index} onClick={() => go(item.query)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white ${selectedIndex === index ? "bg-white/10" : "hover:bg-white/10"}`}>
                  <FiSearch aria-hidden="true" className="shrink-0 text-[#9aa8b5]" />
                  <span className="min-w-0 flex-1 truncate">{item.query}</span>
                </button>
                <ItemMenu label={`Options for search ${item.query}`} actions={[
                  { label: "Search again", onSelect: () => go(item.query) },
                  { label: "Delete search", destructive: true, onSelect: () => removeRecent(item.query) },
                ]} />
              </ContextMenuTarget>
            ) : (
              <ContextMenuTarget as="li" key={item.key} role="none" onMouseMove={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-1 px-2 py-1 text-sm text-white ${selectedIndex === index ? "bg-white/10" : "hover:bg-white/10"}`}>
                <button id={`${listboxId}-option-${index}`} type="button" role="option" aria-selected={selectedIndex === index} onClick={() => searchSong(item.song)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                  <MediaImage src={item.song.thumbnail || item.song?.image?.[1]?.url || item.song?.image?.[0]?.url} size="mq" alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{cleanTitle(item.song.title || item.song.name, "Song")}</span>
                    <span className="block truncate text-[11px] text-[#9aa8b5]">{cleanArtist(item.song.channel || item.song.artist || item.song.author)}</span>
                  </span>
                </button>
                <AddToQueueButton track={item.song} className="z-[90]" />
                <span className="hidden shrink-0 px-1 text-[10px] uppercase tracking-wide text-[#9aa8b5] sm:inline">Song</span>
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

