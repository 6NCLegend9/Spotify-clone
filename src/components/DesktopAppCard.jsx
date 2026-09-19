"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiDownload, FiMonitor, FiRefreshCw } from "react-icons/fi";
import { requestJson } from "@/services/http";
import {
  getHeyKasaDesktopApi,
  getHeyKasaDesktopInfo,
  hasDesktopCapability,
} from "@/utils/desktopEnvironment";

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function updateCopy(status) {
  switch (status?.state) {
    case "checking": return "Checking for updates…";
    case "available": return `Version ${status.version || ""} is available.`.trim();
    case "downloading": return `Downloading update… ${Math.round(status.progress || 0)}%`;
    case "ready": return `Version ${status.version || ""} is ready to install.`.trim();
    case "up-to-date": return "HayKasa Desktop is up to date.";
    case "deferred": return status.detail || "A newer version is rolling out gradually. This installation will update automatically when eligible.";
    case "error": return status.detail || "The update check failed. Your current version is still safe to use.";
    case "disabled": return status.detail || "Automatic updates are not available in this build yet.";
    default: return "Updates are checked automatically in signed desktop builds.";
  }
}

function DesktopToggle({ label, description, checked, disabled, onChange }) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-white/10 px-4 py-3">
      <span>
        <span className="block text-sm font-medium text-gray-200">{label}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[#9aa8b5]">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked === true}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-[#00e6e6] disabled:opacity-40"
      />
    </label>
  );
}

