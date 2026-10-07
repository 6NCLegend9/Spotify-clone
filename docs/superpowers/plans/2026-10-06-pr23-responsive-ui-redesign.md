# HayKasa Responsive UI Redesign Implementation Plan

> **Execution:** Implement sequentially by task. Complete baseline evidence before modifying each surface, then run its targeted validation before proceeding. No required execution-skill dependency.

**Goal:** Redesign all existing website surfaces for device-appropriate use while preserving production behavior.

**Architecture:** Reuse the existing shell, component contracts, semantic variables and responsive policy. Consolidate presentation responsibilities in existing stylesheets and update presentational JSX in place. Keep providers, handlers, state, effects, routes, persistence, and media ownership unchanged.

**Tech Stack:** Next.js 15, React 18, Tailwind 3, CSS Modules, existing Playwright and Node tests.

**Spec:** docs/superpowers/specs/2026-10-06-pr23-responsive-ui-redesign-design.md

## Global Constraints

- Baseline 8876c14; local branch feat/pr23-responsive-ui-redesign. Intended PR is next available number, preferably #23; do not merge or deploy.
- Production edits: CSS and presentation markup/classes only. Preserve handlers, props contracts, effects, providers, Redux actions/selectors, routes, requests, playback ownership, and persistence.
- No changes to API/backend, responsivePolicy.mjs, auth behavior, queue/radio/search algorithms, Electron runtime/updater, database, configuration or dependencies.
- Test-only changes, deterministic fixtures, baseline/after screenshots, and design or PR documentation are authorized when they do not alter production behavior.
- Existing appearance preferences remain authoritative. Default opaque surfaces must not override selected backgrounds/effects; foreground contrast stays required.
- Existing fonts only; body 16px, supporting 14px, metadata at least 12px. Spacing 4/8/12/16/24/32px; radii 8/12/16px.
- Essential touch targets >=44px. Text contrast >=4.5:1; large text/interface indicators >=3:1. Respect reduced motion, safe areas, long text and RTL.
- Preserve existing phone/landscape and pointer policy; fix shell CSS 1180px threshold to 1181px, not the policy utility.
- Preserve media mounting and iframe geometry contracts; no provider-hiding redesign.
- Each task changes only the applicable listed files; inspect their callers before edits. If a required behavior needs code outside this boundary, report it separately.

## Review Focus

1. Persisted custom accent/background: text, focus and controls stay readable without overwriting settings (Task 1).
2. Fine/coarse pointer at 767/768 and 1180/1181: navigation/player agree with current policy; rotation preserves access (Tasks 1 and 4).
3. Long multilingual titles and 200% zoom: important controls remain reachable and content reflows (Tasks 2 and 3).
4. Restored playback while navigating: presentation changes never remount provider or discard queue (Task 4).
5. Embed and special-purpose routes: app styling does not leak into embed or game content (Task 5).

## File responsibilities

- src/app/globals.css: semantic tokens and shared application presentation; replace verified superseded rules, do not append a competing skin.
- src/components/Layout/KasaShell.module.css: consolidate existing shell rules and navbar treatment, reconcile the exact threshold.
- Existing player CSS modules: dock, timeline and media-view presentation only.
- Existing component/page JSX: presentation classes, wrappers and semantic attributes only; preserve executable expressions and contracts.
- e2e/ui-redesign.spec.js and e2e/fixtures/ui-redesign.js: new deterministic layout coverage and fixtures, modeled on existing API interceptions and playback seeding.
- docs/qa/pr23-ui-redesign.md and docs/qa/pr23-ui/: observed validation ledger and selected baseline/after images.

## Task 1: Shell, appearance and responsive foundations

**Files:** Modify src/app/globals.css, src/components/Layout/KasaShell.module.css, src/components/Navbar.jsx, src/components/Sidebar/Sidebar.jsx, src/components/Sidebar/libraryList.module.css, src/components/Layout/DesktopNowPlayingPanel.jsx, src/components/Layout/MobileTabBar.jsx, src/components/Layout/CreateHub.jsx. AppShell.jsx only if presentation attributes/classes are necessary. Create e2e/ui-redesign.spec.js, e2e/fixtures/ui-redesign.js, docs/qa/pr23-ui-redesign.md.

