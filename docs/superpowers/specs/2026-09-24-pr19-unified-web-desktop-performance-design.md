# PR #19 Design — One HayKasa Product Codebase Across Web and Desktop

**Date:** 2026-09-24  
**Repository:** `6NCLegend9/Spotify-clone`  
**Target PR:** #19  
**Branch:** `refactor/unify-web-desktop-pr19`  
**Base:** current `main` after merged PR #18  
**Status:** design approved in conversation; implementation plan not yet approved

## 1. Goal

HayKasa must have one product implementation.

The website and the main Desktop window must not be two frontends that need manual synchronization. Search, playback, queue, lyrics, library, playlists, settings, discovery, account flows, accessibility, responsive layout, diagnostics surfaces, and future product features must come from the same Next.js/React code under the root application.

Electron remains a deliberately narrow native shell.

Success means:

- a normal product change is implemented once under the shared web application;
- the same deployed product code is what a browser and the Electron main window render;
- Desktop-specific code exists only for capabilities that require a native host;
- CI catches accidental divergence;
- native API compatibility is explicit and machine-checked;
- web-only releases do not require a new Windows installer;
- native changes are released only when the native shell actually changes;
- performance work is measured and cannot silently regress either browser or Desktop behavior.

## 2. Verified baseline

The repository already has the correct high-level direction:

```text
HayKasa Desktop.exe
  -> Electron BrowserWindow
  -> https://haykasa.vercel.app
  -> the normal HayKasa Next.js application
```

The main Desktop window is therefore already using the same product renderer as the website.

PR #19 is not a rewrite into a new Desktop frontend. It makes the existing shared-renderer architecture enforceable and removes the remaining sources of drift.

Current verified facts:

- `desktop/src/config.mjs` points packaged Desktop to `https://haykasa.vercel.app`.
- `desktop/src/main.mjs` loads that URL into the main BrowserWindow.
- the native API is exposed through the context-isolated `window.heykasaDesktop` bridge.
- web code capability-checks the installed shell.
- web deployments and native installer releases are already separate concepts.
- `desktop-ci.yml` currently watches a hand-maintained subset of root application paths.
- the native mini player is a small local HTML controller and is not the main HayKasa product renderer.
- PR #18 has been merged into `main`, so PR #19 may optimize the merged playback code without cross-PR ownership conflicts.

## 3. Architecture rule

### 3.1 Product source of truth

The canonical product implementation is:

```text
src/**
public/**
root Next.js configuration and product assets
```

Product behavior belongs there once.

Examples:

- search
- home/discovery
- playlist browsing
- queue
- playback
- lyrics
- visualizer
- Jam product UI
- settings
- account UI
- library
- activity
- accessibility
- responsive desktop/mobile browser presentation

Electron must not contain parallel implementations of these features.

### 3.2 Native source of truth

`desktop/**` owns only native-host responsibilities, including:

- BrowserWindow lifecycle
- updater
- Windows packaging/signing
- tray/startup behavior
- system-browser auth handoff
- secure session-cookie handoff
- Discord Desktop IPC
- native appearance asset selection/storage
- native diagnostics
- OS-level notifications/integrations
- secure preload bridge
- native mini controller
- crash recovery / safe mode
- native security policy

A feature belongs in `desktop/**` only when it cannot reasonably exist as ordinary web product code.

### 3.3 Forbidden architecture

Do not create:

```text
website feature implementation
desktop version of the same feature implementation
```

Do not add a second React renderer under `desktop/**`.

Do not package a frozen copy of the whole Next.js product into the installer merely to make the code "shared." That would make web fixes wait for native releases and recreate version drift in a different form.

## 4. Renderer contract

### 4.1 Canonical contract artifact

The current contract is manually represented in multiple places, such as:

- `DESKTOP_API_VERSION`
- `DESKTOP_CAPABILITIES`
- web-side capability strings
- manifest compatibility fields
- tests and documentation

PR #19 will introduce one canonical machine-readable Desktop contract at the repository root.

Recommended shape:

```json
{
  "apiVersion": 1,
  "capabilities": [
    "discordPresenceV1",
    "updaterV1",
    "autoLaunchV1",
    "desktopPreferencesV1",
    "appearanceProfilesV1",
    "trayV1",
    "diagnosticsV1",
    "authV1"
  ]
}
```

The exact filename can be `contracts/desktop.json`.

This file is authoritative for capability identifiers and current API version.

### 4.2 Generated native representation

Electron packaging should not depend on importing arbitrary files outside its package root at runtime.

Therefore:

- the root contract is canonical;
- a deterministic generation step creates the native representation consumed by `desktop/src/config.mjs`;
- CI fails if the generated representation is stale;
- contributors do not manually edit the generated capability list.

This is generated duplication, not two independent sources of truth.

### 4.3 Web representation

