# PR #28 robustness, fuzzing and security audit

**Audited revision:** `b735f29dc214e9f423892975edb0dc413e31a9a9` (desktop 1.1.0 source), October 13, 2026.

**Outcome:** 13 actionable findings: **4 Medium, 9 Low**. No Critical or High vulnerability was confirmed. This is a broad, reproducible sandbox audit, not a claim of exhaustive coverage or production exploitability.

**Remediation:** see [implemented fixes and regression checks](FIXES.md). This report and its JSON evidence describe the pre-fix baseline.

## Execution and isolation

- Executed **2,694 cases**: 2,603 JavaScript route/module cases and 91 Python media-service cases. Inventoried all **49 API route files**. The JavaScript harness loaded 48 route modules; the NextAuth catch-all was excluded from execution. Tested anonymous and foreign-origin requests across 41 mutation exports, focused authenticated field fuzzing, provider query parameters, desktop artifact traversal, and 2,000 seeded malformed desktop URLs.
- All tests ran in this Linux workspace. Database, mail, authentication and provider calls were replaced with local synthetic adapters. Actual route validators, response builders, playlist Mongoose schema validation, desktop file stores/logging and media subprocess code ran. Authentication adapters test route gating, not the real login/session lifecycle. No production/staging endpoint received fuzz traffic; the JavaScript network trap recorded **zero attempted outbound fetches**.
- Media API tests used `httpx.ASGITransport` without TCP. The actual synchronous authorization dependency ran inline through an async adapter. Streaming generators also ran inline instead of Starlette's thread-pool wrapper because sandbox thread wakeups prevented those tests from completing. The job manager used an inert preparation task: queue limits, ownership and cancellation ran; actual yt-dlp/FFmpeg extraction did not.
- Temporary native data directories and media fixtures were removed. Process probes used only a synthetic Python producer, a short sleeping child and a supervisor timeout. No remaining test Python processes were observed.
- Local TCP binding returned **EPERM**. Playwright Chromium exited before a page could open. Browser DOM/Network/IndexedDB inspection, screenshots, computed layout/RTL measurements, real image/audio decoding, Electron IPC execution, Windows cookie encryption/ACLs and an installed Windows app's data directory therefore remain **unverified**. No visual regressions or actual browser memory crashes are claimed.
- Runtimes used: installed Node 24 and Next 15.5.25; installed FastAPI 0.141.1 / Pydantic 2.13.4 / httpx 0.28.1. The repository requests Node 22, Next ^15.5.27 and FastAPI 0.143.0. Results must be repeated with the pinned release runtime before release approval.

## Findings

| ID | Title | Category | Severity | Evidence |
| --- | --- | --- | --- | --- |
| F01 | Media output-limit cleanup can hang beyond its deadline | Availability / subprocess cleanup | Medium | Real child, actual `run_tool`, 3-second supervisor timeout |
| F02 | Shared web JSON parser has no request-byte limit | Resource exhaustion / input validation | Medium | Actual parser accepted 8,388,622-byte body |
| F03 | Arcade audio import reads an oversized file without a cap | File handling / client resource exhaustion | Medium | Actual function requested full buffer for a declared 1 GiB file |
| F04 | Prototype property names cause playlist category 500 errors | Input validation / unhandled validation failure | Low | Actual PATCH + Mongoose schema: three 500 responses |
| F05 | Empty, invalid and spoofed cover data is persisted | File corruption / MIME validation | Low | Four corrupt cover PATCH requests returned 200 |
| F06 | Media size guard trusts declared length and echoes oversized invalid input | Input validation / response amplification | Low | ASGI body >1 MiB with length 1 returned a >1 MiB 422 body |
| F07 | Huge Content-Length value raises an unhandled exception | Malformed header handling | Low | Authenticated ASGI request returned 500 |
| F08 | Cover FileReader abort never settles the import promise | Cancellation / stuck UI state | Low | Synthetic abort left the actual promise pending |
| F09 | Native log redaction misses secrets inside free-text values | Conditional sensitive data logging | Low | Synthetic token survived under the `error` key |
| F10 | Account history remains plaintext in storage after ordinary logout | Local privacy / data retention | Low | Actual cache serialization + logout source inspection |
| F11 | Invisible/control-only names pass name validation | Input validation / blank UI labels | Low | Actual signup 201 and playlist PATCH 200 |
| F12 | Session lookup cache retains expired user entries without a bound | Memory retention / availability | Medium | Actual cache retained 9,999 expired entries after 10,000 lookups |
| F13 | Username truncation splits an emoji and causes signup 500 | Unicode boundary / input validation | Low | Actual signup handler returned 500 for a valid Unicode input |

