# PR19 Final Integration and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the completed PR #19 hardening work behaves coherently across web, mobile, Electron Desktop, Windows packaging, real YouTube integration, release contracts, and performance budgets before the user decides whether to merge.

**Architecture:** This plan changes no product behavior unless verification finds a regression. It runs the complete validation matrix, performs source-of-truth audits for duplicate/stale implementations, fixes only issues discovered by those checks, and updates the PR body with exact evidence.

**Tech Stack:** Node 22, Next.js 15, Playwright, Electron, GitHub Actions, Vercel runtime checks.

**Spec:** `docs/superpowers/specs/2026-09-26-pr19-system-hardening-design.md`

## Global Constraints

- Run only after the other PR19 hardening plans are complete.
- Do not merge PR #19 or publish a stable Desktop release.
- Do not report a workflow as passing until the final PR head has that result.
- Distinguish product regressions from provider/environment failures.

## Review Focus

1. A web-only change must still work in Electron without a native installer change.
2. A phone/tablet viewport must use one responsive classification across player/navigation/search.
3. A provider outage must not be misreported as a HayKasa regression, and vice versa.
4. An old persisted settings payload must not resurrect removed capabilities.
5. A large playlist/search/radio workload must remain usable without violating performance/rate-limit gates.

---

### Task 1: Run the complete local/source validation matrix

**Files:**
- Modify only files required to fix failures discovered by this task.

- [ ] **Step 1: Run root checks**

Run:
`npm run check:desktop-contract && npm test && npm run lint && npm run typecheck && npm run build && npm run benchmark:production`

Expected: PASS, including performance budget gate added by the hardening work.

- [ ] **Step 2: Run browser projects**

Run the repository Playwright matrix for:
- Chromium desktop;
- Firefox desktop;
- WebKit desktop;
- Mobile Chrome;
- Mobile Safari.

Expected: PASS with no hidden retries presented as clean success.

- [ ] **Step 3: Run Desktop tests**

Run:
`npm --prefix desktop test`

Expected: PASS.

- [ ] **Step 4: Commit only if failures required fixes**

Each discovered regression receives its own focused commit and test.

---

### Task 2: Run repository-wide source-of-truth audits

**Files:**
- Test/create: `test/systemArchitectureContract.test.mjs` if automated checks do not already exist.

- [ ] **Step 1: Search for duplicate player presentation ownership**

Assert no second expanded/mobile-sheet presentation state remains in `YouTubePlayer`.

- [ ] **Step 2: Search for duplicate semantic responsive breakpoints**

Assert components use the shared responsive policy for phone/compact-touch semantics.

- [ ] **Step 3: Search YouTube-search callers**

Assert every production `/api/youtube-search` caller declares its workload purpose.

- [ ] **Step 4: Search removed legacy settings**

Assert `streamingQuality`, `videoQuality`, and `spatialAudio` no longer participate in active runtime/API state except explicit migration fixtures/docs.

- [ ] **Step 5: Search Desktop product duplication**

Assert `desktop/**` does not contain Search, Library, playlist, lyrics, settings, Home, or main-player product implementations.

- [ ] **Step 6: Commit audit test if new**

Commit message: `test: enforce PR19 architecture boundaries`

---

### Task 3: Verify CI/release/provider gates on the final head

**Files:**
- Modify workflow/test files only when the final-head run exposes a reproducible product issue.

- [ ] **Step 1: Push the final verification commit/head to PR #19**

Do not merge.

- [ ] **Step 2: Verify required GitHub Actions**

Require successful final-head results for:
- main CI;
- Desktop CI;
- Desktop Package CI;
- real YouTube provider integration gate;
- performance gate.

- [ ] **Step 3: Inspect Windows packaged-runtime result**

Confirm the packaged executable smoke ran, not merely installer artifact checks.

- [ ] **Step 4: Inspect provider classification**

If YouTube smoke is skipped/non-blocking, verify logs classify an external provider condition rather than an integration failure.

---

### Task 4: Perform final fresh code review

**Files:**
- Modify only issues found by review.

- [ ] **Step 1: Invoke the code-review workflow**

Use the Superpowers requesting-code-review skill against the full PR19 diff.

- [ ] **Step 2: Review specifically for**

- security-boundary regressions;
- stale callers after contract changes;
- cross-account/private cache leakage;
- leaked timers/listeners/animation frames;
- virtualization focus/accessibility regressions;
- updater downgrade/signature bypass;
- responsive first-paint races;
- search/radio retry loops;
- misleading capability copy.

- [ ] **Step 3: Fix blocking/high findings with regression tests**

Each fix is separately committed.

- [ ] **Step 4: Re-run affected validation plus the complete smoke matrix**

Expected: PASS on the final head.

---

### Task 5: Update PR #19 evidence

**Files:**
- Modify: PR #19 body
- Modify: `docs/PERFORMANCE_REVIEW.md` only if final measurements changed.

- [ ] **Step 1: Record exact final evidence**

Include:
- final head SHA;
- tests/workflows and conclusions;
- performance before/after;
- Windows packaged-runtime smoke;
- provider-smoke classification;
- remaining known limitations.

- [ ] **Step 2: State operational release boundary**

Explicitly state that merging PR #19 and publishing/signing a stable Desktop release remain user-approved actions outside implementation.

