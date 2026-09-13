"use client";

import { useEffect, useRef } from "react";

export function isOutsideDismissTarget(target, roots, point) {
  const x = point?.x;
  const y = point?.y;
  const usePoint = Number.isFinite(x) && Number.isFinite(y);
  return roots.every((root) => {
    if (!root) return true;
    if (usePoint && typeof root.getBoundingClientRect === "function") {
      const rect = root.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
      }
    }
    if (typeof root.contains === "function") return !root.contains(target);
    return root !== target;
  });
}

export function useDismissOnOutside(enabled, onDismiss, rootRefs, options = {}) {
  const { escape = false } = options;
  const latestRef = useRef({ onDismiss, rootRefs, escape });
  latestRef.current = { onDismiss, rootRefs, escape };

  useEffect(() => {
    if (!enabled) return undefined;

    const dismissIfOutside = (event) => {
      const { onDismiss: dismiss, rootRefs: refs } = latestRef.current;
      const roots = (refs || []).map((ref) => ref?.current);
      if (!isOutsideDismissTarget(event.target, roots, { x: event.clientX, y: event.clientY })) return;
      dismiss();
    };

    const onKeyDown = (event) => {
      if (!latestRef.current.escape || event.key !== "Escape") return;
      event.preventDefault();
      latestRef.current.onDismiss();
    };

    document.addEventListener("pointerdown", dismissIfOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismissIfOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);
}
