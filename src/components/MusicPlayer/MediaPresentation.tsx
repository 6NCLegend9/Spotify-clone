"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { ChevronDown, ListMusic, Maximize2, Mic2, Minimize2, Music2, Pause, Play, Settings2, Video } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, TouchEvent } from "react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton, Transport } from "./PlayerDock";
import PlayerTimeline from "./PlayerTimeline";
import styles from "./mediaPresentation.module.css";
import { resolveInitialMediaVideoMode, resolveMediaVideoModeAfterCapabilityChange, shouldExposeLiveVideoViewport } from "./mediaPresentationState.mjs";
import { setFullScreen } from "@/redux/features/playerSlice";
import useMediaQuery from "@/hooks/useMediaQuery";
import { COMPACT_TOUCH_QUERY } from "@/utils/responsivePolicy.mjs";

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

function clippingParents(anchor: HTMLElement | null) {
  const parents: HTMLElement[] = [];
  for (let parent = anchor?.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY + style.overflowX)) parents.push(parent);
  }
  return parents;
}

export function positionMediaViewport(host: HTMLElement, anchor: HTMLElement | null, showingVideo: boolean, expanded: boolean, clips = showingVideo ? clippingParents(anchor) : []) {
  // Read geometry together, before changing the live iframe host. Its fixed origin
  // can be shifted by a transformed ancestor; account for its existing offset.
  const rect = showingVideo ? anchor?.getBoundingClientRect() : undefined;
  const visible = showingVideo && Boolean(rect && rect.width > 0 && rect.height > 0 && anchor?.getClientRects().length);
  const hostRect = visible ? host.getBoundingClientRect() : { left: 0, top: 0 };
  const originX = hostRect.left - (parseFloat(host.style.left) || 0);
  const originY = hostRect.top - (parseFloat(host.style.top) || 0);
  let top = 0; let bottom = window.innerHeight; let left = 0; let right = window.innerWidth;
  if (visible) for (const parent of clips) {
    const box = parent.getBoundingClientRect();
    top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom);
    left = Math.max(left, box.left); right = Math.min(right, box.right);
  }
  const values: Record<string, string> = {
    width: `${visible ? rect!.width : 320}px`, height: `${visible ? rect!.height : 180}px`,
    left: `${visible ? rect!.left - originX : -10000}px`, top: `${visible ? rect!.top - originY : -10000}px`,
    opacity: visible ? "1" : "0", "pointer-events": visible ? "auto" : "none",
    "border-radius": expanded ? "0" : "12px",
    "clip-path": visible ? `inset(${Math.max(0, top - rect!.top)}px ${Math.max(0, rect!.right - right)}px ${Math.max(0, rect!.bottom - bottom)}px ${Math.max(0, left - rect!.left)}px)` : "none",
  };
  for (const [name, value] of Object.entries(values)) {
    if (host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value, "important");
  }
  host.setAttribute("aria-hidden", visible ? "false" : "true");
  host.inert = !visible;
}

