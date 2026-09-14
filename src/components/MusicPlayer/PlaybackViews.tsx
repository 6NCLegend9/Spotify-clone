"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ChevronDown, Expand, ListMusic, Maximize2, Mic2, MonitorPlay, MoreHorizontal, Music2, PictureInPicture2, X } from "lucide-react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton, Transport } from "./PlayerDock";
import PlayerTimeline from "./PlayerTimeline";
import QueueEditor from "./QueueEditor";
import VideoQualityMenu from "./VideoQualityMenu";
import { useLiveVideoSurface } from "./LiveVideoSurface";
import styles from "./playbackViews.module.css";

const SyncedLyrics = dynamic(() => import("./SyncedLyrics"), { ssr: false });
type View = "panel" | "drawer" | "expanded";
type Props = {
  player: PlayerDockProps;
  mode: "audio" | "video";
  view: View;
  onMode: () => void;
  onExpand: () => void;
  onClose: () => void;
  onOpen: () => void;
  onQueueOpen: () => void;
};

export function TrackArtwork({ src, className = "" }: { src?: string; className?: string }) {
  return <img src={src || "/icon-192x192.png"} alt="" className={className}
    onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/icon-192x192.png"; }} />;
}

export default function PlaybackViews({ player, mode, view, onMode, onExpand, onClose, onOpen, onQueueOpen }: Props) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [shell, setShell] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useState<"lyrics" | "queue">("lyrics");
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const desktopMedia = useRef<HTMLDivElement>(null);
  const drawerMedia = useRef<HTMLDivElement>(null);
  const expandedMedia = useRef<HTMLDivElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  closeRef.current = () => {
    if (document.fullscreenElement === shell) void document.exitFullscreen().catch(() => {});
    onClose();
  };
  const overlay = view !== "panel";
  const video = mode === "video" && Boolean(player.onVideo);
  const viewport = view === "expanded" ? expandedMedia : view === "drawer" ? drawerMedia : desktopMedia;
  useLiveVideoSurface(viewport, video, overlay, `${view}:${mode}:${Boolean(slot)}:${Boolean(shell)}`);

  useEffect(() => {
    setSlot(document.getElementById("kasa-now-playing-slot"));
    const root = document.querySelector<HTMLElement>(".app-shell");
    setShell(root);
    setFullscreenAvailable(Boolean(root?.requestFullscreen && document.fullscreenEnabled));
    const update = () => setBrowserFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  // Modal-only UI state: preserve/restore focus and background interactivity.
  useEffect(() => {
    if (!overlay || !shell) return;
    const previous = document.activeElement as HTMLElement | null;
    const regions = Array.from(shell.querySelectorAll<HTMLElement>(
      ".app-stage, .app-sidebar, .now-playing-panel, .app-tabbar, [data-testid='player-dock']",
    ));
    const previousInert = regions.map((region) => region.inert);
    regions.forEach((region) => { region.inert = true; });
    shell.setAttribute("data-kasa-overlay", "open");
    const focusFrame = requestAnimationFrame(() => modal.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key !== "Tab" || !modal.current) return;
      const targets = Array.from(modal.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex='0']",
      )).filter((node) => node.getClientRects().length > 0 && !node.closest("[hidden]"));
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !modal.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey, true);
      regions.forEach((region, index) => { region.inert = previousInert[index]; });
      shell.removeAttribute("data-kasa-overlay");
      if (document.fullscreenElement === shell) void document.exitFullscreen().catch(() => {});
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [overlay, shell]);

  const toggleBrowserFullscreen = useCallback(async () => {
    try {
      setNotice("");
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell?.requestFullscreen();
    } catch {
      setNotice("Fullscreen is unavailable in this browser. The expanded player is still available.");
    }
  }, [shell]);

  const closePresentation = () => {
    if (document.fullscreenElement === shell) void document.exitFullscreen().catch(() => {});
    onClose();
  };
  const modeButton = player.onVideo ? (
    <button type="button" className={styles.modeButton} onClick={() => {
      if (view === "expanded" && document.fullscreenElement === shell) void document.exitFullscreen().catch(() => {});
      onMode();
    }} data-testid="media-mode-toggle">
      {video ? <Music2 size={17} aria-hidden="true" /> : <MonitorPlay size={17} aria-hidden="true" />}
      {video ? "Switch to audio" : "Switch to video"}
    </button>
  ) : null;
  const index = player.queue.findIndex((item) => item.id === player.track.id);
  const upcoming = player.queue.slice(index >= 0 ? index + 1 : 0).slice(0, 5);
  const metadata = <div className={styles.metadata}>
    <div><h2 title={player.track.title}>{player.track.title}</h2><p title={player.track.channel}>{player.track.channel}</p></div>
    {player.favourite}
  </div>;
  const options = <details className={styles.options}>
    <summary aria-label="Player options"><MoreHorizontal size={22} /></summary>
    <div className={styles.optionsMenu}>
      <div className={styles.actionRow}>{player.trackActions}{player.sleepControl}</div>
      {player.onPip && <button type="button" disabled={player.pipDisabled} onClick={player.onPip} title={player.pipLabel}>
        <PictureInPicture2 size={17} /> {player.pipLabel || "Picture in picture"}
      </button>}

    </div>
  </details>;
  const queue = <section className={styles.queuePreview}>
    <div className={styles.sectionHeading}><h3>Next in queue</h3><button type="button" onClick={onQueueOpen}>View queue</button></div>
    {upcoming.length ? upcoming.map((item) => <button key={item.id} type="button" className={styles.queueTrack}
      disabled={player.disabled} onClick={() => player.onSelect(item)} aria-label={`Play ${item.title}`}>
      <TrackArtwork src={item.thumbnail} /><span><strong>{item.title}</strong><small>{item.channel}</small></span>
    </button>) : <p className={styles.empty}>Your queue is clear. Choose another track to keep listening.</p>}
  </section>;
  const panel = <div className={styles.sideContent}>
    <div className={styles.sideActions}><span>{video ? "Music video" : "Now playing"}</span>
      {video && <PlayerIconButton label="Expand music video" onClick={onExpand}><Maximize2 size={18} /></PlayerIconButton>}
    </div>
    <div ref={desktopMedia} className={`${styles.media} ${video ? styles.videoMedia : ""}`} data-testid="sidebar-media">
      {!video && <TrackArtwork src={player.track.thumbnail} />}
    </div>
    {modeButton}
    {metadata}
    {queue}
    <section className={styles.trackInfo}><h3>About this track</h3><p>{player.track.channel || "Artist details are unavailable."}</p>
      <div className={styles.actionRow}>{player.trackActions}<button type="button" onClick={onOpen}>Open player</button></div>
    </section>
  </div>;

  return <>
    {slot && createPortal(panel, slot)}
    {overlay && shell && createPortal(<>
      <div className={styles.backdrop} />
      <div ref={modal} role="dialog" aria-modal="true" aria-label="Now playing" tabIndex={-1}
        className={`${styles.overlay} ${view === "expanded" ? styles.expanded : styles.drawer}`}
        data-testid="kasa-player-view" data-view={view} data-mode={mode}>
        <header className={styles.header}>
          <PlayerIconButton label={view === "expanded" ? "Minimize video" : "Close player"} onClick={closePresentation}>
            {view === "expanded" ? <X size={22} /> : <ChevronDown size={24} />}
          </PlayerIconButton>
          <div className={styles.context}><small>NOW PLAYING</small><strong>{player.track.title}</strong></div>
          <div className={styles.headerTools}>
            {view === "expanded" && <>{modeButton}<VideoQualityMenu />
              {fullscreenAvailable && <PlayerIconButton label={browserFullscreen ? "Exit browser fullscreen" : "Enter browser fullscreen"} onClick={toggleBrowserFullscreen}><Expand size={20} /></PlayerIconButton>}
            </>}
            {options}
          </div>
        </header>
        {notice && <p role="status" className={styles.notice}>{notice}</p>}
        {view === "expanded" ? <>
          <div ref={expandedMedia} className={styles.expandedMedia} data-testid="expanded-media" />
          <footer className={styles.expandedFooter}>
            <div className={styles.footerTrack}><TrackArtwork src={player.track.thumbnail} /><div><strong>{player.track.title}</strong><small>{player.track.channel}</small></div>{player.favourite}</div>
            <div className={styles.footerTransport}><Transport {...player} /><PlayerTimeline position={player.position} duration={player.duration} disabled={player.disabled} onSeek={player.onSeek} /></div>
            <div className={styles.footerVolume}>{player.volume}</div>
          </footer>
        </> : <div className={styles.drawerScroll} data-kasa-scrollport>
          <div className={styles.drawerBody}>
            <div ref={drawerMedia} className={`${styles.media} ${video ? styles.videoMedia : ""}`} data-testid="drawer-media"
              onPointerDown={(event) => { if (event.pointerType === "touch") swipe.current = { x: event.clientX, y: event.clientY }; }}
              onPointerUp={(event) => {
                const start = swipe.current; swipe.current = null;
                if (!start || player.disabled) return;
                const dx = event.clientX - start.x, dy = event.clientY - start.y;
                if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) player.onNext(); else player.onPrevious(); }
                else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
              }} onPointerCancel={() => { swipe.current = null; }}>
              {!video && <TrackArtwork src={player.track.thumbnail} />}
            </div>
            <div className={styles.modeRow}>{modeButton}{video && <PlayerIconButton label="Expand music video" onClick={onExpand}><Maximize2 size={20} /></PlayerIconButton>}</div>
            {metadata}
            <PlayerTimeline position={player.position} duration={player.duration} disabled={player.disabled} onSeek={player.onSeek} />
            <div className={styles.largeTransport}><Transport {...player} /></div>
            <div className={styles.drawerUtilities}>{player.volume}{player.trackActions}{player.sleepControl}</div>
            <div className={styles.tabs} aria-label="Player sections">
              <button type="button" aria-pressed={tab === "lyrics"} onClick={() => setTab("lyrics")}><Mic2 size={16} /> Lyrics</button>
              <button type="button" aria-pressed={tab === "queue"} onClick={() => setTab("queue")}><ListMusic size={16} /> Queue</button>
            </div>
            <section className={styles.drawerSection}>
              {tab === "queue" ? <QueueEditor {...player} /> : player.onLyrics ? <SyncedLyrics title={player.track.title} artist={player.track.channel || ""} duration={player.duration} currentTime={player.position} onSeek={player.onSeek} /> : <p className={styles.empty}>Live lyrics are turned off in Settings.</p>}
            </section>
          </div>
        </div>}
      </div>
    </>, shell)}
  </>;
}
