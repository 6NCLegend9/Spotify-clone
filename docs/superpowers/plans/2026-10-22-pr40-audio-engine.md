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
| N03 | Acknowledged play/pause/seek; intent separate from observed playback; generation/sequence protection | pending | Current bridge play resolves immediately and seek changes position optimistically. |
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
| V01 | Regression-free web/desktop/mobile controls, startup and failure UI | implemented | Prior audit repairs included; controlled UI tests are not live playback evidence. |
| V02 | Actual playback, DSP, seek, queue, renewal, reconnect and background verification by platform | blocked | Each behavior needs separate evidence; compilation and synthetic clocks do not pass this row. |
| V03 | Publish commit, changed files, checks/results, limitations and unresolved checklist | pending | Reconcile at each PR milestone and before handoff. |
| V04 | Second Codex review and back-and-forth integration review | pending | User will engage the reviewer after initial PR40 work. |

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
