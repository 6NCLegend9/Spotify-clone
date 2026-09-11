"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { updateSetting } from "@/redux/features/settingsSlice";
import { requestJson } from "@/services/http";
import { hydrateYouTubeTracks } from "@/services/libraryApi";
import { cleanTitle } from "@/utils/text";
import { toUserError } from "@/utils/userError";
import UserMessage from "@/components/UserMessage";

export default function ListeningInsights() {
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [report, setReport] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    setError(null);
    setReport(null);
    setTracks([]);
    void (async () => {
      try {
        const response = await requestJson(`/api/playEvent?days=${days}`, { signal: controller.signal });
        if (!active) return;
        setReport(response);
        const metadata = await hydrateYouTubeTracks((response.data?.topTracks || []).map((track) => track.id)).catch(() => []);
        if (active) setTracks(metadata);
      } catch (caught) { if (active) setError(toUserError(caught)); }
    })();
    return () => { active = false; controller.abort(); };
  }, [open, days, revision]);
  const changeEnabled = async (enabled) => {
    if (pending) return;
    setPending(true); setError(null);
    try {
      await requestJson("/api/settings", { method: "PUT", body: { settings: { listeningInsights: enabled } } });
      if (!live.current) return;
      dispatch(updateSetting({ key: "listeningInsights", value: enabled }));
      setReport(null); setTracks([]); setRevision((value) => value + 1);
    } catch (caught) { if (live.current) setError(toUserError(caught)); }
    finally { if (live.current) setPending(false); }
  };
  return <details className="border-y border-[var(--hairline)] py-5" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="min-h-12 cursor-pointer py-3 text-base font-semibold">Listening insights</summary>
    {error && <UserMessage title={error.title} message={error.message} onRetry={() => setRevision((value) => value + 1)} />}
    {!report && !error && <p role="status" className="py-4 text-sm">Loading insights...</p>}
    {report && <>
      <label className="flex min-h-12 items-center justify-between gap-4 text-sm"><span>Save listening observations</span>
        <input type="checkbox" checked={report.enabled === true} disabled={pending} onChange={(event) => changeEnabled(event.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
      </label>
      <p className="py-3 text-xs leading-5 text-[var(--muted)]">Opt-in account data. Private sessions are excluded. Turning this off deletes saved observations. See the Privacy Policy for retention.</p>
      {report.enabled && <>
        <label className="flex min-h-12 items-center justify-between gap-4 text-sm">Period
          <select aria-label="Insights period" value={days} onChange={(event) => setDays(event.target.value)} className="min-h-12 rounded border border-[var(--hairline)] bg-[var(--navy-surface)] px-3">
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option>
          </select>
        </label>
        <dl className="grid grid-cols-2 gap-4 border-y border-[var(--hairline)] py-5">
          <div><dt className="text-xs text-[var(--muted)]">Observed minutes</dt><dd className="mt-2 text-2xl tabular-nums">{Math.floor((report.data?.seconds || 0) / 60)}</dd></div>
          <div><dt className="text-xs text-[var(--muted)]">Listening sessions</dt><dd className="mt-2 text-2xl tabular-nums">{report.data?.sessions || 0}</dd></div>
        </dl>
        {!report.data?.sessions && <p role="status" className="py-4 text-sm text-[var(--muted)]">No observations in this period.</p>}
        <ol className="divide-y divide-white/10">{(report.data?.topTracks || []).map((entry) => <li key={entry.id} className="flex min-w-0 justify-between gap-4 py-3 text-sm">
          <span className="min-w-0 break-words">{cleanTitle(tracks.find((track) => track.id === entry.id)?.title || entry.id)}</span>
          <span className="shrink-0 tabular-nums text-[var(--muted)]">{Math.floor(entry.seconds / 60)} min</span>
        </li>)}</ol>
        {report.data?.firstObservation && <p className="mt-3 text-xs text-[var(--muted)]">First retained observation: {new Date(report.data.firstObservation).toLocaleDateString()}</p>}
        <button type="button" className="btn-ghost mt-4 min-h-12 px-4" disabled={pending} onClick={async () => {
          setPending(true); setError(null);
          try { await requestJson("/api/playEvent", { method: "DELETE" }); setRevision((value) => value + 1); }
          catch (caught) { setError(toUserError(caught)); }
          finally { setPending(false); }
        }}>Clear observations</button>
      </>}
    </>}
  </details>;
}