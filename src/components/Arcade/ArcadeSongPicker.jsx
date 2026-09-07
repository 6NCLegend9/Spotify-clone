"use client";

import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { FiActivity, FiClock, FiMusic, FiSearch, FiUpload } from "react-icons/fi";
import { requestJson } from "@/services/http";
import { cleanTitle } from "@/utils/text";

/**
 * Files are decoded in the browser so the chart can use real onsets.
 * App tracks still play through YouTube, so they get a song-locked grid
 * synced to the player's currentTime instead of raw samples.
 */
export default function ArcadeSongPicker({
  onPickFile,
  onPickTrack,
  selectedLabel,
  analyzerMode,
  chart,
  chartStatus,
}) {
  const { youtubeQueue, youtubeVideo } = useSelector((state) => state.player);
  const [tab, setTab] = useState("file");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (tab !== "search" || term.length < 2) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await requestJson(`/api/youtube-search?type=video&q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          fallbackTitle: "Search unavailable",
          fallbackMessage: "We couldn't load results.",
        });
        if (!controller.signal.aborted) setResults(Array.isArray(data?.results) ? data.results.slice(0, 12) : []);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tab]);

  const queue = Array.isArray(youtubeQueue) ? youtubeQueue.filter((item) => item?.id).slice(0, 20) : [];
  const current = youtubeVideo?.id ? youtubeVideo : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Pick your music</h3>
        {selectedLabel ? (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
              chartStatus === "analyzing"
                ? "bg-white/10 text-[#9aa8b5]"
                : analyzerMode === "fft" || chart?.source === "onsets"
                  ? "bg-[#00e6e6]/15 text-[#00e6e6]"
                  : "bg-[#ffb648]/15 text-[#ffb648]"
            }`}
          >
            {chartStatus === "analyzing" ? <FiClock aria-hidden="true" /> : <FiActivity aria-hidden="true" />}
            {chartStatus === "analyzing"
              ? "Reading the beat"
              : chart?.bpm
                ? `${chart.bpm} BPM · ${chart.source === "onsets" ? "live chart" : "song chart"}`
                : "Chart ready"}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex gap-2" role="tablist" aria-label="Music source">
        {[["file", "Audio file"], ["queue", "Your music"], ["search", "Search"]].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-full border px-3 text-xs font-semibold transition ${
              tab === id
                ? "border-[#00e6e6] bg-[#00e6e6]/10 text-[#00e6e6]"
                : "border-white/15 text-gray-300 hover:border-white/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div key={tab} className="mt-3">
      {tab === "file" ? (
        <>
          <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-3 text-xs font-semibold text-gray-200 transition hover:border-[#00e6e6] hover:text-[#00e6e6]">
            <FiUpload aria-hidden="true" />
            {selectedLabel && analyzerMode === "fft" ? "Choose a different file" : "Choose an audio file"}
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onPickFile(file);
              }}
            />
          </label>
          <p className="mt-2 text-[11px] leading-5 text-[#9aa8b5]">
            Files are decoded on your device. The game reads the actual onsets and builds a Piano Tiles-style chart.
          </p>
        </>
      ) : tab === "queue" ? (
        <>
          {current || queue.length ? (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
              {(current ? [current, ...queue.filter((item) => item.id !== current.id)] : queue).map((track) => (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => onPickTrack(track)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.06]"
                  >
                    <FiMusic aria-hidden="true" className="shrink-0 text-[#9aa8b5]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-gray-100">
                        {cleanTitle(track.title, "Untitled track")}
                      </span>
                      <span className="block truncate text-[11px] text-[#9aa8b5]">{cleanTitle(track.channel)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-[#9aa8b5]">Nothing queued yet. Play something in HeyKasa first, or load an audio file.</p>
          )}
          <p className="mt-2 text-[11px] leading-5 text-[#9aa8b5]">
            The track loads into HeyKasa. Playback starts with the 3-2-1 countdown so tiles hit the line on the beat.
          </p>
        </>
      ) : (
        <>
          <label className="flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-3 focus-within:border-[#00e6e6]">
            <FiSearch aria-hidden="true" className="shrink-0 text-[#9aa8b5]" />
            <span className="sr-only">Search for a song</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search songs and artists"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[#9aa8b5]"
            />
          </label>

          <p className="sr-only" role="status" aria-live="polite">
            {searching ? "Searching" : `${results.length} results`}
          </p>

          {results.length ? (
            <ul className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
              {results.map((track) => (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => onPickTrack(track)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.06]"
                  >
                    <FiMusic aria-hidden="true" className="shrink-0 text-[#9aa8b5]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-gray-100">
                        {cleanTitle(track.title, "Untitled track")}
                      </span>
                      <span className="block truncate text-[11px] text-[#9aa8b5]">{cleanTitle(track.channel)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-[#9aa8b5]">
              {searching ? "Searching…" : query.trim().length >= 2 ? "No matches yet." : "Type at least two characters."}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-5 text-[#9aa8b5]">
            Search results load a chart locked to that track. The song starts after the countdown.
          </p>
        </>
      )}
      </div>
    </div>
  );
}
