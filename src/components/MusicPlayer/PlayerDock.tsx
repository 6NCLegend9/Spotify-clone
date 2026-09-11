"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ListMusic, Maximize2, Mic2, Pause, PictureInPicture2, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import type { PlayerDockProps } from "./player.types";
import PlayerTimeline from "./PlayerTimeline";
import styles from "./playerDock.module.css";

const ExpandedPlayer = dynamic(() => import("./ExpandedPlayer"), { ssr: false });

export function PlayerIconButton({ label, active, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active}
    className={`inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "text-[var(--accent)]" : "text-[var(--text)]"} ${className}`} {...props}>{children}</button>;
}

export function Transport(props: PlayerDockProps) {
  return <div className="flex items-center justify-center gap-1">
    <PlayerIconButton label="Shuffle" active={props.shuffle} disabled={props.disabled} onClick={props.onShuffle}><Shuffle size={19} /></PlayerIconButton>
    <PlayerIconButton label="Previous song" disabled={props.disabled} onClick={props.onPrevious}><SkipBack size={22} /></PlayerIconButton>
    <PlayerIconButton label={props.playing ? "Pause" : "Play"} disabled={props.disabled} onClick={props.onPlayPause} className="!rounded-full !bg-[var(--accent)] !text-[var(--navy)] hover:brightness-110">{props.playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</PlayerIconButton>
    <PlayerIconButton label="Next song" disabled={props.disabled} onClick={props.onNext}><SkipForward size={22} /></PlayerIconButton>
    <PlayerIconButton label="Repeat queue" active={props.repeat} disabled={props.disabled} onClick={props.onRepeat}><Repeat size={19} /></PlayerIconButton>
  </div>;
}

export default function PlayerDock(props: PlayerDockProps) {
  const [panel, setPanel] = useState<"player" | "queue" | null>(null);
  const expandPlayer = () => props.onVideo ? props.onVideo() : setPanel("player");
  return <>
    <div className={styles.dock} data-testid="player-dock">
      <div className="flex min-w-0 items-center gap-3">
        <img src={props.track.thumbnail || "/icon-192x192.png"} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-[4px] object-cover" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/icon-192x192.png"; }} />
        <button type="button" aria-label={`Expand player: ${props.track.title}`} onClick={expandPlayer} className="min-h-12 min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-[var(--accent)]">
          <span className="block truncate text-sm font-semibold text-[var(--text)]">{props.track.title}</span>
          <span className="block truncate text-xs text-[var(--muted)]">{props.track.channel}</span>
        </button>
        <div className={styles.favourite}>{props.favourite}</div>
      </div>
      <div className={styles.center}>
        <Transport {...props} />
        <PlayerTimeline position={props.position} duration={props.duration} disabled={props.disabled} onSeek={props.onSeek} />
      </div>
      <div className={styles.tools}>
        <div className={styles.volume}>{props.volume}</div>
        {props.onLyrics && <PlayerIconButton label="Show live lyrics" onClick={props.onLyrics}><Mic2 size={19} /></PlayerIconButton>}
        <PlayerIconButton label="Queue" onClick={() => setPanel("queue")}><ListMusic size={20} /></PlayerIconButton>
        <PlayerIconButton label={props.pipLabel} active={props.pipActive} disabled={props.pipDisabled} onClick={props.onPip}><PictureInPicture2 size={20} /></PlayerIconButton>
        {props.onVideo && <PlayerIconButton label="Expand video" onClick={props.onVideo}><Maximize2 size={19} /></PlayerIconButton>}
      </div>
      <div className={styles.mobile}>
        <PlayerIconButton label={props.playing ? "Pause" : "Play"} disabled={props.disabled} onClick={props.onPlayPause} className="!rounded-full !bg-[var(--accent)] !text-[var(--navy)] hover:brightness-110">{props.playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</PlayerIconButton>
        <PlayerIconButton label="Next song" disabled={props.disabled} onClick={props.onNext}><SkipForward size={22} /></PlayerIconButton>
        <PlayerIconButton label="Expand player" onClick={expandPlayer}><Maximize2 size={20} /></PlayerIconButton>
      </div>
    </div>
    {panel && <ExpandedPlayer {...props} initialPanel={panel} onClose={() => setPanel(null)} />}
  </>;
}