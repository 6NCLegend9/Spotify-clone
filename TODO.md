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
- [ ] Cosmetic: `/artist/...?_rsc=` prefetch requests log `net::ERR_ABORTED` on rapid nav (harmless Next prefetch cancels) — consider `prefetch={false}` on long artist lists.

## UI/UX & Design System Standardization
- [~] Color tokens: `:root` already defines `--accent/--navy-*/--text/--muted` + high-contrast mode, BUT many components hardcode the same values as Tailwind arbitraries (`#00e6e6`, `#9aa8b5`, `#07121d`). Map these to `theme.extend.colors` tokens in `tailwind.config.js` and replace literals. (Large sweep — staged, needs sign-off.)
- [~] Geometry: radii/padding are mostly consistent via `.card/.btn-*/.icon-btn`; a few inline `rounded-*`/padding one-offs. Consolidate into utility classes. (Staged.)
- [x] Header/sidebar/player heights are centralized via `--topbar-h`, `--sidebar-w`, `.app-navbar`, `.player-dock`.

## Mobile Gestures & Responsive Breakpoint Bugs
- [x] Long-press on tracks/cards/list items triggered native text-selection/callout — added `-webkit-touch-callout: none` + `user-select: none` on interactive surfaces in `globals.css`.
- [ ] Tap targets < 44px: `.icon-btn` is safe (its `min-width/min-height: 2.75rem` clamps `h-9`/`h-8` overrides back to 44px). Remaining sub-44px cases are small text controls — category chips (`py-1.5`), follow pills (`py-0.5`), "Show artists & playlists" toggle. Bump their vertical hit area.
- [x] Home/Library/Search reflow correctly at 375/768/1440 (verified live).

## Functional & Interactive Control Fixes
- [ ] Validate (no-trigger) the "Permanently Delete My Data" button disabled styling + confirm-guard.
- [x] MediaSession (play/pause/next/prev/seek) wired for both players.
- [x] Crossfade/fade + Smart Shuffle functional (YouTube dual-deck).
- [ ] Note: Web Audio EQ/GainNode only affects the direct-`<audio>` path, never YouTube iframe audio (platform limitation, not a bug).

---

### Notes / constraints
- Web Audio API cannot process YouTube-iframe audio; EQ/graph work only applies to owned/CORS audio.
- Full color-token migration + geometry consolidation are broad, regression-prone sweeps — done in reviewed batches, not one blind pass.
