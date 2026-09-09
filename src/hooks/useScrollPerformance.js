"use client";

import { useEffect } from "react";

const IDLE_MS = 140;

export default function useScrollPerformance() {
  useEffect(() => {
    const scroller = document.getElementById("main-content");
    if (!scroller) return undefined;

    let idleTimer = 0;
    let busy = false;

    const goIdle = () => {
      busy = false;
      document.documentElement.classList.remove("is-scrolling");
      document.dispatchEvent(new Event("heykasa:scroll-idle"));
    };

    const onScroll = () => {
      if (!busy) {
        busy = true;
        document.documentElement.classList.add("is-scrolling");
        document.dispatchEvent(new Event("heykasa:scroll-busy"));
      }
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(goIdle, IDLE_MS);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.clearTimeout(idleTimer);
      document.documentElement.classList.remove("is-scrolling");
    };
  }, []);
}
