"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { EQ_PRESETS, updateEqBands, updateSetting } from "@/redux/features/settingsSlice";
import { EQ_BAND_FREQS, bandsForPreset } from "@/utils/eqPresets";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FiCheck, FiSave, FiSettings } from "react-icons/fi";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import ExportDataButton from "@/components/ExportDataButton";
import UserMessage from "@/components/UserMessage";
import { requestJson } from "@/services/http";
import { userErrorDetails } from "@/utils/userError";

const qualityOptions = [["auto", "Automatic"], ["low", "Data saver"], ["normal", "Balanced"], ["high", "High quality"], ["very-high", "Best available"]];
const normalizationOptions = [["quiet", "Quiet · -23 LUFS"], ["normal", "Normal · -14 LUFS"], ["loud", "Loud · -11 LUFS"]];
const videoQualityOptions = [["auto", "Automatic"], ["720p", "Prefer 720p"], ["1080p", "Prefer 1080p"], ["audio-only", "Audio only"]];
const eqPresetOptions = EQ_PRESETS.map((preset) => [preset, preset]);
const EQ_GAIN_LIMIT = 12;

const GenrePreferences = dynamic(() => import("@/components/GenrePreferences"), {
  loading: () => <div className="mb-8 h-72 animate-shimmer rounded-xl bg-white/[0.04]" />,
});

