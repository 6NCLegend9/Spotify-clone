"use client";

import { createPortal } from "react-dom";
import { Pause, Play, SkipForward, X } from "lucide-react";
import type { PlayerTrack } from "./player.types";

export default function FloatingPlayer({ track, playing, disabled, onPlayPause, onNext, onClose }: {
  track: PlayerTrack; playing: boolean; disabled?: boolean;
  onPlayPause: () => void; onNext: () => void; onClose: () => void;
}) {
  const buttonClass = "grid h-12 w-12 shrink-0 place-items-center rounded hover:bg-[var(--navy-raised)] focus-visible:outline focus-visible:outline-[var(--accent)] disabled:opacity-40";
  return createPortal(<section aria-label="Floating player" className="fixed bottom-40 right-3 z-[90] w-[min(320px,calc(100vw-24px))] rounded-lg border border-[var(--hairline-cyan)] bg-[var(--navy-surface)] p-3 text-[var(--text)] shadow-xl lg:bottom-32">
    <div className="flex items-start gap-3">
      <img src={track.thumbnail || "/icon-192x192.png"} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1 pt-1"><p className="line-clamp-2 break-words text-sm font-semibold">{track.title}</p><p className="truncate text-xs text-[var(--muted)]">{track.channel}</p></div>
      <button type="button" aria-label="Close floating player" title="Close floating player" className={buttonClass} onClick={onClose}><X size={20} /></button>
    </div>
    <div className="mt-2 flex justify-center gap-2">
      <button type="button" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} disabled={disabled} className={buttonClass} onClick={onPlayPause}>{playing ? <Pause /> : <Play />}</button>
      <button type="button" aria-label="Next song" title="Next song" disabled={disabled} className={buttonClass} onClick={onNext}><SkipForward /></button>
    </div>
  </section>, document.body);
}