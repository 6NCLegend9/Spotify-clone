"use client";

import { useEffect } from "react";

const TILT =
  ".home-mix, .library-tile, .home-feature-card, .home-quick-card, .card, .home-square";

export default function usePointerTilt() {
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointerQuery = window.matchMedia("(pointer: coarse)");
    const isDisabled = () =>
      document.hidden
      || document.documentElement.dataset.a11yReducedMotion === "true"
      || motionQuery.matches
      || pointerQuery.matches;

    let last = null;
    let frame = 0;
    let pending = null;

    const apply = (element, clientX, clientY) => {
      const rect = element.getBoundingClientRect();
      const px = (clientX - rect.left) / Math.max(rect.width, 1);
      const py = (clientY - rect.top) / Math.max(rect.height, 1);
      element.style.setProperty("--tilt-x", `${((0.5 - py) * 16).toFixed(2)}deg`);
      element.style.setProperty("--tilt-y", `${((px - 0.5) * 18).toFixed(2)}deg`);
      element.style.setProperty("--spot-x", `${(px * 100).toFixed(1)}%`);
      element.style.setProperty("--spot-y", `${(py * 100).toFixed(1)}%`);
      element.classList.add("is-tilting");
    };

    const clear = (element) => {
      if (!element) return;
      element.style.removeProperty("--tilt-x");
      element.style.removeProperty("--tilt-y");
      element.style.removeProperty("--spot-x");
      element.style.removeProperty("--spot-y");
      element.classList.remove("is-tilting");
    };

    const onMove = (event) => {
      if (isDisabled() || document.documentElement.classList.contains("is-scrolling")) return;
      pending = event;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (isDisabled()) return;
        const next = pending?.target instanceof Element
          ? pending.target.closest(TILT)
          : null;
        if (last && last !== next) clear(last);
        last = next;
        if (next && pending) apply(next, pending.clientX, pending.clientY);
      });
    };

    const onLeave = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      clear(last);
      last = null;
    };

    const onPreferenceChange = () => {
      if (isDisabled()) onLeave();
    };

    const observer = new MutationObserver(onPreferenceChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-a11y-reduced-motion"],
    });
    motionQuery.addEventListener("change", onPreferenceChange);
    pointerQuery.addEventListener("change", onPreferenceChange);
    document.addEventListener("visibilitychange", onPreferenceChange);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("heykasa:scroll-busy", onLeave);
    return () => {
      observer.disconnect();
      motionQuery.removeEventListener("change", onPreferenceChange);
      pointerQuery.removeEventListener("change", onPreferenceChange);
      document.removeEventListener("visibilitychange", onPreferenceChange);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("heykasa:scroll-busy", onLeave);
      onLeave();
    };
  }, []);
}
