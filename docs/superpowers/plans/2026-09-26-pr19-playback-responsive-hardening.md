# PR19 Playback and Responsive Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicate player-presentation architecture, make responsive state consistent from first client paint, and make YouTube/provider behavior truthful and meaningfully verified.

**Architecture:** `YouTubePlayer` owns playback only; `MediaPresentation` owns video/presentation state. Shared responsive queries live in one module and all layout consumers derive from them. Provider smoke classifies external provider failures separately from HayKasa integration failures.

**Tech Stack:** React 18, Next.js 15, Redux Toolkit, Playwright, YouTube IFrame API.

**Spec:** `docs/superpowers/specs/2026-09-26-pr19-system-hardening-design.md`

## Global Constraints

- Work only in PR #19.
- Preserve playback queue/Jam/seek behavior.
- Do not add fake audio-reactive/provider-quality claims.
- Explicit user media-key actions may work hidden; automatic hidden resume remains guarded.
- Ordinary audio playback must not request Screen Wake Lock.

## Review Focus

1. Rotated phone wider than 767px must still receive mobile player controls without first-paint desktop flicker.
2. Tablet/coarse-pointer layout must not disagree between AppShell, Searchbar, MediaPresentation, and YouTubePlayer.
3. Provider outage may be classified external; HayKasa iframe integration regression must fail CI.
4. Switching Audio-focused/Data Saver on and off must preserve saved presentation preference and never claim provider bitrate reduction.
5. Removing legacy fullscreen code must not break queue, lyrics, PiP, seek, or MediaSession controls.

---

### Task 1: Create one responsive policy and fix first-client-render media queries

**Files:**
- Create: `src/utils/responsivePolicy.mjs`
- Modify: `src/hooks/useMediaQuery.js`
- Modify: `src/components/Layout/AppShell.jsx`
- Modify: `src/components/Searchbar.jsx`
- Modify: `src/components/MusicPlayer/MediaPresentation.tsx`
- Modify: `src/components/MusicPlayer/YouTubePlayer.jsx`
- Modify: `src/components/Backgrounds/LightPillar.jsx`
- Modify: `src/components/ReactBits/GhostFibers.jsx`
- Test: `test/responsivePolicy.test.mjs`
- Test: `e2e/playback.spec.js`
- Test: `e2e/routes.spec.js`

**Interfaces:**
- Produces:
  - `PHONE_PORTRAIT_QUERY`
  - `PHONE_LANDSCAPE_QUERY`
  - `PHONE_QUERY`
  - `COMPACT_TOUCH_QUERY`
  - `DESKTOP_QUERY`
  - `initialMediaQueryMatch(query, matchMedia?) -> boolean`.

- [ ] **Step 1: Add failing policy tests**

Assert exact classification for:
- 390x844 portrait;
- 844x390 landscape coarse pointer;
- 1024x768 coarse tablet;
- 1440x900 desktop;
- resize/orientation transition.

- [ ] **Step 2: Fix `useMediaQuery` initializer**

Initialize client state from `window.matchMedia(query).matches` instead of hard-coded `false`; keep SSR fallback deterministic.

- [ ] **Step 3: Replace duplicated semantic queries**

Update AppShell, Searchbar, MediaPresentation, YouTubePlayer, and mobile background heuristics to consume shared queries when they mean the same layout class. Leave truly component-specific queries such as reduced-motion alone.

- [ ] **Step 4: Add first-paint E2E assertions**

Before waiting for effects, verify mobile nav/player/search surfaces already use mobile presentation on the mobile projects.

- [ ] **Step 5: Verify**

Run: `node --test test/responsivePolicy.test.mjs && npm run test:e2e -- --project=chromium-desktop --project=mobile-chrome --project=mobile-safari`.

- [ ] **Step 6: Commit**

Commit message: `fix: centralize responsive layout policy`

---

### Task 2: Remove dead YouTube presentation ownership

**Files:**
- Modify: `src/components/MusicPlayer/YouTubePlayer.jsx`
- Modify: `src/components/MusicPlayer/MediaPresentation.tsx`
- Modify: `src/components/MusicPlayer/PlayerDock.tsx`
- Modify: `src/components/MusicPlayer/playerDock.module.css`
- Modify: `src/components/MusicPlayer/mediaPresentation.module.css`
- Test: `test/playerCapabilities.test.mjs`
- Test: `e2e/playback.spec.js`
- Test: `e2e/theater-controls.spec.js`

