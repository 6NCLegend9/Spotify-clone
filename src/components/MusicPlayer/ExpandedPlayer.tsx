"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton } from "./PlayerDock";
import QueueEditor from "./QueueEditor";
import styles from "./playerDock.module.css";

/** Queue-only utility overlay. The KASA media presentation remains the only Now Playing UI. */
export default function ExpandedPlayer(props: PlayerDockProps & { onClose: () => void }) {
  const { onClose } = props;
  const panelRef = useRef<HTMLElement>(null);
  const closingRef = useRef(false);

  const closeQueue = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeQueue();
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("keydown", handleEscape, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [closeQueue]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.queueBackdrop}
      data-testid="queue-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeQueue();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Queue"
        data-panel="queue"
        tabIndex={-1}
        className={styles.dialog}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--hairline-cyan)] px-4 py-2">
          <h2 className="text-base font-semibold">Queue</h2>
          <PlayerIconButton
            label="Close queue"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeQueue();
            }}
          >
            <ChevronDown />
          </PlayerIconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--navy-deep)] p-4">
          <QueueEditor {...props} />
        </div>
      </section>
    </div>,
    document.body,
  );
}
