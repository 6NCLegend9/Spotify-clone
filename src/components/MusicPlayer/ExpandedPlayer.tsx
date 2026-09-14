"use client";

import { useCallback, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton } from "./PlayerDock";
import QueueEditor from "./QueueEditor";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import styles from "./playerDock.module.css";

/** Queue-only utility dialog. The KASA media presentation is the single Now Playing UI. */
export default function ExpandedPlayer(props: PlayerDockProps & { onClose: () => void }) {
  const { onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);

  const closeQueue = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    onClose();
    window.setTimeout(() => { closingRef.current = false; }, 0);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeQueue();
    };
    document.addEventListener("keydown", handleEscape, true);

    return () => {
      document.removeEventListener("keydown", handleEscape, true);
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      if (previous?.isConnected) previous.focus();
    };
  }, [closeQueue]);

  useDismissOnOutside(true, closeQueue, [dialogRef]);

  return <dialog
    ref={dialogRef}
    aria-label="Queue"
    data-panel="queue"
    onCancel={(event) => {
      event.preventDefault();
      closeQueue();
    }}
    onPointerDown={(event) => {
      if (event.target === event.currentTarget) closeQueue();
    }}
    className={styles.dialog}
  >
    <header className="flex shrink-0 items-center justify-between border-b border-[var(--hairline-cyan)] px-4 py-2">
      <h2 className="text-base font-semibold">Queue</h2>
      <PlayerIconButton label="Close queue" onClick={(event) => { event.stopPropagation(); closeQueue(); }}><ChevronDown /></PlayerIconButton>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--navy-deep)] p-4">
      <QueueEditor {...props} />
    </div>
  </dialog>;
}
