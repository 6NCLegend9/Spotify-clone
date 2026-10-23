# PR40: audio playback requirements, integration trace and evidence

Owner: Codex. Review: the user's second Codex reviews after the initial PR40 work;
review findings must be reconciled here rather than treated as a second implementation.

## Authorization and release boundaries

The user authorized work in PR40 on 2026-10-22. Keep the existing Next.js/React,
Electron, Java/Media3, Python/FFmpeg/yt-dlp, MongoDB and private Blob stack.
Opening/updating this PR is authorized. Merging, production activation, changing
provider credentials/access methods, provisioning services and publishing native
releases are outside this work's current authorization. Normal branch CI/preview
creation may run after pushes; neither establishes a playback pass.

**Source access is the first feasibility gate.** Production playback stays disabled.
Do not bypass provider restrictions. A failed source boundary stops provider-backed
end-to-end testing. Isolated tests and independent corrections may proceed, but do
not count them as live playback, background reliability or audible-output proof.

Statuses: **pending** (not implemented), **implemented** (changed, not fully tested),
**verified** (only within its cited evidence scope), **blocked** (dependency or device
unavailable), **explicitly deferred** (outside the agreed first release).

**Current PR scope is independent, verifiable repairs and this release checklist,
not a completed first-release streaming/DSP engine.** The failed source gate and
the pending native/durable-preparation requirements prevent that completion claim.

## Requirements checklist

