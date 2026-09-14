"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ListX, Save, Trash2, Undo2 } from "lucide-react";
import type { DragEvent, PointerEvent } from "react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton } from "./PlayerDock";

export default function QueueEditor(props: Pick<PlayerDockProps, "queue" | "track" | "disabled" | "onSelect" | "queueSearch" | "onQueueEdit" | "onQueueUndo" | "canUndoQueue" | "onSaveQueue">) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragRef = useRef<{ pointerId?: number; index: number } | null>(null);
  const targetRef = useRef<number | null>(null);
  const currentIndex = props.queue.findIndex((track) => track.id === props.track.id);
  const boundary = currentIndex < 0 ? 0 : currentIndex + 1;
  const upcomingCount = Math.max(0, props.queue.length - boundary);

  const canReorder = (index: number) => Boolean(props.onQueueEdit && !props.disabled && index >= boundary);

  const setTarget = (index: number) => {
    if (index < boundary || index >= props.queue.length) return;
    targetRef.current = index;
    setDropIndex(index);
  };

  const finishDrag = (fromIndex: number) => {
    const target = targetRef.current ?? fromIndex;
    if (target !== fromIndex) props.onQueueEdit?.({ kind: "reorder", index: fromIndex, toIndex: target });
    dragRef.current = null;
    targetRef.current = null;
    setDraggingIndex(null);
    setDropIndex(null);
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, index: number) => {
    if (!canReorder(index)) {
      event.preventDefault();
      return;
    }
    dragRef.current = { index };
    targetRef.current = index;
    setDraggingIndex(index);
    setDropIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, index: number) => {
    if (draggingIndex === null || index < boundary) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTarget(index);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    const source = dragRef.current?.index ?? Number(event.dataTransfer.getData("text/plain"));
    setTarget(index);
    if (Number.isInteger(source)) finishDrag(source);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (!canReorder(index) || !event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, index };
    targetRef.current = index;
    setDraggingIndex(index);
    setDropIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-queue-index]");
    const index = Number(target?.dataset.queueIndex);
    if (Number.isInteger(index)) setTarget(index);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishDrag(drag.index);
  };

  const cancelDrag = () => {
    dragRef.current = null;
    targetRef.current = null;
    setDraggingIndex(null);
    setDropIndex(null);
  };

  return <div>
    {props.queueSearch}
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] pb-2">
      <p className="text-sm text-[var(--muted)]">{upcomingCount} upcoming</p>
      <div className="flex">
        <PlayerIconButton label="Undo queue edit" disabled={props.disabled || !props.canUndoQueue} onClick={props.onQueueUndo}><Undo2 size={20} /></PlayerIconButton>
        <PlayerIconButton label="Clear upcoming tracks" disabled={props.disabled || upcomingCount === 0} onClick={() => props.onQueueEdit?.({ kind: "clear" })}><ListX size={20} /></PlayerIconButton>
      </div>
    </div>
    <ol className="space-y-2" aria-label="Playback queue">
      {props.queue.length === 0 && <li className="py-8 text-center text-sm text-[var(--muted)]">Queue is empty.</li>}
      {props.queue.map((track, index) => {
        const movable = canReorder(index);
        const dragging = draggingIndex === index;
        const target = dropIndex === index && draggingIndex !== null && draggingIndex !== index;
        return <li
          key={`${track.id}-${index}`}
          data-track-id={track.id}
          data-queue-index={index}
          onDragOver={(event) => handleDragOver(event, index)}
          onDrop={(event) => handleDrop(event, index)}
          className={`border-b border-[var(--hairline)] pb-1 transition ${dragging ? "opacity-45" : ""} ${target ? "rounded-md bg-[var(--navy-panel)] ring-1 ring-[var(--accent)]" : ""}`}
        >
          <div className="flex min-w-0 items-center gap-1">
            {movable ? <button
              type="button"
              draggable
              aria-label={`Drag ${track.title} to reorder`}
              title="Drag to reorder"
              onDragStart={(event) => handleDragStart(event, index)}
              onDragEnd={cancelDrag}
              onPointerDown={(event) => handlePointerDown(event, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={cancelDrag}
              className="grid h-12 w-10 shrink-0 touch-none place-items-center rounded text-[var(--muted)] hover:bg-white/10 hover:text-white active:cursor-grabbing"
            ><GripVertical size={18} /></button> : <span className="w-2 shrink-0" />}
            <button type="button" disabled={props.disabled} aria-current={index === currentIndex ? "true" : undefined} onClick={() => props.onSelect(track)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded p-2 text-left hover:bg-white/10 aria-[current=true]:bg-white/10 disabled:opacity-50">
              <img src={track.thumbnail || "/icon-192x192.png"} alt="" loading="lazy" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[4px] object-cover" />
              <span className="min-w-0"><span className="block break-words text-sm">{track.title}</span><span className="block truncate text-xs text-[var(--muted)]">{track.channel}</span></span>
            </button>
          </div>
          {movable && <div className="flex justify-end">
            <PlayerIconButton label={`Move ${track.title} up`} disabled={props.disabled || index === boundary} onClick={() => props.onQueueEdit?.({ kind: "move", index, direction: -1 })}><ArrowUp size={18} /></PlayerIconButton>
            <PlayerIconButton label={`Move ${track.title} down`} disabled={props.disabled || index === props.queue.length - 1} onClick={() => props.onQueueEdit?.({ kind: "move", index, direction: 1 })}><ArrowDown size={18} /></PlayerIconButton>
            <PlayerIconButton label={`Remove ${track.title} from queue`} disabled={props.disabled} onClick={() => props.onQueueEdit?.({ kind: "remove", index })}><Trash2 size={18} /></PlayerIconButton>
          </div>}
        </li>;
      })}
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
