"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import styles from "./playbackViews.module.css";

/**
 * Presentation adapter for the existing persistent YouTube decks.
 * Only measures layout and changes CSS. Never reparents an iframe, changes a src,
 * creates a player, or calls a transport API. The controller remains untouched.
 */
export function useLiveVideoSurface(
  viewport: RefObject<HTMLDivElement | null>,
  visible: boolean,
  overlay: boolean,
  layoutKey: string,
) {
  useEffect(() => {
    const host = document.querySelector<HTMLElement>("[data-testid='youtube-decks']");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!host || !shell) return;
    const saved = host.getAttribute("style");
    const wasInert = host.inert;
    host.inert = true;
    let frame = 0;
    let disposed = false;
    host.classList.add(styles.liveVideo);
    shell.setAttribute("data-kasa-media", "managed");

    const measure = () => {
      frame = 0;
      if (disposed) return;
      const target = viewport.current;
      const rect = target?.getBoundingClientRect();
      const shown = Boolean(visible && target && rect && rect.width > 1 && rect.height > 1 && target.getClientRects().length);
      host.style.setProperty("--video-opacity", shown ? "1" : "0");
      host.style.setProperty("--video-layer", overlay ? "101" : "31");
      if (!shown || !rect || !target) return;
      host.style.setProperty("--video-left", `${rect.left}px`);
      host.style.setProperty("--video-top", `${rect.top}px`);
      host.style.setProperty("--video-width", `${rect.width}px`);
      host.style.setProperty("--video-height", `${rect.height}px`);
      // Keep a scrolled video inside its own scrollport, including beneath sticky chrome.
      const scrollport = target.closest<HTMLElement>("[data-kasa-scrollport]");
      const bounds = scrollport?.getBoundingClientRect();
      const top = Math.max(0, (bounds?.top ?? 0) - rect.top);
      const bottom = Math.max(0, rect.bottom - (bounds?.bottom ?? window.innerHeight));
      const left = Math.max(0, (bounds?.left ?? 0) - rect.left);
      const right = Math.max(0, rect.right - (bounds?.right ?? window.innerWidth));
      host.style.setProperty("--video-clip", `inset(${top}px ${right}px ${bottom}px ${left}px round 10px)`);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (viewport.current) observer?.observe(viewport.current);
    observer?.observe(shell);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      host.classList.remove(styles.liveVideo);
      host.inert = wasInert;
      if (saved === null) host.removeAttribute("style"); else host.setAttribute("style", saved);
      shell.removeAttribute("data-kasa-media");
    };
  }, [viewport, visible, overlay, layoutKey]);
}