### F01 — Media output-limit cleanup can hang beyond its deadline

**Category:** Availability / subprocess cleanup. **Severity:** Medium.

**Location:** `media-service/app/processes.py:14` and `:52`.

**Reproduction:** Run `python3 docs/qa/security-audit/run_media.py`. Find `subprocess-output-limit`. The probe invokes the actual `run_tool` with a child executing `print("A"*(6*1024*1024))`, the default 4 MiB output cap and a 0.5-second deadline. A separate supervisor terminates the probe after 3 seconds.

**Expected:** The child is killed/reaped and `tool_output_limit` or `tool_timeout` returns promptly.

**Actual:** The probe requires the 3-second supervisor kill. The output collector stops draining its pipe after reaching the cap; cleanup kills the child and awaits `process.wait()` while unread pipe data can keep the transport unfinished. The `finally` cleanup has no deadline.

**Impact:** A large upstream tool output can occupy a preparation worker beyond its configured deadline. With two workers, repeated triggering could exhaust preparation capacity. The synthetic trigger is confirmed; a real YouTube source that produces such metadata was not tested.

**Recommended fix:** Bound cleanup separately. Continue draining/discarding output or close pipe transports after failure, terminate the process group, then reap with a deadline. Add a regression that exceeds the default cap and asserts no surviving child or occupied semaphore.

### F02 — Shared web JSON parser has no request-byte limit

**Category:** Resource exhaustion / input validation. **Severity:** Medium.

**Location:** `src/utils/apiResponseCore.mjs:99`; desktop auth exchange separately calls `request.json()`.

**Reproduction:** Run the JavaScript harness and inspect `json:8MiB-body`. Payload: `JSON.stringify({padding: "A".repeat(8*1024*1024)})`. Send it through `readRequestJson` using a real Web `Request`. Also inspect `json-concurrent-64x128KiB`.

**Expected:** A per-route limit rejects an oversized body while streaming, before full JSON materialization.

**Actual:** The shared parser accepted all 8,388,622 bytes. Sixty-four concurrent 131,086-byte bodies completed; this run's RSS increased by 19,136,512 bytes. That RSS observation alone is **not** evidence of a memory leak. Field limits do not limit unrelated JSON properties or aggregate body size. The media web route also reads the full text before checking its 4,096-character limit.

**Impact:** Unnecessary memory/CPU pressure, particularly on self-hosted deployments. Route authentication/rate limiting and platform limits constrain reachability. Vercel's ingress limit may reject this specific 8 MiB payload before the helper runs; production ingress was not tested.

**Recommended fix:** Count received UTF-8 bytes and reject oversized streams early with 413, including absent Content-Length. Set route-specific limits large enough for legitimate covers (up to 320,000 characters) and smaller limits for settings/auth. Cancel failed/aborted readers and bound JSON nesting where appropriate.

### F03 — Arcade audio import reads an oversized file without a cap

**Category:** File handling / client resource exhaustion. **Severity:** Medium.

**Location:** `src/components/Arcade/ArcadeStage.jsx:91`, file selection around `:290`.

**Reproduction:** Run the JavaScript harness, case `arcade-unbounded-file-read`. The extracted actual `chartFromFile` receives `{name:"oversized.mp3", size:1073741824, arrayBuffer:...}`. The arrayBuffer adapter records the call and returns an empty buffer to avoid allocating 1 GiB.

**Expected:** Reject unsupported, empty or oversized files before reading/decoding.

