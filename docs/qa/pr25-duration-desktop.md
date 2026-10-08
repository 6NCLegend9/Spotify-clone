# PR25 duration and desktop verification

Verified on 2026-10-08 using Node 22. PR25 remains stacked on
`fix/pr24-review-repairs`; its existing head is `feat/spotify-artist-profile`.
Merge commit `35e0d86` resolves the current base while retaining the approved
artist catalog, release pages, and playback behavior.

Duration handling retains raw and parsed YouTube listing badges, upgrades
unknown duplicate durations without replacing IDs, credits, or ordering, and
adds duration to search responses. Official snippet-only search uses one
bounded batch metadata request for missing lengths. Failure or timeout leaves
search usable. Complete availability and embedding metadata stays cached.
Artist Popular rows can reuse a known duration from the same channel video.
Collection pagination also retains later known lengths. Shared formatting
floors seconds, supports hours, and displays an em dash for unknown totals.

## Checks

- `npm run check`: 755 unit tests passed; lint, TypeScript, and production build passed.
- `npm --prefix desktop test`: 58 tests passed.
- Desktop server/renderer contract tests: 35 passed; generated contract check passed.
- Artist catalog/profile/release, artist navigation, PR24 credit navigation,
  playback, and playlist browser regressions: 227 distinct project/test cases
  passed and 8 intentional skips across Chromium, Firefox, WebKit, mobile
  Chrome, and mobile Safari. Environment launch failures and concurrent output
  directory collisions were recovered with isolated output directories;
  the latest result for each case is recorded here. The final build reran
  40 affected cases across all five browser projects, all passing.
- `DISPLAY=:99 HEYKASA_DESKTOP_SMOKE_URL=http://localhost:3100 npm --prefix desktop run smoke:renderer`:
  actual Electron 44.4.1 passed against the production Next.js build with the
  real preload bridge and no renderer Node access. Covers every artist section,
  Discography filters, known/unknown/hour durations, artist and release queues,
  route persistence, reload restoration, and desktop overflow.

The Electron and browser catalog/player checks use deterministic fixtures.
They establish renderer and native integration behavior, not live YouTube
audio playback. Windows installer packaging, Authenticode, and packaged Windows
runtime were not verified in this Linux workspace.

## Production evidence and deployment boundary

The production alias `https://haykasa.vercel.app` was READY at main commit
`8bca882525472337525c009fcc40cd567f862a7f` (PR24). A live 2Pac channel request
returned 74 tracks with duration zero; live search returned 20 results without
duration fields; `/api/artist-sections` returned 404. These are read-only live
catalog probes of the older deployment, not playback verification of PR25.

Installed clients load this production renderer. PR25 improvements require a
production deployment after review. No merge or production deployment was
performed.

## Combined desktop recovery follow-up

At the owner's request, PR26's availability message and production recovery
procedure were moved into this branch. Root desktop commands now expose locked
dependency installation, native tests, Windows packaging, and installer build.
The development launcher runs npm's JS CLI through Node rather than directly
spawning `npm.cmd`, avoiding Node 22's Windows command-file restriction.
Windows Package CI covers the launcher tests. The combined `npm run check`
passed 757 tests, lint, TypeScript, and production build; root `desktop:test`
passed 58 native tests. See `desktop-production-recovery.md` for the public
installer/update outage and the separate signed-publication prerequisites.
