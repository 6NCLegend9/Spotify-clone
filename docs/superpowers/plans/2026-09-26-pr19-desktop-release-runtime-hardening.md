# PR19 Desktop Release and Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HayKasa Desktop updates actually consumable by installed Windows clients, exercise the packaged runtime on Windows, and stop unnecessary renderer cache destruction without weakening the native security boundary.

**Architecture:** Keep Electron as a thin shell that loads the shared Next.js renderer. Treat the GitHub Release bundle plus signed release manifest as the source of truth for Desktop updates, and make every route/workflow/client consume the same bundle contract. Cache invalidation becomes version/schema based rather than unconditional.

**Tech Stack:** Electron 44, electron-updater, Next.js route handlers, GitHub Actions, Node 22, NSIS, GitHub Releases.

**Spec:** `docs/superpowers/specs/2026-09-26-pr19-system-hardening-design.md`

## Global Constraints

- Work only on PR #19 branch `refactor/unify-web-desktop-pr19`.
- Do not publish a stable release or merge to `main`.
- Stable/beta releases remain signed and HMAC-manifest verified.
- Browser mode must not depend on Electron.
- Preserve `nodeIntegration: false`, context isolation, sandboxing, trusted-origin navigation, and IPC sender validation.
- Do not silently accept legacy releases missing `latest.yml`, blockmap, or `release-manifest.json`.

## Review Focus

1. Stable GitHub release exists but one required updater asset is missing: clients must fail closed and explain why.
2. Release manifest says one installer/version while `latest.yml` or GitHub assets say another: update must be rejected.
3. Windows packaged app starts successfully but cannot load the renderer: CI must fail the packaged runtime smoke.
4. App version changes while renderer cache schema is unchanged: keep useful cache state.
5. Renderer cache schema changes after a known-bad cache migration: clear only the affected Desktop web cache once.

---

### Task 1: Make the Desktop release bundle contract authoritative

**Files:**
- Modify: `src/utils/desktopRelease.mjs`
- Modify: `src/utils/desktopReleaseTrust.mjs`
- Modify: `src/app/api/desktop/manifest/route.js`
- Modify: `src/app/api/desktop/download/route.js`
- Modify: `src/app/api/desktop/update/[channel]/[file]/route.js`
- Modify: `desktop/src/updater.mjs`
- Test: `test/desktopRelease.test.mjs`
- Test: `test/desktopManifest.test.mjs`
- Test: `test/desktopDownload.test.mjs`
- Test: `desktop/test/updaterVersion.test.mjs`

**Interfaces:**
- Consumes: existing `desktopReleaseBundle(release, channel)`, `fetchVerifiedDesktopGithubRelease(channel, options)`.
- Produces: one verified bundle object with `version`, `installerFile`, `blockmapFile`, `metadataFile`, `manifestFile`, `installerUrl`, `publishedAt`, and verified manifest payload.

- [ ] **Step 1: Add failing release-contract tests**

Add cases asserting that stable/beta verification rejects:
- missing `latest.yml`;
- missing installer blockmap;
- missing `release-manifest.json`;
- tag/version mismatch;
- manifest installer filename mismatch;
- manifest SHA mismatch;
- channel mismatch.

Run: `node --test test/desktopRelease.test.mjs test/desktopManifest.test.mjs test/desktopDownload.test.mjs`  
Expected: at least the new mismatch cases fail.

- [ ] **Step 2: Centralize bundle/version consistency checks**

Update `desktopReleaseBundle(release, channel)` and release-trust helpers so the bundle is returned only when every required asset and manifest field agrees on channel, version, installer filename, and hashes.

- [ ] **Step 3: Make all three Desktop API routes consume the verified bundle**

The manifest, installer download, and generic updater-file route must derive response URLs/files only from the same verified bundle. Remove any route-specific fallback that can advertise a release the updater cannot consume.

- [ ] **Step 4: Make the Electron updater validate the manifest before calling electron-updater**

`DesktopUpdater.releaseManifest()` must reject incomplete/unpublished/mismatched bundle metadata before `checkForUpdates()`.

- [ ] **Step 5: Run the release contract tests**

Run:
`node --test test/desktopRelease.test.mjs test/desktopManifest.test.mjs test/desktopDownload.test.mjs && npm --prefix desktop test`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `fix: enforce one desktop release bundle contract`

---

### Task 2: Exercise the packaged Windows runtime in CI

**Files:**
- Create: `desktop/src/ciSmoke.mjs`
- Modify: `desktop/src/main.mjs`
- Create: `desktop/scripts/verify-packaged-runtime.mjs`
- Modify: `.github/workflows/desktop-package-ci.yml`
- Test: `desktop/test/ciSmoke.test.mjs`
- Test: `test/desktopCi.test.mjs`