| ID | Requirement / affected components and platforms | Status | Evidence or next gate |
| --- | --- | --- | --- |
| W01 | Read applicable AGENTS.md and relevant skills before implementation | verified | No applicable repository/parent AGENTS.md found. Ponytail, cloud runtime/networking, Vercel verification, backend and storage skills read. |
| W02 | Trace UI -> player -> native bridge/service -> API -> preparation -> storage | verified | Initial flow below; extend before each affected-stage edit. |
| W03 | Preserve concurrent work; isolated branch and small complete commits | verified | `/workspace/HayKasa-pr40`, branch `feat/pr40-audio-playback`; original worktree preserved. |
| W04 | Diff, relevant checks, integration review, then checklist reconciliation after every stage | implemented | Initial and upload-stage commands/results below; keep updating for later stages. |
| S01 | Repeated uncached playback from actual target deployment; startup/failure telemetry | blocked | Production disabled; two fresh hosted preview attempts returned source_access_restricted. No TTFA/bitrate measured. |
| S02 | 10 authorized recordings x 3 separated windows; distinguish cold/warm; stop access-denied attempts | blocked | Requires a working authorized source in the intended deployment environment. Existing fixed-sample limits remain in force. |
| S03 | Keep source denial distinct from disabled service, missing authentication and transient failures | verified | Automated config/diagnostic checks pass; arbitrary upstream details remain excluded. Not a live access pass. |
| A01 | Preserve source codec/audio packets without unnecessary re-encoding | verified | Local FFmpeg AAC/Opus fixtures preserve packet hashes and report 48 kHz/stereo. Live provider acquisition remains blocked. |
| A02 | Codec policy: alternate compatible rendition of same recording; disclosed one-time conversion; explicit Original/unsupported fallback | pending | Must reach selection, delivery metadata, player and native capability negotiation together. |
| A03 | Separate Original/Processed modes; no browser-wide bit-perfect promise | pending | Original bypasses HayKasa DSP. Flat filters are not proof of untouched hardware output. |
| A04 | Persistent media elements/reusable Web Audio nodes; real CORS and autoplay handling | pending | Reuse existing deck; test element identity, gestures, denied play and context resume. |
| A05 | Actual Safari EQ qualification per OS/browser/transport/codec/output route | blocked | Physical supported iPhone/Mac capture unavailable. canPlayType/analyser/codec checks are insufficient. |
| A06 | Safari native HLS Original-only unless qualified; explicit completed progressive AAC processing fallback | pending | Never silently claim EQ is applied to audible HLS. Unsupported combinations remain unavailable. |
| A07 | Multi-band EQ, smoothed controls, finite output, reusable native/web DSP | pending | Android currently has no native EQ processor; do not advertise support before end-to-end tests. |
| A08 | Final -1 dBFS sample-peak ceiling after all gains/operations/summing | pending | Existing compressor/headroom is not evidence. Test transients and decoded lossy sources at 44.1/48 kHz. |
| A09 | Measured normalization separate from creative compression and peak limiting | pending | Current Quiet/Normal/Loud gains are fixed .72/1/1.08; no upward normalization of unanalyzed tracks. |
| A10 | True-peak protection / hardware bit-perfect output | explicitly deferred | First release promises only tested sample-peak protection at HayKasa's controlled PCM output; no hardware-output guarantee. |
| A11 | BPM, stereo widening, creative DRC and crossfade enhancement | explicitly deferred | Native queue/renewal/background reliability precedes these. Width remains unity; any retained summing must precede final protection. |
| N01 | Native Android owns queue, repeat/shuffle, advancement and next-source preparation | pending | Current single MediaItem plus JavaScript ended transition is insufficient. |
| N02 | Native Android owns renewal and reconnect with scoped revocable authentication | pending | Current WebView timer is insufficient; never export storage/provider secrets to native UI code. |
| N03 | Full acknowledged play/pause/seek contract, command IDs and generation/sequence protection | pending | Initial observed-event adapter corrections are tracked separately below; full protocol-v2 commands remain unimplemented. |
| N03a | Legacy-compatible adapter Play waits for observed native playback; seek uses native position | verified | Isolated bridge/deck tests pass: delayed/duplicate Play, waiting, native playing, pause/error/clear/dispose/deadline, stale events, seeked and old-APK progress. Not device output proof. |
| N03b | Native telemetry separates isPlaying from playWhenReady; seek discontinuity publishes position | implemented | Compiled into debug APK and instrumentation APK. Six unrelated native policy/unit tests pass; actual service execution remains unverified here. |
| N04 | Notification/lock-screen/Bluetooth controls, interruptions, audio focus and route changes | pending | Verify actual service and platform controllers, including stale commands and user pause. |
| N05 | Screen-off >=30 min, >=10 transitions, WebView suspended/destroyed, forced lease renewals | blocked | Requires new service implementation plus runtime test; emulator is distinct from a physical phone. |
| N06 | Required Android HLS module, restricted manifest/segment URL policy and new native binary | pending | Existing APK permits only `/v1/assets/<32hex>` and lacks Media3 HLS. Website updates cannot supply native code. |
| N07 | Protocol/native-build capabilities, older-client behavior and update requirement | pending | Keep v1 completed-asset clients working; do not advertise v2 features to old APK/EXE builds. |
| B01 | Playback during extraction is required in first release | blocked | Source feasibility gate fails. Completed-file fallback cannot be counted as this requirement. |
| B02 | Complete HLS/fMP4 publication: init, immutable segments, EVENT revisions, ENDLIST, validation | blocked | Depends on S01 and durable preparation; raw fragmented MP4 stdout is not this implementation. |
| B03 | Separate prepared/buffered/native-seekable ranges; reject beyond prepared intersection | pending | No silent clamp/success. A rejected seek preserves position and returns NOT_PREPARED. |
| B04 | Playback contract: states, asset/rendition/generation, ranges, expiry, renewal, retries and acknowledged commands | pending | Implement consumers and producers together; don't publish an unused contract as a completed feature. |
| B05 | Source/delivered/processed/output metadata separate; unknowns and estimates labeled | pending | Bitrate is not processed fidelity; lossy bit depth remains unknown. |
| B06 | Durable jobs, outbox/queue dispatch, worker leases/fences and globally bounded concurrency | blocked | Provisioning/integration and S01 gates; process-local maps/semaphores are not deployment-wide coordination. |
| B07 | Cross-request shared preparation with access-scoped deduplication and independent subscriber leases | pending | Isolated reproduction: one manager coalesces; separate managers start two preparations. |
| B08 | No whole-track memory allocation during upload; close file on success, error and cancellation | verified | File body replaces read_bytes; actual pinned SDK iterator uses bounded parts. Isolated adapter tests cover success, asset interruption, manifest failure, cancellation, ranges and account isolation. |
| B08a | Actual SDK in-flight multipart-task cancellation and remote incomplete-part cleanup | pending | Adapter file closure and mocked interruption do not prove remote multipart abort. Pinned SDK defaults can buffer six 8 MiB parts per preparation. |
| B09 | Bounded cache, active-lease protection, abandoned-job cleanup and paginated segment cleanup | pending | Current object-count sweep cannot be treated as a segment-cache design. |
| B10 | SSRF/redirect/DNS/IPv6/egress restrictions, subprocess/byte/time limits and redacted diagnostics | pending | Preserve existing supported-ID policy; no arbitrary remote-URL expansion before controls and tests. |
| V01 | Controlled web/desktop/mobile startup, failure UI and Retry/late-readiness controls | verified | Seven compiled-UI Playwright scenarios pass, including stale-switch Retry, Pause before readiness and delayed source-to-iframe fallback with/without explicit Pause. Synthetic SDK; installed apps/live playback remain V02. |
| V02 | Actual playback, DSP, seek, queue, renewal, reconnect and background verification by platform | blocked | Each behavior needs separate evidence; compilation and synthetic clocks do not pass this row. |
| V03 | Publish commit, changed files, checks/results, limitations and unresolved checklist | implemented | PR40 contains the initial handoff; this review milestone records affected files, before/after evidence and remaining gates below. Report the pushed commit and its CI separately. |
| V04 | Second Codex review and back-and-forth integration review | implemented | Reviewer found one P2 at 7f2a40a; R01/R02 are corrected and locally verified. Await review of the correction; agreement is not assumed. |
| R01 | Delayed YouTube fallback resumes after SDK readiness without a user Pause | verified | Compiled-UI test failed at 7f2a40a, then passed after this correction: 9-second wait exceeds the transition guard; same occurrence progresses unmuted without Retry. Controlled SDK/API evidence only. |
| R02 | Explicit Pause while fallback waits remains authoritative after SDK readiness | verified | Actual registered notification Pause handler invoked during the 9-second wait; ready active deck remains paused with no Play/unmute calls. Original Retry and Pause-before-ready scenarios also pass. Controlled browser evidence only. |
| R03 | Keep PR40 in draft while this race or new-head CI is incomplete | verified | PR40 is draft. Every GitHub check on old head 7f2a40a is green, including API 33/36; that is not a CI pass for the upcoming fix. |

