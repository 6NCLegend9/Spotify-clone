"use client";

import { useEffect } from "react";

const PAGE_IDLE_MS = 500;

export default function useHorizontalRail(ref) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const page = document.getElementById("main-content");
    let lastPageScroll = 0;
    let idleTimer = 0;

    const pageIsIdle = () => Date.now() - lastPageScroll >= PAGE_IDLE_MS;

    const setUnlocked = (unlocked) => {
      node.classList.toggle("is-unlocked", unlocked);
    };

    const markPageScroll = () => {
      lastPageScroll = Date.now();
      setUnlocked(false);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setUnlocked(true), PAGE_IDLE_MS);
    };

    const maxScroll = () => Math.max(0, node.scrollWidth - node.clientWidth);

    const onWheel = (event) => {
      if (maxScroll() < 2) return;
      if (!pageIsIdle()) return;

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (!delta) return;
      const next = Math.min(maxScroll(), Math.max(0, node.scrollLeft + delta));
      if (next === node.scrollLeft) return;
      event.preventDefault();
      node.scrollLeft = next;
    };

    let pointerId = null;
    let startX = 0;
    let startLeft = 0;
    let dragged = false;

    const onPointerDown = (event) => {
      if (event.pointerType === "touch") return;
      if (event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startLeft = node.scrollLeft;
      dragged = false;
      node.classList.add("is-dragging");
    };

    const onPointerMove = (event) => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - startX;
      if (!dragged && Math.abs(dx) < 8) return;
      dragged = true;
      node.scrollLeft = startLeft - dx;
    };

    const stopDrag = (event) => {
      if (pointerId !== event.pointerId && event.type !== "pointercancel") return;
      node.classList.remove("is-dragging");
      if (dragged) {
        const blockClick = (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          node.removeEventListener("click", blockClick, true);
        };
        node.addEventListener("click", blockClick, true);
        window.setTimeout(() => node.removeEventListener("click", blockClick, true), 400);
      }
      pointerId = null;
      dragged = false;
    };

    setUnlocked(true);
    page?.addEventListener("scroll", markPageScroll, { passive: true });
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.clearTimeout(idleTimer);
      page?.removeEventListener("scroll", markPageScroll);
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      node.classList.remove("is-dragging", "is-unlocked");
    };
  }, [ref]);
}