**Interfaces:** Consume existing .app-shell, data-phone/data-has-track/data-player, --sidebar-live-w/--right-panel-live-w, --appearance-accent/--appearance-play-ink and existing nav handlers unchanged. Produce the same selectors and semantics with coherent presentation.

- [ ] Establish local baseline with supported Node 22 if available; use npm ci without modifying lockfile or package manifests. Record unavailable runtime/network/browser dependencies as blockers.
- [ ] Start existing development server; capture default/custom appearance at phone, tablet, desktop and 640x520. Record actual defects and console errors. Fixture data must use existing API shapes; no production endpoint changes.
- [ ] Implement test-only installUiFixtures(page, options) using current auth/settings payloads and restoreUiPlayback(page) using the existing playback snapshot schema. Match appearance fixtures to actual appearanceSlice persistence before seeding; do not invent keys.
- [ ] Add tests shell-reflows-at-policy-boundaries and custom-appearance-is-preserved. Assert document and app content scrollWidth <= clientWidth+1; visible navigation/search controls have positive in-viewport bounds; changing viewport never yields two visible primary navs; expected layout matches responsiveLayoutForViewport. Verify seeded settings survive navigation/reload and assert contrast for sampled text/control pairs.
- [ ] Run these checks before edits; record only observed failures as baseline RED, otherwise retain passing protection. Command: npx playwright test e2e/ui-redesign.spec.js --project=chromium-desktop.
- [ ] Replace default tokens and shell/nav styles in their existing owners; use 1181px for wide shell, preserve fine-pointer and phone-landscape paths. Preserve panel resizing/persistence and all controls. Do not override appearance props.
- [ ] Rerun targeted tests; manually check keyboard resize, skip links, navigation drawer, focus visibility and safe areas. Capture after images and commit reviewed presentation changes.

## Task 2: Home and search

**Files:** Modify src/components/Homepage/Home.jsx, HomeHeader.jsx, QuickAccessGrid.jsx, FeaturedRelease.jsx, HomeRail.jsx, MixCard.jsx, WeekOnKasa.jsx, ThisDayOnKasa.jsx, MoodBar.jsx; src/components/Search/BrowseAll.jsx; src/components/Searchbar.jsx; src/app/search/[query]/page.jsx; src/components/RecommendationCard.jsx, RecommendationPlaylistCard.jsx, HorizontalRail.jsx, SongsList.jsx; corresponding existing globals.css sections. Test e2e/ui-redesign.spec.js, e2e/discovery.spec.js, e2e/playlist-browsing.spec.js, e2e/home-loading.spec.js.

**Interfaces:** Preserve Home/useHomeFeed rendering data, quick-item queue/queueIndex, result links and existing click handlers. Shared cards continue to consume unchanged props.

- [ ] Add home-search-long-content-reflows: seed long Latin/Hebrew titles and loading/empty/error responses; assert no page overflow at 320/390/768/1440 widths, readable wrapping/truncation, visible retry controls and touch access to card actions.
- [ ] Run targeted new and existing tests before edits; record baseline evidence.
- [ ] Apply the new type/spacing/card hierarchy, restrained artwork-led home sections, responsive grids and search layout. Preserve section order, datasets, filters and play-versus-open semantics.
- [ ] Run targeted suites; verify search input retains focus and entering results while playback is restored does not discard playback state. Check reduced motion and keyboard card/menu access; capture before/after and commit.

## Task 3: Library and collection detail

