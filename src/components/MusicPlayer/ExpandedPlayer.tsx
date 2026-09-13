"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListMusic, Music2 } from "lucide-react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton, Transport } from "./PlayerDock";
import PlayerTimeline from "./PlayerTimeline";
import QueueEditor from "./QueueEditor";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import styles from "./playerDock.module.css";

export default function ExpandedPlayer(props: PlayerDockProps & { initialPanel: "player" | "queue"; onClose: () => void }) {
  const { onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState(props.initialPanel);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      // Older Safari/WebView fallback: preserve the modal presentation instead
      // of crashing when the native dialog API is unavailable.
      dialog.setAttribute("open", "");
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      previous?.focus();
    };
  }, [onClose]);
  useDismissOnOutside(true, onClose, [dialogRef]);
  return <dialog
    ref={dialogRef}
    aria-label="Now playing"
    data-panel={panel}
    onCancel={onClose}
    onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
    className={styles.dialog}
  >
    <header className="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4 py-2">
      <h2 className="text-base font-semibold">{panel === "queue" ? "Queue" : "Now playing"}</h2>
      <div className="flex">
        <PlayerIconButton label={panel === "queue" ? "Now playing" : "Queue"} onClick={() => setPanel(panel === "queue" ? "player" : "queue")}>{panel === "queue" ? <Music2 /> : <ListMusic />}</PlayerIconButton>
        <PlayerIconButton label="Close player" onClick={onClose}><ChevronDown /></PlayerIconButton>
      </div>
    </header>
    <div className={styles.stage}>
      <div className={styles.nowPlaying}>
        <div className="mx-auto flex w-full max-w-md flex-col gap-5">
          <img src={props.track.thumbnail || "/icon-192x192.png"} alt="" width={384} height={384} className={styles.art} />
          <div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-xl font-semibold tracking-tight">{props.track.title}</h3><p className="mt-1 text-sm text-[var(--muted)]">{props.track.channel}</p></div>{props.favourite}</div>
          <PlayerTimeline position={props.position} duration={props.duration} disabled={props.disabled} onSeek={props.onSeek} />
          <Transport {...props} />
          {props.sleepControl}
          <div className="flex items-center justify-between gap-3">{props.volume}{props.trackActions}</div>
        </div>
      </div>
      <aside className={styles.queuePane} aria-label="Queue">
        <QueueEditor {...props} />
      </aside>
    </div>
  </dialog>;
}
