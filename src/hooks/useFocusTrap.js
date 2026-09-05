"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function getFocusableElements(container) {
  return [...(container?.querySelectorAll(FOCUSABLE_SELECTOR) || [])].filter(
    (element) => (
      !element.hasAttribute("disabled")
      && element.getAttribute("aria-hidden") !== "true"
    ),
  );
}

export function useFocusTrap({
  enabled,
  onClose,
  containerRef,
  restoreFocus = true,
}) {
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const restoreFocusRef = useRef(restoreFocus);

  // Keep latest callbacks/flags without re-running the trap effect, otherwise a
  // new inline onClose on every parent render would steal focus back to the first
  // element (e.g. the ✕ button) after each keystroke.
  useEffect(() => {
    onCloseRef.current = onClose;
    restoreFocusRef.current = restoreFocus;
  }, [onClose, restoreFocus]);

  useEffect(() => {
    if (!enabled) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const frame = window.requestAnimationFrame(() => {
      const first = getFocusableElements(containerRef.current)[0];
      (first || containerRef.current)?.focus?.();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        const onCloseNow = onCloseRef.current;
        if (!onCloseNow) return;
        event.preventDefault();
        onCloseNow();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = getFocusableElements(containerRef.current);
      if (!nodes.length) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      if (restoreFocusRef.current) previousFocusRef.current?.focus?.();
    };
  }, [containerRef, enabled]);
}
