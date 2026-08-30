"use client";

import useSyncedLyrics from "@/hooks/useSyncedLyrics";

export default function SyncedLyrics({
  title,
  artist,
  duration = 0,
  currentTime = 0,
  onSeek,
  compact = false,
  className = "",
}) {
  const { data, lines, status, indexFor, live } = useSyncedLyrics({
    title,
    artist,
    duration,
    enabled: Boolean(title),
  });
  const activeIndex = indexFor(currentTime);

  if (status === "loading") {
    return <p className={`px-4 py-6 text-center text-sm text-gray-400 ${className}`}>Loading live lyrics…</p>;
  }
  if (status === "error") {
    return <p className={`px-4 py-6 text-center text-sm text-gray-400 ${className}`}>Lyrics could not be loaded.</p>;
  }
  if (data?.instrumental) {
    return <p className={`px-4 py-6 text-center text-sm text-gray-400 ${className}`}>This track is instrumental.</p>;
  }
  if (status === "empty" || lines.length === 0) {
    return <p className={`px-4 py-6 text-center text-sm text-gray-400 ${className}`}>No lyrics found for this track.</p>;
  }

  return (
    <div className={`lyrics-live ${compact ? "lyrics-live--compact" : ""} ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="truncate text-[11px] uppercase tracking-[0.18em] text-[#00e6e6]">
          {live ? "Live lyrics" : "Lyrics"}
        </p>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#00e6e6]">
            <span className="lyrics-live-dot" aria-hidden="true" />
            Synced
          </span>
        )}
      </div>
      <div className="lyrics-live-list hideScrollBar">
        {lines.map((line, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              key={`${line.time}-${index}`}
              role={line.unsynced ? undefined : "button"}
              onClick={() => {
                if (!line.unsynced) onSeek?.(line.time);
              }}
              className={`lyrics-line ${isActive ? "lyrics-line--active" : ""} ${line.unsynced ? "cursor-default" : ""}`}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
