"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import PlaylistTrackRow from "@/components/Library/PlaylistTrackRow";
import {
  PLAYLIST_OVERSCAN,
  PLAYLIST_ROW_HEIGHT,
  playlistIndexIsVisible,
  playlistScrollOffsetForIndex,
  recallPlaylistScrollOffset,
  rememberPlaylistScrollOffset,
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

function scrollHostFor(node) {
  return node?.closest?.("[data-app-scroll-container]") || window;
}

function scrollMetrics(node, host) {
  if (host === window) {
    return {
      containerTop: node.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      scrollTop: window.scrollY,
      listTop: window.scrollY + node.getBoundingClientRect().top,
    };
  }
  const nodeRect = node.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return {
    containerTop: nodeRect.top - hostRect.top,
    viewportHeight: host.clientHeight,
    scrollTop: host.scrollTop,
    listTop: host.scrollTop + nodeRect.top - hostRect.top,
  };
}

function scrollHostTo(host, top) {
  const target = Math.max(0, Number(top) || 0);
  if (host === window) window.scrollTo({ top: target, behavior: "auto" });
  else host.scrollTo({ top: target, behavior: "auto" });
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
  const items = useMemo(() => (Array.isArray(tracks) ? tracks : []), [tracks]);
  const virtualized = shouldVirtualizePlaylist(items.length);
  const containerRef = useRef(null);
  const restoredKeyRef = useRef("");
  const lastRevealedActiveRef = useRef("");
  const [range, setRange] = useState(() => virtualPlaylistRange({
    count: items.length,
    rowHeight: PLAYLIST_ROW_HEIGHT,
    containerTop: 0,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 844,
    overscan: PLAYLIST_OVERSCAN,
  }));

  useLayoutEffect(() => {
    if (!virtualized || typeof window === "undefined" || !activeYoutubeId) return;
    const index = items.findIndex((track) => track?.id === activeYoutubeId);
    if (index < 0) return;
    const revealKey = `${scrollKey}:${activeYoutubeId}:${index}`;
    if (lastRevealedActiveRef.current === revealKey) return;

    const node = containerRef.current;
    if (!node) return;
    const host = scrollHostFor(node);
    const metrics = scrollMetrics(node, host);
    const alreadyVisible = playlistIndexIsVisible({
      index,
      count: items.length,
      rowHeight: PLAYLIST_ROW_HEIGHT,
      containerTop: metrics.containerTop,
      viewportHeight: metrics.viewportHeight,
    });
    lastRevealedActiveRef.current = revealKey;
    if (alreadyVisible) return;

    const relativeOffset = playlistScrollOffsetForIndex({
      index,
      count: items.length,
      rowHeight: PLAYLIST_ROW_HEIGHT,
      viewportHeight: metrics.viewportHeight,
    });
    scrollHostTo(host, metrics.listTop + relativeOffset);
  }, [activeYoutubeId, items, range.end, range.start, scrollKey, virtualized]);

  useLayoutEffect(() => {
    if (!virtualized || typeof window === "undefined") return undefined;
    const node = containerRef.current;
    if (!node) return undefined;
    const host = scrollHostFor(node);

    const update = () => {
      const metrics = scrollMetrics(node, host);
      const next = virtualPlaylistRange({
        count: items.length,
        rowHeight: PLAYLIST_ROW_HEIGHT,
        containerTop: metrics.containerTop,
        viewportHeight: metrics.viewportHeight,
        overscan: PLAYLIST_OVERSCAN,
      });
      setRange((current) => (sameRange(current, next) ? current : next));
    };

    const rememberedOffset = recallPlaylistScrollOffset(scrollMemory, scrollKey);
    if (restoredKeyRef.current !== scrollKey) {
      restoredKeyRef.current = scrollKey;
      lastRevealedActiveRef.current = "";
      if (rememberedOffset !== null) {
        const metrics = scrollMetrics(node, host);
        scrollHostTo(host, metrics.listTop + rememberedOffset);
      }
    }

    update();
    host.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      if (scrollKey) {
        const metrics = scrollMetrics(node, host);
        const relativeOffset = Math.max(
          0,
          Math.min(items.length * PLAYLIST_ROW_HEIGHT, -metrics.containerTop),
        );
        rememberPlaylistScrollOffset(scrollMemory, scrollKey, relativeOffset);
      }
      host.removeEventListener("scroll", update);
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