export default function DesktopAppCard() {
  const [manifest, setManifest] = useState(null);
  const [desktopInfo, setDesktopInfo] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [startupEnabled, setStartupEnabled] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const isDesktop = Boolean(desktopInfo);
  const desktopApi = typeof window !== "undefined" ? getHeyKasaDesktopApi() : null;
  const supportsUpdater = hasDesktopCapability(desktopInfo, "updaterV1");
  const supportsStartup = hasDesktopCapability(desktopInfo, "autoLaunchV1");
  const supportsPreferences = hasDesktopCapability(desktopInfo, "desktopPreferencesV1");
  const supportsTray = hasDesktopCapability(desktopInfo, "trayV1");

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    const load = async () => {
      const manifestPromise = requestJson("/api/desktop/manifest", {
        fallbackTitle: "Desktop release information unavailable",
        fallbackMessage: "Could not load the current HayKasa Desktop release.",
      }).catch(() => null);
      const infoPromise = getHeyKasaDesktopInfo();
      const [nextManifest, nextInfo] = await Promise.all([manifestPromise, infoPromise]);
      if (!active) return;
      setManifest(nextManifest);
      setDesktopInfo(nextInfo);

      const api = getHeyKasaDesktopApi();
      if (!api || !nextInfo) return;
      try {
        const [nextUpdate, nextStartup, nextPreferences] = await Promise.all([
          api.updates?.getStatus?.(),
          api.startup?.get?.(),
          api.preferences?.get?.(),
        ]);
        if (!active) return;
        setUpdateStatus(nextUpdate || null);
        setStartupEnabled(nextStartup?.enabled === true);
        setPreferences(nextPreferences || null);
        if (typeof api.updates?.onStatus === "function") {
          unsubscribe = api.updates.onStatus((value) => {
            if (active) setUpdateStatus(value || null);
          });
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Desktop status could not be read.");
      }
    };

    void load();
    return () => {
      active = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const releaseLabel = useMemo(() => {
    if (!manifest) return "Checking release…";
    const details = [manifest.latest ? `v${manifest.latest}` : "", formatBytes(manifest.sizeBytes)].filter(Boolean);
    return details.join(" · ") || "Windows x64";
  }, [manifest]);

  const checkUpdates = async () => {
    if (!desktopApi?.updates?.check || busy) return;
    setBusy("check");
    setError("");
    try {
      const next = await desktopApi.updates.check();
      setUpdateStatus(next || null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not check for updates.");
    } finally {
      setBusy("");
    }
  };

  const installUpdate = async () => {
    if (!desktopApi?.updates?.install || busy) return;
    setBusy("install");
    setError("");
    try {
      await desktopApi.updates.install();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not restart into the update.");
      setBusy("");
    }
  };

  const setStartup = async (enabled) => {
    if (!desktopApi?.startup?.set || busy) return;
    setBusy("startup");
    setError("");
    try {
      const next = await desktopApi.startup.set(enabled);
      setStartupEnabled(next?.enabled === true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not change Windows startup behavior.");
    } finally {
      setBusy("");
    }
  };

  const setPreference = async (key, value) => {
    if (!desktopApi?.preferences?.set || busy) return;
    setBusy(key);
    setError("");
    try {
      const next = await desktopApi.preferences.set(key, value);
      setPreferences(next || null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not save the desktop preference.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="mb-8 glass-panel rounded-xl p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2"><FiMonitor aria-hidden="true" /> HayKasa Desktop</p>
          <h2 className="text-xl font-semibold">{isDesktop ? "Desktop app controls" : "Get HayKasa for Windows"}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[#9aa8b5]">
            {isDesktop
              ? "This window is running inside the secure HayKasa desktop shell. Native Discord, Windows startup, tray behavior, and signed application updates are handled outside the browser sandbox."
              : "Install the Windows app for native Discord Rich Presence and automatic desktop updates. The music experience still comes from the same HayKasa account and Vercel web app."}
          </p>
        </div>
        {isDesktop ? (
          <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            <FiCheckCircle className="mr-1.5 inline" aria-hidden="true" /> Desktop detected
          </div>
        ) : null}
      </div>

      {desktopInfo?.safeMode ? (
        <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-100">
          HayKasa Desktop started in safe mode after repeated crashes. Discord and automatic desktop updates are temporarily disabled for this run; the web music experience remains available.
        </div>
      ) : null}
      {desktopInfo?.policy?.maintenance ? (
        <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-100">
          {desktopInfo.policy.maintenanceMessage || "Some HayKasa Desktop native features are temporarily unavailable for maintenance."}
        </div>
      ) : null}

      {isDesktop ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/10 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[#778899]">Installed</p>
            <p className="mt-1 text-lg font-semibold">HayKasa {desktopInfo.desktopVersion || "Desktop"}</p>
            <p className="mt-1 text-xs text-[#9aa8b5]">
              {desktopInfo.platform || "Windows"} {desktopInfo.arch || ""} · Desktop API {desktopInfo.apiVersion || "—"}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/10 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[#778899]">Latest stable release</p>
            <p className="mt-1 text-lg font-semibold">{manifest?.latest ? `v${manifest.latest}` : "Checking…"}</p>
            <p className="mt-1 text-xs text-[#9aa8b5]">{updateCopy(updateStatus)}</p>
          </div>

          {supportsStartup ? (
            <DesktopToggle
              label="Start HayKasa with Windows"
              description="Launch the desktop app automatically after you sign in to Windows."
              checked={startupEnabled === true}
              disabled={startupEnabled === null || busy === "startup"}
              onChange={(value) => void setStartup(value)}
            />
          ) : null}

          {supportsPreferences && supportsUpdater ? (
            <DesktopToggle
              label="Automatic desktop updates"
              description="Check in the background and download signed HayKasa Desktop updates automatically."
              checked={preferences?.autoUpdate !== false}
              disabled={!preferences || busy === "autoUpdate"}
              onChange={(value) => void setPreference("autoUpdate", value)}
            />
          ) : null}

          {supportsPreferences && supportsTray ? (
            <DesktopToggle
              label="Keep HayKasa running in the system tray"
              description="Closing the window hides HayKasa instead of stopping playback and Discord presence. Use Quit HayKasa from the tray to fully exit."
              checked={preferences?.closeToTray !== false}
              disabled={!preferences || busy === "closeToTray"}
              onChange={(value) => void setPreference("closeToTray", value)}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 px-4 py-3">
            <span className="text-xs text-[#9aa8b5]">Update channel</span>
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-gray-200">
              {preferences?.updateChannel || manifest?.channel || "stable"}
            </span>
          </div>

          <div className="flex flex-wrap gap-3 lg:col-span-2">
            {supportsUpdater ? (
              <button
                type="button"
                onClick={checkUpdates}
                disabled={Boolean(busy)}
                className="btn-ghost min-h-11 gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiRefreshCw aria-hidden="true" className={busy === "check" ? "animate-spin" : ""} />
                {busy === "check" ? "Checking…" : "Check for updates"}
              </button>
            ) : null}
            {updateStatus?.state === "ready" ? (
              <button
                type="button"
                onClick={installUpdate}
                disabled={Boolean(busy)}
                className="btn-primary min-h-11 px-4 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Restart and update
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-white/10 bg-black/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-100">
                {manifest?.portable ? "Windows x64 portable build" : "Windows x64 installer"}
              </p>
              <p className="mt-1 text-xs text-[#9aa8b5]">{releaseLabel}</p>
              <p className="mt-2 text-xs leading-5 text-[#9aa8b5]">
                {manifest?.published
                  ? manifest.portable
                    ? "Portable fallback from the last successful Windows build. Download the ZIP, extract it, then run the app executable. GitHub may ask the repository owner to sign in before downloading."
                    : manifest.signed === false
                      ? "Public Windows preview build. Windows may show a publisher warning until the production signing certificate is configured."
                      : "Signed desktop release. Updates are handled by the installed app after setup."
                  : "The Windows build is being prepared. This card will enable the download as soon as a public installer is available."}
              </p>
            </div>
            {manifest?.published && manifest.downloadUrl ? (
              <a
                href={manifest.downloadUrl}
                className="btn-primary min-h-11 shrink-0 gap-2 px-4"
                rel="noopener noreferrer"
              >
                <FiDownload aria-hidden="true" /> {manifest.portable ? "Download portable build" : manifest.signed === false ? "Download Windows preview" : "Download for Windows"}
              </a>
            ) : (
              <button type="button" disabled className="btn-primary min-h-11 shrink-0 gap-2 px-4 opacity-50">
                <FiDownload aria-hidden="true" /> Preparing Windows build
              </button>
            )}
          </div>
          {manifest?.releaseNotesUrl ? (
            <a href={manifest.releaseNotesUrl} className="mt-4 inline-block text-xs font-semibold text-[#00e6e6] hover:underline" rel="noopener noreferrer">
              View release notes
            </a>
          ) : null}
        </div>
      )}

      {error ? <p className="mt-4 text-xs leading-5 text-red-300">{error}</p> : null}
    </section>
  );
}
