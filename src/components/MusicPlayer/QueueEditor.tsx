"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const dragPoint = useRef<Point | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const geometryRef = useRef<{ rows: { index: number; top: number; bottom: number }[]; scroller: HTMLElement | null; top: number; bottom: number; dirty: boolean }>({ rows: [], scroller: null, top: 0, bottom: 0, dirty: true });
  const previousRows = useRef(new Map<string, number>());
  const rowAnimations = useRef<Animation[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const slotRef = useRef<number | null>(null);
  const currentIndex = props.queue.findIndex((track) =>
    props.track.queueEntryId && track.queueEntryId
      ? track.queueEntryId === props.track.queueEntryId
      : track.id === props.track.id,
  );
  const boundary = currentIndex < 0 ? 0 : currentIndex + 1;
  const upcoming = props.queue.slice(boundary);
  const upcomingCount = upcoming.length;
  const explicitCount = upcoming.filter((track) => track.queueSource === "user").length;

  const canReorder = (index: number) => Boolean(props.onQueueEdit && !props.disabled && index >= boundary);

  const setTargetSlot = (slot: number) => {
    const next = Math.min(props.queue.length, Math.max(boundary, slot));
    slotRef.current = next;
    setDropSlot(next);
  };

  const measureRows = () => {
    const geometry = geometryRef.current;
    geometry.rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-queue-index]") || [])
      .filter((row) => Number(row.dataset.queueIndex) >= boundary)
      .map((row) => { const rect = row.getBoundingClientRect(); return { index: Number(row.dataset.queueIndex), top: rect.top, bottom: rect.bottom }; });
    const rect = geometry.scroller?.getBoundingClientRect();
    geometry.top = rect?.top || 0; geometry.bottom = rect?.bottom || 0;
    geometry.dirty = false;
  };

  const slotAtPoint = (clientY: number) => {
    for (const row of geometryRef.current.rows) {
      if (clientY < (row.top + row.bottom) / 2) return row.index;
      if (clientY <= row.bottom) return row.index + 1;
    }
    return geometryRef.current.rows.length ? props.queue.length : boundary;
  };

  const paintDrag = () => {
    frameRef.current = 0;
    const point = dragPoint.current;
    if (!point || !dragRef.current) return;
    const geometry = geometryRef.current;
    if (geometry.dirty) measureRows();
    const slot = slotAtPoint(point.y);
    if (slotRef.current !== slot) setTargetSlot(slot);
    if (ghostRef.current) ghostRef.current.style.transform = `translate3d(${point.x + 14}px, ${point.y + 14}px, 0)`;
    const node = geometry.scroller;
    const edge = Math.min(72, (geometry.bottom - geometry.top) / 4);
    const delta = point.y < geometry.top + edge ? -12 : point.y > geometry.bottom - edge ? 12 : 0;
    if (node && delta) {
      const before = node.scrollTop;
      node.scrollTop += delta;
      if (node.scrollTop !== before) {
        geometry.dirty = true;
        frameRef.current = requestAnimationFrame(paintDrag);
      }
    }
  };

  const scheduleDrag = () => { if (!frameRef.current) frameRef.current = requestAnimationFrame(paintDrag); };

  useEffect(() => {
    const invalidate = () => { geometryRef.current.dirty = true; };
    window.addEventListener("scroll", invalidate, true);
    window.addEventListener("resize", invalidate);
    const observer = new ResizeObserver(invalidate);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("resize", invalidate);
      observer.disconnect();
      rowAnimations.current.forEach((animation) => animation.cancel());
    };
  }, []);

  useLayoutEffect(() => {
    // FLIP only when queue contents change, never on pointer movement.
    rowAnimations.current.forEach((animation) => animation.cancel());
    rowAnimations.current = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.dataset.a11yReducedMotion === "true";
    const next = new Map<string, number>();
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-queue-key]") || []);
    const positions = rows.map((row) => ({ row, key: row.dataset.queueKey!, top: row.offsetTop }));
    for (const { row, key, top } of positions) {
      next.set(key, top);
      const oldTop = previousRows.current.get(key);
      if (!reduced && !dragRef.current && oldTop !== undefined && oldTop !== top && row.animate) {
        rowAnimations.current.push(row.animate([{ transform: `translateY(${oldTop - top}px)` }, { transform: "translateY(0)" }], { duration: 200, easing: "ease-out" }));
      }
    }
    previousRows.current = next;
    geometryRef.current.dirty = true;
  }, [props.queue]);

  const slotToFinalIndex = (fromIndex: number, slot: number) => {
    const shifted = slot > fromIndex ? slot - 1 : slot;
    return Math.min(props.queue.length - 1, Math.max(boundary, shifted));
  };

  const finishDrag = (fromIndex: number) => {
    const slot = slotRef.current ?? fromIndex;
    const toIndex = slotToFinalIndex(fromIndex, slot);
    if (toIndex !== fromIndex) { props.onQueueEdit?.({ kind: "reorder", index: fromIndex, toIndex }); setMessage("Queue reordered. Undo is available."); }
    dragRef.current = null;
    slotRef.current = null;
    setDraggingIndex(null);
    setDropSlot(null);
    dragPoint.current = null;
    cancelAnimationFrame(frameRef.current); frameRef.current = 0;
  };

  const cancelDrag = () => {
    dragRef.current = null;
    slotRef.current = null;
    setDraggingIndex(null);
    setDropSlot(null);
    dragPoint.current = null;
    cancelAnimationFrame(frameRef.current); frameRef.current = 0;
  };

  useEffect(() => {
    // A track change or a remote queue update invalidates captured row indices.
    dragRef.current = null; slotRef.current = null; dragPoint.current = null;
    cancelAnimationFrame(frameRef.current); frameRef.current = 0;
    setDraggingIndex(null); setDropSlot(null);
  }, [props.queue, props.disabled, boundary]);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (!canReorder(index) || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, index };
    slotRef.current = index;
    setDraggingIndex(index);
    setDropSlot(index);
    dragPoint.current = { x: event.clientX, y: event.clientY };
    rowAnimations.current.forEach((animation) => animation.cancel());
    let node = rootRef.current?.parentElement || null;
    while (node) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) break;
      node = node.parentElement;
    }
    geometryRef.current.scroller = node;
    measureRows(); scheduleDrag();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    dragPoint.current = { x: event.clientX, y: event.clientY };
    scheduleDrag();
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    // Flush the final pointer position even when release precedes the next frame.
    if (geometryRef.current.dirty) measureRows();
    setTargetSlot(slotAtPoint(event.clientY));
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
      <p className="text-sm text-[var(--muted)]">
        {upcomingCount} upcoming{explicitCount > 0 ? ` · ${explicitCount} added by you` : ""}
      </p>
      <div className="flex">
        <PlayerIconButton label="Undo queue edit" disabled={props.disabled || !props.canUndoQueue} onClick={() => { props.onQueueUndo?.(); setMessage("Queue edit undone."); }}><Undo2 size={20} /></PlayerIconButton>
        <PlayerIconButton label="Clear added tracks" disabled={props.disabled || explicitCount === 0} onClick={() => { props.onQueueEdit?.({ kind: "clear" }); setMessage("Added tracks cleared. Undo is available."); }}><ListX size={20} /></PlayerIconButton>
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
          data-queue-key={track.queueEntryId || `${track.id}-${index}`}
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
              <span className="min-w-0">
                <span className="block break-words text-sm">{track.title}</span>
                <span className="block truncate text-xs text-[var(--muted)]">{track.channel}</span>
              </span>
              {track.queueSource === "user" && <span className="shrink-0 rounded-full border border-[var(--hairline-cyan)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--teal)]">Queued</span>}
            </button>
            {movable && <PlayerIconButton label={`Remove ${track.title} from queue`} disabled={props.disabled} onClick={() => { props.onQueueEdit?.({ kind: "remove", index }); setMessage(`${track.title} removed. Undo is available.`); }}><Trash2 size={18} /></PlayerIconButton>}
          </div>
        </li>;
      })}
    </ol>

    {draggedTrack && <div
      ref={ghostRef}
      aria-hidden="true"
      className="pointer-events-none fixed z-[140] flex w-[min(330px,calc(100vw-32px))] items-center gap-3 rounded-lg border border-[var(--accent)] bg-[var(--navy-raised)] p-2 shadow-2xl"
      style={{ left: 0, top: 0, transform: `translate3d(${(dragPoint.current?.x || 0) + 14}px, ${(dragPoint.current?.y || 0) + 14}px, 0)` }}
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
