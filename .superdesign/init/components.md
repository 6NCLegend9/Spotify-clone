# Shared UI primitives

No shadcn/MUI. Custom Tailwind + `globals.css` recipes (`.btn-primary`, `.btn-ghost`, `.icon-btn`, `.card`, `.glass-panel`, `.field`).

## EmptyState — `src/components/EmptyState.jsx`

```jsx
import Link from "next/link";

export default function EmptyState({
  eyebrow, title, message, actionLabel, onAction, href, secondaryHref, secondaryLabel = "Back to Home",
}) {
  return (
    <div className="glass-panel rounded-2xl px-5 py-10 text-center text-white sm:px-8">
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      {message ? <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#9aa8b5]">{message}</p> : null}
      {(onAction || href || secondaryHref) ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {onAction ? <button type="button" onClick={onAction} className="btn-primary">{actionLabel || "Try again"}</button> : null}
          {href ? <Link href={href} className="btn-primary">{actionLabel || "Continue"}</Link> : null}
          {secondaryHref ? <Link href={secondaryHref} className="btn-ghost">{secondaryLabel}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
```

## UserMessage — `src/components/UserMessage.jsx`

```jsx
export default function UserMessage({ tone = "error", title, message, onRetry, retryLabel = "Try again", compact = false, busy = false }) {
  const TONES = {
    error: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    warning: "border-yellow-300/25 bg-yellow-300/10 text-yellow-50",
    success: "border-[#00e6e6]/25 bg-[#00e6e6]/10 text-[#d7fbff]",
    info: "border-sky-300/25 bg-sky-300/10 text-sky-50",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border text-left ${compact ? "px-3 py-2" : "px-4 py-3"} ${TONES[tone]}`}>
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      {message ? <p className={`text-sm leading-5 ${title ? "mt-1 text-white/80" : ""}`}>{message}</p> : null}
      {onRetry ? <button type="button" onClick={onRetry} disabled={busy} className="btn-ghost mt-3 h-9 px-3 text-xs">{busy ? "Trying again…" : retryLabel}</button> : null}
    </div>
  );
}
```

## MediaImage — `src/components/MediaImage.jsx`

```jsx
"use client";
const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%2307121d'/%3E%3Ccircle cx='200' cy='200' r='88' fill='%2300e6e6' fill-opacity='.16'/%3E%3Cpath d='M229 114v155a42 42 0 1 1-18-34V146l95-20v109a42 42 0 1 1-18-34V104z' fill='%23a7ffff'/%3E%3C/svg%3E";
export default function MediaImage({ src, alt = "", className = "", ...props }) {
  return <img loading="lazy" decoding="async" src={src || FALLBACK_IMAGE} alt={alt} className={className} {...props} />;
}
```

## BottomSheet — `src/components/BottomSheet.jsx`
Mobile sheet → centered card from `sm`. Overlay `bg-black/70`, panel `glass-panel rounded-t-2xl`, handle `h-1.5 w-12 rounded-full bg-white/25`. Full source in `src/components/BottomSheet.jsx`.

## Skeleton — `src/components/Skeleton.jsx`
`ShimmerBlock` (`animate-shimmer rounded-md bg-white/[0.06]`), `CardGridSkeleton`, `SongRowsSkeleton`, `PlaylistHeroSkeleton`, `HomeFeedSkeleton`. Full source in `src/components/Skeleton.jsx`.

## PlayerDock — `src/components/MusicPlayer/PlayerDock.tsx`

```tsx
export function PlayerIconButton({ label, active, children, className = "", ...props }) {
  return <button type="button" aria-label={label} aria-pressed={active}
    className={`inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10 ${active ? "text-[var(--accent)]" : "text-[var(--text)]"} ${className}`} {...props}>{children}</button>;
}
export function Transport(props) {
  return <div className="flex items-center justify-center gap-1">
    {/* Shuffle, Previous, cyan circular Play/Pause, Next, Repeat — lucide icons 19–24px */}
  </div>;
}
export default function PlayerDock(props) {
  return (
    <div className={styles.dock} data-testid="player-dock">
      <div className="flex min-w-0 items-center gap-3">
        <img src={props.track.thumbnail} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded object-cover" />
        <button type="button" className="min-h-12 min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-[var(--text)]">{props.track.title}</span>
          <span className="block truncate text-xs text-[var(--muted)]">{props.track.channel}</span>
        </button>
      </div>
      <div className={styles.center}><Transport {...props} /><PlayerTimeline /></div>
      <div className={styles.tools}>{/* lyrics, queue, PiP, expand */}</div>
      <div className={styles.mobile}>{/* play, next, expand */}</div>
    </div>
  );
}
```

## ExpandedPlayer — `src/components/MusicPlayer/ExpandedPlayer.tsx`
`<dialog>` max 480×800, navy surface, header “Now playing” / “Queue”, square art, title, timeline, Transport, sleep, volume/PiP.

## PlayerTimeline — `src/components/MusicPlayer/PlayerTimeline.tsx`
`m:ss` + range `accent-[var(--accent)]` + duration, `h-12` hit area.

## QueueEditor — `src/components/MusicPlayer/QueueEditor.tsx`
Upcoming count, undo/clear, 40px thumbs, move/remove, save-as-playlist field.

## playerDock.module.css
Dock: 2-col mobile (track | play/next/expand); `lg` 3-col track | transport+timeline | tools. Dialog: `min(100%, 480px)`, `min(100dvh, 800px)`, radius 8px, 70% backdrop; full-bleed under 480px.
