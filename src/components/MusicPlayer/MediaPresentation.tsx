"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, ListMusic, Maximize2, Mic2, Minimize2, Music2, Settings2, Video } from "lucide-react";
import type { TouchEvent } from "react";
import type { PlayerDockProps } from "./player.types";
import { PlayerIconButton, Transport } from "./PlayerDock";
import PlayerTimeline from "./PlayerTimeline";
import styles from "./mediaPresentation.module.css";

export interface MediaPresentationHandle { open: () => void; dismiss: () => void; }
interface Props extends PlayerDockProps { onQueue: () => void; }


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

/** Presentation only. The existing decks, sources, refs and transport are not moved or recreated. */
const MediaPresentation = forwardRef<MediaPresentationHandle, Props>(function MediaPresentation(props, ref) {
  const [mediaHost, setMediaHost] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [video, setVideo] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const gestureRef = useRef<{ x: number; y: number } | null>(null);
  const canVideo = Boolean(props.onVideo);
  const overlay = expanded || (mobile && drawer);
  const showingVideo = canVideo && video;
  const close = useCallback(() => {
    if (expanded) setExpanded(false);
    else setDrawer(false);
  }, [expanded]);

  useEffect(() => {
    setSlot(document.getElementById("kasa-now-playing-slot"));
    setMediaHost(document.querySelector<HTMLElement>('[data-testid="youtube-decks"]'));
    const query = window.matchMedia("(max-width: 1179px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useImperativeHandle(ref, () => ({ open: () => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setDrawer(true);
    if (!mobile) { setVideo(canVideo); setExpanded(true); }
  }, dismiss: () => { setDrawer(false); setExpanded(false); } }), [mobile, canVideo]);

  useEffect(() => {
    if (!canVideo) { setVideo(false); setExpanded(false); }
  }, [canVideo]);

  // Focus and inertness belong to the overlay, never to the playback controller.
  useEffect(() => {
    if (!overlay) return;
    const previousFocus = returnFocusRef.current || document.activeElement as HTMLElement | null;
    const background = Array.from(document.querySelectorAll<HTMLElement>(
      ".app-sidebar, .app-stage, .now-playing-panel, .app-tabbar",
    ));
    const previousInert = background.map((element) => element.inert);
    background.forEach((element) => { element.inert = true; });
    overlayRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const roots = [overlayRef.current, !mobile ? document.querySelector('[data-testid="player-dock"]') : null];
      const controls = roots.flatMap((root) => root ? Array.from(root.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      )) : []).filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === overlayRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      document.removeEventListener("keydown", onKey, true);
      if (previousFocus?.isConnected) previousFocus.focus();
      returnFocusRef.current = null;
    };
  }, [overlay, mobile, close]);

  // A viewport adapter: only geometry is changed. Never reparent an iframe, set a
  // source, call a media API, or feed a second time/volume/queue state into it.
  useEffect(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="youtube-decks"]');
    const playerRegion = host?.closest<HTMLElement>(".app-player");
    const dockBoundary = host?.closest<HTMLElement>(".player-dock");
    if (!host || !playerRegion || !dockBoundary) return;
    const savedProperties = (element: HTMLElement, names: string[]) => names.map((name) => ({ name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }));
    const restoreProperties = (element: HTMLElement, properties: ReturnType<typeof savedProperties>) => properties.forEach(({ name, value, priority }) => {
      if (value) element.style.setProperty(name, value, priority); else element.style.removeProperty(name);
    });
    const originalHostStyle = savedProperties(host, ["display", "position", "inset", "margin", "transform", "width", "height", "min-height", "max-height", "left", "top", "opacity", "pointer-events", "border-radius", "overflow", "z-index", "clip-path"]);
    const originalRegionStyle = savedProperties(playerRegion, ["z-index"]);
    const originalBoundaryStyle = savedProperties(dockBoundary, ["transform", "filter", "backdrop-filter", "contain", "overflow"]);
    const originalInert = host.inert;
    host.classList.add(styles.viewport);
    const originalHidden = host.getAttribute("aria-hidden");
    const restore = (element: HTMLElement, value: string | null, attribute = "style") => {
      if (value === null) element.removeAttribute(attribute); else element.setAttribute(attribute, value);
    };
    playerRegion.style.setProperty("z-index", overlay ? "80" : "30");
    for (const property of ["transform", "filter", "backdrop-filter", "contain"]) dockBoundary.style.setProperty(property, "none", "important");
    dockBoundary.style.setProperty("overflow", "visible", "important");
    let frame = 0;
    const place = () => {
      frame = 0;
      positionMediaViewport(host, anchorRef.current, showingVideo, expanded);
    };
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
      restoreProperties(host, originalHostStyle); restore(host, originalHidden, "aria-hidden");
      restoreProperties(playerRegion, originalRegionStyle); restoreProperties(dockBoundary, originalBoundaryStyle);
      host.inert = originalInert; host.classList.remove(styles.viewport);
    };
  }, [showingVideo, overlay, mobile, drawer, expanded, slot]);

  const startGesture = (event: TouchEvent<HTMLElement>) => {
    if (!mobile || (event.target as HTMLElement).closest("button, a, input")) return;
    const touch = event.touches[0];
    gestureRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const endGesture = (event: TouchEvent<HTMLElement>) => {
    const start = gestureRef.current;
    const touch = event.changedTouches[0];
    gestureRef.current = null;
    if (!start || !touch || !mobile) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dy > 72 && Math.abs(dx) < 40) close();
    else if (!props.disabled && Math.abs(dx) > 72 && Math.abs(dy) < 40) {
      if (dx < 0) props.onNext(); else props.onPrevious();
    }
  };

  const modeButton = canVideo ? <button type="button" className={styles.modeButton}
    onClick={() => { setVideo((value) => !value); if (expanded && video) setExpanded(false); }}
    aria-label={showingVideo ? "Switch to audio" : "Switch to video"}>
    {showingVideo ? <Music2 size={17} /> : <Video size={17} />}
    {showingVideo ? "Switch to audio" : "Switch to video"}
  </button> : null;
  const openExpanded = () => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setVideo(true); setExpanded(true);
  };
  const upcomingIndex = props.queue.findIndex((track) => track.id === props.track.id);
  const upcoming = props.queue.slice(upcomingIndex < 0 ? 0 : upcomingIndex + 1, upcomingIndex < 0 ? 3 : upcomingIndex + 4);
  const content = <>
    {overlay && <header className={styles.overlayHeader} onTouchStart={startGesture} onTouchEnd={endGesture}>
      <PlayerIconButton label={expanded && showingVideo ? "Collapse video" : "Close player"} onClick={close}>
        {expanded ? <Minimize2 size={21} /> : <ChevronDown size={25} />}
      </PlayerIconButton>
      <span className={styles.source}><small>NOW PLAYING</small><strong>{props.track.title}</strong></span>
      {expanded ? <div className={styles.topTools}>
        {modeButton}
        <Link href="/settings" onClick={() => { setDrawer(false); setExpanded(false); }} aria-label="Video quality settings" className={styles.modeButton}><Settings2 size={17} /><span>Quality settings</span></Link>
        {props.onVideo && <PlayerIconButton label="Open full-screen video player" onClick={props.onVideo}><Maximize2 size={18} /></PlayerIconButton>}
      </div> : <PlayerIconButton label="Queue" onClick={() => { setDrawer(false); props.onQueue(); }}><ListMusic size={21} /></PlayerIconButton>}
    </header>}
    <div className={`${styles.body} ${expanded ? styles.expandedBody : ""}`}>
      <div ref={anchorRef} onTouchStart={startGesture} onTouchEnd={endGesture} className={`${styles.art} ${showingVideo ? styles.videoArt : ""} ${expanded ? styles.expandedArt : ""}`}>
        {!showingVideo && <img src={props.track.thumbnail || "/icon-192x192.png"} alt={`Artwork for ${props.track.title}`} width={480} height={480}
          onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/icon-192x192.png"; }} />}
      </div>
      {!expanded && <>
        <div className={styles.mediaTools}>{modeButton}</div>
        <div className={styles.metadata}><div><h2>{props.track.title}</h2><p>{props.track.channel}</p></div>{props.favourite}</div>
        {mobile && <div className={styles.mobileTransport}>
          <PlayerTimeline position={props.position} duration={props.duration} disabled={props.disabled} onSeek={props.onSeek} />
          <Transport {...props} />
          <div className={styles.mobileExtras}>{props.volume}
            {props.onLyrics && <PlayerIconButton label="Show live lyrics" onClick={() => { setDrawer(false); props.onLyrics?.(); }}><Mic2 size={20} /></PlayerIconButton>}
            <PlayerIconButton label="Queue" onClick={() => { setDrawer(false); props.onQueue(); }}><ListMusic size={20} /></PlayerIconButton>
            {props.trackActions}
            {props.sleepControl}
          </div>
        </div>}
        <section className={styles.queue} aria-label="Next in queue"><header><h3>Next in queue</h3><button type="button" onClick={() => { setDrawer(false); props.onQueue(); }}>Show all</button></header>
          {upcoming.length ? upcoming.map((track) => <button type="button" key={track.id} disabled={props.disabled}
            onClick={() => props.onSelect(track)} className={styles.queueRow}>
            <img src={track.thumbnail || "/icon-192x192.png"} alt="" width={44} height={44} />
            <span><strong>{track.title}</strong><small>{track.channel}</small></span>
          </button>) : <p className={styles.empty}>Your queue is empty.</p>}
        </section>
      </>}
    </div>
    {expanded && mobile && <footer className={styles.expandedTransport}><PlayerTimeline position={props.position} duration={props.duration} disabled={props.disabled} onSeek={props.onSeek} /><Transport {...props} /></footer>}
  </>;

  return <>
    {mediaHost && showingVideo && !expanded && (!mobile || drawer) && createPortal(
      <button type="button" aria-label="Expand video" title="Expand video" className={styles.expandButton} onClick={openExpanded}><Maximize2 size={19} /></button>, mediaHost,
    )}
    <span hidden data-kasa-media-view={overlay ? (expanded ? "expanded" : "drawer") : showingVideo ? "video" : "audio"} />
    {!mobile && !overlay && slot && createPortal(<section className={styles.panel} aria-label="Current track media">{content}</section>, slot)}
    {overlay && typeof document !== "undefined" && createPortal(<section ref={overlayRef}
      role="dialog" aria-modal={mobile ? true : undefined} aria-label={expanded && showingVideo ? "Expanded video" : "Now playing"} tabIndex={-1}
      className={`${styles.overlay} ${expanded ? styles.theater : styles.drawer}`} data-testid="kasa-media-overlay">
      {content}
      {!expanded && <button type="button" className={styles.dismissHandle} aria-label="Close player" onClick={close}><span /></button>}
    </section>, document.body)}
  </>;
});

export default MediaPresentation;
