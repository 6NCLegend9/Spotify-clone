"use client";

import { useEffect } from "react";

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const MAX_ATTEMPTS = BACKOFF_MS.length;
const RELOAD_KEY = "heykasa.autorecover.streak";
const PENDING_RELOAD_KEY = "heykasa.autorecover.pending";

function isCriticalRequest(url) {
  if (!url) return false;
  return url.includes("/api/userInfo")
    || url.includes("/api/userPlaylists")
    || url.includes("/api/favourite")
    || url.includes("/api/language")
    || url.includes("/api/settings")
    || url.includes("/api/recommendations");
}

function readStreak() {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function writeStreak(value) {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(value));
  } catch {
    // Storage may be unavailable in hardened/private contexts.
  }
}

/**
 * Self-healing for two failure modes the user actually hits:
 *
 * 1. Stalled critical fetches (offline blip, a hung socket, a dev recompile)
 *    that used to leave a panel stuck on "Loading…" forever.
 * 2. Chunk/asset load failures during Next dev HMR (the "moduleId is not a
 *    function" style errors) that white-screen a section.
 *
 * Both retry with backoff; after exhausting retries we do one guarded reload
 * per burst so the app can recover without spiralling into a reload loop.
 */
export default function useNetworkRecovery() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let disposed = false;
    const controllers = new Set();

    const scheduleReload = (reason) => {
      const streak = readStreak();
      if (streak >= 3) return; // give up after 3 quick reloads to avoid a loop
      writeStreak(streak + 1);
      try {
        window.sessionStorage.setItem(PENDING_RELOAD_KEY, reason);
      } catch {
        // ignore
      }
      window.location.reload();
    };

    const onLoad = () => {
      // A successful full load after a reload resets the streak.
      try {
        if (window.sessionStorage.getItem(PENDING_RELOAD_KEY)) {
          window.sessionStorage.removeItem(PENDING_RELOAD_KEY);
          writeStreak(0);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("load", onLoad);

    const heal = (url, attempt) => {
      if (disposed || attempt > MAX_ATTEMPTS) {
        if (!disposed && attempt > MAX_ATTEMPTS && isCriticalRequest(url)) scheduleReload(url);
        return;
      }
      const controller = new AbortController();
      controllers.add(controller);
      const timer = window.setTimeout(async () => {
        controllers.delete(controller);
        if (disposed) return;
        try {
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error(`status ${response.status}`);
        } catch {
          if (disposed) return;
          heal(url, attempt + 1);
        }
      }, BACKOFF_MS[attempt - 1]);
      controller.signal.addEventListener("abort", () => window.clearTimeout(timer), { once: true });
    };

    const onOfflineFail = (event) => {
      const url = event?.detail?.url || "";
      if (!isCriticalRequest(url)) return;
      heal(url, 1);
    };

    const onError = (event) => {
      const message = String(event?.message || "");
      const isChunkError = /loading chunk|chunkloaderror|dynamically imported module|moduleid is not a function/i.test(message);
      if (isChunkError) scheduleReload(message);
    };

    window.addEventListener("heykasa:network-fail", onOfflineFail);
    window.addEventListener("error", onError);
    return () => {
      disposed = true;
      window.removeEventListener("load", onLoad);
      window.removeEventListener("heykasa:network-fail", onOfflineFail);
      window.removeEventListener("error", onError);
      for (const controller of controllers) controller.abort();
      controllers.clear();
    };
  }, []);
}
