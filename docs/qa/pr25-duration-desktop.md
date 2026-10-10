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

## Dead-code cleanup verification — 2026-10-10

The approved artist/release UI, active Redux player, catalog/provider metadata,
Discord desktop boundary and signed GitHub release workflow remain in use. Shared
palette values are unchanged. The cleanup removes orphan components/helpers,
unused actions and selectors, the unintegrated audio-engine prototype and its
isolated tests, GhostFibers and its tests, template assets, and the obsolete Blob
publishing commands. Six root dependencies and the desktop Blob dependency were
removed with matching lockfiles; surviving package versions did not change.

Useful code is retained or connected: responsive-policy tests still check layout
contracts, and private playlist metadata now uses the existing privacy-safe share
helper. Artist banner markup no longer emits an undefined class; release queue
controls use the existing 44px target pattern. High-contrast borders retain their
existing white value instead of being overwritten by a neutral border shorthand.
Artist video rails now use the shared duration formatter: the new browser check
first reproduced `3723.9` as `62:03`, then verified `1:02:03` and unknown `—` after
the fix.

Node 22 `npm run check` passed on the final implementation: 657 tests, lint,
TypeScript and production build. The lower test count reflects removal of tests
for retired implementations. The desktop suite passed 58 tests, and canonical
web/native contract generation produced no diff. Independent review found no
mistaken removals or dependency/CSS regressions; the post-cleanup scanner's only
unused-file/dependency flags were the retained bundler stub and Next.js `sharp`.

Affected browser coverage across Chromium desktop and mobile Safari recorded 81
passing cases and three intentional project skips. Six final serial reruns passed
against the final build, including banner classes, video-rail durations and media
controls. Initial WebKit launch failures were environment failures: locally
extracted libraries had to be linked into its tool bundle, and the host-package
check was skipped only after an actual WebKit launch succeeded. One Chromium
catalog readiness timeout and one expanded-controls auto-hide race occurred under
concurrent load; both passed with unchanged timeouts and interaction code in the
final isolated run. The trace showed the delayed click exceeded the existing
6.5-second hide timer. These initial failures are not counted as passes.

Browser and Electron catalog/player coverage uses controlled fixtures. It does
not establish live YouTube audio, manual Windows installation, signed-update
delivery or production deployment. This cleanup does not merge or deploy PR25.

The final actual Electron smoke passed artist/release pages, durations, collection
queues and player persistence against the rebuilt renderer. Its artwork fixture
now serves the existing local icon for exact YouTube image hosts. This fixes an
initial proxy failure for fake video-ID thumbnails without weakening console or
page-error checks; remote artwork delivery is outside this fixture verification.

Desktop CI follow-up: the first cleanup-head Linux smoke reached real API handlers during service-worker takeover and failed the Popular assertion. The fixture smoke now uses Chromium’s `Network.setBypassServiceWorker` before controlled navigation so even an already controlling worker cannot bypass catalog/session fixtures. Actual Electron smoke passes at `http://127.0.0.1:3003`; smoke contract and lint pass. Production service-worker behavior is unchanged and this fixture smoke does not verify it. Fresh GitHub CI is required for confirmation. Windows package CI at cleanup commit `8629dfe` passed installer construction, artifact verification, and packaged runtime against its pinned production renderer; this does not verify signed updates or deploy the PR renderer.
