"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListMusic, Music2, PictureInPicture2 } from "lucide-react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton, Transport } from "./PlayerDock";
import PlayerTimeline from "./PlayerTimeline";
import styles from "./playerDock.module.css";

export default function ExpandedPlayer(props: PlayerDockProps & { initialPanel: "player" | "queue"; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState(props.initialPanel);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialogRef} aria-label="Now playing" onCancel={props.onClose} className={styles.dialog}>
    <header className="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4 py-2">
      <h2 className="text-base font-semibold">{panel === "queue" ? "Queue" : "Now playing"}</h2>
      <div className="flex">
        <PlayerIconButton label={panel === "queue" ? "Now playing" : "Queue"} onClick={() => setPanel(panel === "queue" ? "player" : "queue")}>{panel === "queue" ? <Music2 /> : <ListMusic />}</PlayerIconButton>
        <PlayerIconButton label="Close player" onClick={props.onClose}><ChevronDown /></PlayerIconButton>
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
      {panel === "queue" ? <div>{props.queueSearch}<ol className="space-y-1">
        {props.queue.length === 0 && <li className="py-12 text-center text-sm text-[var(--muted)]">Queue is empty.</li>}
        {props.queue.map((track, index) => <li key={`${track.id}-${index}`}>
          <button type="button" disabled={props.disabled} aria-current={track.id === props.track.id ? "true" : undefined} onClick={() => props.onSelect(track)} className="flex min-h-12 w-full items-center gap-3 rounded p-2 text-left hover:bg-white/10 aria-[current=true]:bg-white/10 disabled:opacity-50">
            <img src={track.thumbnail || "/icon-192x192.png"} alt="" loading="lazy" width={48} height={48} className="h-12 w-12 rounded object-cover" />
            <span className="min-w-0"><span className="block truncate text-sm">{track.title}</span><span className="block truncate text-xs text-[var(--muted)]">{track.channel}</span></span>
          </button>
        </li>)}
      </ol></div> : <div className="mx-auto flex max-w-sm flex-col gap-5">
        <img src={props.track.thumbnail || "/icon-192x192.png"} alt="" width={384} height={384} className="aspect-square w-full rounded-lg object-cover" />
        <div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-xl font-semibold">{props.track.title}</h3><p className="mt-1 text-sm text-[var(--muted)]">{props.track.channel}</p></div>{props.favourite}</div>
        <PlayerTimeline position={props.position} duration={props.duration} disabled={props.disabled} onSeek={props.onSeek} />
        <Transport {...props} />
        <div className="flex items-center justify-between">{props.volume}{props.trackActions}<PlayerIconButton label={props.pipLabel} active={props.pipActive} disabled={props.pipDisabled} onClick={() => { props.onPip(); props.onClose(); }}><PictureInPicture2 /></PlayerIconButton></div>
      </div>}
    </div>
  </dialog>;
}