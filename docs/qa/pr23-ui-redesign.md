# PR23 UI verification ledger

Baseline: 8876c142211bef19b1b6f016ba0170cd3a407a8f (PR22). Implementation branch: feat/pr23-responsive-ui-redesign. Publication status is recorded by the draft PR; GitHub allocates its number.

## Verified discovery

- Second global shell presentation layer lives in KasaShell.module.css, imported by Navbar.
- Shell five-column breakpoint starts at 1180px; shared responsive policy uses 1181px.
- Older globals.css 1100–1359px rule hides the right panel using !important, conflicting with shell presentation.
- AppearanceSync reads the Desktop appearance bridge; tests must not invent appearance localStorage keys.
- Existing playback/virtualization behavior and provider mounting are outside production edit scope.

## Environment

- npm ci --ignore-scripts completed without dependency-manifest changes; initial runtime Node 24 differed from package engine Node 22.
- Installed an isolated Node 22 runtime for subsequent checks; no product dependency changes.
- Standard Playwright browser download failed with a truncated/invalid archive.
- Connected browser access to localhost was blocked.
- Chromium from the reputable @sparticuz/chromium npm package is used as an isolated test runner fallback, with browser web security retained. It is not the standard bundled Playwright browser.
- Server and browser must run together inside the same execution network namespace.

## Results

- Baseline: appearance persistence, compact volume/track navigation and narrow forms passed. The first navigation test had an ambiguous locator (two navigation regions share the same label); corrected the test selector and reran before product edits.
- Baseline RED: at 1181px the right panel was hidden; browser reproduced the stale !important CSS conflict.
- Initial shell revision: all 4 new Chromium UI tests passed, including the 1181px panel regression, custom accent navigation/reload, compact 640x520 volume and track continuity, and public/forms at 320px.
- Updated release gate removes an assertion requiring the obsolete 1100–1359px breakpoint and rejects blanket !important panel hiding; the behavioral gate is the browser boundary test.
- Unit tests on Node 22: 692 passed, 0 failed after that test-only correction.
- ESLint: passed after the collection/search/form class changes.
- TypeScript AST comparison against baseline: all 10 changed product JS/TS files differ only in JSX className attributes (comments ignored); executable logic unchanged.
- Typecheck (Next typegen and tsc --noEmit --incremental false): exit 0.
- Production build with Node 22 and NEXT_BUILD_DIR=.next-check: exit 0; BUILD_ID produced and the generated build served the final browser suites.
- Production Chromium desktop shell/visual/playlist browsing run: 16 passed.
- Production Chromium desktop + mobile playback/theater/500-row virtualization/new UI/visual run: 50 passed, 4 skipped by existing device-specific conditions.
- Earlier development-server run was inconclusive after its server exited; trace output collisions affected concurrent runs. Final runs use production mode and isolated output.
- Firefox/WebKit attempt: unavailable browser executables after standard browser download failed; not counted as UI failures.
- Real YouTube playback is not validated: deterministic playback suites use their existing fixtures.
- Final route/auth/settled-visual run and doubled content-scale/RTL check are recorded below.
- Physical device and native packaged Electron validation have not been performed.

## Iceberg root-cause summary

The visible missing panel at desktop widths came from overlapping presentation layers: the shared policy used 1181px, the shell CSS used 1180px, and an older global rule force-hid the panel through 1359px. The fix removes that obsolete override and aligns the shell CSS to 1181px while retaining responsivePolicy.mjs, provider identity, queue logic and persisted appearance settings.

## Scope and rollback

Production changes are existing CSS plus JSX class names in ten files. No API, state, effect, handler, persistence, provider, native runtime, dependency or configuration code is changed. Revert the UI commit to restore the baseline presentation; screenshots and test-only fixtures do not alter production behavior.

## Evidence limits

Screenshots use deterministic test account/data and local image assets. Baseline images are samples recovered from a baseline trace and are not a full before-state matrix. Content scale 2 uses CSS zoom as a stress check; it does not claim native browser zoom coverage. Full custom-background contrast, physical phones, packaged Electron, real authentication/backend, all offline/error states and native 200% browser zoom remain manual acceptance checks. The design/plan checklists are acceptance intentions, not claims that every unchecked manual item was performed.

### Route-run investigation

