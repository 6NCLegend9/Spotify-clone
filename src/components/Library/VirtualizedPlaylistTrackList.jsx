"use client";

import { useLayoutEffect, useRef, useState } from "react";
import PlaylistTrackRow from "@/components/Library/PlaylistTrackRow";
import {
  PLAYLIST_OVERSCAN,
  PLAYLIST_ROW_HEIGHT,
  shouldVirtualizePlaylist,
  virtualPlaylistRange,
} from "@/utils/virtualPlaylist.mjs";

const scrollMemory = new Map();

function sameRange(left, right) {
  return left.start === right.start
    && left.end === right.end
    && left.totalHeight === right.totalHeight
    && left.offsetTop === right.offsetTop;
}

export default function VirtualizedPlaylistTrackList({
  tracks,
  activeYoutubeId,
  removable,
  liked,
  onPlay,
  onRemove,
  scrollKey = "",
}) {
  const items = Array.isArray(tracks) ? tracks : [];
  const virtualized = shouldVirtualizePlaylist(items.length);
  const containerRef = useRef(null);
  const restoredRef = useRef(false);
  const [range, setRange] = useState(() => virtualPlaylistRange({
    count: items.length,
    rowHeight: PLAYLIST_ROW_HEIGHT,
    containerTop: 0,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 844,
    overscan: PLAYLIST_OVERSCAN,
  }));

  useLayoutEffect(() => {
    if (!virtualized || typeof window === "undefined") return undefined;
    const node = containerRef.current;
    if (!node) return undefined;

    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = virtualPlaylistRange({
        count: items.length,
        rowHeight: PLAYLIST_ROW_HEIGHT,
        containerTop: rect.top,
        viewportHeight: window.innerHeight,
        overscan: PLAYLIST_OVERSCAN,
      });
      setRange((current) => (sameRange(current, next) ? current : next));
    };

    if (!restoredRef.current && scrollKey && scrollMemory.has(scrollKey)) {
      restoredRef.current = true;
      const relativeOffset = scrollMemory.get(scrollKey);
      const absoluteTop = window.scrollY + node.getBoundingClientRect().top;
      window.scrollTo({ top: Math.max(0, absoluteTop + relativeOffset), behavior: "auto" });
    } else {
      restoredRef.current = true;
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      if (scrollKey) {
        const rect = node.getBoundingClientRect();
        const relativeOffset = Math.max(0, Math.min(items.length * PLAYLIST_ROW_HEIGHT, -rect.top));
        scrollMemory.set(scrollKey, relativeOffset);
      }
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [items.length, scrollKey, virtualized]);

  if (!virtualized) {
    return items.map((track, index) => (
      <PlaylistTrackRow
        key={track.id}
        track={track}
        index={index}
        active={activeYoutubeId === track.id}
        removable={removable}
        liked={liked}
        onPlay={onPlay}
        onRemove={onRemove}
      />
    ));
  }

  const visible = items.slice(range.start, range.end);
  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: `${range.totalHeight}px` }}
      data-playlist-virtualized="true"
      data-mounted-rows={visible.length}
      data-total-rows={items.length}
    >
      <div
        className="absolute left-0 top-0 w-full"
        style={{ transform: `translateY(${range.offsetTop}px)` }}
      >
        {visible.map((track, localIndex) => {
          const index = range.start + localIndex;
          return (
            <PlaylistTrackRow
              key={track.id}
              track={track}
              index={index}
              active={activeYoutubeId === track.id}
              removable={removable}
              liked={liked}
              onPlay={onPlay}
              onRemove={onRemove}
            />
          );
        })}
      </div>
    </div>
  );
}
