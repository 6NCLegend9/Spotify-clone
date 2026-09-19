"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { requestJson } from "@/services/http";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const VISIBILITY_CHECK_THROTTLE_MS = 2 * 60 * 1000;

function loadedBuildId() {
  if (typeof document === "undefined") return "";
  return document.querySelector('meta[name="heykasa-build"]')?.getAttribute("content")?.trim() || "";
}

export default function WebUpdateNotifier() {
  const notifiedRef = useRef("");
  const lastCheckRef = useRef(0);

  useEffect(() => {
    const loadedBuild = loadedBuildId();
    if (!loadedBuild || loadedBuild === "development") return undefined;
    let active = true;

    const check = async () => {
      if (!active || !navigator.onLine) return;
      lastCheckRef.current = Date.now();
      try {
        const result = await requestJson("/api/version", {
          cache: "no-store",
          retry: false,
          timeout: 8000,
          fallbackTitle: "Update check unavailable",
          fallbackMessage: "Could not check for a newer HayKasa web build.",
        });
        const currentBuild = typeof result?.webVersion === "string" ? result.webVersion.trim() : "";
        if (!active || !currentBuild || currentBuild === "development" || currentBuild === loadedBuild
          || notifiedRef.current === currentBuild) return;

        notifiedRef.current = currentBuild;
        toast((entry) => (
          <div className="flex max-w-sm items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">A new HayKasa version is ready</p>
              <p className="mt-1 text-xs leading-5 text-[#b5c1cc]">Reload when you&apos;re ready. Playback is not interrupted automatically.</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full bg-[#00e6e6] px-3 py-2 text-xs font-bold text-[#041017]"
              onClick={() => {
                toast.dismiss(entry.id);
                window.location.reload();
              }}
            >
              Reload
            </button>
          </div>
        ), { duration: 20_000 });
      } catch {
        // An update check must never interfere with playback or navigation.
      }
    };

    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckRef.current < VISIBILITY_CHECK_THROTTLE_MS) return;
      void check();
    };
    const onOnline = () => void check();

    void check();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