**Actual:** `arrayBuffer()` is called without checking size or type, even before AudioContext support is checked. Subsequent code copies the buffer and decodes/analyzes it. The picker `accept="audio/*"` is only a file chooser hint.

**Impact:** A user-selected large audio file can consume substantial memory or freeze the renderer. A real 1 GiB allocation/browser crash was deliberately not attempted, so that consequence is inferred from the confirmed read path.

**Recommended fix:** Bound file bytes before creating the object URL/read, validate supported types with decoding, bound decoded duration/sample/channel counts, and cancel stale analyses. Surface invalid/corrupt-file errors instead of silently producing a fallback chart for unreadable audio.

### F04 — Prototype property names cause playlist category 500 errors

**Category:** Input validation / unhandled validation failure. **Severity:** Low.

**Location:** `src/utils/playlistThemes.js:103`; playlist PATCH category branch; `src/models/Playlist.js` category enum.

**Reproduction:** As an authenticated owner in a local sandbox, PATCH `/api/userPlaylists` with:

```json
{"playlistId":"<owned-playlist-id>","action":"category","value":"__proto__"}
```

Repeat with `constructor` and `toString`. The harness uses a synthetic owner, a real Playlist document and its real schema validation; inspect `playlist:category:case:17` through `:19`.

**Expected:** 400 for an unsupported category, or safe normalization to Pop.

**Actual:** Each returns 500. `PLAYLIST_THEMES[trimmed]` sees inherited properties as valid categories. Mongoose rejects the resulting category at save; the route converts the validation error to INTERNAL_ERROR.

**Impact:** Predictable request failures and incorrect theme lookup for corrupt legacy values. No prototype modification, privilege escalation or database injection was observed.

**Recommended fix:** Use `Object.hasOwn(PLAYLIST_THEMES, value)` or a Set of explicit category strings; reject invalid values before mutation. Handle expected schema validation errors as 400/422.

### F05 — Empty, invalid and spoofed cover data is persisted

**Category:** File corruption / MIME validation. **Severity:** Low.

**Location:** `src/utils/playlistThemes.js:155`, playlist cover/details handlers and `src/components/PlaylistCover.jsx`.

**Reproduction:** As an owner, PATCH `/api/userPlaylists` with action `cover` and each value:

```text
data:image/png;base64,
data:image/png;base64,NOT_BASE64!!!
data:image/png;base64,IyEvYmluL3NoCmVjaG8gYXVkaXQ=
data:image/jpeg;base64,TVogZmFrZSBleGVjdXRhYmxl
```

The last two contain synthetic shell text and `MZ fake executable` bytes. No script/executable was run.

**Expected:** Reject zero-byte, malformed-base64 and non-image contents.

**Actual:** All four return 200 and preserve the exact data URL. `isCoverDataUrl` checks only the prefix and string length. PlaylistCover places the value in `<img>` with no load-error fallback.

**Impact:** Broken artwork can be persisted and displayed to playlist viewers. This does **not** demonstrate script execution; `<img>` rendering and CSP constrain execution.

**Recommended fix:** Strictly decode base64, require nonempty bytes, verify magic bytes and bounded image dimensions, then decode/re-encode with resource limits. Reject malformed covers consistently on create/update; provide an image-error fallback.

### F06 — Media size guard trusts declared length and echoes oversized invalid input

**Category:** Input validation / response amplification. **Severity:** Low.

**Location:** `media-service/app/main.py:42`, FastAPI default validation responses.

**Reproduction:** In the ASGI harness, POST `/v1/jobs` with synthetic valid service authorization, `Content-Length: 1`, and valid job fields plus `padding: "A"*1048576`. Inspect `jobs-oversize-forged-length`.

**Expected:** Reject after 4,096 actual received bytes with 413 and a small error response.

**Actual:** The middleware accepts the declared length; Pydantic parses the entire payload, rejects the extra field and returns 422 with **1,048,690 response bytes**, including that supplied input. A correctly declared oversized body returns 413.

**Impact:** The application layer does not enforce its stated byte cap. Valid service credentials are required; unauthorized requests returned 401. Normal HTTP servers may reject mismatched Content-Length before ASGI receives it. This is **not** a confirmed remote HTTP bypass, secret disclosure or authentication bypass.

