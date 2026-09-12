"use client";

import { useCallback, useEffect, useRef } from "react";
import UserMessage from "@/components/UserMessage";
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
  const { data, error, lines, status, indexFor, live, retry } = useSyncedLyrics({
    title,
    artist,
    duration,
    enabled: Boolean(title),
  });
  const activeIndex = indexFor(currentTime);
  const listRef = useRef(null);
  const lineRefs = useRef([]);
  const resumeAutoScrollTimer = useRef(null);
  const autoScroll = useRef(true);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const centerLine = useCallback((index, behavior = "smooth") => {
    const line = lineRefs.current[index];
    const list = listRef.current;
    if (!line || !list) return;
    const top = line.offsetTop - list.clientHeight / 2 + line.offsetHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior });
  }, []);

  useEffect(() => {
    if (activeIndex < 0 || !autoScroll.current) return;
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    centerLine(activeIndex, behavior);
  }, [activeIndex, centerLine]);

  useEffect(() => () => {
    if (resumeAutoScrollTimer.current) clearTimeout(resumeAutoScrollTimer.current);
  }, []);

  const pauseAutoScroll = () => {
    autoScroll.current = false;
    if (resumeAutoScrollTimer.current) clearTimeout(resumeAutoScrollTimer.current);
    resumeAutoScrollTimer.current = setTimeout(() => {
      autoScroll.current = true;
      centerLine(activeIndexRef.current);
    }, 4000);
  };

  if (!title) {
    return (
      <div className={`px-4 py-6 ${className}`}>
        <UserMessage
          tone="info"
          title="No track selected"
          message="Choose a track to view its lyrics."
          compact
        />
      </div>
    );
  }
  if (status === "loading") {
    return <p className={`px-4 py-6 text-center text-sm text-gray-400 ${className}`}>Loading live lyrics…</p>;
  }
  if (status === "error") {
    return (
      <div className={`px-4 py-6 ${className}`}>
        <UserMessage
          tone="error"
          title={error?.title || "Lyrics unavailable"}
          message={error?.message || "We couldn’t load lyrics for this track."}
          onRetry={error?.retryable === false ? undefined : retry}
          compact
        />
      </div>
    );
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
        onWheel={pauseAutoScroll}
        onTouchMove={pauseAutoScroll}
      >
        {lines.map((line, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              ref={(node) => {
                lineRefs.current[index] = node;
              }}
              key={`${line.time}-${index}`}
              type="button"
              disabled={line.unsynced}
              aria-current={isActive ? "true" : undefined}
              onClick={() => {
                if (line.unsynced) return;
                autoScroll.current = true;
                onSeek?.(line.time);
                centerLine(index);
              }}
              onKeyDown={(event) => {
                if (line.unsynced) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSeek?.(line.time);
                }
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
