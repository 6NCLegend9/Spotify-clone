"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSelector } from "react-redux";
import { ChevronDown, ListMusic, Maximize2, Mic2, Minimize2, Music2, Settings2, Video } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, TouchEvent } from "react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton, Transport } from "./PlayerDock";
import PlayerTimeline from "./PlayerTimeline";
import styles from "./mediaPresentation.module.css";

const SyncedLyrics = dynamic(() => import("./SyncedLyrics"), { ssr: false });
const MEDIA_MODE_KEY = "heykasa.media.presentation";
const THEATER_CONTROLS_HIDE_MS = 6500;

type View = "player" | "lyrics";
type PlaybackContext = { type?: string; id?: string; name?: string } | null;
interface Props extends PlayerDockProps { onQueue: () => void; }
export interface MediaPresentationHandle {
  open: () => void;
  dismiss: () => void;
  expand: () => void;
  showLyrics: () => void;
}

export function positionMediaViewport(host: HTMLElement, anchor: HTMLElement | null, showingVideo: boolean, expanded: boolean) {
  const rect = anchor?.getBoundingClientRect();
  const visible = showingVideo && Boolean(rect && rect.width > 0 && rect.height > 0 && anchor?.getClientRects().length);
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("inset", "auto", "important");
  host.style.setProperty("margin", "0", "important");
  host.style.setProperty("transform", "none", "important");
  host.style.setProperty("width", `${visible ? rect!.width : 320}px`, "important");
  host.style.setProperty("height", `${visible ? rect!.height : 180}px`, "important");
  host.style.setProperty("min-height", "0", "important");
  host.style.setProperty("max-height", "none", "important");
  host.style.setProperty("left", "0px", "important");
  host.style.setProperty("top", "0px", "important");
  const origin = host.getBoundingClientRect();
  host.style.setProperty("left", `${visible ? rect!.left - origin.left : -10000}px`, "important");
  host.style.setProperty("top", `${visible ? rect!.top - origin.top : -10000}px`, "important");
  host.style.setProperty("opacity", visible ? "1" : "0", "important");
  host.style.setProperty("pointer-events", visible ? "auto" : "none", "important");
  host.style.setProperty("border-radius", expanded ? "0" : "12px", "important");
  host.style.setProperty("overflow", "hidden", "important");
  host.style.setProperty("z-index", "1", "important");
  host.setAttribute("aria-hidden", visible ? "false" : "true");
  host.inert = !visible;
  let top = 0; let bottom = window.innerHeight; let left = 0; let right = window.innerWidth;
  for (let parent = anchor?.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const computed = getComputedStyle(parent);
    if (/(auto|scroll|hidden|clip)/.test(computed.overflowY + computed.overflowX)) {
      const box = parent.getBoundingClientRect();
      top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom);
      left = Math.max(left, box.left); right = Math.min(right, box.right);
    }
  }
  host.style.setProperty("clip-path", visible ? `inset(${Math.max(0, top - rect!.top)}px ${Math.max(0, rect!.right - right)}px ${Math.max(0, rect!.bottom - bottom)}px ${Math.max(0, left - rect!.left)}px)` : "none", "important");
}