**Interfaces:**
- Consumes: existing presentation command/event contract.
- Produces: `MediaPresentation` as the sole owner of expanded/theater/mobile drawer state.

- [ ] **Step 1: Add source-contract tests that fail while legacy state exists**

Assert `YouTubePlayer.jsx` no longer declares or mutates legacy `expanded`, `mobileSheet`, `sheetTab`, `immersive`, or duplicated presentation chrome state.

- [ ] **Step 2: Trace every legacy branch before deletion**

For each legacy symbol, map all handlers/effects/render branches and either:
- replace with a MediaPresentation command/read-only signal; or
- delete as unreachable.

Do not delete queue, lyrics, seek, PiP, Jam, recovery, or MediaSession behavior that only happens to live near legacy UI code.

- [ ] **Step 3: Remove dead presentation JSX/CSS**

Delete unreachable expanded/mobile-sheet UI from YouTubePlayer and its unused styles after consumer search confirms no remaining references.

- [ ] **Step 4: Verify player flows**

Run browser tests for expand/collapse, lyrics, queue, seek, PiP, MediaSession and mobile sheet.

- [ ] **Step 5: Commit**

Commit message: `refactor: keep one player presentation owner`

---

### Task 3: Make Audio-focused/Data Saver capability truthful

**Files:**
- Modify: `src/app/settings/page.jsx`
- Modify: `src/components/MusicPlayer/YouTubePlayer.jsx`
- Modify: `src/components/MusicPlayer/MediaPresentation.tsx`
- Modify: `src/app/globals.css`
- Modify: `docs/superpowers/specs/2026-09-24-pr18-roadmap-design.md`
- Test: `test/playerCapabilities.test.mjs`
- Test: `e2e/playback.spec.js`

**Interfaces:**
- Keeps persisted `audioOnly` / `dataSaver` compatibility for existing users during this PR.
- User-facing copy must say what HayKasa changes and what YouTube still controls.

- [ ] **Step 1: Add failing truthfulness tests**

Assert settings copy does not claim lower YouTube bitrate or a true audio-only YouTube stream.

- [ ] **Step 2: Consolidate hidden-provider geometry**

There must be one canonical hidden YouTube viewport policy shared by CSS/placement code; remove contradictory 200x200 vs fallback geometry.

- [ ] **Step 3: Update UI copy and diagnostics**

Use “Audio-focused”/“reduces HayKasa visual work” wording and explicitly state provider media remains provider-managed.

- [ ] **Step 4: Verify preference migration**

Test explicit saved Audio/Video preference, temporary Data Saver, and restoration after disabling Data Saver.

- [ ] **Step 5: Commit**

Commit message: `fix: make youtube data-saver behavior truthful`

---

### Task 4: Turn real YouTube smoke into a meaningful gate

**Files:**
- Modify: `e2e/youtube-provider.spec.js`
- Modify: `.github/workflows/youtube-provider-smoke.yml`
- Create: `src/utils/youtubeProviderFailure.mjs`
- Test: `test/youtubeProviderSmokeContract.test.mjs`

**Interfaces:**
- Produces `classifyYoutubeProviderFailure(error) -> "external-provider" | "integration" | "unknown"`.

- [ ] **Step 1: Add failure-classification tests**

Cover:
- provider unavailable/region restriction;
- missing IFrame API;
- iframe never mounts;
- HayKasa player state mismatch;
- selector/bridge regression.

- [ ] **Step 2: Make integration failures blocking**

Remove blanket job-level `continue-on-error: true`. The test may skip/soft-report only failures positively classified as external-provider.

- [ ] **Step 3: Upload diagnostics for both classes**

Always upload provider screenshot/trace/log artifact.

- [ ] **Step 4: Verify workflow contract**

Run: `node --test test/youtubeProviderSmokeContract.test.mjs`.

- [ ] **Step 5: Commit**

Commit message: `ci: gate real youtube integration regressions`
