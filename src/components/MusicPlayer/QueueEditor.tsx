"use client";

import { useRef, useState } from "react";
import { GripVertical, ListX, Save, Trash2, Undo2 } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton } from "./PlayerDock";

type DragState = { pointerId: number; index: number };
type Point = { x: number; y: number };

export default function QueueEditor(props: Pick<PlayerDockProps, "queue" | "track" | "disabled" | "onSelect" | "queueSearch" | "onQueueEdit" | "onQueueUndo" | "canUndoQueue" | "onSaveQueue">) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const slotRef = useRef<number | null>(null);
  const currentIndex = props.queue.findIndex((track) =>
    props.track.queueEntryId && track.queueEntryId
      ? track.queueEntryId === props.track.queueEntryId
      : track.id === props.track.id,
  );
  const boundary = currentIndex < 0 ? 0 : currentIndex + 1;
  const upcomingCount = Math.max(0, props.queue.length - boundary);

  const canReorder = (index: number) => Boolean(props.onQueueEdit && !props.disabled && index >= boundary);

  const setTargetSlot = (slot: number) => {
    const next = Math.min(props.queue.length, Math.max(boundary, slot));
    slotRef.current = next;
    setDropSlot(next);
  };

  const slotAtPoint = (clientY: number) => {
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-queue-index]") || [])
      .filter((row) => Number(row.dataset.queueIndex) >= boundary);
    if (!rows.length) return boundary;

    for (const row of rows) {
      const index = Number(row.dataset.queueIndex);
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return index;
      if (clientY <= rect.bottom) return index + 1;
    }
    return props.queue.length;
  };

  const autoScroll = (clientY: number) => {
    let node = rootRef.current?.parentElement || null;
    while (node) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) break;
      node = node.parentElement;
    }
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const edge = Math.min(72, rect.height / 4);
    if (clientY < rect.top + edge) node.scrollBy({ top: -18, behavior: "auto" });
    else if (clientY > rect.bottom - edge) node.scrollBy({ top: 18, behavior: "auto" });
  };

  const slotToFinalIndex = (fromIndex: number, slot: number) => {
    const shifted = slot > fromIndex ? slot - 1 : slot;
    return Math.min(props.queue.length - 1, Math.max(boundary, shifted));
  };

  const finishDrag = (fromIndex: number) => {
    const slot = slotRef.current ?? fromIndex;
    const toIndex = slotToFinalIndex(fromIndex, slot);
    if (toIndex !== fromIndex) props.onQueueEdit?.({ kind: "reorder", index: fromIndex, toIndex });
    dragRef.current = null;
    slotRef.current = null;
    setDraggingIndex(null);
    setDropSlot(null);
    setDragPoint(null);
  };

  const cancelDrag = () => {
    dragRef.current = null;
    slotRef.current = null;
    setDraggingIndex(null);
    setDropSlot(null);
    setDragPoint(null);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (!canReorder(index) || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, index };
    slotRef.current = index;
    setDraggingIndex(index);
    setDropSlot(index);
    setDragPoint({ x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setDragPoint({ x: event.clientX, y: event.clientY });
    setTargetSlot(slotAtPoint(event.clientY));
    autoScroll(event.clientY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    finishDrag(drag.index);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!canReorder(index)) return;
    let toIndex: number | null = null;
    if (event.key === "ArrowUp") toIndex = Math.max(boundary, index - 1);
    else if (event.key === "ArrowDown") toIndex = Math.min(props.queue.length - 1, index + 1);
    else if (event.key === "Home") toIndex = boundary;
    else if (event.key === "End") toIndex = props.queue.length - 1;
    if (toIndex === null || toIndex === index) return;
    event.preventDefault();
    props.onQueueEdit?.({ kind: "reorder", index, toIndex });
  };

  const draggedTrack = draggingIndex === null ? null : props.queue[draggingIndex];

  return <div ref={rootRef}>
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
        const showBefore = draggingIndex !== null && dropSlot === index;
        const showAfter = draggingIndex !== null && index === props.queue.length - 1 && dropSlot === props.queue.length;
        return <li
          key={track.queueEntryId || `${track.id}-${index}`}
          data-track-id={track.id}
          data-queue-entry-id={track.queueEntryId || undefined}
          data-queue-index={index}
          className={`relative border-b border-[var(--hairline)] pb-1 transition ${dragging ? "opacity-30" : ""}`}
        >
          {showBefore && <span aria-hidden="true" className="pointer-events-none absolute -top-[5px] left-0 right-0 z-10 h-0.5 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />}
          {showAfter && <span aria-hidden="true" className="pointer-events-none absolute -bottom-[5px] left-0 right-0 z-10 h-0.5 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />}
          <div className="flex min-w-0 items-center gap-1">
            {movable ? <button
              type="button"
              aria-label={`Drag ${track.title} to reorder`}
              aria-pressed={dragging}
              title="Drag and drop to reorder"
              onPointerDown={(event) => handlePointerDown(event, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={cancelDrag}
              onLostPointerCapture={() => { if (dragRef.current?.index === index) cancelDrag(); }}
              onKeyDown={(event) => handleGripKeyDown(event, index)}
              className="grid h-12 w-10 shrink-0 touch-none cursor-grab place-items-center rounded text-[var(--muted)] hover:bg-white/10 hover:text-white active:cursor-grabbing"
            ><GripVertical size={18} /></button> : <span className="w-2 shrink-0" />}
            <button type="button" disabled={props.disabled} aria-current={index === currentIndex ? "true" : undefined} onClick={() => props.onSelect(track)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded p-2 text-left hover:bg-white/10 aria-[current=true]:bg-white/10 disabled:opacity-50">
              <img src={track.thumbnail || "/icon-192x192.png"} alt="" loading="lazy" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[4px] object-cover" />
              <span className="min-w-0"><span className="block break-words text-sm">{track.title}</span><span className="block truncate text-xs text-[var(--muted)]">{track.channel}</span></span>
            </button>
            {movable && <PlayerIconButton label={`Remove ${track.title} from queue`} disabled={props.disabled} onClick={() => props.onQueueEdit?.({ kind: "remove", index })}><Trash2 size={18} /></PlayerIconButton>}
          </div>
        </li>;
      })}
    </ol>

    {draggedTrack && dragPoint && <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[140] flex w-[min(330px,calc(100vw-32px))] items-center gap-3 rounded-lg border border-[var(--accent)] bg-[var(--navy-raised)] p-2 shadow-2xl"
      style={{ left: dragPoint.x + 14, top: dragPoint.y + 14 }}
    >
      <GripVertical size={18} className="shrink-0 text-[var(--accent)]" />
      <img src={draggedTrack.thumbnail || "/icon-192x192.png"} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[4px] object-cover" />
      <span className="min-w-0"><strong className="block truncate text-sm">{draggedTrack.title}</strong><small className="block truncate text-xs text-[var(--muted)]">{draggedTrack.channel}</small></span>
    </div>}

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
