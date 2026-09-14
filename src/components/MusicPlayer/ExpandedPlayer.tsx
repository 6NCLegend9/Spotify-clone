"use client";

import { useEffect, useRef } from "react";
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
    aria-label="Queue"
    data-panel="queue"
    onCancel={onClose}
    onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
    className={styles.dialog}
  >
    <header className="flex shrink-0 items-center justify-between border-b border-[var(--hairline-cyan)] px-4 py-2">
      <h2 className="text-base font-semibold">Queue</h2>
      <PlayerIconButton label="Close queue" onClick={onClose}><ChevronDown /></PlayerIconButton>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--navy-deep)] p-4">
      <QueueEditor {...props} />
    </div>
  </dialog>;
}
