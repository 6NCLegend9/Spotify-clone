"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ListMusic, Maximize2, Mic2, PanelRightOpen, Pause, PictureInPicture2, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import type { PlayerDockProps } from "./player.types";
import PlayerTimeline from "./PlayerTimeline";
import MediaPresentation from "./MediaPresentation";
import type { MediaPresentationHandle } from "./MediaPresentation";
import styles from "./playerDock.module.css";

const ExpandedPlayer = dynamic(() => import("./ExpandedPlayer"), { ssr: false });

export function PlayerIconButton({ label, active, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active}
    className={`${styles.iconButton} ${active ? styles.active : ""} ${className}`} {...props}>{children}</button>;
}

export function Transport(props: PlayerDockProps) {
  return <div className={styles.transport}>
    <PlayerIconButton label="Shuffle" active={props.shuffle} disabled={props.disabled} onClick={props.onShuffle}><Shuffle size={18} /></PlayerIconButton>
    <PlayerIconButton label="Previous song" disabled={props.disabled} onClick={props.onPrevious}><SkipBack size={21} /></PlayerIconButton>
    <PlayerIconButton label={props.playing ? "Pause" : "Play"} disabled={props.disabled} onClick={props.onPlayPause} className={styles.playButton}>{props.playing ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}</PlayerIconButton>
    <PlayerIconButton label="Next song" disabled={props.disabled} onClick={props.onNext}><SkipForward size={21} /></PlayerIconButton>
    <PlayerIconButton label="Repeat queue" active={props.repeat} disabled={props.disabled} onClick={props.onRepeat}><Repeat size={18} /></PlayerIconButton>
  </div>;
}

export default function PlayerDock(props: PlayerDockProps) {
  const [panel, setPanel] = useState<"player" | "queue" | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const expandPlayer = () => props.onVideo ? props.onVideo() : setPanel("player");
  const presentationRef = useRef<MediaPresentationHandle>(null);
  const openPresentation = () => presentationRef.current?.open();
  const openQueue = useCallback(() => setPanel("queue"), []);
  const progress = props.duration > 0
    ? Math.min(100, Math.max(0, (props.position / props.duration) * 100))
    : 0;
  return <>
    <div className={styles.dock} data-testid="player-dock">
      <div className={styles.mobileProgress} aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      <div className={styles.track}>
        <button type="button" aria-label={`Expand player: ${props.track.title}`} onClick={openPresentation} className={styles.trackButton}>
          <img src={props.track.thumbnail || "/icon-192x192.png"} alt="" width={48} height={48} className={styles.artwork} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/icon-192x192.png"; }} />
          <span className={styles.trackText}><strong>{props.track.title}</strong><small>{props.track.channel}</small></span>
        </button>
        <div className={styles.favourite}>{props.favourite}</div>
        <div className={styles.pip}><PlayerIconButton label={props.pipLabel} active={props.pipActive} disabled={props.pipDisabled} onClick={props.onPip}><PictureInPicture2 size={18} /></PlayerIconButton></div>
      </div>
      <div className={styles.center}>
        <Transport {...props} />
        <PlayerTimeline position={props.position} duration={props.duration} disabled={props.disabled} onSeek={props.onSeek} />
      </div>
      <div className={styles.tools}>
        <PlayerIconButton label="Now playing view" onClick={openPresentation}><PanelRightOpen size={18} /></PlayerIconButton>
        {props.onLyrics && <PlayerIconButton label="Show live lyrics" onClick={props.onLyrics}><Mic2 size={18} /></PlayerIconButton>}
        <PlayerIconButton label="Queue" onClick={openQueue}><ListMusic size={19} /></PlayerIconButton>
        <div className={styles.volume}>{props.volume}</div>
        {props.onVideo && <PlayerIconButton label="Open full-screen video player" onClick={expandPlayer}><Maximize2 size={18} /></PlayerIconButton>}
      </div>
      <div className={styles.mobile}>
        <PlayerIconButton label="Previous song" disabled={props.disabled} onClick={props.onPrevious} className={`${styles.mobileButton} ${styles.mobilePrevious}`}><SkipBack size={20} /></PlayerIconButton>
        <PlayerIconButton label={props.playing ? "Pause" : "Play"} disabled={props.disabled} onClick={props.onPlayPause} className={`${styles.mobileButton} ${styles.playButton}`}>
          {props.playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
        </PlayerIconButton>
        <PlayerIconButton label="Next song" disabled={props.disabled} onClick={props.onNext} className={styles.mobileButton}><SkipForward size={20} /></PlayerIconButton>
        <PlayerIconButton label="Expand player" onClick={openPresentation} className={`${styles.mobileButton} ${styles.mobileExpand}`}><Maximize2 size={19} /></PlayerIconButton>
      </div>
    </div>
    <MediaPresentation ref={presentationRef} {...props} onQueue={openQueue} />
    {panel && <ExpandedPlayer {...props} initialPanel={panel} onClose={closePanel} />}
  </>;
}