The web application imports/reads the canonical contract directly at build/server time where appropriate.

Web components must continue to feature-check the actual installed Desktop response rather than assuming that a user has the newest shell.

## 5. Compatibility behavior

### 5.1 Capabilities before version guesses

Product code should prefer:

```js
hasDesktopCapability(info, "someCapabilityV1")
```

over:

```js
if (desktopVersion >= "x.y.z")
```

Version numbers remain useful for updater/minimum-version policy, but capability identifiers define usable native behavior.

### 5.2 Graceful degradation

A normal web product deployment must not break an older Desktop shell merely because a new optional native capability does not exist.

Rules:

- browser-safe behavior remains the default;
- optional native enhancements appear only when the capability is present;
- missing optional native capabilities do not block the entire app;
- a hard compatibility gate is reserved for security-critical or structurally incompatible native API changes;
- required native changes must have a released upgrade path before the web build requires them.

### 5.3 Compatibility surface

The existing `DesktopCompatibilityGate` remains the final safety mechanism, but its inputs will be tied to the canonical contract rather than scattered constants.

The detailed design should distinguish:

- current web build;
- installed Desktop API version;
- installed capabilities;
- minimum supported Desktop version;
- hard-required capabilities, if any.

## 6. Desktop renderer lifecycle

### 6.1 Production

The packaged app loads the production HayKasa origin.

A normal web deployment updates both:

- browser users;
- Desktop users, because the main Desktop window loads that same deployed renderer.

No native installer is required for a pure web/product change.

### 6.2 Development

Unpackaged Electron continues to allow loopback origins only.

The preferred local workflow should start the root Next.js app and Electron together so developers do not accidentally test a stale remote product renderer.

Add a root script that owns both processes and cleanup rather than requiring manual terminal coordination.

Conceptually:

```text
npm run desktop:dev
  -> start Next.js on the configured local Desktop port
  -> wait until ready
  -> launch Electron with HEYKASA_DESKTOP_URL=<local origin>
  -> terminate both cleanly
```

Do not weaken production trusted-origin rules to make local development convenient.

## 7. Native mini player

`desktop/src/miniPlayer.html` is a native controller, not a second HayKasa application.

It may remain local because:

- it exists while the main window can be hidden;
- it uses a narrow native playback-command bridge;
- it is intentionally much smaller than the product UI.

PR #19 must prevent it from growing into a parallel renderer.

Rules:

- no search, library, playlist, settings, or product pages are implemented in the mini player;
- it consumes the same sanitized playback-state contract reported by the web player;
- shared capability names and semantic constants come from the canonical contract where applicable;
- visual duplication should be limited to native-controller presentation;
- native mini-player changes receive dedicated lightweight tests.

## 8. CI redesign

The current Desktop CI trigger uses a hand-maintained allowlist of selected root files. This can miss product changes that affect the Electron renderer.

PR #19 replaces that assumption with two different gates.

### 8.1 Web-in-Desktop compatibility gate

This is the routine gate for product changes.

It should run for changes to the actual product/runtime surface, including at minimum:

- `src/**`
- relevant `public/**`
- root package lock/package metadata
- Next.js configuration
- root TypeScript/lint configuration
- root test/e2e harnesses that define runtime behavior
- shared Desktop contract

The gate should:

1. install root and Desktop dependencies;
2. build or start the real root HayKasa renderer;
3. launch the real Electron shell against the local renderer in unpackaged mode;
4. assert that the main window loads the root application;
5. assert that the preload bridge is present;
6. verify a representative product route/navigation;
7. verify playback bridge wiring without requiring live YouTube media;
8. surface renderer console/page errors;
9. verify no duplicate Desktop product renderer exists.

This validates the integration users actually run.

### 8.2 Native package gate

Windows installer creation remains necessary when native code/package/release files change.

It must not be the only way to prove that a normal web feature works inside Electron.

Run heavy native packaging when relevant files change, for example:

- `desktop/**`
- native contract generation/output
- desktop API server compatibility routes
- release/updater workflows
- installer assets/configuration

Manual full-package validation remains available.

### 8.3 Release gate

Stable native releases continue to require:

- protected release workflow;
- signed installer;
- complete update bundle;
- updater compatibility checks;
- release publication verification.

PR #19 must not weaken the security model established by PR #17.

## 9. Performance scope

Performance work is included in PR #19, but every optimization must have a measurable reason.

The rule is:

> no performance change is accepted merely because it sounds faster.

Each optimization must identify:

- current cost;
- changed code path;
- measurement method;
- before/after result;
- regression coverage.

## 10. Performance finding A — YouTube player clock isolation

### 10.1 Current behavior

The merged `YouTubePlayer.jsx` polling path runs:

- normally around every 500 ms;
- around every 120 ms when lyrics or PiP surfaces need more frequent progress updates.

