"use client";

import { useEffect, useState } from "react";
import { FiDownload, FiSmartphone } from "react-icons/fi";
import { requestJson } from "@/services/http";

export default function AndroidAppCard() {
  const [release, setRelease] = useState(null);
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    requestJson("/api/android/manifest", { signal: controller.signal, useCache: false }).then(value => {
      if (controller.signal.aborted) return;
      setRelease(value);
      setStatus("loaded");
    }).catch(() => {
      if (!controller.signal.aborted) { setRelease(null); setStatus("error"); }
    });
    return () => controller.abort();
  }, [retry]);
  const available = status === "loaded" && release?.available === true;
  const size = Number.isFinite(release?.sizeBytes) && release.sizeBytes > 0 ? `${(release.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : "";
  return (
    <section aria-labelledby="android-app-heading" data-testid="android-download-card" className="mb-8 glass-panel rounded-xl p-5 sm:p-7">
      <h2 id="android-app-heading" className="flex items-center gap-3 text-xl font-semibold"><FiSmartphone aria-hidden="true" />HayKasa for Android</h2>
      <p className="mt-2 text-sm text-[#9aa8b5]">Keep HayKasa on your phone with the Android app.</p>
      <div className="mt-6 rounded-lg border border-white/10 bg-black/10 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-100">Android 6.0+ · Preview{available && size ? ` · ${size}` : ""}</p>
            <p className="mt-2 text-xs leading-5 text-[#9aa8b5]">Download the APK and open it to install. Allow installation from your browser if Android asks. No ZIP or GitHub sign-in needed.</p>
            <p role="status" className="mt-2 text-xs text-[#9aa8b5]">{status === "loading" ? "Checking download…" : !available ? "The Android download is temporarily unavailable. Please try again." : ""}</p>
          </div>
          {available ? (
            <a href="/api/android/download" download="HayKasa-Android.apk" className="btn-primary min-h-11 shrink-0 gap-2 px-4"><FiDownload aria-hidden="true" />Download for Android</a>
          ) : (
            <button type="button" disabled className="btn-primary min-h-11 shrink-0 gap-2 px-4 opacity-50"><FiDownload aria-hidden="true" />{status === "loading" ? "Checking download…" : "Android download unavailable"}</button>
          )}
        </div>
        {status !== "loading" && !available ? <button type="button" onClick={() => setRetry(value => value + 1)} className="btn-ghost mt-3 min-h-11 px-4">Try again</button> : null}
      </div>
    </section>
  );
}
