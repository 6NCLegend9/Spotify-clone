"use client";

import { useEffect, useRef } from "react";
import useSyncedLyrics from "@/hooks/useSyncedLyrics";

const FOLLOW_RESUME_MS = 5000;

export default function SyncedLyrics({
  title,
  artist,
  duration = 0,
  currentTime = 0,
  onSeek,
  compact = false,
  follow = true,
  className = "",
}) {
  const { data, lines, status, indexFor, live } = useSyncedLyrics({
    title,
    artist,
    duration,
    enabled: Boolean(title),
  });
  const activeIndex = indexFor(currentTime);
  const listRef = useRef(null);
  const activeRef = useRef(null);
  const followRef = useRef(follow);
  const resumeTimerRef = useRef(null);
  const programmaticRef = useRef(false);

  const pauseFollow = () => {
    followRef.current = false;
    window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      followRef.current = true;
      scrollActiveIntoList();
    }, FOLLOW_RESUME_MS);
  };

  followRef.current = follow;

  const scrollActiveIntoList = () => {
    const list = listRef.current;
    const line = activeRef.current;
    if (!follow || !list || !line || !followRef.current) return;
    if (list.scrollHeight <= list.clientHeight + 2) return;

    const nextTop = line.offsetTop - list.clientHeight / 2 + line.clientHeight / 2;
    programmaticRef.current = true;
    list.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
    window.setTimeout(() => {
      programmaticRef.current = false;
    }, 400);
  };

  useEffect(() => {
    scrollActiveIntoList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  useEffect(() => () => {
    window.clearTimeout(resumeTimerRef.current);
  }, []);

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
      <div
        ref={listRef}
        className="lyrics-live-list hideScrollBar"
        onWheel={pauseFollow}
        onTouchStart={pauseFollow}
        onPointerDown={pauseFollow}
        onScroll={() => {
          if (!programmaticRef.current) pauseFollow();
        }}
      >
        {lines.map((line, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={`${line.time}-${index}`}
              type="button"
              tabIndex={-1}
              ref={isActive ? activeRef : null}
              onClick={() => {
                if (!line.unsynced) onSeek?.(line.time);
              }}
              className={`lyrics-line ${isActive ? "lyrics-line--active" : ""} ${line.unsynced ? "cursor-default" : ""}`}
            >
              {line.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
