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
  const claimedRef = useRef(false);
  const refreshingRef = useRef(false);

  const triggerRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setDistance(THRESHOLD);
    window.setTimeout(() => window.location.reload(), 320);
  }, []);

  useEffect(() => {
    const container = document.getElementById("main-content");
    if (!container) return undefined;

    const release = () => {
      pullingRef.current = false;
      claimedRef.current = false;
    };

    const onTouchMove = (event) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (container.scrollTop > 0) {
        release();
        setDistance(0);
        return;
      }
      const delta = event.touches[0].clientY - startYRef.current;
      const deltaX = event.touches[0].clientX - startXRef.current;
      if (Math.abs(deltaX) > Math.abs(delta)) {
        release();
        setDistance(0);
        return;
      }
      if (delta <= 8) {
        setDistance(0);
        return;
      }
      claimedRef.current = true;
      if (event.cancelable) event.preventDefault();
      setDistance(Math.min(MAX_PULL, delta * DAMPING));
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      const claimed = claimedRef.current;
      release();
      if (!claimed) {
        setDistance(0);
        return;
      }
      setDistance((current) => {
        if (current >= THRESHOLD) {
          triggerRefresh();
          return THRESHOLD;
        }
        return 0;
      });
    };

    const onTouchStart = (event) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      if (container.scrollTop > 0) return;
      startYRef.current = event.touches[0].clientY;
      startXRef.current = event.touches[0].clientX;
      pullingRef.current = true;
      claimedRef.current = false;
      container.removeEventListener("touchmove", onTouchMove);
      container.addEventListener("touchmove", onTouchMove, { passive: false });
    };

    const dropMove = () => {
      container.removeEventListener("touchmove", onTouchMove);
    };

    const endAndDrop = () => {
      onTouchEnd();
      dropMove();
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchend", endAndDrop, { passive: true });
    container.addEventListener("touchcancel", endAndDrop, { passive: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", endAndDrop);
      container.removeEventListener("touchcancel", endAndDrop);
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