The tick does important engine work but also calls React state setters such as:

- `setCurrentTime(...)`
- `setDuration(...)`

inside the large player component.

That can make an engine-level polling requirement become a broad React-rendering requirement.

### 10.2 Target design

Separate high-frequency engine time from broad component rendering.

Conceptually:

```text
YouTube IFrame
    |
    v
engine poll / recovery / Jam sync
    |
    +--> mutable playback clock
    |       |
    |       +--> timeline subscriber
    |       +--> lyrics subscriber
    |       +--> PiP subscriber
    |
    +--> low-frequency structural React state
```

Requirements:

- engine health/recovery logic may poll at the frequency it needs;
- current media time is written to a dedicated clock/ref/store;
- only UI surfaces that need time updates subscribe to those updates;
- the whole `YouTubePlayer` tree must not re-render every 120 ms solely because time advanced;
- duration changes are structural and should update only when changed;
- Redux playback-position persistence remains throttled/coarse as today;
- Jam reports remain bounded independently from UI frame rate;
- seek state remains responsive;
- lyrics remain synchronized;
- tests prove playback behavior did not change.

A small `useSyncExternalStore`-compatible playback clock is preferred over global Redux updates for sub-second time.

### 10.3 Performance acceptance

Measure React commit count/long tasks during a fixed playback simulation with lyrics open.

Acceptance is evidence-based, not a hard invented percentage.

At minimum the result must demonstrate that 120 ms engine polling no longer causes equivalent full-player commits.

## 11. Performance finding B — Desktop initial navigation cache override

Desktop currently calls roughly:

```js
window.loadURL(appUrl, {
  extraHeaders: "Cache-Control: no-cache\n"
})
```

This forces revalidation semantics beyond the response headers selected by the web application/CDN.

PR #19 will benchmark:

- startup with the explicit request header;
- startup relying on server/CDN cache policy.

Only remove the override if:

- fresh web deployments are still detected correctly;
- the web build notifier/reload path remains correct;
- authentication/session behavior is unchanged;
- startup measurement improves or unnecessary validation traffic is removed.

The spec does not pre-decide that removing it is always faster.

## 12. Performance finding C — background work

The Desktop BrowserWindow currently uses:

```js
backgroundThrottling: false
```

That choice can preserve background playback/timers but can also increase CPU use while the window is hidden.

Do not blindly switch it to `true`.

Instead:

- keep playback correctness as the primary invariant;
- profile hidden-window timer/CPU behavior;
- stop/throttle nonessential app work through visibility-aware hooks;
- preserve media/Jam/native bridge work that must remain active;
- only change Electron background throttling if browser/Electron validation proves playback and synchronization remain correct.

## 13. Performance finding D — bundle and startup regression gates

The existing production benchmark already measures:

- route timing;
- usable shell timing;
- script bytes;
- LCP snapshot;
- CLS snapshot;
- long tasks;
- build identity.

PR #19 will make this more useful as a regression gate for the shared renderer.

Track at least:

- root shared JS bytes;
- key first-route script bytes;
- usable search/library shell time;
- long-task total in the synthetic benchmark;
- Electron local-renderer usable time;
- Electron renderer console/page errors.

Do not introduce strict budgets from a single local run.

First establish a baseline on the PR branch. Add a failure threshold only where repeated CI samples show a stable enough signal.

## 14. Performance finding E — unnecessary duplicate product work

As part of implementation, inspect globally mounted product synchronizers and repeated data loads for duplicate work.

Known candidate from the existing performance review:

- Home and Sidebar can issue separate playlist reads.

This is not permission to introduce a global private-data cache.

Any deduplication must preserve:

- account isolation;
- account-switch invalidation;
- mutation invalidation;
- private/no-store semantics;
- cancellation;
- error independence where required.

Only implement request deduplication when tests demonstrate identical safe in-flight work.

## 15. Large collections

Playlist/favourite collections can reach hundreds of tracks.

PR #19 should profile large collection rendering under the shared renderer.

Preferred order:

1. measure;
2. reduce unnecessary row re-renders;
3. use browser-native rendering containment/`content-visibility` where safe;
4. introduce list virtualization only if measurements justify its complexity.

If virtualization is used it must preserve:

- keyboard navigation;
- context menus;
- row actions;
- search filtering;
- scroll restoration;
- accessibility semantics;
- queue operations.

No new virtualization dependency should be added without a measured need.

## 16. Performance non-goals

PR #19 is not permission to:

- replace Redux globally;
- rewrite the whole player;
- migrate the whole repository to TypeScript;
- introduce a new state-management framework;
- add a service worker cache for authenticated/private APIs;
- cache user-private responses across accounts;
- package the whole web server inside Electron;
- move media playback into Electron main;
- add native Node access to the renderer;
- disable security boundaries for speed;
- remove recovery checks merely to reduce timers;
- create speculative memoization everywhere.

