"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// Keep the virtual offsets aligned with the CSS row height when a user enlarges
// the base text size. Normal density remains 66px.
function currentRowHeight() {
  return typeof document === "undefined" ? PLAYLIST_ROW_HEIGHT
    : Math.max(PLAYLIST_ROW_HEIGHT, (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) * 4.125);
}

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
  activeEntryId,
  isPlaying,
  removable,
  liked,
  onPlay,
  onRemove,
  reorderable,
  onMove,
  scrollKey = "",
}) {
  const items = useMemo(() => (Array.isArray(tracks) ? tracks : []), [tracks]);
  const virtualized = shouldVirtualizePlaylist(items.length);
  const [rowHeight, setRowHeight] = useState(currentRowHeight);
  const containerRef = useRef(null);
  const restoredKeyRef = useRef("");
  const pendingRestoreRef = useRef(null);
  const lastRevealedActiveRef = useRef("");
  const [range, setRange] = useState(() => virtualPlaylistRange({
    count: items.length,
    rowHeight,
    containerTop: 0,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 844,
    overscan: PLAYLIST_OVERSCAN,
  }));

  useEffect(() => {
    const update = () => setRowHeight(currentRowHeight());
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  useLayoutEffect(() => {
    if (!virtualized || typeof window === "undefined" || !activeYoutubeId) return;
    const index = items.findIndex((track) => activeEntryId ? track?.playlistEntryId === activeEntryId : track?.id === activeYoutubeId);
    if (index < 0) return;
    const revealKey = `${scrollKey}:${activeEntryId || activeYoutubeId}:${index}`;
    if (lastRevealedActiveRef.current === revealKey) return;

    const node = containerRef.current;
    if (!node) return;
    const host = scrollHostFor(node);
    const metrics = scrollMetrics(node, host);
    const alreadyVisible = playlistIndexIsVisible({
      index,
      count: items.length,
      rowHeight,
      containerTop: metrics.containerTop,
      viewportHeight: metrics.viewportHeight,
    });
    lastRevealedActiveRef.current = revealKey;
    if (alreadyVisible) return;

    const relativeOffset = playlistScrollOffsetForIndex({
      index,
      count: items.length,
      rowHeight,
      viewportHeight: metrics.viewportHeight,
    });
    scrollHostTo(host, metrics.listTop + relativeOffset);
  }, [activeEntryId, activeYoutubeId, items, range.end, range.start, rowHeight, scrollKey, virtualized]);

  useLayoutEffect(() => {
    if (!virtualized || typeof window === "undefined") return undefined;
    const node = containerRef.current;
    if (!node) return undefined;
    const host = scrollHostFor(node);

    const routeAtMount = `${window.location.pathname}${window.location.search}`;
    const rememberCurrentOffset = (metrics) => {
      if (!scrollKey) return;
      if (pendingRestoreRef.current?.key === scrollKey) return;
      const currentRoute = `${window.location.pathname}${window.location.search}`;
      if (currentRoute !== routeAtMount) return;
      rememberPlaylistScrollOffset(scrollMemory, scrollKey, metrics.scrollTop);
    };

    const update = () => {
      const metrics = scrollMetrics(node, host);
      const next = virtualPlaylistRange({
        count: items.length,
        rowHeight,
        containerTop: metrics.containerTop,
        viewportHeight: metrics.viewportHeight,
        overscan: PLAYLIST_OVERSCAN,
      });
      setRange((current) => (sameRange(current, next) ? current : next));
      rememberCurrentOffset(metrics);
    };

    const rememberedOffset = recallPlaylistScrollOffset(scrollMemory, scrollKey);
    if (restoredKeyRef.current !== scrollKey) {
      restoredKeyRef.current = scrollKey;
      lastRevealedActiveRef.current = "";
      pendingRestoreRef.current = rememberedOffset === null
        ? null
        : { key: scrollKey, offset: rememberedOffset };
    }

    update();
    host.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      host.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [items.length, rowHeight, scrollKey, virtualized]);

  useEffect(() => {
    if (!virtualized || typeof window === "undefined") return undefined;
    const pending = pendingRestoreRef.current;
    if (!pending || pending.key !== scrollKey) return undefined;

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const latest = pendingRestoreRef.current;
        if (!latest || latest.key !== scrollKey) return;
        const node = containerRef.current;
        if (!node) return;
        const host = scrollHostFor(node);
        scrollHostTo(host, latest.offset);
        pendingRestoreRef.current = null;
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [scrollKey, virtualized]);

  const activeIndex = items.findIndex(track => activeEntryId ? track.playlistEntryId === activeEntryId : track.id === activeYoutubeId);
  const renderRow = (track, index) => (
      <PlaylistTrackRow
        key={track.playlistEntryId || track.id}
        track={track}
        index={index}
        active={activeIndex === index}
        isPlaying={isPlaying}
        removable={removable}
        liked={liked}
        onPlay={onPlay}
        onRemove={onRemove}
        reorderable={reorderable}
        nextEntryId={items[index + 1]?.playlistEntryId || null}
        onMove={(entryId, beforeEntryId) => {
          if (items.some(item => item.playlistEntryId === entryId)) onMove?.(entryId, beforeEntryId);
        }}
        onMoveUp={reorderable && index > 0 ? () => onMove?.(track.playlistEntryId, items[index - 1].playlistEntryId) : undefined}
        onMoveDown={reorderable && index < items.length - 1 ? () => onMove?.(track.playlistEntryId, items[index + 2]?.playlistEntryId || null) : undefined}
      />
  );
  if (!virtualized) {
    return items.map(renderRow);
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
        {visible.map((track, localIndex) => renderRow(track, range.start + localIndex))}
      </div>
    </div>
  );
}
