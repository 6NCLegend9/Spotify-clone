"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { requestJson } from "@/services/http";
import { hydrateYouTubeTracks } from "@/services/libraryApi";
import { cleanTitle } from "@/utils/text";
import { toUserError } from "@/utils/userError";
import UserMessage from "@/components/UserMessage";
import useAccountScope from "@/hooks/useAccountScope";

export default function FeedbackPreferences() {
  const scope = useAccountScope();
  return scope.status === "authenticated" && scope.owner
    ? <AccountFeedbackPreferences key={scope.key} scope={scope} /> : null;
}

function AccountFeedbackPreferences({ scope }) {
  // The wrapper key fixes this checker to one account and privacy generation.
  const isCurrent = useRef(scope.isCurrent).current;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("notInterested");
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open || !isCurrent()) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(null); setTracks([]);
    void (async () => {
      try {
        const response = await requestJson(`/api/${kind}`, { signal: controller.signal });
        if (!active || !isCurrent()) return;
        const ids = Array.isArray(response.data) ? response.data : [];
        const metadata = await hydrateYouTubeTracks(ids).catch(() => []);
        if (active && isCurrent()) setTracks(ids.map((id) => metadata.find((track) => track.id === id) || { id, title: id }));
      } catch (caught) { if (active && isCurrent()) setError(toUserError(caught)); }
      finally { if (active && isCurrent()) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [kind, open, revision, isCurrent]);

  return <details className="border-y border-[var(--hairline)] py-5" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="min-h-12 cursor-pointer py-3 text-base font-semibold">Hidden and snoozed tracks</summary>
    <div role="tablist" aria-label="Recommendation preferences" className="flex flex-wrap gap-2 py-3">
      {[["notInterested", "Hidden"], ["snoozedTracks", "Snoozed"]].map(([value, label]) =>
        <button key={value} id={`feedback-${value}`} type="button" role="tab" aria-selected={kind === value} aria-controls="feedback-tracks"
          onClick={() => setKind(value)} disabled={Boolean(pending)} className={`min-h-12 border-b-2 px-4 text-sm disabled:opacity-40 ${kind === value ? "border-[var(--accent)]" : "border-transparent"}`}>{label}</button>)}
    </div>
    <div id="feedback-tracks" role="tabpanel" aria-labelledby={`feedback-${kind}`}>
      {loading && <p role="status" className="py-4 text-sm">Loading tracks...</p>}
      {error && <UserMessage title={error.title} message={error.message} onRetry={() => setRevision((value) => value + 1)} />}
      {!loading && !error && !tracks.length && <p className="py-4 text-sm text-[var(--muted)]">No tracks.</p>}
      <ul className="max-h-96 overflow-y-auto">
        {tracks.map((track) => <li key={track.id} className="flex min-w-0 items-center gap-3 border-b border-[var(--hairline)] py-2">
          <img src={track.thumbnail || "/icon-192x192.png"} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded" />
          <span className="min-w-0 flex-1 break-words text-sm">{cleanTitle(track.title)}</span>
          <button type="button" aria-label={`Restore ${cleanTitle(track.title)}`} title="Restore track" disabled={Boolean(pending)}
            className="grid h-12 w-12 shrink-0 place-items-center rounded hover:bg-white/10 disabled:opacity-40" onClick={async () => {
              if (pending || !isCurrent()) return;
              setPending(track.id); setError(null);
              try {
                await requestJson(`/api/${kind}`, { method: "DELETE", body: { id: track.id } });
                if (!isCurrent()) return;
                setTracks((current) => current.filter((item) => item.id !== track.id));
                window.dispatchEvent(new Event("heykasa:preferences-changed"));
              } catch (caught) { if (isCurrent()) setError(toUserError(caught)); }
              finally { if (isCurrent()) setPending(""); }
            }}><RotateCcw size={20} aria-hidden="true" /></button>
        </li>)}
      </ul>
    </div>
  </details>;
}