**Interfaces:**
- Produces: `isPackagedCiSmoke(argv, env) -> boolean`, a deterministic packaged-runtime smoke mode, and `npm --prefix desktop run smoke:packaged`.

- [ ] **Step 1: Write failing smoke-mode tests**

Tests must assert:
- normal packaged launch does not enter CI smoke mode;
- CI smoke mode requires the explicit CLI switch and GitHub Actions environment;
- smoke mode never weakens trusted-origin/security policy;
- smoke result reports renderer load success, preload bridge availability, and process exit status.

- [ ] **Step 2: Implement packaged CI smoke mode**

Add a narrowly scoped `--heykasa-ci-smoke` path that:
- creates the real packaged main window/security configuration;
- loads the normal trusted production renderer;
- waits for `did-finish-load` and preload readiness;
- writes a fixed-name JSON result under the app temp directory;
- exits without tray persistence.

Do not accept arbitrary output paths or arbitrary renderer URLs.

- [ ] **Step 3: Add the Windows verification script**

`desktop/scripts/verify-packaged-runtime.mjs` launches `desktop/dist/win-unpacked/HayKasa.exe --heykasa-ci-smoke`, waits with a hard timeout, then asserts the JSON result reports trusted renderer and bridge success.

- [ ] **Step 4: Run packaged smoke after the Windows build**

Update `desktop-package-ci.yml` so Windows CI:
1. builds;
2. verifies artifacts;
3. launches the packaged runtime;
4. only then prepares/uploads the release bundle.

- [ ] **Step 5: Verify**

Run: `npm --prefix desktop test` and `node --test test/desktopCi.test.mjs`.  
Expected: PASS locally for source-contract tests; Windows workflow performs the executable launch.

- [ ] **Step 6: Commit**

Commit message: `test: launch packaged desktop runtime on windows`

---

### Task 3: Replace unconditional Desktop cache clearing with schema-based invalidation

**Files:**
- Create: `desktop/src/cachePolicy.mjs`
- Modify: `desktop/src/config.mjs`
- Modify: `desktop/src/main.mjs`
- Modify: `desktop/src/nativeStore.mjs`
- Test: `desktop/test/cachePolicy.test.mjs`
- Test: `desktop/test/nativeStore.test.mjs`

**Interfaces:**
- Produces:
  - `DESKTOP_RENDERER_CACHE_SCHEMA: number`
  - `shouldResetRendererCache({ storedSchema, currentSchema }) -> boolean`
  - NativeStore key `rendererCacheSchema`.

- [ ] **Step 1: Write failing cache-policy tests**

Assert:
- first run resets cache;
- same schema on later launch keeps cache;
- schema bump resets exactly once;
- invalid stored schema resets;
- app-version-only change does not reset when schema is unchanged.

- [ ] **Step 2: Implement `cachePolicy.mjs` and store schema**

Set `DESKTOP_RENDERER_CACHE_SCHEMA = 1` in `config.mjs`. Add `rendererCacheSchema` to NativeStore defaults/sanitization.

- [ ] **Step 3: Gate `clearDesktopWebCaches()`**

In `createMainWindow()`, clear HTTP cache/serviceworkers/CacheStorage only when `shouldResetRendererCache()` returns true, then persist the new schema after successful clearing.

- [ ] **Step 4: Preserve explicit recovery behavior**

Safe-mode/manual recovery may still clear renderer caches, but normal startup must not.

- [ ] **Step 5: Verify**

Run: `npm --prefix desktop test`.  
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `perf: invalidate desktop renderer cache by schema`

---

### Task 4: Measure and constrain hidden-window background work

**Files:**
- Create: `desktop/scripts/measure-background-runtime.mjs`
- Modify: `desktop/src/main.mjs`
- Modify: `docs/PERFORMANCE_REVIEW.md`
- Test: `desktop/test/backgroundRuntime.test.mjs`

**Interfaces:**
- Produces a repeatable measurement of timer/CPU activity while visible vs hidden.
- No behavior change to `backgroundThrottling` is accepted without passing playback/media-key/Jam checks.

- [ ] **Step 1: Add measurement harness and baseline**

Measure a fixed visible interval and hidden interval using the real shared renderer with mocked provider traffic. Record playback-clock progress and nonessential animation/timer activity.

- [ ] **Step 2: Add regression tests for hidden playback-critical work**

Assert hidden window still handles play/pause/next and Jam heartbeat/state while decorative work is suspended.

- [ ] **Step 3: Decide `backgroundThrottling` from evidence**

If enabling Chromium background throttling preserves playback-critical tests, enable it. Otherwise keep `false` and document the measured reason; do not guess.

- [ ] **Step 4: Verify and document**

Run: `npm --prefix desktop test` plus the measurement script. Record before/after values in `docs/PERFORMANCE_REVIEW.md`.

- [ ] **Step 5: Commit**

Commit message: `perf: harden desktop hidden-window runtime`