**Files:** Modify src/components/Library/LibraryView.jsx, PlaylistDetail.jsx, PlaylistTrackRow.jsx; src/components/Sidebar/LibraryList.jsx; src/components/PlaylistCover.jsx, PlaylistItemMenu.jsx, AddToPlaylistButton.jsx, LikePlaylistButton.jsx, ArtistProfile.jsx; presentation in src/app/library/page.jsx, library/liked/page.jsx, library/playlist/[playlistId]/page.jsx, playlist/[playlistId]/page.jsx, myPlaylists/[playlistId]/page.jsx, youtube-playlist/[id]/page.jsx, album/[albumId]/page.jsx, artist/[artistId]/page.jsx, mix/page.jsx, mix/[id]/page.jsx, favourite/page.jsx, following/page.jsx, recently-played/page.jsx. Corresponding globals.css sections. Tests e2e/ui-redesign.spec.js, e2e/playlist-virtualization.spec.js, e2e/playlist-browsing.spec.js.

**Interfaces:** Keep collection routes, track identities, virtual-list measurement assumptions and row handlers unchanged. Do not modify VirtualizedPlaylistTrackList.jsx algorithms.

- [ ] Add collection-controls-survive-reflow: large fixture playlist, long title/artist, empty library and error detail. Assert visible rows fit content bounds, context menus fit viewport, header actions are accessible, and scrolling reaches final rows without losing row actions at 320px/200% zoom.
- [ ] Run baseline tests; preserve virtualization heights or, if style requires a height change, use its existing presentation-compatible row-height input only after inspecting callers. Algorithm changes require separate authorization.
- [ ] Redesign collection headers, grids, rows, metadata and menus; retain membership, sharing, collaborator, delete and playback behavior.
- [ ] Run existing virtualization/browsing tests and new checks, verify keyboard menus and touch access, capture images and commit.

## Task 4: Player, queue, lyrics and media surfaces

**Files:** Modify src/components/MusicPlayer/playerDock.module.css, playerTimeline.module.css, mediaPresentation.module.css; presentation-only edits in PlayerDock.tsx, PlayerTimeline.tsx, ExpandedPlayer.tsx, MediaPresentation.tsx, PlayerVolume.jsx, QueueEditor.tsx, Lyrics.jsx, SyncedLyrics.jsx; src/components/BottomSheet.module.css and applicable globals.css rules. Tests e2e/ui-redesign.spec.js, e2e/playback.spec.js, e2e/theater-controls.spec.js, e2e/youtube-sanitization.spec.js, e2e/youtube-provider.spec.js.

**Interfaces:** Retain player prop types, transport callbacks, deck DOM, existing queue/lyrics/video entry points, .app-player z-index 30, .app-tabbar 40, full player 70 and modal boundaries. Existing provider/sanitizer code is untouched.

- [ ] Add player-controls-fit-compact-window, player-survives-rotation, restored-provider-survives-navigation, and media-dialog-controls-stay-reachable. Seed existing playback fixture; assert volume/queue/lyrics controls reachable at 640x520, popover fully inside viewport, phone expand/collapse reachable, paused queue persists across navigation, iframe identity remains stable, landscape dismiss/transport controls stay inside visible bounds.
- [ ] Run before changes and record observed failures. Preserve real-provider smoke separately from mocked-provider results.
- [ ] Restyle dock, timelines, dialogs, lyrics/queue rows and media chrome. Keep mounting, events, state and iframe dimensions untouched; fit landscape through CSS/reflow only.
- [ ] Run new tests and existing playback/theater/provider suites, inspect keyboard/touch flows and no-track/fullscreen states. Mark real playback blocked when provider access is unavailable. Capture images and commit.

## Task 5: Forms, settings and additional routes

**Files:** Presentation-only edits to src/app/login/page.jsx, signup/page.jsx, reset-password/page.jsx, reset-password/[token]/page.jsx, resend-verification/page.jsx, verify-email/[token]/VerifyEmailClient.jsx, settings/page.jsx, open-desktop/page.jsx, accessibility/page.jsx, privacy/page.jsx, terms/page.jsx, dmca/page.jsx, jam/[code]/page.jsx, arcade/page.jsx, embed/playlist/[playlistId]/page.jsx, not-found.js, error.jsx, loading.jsx; src/components/AppearanceSettings.jsx, AuthMessage.jsx, EmptyState.jsx, UserMessage.jsx, Skeleton.jsx, DesktopAppCard.jsx, SupportDiagnostics.jsx, ListeningInsights.jsx; presentation only in JamInvite.jsx, JamJoinClient.jsx, JamQr.jsx, KasaCrowd.jsx, ArcadeGameSelect.jsx, HowToPlayOverlay.jsx. Applicable globals.css rules. Tests e2e/ui-redesign.spec.js, e2e/auth.spec.js, e2e/routes.spec.js.

