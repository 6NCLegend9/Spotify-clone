"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 72;
const MAX_PULL = 120;
const DAMPING = 0.55;

export default function PullToRefresh() {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);

  const triggerRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setDistance(THRESHOLD);
    // Full reload gives the most reliable "fresh content" behavior.
    window.setTimeout(() => window.location.reload(), 320);
  }, []);

  useEffect(() => {
    const container = document.getElementById("main-content");
    if (!container) return undefined;

    // Touch-only: pointers that are not touch (mouse/trackpad) never start a pull.
    const onTouchStart = (event) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      if (container.scrollTop > 0) return;
      startYRef.current = event.touches[0].clientY;
      startXRef.current = event.touches[0].clientX;
      pullingRef.current = true;
    };

    const onTouchMove = (event) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (container.scrollTop > 0) {
        pullingRef.current = false;
        setDistance(0);
        return;
      }
      const delta = event.touches[0].clientY - startYRef.current;
      const deltaX = event.touches[0].clientX - startXRef.current;
      // Horizontal intent (mood-radio pills, carousels): release so native scroll works.
      if (Math.abs(deltaX) > Math.abs(delta)) {
        pullingRef.current = false;
        setDistance(0);
        return;
      }
      if (delta <= 0) {
        setDistance(0);
        return;
      }
      // Only claim the gesture (blocking native scroll) once it's clearly a downward pull.
      if (event.cancelable) event.preventDefault();
      setDistance(Math.min(MAX_PULL, delta * DAMPING));
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      setDistance((current) => {
        if (current >= THRESHOLD) {
          triggerRefresh();
          return THRESHOLD;
        }
        return 0;
      });
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [triggerRefresh]);

  const active = distance > 0 || refreshing;
  const progress = Math.min(1, distance / THRESHOLD);
  const ready = distance >= THRESHOLD;

  return (
    <div
      className="ptr-indicator"
      aria-hidden={!active}
      style={{
        transform: `translate(-50%, ${active ? Math.max(distance - 12, 8) : -48}px)`,
        opacity: active ? 1 : 0,
      }}
    >
      <span
        className={`ptr-spinner ${refreshing ? "is-spinning" : ""} ${ready ? "is-ready" : ""}`}
        style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
      />
    </div>
  );
}
