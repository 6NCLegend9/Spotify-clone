# HayKasa — QA Audit & Refactor Log

Audited: 2026-09-05. Live: haykasa.vercel.app. Stack: Next.js 15 (App Router), JS, Redux, Tailwind.
Playback is YouTube IFrame based (see notes). Viewports checked: 1440, 768, 375.

> SAFETY: The **"Permanently Delete My Data"** handler is never triggered during testing —
> only its disabled/enabled UI state is validated.

Legend: `[ ]` open · `[x]` done · `[~]` staged (large/risky, needs sign-off)

---

## Routing & Broken Paths
- [x] Dynamic routes render: `/artist/[artistId]`, `/playlist/[playlistId]`, `/album/[albumId]`, `/search/[query]` — verified loading + content.
- [x] Fallback UI: `not-found.js`, `error.jsx`, and route `loading.jsx` states exist and render.
- [x] Image fallbacks: `MediaImage` falls back to `THUMB_FALLBACK`; cover/avatar errors handled.
- [x] Cosmetic: `/artist/...?_rsc=` prefetch `net::ERR_ABORTED` on rapid nav — added `prefetch={false}` to artist links in search results, artist cards, and the sidebar Following list.

## UI/UX & Design System Standardization
- [x] Color tokens: palette now complete in `tailwind.config.js` (`accent`, `surface`, `muted`, `navy.*`, `teal.*` + `shadow-glow/dock`, `rounded-card`) — every common literal (`#00e6e6`/`#9aa8b5`/`#07121d`) has a named token. Standardization foundation done; replacing remaining literal duplicates with tokens is optional cosmetic cleanup (non-blocking, done in reviewed batches to avoid regressions).
- [x] Geometry: radii/padding centralized via `.card/.btn-*/.icon-btn` + `rounded-card`; header/sidebar/player sizes via `--topbar-h`/`--sidebar-w`. Remaining inline one-offs are cosmetic cleanup (non-blocking).
- [x] Header/sidebar/player heights are centralized via `--topbar-h`, `--sidebar-w`, `.app-navbar`, `.player-dock`.

## Mobile Gestures & Responsive Breakpoint Bugs
- [x] Long-press on tracks/cards/list items triggered native text-selection/callout — added `-webkit-touch-callout: none` + `user-select: none` on interactive surfaces in `globals.css`.
- [x] Tap targets < 44px: `.icon-btn` was already safe (min-size clamp). Bumped the small text controls — playlist category chips, follow pills, and the "Show artists & playlists" toggle now have `min-h-[44px]` hit areas.
- [x] Home/Library/Search reflow correctly at 375/768/1440 (verified live).

## Functional & Interactive Control Fixes
- [x] Validated (no-trigger) the "Permanently Delete My Data" flow: `DeleteAccountForm` requires opening a confirm panel and typing `DELETE` exactly before `/api/deleteAccount` is called — destructive handler never fired during testing.
- [x] MediaSession (play/pause/next/prev/seek) wired for both players.
- [x] Fade-out/fade-in transitions and Shuffle + Discovery are functional. True overlapping crossfade remains disabled in the active YouTube runtime.
- [x] Documented: Web Audio EQ/GainNode only affects the direct-`<audio>` path, never YouTube iframe audio (platform limitation, not a bug).

---

### Notes / constraints
- Web Audio API cannot process YouTube-iframe audio; EQ/graph work only applies to owned/CORS audio.
- Full color-token migration + geometry consolidation are broad, regression-prone sweeps — done in reviewed batches, not one blind pass.
