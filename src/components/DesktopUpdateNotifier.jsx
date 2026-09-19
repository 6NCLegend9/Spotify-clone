"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";
import { getHeyKasaDesktopApi } from "@/utils/desktopEnvironment";

const NOTIFIED_KEY = "heykasa.desktop.lastNotifiedUpdate";

function alreadyNotified(version) {
  try {
    return window.localStorage.getItem(NOTIFIED_KEY) === version;
  } catch {
    return false;
  }
}

function rememberNotification(version) {
  try {
    window.localStorage.setItem(NOTIFIED_KEY, version);
  } catch {
    // Storage can be unavailable; the in-memory updater event still only fires once per download.
  }
}

export default function DesktopUpdateNotifier() {
  useEffect(() => {
    const api = getHeyKasaDesktopApi();
    if (!api?.updates) return undefined;
    let active = true;

    const showReady = (status) => {
      if (!active || status?.state !== "ready") return;
      const version = typeof status.version === "string" ? status.version.trim() : "";
      if (!version || alreadyNotified(version)) return;

      toast((entry) => (
        <div className="flex max-w-sm items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">HayKasa Desktop {version} is ready</p>
            <p className="mt-1 text-xs leading-5 text-[#b5c1cc]">The signed update finished downloading. Restart now, or it will install when HayKasa fully exits.</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              className="rounded-full bg-[#00e6e6] px-3 py-2 text-xs font-bold text-[#041017]"
              onClick={() => {
                rememberNotification(version);
                toast.dismiss(entry.id);
                void api.updates.install().catch(() => {});
              }}
            >
              Restart
            </button>
            <button
              type="button"
              className="px-3 py-1 text-xs font-semibold text-[#b5c1cc]"
              onClick={() => {
                rememberNotification(version);
                toast.dismiss(entry.id);
              }}
            >
              Later
            </button>
          </div>
        </div>
      ), {
        id: `desktop-update-${version}`,
        duration: Infinity,
      });
    };

    void api.updates.getStatus?.().then(showReady).catch(() => {});
    const unsubscribe = typeof api.updates.onStatus === "function"
      ? api.updates.onStatus(showReady)
      : null;

    return () => {
      active = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  return null;
}
