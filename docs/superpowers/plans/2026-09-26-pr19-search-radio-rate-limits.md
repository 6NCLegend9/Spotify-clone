# PR19 Search and Radio Rate-Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent automatic radio/discovery work from starving direct user search while preserving abuse protection and useful 429 behavior.

**Architecture:** Add an explicit YouTube search-purpose contract shared by callers and the API route. Rate-limit keys include purpose, while the route also retains a separate hard global ceiling. User-triggered and background workloads therefore have independent soft budgets without removing overall abuse protection.

**Tech Stack:** Next.js route handlers, MongoDB/Mongoose rate-limit storage, React callers, Node tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-pr19-system-hardening-design.md`

## Global Constraints

- Existing non-YouTube rate limits must remain behaviorally unchanged.
- Automatic background work must not consume the interactive-search bucket.
- Every caller of `/api/youtube-search` must declare or inherit a deliberate purpose.
- 429 responses must include `retryAfter` and callers must not spin/retry aggressively.

## Review Focus

1. Radio extends queue four times while the user types: interactive suggestions must still work.
2. Guest and authenticated users behind the same NAT must retain abuse protection without all feature classes sharing one tiny bucket.
3. Unknown/missing purpose must fall back safely, not bypass limits.
4. Load-more pagination must stay in the same interactive/discovery bucket as its originating flow.
5. Provider 429 and HayKasa local 429 must remain distinguishable in diagnostics.

---

### Task 1: Define the YouTube search-purpose contract

**Files:**
- Create: `src/utils/youtubeSearchPurpose.mjs`
- Modify: `src/utils/rateLimit.js`
- Test: `test/youtubeSearchPurpose.test.mjs`
- Test: `test/rateLimitScopes.test.mjs`

**Interfaces:**
- Produces:
  - purposes: `interactive`, `radio`, `queue`, `discovery`;
  - `normalizeYoutubeSearchPurpose(value) -> purpose`;
  - `youtubeSearchLimitFor(purpose) -> { windowMs, max }`;
  - `getClientKey(request, scope = "")` where scope is included in the hashed key input.

- [ ] **Step 1: Write failing purpose/scope tests**

Assert unknown purpose becomes `interactive`; purpose configs are finite/positive; scoped keys differ for radio vs interactive while the same unscoped route behavior remains backward compatible.

- [ ] **Step 2: Implement purpose helpers and optional scoped client key**

Do not change callers outside YouTube search unless they opt into the new optional `scope` argument.

- [ ] **Step 3: Verify**

Run: `node --test test/youtubeSearchPurpose.test.mjs test/rateLimitScopes.test.mjs`.

- [ ] **Step 4: Commit**

Commit message: `refactor: add scoped youtube search limits`

---

### Task 2: Split the API route into purpose budgets plus a global ceiling

**Files:**
- Modify: `src/app/api/youtube-search/route.js`
- Modify: `test/support/youtube-search-route-loader.mjs`
- Modify: `test/youtubeSearchCache.test.mjs`
- Create: `test/youtubeSearchRateLimit.test.mjs`

**Interfaces:**
- Request query parameter: `purpose=<interactive|radio|queue|discovery>`.
- Route applies:
  1. purpose-specific bucket;
  2. larger route-wide hard ceiling.

- [ ] **Step 1: Add failing route tests**

Verify:
- exhausting radio budget does not exhaust interactive;
- exhausting queue does not exhaust discovery;
- global abuse ceiling eventually blocks all purposes;
- 429 includes `retryAfter`;
- omitted purpose is interactive.

- [ ] **Step 2: Implement the two-level limiter**

Use `getClientKey(request, `youtube-search:${purpose}`)` for purpose limit and a separate `youtube-search:global` key for the hard ceiling.

- [ ] **Step 3: Keep cache semantics unchanged**

Response cache headers remain 15-minute shared metadata cache.

- [ ] **Step 4: Verify**

Run: `node --test test/youtubeSearchCache.test.mjs test/youtubeSearchRateLimit.test.mjs`.

- [ ] **Step 5: Commit**

Commit message: `fix: isolate youtube search workload limits`

---

### Task 3: Update every YouTube-search caller

**Files:**
- Modify: `src/components/Searchbar.jsx`
- Modify: `src/components/YouTubeMusicResults.jsx`
- Modify: `src/components/MusicPlayer/YouTubePlayer.jsx`
- Modify: `src/hooks/useTrackCut.js`
- Modify: `src/components/Arcade/ArcadeSongPicker.jsx`
- Modify: `src/components/Homepage/MixCard.jsx`
- Modify: `src/components/DiscoveryPlaylist.jsx`
- Modify: `src/app/following/page.jsx`
- Modify any additional callers found by repository-wide search for `/api/youtube-search`.
- Test: `e2e/discovery.spec.js`
- Test: `e2e/playback.spec.js`

**Interfaces:**
- Interactive typing/full search: `purpose=interactive`.
- Automatic radio: `purpose=radio`.
- Queue/track-cut replacement actions: `purpose=queue`.
- Home/discovery/following enrichment: `purpose=discovery`.

- [ ] **Step 1: Add source-contract test listing every caller**

Create a test that scans `src/**` for `/api/youtube-search` and fails when a caller omits a purpose except explicitly documented compatibility fixtures.

- [ ] **Step 2: Update all callers**

Preserve existing search options/page tokens.

- [ ] **Step 3: Add mixed-workload browser regression**

Simulate repeated radio calls plus interactive search and assert search still receives successful mocked responses and does not inherit the radio bucket.

- [ ] **Step 4: Verify**

Run unit route tests plus Chromium discovery/playback suites.

- [ ] **Step 5: Commit**

Commit message: `fix: tag youtube searches by workload`

---

### Task 4: Reduce avoidable autocomplete pressure

**Files:**
- Modify: `src/components/Searchbar.jsx`
- Modify: `src/components/Arcade/ArcadeSongPicker.jsx`
- Create: `src/utils/searchRequestCache.mjs`
- Test: `test/searchRequestCache.test.mjs`
- Test: `e2e/discovery.spec.js`

**Interfaces:**
- Produces a small in-memory per-tab TTL cache/deduper for identical normalized interactive queries.
- Does not cache authenticated private API responses; only YouTube public metadata search results.

- [ ] **Step 1: Write failing cache/dedupe tests**

Assert identical normalized query within TTL shares one promise/result; different purpose/query does not; aborted request is not retained; max entries are bounded.

- [ ] **Step 2: Implement bounded request dedupe**

Use it only in autocomplete-style callers, not server-side authorization/private data.

- [ ] **Step 3: Verify typing behavior**

Playwright test types, deletes, retypes the same query and asserts duplicate network calls are reduced without stale suggestions.

- [ ] **Step 4: Commit**

Commit message: `perf: dedupe repeated youtube autocomplete searches`