## Existing connected implementation

1. `MusicPlayer/YouTubePlayer.jsx` mounts/selects decks and owns JavaScript queue,
   ended transitions, crossfade, failure recovery and volume settings. Redux and
   `PlaybackPersistence.jsx` own selection/session restoration.
2. `media/nativeMediaDeck.mjs` resolves assets, sets the media source, applies web
   DSP, renews on a JavaScript timer and converts native/media events to player state.
3. Web/Electron use HTML media and `nativeAudioGraph.mjs`. Android audio uses
   `androidAudioElement.mjs` -> `MainActivity.java` origin-scoped message listener
   -> `PlaybackService.java` -> ExoPlayer. Native playback currently receives a
   single signed completed-asset URL, not a queue/renewable preparation capability.
4. `resolveMediaAsset.mjs` -> `/api/media/resolve` validates session/origin/request,
   scopes receipts and calls the bound Python service. Production's playback flag
   rejects this before source extraction when disabled.
5. `media-service/app/vercel_app.py` creates a request-local `JobManager`, awaits
   full preparation, uploads a completed asset and private manifest, and serves
   signed byte ranges. Renew/poll consult Blob rather than retained local files.
6. `jobs.py` invokes yt-dlp, downloads the source, remuxes using codec copy, probes
   metadata and retains local in-memory job state. `selection.py` chooses formats.
7. `assets.py`, private Blob manifests, Next receipt validation, the native URL
   policy, native dependencies and version negotiation are connected trust boundaries.