function formatBandFrequency(frequency) {
  return frequency >= 1000 ? `${(frequency / 1000).toFixed(frequency % 1000 === 0 ? 0 : 1)} kHz` : `${frequency} Hz`;
}

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
  const eqBands = bandsForPreset(settings.eqPreset, settings.eqBands);
  const setBand = (index, value) => {
    dispatch(updateEqBands(eqBands.map((band, position) => (position === index ? value : Number(band) || 0))));
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
          <h1 className="font-display text-3xl sm:text-5xl">Tune your listening.</h1>
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
        <div className="glass-panel rounded-xl p-5 sm:p-7 lg:col-span-2">
          <h2 className="mb-2 text-xl font-semibold">Audio quality</h2>
          <SelectControl label="Audio quality preference" value={settings.streamingQuality} options={qualityOptions} onChange={(value) => set("streamingQuality", value)} />
          <SelectControl label="Video quality preference" value={settings.videoQuality} options={videoQualityOptions} onChange={(value) => set("videoQuality", value)} />
          <SelectControl label="Volume normalization" value={settings.normalization} options={normalizationOptions} onChange={(value) => set("normalization", value)} />
          <Toggle label="Mono audio" checked={settings.monoAudio} onChange={(value) => set("monoAudio", value)} />
          <Toggle label="Spatial audio / Stereo expansion" description="Subtly widens the stereo field for immersive headphone listening." checked={settings.spatialAudio} onChange={(value) => set("spatialAudio", value)} />
          <p className="mt-4 text-xs text-[#9aa8b5]">HeyKasa asks YouTube for the selected quality. The final audio and video quality depends on the uploaded source, browser, viewport, and connection. The player shows the video quality currently delivered.</p>
        </div>
      </section>

      {status === "authenticated" && (
        <section className="mb-8 glass-panel rounded-xl p-5 sm:p-7">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Equalizer</h2>
            <button
              type="button"
              onClick={() => set("eqPreset", "Flat / Neutral")}
              className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold text-gray-200 transition hover:border-[#00e6e6] hover:text-[#00e6e6]"
            >
              Reset to flat
            </button>
          </div>
          <p className="mb-4 text-xs text-gray-400">Shape the tone of your music. Pick a preset or drag a band to fine-tune it.</p>
          <SelectControl label="Preset" value={settings.eqPreset} options={eqPresetOptions} onChange={(value) => set("eqPreset", value)} />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {EQ_BAND_FREQS.map((frequency, index) => {
              const gain = Number(eqBands[index] || 0);
              return (
                <label key={frequency} className="block text-sm text-gray-300">
                  <span className="flex items-baseline justify-between gap-2">
                    <span>{formatBandFrequency(frequency)}</span>
                    <span className="text-xs tabular-nums text-[#00e6e6]">{gain > 0 ? `+${gain}` : gain} dB</span>
                  </span>
                  <input
                    type="range"
                    min={-EQ_GAIN_LIMIT}
                    max={EQ_GAIN_LIMIT}
                    step="1"
                    value={gain}
                    aria-label={`${formatBandFrequency(frequency)} gain`}
                    aria-valuetext={`${gain > 0 ? "plus " : ""}${gain} decibels`}
                    onChange={(event) => setBand(index, Number(event.target.value))}
                    className="mt-3 h-8 w-full accent-[#00e6e6]"
                  />
                </label>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-[#9aa8b5]">Full band-by-band tone shaping applies to tracks played through HeyKasa&apos;s own audio player. YouTube-sourced tracks play inside YouTube&apos;s protected player, so there your preset is applied as an overall loudness adjustment rather than per-band tone.</p>
        </section>
      )}

      <GenrePreferences status={status} />

      <section className="mb-8 glass-panel rounded-xl p-5 sm:p-7">
        <h2 className="mb-2 text-xl font-semibold">Fade transitions</h2>
        <p className="mb-4 text-xs text-gray-400">Fade the end of each song out and the next one in for a smooth transition. Skipping fades out too, just faster so the controls stay responsive. Pausing still stops instantly.</p>
        <Toggle label="Fade in and out" checked={settings.fadeEnabled !== false} onChange={(value) => set("fadeEnabled", value)} />
        <label className="mt-4 block text-sm text-gray-300">
          Fade length · {Number(settings.fadeSeconds ?? 0.8).toFixed(1)}s
          <input
            type="range"
            min="0.2"
            max="12"
            step="0.1"
            value={settings.fadeSeconds ?? 0.8}
            disabled={settings.fadeEnabled === false}
            aria-valuetext={`${Number(settings.fadeSeconds ?? 0.8).toFixed(1)} seconds`}
            onChange={(event) => set("fadeSeconds", Number(event.target.value))}
            className="mt-3 h-8 w-full accent-[#00e6e6] disabled:opacity-40"
          />
        </label>
      </section>

      <section className="grid gap-8 lg:grid-cols-2 mb-8">
        <div className="glass-panel rounded-xl p-5 sm:p-7"><h2 className="mb-2 text-xl font-semibold">Playback & data</h2><Toggle label="Data Saver mode" checked={settings.dataSaver} onChange={(value) => set("dataSaver", value)} /><Toggle label="Audio-only mode" checked={settings.audioOnly} onChange={(value) => set("audioOnly", value)} /><Toggle label="Captions when available" description="Ask YouTube to show captions on the current video when the uploader provided them." checked={settings.captions !== false} onChange={(value) => set("captions", value)} /><Toggle label="Letter keyboard shortcuts" description="Single-letter playback shortcuts such as J, L, M, F, P, and T. Turn this off if they conflict with a screen reader, browser extension, or another keyboard layout." checked={settings.keyboardShortcuts !== false} onChange={(value) => set("keyboardShortcuts", value)} /><Toggle label="Live synced lyrics" checked={settings.syncedLyrics !== false} onChange={(value) => set("syncedLyrics", value)} /><Toggle label="Picture-in-picture (desktop)" checked={settings.pictureInPicture !== false} onChange={(value) => set("pictureInPicture", value)} /><Toggle label="Wi-Fi-only downloads" checked={settings.wifiOnlyDownloads} onChange={(value) => set("wifiOnlyDownloads", value)} /></div>
        <div className="glass-panel rounded-xl p-5 sm:p-7"><h2 className="mb-2 text-xl font-semibold">Taste & privacy</h2><Toggle label="Allow explicit content" checked={settings.explicitContent} onChange={(value) => set("explicitContent", value)} /><Toggle label="Private session" checked={settings.privateSession} onChange={(value) => set("privateSession", value)} /><p className="mt-4 text-xs text-[#9aa8b5]">Private session prevents new listening activity from being used for recommendations.</p></div>
      </section>

      {status === "authenticated" && (
        <section className="mb-8 glass-panel rounded-xl p-5 sm:p-7">
          <h2 className="mb-2 text-xl font-semibold">Your data</h2>
          <p className="mb-4 text-xs text-gray-400">Download a copy of your account, library, history, and playlists as a JSON file.</p>
          <ExportDataButton />
        </section>
      )}

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
