# PR #19 System Hardening Design

**Date:** 2026-09-26  
**Repository:** `6NCLegend9/Spotify-clone`  
**Target PR:** #19  
**Branch:** `refactor/unify-web-desktop-pr19`  
**Base:** current `main`  
**Status:** design approved in conversation; implementation plan pending review

## 1. Objective

PR #19 must leave HayKasa with one coherent product across web, mobile, and Electron Desktop, with fixes applied system-wide rather than as isolated patches.

The work is not complete when the symptom disappears in one component. Each issue must be traced across:

```text
symptom
  -> component / hook / API
  -> shared state / utilities / contracts
  -> all direct and indirect callers
  -> web / mobile / desktop consumers
  -> tests / CI / release workflow
  -> production runtime behavior
```

The PR must improve correctness, performance, release reliability, and maintainability without weakening security boundaries or creating a second product implementation.

## 2. Non-negotiable architecture rules

### 2.1 One product renderer

The root Next.js application remains the only product frontend.

`desktop/**` remains a native Electron shell only.

Do not introduce duplicate implementations of:

- search
- library
- queue
- player
- lyrics
- settings
- playlists
- discovery
- account UI
- responsive product pages

### 2.2 Fix dependency graphs, not files

For every issue, implementation must:

1. identify the root cause;
2. identify all symbols and files that depend on that behavior;
3. update all affected callers and consumers;
4. remove stale or contradictory implementations;
5. update tests and workflows that encode the old behavior;
6. verify browser, mobile, and Desktop paths where relevant.

### 2.3 Preserve security invariants

The work must retain:

- `nodeIntegration: false`;
- context isolation;
- sandboxing;
- trusted-origin navigation;
- sender validation for IPC;
- signed stable/beta native releases;
- no arbitrary executable/update URL supplied by the renderer;
- no server secrets in the renderer or Desktop package;
- browser mode functioning with no Electron bridge.

## 3. Workstream A — Desktop release/update chain

### Current problem

The codebase contains a new release/update contract, but the live stable release path is not yet operational.

The live stable manifest currently reports no published signed release, and the current public update/download routes cannot serve the complete bundle expected by the new updater.

### Target state

A stable Desktop release must have a coherent versioned bundle including the exact files required by the updater.

The implementation must align:

- Electron updater expectations;
- `/api/desktop/manifest`;
- update proxy/download routes;
- release-manifest verification;
- GitHub release tags/assets;
- signing requirements;
- release workflow validation;
- Desktop UI/update notifier behavior.

### Requirements

- Use one canonical release metadata contract.
- Support the versioned tag convention used by the new updater.
- Fail closed if a bundle is incomplete or unsigned.
- Do not silently fall back to an incompatible legacy installer.
- Add tests for:
  - no release;
  - complete signed stable release;
  - incomplete release;
  - mismatched manifest;
  - missing `latest.yml`;
  - missing blockmap;
  - stale release;
  - invalid signature.
- Windows CI must do more than build the installer: it must launch the packaged application or otherwise exercise the installed runtime in a Windows environment.
- Publishing a real stable signed release is an operational step and remains separate from code merge approval.

## 4. Workstream B — YouTube playback and presentation architecture

### 4.1 Single presentation owner

`MediaPresentation` is the canonical owner of:

- video visibility;
- expanded/theater state;
- mobile drawer/sheet state;
- presentation transitions;
- viewport placement.

`YouTubePlayer` owns playback engine state only.

Remove dead or unreachable legacy presentation code from `YouTubePlayer`, including stale fullscreen/mobile-sheet branches that are permanently disabled by the new presentation architecture.

### 4.2 Audio-focused/Data Saver semantics

The app must not pretend that hiding a YouTube iframe creates a true audio-only stream.

The final behavior must be explicit:

- native audio sources may support genuine audio-only behavior;
- YouTube remains a YouTube iframe media source;
- user-facing wording must describe what actually happens;
- hidden/off-screen provider behavior must not be represented as bitrate or stream reduction capability unless measurable and real.

If the YouTube iframe must remain mounted for playback, keep one canonical geometry/visibility policy rather than competing CSS and JS fallback dimensions.

### 4.3 Real provider verification

The real-provider smoke test must distinguish:

- provider/network availability failures;
- HayKasa integration regressions.

A HayKasa regression must be able to fail the release gate.

Provider outages may remain non-blocking only when the test can reliably classify them as external failures.

### 4.4 Background/media-key behavior

Explicit user actions from OS media controls must work while the app is hidden/minimized when the provider permits it.

Automatic hidden-page resume remains guarded.

### 4.5 Wake Lock

Screen Wake Lock is permitted only when:

- media is actively playing;
- visible video is being presented;
- keeping the display awake is useful to the user.

Ordinary audio listening must not keep the screen awake.

## 5. Workstream C — Search, radio, and API rate limiting

### Current problem

Interactive search, automatic radio, queue search, and auxiliary discovery currently compete for one YouTube-search rate-limit bucket.

This can make normal search fail after automatic radio activity.

### Target state

Separate workload classes:

```text
interactive search
radio discovery
queue search
artist / playlist extras
```

### Requirements

- Preserve abuse protection.
- Do not let automatic background work starve direct user actions.
- Avoid persistent database writes for every autocomplete keystroke where a lighter safe strategy is available.
- Keep rate-limit ownership/account/IP behavior explicit.
- Surface useful 429 behavior to callers.
- Add tests for:
  - interactive search burst;
  - radio burst;
  - mixed workload;
  - authenticated and guest users;
  - account switching;
  - independent buckets;
  - abuse ceiling.

