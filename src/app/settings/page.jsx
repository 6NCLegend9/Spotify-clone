"use client";

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { EQ_PRESETS, updateEqBands, updateSetting } from "@/redux/features/settingsSlice";
import { useSession } from "next-auth/react";
import { FiCheck, FiPlus, FiSave, FiSearch, FiSettings, FiX } from "react-icons/fi";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import { normalizeGenreName } from "@/utils/genreTaxonomy";

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

function matchesSelectedGenre(selectedName, genre) {
  const selectedKey = normalizeGenreName(selectedName);
  return selectedKey === normalizeGenreName(genre.defaultName)
    || genre.aliases?.some((alias) => normalizeGenreName(alias) === selectedKey);
}

function GenreSelector({
  genres,
  catalog,
  query,
  loading,
  error,
  onQueryChange,
  onToggle,
  onAddPersonal,
}) {
  const normalizedQuery = normalizeGenreName(query);
  const majorGenres = catalog.filter((genre) => genre.scope === "system" && genre.depth === 0);
  const matches = normalizedQuery
    ? catalog.filter((genre) => [genre.defaultName, ...genre.aliases]
      .some((value) => normalizeGenreName(value).includes(normalizedQuery))).slice(0, 12)
    : [];
  const hasExactMatch = matches.some((genre) =>
    [genre.defaultName, ...genre.aliases].some((value) => normalizeGenreName(value) === normalizedQuery),
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-xl">
        <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && normalizedQuery && !hasExactMatch) onAddPersonal();
          }}
          placeholder="Search genres or add your own"
          className="h-11 w-full rounded-md border border-white/15 bg-[#101b29] pl-10 pr-10 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#00e6e6]"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear genre search"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <FiX />
          </button>
        )}
      </div>

      {normalizedQuery && (
        <div role="listbox" aria-label="Matching genres" className="max-w-xl overflow-hidden rounded-md border border-white/10 bg-[#101b29]">
          {matches.map((genre) => {
            const selected = genres.some((value) => matchesSelectedGenre(value, genre));
            return (
              <button
                key={genre.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onToggle(genre)}
                disabled={loading}
                className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-white">{genre.name}</span>
                <span className="shrink-0 text-xs text-gray-500">{genre.depth === 0 ? "Major genre" : "Subgenre"}</span>
              </button>
            );
          })}
          {!hasExactMatch && (
            <button
              type="button"
              onClick={onAddPersonal}
              disabled={loading}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#00e6e6] hover:bg-[#00e6e6]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FiPlus /> Add &quot;{query.trim()}&quot; as a personal genre
            </button>
          )}
        </div>
      )}

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Selected favorite genres">
          {genres.map((genreName) => {
            const genre = catalog.find((item) => matchesSelectedGenre(genreName, item)) || {
              defaultName: genreName,
              aliases: [],
            };
            return (
              <button
                key={genreName}
                type="button"
                onClick={() => onToggle(genre)}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-full border border-[#00e6e6] bg-[#00e6e6]/10 px-3 py-1.5 text-xs text-[#00e6e6] transition hover:bg-[#00e6e6]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {genreName} <FiX aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Major genres</p>
        <div className="flex flex-wrap gap-2">
          {majorGenres.map((genre) => {
            const selected = genres.some((value) => matchesSelectedGenre(value, genre));
            return (
              <button
                key={genre.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggle(genre)}
                disabled={loading}
                className={`rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-[#00e6e6] bg-[#00e6e6]/10 text-[#00e6e6]" : "border-white/15 text-gray-300 hover:border-white/30"}`}
              >
                {genre.name}
              </button>
            );
          })}
          {majorGenres.length === 0 && !error && <span className="text-xs text-gray-500">Loading genre catalog...</span>}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.settings);
  const { status } = useSession();
  const [saved, setSaved] = useState(false);
  const [genres, setGenres] = useState([]);
  const [genreCatalog, setGenreCatalog] = useState([]);
  const [genreSearch, setGenreSearch] = useState("");
  const [genreLoading, setGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState("");
  const set = (key, value) => dispatch(updateSetting({ key, value }));

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    Promise.all([
      fetch("/api/settings").then((res) => res.json()),
      fetch("/api/genres").then((res) => res.json()),
    ])
      .then(([settingsData, catalogData]) => {
        if (cancelled) return;
        if (Array.isArray(settingsData?.genres)) setGenres(settingsData.genres);
        if (Array.isArray(catalogData?.genres)) setGenreCatalog(catalogData.genres);
        else setGenreError(catalogData?.error || "Genre options are unavailable right now.");
      })
      .catch(() => {
        if (!cancelled) setGenreError("Genre options are unavailable right now.");
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const toggleGenre = async (genre) => {
    if (status !== "authenticated") return;
    const genreName = typeof genre === "string" ? genre : genre.defaultName;
    const selected = genreCatalog.find((item) => item.defaultName === genreName) || { defaultName: genreName, aliases: [] };
    const isSelected = genres.some((value) => matchesSelectedGenre(value, selected));
    if (!isSelected && genres.length >= 12) {
      setGenreError("Choose up to 12 favorite genres.");
      return;
    }
    const next = isSelected
      ? genres.filter((value) => !matchesSelectedGenre(value, selected))
      : [...genres, genreName];
    const previous = genres;
    setGenres(next);
    setGenreError("");
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genres: next }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setGenres(previous);
        setGenreError(data?.error || "Your genre preferences could not be saved.");
      } else if (Array.isArray(data?.profile?.genres)) {
        setGenres(data.profile.genres);
      }
    } catch {
      setGenres(previous);
      setGenreError("Your genre preferences could not be saved.");
    }
  };

  const addPersonalGenre = async () => {
    const name = genreSearch.trim();
    if (!name) return;
    setGenreLoading(true);
    setGenreError("");
    try {
      const response = await fetch("/api/genres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.genre) {
        setGenreError(data?.error || "That genre could not be added.");
        return;
      }
      setGenreCatalog((current) => current.some((genre) => genre.id === data.genre.id)
        ? current
        : [...current, data.genre]);
      setGenreSearch("");
      await toggleGenre(data.genre);
    } catch {
      setGenreError("That genre could not be added.");
    } finally {
      setGenreLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaved(false);
    if (status === "authenticated") {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!response.ok) return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <main className="page text-white">
      <header className="page-hero border-b border-white/10 pb-6">
        <div>
          <p className="eyebrow mb-3 flex items-center gap-2"><FiSettings /> Settings</p>
          <h1 className="text-3xl font-bold sm:text-5xl">Tune your listening.</h1>
          <p className="mt-3 max-w-2xl text-sm text-[#9aa8b5]">Playback, discovery, privacy, and audio preferences in one place.</p>
        </div>
        <button type="button" onClick={saveSettings} className="btn-primary h-10 shrink-0 px-4 text-sm">
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
        <h2 className="mb-2 text-xl font-semibold">Favorite genres</h2>
        <p className="mb-4 text-xs text-gray-400">Used to shape your homepage recommendations before we know your listening history. Pick genres or sub-genres.</p>
        {status !== "authenticated" ? (
          <p className="text-xs text-gray-500">Log in to pick genres and personalize your homepage.</p>
        ) : (
          <GenreSelector
            genres={genres}
            catalog={genreCatalog}
            query={genreSearch}
            loading={genreLoading}
            error={genreError}
            onQueryChange={setGenreSearch}
            onToggle={toggleGenre}
            onAddPersonal={addPersonalGenre}
          />
        )}
      </section>

      <section className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">Equalizer presets</h2><p className="mt-1 text-xs text-gray-400">Five-band profile applied to the current track. Presets write real band values so playback can use them.</p></div><span className="text-xs text-[#00e6e6]">{settings.eqPreset}</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {EQ_PRESETS.map((preset, index) => <button key={preset} type="button" onClick={() => set("eqPreset", preset)} className={`min-h-12 rounded-md border px-2 text-left text-xs transition ${settings.eqPreset === preset ? "border-[#00e6e6] bg-[#00e6e6]/10 text-[#00e6e6]" : "border-white/10 text-gray-300 hover:border-white/30"}`}><span className="mr-1 text-gray-500">{String(index + 1).padStart(2, "0")}</span>{preset}</button>)}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-5">{settings.eqBands.map((value, index) => <label key={bandLabels[index]} className="text-xs text-gray-400">{bandLabels[index]}<input type="range" min="-12" max="12" value={value} onChange={(event) => dispatch(updateEqBands(settings.eqBands.map((band, bandIndex) => bandIndex === index ? Number(event.target.value) : band)))} className="mt-3 w-full accent-[#00e6e6]" /><span className="mt-1 block text-white">{value > 0 ? "+" : ""}{value} dB</span></label>)}</div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2 mb-8">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7"><h2 className="mb-2 text-xl font-semibold">Playback & data</h2><SelectControl label="Video quality" value={settings.videoQuality} options={videoQualityOptions} onChange={(value) => set("videoQuality", value)} /><Toggle label="Data Saver mode" checked={settings.dataSaver} onChange={(value) => set("dataSaver", value)} /><Toggle label="Audio-only mode" checked={settings.audioOnly} onChange={(value) => set("audioOnly", value)} /><Toggle label="Live synced lyrics" checked={settings.syncedLyrics !== false} onChange={(value) => set("syncedLyrics", value)} /><Toggle label="Picture-in-picture (desktop)" checked={settings.pictureInPicture !== false} onChange={(value) => set("pictureInPicture", value)} /><Toggle label="Wi-Fi-only downloads" checked={settings.wifiOnlyDownloads} onChange={(value) => set("wifiOnlyDownloads", value)} /></div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-7"><h2 className="mb-2 text-xl font-semibold">Taste & privacy</h2><Toggle label="Allow explicit content" checked={settings.explicitContent} onChange={(value) => set("explicitContent", value)} /><Toggle label="Private session" checked={settings.privateSession} onChange={(value) => set("privateSession", value)} /><p className="mt-4 text-xs text-gray-500">Private session prevents new listening activity from being used for recommendations.</p></div>
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