Required tests/callers live under `docs/qa/android`, `docs/qa/background-playback`,
`docs/qa/audio-quality`, `docs/qa/vercel-media`, `docs/qa/security-audit`, and Android
unit/instrumentation tests. Read affected fixtures and binary packaging paths before
changing protocols. A generated-tone fixture proves only its stated native path.

## Gate evidence (observed, 2026-10-22 UTC)

Production main commit: `70a93bc9352aa74ac00d45589ed3e89e96ecfe66`.
Existing protected diagnostic preview: `dpl_5Tm5mGGziRFGi213ttY4PuurP2Qy`, source
`b7fb147e20312b9fa13162c9224c9a5268ccb826`; relevant tree matches main.

| Attempt | Actual result | Timing scope |
| --- | --- | --- |
| Production GET /api/media/resolve | 200; enabled:false, service_disabled | 2.2 s request round trip; no extraction |
| Preview preflight sample on-and-on | 503; storage/range passed; extraction_mp4-aac; source_access_restricted | 13.6 s diagnostic/MCP round trip, not time to first audio |
| Preview preflight sample invincible | 503; storage/range passed; extraction_mp4-aac; source_access_restricted | 11.5 s diagnostic/MCP round trip, not time to first audio |

Worker stderr classified both fresh attempts as YouTube bot restrictions. The probe
returns on the first extraction failure, so this is not an Opus-profile result.
No live audio frames, speaker output, bitrate or startup latency were measured.
Existing artifacts: `artifacts/pr39-merged-production-2026-10-21/` and
`artifacts/ponytail-production-playback-2026-10-21/` in the original workspace.
No unchanged source-denial test is repeated to manufacture a success.

## Milestone log

### Initial trace and preserved audit repairs

- Instructions and skills checked; original checkout not modified.
- Existing startup/session race, compact error UI and safe failure-classification
  repairs copied into this branch. Their prior evidence is in
  `docs/qa/ponytail-playback-audit-2026-10-21.md`; PR40 results still need recording.
- Source access remains blocked. No provider bypass, production flag change,
  native release, merge or claim of completed first-release architecture.

Initial automated commands (all exit 0 in the isolated PR worktree):

- `node docs/qa/vercel-media/config-check.cjs`: safe failure categories, internal
  service binding, origin/metadata checks, legacy service and production gate.
- `node docs/qa/background-playback/check.cjs`: early guest Play, account isolation,
  bounded recovery and deck lifecycle; simulated media, not screen-off device proof.
- `node docs/qa/android/resolve-check.cjs`: resolver deadlines, cancellation and cleanup.
- `/tmp/haykasa-source-audit-venv/bin/python docs/qa/audio-quality/check.py`:
  locally generated AAC/Opus packet-identical remux and measured fixture metadata.
- `git diff --check`: no whitespace errors.

### Completed-file upload allocation correction

- Replaced whole-file `read_bytes()` with an open file body kept alive for the
  duration of the pinned SDK's multipart upload. No wire/API/codec change.
- Read and reviewed `persist`, both callers, private manifest/range handlers,
  SDK file-body iteration and multipart behavior, and their isolated fixture.
- `/tmp/haykasa-source-audit-venv/bin/python docs/qa/vercel-media/check.py`: exit 0.
  The actual persist path runs with `Path.read_bytes` forbidden; bounded SDK file
  iteration, file closure after success/error/cancellation, no failed manifest
  publication, authenticated ranges, subscriber isolation and redaction pass.
- These are isolated local checks with mocked Blob requests, not a hosted upload
  or new extraction-time streaming implementation. SDK task/remote-part cleanup
  remains visible as B08a rather than being implied by file-handle closure.

### Android observed playback and seek feedback

- Traced `nativeMediaDeck` -> `androidAudioElement` -> MainActivity's same-origin
  message listener -> PlaybackService -> ExoPlayer listener -> bridge events.
- Adapter Play now shares a bounded pending promise and resolves on the native
  `playing` event, not message posting. Pause, source change, disposal, native error
  and a 30-second deadline settle pending requests. Seek position follows feedback.
- Existing APKs already send playing/progress events, so they remain compatible;
  new APKs also emit seeked and separate actual playback from playWhenReady.