## 6. Workstream D — Responsive/mobile architecture

### Current problem

Different parts of the product define mobile/tablet/desktop differently using overlapping 767, 1100, 1179, and 1180 pixel conditions plus pointer/orientation rules.

The generic media-query hook also initializes to desktop-like `false` before the first effect.

### Target state

One shared responsive policy must define semantic device/layout classes.

Recommended model:

```text
phone portrait
phone landscape
compact touch/tablet
desktop
```

The exact breakpoints remain implementation details of one shared module.

### Requirements

- `useMediaQuery` must initialize from `matchMedia` on the client instead of hard-coded `false`.
- Components that describe the same layout class must consume shared predicates/constants.
- Keep media-query usage local only when the query describes a truly component-specific concern.
- Update:
  - player presentation;
  - Searchbar/search surfaces;
  - navigation;
  - layout shell;
  - mobile controls;
  - responsive tests.
- Add regression coverage for:
  - 390x844 portrait phone;
  - landscape phone;
  - compact tablet/coarse pointer;
  - desktop;
  - resize/orientation change;
  - hydration/first-client-render stability.

## 7. Workstream E — Large playlist scalability

### Current problem

`content-visibility:auto` reduces paint/layout cost but still creates all playlist React components and DOM rows.

### Target state

Use real list virtualization for sufficiently large playlists.

### Requirements

Virtualization must preserve:

- semantic row controls;
- keyboard focus;
- context menus;
- queue actions;
- remove/like actions;
- active-track highlighting;
- search filtering;
- scroll restoration;
- accessibility labels;
- mobile and desktop layouts.

Do not introduce virtualization for tiny playlists if the complexity outweighs benefit.

Add realistic tests for 500, 2,000, and 5,000 tracks and record mounted-row counts, not only first-paint timing.

## 8. Workstream F — Desktop runtime efficiency

### 8.1 Cache strategy

Do not clear HTTP cache, Service Worker state, and CacheStorage unconditionally on every main-window creation.

Prefer version-aware invalidation tied to:

- renderer compatibility version;
- app version;
- known bad cache migration markers.

Preserve a safe manual recovery path.

### 8.2 Background work

Do not disable renderer throttling globally unless playback correctness requires it.

Prefer:

- visibility-aware suspension for nonessential work;
- dedicated playback-critical scheduling;
- verified Jam/media-key behavior while hidden.

Measure CPU/timer activity before and after any change.

## 9. Workstream G — Performance regression gates

The current benchmark records metrics but does not enforce meaningful budgets.

PR #19 must add stable, evidence-based regression checks for at least:

- shared JS transfer bytes;
- route usable time;
- long-task total;
- Electron renderer usable time;
- large-playlist mounted-row count.

Do not use brittle single-run thresholds.

Use a baseline plus a reasonable regression margin derived from repeated CI measurements.

## 10. Workstream H — Misleading and dead domain code

Remove or migrate stale capability/state fields that no longer have active consumers, including legacy settings such as:

- `streamingQuality`;
- `videoQuality`;
- `spatialAudio`;

only after verifying all persisted-user migration implications.

Correct documentation and UI claims for:

- true crossfade;
- fade behavior;
- Smart Shuffle;
- Audio-only/Data Saver;
- provider-managed quality.

If a feature name promises stronger behavior than the implementation provides, either upgrade the implementation or rename the feature.

## 11. Cross-cutting testing strategy

Every workstream must use regression-first testing where practical.

### Required layers

- pure utility/unit tests;
- reducer/state tests;
- API route tests;
- browser Playwright;
- Mobile Chrome;
- Mobile Safari/WebKit;
- Firefox;
- Electron shared-renderer smoke;
- Windows native/package validation;
- real YouTube provider smoke;
- release-contract tests;
- performance measurements.

### Failure classification

Tests should distinguish:

- product regression;
- environment failure;
- provider outage;
- expected unsupported capability.

Do not hide product failures behind `continue-on-error`.

## 12. Execution strategy

Implementation should be incremental and reviewable.

Recommended order:

1. Desktop release/update contract and Windows runtime verification.
2. YouTube presentation cleanup and provider-gate hardening.
3. Search/radio rate-limit separation.
4. Responsive/mobile policy consolidation.
5. Playlist virtualization.
6. Desktop cache/background efficiency.
7. Performance budgets.
8. Legacy/misleading capability cleanup.
9. Whole-system code review and final verification.

Independent workstreams may be implemented in parallel only when they do not modify shared state or overlapping files.

## 13. Definition of done

PR #19 is complete only when:

1. all targeted issues have system-wide fixes, not local patches;
2. every changed contract has all callers updated;
3. no stale duplicate implementation remains for the changed behavior;
4. browser, mobile, and Desktop paths remain consistent;
5. real YouTube integration is meaningfully gated;
6. Desktop release code can consume a complete versioned signed bundle;
7. Windows runtime behavior is exercised, not only packaging;
8. large playlists use real virtualization when needed;
9. responsive state does not flip from desktop to mobile after first client paint;
10. interactive search cannot be starved by background radio activity;
11. performance regressions can fail CI;
12. dead/misleading capability fields and documentation are cleaned up;
13. all required tests pass on the final PR head;
14. no direct push to `main` occurs.

## 14. Scope boundary

This work remains inside PR #19.

A real stable release publication, signing action, or merge to `main` requires separate explicit user approval after code verification.
