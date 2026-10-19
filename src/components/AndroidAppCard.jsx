"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FiDownload, FiSmartphone } from "react-icons/fi";
import { requestJson } from "@/services/http";

export default function AndroidAppCard() {
  const [release, setRelease] = useState(null);
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [installationHelpOpen, setInstallationHelpOpen] = useState(false);
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
            <p id="android-install-note" className="mt-2 text-xs leading-5 text-[#9aa8b5]">This preview APK is installed outside an app store. Samsung Auto Blocker can prevent installation with “Unknown app blocked”. You can use the web app without installing an APK.</p>
            <p role="status" className="mt-2 text-xs text-[#9aa8b5]">{status === "loading" ? "Checking download…" : !available ? "The Android download is temporarily unavailable. Please try again." : ""}</p>
          </div>
          {available ? (
            <a href="/api/android/download" download="HayKasa-Android.apk" aria-describedby="android-install-note" onClick={() => setInstallationHelpOpen(true)} className="btn-primary min-h-11 shrink-0 gap-2 px-4"><FiDownload aria-hidden="true" />Download for Android</a>
          ) : (
            <button type="button" disabled className="btn-primary min-h-11 shrink-0 gap-2 px-4 opacity-50"><FiDownload aria-hidden="true" />{status === "loading" ? "Checking download…" : "Android download unavailable"}</button>
          )}
        </div>
        {status !== "loading" && !available ? <button type="button" onClick={() => setRetry(value => value + 1)} className="btn-ghost mt-3 min-h-11 px-4">Try again</button> : null}
        <Link href="/" className="btn-ghost mt-3 min-h-11 px-4">Use web app</Link>
        <details open={installationHelpOpen} onToggle={event => setInstallationHelpOpen(event.currentTarget.open)} className="mt-3 border-t border-white/10 pt-3 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">Samsung installation help</summary>
          <div className="space-y-3 pt-2 leading-6 text-[#9aa8b5]">
            <p>“Unknown app blocked” is a Samsung phone setting, shown before HayKasa can run. This preview is not installed through the Play Store or Galaxy Store. Signing an APK does not bypass Auto Blocker.</p>
            <p>You can keep your current phone protections and choose <strong className="text-gray-100">Use web app</strong> instead.</p>
            <p>If you choose to install this preview manually:</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open your phone’s <strong className="text-gray-100">Settings → Security and privacy → Auto Blocker</strong>. Samsung requires Auto Blocker to be off for APK installation outside approved stores.</li>
              <li>Under <strong className="text-gray-100">Install unknown apps</strong>, allow the browser or file manager you use to open the downloaded APK. Menu names vary by phone.</li>
              <li>Open <strong className="text-gray-100">HayKasa-Android.apk</strong> from your downloads and follow Android’s installation prompt. No ZIP extraction or GitHub sign-in is needed.</li>
              <li>After installing, restore your previous installation permissions and Auto Blocker setting.</li>
            </ol>
            <p>HayKasa cannot change these settings or promise installation on a device that blocks unknown apps.</p>
          </div>
        </details>
      </div>
    </section>
  );
}
