"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ListMusic, Maximize2, Mic2, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import type { PlayerDockProps } from "./player.types";
import PlayerTimeline from "./PlayerTimeline";
import PlaybackViews from "./PlaybackViews";
import styles from "./playerDock.module.css";

const ExpandedPlayer = dynamic(() => import("./ExpandedPlayer"), { ssr: false });

export function PlayerIconButton({ label, active, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active}
    className={`${styles.iconButton} ${active ? styles.active : ""} ${className}`} {...props}>{children}</button>;
}

export function Transport(props: PlayerDockProps) {
  return <div className={styles.transport}>
    <PlayerIconButton label="Shuffle" active={props.shuffle} disabled={props.disabled} onClick={props.onShuffle}><Shuffle size={18} /></PlayerIconButton>
    <PlayerIconButton label="Previous song" disabled={props.disabled} onClick={props.onPrevious}><SkipBack size={20} fill="currentColor" /></PlayerIconButton>
    <PlayerIconButton label={props.playing ? "Pause" : "Play"} disabled={props.disabled} onClick={props.onPlayPause} className={styles.play}>{props.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</PlayerIconButton>
    <PlayerIconButton label="Next song" disabled={props.disabled} onClick={props.onNext}><SkipForward size={20} fill="currentColor" /></PlayerIconButton>
    <PlayerIconButton label="Repeat queue" active={props.repeat} disabled={props.disabled} onClick={props.onRepeat}><Repeat size={18} /></PlayerIconButton>
  </div>;
}

export default function PlayerDock(props: PlayerDockProps) {
  const [panel, setPanel] = useState<"player" | "queue" | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const expandPlayer = () => props.onVideo ? props.onVideo() : setPanel("player");
  const [mode, setMode] = useState<"audio" | "video">("audio");
  const [view, setView] = useState<"panel" | "drawer" | "expanded">("panel");
  const returnView = useRef<"panel" | "drawer">("panel");
  const openPlayer = () => props.onVideo ? setView("drawer") : setPanel("player");
  const hasVideo = Boolean(props.onVideo);
  useEffect(() => {
    if (!hasVideo) { setMode("audio"); setView("panel"); }
  }, [hasVideo]);
  const expandVideo = () => {
    returnView.current = view === "drawer" ? "drawer" : "panel";
    setMode("video");
    setView("expanded");
  };
  const closeView = () => setView(view === "expanded" ? returnView.current : "panel");
  const switchMode = () => {
    setMode(mode === "video" ? "audio" : "video");
    if (view === "expanded") setView(returnView.current);
  };
  const progress = props.duration > 0
    ? Math.min(100, Math.max(0, (props.position / props.duration) * 100))
    : 0;
  return <>
    <div className={styles.dock} data-testid="player-dock">
      <div className={styles.mobileProgress} aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      <div className={styles.track}>
        <button type="button" aria-label={`Expand player: ${props.track.title}`} onClick={openPlayer} className={styles.trackButton}>
          <img src={props.track.thumbnail || "/icon-192x192.png"} alt="" width={48} height={48} className={styles.artwork} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/icon-192x192.png"; }} />
          <span className={styles.trackCopy}><strong>{props.track.title}</strong><small>{props.track.channel}</small></span>
        </button>
        <div className={styles.favourite}>{props.favourite}</div>
      </div>
      <div className={styles.center}>
        <Transport {...props} />
        <PlayerTimeline position={props.position} duration={props.duration} disabled={props.disabled} onSeek={props.onSeek} />
      </div>
      <div className={styles.tools}>
        {props.onLyrics && <PlayerIconButton label="Show live lyrics" onClick={props.onLyrics}><Mic2 size={19} /></PlayerIconButton>}
        <PlayerIconButton label="Queue" onClick={() => setPanel("queue")}><ListMusic size={20} /></PlayerIconButton>
        <div className={styles.volume}>{props.volume}</div>
        {props.onVideo && <PlayerIconButton label="Expand video" onClick={expandVideo}><Maximize2 size={19} /></PlayerIconButton>}
      </div>
      <div className={styles.mobile}>
        <PlayerIconButton label={props.playing ? "Pause" : "Play"} disabled={props.disabled} onClick={props.onPlayPause} className={styles.play}>
          {props.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </PlayerIconButton>
        <PlayerIconButton label="Expand player" onClick={openPlayer}><Maximize2 size={19} /></PlayerIconButton>
      </div>
    </div>
    <PlaybackViews player={{ ...props, onVideo: props.onVideo ? expandPlayer : undefined }} mode={mode} view={view}
      onMode={switchMode} onExpand={expandVideo} onClose={closeView} onOpen={openPlayer} onQueueOpen={() => setPanel("queue")} />
    {panel && <ExpandedPlayer {...props} initialPanel={panel} onClose={closePanel} />}
  </>;
}
