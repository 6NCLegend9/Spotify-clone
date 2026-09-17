"use client";

import { useEffect, useState } from "react";
import { FiDownload, FiRefreshCw } from "react-icons/fi";
import { requestJson } from "@/services/http";
import { getHeyKasaDesktopApi, getHeyKasaDesktopInfo } from "@/utils/desktopEnvironment";

function versionParts(value) {
  const match = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function isOlderThan(installed, minimum) {
  const left = versionParts(installed);
  const right = versionParts(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] < right[index]) return true;
    if (left[index] > right[index]) return false;
  }
  return false;
}

export default function DesktopCompatibilityGate() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const info = await getHeyKasaDesktopInfo();
      if (!info || !active) return;
      const manifest = await requestJson("/api/desktop/manifest", {
        fallbackTitle: "Desktop compatibility check unavailable",
        fallbackMessage: "Could not check the current desktop compatibility policy.",
      }).catch(() => null);
      if (!active || !manifest) return;
      setState({ info, manifest });
    };
    void load();
    return () => { active = false; };
  }, []);

  if (!state || !isOlderThan(state.info.desktopVersion, state.manifest.minimum)) return null;

  const desktopApi = getHeyKasaDesktopApi();
  const checkUpdate = async () => {
    if (!desktopApi?.updates?.check || busy) return;
    setBusy(true);
    setError("");
    try {
      const status = await desktopApi.updates.check();
      if (status?.state === "ready") {
        await desktopApi.updates.install();
        return;
      }
      if (status?.state === "error") setError(status.detail || "The desktop updater could not prepare the required update.");
      else if (status?.state === "disabled") setError(status.detail || "The automatic update feed is not available in this build.");
      else setError("The update check started. Reopen Settings when the download finishes, or use the installer below.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The required update could not be started.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center bg-[#020913]/95 p-5 backdrop-blur-xl" role="alertdialog" aria-modal="true" aria-labelledby="desktop-update-required-title">
      <div className="w-full max-w-lg rounded-2xl border border-[#00e6e6]/25 bg-[#0a1725] p-6 shadow-2xl sm:p-8">
        <p className="eyebrow mb-3">HeyKasa Desktop</p>
        <h2 id="desktop-update-required-title" className="text-2xl font-bold">Desktop update required</h2>
        <p className="mt-3 text-sm leading-6 text-[#9aa8b5]">
          This HeyKasa Desktop version ({state.info.desktopVersion}) is older than the minimum supported version ({state.manifest.minimum}). Update the desktop shell before continuing so the website and native security API stay compatible.
        </p>
        {error ? <p className="mt-4 text-sm leading-6 text-amber-200">{error}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={checkUpdate} disabled={busy} className="btn-primary min-h-11 gap-2 px-4 disabled:opacity-50">
            <FiRefreshCw className={busy ? "animate-spin" : ""} aria-hidden="true" />
            {busy ? "Checking…" : "Update HeyKasa"}
          </button>
          {state.manifest.published && state.manifest.downloadUrl ? (
            <a href={state.manifest.downloadUrl} className="btn-ghost min-h-11 gap-2 px-4" rel="noopener noreferrer">
              <FiDownload aria-hidden="true" /> Download installer
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
