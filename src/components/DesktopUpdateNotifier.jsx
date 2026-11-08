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
    let revision = 0;
    let updateGeneration = 0;
    let currentStatus = null;
    let toastId = null;
    let installing = false;

    const dismissReady = () => {
      // Retired actions must disappear immediately, including during a toast's
      // exit animation or a content/height update after an install response.
      if (toastId) toast.remove(toastId);
      toastId = null;
    };
    const showReady = (error = "") => {
      if (!active) return;
      const version = typeof currentStatus?.version === "string" ? currentStatus.version.trim() : "";
      if (currentStatus?.state !== "ready" || !version || alreadyNotified(version)) {
        dismissReady();
        return;
      }
      const id = `desktop-update-${version}`;
      if (toastId && toastId !== id) dismissReady();
      toastId = id;
      const stillReady = () => active && currentStatus?.state === "ready"
        && currentStatus.version?.trim() === version;

      toast((entry) => (
        <div className="flex max-w-sm items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">HayKasa Desktop {version} is ready</p>
            <p className="mt-1 text-xs leading-5 text-[#b5c1cc]">The signed update finished downloading. Restart now, or it will install when HayKasa fully exits.</p>
            {error ? <p role="alert" className="mt-2 text-xs leading-5 text-red-300">{error}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              disabled={installing}
              className="rounded-full bg-[#096192] px-3 py-2 text-xs font-bold text-[#041017] disabled:opacity-50"
              onClick={async () => {
                if (!stillReady() || installing) return;
                const installGeneration = updateGeneration;
                let failure = "";
                // Synchronous guard also covers two clicks before React renders.
                installing = true;
                showReady();
                try {
                  await api.updates.install();
                  if (stillReady() && updateGeneration === installGeneration) {
                    rememberNotification(version);
                    dismissReady();
                  }
                } catch (installError) {
                  if (stillReady() && updateGeneration === installGeneration) failure = installError instanceof Error ? installError.message : "Could not restart into the update. Try again.";
                } finally {
                  installing = false;
                  // A different update may have arrived while IPC was pending.
                  // Unlock its controls without applying the retired result.
                  showReady(failure);
                }
              }}
            >
              {installing ? "Restarting…" : "Restart"}
            </button>
            <button
              type="button"
              disabled={installing}
              className="px-3 py-1 text-xs font-semibold text-[#b5c1cc] disabled:opacity-50"
              onClick={() => {
                if (!stillReady() || installing) return;
                rememberNotification(version);
                toast.dismiss(entry.id);
                toastId = null;
              }}
            >
              Later
            </button>
          </div>
        </div>
      ), {
        id,
        duration: Infinity,
      });
    };

    const receiveStatus = (status) => {
      // Repeated ready events describe the same update. Leaving that state and
      // returning retires an old install result, even for the same version.
      if (status?.state !== currentStatus?.state || status?.version !== currentStatus?.version) updateGeneration += 1;
      currentStatus = status;
      showReady();
    };
    const unsubscribe = typeof api.updates.onStatus === "function"
      ? api.updates.onStatus((status) => {
        if (!active) return;
        revision += 1;
        receiveStatus(status);
      })
      : null;
    const snapshotRevision = revision;
    void Promise.resolve().then(() => api.updates.getStatus?.()).then((status) => {
      if (!active || revision !== snapshotRevision) return;
      receiveStatus(status);
    }).catch(() => {});

    return () => {
      active = false;
      if (typeof unsubscribe === "function") unsubscribe();
      dismissReady();
    };
  }, []);

  return null;
}