**Interfaces:** Preserve field names/validation/submission, auth redirects, permission-gated rendering, Jam events, game canvas and embed layout boundaries. Additional route wrappers do not change route behavior.

- [ ] Add forms-feedback-and-special-routes-reflow: loading/errors, long form messages, legal text and embed fixtures at 320/390/768/1440. Assert labels remain associated, submit/retry controls visible, no horizontal overflow, and embedded view contains no app sidebar/player/nav leakage. Verify a game overlay remains dismissible without changing game behavior.
- [ ] Run baseline checks; do not treat deterministic form rendering as real authentication verification.
- [ ] Apply shared form, message, settings-section and reading-page hierarchy, plus compact special-route chrome. Preserve customized appearance UI and all existing legal text.
- [ ] Run auth/routes/new tests; manually check keyboard error recovery, large text and reduced motion. Capture images and commit.

## Task 6: Final validation and pull request

**Files:** Existing test files only where needed for meaningful regressions; docs/qa/pr23-ui-redesign.md, docs/qa/pr23-ui/ images and PR body documentation. No new product scope.

**Interfaces:** Consume all prior tasks' unchanged behavior contracts. Produce an isolated reviewable branch and truthful validation report.

- [ ] Review every production hunk: reject handler/state/effect/data/route/provider changes; confirm no package/config/backend/native diff. Use git diff 8876c14 --stat, git diff --check and full diff inspection. Do not remove CSS merely because static search misses dynamic consumers.
- [ ] Run npm test, npm run lint, npm run typecheck, npm run build. Success means observed exit 0; document baseline failures separately. Do not patch unrelated logic to obtain passing results.
- [ ] Run npx playwright test across configured engines with the server available. Exercise additional 320/360/390, 844x390 landscape, 768/1024 touch, 1280/1440/1920 desktop and 640x520, plus 767/768/1180/1181 boundaries; check 200% zoom, RTL, safe areas, focus, error/empty/offline and contrast.
- [ ] Verify repository-generated screenshots/fixtures contain only deterministic public test content; record emulator versus physical/native coverage accurately. Report errors, unsupported access and missing checks.
- [ ] Prepare PR title/body around final scope with baseline/head, before/after images, validation, limitations and rollback. Check current main and next available PR number through GitHub before publishing; never promise #23 if already allocated.
- [ ] Push the isolated branch and create a draft PR using the connected GitHub tools when validation evidence is recorded. Do not merge or initiate production deployment. Inspect PR diff and available checks; report exact PR URL and remaining blockers.

## Self-review and execution checkpoint

Coverage: Tasks 1–5 cover every spec screen group; Task 6 owns final evidence. Production interfaces remain unchanged throughout. The five review conditions each have explicit regression coverage in their owning task. Broad browser suites run once at final verification unless failures or later changes require reruns.

User approved the plan subject to incorporated documentation corrections on 2026-10-06. Execute sequentially in this session with a final branch review. All commands above are planned, not passing claims.

## Execution status — 2026-10-06

Shared presentation redesign is implemented; see docs/qa/pr23-ui-redesign.md for observed commands, root cause, screenshots and coverage. Production JS/TS edits were structurally verified as className-only. Unit (692), lint, typecheck, build and targeted Chromium desktop/mobile suites passed. Firefox/WebKit/Safari, physical/native devices, live provider playback and the remaining manual acceptance items are unverified and must remain review gates. Checklist items above describe the intended acceptance workflow; unchecked composite/manual items must not be interpreted as completed. Publish as a draft for review; no merge or deployment.
