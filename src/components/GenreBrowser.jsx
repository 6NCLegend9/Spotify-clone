"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiSearch, FiX } from "react-icons/fi";
import { GENRE_CATALOG, searchGenres } from "@/utils/genres";
import { getPlaylistTheme, inferPlaylistCategory } from "@/utils/playlistThemes";

export default function GenreBrowser({
  selected = [],
  onToggle,
  selectable = false,
  title = "Browse genres",
  compact = false,
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const matches = useMemo(() => searchGenres(query, { limit: 40 }), [query]);
  const groups = useMemo(() => {
    if (query.trim()) return null;
    return GENRE_CATALOG;
  }, [query]);

  const isSelected = (value) =>
    selected.some((item) => item.toLowerCase() === String(value).toLowerCase());

  const renderChip = (label, key) => {
    if (selectable) {
      return (
        <button
          key={key}
          type="button"
          aria-pressed={isSelected(label)}
          onClick={() => onToggle?.(label)}
          className={`rounded-full border px-3 py-1.5 text-xs transition duration-200 ease-out active:scale-[0.98] ${
            isSelected(label)
              ? "border-[#00e6e6] bg-[#00e6e6]/10 text-[#00e6e6]"
              : "border-white/15 text-gray-300 hover:border-white/30"
          }`}
        >
          {label}
        </button>
      );
    }
    return (
      <Link
        key={key}
        href={`/search/${encodeURIComponent(label)}`}
        className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-gray-300 transition duration-200 ease-out hover:border-[#00e6e6] hover:text-[#00e6e6] active:scale-[0.98]"
      >
        {label}
      </Link>
    );
  };

  return (
    <section>
      {title ? (
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-xs text-gray-400">
            Search genres and sub-genres. Partial matches like “lofi” still work.
          </p>
        </div>
      ) : null}
      {!compact ? (
      <label className="relative mb-5 block max-w-xl">
        <span className="sr-only">Search genres and sub-genres</span>
        <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Try "lofi", "drill", or "workout"'
          className="field h-11 pl-10 pr-10"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear genre search"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <FiX />
          </button>
        ) : null}
      </label>
      ) : null}

      {query.trim() && !compact ? (
        <div className="flex flex-wrap gap-2">
          {matches.length === 0 ? (
            <p className="text-sm text-gray-400">No genres match “{query}”.</p>
          ) : (
            matches.map((match) =>
              renderChip(match.matchLabel, `${match.id}-${match.matchLabel}`),
            )
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(groups || []).slice(0, compact ? 8 : (groups || []).length).map((genre) => {
            const theme = getPlaylistTheme(inferPlaylistCategory(genre.name, "Pop"));
            const expanded = openId === genre.id;
            return (
              <article
                key={genre.id}
                className={`overflow-hidden rounded-xl bg-gradient-to-br ${theme.gradient} p-4 text-white shadow-lg transition duration-200 ease-out hover:-translate-y-0.5`}
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenId(expanded ? null : genre.id)}
                  className="w-full text-left"
                >
                  <p className="text-sm font-bold">{genre.name}</p>
                  <p className="mt-1 text-[11px] text-white/80">{genre.subgenres.length} sub-genres</p>
                </button>
                {expanded ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {renderChip(genre.name, genre.id)}
                    {genre.subgenres.map((sub) => renderChip(sub, `${genre.id}-${sub}`))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
