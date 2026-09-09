"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { HiOutlineViewGrid, HiViewGrid } from "react-icons/hi";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import { setYoutubeQueue, setYoutubeVideo } from "@/redux/features/playerSlice";
import MediaImage from "@/components/MediaImage";
import { requestJson } from "@/services/http";
import { searchGenres, searchQueryForGenre } from "@/utils/genres";
import { cleanTitle } from "@/utils/text";

const Searchbar = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const browseActive = pathname === "/search";
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [songs, setSongs] = useState([]);
  const inputId = useId();
  const listboxId = useId();
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  // Global shortcuts: "/" (when not already typing) and Cmd/Ctrl+K focus search.
  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const isModK =
        (event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K");
      const isSlash =
        event.key === "/" && !isEditable && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (isModK || isSlash) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Let other UI (e.g. the mobile tab bar) focus the search input.
  useEffect(() => {
    const onOpenSearch = () => {
      document.documentElement.classList.add("home-search-open");
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("heykasa:open-search", onOpenSearch);
    return () => window.removeEventListener("heykasa:open-search", onOpenSearch);
  }, []);

  const genreMatches = useMemo(
    () => (searchTerm.trim().length >= 2 ? searchGenres(searchTerm, { limit: 4 }) : []),
    [searchTerm],
  );

  // Live song suggestions so the box actually surfaces songs (not just genres).
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
        const data = await requestJson(
          `/api/youtube-search?type=video&q=${encodeURIComponent(term)}`,
          {
            signal: controller.signal,
            fallbackTitle: "Search unavailable",
            fallbackMessage: "We couldn\u2019t load suggestions.",
          },
        );
        const list = Array.isArray(data?.results) ? data.results.slice(0, 5) : [];
        if (!controller.signal.aborted) setSongs(list);
      } catch {
        // Ignore aborted/failed suggestion loads; genre matches still show.
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, open]);

  const items = useMemo(
    () => [
      ...songs.map((song) => ({ type: "song", key: `song-${song.id}`, song })),
      ...genreMatches.map((match) => ({
        type: "genre",
        key: `genre-${match.id}-${match.matchLabel}`,
        match,
      })),
    ],
    [songs, genreMatches],
  );

  const go = (query) => {
    const next = String(query || "").trim();
    if (!next) return;
    setOpen(false);
    setActiveIndex(-1);
    dispatch(setIsTyping(false));
    router.push(`/search/${encodeURIComponent(next)}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    go(searchTerm);
  };

  const chooseGenre = (match) => {
    const query = searchQueryForGenre(match);
    setSearchTerm(query);
    go(query);
  };

  const playSong = (song) => {
    if (!song?.id) return;
    dispatch(setYoutubeQueue(songs));
    dispatch(setYoutubeVideo(song));
    setOpen(false);
    setActiveIndex(-1);
    dispatch(setIsTyping(false));
  };

  const selectItem = (item) => {
    if (!item) return;
    if (item.type === "song") playSong(item.song);
    else chooseGenre(item.match);
  };

  const suggestionsVisible = open && items.length > 0;
  const selectedIndex =
    activeIndex >= 0 && activeIndex < items.length ? activeIndex : -1;

  return (
    <form
      role="search"
      aria-label="Search music"
      onSubmit={handleSubmit}
      autoComplete="off"
      className="search-cluster-form"
    >
      <label htmlFor={inputId} className="sr-only">
        Search songs, artists, playlists, and genres
      </label>
      <div className={`search-field ${browseActive ? "is-browse" : ""}`}>
        <FiSearch aria-hidden="true" className="search-field-icon" />
        <input
          id={inputId}
          ref={inputRef}
          name="search-field"
          type="search"
          autoComplete="off"
          placeholder="What do you want to play?"
          value={searchTerm}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={suggestionsVisible}
          aria-controls={suggestionsVisible ? listboxId : undefined}
          aria-activedescendant={
            suggestionsVisible && selectedIndex >= 0
              ? `${listboxId}-option-${selectedIndex}`
              : undefined
          }
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            dispatch(setIsTyping(true));
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (suggestionsVisible) event.preventDefault();
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (event.key === "ArrowDown" && items.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) =>
                index < 0 || index >= items.length - 1 ? 0 : index + 1,
              );
              return;
            }
            if (event.key === "ArrowUp" && items.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(
                (index) => (index <= 0 ? items.length - 1 : index - 1),
              );
              return;
            }
            if (event.key === "Home" && suggestionsVisible) {
              event.preventDefault();
              setActiveIndex(0);
              return;
            }
            if (event.key === "End" && suggestionsVisible) {
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
            document.documentElement.classList.remove("home-search-open");
            window.setTimeout(() => setOpen(false), 150);
          }}
          className="h-full min-h-0 min-w-0 flex-1 bg-transparent text-sm leading-normal text-white outline-none placeholder:text-[#9aa8b5]"
        />
        <span className="search-split" aria-hidden="true" />
        <Link
          href="/search"
          aria-label="Browse all"
          title="Browse all"
          aria-current={browseActive ? "page" : undefined}
          className={`search-browse ${browseActive ? "is-active" : ""}`}
        >
          {browseActive ? (
            <HiViewGrid aria-hidden="true" />
          ) : (
            <HiOutlineViewGrid aria-hidden="true" />
          )}
        </Link>
      </div>
      {suggestionsVisible ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className="search-suggest"
        >
          {items.map((item, index) =>
            item.type === "song" ? (
              <li
                id={`${listboxId}-option-${index}`}
                key={item.key}
                role="option"
                aria-selected={selectedIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => selectItem(item)}
                className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm text-white ${
                  selectedIndex === index ? "bg-white/10" : "hover:bg-white/10"
                }`}
              >
                <MediaImage
                  src={item.song.thumbnail}
                  size="mq"
                  alt=""
                  className="h-9 w-9 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{cleanTitle(item.song.title, "Song")}</span>
                  <span className="block truncate text-[11px] text-[#9aa8b5]">
                    {cleanTitle(item.song.channel)}
                  </span>
                </span>
                <span className="text-[10px] uppercase tracking-wide text-[#9aa8b5]">Song</span>
              </li>
            ) : (
              <li
                id={`${listboxId}-option-${index}`}
                key={item.key}
                role="option"
                aria-selected={selectedIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => selectItem(item)}
                className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm text-white ${
                  selectedIndex === index ? "bg-white/10" : "hover:bg-white/10"
                }`}
              >
                <span>{item.match.matchLabel}</span>
                <span className="text-[10px] uppercase tracking-wide text-[#9aa8b5]">
                  {item.match.matchType === "subgenre" ? `${item.match.name} sub-genre` : "Genre"}
                </span>
              </li>
            ),
          )}
        </ul>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {open && searchTerm.trim().length >= 2
          ? items.length > 0
            ? `${items.length} suggestions available. Use the up and down arrow keys to review them.`
            : "No suggestions yet. Press Enter to see full results."
          : ""}
      </p>
    </form>
  );
};

export default Searchbar;