**Recommended fix:** Enforce an actual ASGI receive-byte limit and a reverse-proxy body cap. Return concise validation errors without copying arbitrary input values. Verify behavior through the pinned uvicorn/proxy stack, including chunked requests.

### F07 — Huge Content-Length value raises an unhandled exception

**Category:** Malformed header handling. **Severity:** Low.

**Location:** `media-service/app/main.py:43`.

**Reproduction:** In the ASGI harness, submit a valid job with valid synthetic authorization and `Content-Length: "9"*5000`; inspect `jobs-overflow-content-length`.

**Expected:** 400/413 without an exception.

**Actual:** 500 `Internal Server Error`. Python's integer string conversion limit rejects the decimal header; `int(length)` is not guarded. Negative length correctly returns 413.

**Impact:** An authenticated malformed request produces an avoidable server error. Transport-level rejection and real deployment reachability are unverified.

**Recommended fix:** Validate header digit count before integer conversion, catch conversion exceptions, and still enforce the actual received-byte cap.

### F08 — Cover FileReader abort never settles the import promise

**Category:** Cancellation / stuck UI state. **Severity:** Low.

**Location:** `src/utils/imageOptimize.js:48`; `src/components/CoverUploader.jsx` busy state.

**Reproduction:** Run `cover-client-read-abort`. A local FileReader adapter invokes `onabort` instead of `onload/onerror` while the actual `resizeCoverFile` is awaiting its read.

**Expected:** Reject with a cancellation error so the uploader's finally block clears `busy`.

**Actual:** No `onabort` handler exists; the promise remains pending after the 50 ms watchdog. Source inspection shows the component cannot reach its finally block while that promise is unsettled. Decoder failure, by contrast, rejects cleanly in the injected decoder-failure case.

**Impact:** An aborted platform file read can leave “Preparing...” and disabled upload controls indefinitely. Native browser abort initiation was not tested.

**Recommended fix:** Add `reader.onabort`, cleanup handlers on settlement, accept a cancellation signal, and guard asynchronous completion after unmount/replacement.

### F09 — Native log redaction misses secrets inside free-text values

**Category:** Conditional sensitive data logging. **Severity:** Low.

**Location:** `desktop/src/nativeLogger.mjs:6`, free-text error logging in `desktop/src/main.mjs:426` and `:953`.

**Reproduction:** In a temporary native directory, call:

```js
logger.error("audit", {
  token: "AUDIT_SECRET",
  error: "request https://local.invalid/?token=AUDIT_SECRET"
});
```

Inspect `logs/desktop.log` or harness case `native-log-redaction`.

**Expected:** Sensitive values are absent from persistent/exported logs, regardless of their field name.

**Actual:** The `token` field becomes `[redacted]`; the synthetic token embedded in `error` survives. Email strings in otherwise unrestricted fields are also retained. Real errors are passed under the `error` key by native callers, and diagnostics can return log entries to the trusted renderer.

**Impact:** If a library/upstream error includes a credential or signed URL, it can be retained on disk and included in shared diagnostics. No actual credential leak was found. New log files use POSIX 0600 in this Linux test; Windows ACLs were not checked.

**Recommended fix:** Log stable error codes instead of raw exception messages. Remove URL queries/userinfo and known bearer/token/password patterns from free text; allowlist fields and scrub diagnostic exports.

### F10 — Account history remains plaintext in storage after ordinary logout

**Category:** Local privacy / data retention. **Severity:** Low.

**Location:** `src/utils/accountCache.mjs:22`, `src/hooks/useHomeFeed.js`, `src/utils/playbackSnapshot.mjs`, ordinary sign-out in Navbar/Profile.

**Reproduction:** The harness serializes an account-scoped history item containing `AUDIT_PRIVATE_LISTENING_HISTORY`; `account-cache-plaintext-history` confirms the text is readable. In a local browser/Windows follow-up, play a track, log out normally, and inspect `heykasa:history:v1:account%3A...` / `heykasa:playback:v1:account%3A...` in LocalStorage. This final browser step remains unexecuted.

