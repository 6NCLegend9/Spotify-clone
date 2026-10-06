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
