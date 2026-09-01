"use client";

import { useMemo, useState } from "react";
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
  const genreMatches = useMemo(
    () => (searchTerm.trim().length >= 2 ? searchGenres(searchTerm, { limit: 6 }) : []),
    [searchTerm],
  );

  const go = (query) => {
    const next = String(query || "").trim();
    if (!next) return;
    setOpen(false);
    router.push(`/search/${encodeURIComponent(next)}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    go(searchTerm);
  };

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      className="relative w-full max-w-xl"
    >
      <label htmlFor="search-field" className="sr-only">
        Search songs, artists, playlists, and genres
      </label>
      <div className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 transition duration-200 ease-out focus-within:border-[#00e6e6] focus-within:bg-[#07121d]/80 focus-within:shadow-glow sm:h-11 sm:px-4">
        <FiSearch aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9aa8b5]" />
        <input
          id="search-field"
          name="search-field"
          type="search"
          autoComplete="off"
          placeholder="Search music or genres"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            dispatch(setIsTyping(true));
            setOpen(true);
          }}
          onBlur={() => {
            dispatch(setIsTyping(false));
            window.setTimeout(() => setOpen(false), 150);
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#9aa8b5]"
        />
      </div>
      {open && genreMatches.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Matching genres"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#07121d] py-1 shadow-2xl"
        >
          {genreMatches.map((match) => (
            <li key={`${match.id}-${match.matchLabel}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  const query = searchQueryForGenre(match);
                  setSearchTerm(query);
                  go(query);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white hover:bg-white/10"
              >
                <span>{match.matchLabel}</span>
                <span className="text-[10px] uppercase tracking-wide text-[#9aa8b5]">
                  {match.matchType === "subgenre" ? `${match.name} sub-genre` : "Genre"}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false);
                router.push("/genres");
              }}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-[#00e6e6] hover:bg-white/10"
            >
              Browse all genres
            </button>
          </li>
        </ul>
      ) : null}
    </form>
  );
};

export default Searchbar;