The first combined auth/routes run ended with exit 1 without an aggregate report; it is inconclusive. An Arcade trace shows a server-render digest and the test server reports NextAuth NO_SECRET. ArcadeLayout calls getServerSession on the server, which browser API fixtures cannot replace. A rerun with deterministic test-only NEXTAUTH_SECRET/NEXTAUTH_URL passed all 7 existing desktop auth/routes tests (29.1s). The missing test-server auth configuration caused the Arcade render failure; no auth or game code was changed. Arcade remains permission gated; this route smoke does not claim real privileged-game play.

### Final observed checks

- Settled visual/new UI run in desktop and mobile Chromium: 22 passed, 2 device-specific skips (1.4m), including RTL and doubled CSS content scale.
- Existing auth/routes desktop rerun with test-only auth runtime configuration: 7 passed (29.1s).
- Final AST boundary and git diff --check passed. Lint rerun passed.
- Production source is unchanged from the successful unit/typecheck/build checkpoint; subsequent edits are tests, evidence and documentation.

### Screenshot matrix

| File | Context |
| --- | --- |
| pr23-ui/baseline-search-320.jpg | Baseline narrow search trace sample |
| pr23-ui/after-phone-search.png | 390x844 desktop-pointer viewport |
| pr23-ui/after-phone-landscape.png | 844x390 desktop-pointer viewport |
| pr23-ui/after-tablet-library.png | 1024x768 desktop-pointer viewport |
| pr23-ui/after-desktop-home.png | 1440x900 desktop-pointer viewport |
| pr23-ui/after-wide-settings.png | 1920x1080 desktop-pointer viewport |
| pr23-ui/after-compact-player.png | 640x520 desktop-pointer viewport |
| pr23-ui/after-narrow-login.png | 320x740 desktop-pointer viewport |

Both pointer contexts also ran the behavioral visual matrix. The checked-in images are the desktop-context samples; coarse-pointer phone rotation/provider identity is covered by the existing mobile playback suite.

## October 7 owner review follow-up

Requested fixes: collapse empty desktop player space (including the Now Playing panel), align navbar controls, include the built-in Liked Songs collection in library views, retain duration in compact playlist columns, and dim unavailable saved songs while preventing play/queue actions.

Root causes: fixed 90px shell row; inherited named navbar grid areas; duration hidden below a 640px content width; Liked Songs omitted from playlist/liked filters and sidebar list; successful video-details responses dropped missing saved IDs during hydration.

This follow-up expressly includes minimal behavior needed by the owner's unavailable-song request: client hydration retains omitted IDs as unavailable placeholders; row play/queue actions are disabled; collection queues exclude these known-unavailable rows. It also adjusts built-in library item inclusion. This supersedes the initial className-only boundary for those specific changes. No backend, provider lifecycle, radio algorithm, persisted playlist mutation or native code is changed.

Unavailable detection here means a saved ID omitted by a successful details response, or an explicit unavailable/playable=false track flag. Transient request errors remain errors, not unavailable-song classifications. Region/account-specific playback failures are not predicted by metadata alone; no live provider verification is claimed. Unknown durations remain an em dash rather than fabricated time.

Follow-up validation (Node 22): 694 unit tests passed; lint, typecheck, production build and diff whitespace checks passed. Desktop shell/visual/playlist/500-row suite exited 0 with the runner recording passed and no failed tests (23 cases). Final desktop/mobile playback/theater/virtualization/review run: 36 passed, 3 device-specific skips, 1 stale test-locator failure. The trace showed the mobile compact header had its existing Show queue control while the test requested Queue only; the test now accepts both existing labels. The affected mobile case reran and passed (6.7s). No production media component changed to resolve that test mismatch.

Updated screenshots show the collapsed empty desktop player, aligned phone header and built-in Liked Songs. Missing-video placeholders are opt-in for playlist details; other hydration callers retain their previous omission behavior. Firefox/WebKit/native/live-provider limitations from the initial ledger still apply.

The final built-in Liked Songs/unavailable rows/duration/player-appearance check passed again on the final build (5.0s). Screenshot: pr23-ui/after-unavailable-playlist.png. Playable entries retain their duration and actions; the unavailable entry stays in order with dimmed text/artwork and disabled playback.

## October 7 artist-navigation follow-up

The owner authorized artist navigation as the first item in the next review: each credited artist should open their own HayKasa artist page, including featured artists. Artist-profile design is a separate next step. Work started from PR23 head cf9d8303367aa8e077cf6e3d4a0b31fae3ca4248; the branch and draft PR already exist at this checkpoint.