## 17. Security invariants

The unified architecture must retain:

- `nodeIntegration: false`;
- context isolation;
- renderer sandbox;
- origin-restricted IPC;
- production trusted-origin navigation;
- explicit preload methods only;
- no arbitrary shell/filesystem/process access from product code;
- no server secrets in Desktop;
- secure auth handoff;
- signed stable/beta native updates;
- no arbitrary renderer-provided executable/update URLs.

"One codebase" must not mean "give the web app native Node privileges."

## 18. Testing strategy

### 18.1 Contract tests

Verify:

- canonical contract parses;
- generated Desktop contract matches it;
- capability identifiers are unique;
- API version is a positive integer;
- web feature checks use known capabilities;
- stale generated output fails CI.

### 18.2 Shared renderer tests

Run existing browser suites plus targeted tests that prove the same product behavior is available in:

- normal Chromium browser;
- Electron main window against the same local Next.js renderer.

Representative flows:

- Home loads;
- Search route loads;
- Library route loads;
- shared player shell mounts;
- queue action reaches the same Redux/product code;
- Desktop bridge appears only in Electron;
- browser mode works with no Desktop bridge;
- optional native feature hides/degrades when capability is absent.

### 18.3 Native tests

Preserve existing native tests for:

- security;
- updater;
- policy;
- auth;
- package hardening;
- native stores;
- appearance;
- playback command sanitization.

### 18.4 Performance tests

Add/extend repeatable tests for:

- player clock commit behavior;
- Desktop startup/navigation;
- hidden-window nonessential work;
- large playlist rendering;
- bundle/script bytes.

Performance tests must not claim real network/provider performance when APIs are mocked.

### 18.5 Full validation before PR approval

Required final gates:

- root unit tests;
- lint;
- typecheck;
- production Next.js build;
- production benchmark;
- browser E2E matrix already used by the repository;
- Desktop native unit tests;
- Web-in-Electron integration smoke;
- Windows package build when native files changed;
- release contract tests when release files changed.

## 19. Migration sequence

Implementation should be split into reviewable commits on PR #19.

### Phase 1 — Contract and drift prevention

- canonical Desktop contract;
- generated native representation;
- contract validation tests;
- remove manually duplicated capability definitions.

### Phase 2 — One-renderer development workflow

- root-owned local Desktop development launcher;
- deterministic process cleanup;
- main Electron window verified against the root local Next.js renderer;
- documentation updated.

### Phase 3 — CI integration

- broaden product-change detection;
- add Web-in-Electron smoke;
- separate routine compatibility validation from expensive Windows packaging.

### Phase 4 — Player clock performance

- extract high-frequency playback clock;
- isolate timeline/lyrics/PiP time subscriptions;
- preserve recovery/Jam/seek behavior;
- measure React commit reduction.

### Phase 5 — Startup/background performance

- benchmark Desktop navigation cache override;
- remove/change only with evidence;
- visibility-throttle nonessential work;
- validate hidden-window playback.

### Phase 6 — collection/request performance

- profile large playlists;
- reduce row/render work where measurable;
- deduplicate only proven-safe identical requests;
- add regression measurements.

### Phase 7 — final hardening

- run complete web + Electron validation;
- inspect for duplicate product implementations;
- update architecture docs;
- code review for security/performance regressions.

## 20. Pull-request boundary

All product and test changes from this design belong only in:

**PR #19 — `refactor/unify-web-desktop-pr19`**

PR #18 is already merged and is the baseline.

Do not push PR #19 implementation directly to `main`.

The user will review PR #19 before merge.

## 21. Definition of done

PR #19 is complete only when all of the following are true:

1. the main Desktop window and website demonstrably render the same root HayKasa application;
2. there is no second Desktop product frontend;
3. Desktop native capability/API identifiers have one canonical source;
4. generated native contract drift is CI-detectable;
5. normal root product changes receive an Electron compatibility smoke test;
6. native Windows packaging runs when native/package changes require it, not as a substitute for renderer compatibility testing;
7. browser mode remains fully functional without Electron;
8. Desktop mode feature-detects native capabilities;
9. a pure web feature does not require a Desktop installer release;
10. high-frequency YouTube clock updates no longer imply full-player React commits at the same frequency;
11. measured Desktop startup/background changes do not regress playback;
12. performance claims in the PR are backed by repeatable measurements;
13. existing Desktop security boundaries remain intact;
14. full repository validation passes before merge.

## 22. Explicit approval gate

This document defines the architecture and scope only.

No product implementation should begin until:

1. the user reviews and approves this written spec;
2. a detailed implementation plan is written with the Tech Team planning workflow;
3. the user reviews that plan and selects the execution method.

