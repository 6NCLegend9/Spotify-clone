"use client";

import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { EQ_PRESETS, updateEqBands, updateSetting } from "@/redux/features/settingsSlice";
import { useSession } from "next-auth/react";
import { FiCheck, FiSave, FiSettings } from "react-icons/fi";

const qualityOptions = [["auto", "Auto"], ["low", "Low · 24 kbps"], ["normal", "Normal · 96 kbps"], ["high", "High · 160 kbps"], ["very-high", "Very High · 320 kbps"]];
const normalizationOptions = [["quiet", "Quiet · -23 LUFS"], ["normal", "Normal · -14 LUFS"], ["loud", "Loud · -11 LUFS"]];
const videoQualityOptions = [["auto", "Auto"], ["720p", "720p"], ["1080p", "1080p"], ["audio-only", "Audio only"]];
const bandLabels = ["60Hz", "230Hz", "910Hz", "3.6kHz", "14kHz"];

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/10 py-4">
      <span className="text-sm text-gray-200">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 rounded-full bg-white/15 transition peer-checked:bg-[#00e6e6] after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-black" />
    </label>
  );
}

function SelectControl({ label, value, options, onChange }) {
  return (
    <label className="flex flex-col gap-2 border-b border-white/10 py-4 text-sm text-gray-300 sm:flex-row sm:items-center sm:justify-between">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-white/15 bg-[#101b29] px-3 py-2 text-sm text-white outline-none focus:border-[#00e6e6]">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

export default function SettingsPage() {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.settings);
  const { status } = useSession();
  const [saved, setSaved] = useState(false);
  const set = (key, value) => dispatch(updateSetting({ key, value }));

  const saveSettings = async () => {
    setSaved(false);
    if (status === "authenticated") {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <main className="mx-auto min-h-screen w-11/12 max-w-6xl pb-32 pt-16 text-white">
      <header className="mb-10 flex items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#00e6e6]"><FiSettings /> Settings</p>
          <h1 className="text-3xl font-bold sm:text-5xl">Tune your listening.</h1>
          <p className="mt-3 max-w-2xl text-sm text-gray-400">Playback, discovery, privacy, and audio preferences in one place.</p>
        </div>
        <button type="button" onClick={saveSettings} className="flex shrink-0 items-center gap-2 rounded-md bg-[#00e6e6] px-4 py-2 text-sm font-semibold text-black transition hover:bg-white">
          {saved ? <FiCheck /> : <FiSave />} {saved ? "Saved" : "Save"}
        </button>
      </header>

      <section className="mb-8 grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7 lg:col-span-2">
          <h2 className="mb-2 text-xl font-semibold">Audio quality</h2>
          <SelectControl label="Streaming quality" value={settings.streamingQuality} options={qualityOptions} onChange={(value) => set("streamingQuality", value)} />
          <SelectControl label="Video quality" value={settings.videoQuality} options={videoQualityOptions} onChange={(value) => set("videoQuality", value)} />
          <SelectControl label="Volume normalization" value={settings.normalization} options={normalizationOptions} onChange={(value) => set("normalization", value)} />
          <Toggle label="Mono audio" checked={settings.monoAudio} onChange={(value) => set("monoAudio", value)} />
          <p className="mt-4 text-xs text-gray-500">YouTube controls its delivered stream quality; these preferences control the app’s playback policy.</p>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">Equalizer presets</h2><p className="mt-1 text-xs text-gray-400">Five-band profile for compatible playback sources.</p></div><span className="text-xs text-[#00e6e6]">{settings.eqPreset}</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {EQ_PRESETS.map((preset, index) => <button key={preset} type="button" onClick={() => set("eqPreset", preset)} className={`min-h-12 rounded-md border px-2 text-left text-xs transition ${settings.eqPreset === preset ? "border-[#00e6e6] bg-[#00e6e6]/10 text-[#00e6e6]" : "border-white/10 text-gray-300 hover:border-white/30"}`}><span className="mr-1 text-gray-500">{String(index + 1).padStart(2, "0")}</span>{preset}</button>)}
        </div>
        {settings.eqPreset === "Custom" && <div className="mt-6 grid gap-4 sm:grid-cols-5">{settings.eqBands.map((value, index) => <label key={bandLabels[index]} className="text-xs text-gray-400">{bandLabels[index]}<input type="range" min="-12" max="12" value={value} onChange={(event) => dispatch(updateEqBands(settings.eqBands.map((band, bandIndex) => bandIndex === index ? Number(event.target.value) : band)))} className="mt-3 w-full accent-[#00e6e6]" /><span className="mt-1 block text-white">{value > 0 ? "+" : ""}{value} dB</span></label>)}</div>}
        <p className="mt-4 text-xs text-amber-300/80">Not available for YouTube playback: browsers can't apply per-band filtering to audio from another site's embedded player. This preference is saved for future compatible sources.</p>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7"><h2 className="mb-2 text-xl font-semibold">Playback & data</h2><SelectControl label="Video quality" value={settings.videoQuality} options={videoQualityOptions} onChange={(value) => set("videoQuality", value)} /><Toggle label="Data Saver mode" checked={settings.dataSaver} onChange={(value) => set("dataSaver", value)} /><Toggle label="Audio-only mode" checked={settings.audioOnly} onChange={(value) => set("audioOnly", value)} /><Toggle label="Wi-Fi-only downloads" checked={settings.wifiOnlyDownloads} onChange={(value) => set("wifiOnlyDownloads", value)} /></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7"><h2 className="mb-2 text-xl font-semibold">Taste & privacy</h2><Toggle label="Allow explicit content" checked={settings.explicitContent} onChange={(value) => set("explicitContent", value)} /><Toggle label="Private session" checked={settings.privateSession} onChange={(value) => set("privateSession", value)} /><Toggle label="Tailored advertising" checked={settings.tailoredAds} onChange={(value) => set("tailoredAds", value)} /><p className="mt-4 text-xs text-gray-500">Private session prevents new listening activity from being used for recommendations.</p></div>
      </section>
    </main>
  );
}