- `node docs/qa/android/check.mjs`: exit 0, isolated event-driven adapter/deck tests.
- `node -r /tmp/haykasa-playwright-system.cjs docs/qa/android/browser.cjs`:
  exit 0 with real Chromium DOM and a synthetic native bridge. Updated the fixture
  to deliver native feedback before awaiting Play, and assert Play/seek remain
  unconfirmed until feedback. No external media requests or device output proof.
- Android offline Gradle `:app:testDebugUnitTest :app:assembleDebug
  :app:assembleDebugAndroidTest`: BUILD SUCCESSFUL; six unit tests, no failures.
  Both APKs compiled; no instrumentation execution or physical speaker claim.
- Debug APK SHA-256: `bd0e2931e7a33218df35636136ec03edc4166aecd4ac77d74e674d3aa5b5722d`.
- Web `DISABLE_PWA=1 npm run check`: exit 0 (lint, typecheck, production build).
  Subsequent browser regression work must be retested after its edits.
- Isolated security checks: 2,612 web cases, zero external network attempts and
  zero uncaught exceptions; 93 media cases, zero uncaught exceptions. Deliberately
  injected/mock HTTP 500 responses are not production server failures.
- This fixes adapter feedback only. Full versioned acknowledged commands, native
  queue/renewal ownership, HLS, native DSP and background device tests remain open.

### Retry and late SDK-readiness regression

- A new run of the compiled-UI browser test failed in mobile-delayed-session:
  Retry loaded the SDK but the one active synthetic player stayed paused/muted.
  Failure-state evidence recorded autoplay=0 and two Pause calls, not playback.
- Traced the failure through session ownership, `sourceSwitchRef`, Retry and the
  SDK-ready callback. An old paused source-switch snapshot overrode newer Retry
  intent. The active ready callback also used captured autoplay instead of current
  intent, so it could restart a track paused while readiness was pending.
- Source switches and active readiness now use current playback intent. Removed
  the obsolete captured playing field from source-switch snapshots.
- Extended `iframe-api-browser.cjs` to exercise Pause before delayed readiness,
  inspect the DOM-designated active deck instead of the last constructed player,
  and retain safe synthetic call/state diagnostics on failure.
- Rebuilt stable source with `DISABLE_PWA=1 npm run check`: exit 0.
- `env -u MONGODB_URI -u DASHBOARD_MONGODB_URI node -r
  /tmp/haykasa-playwright-system.cjs docs/qa/android/iframe-api-browser.cjs`: exit 0;
  all five phone/narrow/landscape/desktop scenarios passed, each collapsed panel
  74px and link contrast 13.79:1. Delayed readiness respected Pause; explicit Play
  then recovered. The silent SDK case exercised its real 15-second deadline.
- Screenshots and JSON: `artifacts/android-iframe-api/` in the PR worktree. Failure
  files there describe the earlier reproduced defect; `results.json` records the
  successful rerun. All SDK/API responses are isolated fixtures, no provider audio.
- Focused bridge, resolver, background-policy, source eligibility, diagnostics,
  release/provenance, iframe lifecycle and viewport checks passed. Android binary
  paths changed only for native telemetry; both native APKs compiled successfully.
- Original `/workspace/Spotify-clone` diff was checked byte-for-byte against its
  saved pre-work snapshot: unchanged. Work remains isolated in the PR worktree.

### Independent review: provider wait versus explicit Pause

- Reviewer reproduced a P2 regression at `7f2a40a`: source failure before SDK
  readiness changed `userPausedRef` into a user Pause. The newly added compiled-UI
  case reproduced this before the production edit: after a 9-second wait the
  replacement player was paused/muted with `autoplay=0` and never resumed.
- Traced source resolver failure -> pending iframe switch -> SDK watcher readiness
  -> deck mounting/onReady, plus the UI and MediaSession Play/Pause handlers.
  Pending provider wait now has a queue-occurrence-scoped marker. Explicit Pause
  still overrides that marker. Consuming the switch clears the marker and uses
  current intent; no captured playing snapshot was restored.
