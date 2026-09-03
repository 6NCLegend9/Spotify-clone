"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { EQ_PRESETS, updateEqBands, updateSetting } from "@/redux/features/settingsSlice";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FiCheck, FiSave, FiSettings } from "react-icons/fi";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import GenrePreferences from "@/components/GenrePreferences";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";
import {
  ANALYTICS_CONSENT,
  writeAnalyticsConsent,
} from "@/utils/analyticsConsent";

const qualityOptions = [["auto", "Automatic"], ["low", "Data saver"], ["normal", "Balanced"], ["high", "High quality"], ["very-high", "Best available"]];
const normalizationOptions = [["quiet", "Quiet · -23 LUFS"], ["normal", "Normal · -14 LUFS"], ["loud", "Loud · -11 LUFS"]];
const videoQualityOptions = [["auto", "Automatic"], ["720p", "Prefer 720p"], ["1080p", "Prefer 1080p"], ["audio-only", "Audio only"]];
const bandLabels = ["60Hz", "230Hz", "910Hz", "3.6kHz", "14kHz"];

function settingsErrorDetails(error) {
  const details = userErrorDetails(error);
  if (["OFFLINE", "NETWORK_ERROR", "TIMEOUT", "RATE_LIMITED", "UNAVAILABLE"].includes(details.code)) {
    return { ...details, ...userErrorDetails({ code: details.code }) };
  }
  if (details.code === "VALIDATION_ERROR") {
    return {
      ...details,
      title: "Check your settings",
      message: "One or more settings are no longer supported. Refresh the page and try again.",
      retryable: false,
    };
  }
  return details;
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/10 py-4">
      <span>
        <span className="block text-sm text-gray-200">{label}</span>
        {description ? (
          <span className="mt-1 block text-xs leading-5 text-[#9aa8b5]">
            {description}
          </span>
        ) : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-[#00e6e6] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#00e6e6] after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-black" />
    </label>
  );
}

function SelectControl({ label, value, options, onChange }) {
  return (
    <label className="flex flex-col gap-2 border-b border-white/10 py-4 text-sm text-gray-300 sm:flex-row sm:items-center sm:justify-between">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-md border border-white/15 bg-[#101b29] px-3 py-2 text-sm text-white outline-none focus:border-[#00e6e6]"
      >
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

export default function SettingsPage() {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.settings);
  const { status } = useSession();
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState(null);
  const savedTimerRef = useRef(null);
  const set = (key, value) => dispatch(updateSetting({ key, value }));
  const setUsageAnalytics = (value) => {
    writeAnalyticsConsent(
      value ? ANALYTICS_CONSENT.accepted : ANALYTICS_CONSENT.necessary,
    );
    set("tailoredAds", value);
  };

  useEffect(() => () => {
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
  }, []);

  const saveSettings = async () => {
    if (status !== "authenticated" || saveState === "saving") return;
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    setSaveState("saving");
    setSaveError(null);
    try {
      const data = await requestJson("/api/settings", {
        method: "PUT",
        body: { settings },
        fallbackTitle: "Settings weren't saved",
        fallbackMessage: "We couldn't save your settings. Please try again.",
      });
      if (data?.success !== true) throw new Error("Settings save did not complete.");
      setSaveState("saved");
      savedTimerRef.current = window.setTimeout(() => setSaveState("idle"), 2200);
    } catch (error) {
      setSaveState("error");
      setSaveError(settingsErrorDetails(error));
    }
  };

  const saveLabel = status === "loading"
    ? "Checking account..."
    : status !== "authenticated"
      ? "Sign in to sync"
      : saveState === "saving"
        ? "Saving..."
        : saveState === "saved"
          ? "Saved"
          : "Save";

  return (
    <main className="page text-white">
      <header className="page-hero border-b border-white/10 pb-6">
        <div>
          <p className="eyebrow mb-3 flex items-center gap-2"><FiSettings /> Settings</p>
          <h1 className="text-3xl font-bold sm:text-5xl">Tune your listening.</h1>
          <p className="mt-3 max-w-2xl text-sm text-[#9aa8b5]">Playback, discovery, privacy, and audio preferences in one place.</p>
        </div>
        {status === "unauthenticated" ? (
          <Link href="/login" className="btn-primary h-10 shrink-0 px-4 text-sm">
            <FiSave /> {saveLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={saveSettings}
            disabled={status !== "authenticated" || saveState === "saving"}
            aria-busy={saveState === "saving"}
            className="btn-primary h-10 shrink-0 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveState === "saved" ? <FiCheck aria-hidden="true" /> : <FiSave aria-hidden="true" />} {saveLabel}
          </button>
        )}
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {saveState === "saving" ? "Saving settings." : saveState === "saved" ? "Settings saved." : ""}
      </p>
      {saveError ? (
        <div className="mb-8">
          <UserMessage
            title={saveError.title}
            message={saveError.message}
            onRetry={saveError.retryable ? saveSettings : undefined}
            retryLabel="Retry save"
            busy={saveState === "saving"}
          />
        </div>
      ) : null}

      <section className="mb-8 grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7 lg:col-span-2">
          <h2 className="mb-2 text-xl font-semibold">Audio quality</h2>
          <SelectControl label="Audio quality preference" value={settings.streamingQuality} options={qualityOptions} onChange={(value) => set("streamingQuality", value)} />
          <SelectControl label="Video quality preference" value={settings.videoQuality} options={videoQualityOptions} onChange={(value) => set("videoQuality", value)} />
          <SelectControl label="Volume normalization" value={settings.normalization} options={normalizationOptions} onChange={(value) => set("normalization", value)} />
          <Toggle label="Mono audio" checked={settings.monoAudio} onChange={(value) => set("monoAudio", value)} />
          <p className="mt-4 text-xs text-[#9aa8b5]">HeyKasa asks YouTube for the selected quality. The final audio and video quality depends on the uploaded source, browser, viewport, and connection. The player shows the video quality currently delivered.</p>
        </div>
      </section>

      <GenrePreferences status={status} />

      <section className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">Equalizer presets</h2><p className="mt-1 text-xs text-gray-400">Five-band profile applied to the current track. Presets write real band values so playback can use them.</p></div><span className="text-sm text-[#00e6e6]">{settings.eqPreset}</span></div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {EQ_PRESETS.map((preset, index) => <button key={preset} type="button" aria-pressed={settings.eqPreset === preset} onClick={() => set("eqPreset", preset)} className={`min-h-14 rounded-md border px-3 py-2 text-left text-[13px] leading-snug transition ${settings.eqPreset === preset ? "border-[#00e6e6] bg-[#00e6e6]/10 text-[#00e6e6]" : "border-white/10 text-gray-300 hover:border-white/30"}`}><span className="mr-1.5 text-gray-400">{String(index + 1).padStart(2, "0")}</span>{preset}</button>)}
        </div>
        <div className="mt-7 grid gap-5 sm:grid-cols-5">{settings.eqBands.map((value, index) => <label key={bandLabels[index]} className="text-sm text-gray-400">{bandLabels[index]}<input type="range" min="-12" max="12" value={value} aria-valuetext={`${value > 0 ? "+" : ""}${value} dB`} onChange={(event) => dispatch(updateEqBands(settings.eqBands.map((band, bandIndex) => bandIndex === index ? Number(event.target.value) : band)))} className="mt-3 h-8 w-full accent-[#00e6e6]" /><span className="mt-1.5 block text-sm text-white">{value > 0 ? "+" : ""}{value} dB</span></label>)}</div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2 mb-8">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7"><h2 className="mb-2 text-xl font-semibold">Playback & data</h2><Toggle label="Data Saver mode" checked={settings.dataSaver} onChange={(value) => set("dataSaver", value)} /><Toggle label="Audio-only mode" checked={settings.audioOnly} onChange={(value) => set("audioOnly", value)} /><Toggle label="Captions when available" description="Ask YouTube to show captions on the current video when the uploader provided them." checked={settings.captions !== false} onChange={(value) => set("captions", value)} /><Toggle label="Letter keyboard shortcuts" description="Single-letter playback shortcuts such as J, L, M, F, P, and T. Turn this off if they conflict with a screen reader, browser extension, or another keyboard layout." checked={settings.keyboardShortcuts !== false} onChange={(value) => set("keyboardShortcuts", value)} /><Toggle label="Live synced lyrics" checked={settings.syncedLyrics !== false} onChange={(value) => set("syncedLyrics", value)} /><Toggle label="Picture-in-picture (desktop)" checked={settings.pictureInPicture !== false} onChange={(value) => set("pictureInPicture", value)} /><Toggle label="Wi-Fi-only downloads" checked={settings.wifiOnlyDownloads} onChange={(value) => set("wifiOnlyDownloads", value)} /></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7"><h2 className="mb-2 text-xl font-semibold">Taste & privacy</h2><Toggle label="Allow explicit content" checked={settings.explicitContent} onChange={(value) => set("explicitContent", value)} /><Toggle label="Private session" checked={settings.privateSession} onChange={(value) => set("privateSession", value)} /><Toggle label="Usage analytics" description="Allow Simple Analytics to measure aggregate usage and service performance. This is optional and is not used for advertising." checked={settings.tailoredAds} onChange={setUsageAnalytics} /><p className="mt-4 text-xs text-[#9aa8b5]">Private session prevents new listening activity from being used for recommendations. Analytics consent applies only to this browser and can be changed here at any time.</p></div>
      </section>

      {status === "authenticated" && (
        <section className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 p-5 sm:p-7">
          <h2 className="mb-2 text-xl font-semibold text-red-500">Danger Zone</h2>
          <p className="mb-4 text-xs text-gray-400">Permanently delete your account and all associated data. This action cannot be undone.</p>
          <DeleteAccountForm />
        </section>
      )}
    </main>
  );
}
