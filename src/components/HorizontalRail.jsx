"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function HorizontalRail({ children, label, className = "" }) {
  const railRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setEdges({ start: rail.scrollLeft <= 2, end: rail.scrollLeft >= max - 2 });
  }, []);
  useEffect(() => {
    updateEdges();
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    Array.from(rail.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [children, updateEdges]);
  const scroll = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({ left: direction * Math.max(240, rail.clientWidth * 0.8), behavior: reduceMotion ? "auto" : "smooth" });
  };
  return (
    <div className="relative" role="region" aria-label={label}>
      <div className="mb-3 flex justify-end gap-2">
        <button type="button" className="icon-btn" aria-label={`Previous ${label}`} disabled={edges.start} onClick={() => scroll(-1)}>
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <button type="button" className="icon-btn" aria-label={`Next ${label}`} disabled={edges.end} onClick={() => scroll(1)}>
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>
      <div ref={railRef} onScroll={updateEdges}
        onFocusCapture={(event) => event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" })}
        className={`flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 ${className}`}>
        {children}
      </div>
      {!edges.start && <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-0 top-14 w-8 bg-gradient-to-r from-[var(--navy-surface)] to-transparent" />}
      {!edges.end && <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-0 top-14 w-8 bg-gradient-to-l from-[var(--navy-surface)] to-transparent" />}
    </div>
  );
}