### Iceberg investigation and change

The existing shared link only accepted one uploader name and a channel ID. Some video/playlist/fallback mappings discarded that ID, playback snapshots discarded structured artist arrays, and other song surfaces rendered plain text or placed artist text inside a play button. The owner's title-credit example therefore displayed the upload channel instead of the primary and featured performers. Song-menu gestures also intercepted link context menus, and player/queue overlays could cover the destination after navigation.

The shared renderer now uses separate native links for structured artist credits, preserves each valid channel identity, and handles common title `feat.`/`ft.` credits when structured metadata is absent. It deliberately preserves band names containing commas, `&`, or `and`. Title inference is best effort; the upstream provider does not supply complete authoritative performer credits for every upload.

Known identities go directly to `/artist/<channelId>?name=<encoded name>`. Missing identities use an on-demand `/artist?name=...` lookup through the existing channel-search API. A single exact normalized match opens the existing artist profile; ambiguous or non-exact matches require a choice, failed requests are retryable, and empty results offer a search recovery link. Rendering a long playlist does not launch per-row channel lookups.

The change retains uploader identity in the existing API projections and fallback mappings and stores only bounded artist names/validated channel IDs in the optional playback-snapshot field. It separates artist links from play buttons, preserves native link-menu/modifier behavior, and uses existing dismiss callbacks for player and queue dialogs. An unavailable placeholder's reason is now plain text in a separate field rather than a fake artist credit.

### Observed validation

- RED: metadata and snapshot regressions reproduced missing channel IDs and artist arrays; the browser reproduced the missing featured-artist link.
- RED: a song context-menu gesture prevented the artist link's native menu. The shared gesture exclusion fixes this case.
- RED: queue-dialog artist navigation left the dialog mounted over the artist destination. The existing close callback now handles a normal artist-link activation.
- Final Node 22 `npm run check`: exit 0; 703 unit tests passed, ESLint passed, Next type generation/TypeScript passed, and the production build generated all 66 pages.
- Before the queue-dialog correction, the focused desktop/mobile artist and owner-review run recorded 19 passed, one intentional desktop skip for the mobile-only sheet test, and no failures (37.7s).
- Final production desktop/mobile Chromium run after the queue-dialog correction: exit 0; the complete Playwright JSON report records 60 passed, four device-specific skips, zero unexpected failures, zero flaky tests, and no report errors (138.9s). Each project recorded 30 passes and two skips. This includes artist navigation, owner-review regressions, playlist browsing, playback, theater controls, and 500-song virtualization; the runner's final status is passed with no failed tests.

Artist browser fixtures exercise the real application router, components, playback snapshot, and provider mounting path, while isolating remote APIs and the YouTube player. Checks cover separate destinations, refresh restoration, keyboard activation/Back, unchanged queue/current song, one mounted provider with no destroy on navigation, no accidental row playback, phone-sheet dismissal, ambiguous/retry/empty lookup states, and 320x740, 640x520, and 844x390 overflow/focus checks. They do not establish live YouTube/channel correctness or physical-device behavior.

Screenshots: `pr23-ui/after-artists-desktop.png` (1440x900, desktop pointer) and `pr23-ui/after-artists-phone.png` (Pixel 7 emulation, coarse pointer). Both show deterministic primary/featured credits with distinct links; artist/channel data is a fixture.

### Scope, remaining gates, and rollback

This explicitly authorized navigation follow-up extends the initial presentation-only boundary to small metadata projections, an optional artist snapshot field, and the name-lookup route. No provider/radio algorithms, queue-edit logic, authentication, database schema, dependencies, responsivePolicy.mjs, native code, or existing artist-profile implementation is changed. Existing appearance preferences remain authoritative. Reverting this follow-up restores prior navigation; the optional snapshot field is backward compatible and ignored by older clients.

The production dependency audit remains a separate blocking gate: `npm run audit:production` exited 1 with two high-severity findings in the unchanged dependencies, `sharp` and `source-map-js`. No audit suppression or dependency upgrade is included in the artist-navigation change. Chromium uses the previously documented isolated runner fallback. Firefox/WebKit/Safari, physical devices, packaged Electron, live providers, and other manual acceptance limits remain as documented above.
