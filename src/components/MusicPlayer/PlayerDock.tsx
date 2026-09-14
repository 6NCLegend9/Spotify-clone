"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ListMusic, Maximize2, Mic2, Pause, PictureInPicture2, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import type { PlayerDockProps } from "./player.types";
import PlayerTimeline from "./PlayerTimeline";
import MediaPresentation from "./MediaPresentation";
import type { MediaPresentationHandle } from "./MediaPresentation";
import styles from "./playerDock.module.css";
import sanitizerStyles from "./youtubeSanitizer.module.css";

const ExpandedPlayer = dynamic(() => import("./ExpandedPlayer"), { ssr: false });
const END_SCREEN_GUARD_SECONDS = 0.55;

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
  const [queueOpen, setQueueOpen] = useState(false);
  const presentationRef = useRef<MediaPresentationHandle>(null);
  const endGuardTrackRef = useRef("");
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const openQueue = useCallback(() => {
    presentationRef.current?.dismiss();
    setQueueOpen(true);
  }, []);
  const openPresentation = () => presentationRef.current?.open();
  const openLyrics = () => presentationRef.current?.showLyrics();
  const expandVideo = () => presentationRef.current?.expand();
  const progress = props.duration > 0
    ? Math.min(100, Math.max(0, (props.position / props.duration) * 100))
    : 0;

  useEffect(() => {
    endGuardTrackRef.current = "";
  }, [props.track.id]);

  useEffect(() => {
    if (props.disabled || !props.playing || props.duration <= 8) return;
    const remaining = props.duration - props.position;
    if (remaining < 0 || remaining > END_SCREEN_GUARD_SECONDS) return;
    if (endGuardTrackRef.current === props.track.id) return;
    endGuardTrackRef.current = props.track.id;
    // Move through the existing playback controller before YouTube gets a chance
    // to render its native end-screen recommendation grid.
    props.onNext();
  }, [props.disabled, props.duration, props.onNext, props.playing, props.position, props.track.id]);

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
        {props.onVideo && <PlayerIconButton label="Expand video" onClick={expandVideo}><Maximize2 size={18} /></PlayerIconButton>}
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
    {queueOpen && <ExpandedPlayer {...props} onClose={closeQueue} />}
  </>;
}
