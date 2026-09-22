"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import styles from "./BottomSheet.module.css";

let scrollLocks = 0;
let unlockedOverflow = "";

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
  const [present, setPresent] = useState(open);
  const frameRef = useRef(0);
  const dragRef = useRef(0);
  const visible = open || present;

  useEffect(() => {
    if (open) { setPresent(true); return undefined; }
    if (!present) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.dataset.a11yReducedMotion === "true";
    if (reduced) { setPresent(false); return undefined; }
    const timer = window.setTimeout(() => setPresent(false), 240);
    return () => window.clearTimeout(timer);
  }, [open, present]);

  useEffect(() => {
    dragStart.current = null;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    if (open) {
      dragRef.current = 0;
      panelRef.current?.style.removeProperty("--sheet-offset");
      panelRef.current?.removeAttribute("data-dragging");
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [open]);

  useFocusTrap({ enabled: visible, onClose: open ? onClose : undefined, containerRef: panelRef });

  // Lock background scrolling and fire a light haptic while the sheet is open.
  useEffect(() => {
    if (!visible) return undefined;
    vibrate(10);
    const { body } = document;
    if (scrollLocks++ === 0) unlockedOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      if (--scrollLocks === 0) body.style.overflow = unlockedOverflow;
    };
  }, [visible]);

  if (!visible || typeof document === "undefined") return null;

  const beginDrag = (event) => {
    if (!open || !event.isPrimary || event.button !== 0) return;
    dragStart.current = { y: event.clientY, t: Date.now(), id: event.pointerId };
    panelRef.current?.setAttribute("data-dragging", "true");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    if (!dragStart.current || dragStart.current.id !== event.pointerId) return;
    const delta = event.clientY - dragStart.current.y;
    dragRef.current = Math.max(0, delta);
    if (!frameRef.current) frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      panelRef.current?.style.setProperty("--sheet-offset", `${dragRef.current}px`);
    });
  };

  const cancelDrag = () => {
    dragStart.current = null;
    dragRef.current = 0;
    cancelAnimationFrame(frameRef.current); frameRef.current = 0;
    panelRef.current?.style.setProperty("--sheet-offset", "0px");
    // Keep the entrance animation disabled while the sheet springs back.
    panelRef.current?.setAttribute("data-dragging", "false");
  };

  const endDrag = (event) => {
    const start = dragStart.current;
    if (!start || start.id !== event.pointerId) return;
    const distance = Math.max(0, event.clientY - start.y);
    const velocity = distance / Math.max(1, Date.now() - start.t);
    const height = panelRef.current?.offsetHeight || 0;
    const shouldClose = velocity > 0.5 || distance > height * 0.3;
    if (shouldClose && onClose) {
      dragStart.current = null;
      cancelAnimationFrame(frameRef.current); frameRef.current = 0;
      panelRef.current?.style.setProperty("--sheet-offset", `${distance}px`);
      panelRef.current?.setAttribute("data-dragging", "false");
      onClose();
    } else cancelDrag();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return createPortal(
    <div className={`fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4 ${overlayClassName}`}>
      <button
        type="button"
        aria-label={`Close ${label}`}
        onClick={open ? onClose : undefined}
        data-state={open ? "open" : "closing"}
        className={`absolute inset-0 cursor-default touch-none bg-black/70 backdrop-blur-sm ${styles.backdrop}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titleId ? undefined : label}
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-state={open ? "open" : "closing"}
        className={`glass-panel ${styles.panel} relative z-10 max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] outline-none sm:max-w-sm sm:rounded-2xl sm:pb-4 ${className}`}
        onClickCapture={(event) => { if (!open) { event.preventDefault(); event.stopPropagation(); } }}
      >
        {showHandle ? (
          <div
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={() => { if (dragStart.current) cancelDrag(); }}
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