/** One presentation owner. It never recreates decks or invokes legacy view callbacks. */
const MediaPresentation = forwardRef<MediaPresentationHandle, Props>(function MediaPresentation(props, ref) {
  const { onQueue } = props;
  const [mediaHost, setMediaHost] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [video, setVideo] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(MEDIA_MODE_KEY) === "video";
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<View>("player");
  const [controlsVisible, setControlsVisible] = useState(true);
  const shortcutsEnabled = useSelector((state: { settings: { keyboardShortcuts?: boolean } }) => state.settings.keyboardShortcuts !== false);
  const playbackContext = useSelector((state: { player: { playbackContext?: PlaybackContext } }) => state.player.playbackContext || null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const gestureRef = useRef<{ x: number; y: number } | null>(null);
  const mediaPointerRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const canVideo = Boolean(props.onVideo);
  const canLyrics = Boolean(props.onLyrics);
  const overlay = expanded || drawer;
  const showingVideo = canVideo && video && view === "player";

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);
  const showTheaterControls = useCallback(() => {
    if (!expanded || view !== "player") return;
    setControlsVisible(true);
    clearControlsTimer();
    controlsTimerRef.current = window.setTimeout(() => {
      controlsTimerRef.current = null;
      setControlsVisible(false);
    }, THEATER_CONTROLS_HIDE_MS);
  }, [clearControlsTimer, expanded, view]);
  const toggleTheaterControls = useCallback(() => {
    if (!expanded || view !== "player") return;
    if (controlsVisible) {
      clearControlsTimer();
      setControlsVisible(false);
    } else {
      showTheaterControls();
    }
  }, [clearControlsTimer, controlsVisible, expanded, showTheaterControls, view]);

  const persistVideoMode = useCallback((next: boolean) => {
    setVideo(next);
    try {
      window.localStorage.setItem(MEDIA_MODE_KEY, next ? "video" : "audio");
    } catch {
      // Private browsing/storage restrictions must not block the presentation toggle.
    }
  }, []);
  const rememberFocus = useCallback(() => {
    if (!returnFocusRef.current) returnFocusRef.current = document.activeElement as HTMLElement | null;
  }, []);
  const dismiss = useCallback(() => {
    setDrawer(false); setExpanded(false); setView("player");
  }, []);
  const open = useCallback(() => {
    rememberFocus(); setView("player"); setExpanded(false); setDrawer(true);
  }, [rememberFocus]);
  const openExpanded = useCallback(() => {
    if (!canVideo) { open(); return; }
    rememberFocus(); setView("player"); setExpanded(true);
  }, [canVideo, open, rememberFocus]);
  const openLyrics = useCallback(() => {
    if (!canLyrics) return;
    rememberFocus(); setExpanded(false); setDrawer(true); setView("lyrics");
  }, [canLyrics, rememberFocus]);
  const openQueue = useCallback(() => {
    dismiss(); onQueue();
  }, [dismiss, onQueue]);
  const close = useCallback(() => {
    if (view !== "player") setView("player");
    else if (expanded) setExpanded(false);
    else dismiss();
  }, [view, expanded, dismiss]);
  const closeRef = useRef(close);
  closeRef.current = close;
  useImperativeHandle(ref, () => ({ open, dismiss, expand: openExpanded, showLyrics: openLyrics }), [open, dismiss, openExpanded, openLyrics]);

  useEffect(() => {
    setSlot(document.getElementById("kasa-now-playing-slot"));
    setMediaHost(document.querySelector<HTMLElement>('[data-testid="youtube-decks"]'));
    // A rotated phone can be wider than the old 767px breakpoint. Keep coarse-pointer
    // phone/tablet layouts in mobile presentation mode so rotation does not drop controls.
    const query = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-width: 1180px) and (max-height: 900px)");
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!canVideo && expanded) setExpanded(false);
    if (!canLyrics && view === "lyrics") setView("player");
  }, [canVideo, canLyrics, expanded, view]);

  useEffect(() => {
    if (expanded && view === "player") {
      showTheaterControls();
      return clearControlsTimer;
    }
    clearControlsTimer();
    setControlsVisible(true);
    return undefined;
  }, [clearControlsTimer, expanded, props.track.id, showTheaterControls, view]);

  const hasOtherDialog = useCallback(() => Array.from(document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]'))
    .some((element) => element !== overlayRef.current && element.getClientRects().length > 0), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shortcutsEnabled || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || hasOtherDialog()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], button, a, [role="menuitem"], [role="tab"]')) return;
      const key = event.key.toLowerCase();
      if ((key === "f" || key === "v") && canVideo) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (expanded) close();
        else {
          // V is an explicit video command. F expands the currently selected
          // Audio/Video mode without changing the user's persisted preference.
          if (key === "v") persistVideoMode(true);
          openExpanded();
        }
      } else if (key === "t" && canLyrics) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (view === "lyrics") close(); else openLyrics();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [shortcutsEnabled, canVideo, canLyrics, expanded, view, close, openExpanded, openLyrics, hasOtherDialog, persistVideoMode]);

  useEffect(() => {
    if (!overlay) return;
    const previousFocus = returnFocusRef.current || document.activeElement as HTMLElement | null;
    const background = Array.from(document.querySelectorAll<HTMLElement>(".app-sidebar, .app-stage, .now-playing-panel, .app-tabbar, .sidebar-resizer, .right-panel-resizer"));
    const previousInert = background.map((element) => element.inert);
    background.forEach((element) => { element.inert = true; });
    overlayRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasOtherDialog()) return;
      if (event.key === "Escape" && !document.fullscreenElement) {
        event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); return;
      }
      if (event.key !== "Tab") return;
      const roots = [overlayRef.current, !mobile ? document.querySelector('[data-testid="player-dock"]') : null];
      const controls = roots.flatMap((root) => root ? Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')) : [])
        .filter((element) => element.getClientRects().length && !element.closest('[inert]') && getComputedStyle(element).visibility !== "hidden");
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === overlayRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      document.removeEventListener("keydown", onKey, true);
      if (previousFocus?.isConnected) previousFocus.focus();
      returnFocusRef.current = null;
    };
  }, [overlay, mobile, hasOtherDialog]);

  useEffect(() => { if (overlay) overlayRef.current?.focus(); }, [view, expanded, overlay]);

  useEffect(() => {
    const host = mediaHost;
    const region = host?.closest<HTMLElement>(".app-player");
    const boundary = host?.closest<HTMLElement>(".player-dock");
    if (!host || !region || !boundary) return;
    const names = ["display", "position", "inset", "margin", "transform", "width", "height", "min-height", "max-height", "left", "top", "opacity", "pointer-events", "border-radius", "overflow", "z-index", "clip-path"];
    const saved = names.map((name) => [name, host.style.getPropertyValue(name), host.style.getPropertyPriority(name)]);
    const oldZ = [region.style.getPropertyValue("z-index"), region.style.getPropertyPriority("z-index")];
    const oldHidden = host.getAttribute("aria-hidden");
    const oldInert = host.inert;
    host.classList.add(styles.viewport);
    region.classList.add(styles.presentationRegion);
    // In theater the live cross-origin iframe sits just below the transparent KASA
    // overlay so header/transport controls remain clickable over the video.
    region.style.setProperty("z-index", expanded && showingVideo ? "69" : overlay ? "80" : "30");
    let frame = 0;
    const place = () => { frame = 0; positionMediaViewport(host, anchorRef.current, showingVideo, expanded); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    const observer = new ResizeObserver(schedule);
    if (anchorRef.current) observer.observe(anchorRef.current);
    if (slot) observer.observe(slot);
    observer.observe(document.documentElement);
    place();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      saved.forEach(([name, value, priority]) => { if (value) host.style.setProperty(name, value, priority); else host.style.removeProperty(name); });
      if (oldZ[0]) region.style.setProperty("z-index", oldZ[0], oldZ[1]); else region.style.removeProperty("z-index");
      if (oldHidden === null) host.removeAttribute("aria-hidden"); else host.setAttribute("aria-hidden", oldHidden);
      host.inert = oldInert; host.classList.remove(styles.viewport); region.classList.remove(styles.presentationRegion);
    };
  }, [mediaHost, showingVideo, overlay, mobile, drawer, expanded, view, slot]);

  const startGesture = (event: TouchEvent<HTMLElement>) => {
    if (!mobile || (event.target as HTMLElement).closest("button, a, input, select")) return;
    const touch = event.touches[0];
    gestureRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const endGesture = (event: TouchEvent<HTMLElement>) => {
    const start = gestureRef.current; const touch = event.changedTouches[0]; gestureRef.current = null;
    if (!start || !touch || !mobile) return;
    const dx = touch.clientX - start.x; const dy = touch.clientY - start.y;
    if (dy > 72 && Math.abs(dx) < 40) close();
    else if (!props.disabled && Math.abs(dx) > 72 && Math.abs(dy) < 40) { if (dx < 0) props.onNext(); else props.onPrevious(); }
  };
  const startMediaPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (!expanded || (event.target as HTMLElement).closest("button, a, input, select")) return;
    mediaPointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  };
  const endMediaPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const start = mediaPointerRef.current;
    mediaPointerRef.current = null;
    if (!expanded || !start || start.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance <= 14) toggleTheaterControls();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  };
  const moveMediaPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (expanded && event.pointerType === "mouse" && !controlsVisible) showTheaterControls();
  };
  const modeButton = canVideo ? <button type="button" className={styles.modeButton}
    onClick={() => persistVideoMode(!video)}
    aria-label={showingVideo ? "Switch to audio" : "Switch to video"}>
    {showingVideo ? <Music2 size={17} /> : <Video size={17} />}{showingVideo ? "Switch to audio" : "Switch to video"}
  </button> : null;
  const upcomingIndex = props.queue.findIndex((track) =>
    props.track.queueEntryId && track.queueEntryId
      ? track.queueEntryId === props.track.queueEntryId
      : track.id === props.track.id,
  );
  const upcoming = props.queue.slice(upcomingIndex < 0 ? 0 : upcomingIndex + 1, upcomingIndex < 0 ? 3 : upcomingIndex + 4);
  const metadata = <div className={styles.metadata}><div><h2>{props.track.title}</h2><p>{props.track.channel}</p></div>{props.favourite}</div>;
  const sourceLabel = view === "player"
    ? (playbackContext?.name ? "PLAYING FROM" : "NOW PLAYING")
    : view.toUpperCase();
  const sourceName = view === "player" && playbackContext?.name
    ? playbackContext.name
    : props.track.title;
  const mobileTransport = <div className={styles.mobileTransport}>
    <PlayerTimeline position={props.position} duration={props.duration} disabled={props.disabled} onSeek={props.onSeek} />
    <Transport {...props} />
    <div className={styles.mobileExtras}>{props.volume}
      {canLyrics && <PlayerIconButton label={view === "lyrics" ? "Close lyrics" : "Show live lyrics"} active={view === "lyrics"} onClick={view === "lyrics" ? close : openLyrics}><Mic2 size={20} /></PlayerIconButton>}
      <PlayerIconButton label="Show queue" onClick={openQueue}><ListMusic size={20} /></PlayerIconButton>
      {props.trackActions}{props.sleepControl}
    </div>
  </div>;
  const content = <>
    {overlay && <header className={`${styles.overlayHeader} ${expanded ? styles.theaterChrome : ""}`} onTouchStart={startGesture} onTouchEnd={endGesture}>
      <PlayerIconButton label={view !== "player" ? "Back to player" : expanded ? (showingVideo ? "Collapse video" : "Collapse player") : "Close player"} onClick={close}>{expanded ? <Minimize2 size={21} /> : <ChevronDown size={25} />}</PlayerIconButton>
      <span className={styles.source}><small>{sourceLabel}</small><strong>{sourceName}</strong></span>
      {expanded ? <div className={styles.topTools}>{modeButton}
        <Link href="/settings" onClick={dismiss} aria-label="Video quality settings" className={styles.modeButton}><Settings2 size={17} /><span>Quality settings</span></Link>
      </div> : <PlayerIconButton label="Queue" onClick={openQueue}><ListMusic size={21} /></PlayerIconButton>}
    </header>}
    <div className={`${styles.body} ${expanded ? styles.expandedBody : ""} ${view !== "player" ? styles.utilityBody : ""}`}>
      {view === "player" ? <>
        <div ref={anchorRef} onTouchStart={startGesture} onTouchEnd={endGesture}
          onPointerDown={startMediaPointer} onPointerUp={endMediaPointer} onPointerMove={moveMediaPointer}
          className={`${styles.art} ${showingVideo ? styles.videoArt : ""} ${expanded ? styles.expandedArt : ""}`}>
          {!showingVideo && <img src={props.track.thumbnail || "/icon-192x192.png"} alt={`Artwork for ${props.track.title}`} width={480} height={480}
            onError={(event) => { if (!event.currentTarget.src.endsWith("/icon-192x192.png")) event.currentTarget.src = "/icon-192x192.png"; }} />}
        </div>
        {!expanded && <>
          <div className={styles.mediaTools}>{modeButton}{!mobile && props.sleepControl}</div>{metadata}
          {mobile && mobileTransport}
          <section className={styles.queue} aria-label="Next in queue"><header><h3>Next in queue</h3><button type="button" onClick={openQueue}>Show all</button></header>
            {upcoming.length ? upcoming.map((track, index) => <button type="button" key={track.queueEntryId || `${track.id}-${index}`} disabled={props.disabled} onClick={() => props.onSelect(track)} className={styles.queueRow}>
              <img src={track.thumbnail || "/icon-192x192.png"} alt="" width={44} height={44} />
              <span><strong>{track.title}</strong><small>{track.channel}</small></span>
            </button>) : <p className={styles.empty}>Your queue is empty.</p>}
          </section>
        </>}
      </> : <section className={styles.lyrics} aria-label="Live lyrics">
        {metadata}<SyncedLyrics title={props.track.title} artist={props.track.channel || ""} duration={props.duration} currentTime={props.position} onSeek={props.disabled ? undefined : props.onSeek} />
      </section>}
    </div>
    {overlay && ((expanded && view === "player") || (mobile && view !== "player")) && <footer className={`${styles.expandedTransport} ${expanded ? styles.theaterChrome : ""}`}>{mobileTransport}</footer>}
  </>;

  return <>
    {mediaHost && showingVideo && (!mobile || overlay) && createPortal(<>
      <div className={styles.gestureSurface} aria-hidden="true"
        onTouchStart={startGesture} onTouchEnd={endGesture}
        onPointerDown={startMediaPointer} onPointerUp={endMediaPointer} onPointerMove={moveMediaPointer} />
      {!expanded && <button type="button" aria-label="Expand video" title="Expand video" className={styles.expandButton} onClick={openExpanded}><Maximize2 size={19} /></button>}
    </>, mediaHost)}
    <span hidden data-kasa-media-view={overlay ? (expanded ? "expanded" : "drawer") : showingVideo ? "video" : "audio"} />
    {!mobile && !overlay && slot && createPortal(<section className={styles.panel} aria-label="Current track media" onClick={(event) => event.stopPropagation()}>{content}</section>, slot)}
    {overlay && typeof document !== "undefined" && createPortal(<section ref={overlayRef} role="dialog" aria-modal={mobile ? true : undefined}
      aria-label={expanded ? (showingVideo ? "Expanded video" : "Expanded audio") : "Now playing"} tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onPointerMove={(event) => { if (expanded && event.pointerType === "mouse") showTheaterControls(); }}
      onFocusCapture={() => { if (expanded) showTheaterControls(); }}
      className={`${styles.overlay} ${expanded ? styles.theater : styles.drawer}`} data-testid="kasa-media-overlay" data-view={view}
      data-controls={expanded ? (controlsVisible ? "visible" : "hidden") : undefined}
      data-media={expanded ? (showingVideo ? "video" : "audio") : undefined}>
      {content}
      {!expanded && <div className={styles.dismissHandle} onTouchStart={startGesture} onTouchEnd={endGesture}><span /></div>}
    </section>, document.body)}
  </>;
});

export default MediaPresentation;