**Expected:** A clearly chosen privacy policy, with account cache removal on logout or an explicit retention/clear-data control.

**Actual:** Actual serialization is plaintext. Ordinary logout calls `signOut()` without removing those account cache entries. Account ownership and read-time TTL checks prevent the helper from restoring another account's history, but they do not delete the old raw value. Account deletion explicitly clears storage, unlike logout.

**Impact:** Someone with access to the same browser/Electron profile or copied profile data can inspect prior listening history and account identifiers after logout. This is a local privacy risk, not server authorization bypass. No plaintext password/session token was found in these cache serializers.

**Recommended fix:** Remove account-specific history/playback/recommendation caches on logout, provide a clear-local-data control, and document retention. For desktop encrypted history, use OS-backed key storage; storing an encryption key beside the browser data would not protect it.

### F11 — Invisible/control-only names pass name validation

**Category:** Input validation / blank UI labels. **Severity:** Low.

**Location:** Signup username validation and playlist name validation.

**Reproduction:** Set username or playlist name to `"\u200b"` (zero-width space) or `"\u0000\u0001"`. The harness's four `invisible-*` cases exercise the actual routes; playlist cases also use actual schema validation.

**Expected:** Reject a name that has no visible content.

**Actual:** Signup returns 201 and playlist PATCH returns 200. `trim()` removes neither the zero-width space nor these control bytes, and the required-name schema does not detect invisible-only content.

**Impact:** Blank-looking account/playlist labels, confusing navigation and potential label impersonation. No code execution was observed.

**Recommended fix:** Reject disallowed control characters and names without visible content while preserving legitimate non-Latin/RTL names. Keep accessible fallback labels for corrupt legacy values.

### F12 — Session lookup cache retains expired user entries without a bound

**Category:** Memory retention / availability. **Severity:** Medium.

**Location:** `src/utils/sessionAuth.js:15`, `:40`.

**Reproduction:** Run the JavaScript harness, `session-cache-expired-entry-retention`. It loads the actual session module with synthetic user lookup results and an isolated clock/global cache. Supply 10,000 distinct valid session identities, advance the clock by 5 seconds (past the 4-second TTL), then perform one fresh lookup.

**Expected:** Expired entries are reclaimed and the cache has a maximum size.

**Actual:** Cache size remains 10,000; 9,999 entries are expired but still retain their user objects. Expiration controls reuse, not deletion. There is no general prune, LRU cap or periodic cleanup. The specific delete branch only handles a non-expired cached user whose identity no longer matches.

**Impact:** Memory retention grows with distinct user/version identities over a long-lived process lifetime. This confirms retained expired references, not a measured production out-of-memory failure. Actual sessions must be valid; anonymous clients cannot freely mint signed identities through the tested auth boundary. Session revocations can leave old version keys behind as well.

**Recommended fix:** Bound the cache and prune expired entries on access/insertion or through a controlled cleanup timer. Prefer compact immutable session records instead of full user documents, and evict old keys on revocation. Test expired entries and a large population of unique accounts.

### F13 — Username truncation splits an emoji and causes signup 500

**Category:** Unicode boundary / input validation. **Severity:** Low.

**Location:** `src/app/api/signup/route.js:45` and `:88`.

**Reproduction:** POST to local `/api/signup` with a valid unused synthetic email/password and `userName: "a" + "😀".repeat(30)`. Run `signup-unicode-surrogate-boundary` for a database/mail-isolated reproduction through the actual route.

**Expected:** Reject the length or normalize the name to valid Unicode, without a 500 response.

**Actual:** The route clips to 50 UTF-16 code units. The initial ASCII character places that boundary inside an emoji's surrogate pair. `encodeURIComponent(userName)` then throws URIError when building the avatar URL, and the handler returns 500 INTERNAL_ERROR. This happens after the user-data record has been created; the route's error path requests its cleanup. A real persistence rollback was not verified.

**Impact:** A legitimate multilingual username at the clipping boundary fails account creation. Isolated malformed surrogate input can trigger the same encoding failure. No sensitive response disclosure was observed.