/** One presentation owner. It never recreates decks or invokes legacy view callbacks. */
const MediaPresentation = forwardRef<MediaPresentationHandle, Props>(function MediaPresentation(props, ref) {
  const { onQueue } = props;
  const dispatch = useDispatch();
  const [mediaHost, setMediaHost] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const mobile = useMediaQuery(COMPACT_TOUCH_QUERY);
  const [drawer, setDrawer] = useState(false);
  const [closing, setClosing] = useState(false);
  const [entering, setEntering] = useState(false);
  const dragY = useRef(0);
  const scheduleViewport = useRef<((duration?: number) => void) | null>(null);
  const fallbackFrame = useRef(0);
  const setDragY = useCallback((value: number) => {
    dragY.current = value;
    if (scheduleViewport.current) scheduleViewport.current(300);
    else if (!fallbackFrame.current) fallbackFrame.current = requestAnimationFrame(() => {
      fallbackFrame.current = 0;
      overlayRef.current?.style.setProperty("--sheet-drag", `${dragY.current}px`);
      if (overlayRef.current) overlayRef.current.dataset.dragging = dragY.current > 0 ? "true" : "false";
    });
  }, []);
  const [compactHeader, setCompactHeader] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [video, setVideo] = useState(() => {
    if (typeof window === "undefined") return props.videoAvailable === true;
    try {
      return resolveInitialMediaVideoMode(
        window.localStorage.getItem(MEDIA_MODE_KEY),
        props.videoAvailable === true,
      );
    } catch {
      return props.videoAvailable === true;
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
  const gestureRef = useRef<{ x: number; y: number; pull: boolean } | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const controlsVisibleRef = useRef(true);
  const controlsRevealedByPointerMoveRef = useRef(false);
  const canVideo = props.videoAvailable === true;
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
    controlsVisibleRef.current = true;
    setControlsVisible(true);
    clearControlsTimer();
    controlsTimerRef.current = window.setTimeout(() => {
      controlsTimerRef.current = null;
      controlsVisibleRef.current = false;
      controlsRevealedByPointerMoveRef.current = false;
      setControlsVisible(false);
    }, THEATER_CONTROLS_HIDE_MS);
  }, [clearControlsTimer, expanded, view]);
  const toggleTheaterControls = useCallback((visibleAtPointerDown = controlsVisibleRef.current) => {
    if (!expanded || view !== "player") return;
    clearControlsTimer();
    controlsRevealedByPointerMoveRef.current = false;
    const next = !visibleAtPointerDown;
    controlsVisibleRef.current = next;
    setControlsVisible(next);
    if (next) {
      controlsTimerRef.current = window.setTimeout(() => {
        controlsTimerRef.current = null;
        controlsVisibleRef.current = false;
        setControlsVisible(false);
      }, THEATER_CONTROLS_HIDE_MS);
    }
  }, [clearControlsTimer, expanded, view]);

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
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false); setEntering(false); setDragY(0); setCompactHeader(false);
    setDrawer(false); setExpanded(false); setView("player");
  }, [setDragY]);
  const collapseSheet = useCallback(() => {
    if (!mobile || expanded || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.a11yReducedMotion === "true") { dismiss(); return; }
    if (closeTimer.current !== null) return;
    setEntering(false); setClosing(true);
    closeTimer.current = window.setTimeout(dismiss, 260);
  }, [mobile, expanded, dismiss]);
  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => setEntering(false), 320);
    return () => window.clearTimeout(timer);
  }, [entering]);
  useEffect(() => () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); cancelAnimationFrame(fallbackFrame.current); }, []);
  const open = useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false); setEntering(true); setDragY(0); setCompactHeader(false);
    rememberFocus(); setView("player"); setExpanded(false); setDrawer(true);
  }, [rememberFocus, setDragY]);
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
    if (view !== "player") { setDragY(0); setView("player"); }
    else if (expanded) { setDragY(0); setExpanded(false); }
    else collapseSheet();
  }, [view, expanded, collapseSheet, setDragY]);
  const closeRef = useRef(close);
  closeRef.current = close;
  useImperativeHandle(ref, () => ({ open, dismiss, expand: openExpanded, showLyrics: openLyrics }), [open, dismiss, openExpanded, openLyrics]);

  useEffect(() => {
    setSlot(document.getElementById("kasa-now-playing-slot"));
    setMediaHost(document.querySelector<HTMLElement>('[data-testid="youtube-decks"]'));
    return undefined;
  }, []);

  useEffect(() => {
    if (!canVideo) {
      if (expanded) setExpanded(false);
      setVideo(false);
    } else {
      try {
        setVideo(resolveMediaVideoModeAfterCapabilityChange(
          window.localStorage.getItem(MEDIA_MODE_KEY),
          true,
        ));
      } catch {
        setVideo(true);
      }
    }
    if (!canLyrics && view === "lyrics") setView("player");
  }, [canVideo, canLyrics, expanded, view]);

  useEffect(() => {
    if (expanded && view === "player") {
      showTheaterControls();
      return clearControlsTimer;
    }
    clearControlsTimer();
    controlsVisibleRef.current = true;
    setControlsVisible(true);
    return undefined;
  }, [clearControlsTimer, expanded, props.track.id, showTheaterControls, view]);

  useEffect(() => {
    dispatch(setFullScreen(expanded));
    window.dispatchEvent(new CustomEvent("heykasa:media-theater", { detail: { active: expanded && showingVideo } }));
    return () => {
      dispatch(setFullScreen(false));
      window.dispatchEvent(new CustomEvent("heykasa:media-theater", { detail: { active: false } }));
    };
  }, [dispatch, expanded, showingVideo]);

  const hasOtherDialog = useCallback(() => Array.from(document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]'))
    .some((element) => element !== overlayRef.current && element.getClientRects().length > 0), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shortcutsEnabled || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || hasOtherDialog()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if ((key === "f" || key === "v") && canVideo) {
        // Always stop this key so YouTubePlayer cannot open legacy fullscreen
        // over an open KASA overlay. Still toggle theater from the dock.
        event.preventDefault(); event.stopImmediatePropagation();
        if (expanded) close();
        else if (!overlay) {
          // V is an explicit video command. F expands the currently selected
          // Audio/Video mode without changing the user's persisted preference.
          if (key === "v") persistVideoMode(true);
          openExpanded();
        }
      } else if (target?.closest("button, a, [role='menuitem'], [role='tab']")) {
        return;
      } else if (key === "t" && canLyrics) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (view === "lyrics") close(); else openLyrics();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [shortcutsEnabled, canVideo, canLyrics, expanded, overlay, view, close, openExpanded, openLyrics, hasOtherDialog, persistVideoMode]);

  useEffect(() => {
    if (!overlay) return;
    const previousFocus = returnFocusRef.current || document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
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
      if (mobile) document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      document.removeEventListener("keydown", onKey, true);
      if (previousFocus?.isConnected) previousFocus.focus();
      returnFocusRef.current = null;
    };
  }, [overlay, mobile, hasOtherDialog]);

  useEffect(() => { if (overlay) overlayRef.current?.focus(); }, [view, expanded, overlay]);

  useLayoutEffect(() => {
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
    region.style.setProperty("z-index", overlay ? "69" : "30");
    // Establish the fixed containing block once, before the first measurement.
    for (const [name, value] of Object.entries({ display: "block", position: "fixed", inset: "auto", margin: "0", transform: "none", "min-height": "0", "max-height": "none", overflow: "hidden", "z-index": "1", left: "0px", top: "0px" })) {
      host.style.setProperty(name, value, "important");
    }
    let frame = 0;
    let until = 0;
    let clips = clippingParents(anchorRef.current);
    const place = () => {
      frame = 0;
      const sheet = overlayRef.current;
      if (sheet) {
        const offset = `${dragY.current}px`;
        if (sheet.style.getPropertyValue("--sheet-drag") !== offset) sheet.style.setProperty("--sheet-drag", offset);
        sheet.dataset.dragging = dragY.current > 0 ? "true" : "false";
      }
      const liveMobileMatch = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
      const exposeLiveVideo = shouldExposeLiveVideoViewport({
        showingVideo,
        mobile: mobile || liveMobileMatch,
        entering,
        closing,
        dragY: dragY.current,
      });
      positionMediaViewport(host, anchorRef.current, exposeLiveVideo, expanded, clips);
      if (performance.now() < until) frame = requestAnimationFrame(place);
    };
    const request = (duration = 0) => {
      until = Math.max(until, performance.now() + (showingVideo ? duration : 0));
      if (!frame) frame = requestAnimationFrame(place);
    };
    cancelAnimationFrame(fallbackFrame.current); fallbackFrame.current = 0;
    scheduleViewport.current = request;
    const schedule = () => request();
    const resize = () => { clips = clippingParents(anchorRef.current); request(); };
    const observer = new ResizeObserver(resize);
    if (anchorRef.current) observer.observe(anchorRef.current);
    if (slot) observer.observe(slot);
    observer.observe(document.documentElement);
    // Position synchronously on mount/state changes so the live media host is
    // already aligned before tests or users can interact with the theater.
    place();
    if (mobile && drawer && !expanded) request(350);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      scheduleViewport.current = null;
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      saved.forEach(([name, value, priority]) => { if (value) host.style.setProperty(name, value, priority); else host.style.removeProperty(name); });
      if (oldZ[0]) region.style.setProperty("z-index", oldZ[0], oldZ[1]); else region.style.removeProperty("z-index");
      if (oldHidden === null) host.removeAttribute("aria-hidden"); else host.setAttribute("aria-hidden", oldHidden);
      host.inert = oldInert; host.classList.remove(styles.viewport); region.classList.remove(styles.presentationRegion);
    };
  }, [mediaHost, showingVideo, overlay, mobile, drawer, expanded, view, slot, entering, closing]);

  useEffect(() => {
    if (mobile && drawer && !expanded) scheduleViewport.current?.(350);
  }, [mobile, drawer, expanded, closing, entering]);

  const startGesture = (event: TouchEvent<HTMLElement>) => {
    gestureRef.current = null;
    if (!mobile || closing || event.touches.length !== 1 || (event.target as HTMLElement).closest("button, a, input, select")) return;
    const touch = event.touches[0];
    const handle = Boolean((event.target as HTMLElement).closest('[data-sheet-handle]'));
    gestureRef.current = { x: touch.clientX, y: touch.clientY, pull: handle || (scrollRef.current?.scrollTop || 0) <= 0 };
  };
  const moveGesture = (event: TouchEvent<HTMLElement>) => {
    const start = gestureRef.current;
    if (!start || event.touches.length !== 1) { gestureRef.current = null; setDragY(0); return; }
    const touch = event.touches[0];
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (start.pull && !expanded && dy > 8 && dy > Math.abs(dx) * 1.5) { if (entering) setEntering(false); setDragY(Math.min(dy * .85, window.innerHeight * .65)); }
  };
  const endGesture = (event: TouchEvent<HTMLElement>) => {
    const start = gestureRef.current; const touch = event.changedTouches[0]; gestureRef.current = null;
    if (!start || !touch || !mobile) { setDragY(0); return; }
    const dx = touch.clientX - start.x; const dy = touch.clientY - start.y;
    if (start.pull && dy > 100 && Math.abs(dx) < 50) close();
    else {
      setDragY(0);
      if (!props.disabled && Math.abs(dx) > 72 && Math.abs(dy) < 40) {
        if (dx < 0 && !props.nextDisabled) props.onNext(); else if (dx > 0) props.onPrevious();
      }
    }
  };
  const cancelGesture = () => { gestureRef.current = null; setDragY(0); };
  const toggleMediaControls = (event: ReactMouseEvent<HTMLElement>) => {
    if (!expanded || (event.target as HTMLElement).closest("button, a, input, select")) return;
    if (controlsRevealedByPointerMoveRef.current) {
      controlsRevealedByPointerMoveRef.current = false;
      showTheaterControls();
      return;
    }
    toggleTheaterControls();
  };
  const moveMediaPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (!expanded || event.pointerType !== "mouse") return;
    if (!controlsVisibleRef.current) controlsRevealedByPointerMoveRef.current = true;
    showTheaterControls();
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
      {props.trackActions}
    </div>
  </div>;
  const content = <>
    {overlay && <header className={`${styles.overlayHeader} ${expanded ? styles.theaterChrome : ""} ${mobile && !expanded && compactHeader && view === "player" ? styles.compactHeader : ""}`} onTouchStart={startGesture} onTouchMove={moveGesture} onTouchEnd={endGesture} onTouchCancel={cancelGesture} data-sheet-handle>
      <PlayerIconButton label={view !== "player" ? "Back to player" : expanded ? (showingVideo ? "Collapse video" : "Collapse player") : "Close player"} onClick={close}>{expanded ? <Minimize2 size={21} /> : <ChevronDown size={25} />}</PlayerIconButton>
      <span className={styles.source}><small>{mobile && compactHeader && !expanded && view === "player" ? props.track.channel || "NOW PLAYING" : sourceLabel}</small><strong>{mobile && compactHeader && !expanded && view === "player" ? props.track.title : sourceName}</strong></span>
      {mobile && compactHeader && !expanded && view === "player" ? <PlayerIconButton label={props.playing ? "Pause" : "Play"} disabled={props.disabled} onClick={props.onPlayPause}>{props.playing ? <Pause size={21} /> : <Play size={21} />}</PlayerIconButton> : expanded ? <div className={styles.topTools}>{modeButton}
        <Link href="/settings" onClick={dismiss} aria-label="Video quality settings" className={styles.modeButton}><Settings2 size={17} /><span>Quality settings</span></Link>
      </div> : <PlayerIconButton label="Queue" onClick={openQueue}><ListMusic size={21} /></PlayerIconButton>}
    </header>}
    <div ref={scrollRef} data-testid="mobile-player-scroll" onScroll={(event) => {
      const artHeight = anchorRef.current?.offsetHeight || 250;
      setCompactHeader(event.currentTarget.scrollTop > artHeight + 50);
    }} className={`${styles.body} ${expanded ? styles.expandedBody : ""} ${view !== "player" ? styles.utilityBody : ""}`}>
      {view === "player" ? <>
        <div ref={anchorRef} onTouchStart={startGesture} onTouchMove={moveGesture} onTouchEnd={endGesture} onTouchCancel={cancelGesture}
          onPointerMove={expanded ? undefined : moveMediaPointer}
          className={`${styles.art} ${showingVideo ? styles.videoArt : ""} ${expanded ? styles.expandedArt : ""}`}>
          {!showingVideo && <img src={props.track.thumbnail || "/icon-192x192.png"} alt={`Artwork for ${props.track.title}`} width={480} height={480}
            onError={(event) => { if (!event.currentTarget.src.endsWith("/icon-192x192.png")) event.currentTarget.src = "/icon-192x192.png"; }} />}
        </div>
        {!expanded && <>
          <div className={styles.mediaTools}>{modeButton}</div>{metadata}
          {mobile && mobileTransport}
          {mobile && canLyrics && <section className={styles.detailCard} aria-label="Lyrics">
            <div><h3>Lyrics</h3><Mic2 size={20} /></div>
            <p>Follow the words as the song plays.</p>
            <button type="button" onClick={openLyrics}>Open live lyrics</button>
          </section>}
          <section className={styles.queue} aria-label="Next in queue"><header><h3>{mobile ? "Up next" : "Next in queue"}</h3><button type="button" onClick={openQueue}>Show all</button></header>
            {upcoming.length ? upcoming.map((track, index) => <button type="button" key={track.queueEntryId || `${track.id}-${index}`} disabled={props.disabled} onClick={() => props.onSelect(track)} className={styles.queueRow}>
              <img src={track.thumbnail || "/icon-192x192.png"} alt="" width={44} height={44} />
              <span><strong>{track.title}</strong><small>{track.channel}</small></span>
            </button>) : <p className={styles.empty}>Your queue is empty.</p>}
          </section>
          {mobile && props.track.channel && <section className={styles.detailCard} aria-label="Explore artist">
            <div><h3>Explore {props.track.channel}</h3><Music2 size={20} /></div>
            <p>Find more music from this artist.</p>
            <Link href={`/search/${encodeURIComponent(props.track.channel)}`} onClick={dismiss}>Explore music</Link>
          </section>}
          {mobile && <section className={styles.detailCard} aria-label="Track information">
            <h3>Track information</h3><dl><dt>Title</dt><dd>{props.track.title}</dd>
            {props.track.channel && <><dt>Artist / channel</dt><dd>{props.track.channel}</dd></>}
            {playbackContext?.name && <><dt>Playing from</dt><dd>{playbackContext.name}</dd></>}
            </dl>
          </section>}
        </>}
      </> : <section className={styles.lyrics} aria-label="Live lyrics">
        {metadata}<SyncedLyrics title={props.track.title} artist={props.track.channel || ""} duration={props.duration} currentTime={props.position} onSeek={props.disabled ? undefined : props.onSeek} />
      </section>}
    </div>
    {overlay && ((expanded && view === "player") || (mobile && view !== "player")) && <footer className={`${styles.expandedTransport} ${expanded ? styles.theaterChrome : ""}`}>{mobileTransport}</footer>}
  </>;

  return <>
    {mediaHost && showingVideo && (!mobile || overlay) && createPortal(<>
      {!expanded && <div className={styles.gestureSurface} aria-hidden="true"
        onTouchStart={startGesture} onTouchMove={moveGesture} onTouchEnd={endGesture} onTouchCancel={cancelGesture}
        onClick={toggleMediaControls} onPointerMove={moveMediaPointer} />}
      {!expanded && <button type="button" aria-label="Expand video" title="Expand video" className={styles.expandButton} onClick={openExpanded}><Maximize2 size={19} /></button>}
    </>, mediaHost)}
    <span hidden data-kasa-media-view={overlay ? (expanded ? "expanded" : "drawer") : showingVideo ? "video" : "audio"} />
    {!mobile && !overlay && slot && createPortal(<section className={styles.panel} aria-label="Current track media" onClick={(event) => event.stopPropagation()}>{content}</section>, slot)}
    {overlay && typeof document !== "undefined" && createPortal(<section ref={overlayRef} role="dialog" aria-modal={mobile ? true : undefined}
      aria-label={expanded ? (showingVideo ? "Expanded video" : "Expanded audio") : "Now playing"} tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        if (expanded) toggleMediaControls(event);
      }}
      onPointerMove={moveMediaPointer}
      onFocusCapture={() => { if (expanded) showTheaterControls(); }}
      className={`${styles.overlay} ${expanded ? styles.theater : styles.drawer} ${mobile && !expanded ? styles.mobileSheet : ""} ${closing ? styles.sheetClosing : ""} ${entering ? styles.sheetEntering : ""}`}
      data-state={closing ? "closing" : "open"} data-testid="kasa-media-overlay" data-view={view}
      data-controls={expanded ? (controlsVisible ? "visible" : "hidden") : undefined}
      data-media={expanded ? (showingVideo ? "video" : "audio") : undefined}>
      {content}
      {!expanded && <div data-sheet-handle className={styles.dismissHandle} onTouchStart={startGesture} onTouchMove={moveGesture} onTouchEnd={endGesture} onTouchCancel={cancelGesture}><span /></div>}
    </section>, document.body)}
  </>;
});

export default MediaPresentation;
