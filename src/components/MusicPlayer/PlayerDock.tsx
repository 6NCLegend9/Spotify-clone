"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ListMusic, Mic2, Pause, PictureInPicture2, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import type { PlayerDockProps } from "./player.types";
import PlayerTimeline from "./PlayerTimeline";
import MediaPresentation from "./MediaPresentation";
import type { MediaPresentationHandle } from "./MediaPresentation";
import styles from "./playerDock.module.css";
import sanitizerStyles from "./youtubeSanitizer.module.css";

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
    <PlayerIconButton label="Next song" disabled={props.nextDisabled ?? props.disabled} onClick={props.onNext}><SkipForward size={21} /></PlayerIconButton>
    <PlayerIconButton label="Repeat queue" active={props.repeat} disabled={props.disabled} onClick={props.onRepeat}><Repeat size={18} /></PlayerIconButton>
  </div>;
}

export default function PlayerDock(props: PlayerDockProps) {
  const [queueOpen, setQueueOpen] = useState(false);
  const presentationRef = useRef<MediaPresentationHandle>(null);
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const openQueue = useCallback(() => {
    presentationRef.current?.dismiss();
    setQueueOpen(true);
  }, []);
  const openPresentation = () => presentationRef.current?.open();
  const openLyrics = () => presentationRef.current?.showLyrics();

  useEffect(() => {
    const onPresentationCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command?: string }>).detail?.command;
      if (command === "expand") presentationRef.current?.expand();
      else if (command === "lyrics") presentationRef.current?.showLyrics();
      else if (command === "open") presentationRef.current?.open();
      else if (command === "dismiss") presentationRef.current?.dismiss();
    };
    window.addEventListener("heykasa:media-presentation-command", onPresentationCommand);
    return () => window.removeEventListener("heykasa:media-presentation-command", onPresentationCommand);
  }, []);

  const progress = props.duration > 0
    ? Math.min(100, Math.max(0, (props.position / props.duration) * 100))
    : 0;

  return <>
    <div className={`${styles.dock} ${sanitizerStyles.scope}`} data-testid="player-dock">
      <div className={styles.mobileProgress} aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      <div className={styles.track}>
        <button type="button" aria-label={`Expand player: ${props.track.title}`} onClick={openPresentation} className={styles.trackButton}>
          <img src={props.track.thumbnail || "/icon-192x192.png"} alt="" width={48} height={48} className={styles.artwork}
            onError={(event) => { if (!event.currentTarget.src.endsWith("/icon-192x192.png")) event.currentTarget.src = "/icon-192x192.png"; }} />
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
        {props.onLyrics && <PlayerIconButton label="Show live lyrics" onClick={openLyrics}><Mic2 size={18} /></PlayerIconButton>}
        <PlayerIconButton label="Queue" onClick={openQueue}><ListMusic size={19} /></PlayerIconButton>
        <div className={styles.volume}>{props.volume}</div>
      </div>
      <div className={styles.mobile}>
        <PlayerIconButton label="Previous song" disabled={props.disabled} onClick={props.onPrevious} className={`${styles.mobileButton} ${styles.mobilePrevious}`}><SkipBack size={20} /></PlayerIconButton>
        <PlayerIconButton label={props.playing ? "Pause" : "Play"} disabled={props.disabled} onClick={props.onPlayPause} className={`${styles.mobileButton} ${styles.playButton}`}>
          {props.playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
        </PlayerIconButton>
        <PlayerIconButton label="Next song" disabled={props.nextDisabled ?? props.disabled} onClick={props.onNext} className={styles.mobileButton}><SkipForward size={20} /></PlayerIconButton>
      </div>
    </div>
    <MediaPresentation ref={presentationRef} {...props} onQueue={openQueue} />
    {queueOpen && <ExpandedPlayer {...props} onClose={closeQueue} />}
  </>;
}