**Recommended fix:** Validate Unicode well-formedness and perform code-point/grapheme-safe truncation, or reject overlong input before creating database records. Build/validate dependent URLs before persistence and test odd/even surrogate boundaries.

## Additional observations and successful checks

- Malformed/empty JSON, primitive roots and interrupted JSON streams were rejected with validation errors. Invalid numeric settings, non-boolean flags, long IDs, operator objects (`{"$ne":null}`), SQL-like strings, emoji floods and unsupported types were exercised. Valid bounded float fade settings are intentionally accepted.
- Native auth links require the expected host and bounded base64url code/state. Unsafe renderer hosts, filesystem/JavaScript URLs and malformed URL inputs did not gain renderer trust. Desktop artifact traversal inputs returned 404. Native state matching/PKCE source uses timing-safe checks; a complete real sign-in round trip was not executed.
- The tested private mutation handlers returned 401 with anonymous adapters and rejected foreign origins where required. Public signup/reset/exchange behavior is separate. These checks do not replace real authorization/IDOR tests with two persisted users and actual sessions.
- Empty/truncated native settings and appearance files recovered to defaults. Arbitrary synthetic password fields were not retained in the native settings object. Native preferences hold configuration/installation identifiers, not session credentials. Auth cookies are set HttpOnly/Secure as appropriate in a persistent Electron session; Windows DPAPI encryption and cookie files were not inspected.
- Invalid media signatures/expired leases were rejected. Byte ranges returned expected 200/206/416 responses; cross-subscriber job access was blocked, cancellation changed state, and the configured test queue cap of five pending jobs was enforced. A short child deadline returned `tool_timeout` normally.
- A deliberately truncated media file during delivery yielded a 200 response declaring 100 bytes but producing zero. This is an additional robustness observation under deliberate local cache corruption, not a demonstrated remote attacker capability. Validate immutable completed assets and retain/open their file descriptors through delivery; real proxy/client behavior after stream interruption is unverified.
- React text encoding and verification-email escaping passed the exercised HTML/script payloads. No dynamic user-text `dangerouslySetInnerHTML` sink was found; the layout's JSON-LD sink uses application metadata. Production CSP contains `unsafe-inline`, which weakens defense in depth but is not an XSS finding by itself. There is no claim that every UI component or navigation flow is XSS-free.
- Scanned **741 tracked source/build-client files** with private-key, AWS, GitHub-token, Google-key and JWT patterns. One Google-format match is the explicitly documented public YouTube WEB/InnerTube client key in `youtubeApi.js`; it is not treated as a HayKasa private credential. No other matching credential was found. The scanner deliberately excluded credential/environment files and did not print key values. Pattern scans cannot prove the absence of all secrets.
- JavaScript observed 66 5xx results: **three confirmed category 500s and one confirmed signup 500** and **62 expected unconfigured-provider 503s**. The latter are sandbox fixtures, not discovered availability bugs. No unhandled JavaScript harness exception occurred. The media harness recorded one deliberately triggered 500 header response; its subprocess timeout is F01.

## Reproduction commands and evidence

From the repository root:

```sh
node docs/qa/security-audit/run.cjs /tmp/haykasa-security-audit.json
python3 docs/qa/security-audit/run_media.py /tmp/haykasa-media-audit.json
```

The JavaScript harness uses installed repository dependencies. Python requires FastAPI, Pydantic and httpx. The harnesses do not need a real database or provider credentials. They intentionally demonstrate existing failures; inspect recorded observations rather than treating a zero script exit code as “the application passed”. Keep these destructive/corruption fixtures in a sandbox.

- `haykasa-security-audit.json`: recorded observations; the 2,000 seeded random URL cases are summarized to keep the evidence compact. The full raw set is regenerated by the script.
- `haykasa-media-audit.json`: all 91 recorded media observations.
- `secret-scan.json`: redacted pattern-scan results.

No application fix, installer publication, merge or production deployment is part of this audit. Release approval still requires pinned-runtime repetition, a permitted browser sandbox, real two-user authorization tests, and a clean Windows VM installation/update/privacy inspection.
