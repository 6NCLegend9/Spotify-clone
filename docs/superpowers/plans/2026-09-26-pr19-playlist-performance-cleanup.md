# PR19 Playlist, Performance, and Domain Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make large playlists scale by mounted rows, turn performance measurements into real regression gates, and remove stale/misleading capability state and documentation.

**Architecture:** Use a dedicated virtualized playlist list for large collections while preserving the existing row component and small-list rendering path. Performance budgets compare repeatable benchmark medians against a committed baseline with tolerance. Legacy settings migrate at boundaries rather than remaining active runtime capabilities.

**Tech Stack:** React 18, @tanstack/react-virtual, Redux Toolkit, Next.js, Playwright, Node benchmark scripts.

**Spec:** `docs/superpowers/specs/2026-09-26-pr19-system-hardening-design.md`

## Global Constraints

- Small playlists must not regress in accessibility or UX.
- Virtualization must preserve keyboard focus, row actions, context menus, active track, filtering, and scroll restoration.
- Performance gates must use stable medians/tolerance, not one noisy run.
- Removing legacy settings must not make old persisted Redux/API/Mongo data crash hydration.

## Review Focus

1. 5,000-track playlist with active track near the end must mount only a bounded window and scroll active track into view.
2. Keyboard focus on a virtualized row action must not disappear during small scroll movements.
3. Filtering a large playlist must rebuild the virtual range correctly and preserve row numbering.
4. Old persisted settings containing removed fields must hydrate without resurrecting unsupported capabilities.
5. CI machine variance must not fail performance budgets for small noise, but a material JS/long-task regression must fail.

---

### Task 1: Introduce real playlist virtualization

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/Library/VirtualizedPlaylistTrackList.jsx`
- Modify: `src/components/Library/PlaylistDetail.jsx`
- Modify: `src/components/Library/PlaylistTrackRow.jsx`
- Modify: `src/app/globals.css`
- Test: `test/playlistRenderPerformance.test.mjs`
- Create: `e2e/playlist-virtualization.spec.js`

**Interfaces:**
- Add dependency: `@tanstack/react-virtual`.
- `VirtualizedPlaylistTrackList({ tracks, activeYoutubeId, removable, liked, onPlay, onRemove, scrollKey })`.
- Use virtualization only when filtered track count >= 200; smaller lists use the existing direct map.

- [ ] **Step 1: Add failing 500/2000/5000-track tests**

Assert:
- mounted `.playlist-track-row` count stays below 100 for 5,000 tracks;
- first and final tracks are reachable;
- active track can be revealed;
- remove/context/queue controls work;
- filtering changes virtual count correctly.

- [ ] **Step 2: Add @tanstack/react-virtual and implement the list**

Use 66px estimated row height plus overscan. Keep semantic container/list labeling and stable track keys.

- [ ] **Step 3: Preserve focus and scroll restoration**

When a focused row remains within the overscan range, scrolling must not remount it. Persist/restore scroll offset per playlist id via the existing component lifecycle rather than global account-agnostic storage.

- [ ] **Step 4: Remove paint-only assumptions**

Keep `content-visibility` only where it still helps small-list rendering; tests must prove virtualization by mounted row count rather than CSS presence.

- [ ] **Step 5: Verify**

Run Playwright Chromium, WebKit and mobile playlist suites.

- [ ] **Step 6: Commit**

Commit message: `perf: virtualize large playlist track lists`

---

### Task 2: Add enforceable performance regression budgets

**Files:**
- Create: `scripts/performance-baseline.json`
- Create: `scripts/performance-budget.mjs`
- Modify: `scripts/benchmark-dev.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/PERFORMANCE_REVIEW.md`
- Test: `test/performanceBudget.test.mjs`

**Interfaces:**
- Benchmark writes machine-readable metrics.
- `evaluatePerformanceBudget({ baseline, current, relativeTolerance, absoluteFloors }) -> { ok, regressions }`.

- [ ] **Step 1: Write failing budget-evaluator tests**

Cover below-baseline, small-noise pass, material script-byte regression, material usable-time regression, and long-task regression.

- [ ] **Step 2: Capture a stable baseline**

Run the production benchmark five times on the PR branch and commit medians for the routes already measured by CI. Record the raw sample command/results in `docs/PERFORMANCE_REVIEW.md`.

- [ ] **Step 3: Implement tolerant budget evaluation**

Default relative tolerance: 30%. Also require an absolute minimum delta before failure so tiny metrics do not fail from noise. Exact absolute floors are derived from the five-run baseline and committed with the baseline file.

- [ ] **Step 4: Make CI fail on material regression**

After `benchmark:production`, run `node scripts/performance-budget.mjs`.

- [ ] **Step 5: Verify**

Run `node --test test/performanceBudget.test.mjs` and local production benchmark/budget.

- [ ] **Step 6: Commit**

Commit message: `ci: enforce performance regression budgets`

---

### Task 3: Migrate stale capability settings out of active runtime state

**Files:**
- Create: `src/utils/settingsMigration.mjs`
- Modify: `src/redux/features/settingsSlice.js`
- Modify: `src/app/api/settings/route.js`
- Modify: `src/models/UserData.js`
- Modify: settings sync/hydration consumer files found by repository search.
- Test: `test/settingsMigration.test.mjs`
- Test: existing settings API tests.

**Interfaces:**
- Produces `migrateLegacySettings(input) -> supportedSettings`.
- Removes active runtime support for `streamingQuality`, `videoQuality`, and `spatialAudio`.
- Legacy `videoQuality === "audio-only"` migrates once to `audioOnly: true`.

- [ ] **Step 1: Add failing migration tests**

Old payloads with each removed field must hydrate safely; unsupported fields must not reappear in Redux/API output.

- [ ] **Step 2: Apply migration at persisted-state and API boundaries**

Do not scatter per-component legacy checks.

- [ ] **Step 3: Remove active reducers/API allow-list/model fields after migration is in place**

Existing Mongo documents may retain unknown historical fields until rewritten; runtime must ignore them.

- [ ] **Step 4: Verify settings sync/browser flows**

Run settings unit/API tests and browser settings flow.

- [ ] **Step 5: Commit**

Commit message: `refactor: retire legacy media capability settings`

---

### Task 4: Correct misleading Smart Shuffle and crossfade claims

**Files:**
- Modify: `src/components/Library/PlaylistDetail.jsx`
- Modify: `TODO.md`
- Modify: `readme.md`
- Modify: relevant settings/help copy found by search.
- Test: `test/playerCapabilities.test.mjs`
- Test: playlist/browser tests.

**Interfaces:**
- Existing random-plus-generic-discovery playlist behavior is labeled `Shuffle + Discovery` until playlist-aware similarity ranking exists.
- True overlapping crossfade remains disabled and documentation must say so.

- [ ] **Step 1: Add source/copy tests**

Assert UI/docs do not claim true crossfade is active and do not label generic random insertion as Smart Shuffle.

- [ ] **Step 2: Rename current playlist control/copy**

Keep behavior unchanged unless a separate approved playlist-aware algorithm is implemented.

- [ ] **Step 3: Correct TODO/readme capability statements**

Document fade-out/fade-in separately from true overlapping crossfade.

- [ ] **Step 4: Verify**

Run player capability and playlist E2E tests.

- [ ] **Step 5: Commit**

Commit message: `docs: align shuffle and crossfade claims with runtime`
