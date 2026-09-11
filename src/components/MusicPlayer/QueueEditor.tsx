"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ListX, Save, Trash2, Undo2 } from "lucide-react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton } from "./PlayerDock";

export default function QueueEditor(props: Pick<PlayerDockProps, "queue" | "track" | "disabled" | "onSelect" | "queueSearch" | "onQueueEdit" | "onQueueUndo" | "canUndoQueue" | "onSaveQueue">) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const boundary = props.queue.findIndex((track) => track.id === props.track.id) + 1;
  return <div>
    {props.queueSearch}
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-2">
      <p className="text-sm text-[var(--muted)]">{props.queue.length - boundary} upcoming</p>
      <div className="flex">
        <PlayerIconButton label="Undo queue edit" disabled={props.disabled || !props.canUndoQueue} onClick={props.onQueueUndo}><Undo2 size={20} /></PlayerIconButton>
        <PlayerIconButton label="Clear upcoming tracks" disabled={props.disabled || props.queue.length <= boundary} onClick={() => props.onQueueEdit?.({ kind: "clear" })}><ListX size={20} /></PlayerIconButton>
      </div>
    </div>
    <ol className="space-y-2">
      {props.queue.length === 0 && <li className="py-8 text-center text-sm text-[var(--muted)]">Queue is empty.</li>}
      {props.queue.map((track, index) => <li key={`${track.id}-${index}`} data-track-id={track.id} className="border-b border-[var(--hairline)] pb-1">
        <button type="button" disabled={props.disabled} aria-current={track.id === props.track.id ? "true" : undefined} onClick={() => props.onSelect(track)} className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded p-2 text-left hover:bg-white/10 aria-[current=true]:bg-white/10 disabled:opacity-50">
          <img src={track.thumbnail || "/icon-192x192.png"} alt="" loading="lazy" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[4px] object-cover" />
          <span className="min-w-0"><span className="block break-words text-sm">{track.title}</span><span className="block truncate text-xs text-[var(--muted)]">{track.channel}</span></span>
        </button>
        {index >= boundary && track.id !== props.track.id && props.onQueueEdit && <div className="flex justify-end">
          <PlayerIconButton label={`Move ${track.title} up`} disabled={props.disabled || index === boundary} onClick={() => props.onQueueEdit?.({ kind: "move", id: track.id, direction: -1 })}><ArrowUp size={18} /></PlayerIconButton>
          <PlayerIconButton label={`Move ${track.title} down`} disabled={props.disabled || index === props.queue.length - 1} onClick={() => props.onQueueEdit?.({ kind: "move", id: track.id, direction: 1 })}><ArrowDown size={18} /></PlayerIconButton>
          <PlayerIconButton label={`Remove ${track.title} from queue`} disabled={props.disabled} onClick={() => props.onQueueEdit?.({ kind: "remove", id: track.id })}><Trash2 size={18} /></PlayerIconButton>
        </div>}
      </li>)}
    </ol>
    {props.onSaveQueue && <form className="mt-5 flex gap-2" onSubmit={async (event) => {
      event.preventDefault();
      if (saving || !name.trim()) return;
      setSaving(true); setMessage("");
      try { await props.onSaveQueue?.(name.trim()); setName(""); setMessage("Playlist saved."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Playlist could not be saved."); }
      finally { setSaving(false); }
    }}>
      <input aria-label="Queue playlist name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Playlist name" className="h-12 min-w-0 flex-1 rounded border border-[var(--hairline)] bg-transparent px-3 text-sm" />
      <button type="submit" aria-label="Save queue as playlist" title="Save queue as playlist" disabled={props.disabled || saving || !name.trim() || !props.queue.length} className="grid h-12 w-12 shrink-0 place-items-center rounded border border-[var(--hairline)] disabled:opacity-40"><Save size={20} /></button>
    </form>}
    <p role="status" className="mt-2 text-sm text-[var(--muted)]">{message}</p>
  </div>;
}