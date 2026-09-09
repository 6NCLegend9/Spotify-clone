"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// Subtle haptic pulse; silently ignored where the API is unavailable.
export function vibrate(pattern) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* haptics are best-effort */
    }
  }
}

// Mobile-first popout: a swipeable bottom sheet on phones that becomes a
// centered card from `sm` up. Handles scroll-lock, focus trapping, ESC/backdrop
// close, velocity drag-to-dismiss and safe-area padding so callers only supply
// their content.
export default function BottomSheet({
  open,
  onClose,
  titleId,
  describedBy,
  label = "Options",
  children,
  className = "",
  overlayClassName = "",
  showHandle = true,
}) {
  const panelRef = useRef(null);
  const dragStart = useRef(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  useFocusTrap({ enabled: open, onClose, containerRef: panelRef });

  // Lock background scrolling and fire a light haptic while the sheet is open.
  useEffect(() => {
    if (!open) return undefined;
    vibrate(10);
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const beginDrag = (event) => {
    dragStart.current = { y: event.clientY, t: Date.now() };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    if (!dragStart.current) return;
    const delta = event.clientY - dragStart.current.y;
    setDrag(delta > 0 ? delta : 0);
  };

  const endDrag = (event) => {
    const start = dragStart.current;
    dragStart.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!start) return;
    const distance = Math.max(0, event.clientY - start.y);
    const velocity = distance / Math.max(1, Date.now() - start.t);
    const height = panelRef.current?.offsetHeight || 0;
    setDrag(0);
    if (velocity > 0.5 || distance > height * 0.3) onClose?.();
  };

  return createPortal(
    <div className={`fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4 ${overlayClassName}`}>
      <button
        type="button"
        aria-label={`Close ${label}`}
        onClick={onClose}
        className="absolute inset-0 cursor-default touch-none bg-black/70 backdrop-blur-sm animate-fade-in"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titleId ? undefined : label}
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        style={{
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: dragging ? "none" : undefined,
        }}
        className={`glass-panel relative z-10 max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] outline-none transition-transform duration-200 ease-out animate-slideup sm:max-w-sm sm:rounded-2xl sm:pb-4 ${className}`}
      >
        {showHandle ? (
          <div
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="mx-auto -mt-1 mb-3 flex h-8 w-full max-w-[9rem] cursor-grab touch-none items-center justify-center active:cursor-grabbing sm:hidden"
            aria-hidden="true"
          >
            <span className="h-1.5 w-12 rounded-full bg-white/25" />
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