- Affected files: `src/components/MusicPlayer/YouTubePlayer.jsx`,
  `docs/qa/android/iframe-api-browser.cjs`, and this checklist. API/native bridge,
  backend/storage and native binary contracts did not change in this correction.
- `DISABLE_PWA=1 npm run check`: exit 0 (lint, types, production build).
- `env -u MONGODB_URI -u DASHBOARD_MONGODB_URI node -r
  /tmp/haykasa-playwright-system.cjs docs/qa/android/iframe-api-browser.cjs`: exit 0;
  all seven compiled-UI cases pass. The two new cases hold actual SDK delivery for
  9 seconds, beyond the real 8-second transition guard. Without Pause, the active
  deck progresses unmuted and controls show Pause; explicit notification Pause
  keeps it paused after readiness without any Play/unmute call. No Retry or SDK
  reload is needed. Extraction request counts remain stable during wait/recovery.
- Existing delayed-session Retry, Pause before player-ready, narrow/landscape
  error UI, and real 15-second SDK timeout all remain covered and pass.
- `node docs/qa/android/check.mjs`,
  `node docs/qa/background-playback/check.cjs`,
  `node docs/qa/vercel-media/config-check.cjs`, and `git diff --check`: exit 0.
- Before evidence: `artifacts/pr40-provider-wait-review/before/`; passing results,
  request diagnostics and wait/ready screenshots: `artifacts/android-iframe-api/`.
  These use the actual compiled component and controlled SDK/API responses, with
  external requests blocked. They do not establish audible/live provider playback.
- All GitHub checks on the reviewed `7f2a40a` head passed, including Android 33/36
  emulators. Those results do not pass the correction's new-head CI. PR40 remains
  draft while CI and independent review proceed; no merge or native release.
- S01/S02, streaming, native queue/renewal and DSP requirements remain open.
  Physical-device/installed-app playback was not repeated for this web-player fix.

## Review handoff

Independent corrections are in commits `c05e382` (startup/errors), `21d0efd`
(upload allocation/checklist), `0a86e9b` (Android observed feedback) and `a9bbf33`
(Retry/readiness intent). The subsequent fixture/handoff commit completes their
integration evidence. Native changes are compiled into the locally built APK;
neither a native release nor a production merge/activation has occurred.

Existing CI already runs the updated Python adapter checks, the node/real-DOM
Android bridge checks, the seven compiled-UI SDK scenarios, Android build checks
and API 33/36 emulator instrumentation. A configured workflow is not a passed
workflow: record actual GitHub results separately after PR creation.

The full first-release engine is **not complete**. Source access (S01/S02), native
queue/renewal (N01/N02), protocol-v2 ownership, incremental delivery/durable cache,
DSP protection and physical-device qualification remain open above. No planned
feature has been shipped as an unconnected stub or passed via a simulated clock.
The second Codex should review the committed diff and requirements by ID, identify
concrete failures with reproduction evidence, and preserve these release gates.

## Acceptance and review

Cold/warm startup targets proposed for the first release: cold p50 <=8 s / p95 <=20 s,
warm p95 <=3 s at a defined 20 Mbps / 50 ms network. Report device/path and failure
counts separately. A deliberately delayed source tail must demonstrate first decoded
audio before extraction completion. These are targets, not current measurements.

Safari qualification requires physical captured output: -12 +/-1 dB at the 1 kHz
test band, distant reference-tone tolerance, downstream gain verification, route
changes, seeks and background tests. A Web Audio analyser or decode-capability
answer is not proof. Original mode never claims bit-perfect hardware output.

Sample-peak protection must keep every finite PCM output sample at or below
10^(-1/20), within 1e-6 numeric tolerance, after every amplifying/mixing operation.
Test 44.1/48 kHz, impulses, sweeps, near-Nyquist/inter-sample vectors, decoded hot
AAC/Opus, EQ/control transitions, nonfinite inputs, and any retained summing.
This is not a true-peak or OS/DAC-output guarantee.

Reconcile every row before a completion claim. `verified` must cite code inspection,
automated behavior, emulator behavior or physical-device behavior explicitly.
Blocked and deferred work stays visible in PR descriptions and review handoffs.
