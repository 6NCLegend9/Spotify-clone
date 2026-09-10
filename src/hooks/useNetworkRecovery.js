"use client";

import { createElement, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { toast } from "react-hot-toast";

const RECOVERY_TOAST_ID = "heykasa-chunk-recovery";

export default function useNetworkRecovery() {
  useEffect(() => {
    const onError = (event) => {
      const message = String(event?.message || event?.reason?.message || event?.reason || "");
      if (!/loading chunk|chunkloaderror|dynamically imported module|moduleid is not a function/i.test(message)) return;
      toast((notification) => createElement("div", { className: "flex flex-wrap items-center gap-3" },
        createElement("span", null, "Part of HeyKasa could not load. Reloading will stop playback."),
        createElement("button", {
          type: "button",
          className: "inline-flex min-h-[44px] items-center gap-2 px-3",
          onClick: () => window.location.reload(),
        }, createElement(RefreshCw, { size: 18, "aria-hidden": true }), "Reload"),
        createElement("button", {
          type: "button",
          className: "inline-flex min-h-[44px] min-w-[44px] items-center justify-center",
          "aria-label": "Dismiss reload notice",
          title: "Dismiss reload notice",
          onClick: () => toast.remove(notification.id),
        }, createElement(X, { size: 18, "aria-hidden": true })),
      ), { id: RECOVERY_TOAST_ID, duration: Infinity });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onError);
      toast.dismiss(RECOVERY_TOAST_ID);
    };
  }, []);
}
