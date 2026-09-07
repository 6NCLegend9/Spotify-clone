/**
 * Safe wrapper for native touch haptics (navigator.vibrate).
 * Fails silently on unsupported devices, desktop browsers, or when reduced motion is enabled.
 */
export function triggerHaptic(type = "light") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    const isReduced = typeof document !== "undefined"
      && (document.documentElement.dataset.a11yReducedMotion === "true"
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (isReduced) return;

    if (type === "light") navigator.vibrate(10);
    else if (type === "medium") navigator.vibrate(20);
    else if (type === "heavy") navigator.vibrate([15, 30, 15]);
  } catch {
    // Ignore permission or browser security restrictions.
  }
}
