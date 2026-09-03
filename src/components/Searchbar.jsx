"use client";

import { useId, useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { setIsTyping } from "@/redux/features/loadingBarSlice";
import { searchGenres, searchQueryForGenre } from "@/utils/genres";

const Searchbar = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputId = useId();
  const listboxId = useId();
  const genreMatches = useMemo(
    () => (searchTerm.trim().length >= 2 ? searchGenres(searchTerm, { limit: 6 }) : []),
    [searchTerm],
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

  const suggestionsVisible = open && genreMatches.length > 0;
  const selectedIndex =
    activeIndex >= 0 && activeIndex < genreMatches.length ? activeIndex : -1;

  return (
    <form
      role="search"
      aria-label="Search music"
      onSubmit={handleSubmit}
      autoComplete="off"
      className="relative w-full max-w-xl"
    >
      <label htmlFor={inputId} className="sr-only">
        Search songs, artists, playlists, and genres
      </label>
      <div className="flex h-9 min-h-9 items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.06] px-3 transition duration-200 ease-out focus-within:border-[#00e6e6] focus-within:bg-[#07121d]/80 focus-within:shadow-glow sm:h-11 sm:min-h-11 sm:px-4">
        <FiSearch aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9aa8b5]" />
        <input
          id={inputId}
          name="search-field"
          type="search"
          autoComplete="off"
          placeholder="Search music or genres"
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
            if (event.key === "ArrowDown" && genreMatches.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) =>
                index < 0 || index >= genreMatches.length - 1 ? 0 : index + 1,
              );
              return;
            }
            if (event.key === "ArrowUp" && genreMatches.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(
                (index) => (index <= 0 ? genreMatches.length - 1 : index - 1),
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
              setActiveIndex(genreMatches.length - 1);
              return;
            }
            if (event.key === "Enter" && suggestionsVisible && selectedIndex >= 0) {
              event.preventDefault();
              chooseGenre(genreMatches[selectedIndex]);
            }
          }}
          onBlur={() => {
            dispatch(setIsTyping(false));
            window.setTimeout(() => setOpen(false), 150);
          }}
          className="h-full min-h-0 min-w-0 flex-1 bg-transparent text-sm leading-normal text-white outline-none placeholder:text-[#9aa8b5]"
        />
      </div>
      {suggestionsVisible ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Matching genres"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#07121d] py-1 shadow-2xl"
        >
          {genreMatches.map((match, index) => (
            <li
              id={`${listboxId}-option-${index}`}
              key={`${match.id}-${match.matchLabel}`}
              role="option"
              aria-selected={selectedIndex === index}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => chooseGenre(match)}
              className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm text-white ${
                selectedIndex === index ? "bg-white/10" : "hover:bg-white/10"
              }`}
            >
                <span>{match.matchLabel}</span>
                <span className="text-[10px] uppercase tracking-wide text-[#9aa8b5]">
                  {match.matchType === "subgenre" ? `${match.name} sub-genre` : "Genre"}
                </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {open && searchTerm.trim().length >= 2
          ? genreMatches.length > 0
            ? `${genreMatches.length} genre suggestions available. Use the up and down arrow keys to review them.`
            : "No matching genre suggestions."
          : ""}
      </p>
    </form>
  );
};

export default Searchbar;
