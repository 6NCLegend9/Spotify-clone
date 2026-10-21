"use client";

import { useEffect, useState } from "react";
import { getHeyKasaDesktopApi } from "@/utils/desktopEnvironment";

export default function useInstalledApp() {
  const [kind, setKind] = useState(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const detect = () => {
      if (getHeyKasaDesktopApi()) return "desktop";
      if (/\bHayKasaAndroid\//.test(navigator.userAgent)
        || typeof window.HayKasaAndroidMedia?.postMessage === "function") return "android";
      return standalone.matches || navigator.standalone === true ? "pwa" : "browser";
    };
    const sync = () => setKind(detect());
    const installed = () => {
      const current = detect();
      setKind(current === "browser" ? "pwa" : current);
    };
    sync();
    window.addEventListener("appinstalled", installed);
    if (typeof standalone.addEventListener === "function") standalone.addEventListener("change", sync);
    else standalone.addListener(sync);
    return () => {
      window.removeEventListener("appinstalled", installed);
      if (typeof standalone.removeEventListener === "function") standalone.removeEventListener("change", sync);
      else standalone.removeListener(sync);
    };
  }, []);

  return kind;
}
