# HayKasa yt-dlp Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if the owner selects delegated execution. Steps use checkbox syntax for tracking.

**Goal:** Deliver source-quality audio and music-video playback through yt-dlp to HayKasa's existing web and Electron renderer, with recoverable YouTube fallback.

**Architecture:** An independently hosted, single-instance Python service resolves and prepares compatible source streams and serves leased seekable files. Next.js authenticates service calls and binds job receipts to listener sessions. A native-media deck adapter plugs into the existing playback controller, retaining queues, occurrence identity, Jam permissions, presentation, and desktop controls.

**Tech Stack:** Node 22, Next.js 15, React 18, existing Redux/Jam/Electron integration; Python 3.12, FastAPI/Uvicorn, yt-dlp with EJS, an explicitly enabled JavaScript runtime, FFmpeg/ffprobe.

**Spec:** `docs/superpowers/specs/2026-10-10-ytdlp-playback-design.md` (approved by owner on 2026-10-10).

## Global Constraints

- Work on PR28's existing `feat/ytdlp-media-quality` branch; keep it open. No merge, release publication, external project creation, or production deployment.
- Use commit author/committer `6NCLegend9` and `59505853+6NCLegend9@users.noreply.github.com`.
- Do not add replacement automated test suites. Use manual probes in `/workspace/work/haykasa/audio-quality`, outside the repository; retain lint, syntax/type checks, builds, audits, and release/security checks.
- Preserve catalog IDs, credits, durations, full availability/embeddability metadata, queues, persistence, artist/release pages, existing colors and root styles.
- Resolve the selected track only. No search/catalog fan-out or speculative playlist extraction. Existing YouTube preloading must not cause native extraction of unselected tracks.
- Stream copy only: no fabricated bitrate, resolution, lossless claims, upscaling, browser-cookie scraping, authentication bypass, shell interpolation, or disabled TLS verification.
- Valid source ID: exactly 11 characters matching `[A-Za-z0-9_-]`; fixed mode/profile/height allowlists; no arbitrary source URLs.
- Two concurrent preparations, eight queued; extraction deadline 45 seconds, preparation deadline 120 seconds; source length at most 30 minutes; output at most 1 GiB; cache at most 8 GiB, six-hour retention target; asset lease two hours.
- Initial service is single-instance. Multi-instance operation requires shared assets and job/lease state, not merely shared signing keys.
- Live YouTube requests currently fail at the environment proxy with CONNECT 403. Synthetic/local evidence is not live extraction or playback evidence.

## Review Focus

- A slow response after skip/account/Jam changes must not start the old occurrence or authorize former Jam controls: verify manually in Tasks 3 and 4.
- Anonymous users retain playback while job receipts cannot be polled/cancelled/renewed by another listener: verify manually in Task 2.
- The highest-listed source may lack a supported audio pairing or usable bitrate; selection must remain codec-aware and honest: verify manually in Task 1.
- Expired leases, cache restart, exhausted space, and extraction failures must recover once or fall back at the same saved position: verify manually in Tasks 1, 3, and 5.
- Native media must not coexist audibly with the iframe, lose background volume, or break seek/Jam/desktop state: verify manually in Tasks 3 through 5.

---

### Task 1: Bounded preparation and delivery service

**Files:** Create `media-service/app/config.py`, `models.py`, `selection.py`, `processes.py`, `jobs.py`, `assets.py`, `main.py`, `requirements.txt`, `Dockerfile`, `.dockerignore`, and `README.md`.

**Interfaces:**
- `ResolveRequest`: `{videoId: string, mode: "audio"|"video", maxHeight: 1080|1440|2160, profile: "webm-opus"|"mp4-aac"}`.
- `JobResult`: `{jobId: string, state: "pending"|"ready"|"failed", reason?: string, asset?: AssetDescriptor, qualities?: QualityDescriptor[]}`.
- `AssetDescriptor`: `{url: string, expiresAt: integerMillis, mimeType: string, duration: number, codec: string, audioBitrateKbps: number|null, height: number|null}`; `QualityDescriptor`: `{height: number|null, codec: string, audioBitrateKbps: number|null}`. No source URLs or authentication headers appear in these objects.
- Server-authenticated `POST /v1/jobs`, `GET /v1/jobs/{jobId}`, `DELETE /v1/jobs/{jobId}`, and `POST /v1/jobs/{jobId}/renew`; lease-authorized `GET/HEAD /v1/assets/{assetId}`; public health endpoint reveals readiness only.

- [ ] Define strict request/output models, environment bounds, credential comparison, configured origin allowlist, and public asset origin. Pin package/runtime versions available from their official releases; document their update procedure.
- [ ] Implement `select_formats(info: dict, request: ResolveRequest) -> SelectedFormats` in `selection.py`. Prefer compatible Opus/WebM or AAC/MP4 tracks within the chosen profile; pair video at the ceiling with compatible audio; preserve unknown bitrate as null and reject unsupported combinations.
- [ ] Implement `run_tool(argv: list[str], deadline_seconds: int, output_limit_bytes: int) -> ProcessResult` in `processes.py` using subprocess groups, argument arrays, bounded output, inherited proxy/CA configuration, and termination on deadline/cancellation.
- [ ] Extract anonymous metadata using yt-dlp/EJS and the enabled JavaScript runtime; download only the selected IDs; enforce duration/byte limits during preparation, including temporary files. Merge/prepare with FFmpeg stream copy and verify codecs/duration/seekable container through ffprobe.
- [ ] Implement `JobManager.create(request, subscriber)` / `get(job_id, subscriber)` / `cancel(job_id, subscriber)` / `renew(job_id, subscriber)`. Deduplicate by validated request tuple but track subscribers independently: cancelling one listener cannot terminate another listener's shared job. Bound active jobs, queue, terminal-job retention, temporary disk reservations, and pinned-asset cache entries.
- [ ] Implement HMAC asset leases, expiry checks, active-lease pinning, LRU eviction, cache cleanup at startup, and complete-file delivery with HEAD and valid single ranges. Return 206/Content-Range for satisfiable ranges and 416 for unsatisfiable or unsupported multi-ranges. Never expose arbitrary proxy targets.
- [ ] Wire routes, authentication, credential-redacted errors, explicit CORS, graceful shutdown, and a reproducible container command with a persistent bounded cache volume.
- [ ] Compile Python and build the container when Docker is available. Use temporary local media and curl to inspect real response headers/byte ranges and job/resource boundaries. Repeat anonymous live extraction; record proxy rejection honestly if unchanged.
- [ ] Commit the runnable service and deployment/configuration documentation.

### Task 2: Listener-bound Next.js resolver

**Files:** Create `src/utils/mediaService.mjs`, `mediaReceipts.mjs`, and `src/app/api/media/resolve/route.js`; modify `.env.example`, `next.config.js`, and `PRODUCTION.md`.

**Interfaces:**
- `mediaServiceConfig(env) -> {enabled, origin, apiKey}` validates HTTP only for loopback development and HTTPS in production.
- `signMediaReceipt(payload, secret)` / `verifyMediaReceipt(token, scope, secret)` carry the listener scope, job ID, request tuple, service subscriber identifier, and expiry; reject changed/expired ownership.
- Same-origin `/api/media/resolve`: `GET` reports `{enabled}` without credentials; `POST` creates or renews; `GET ?receipt=...` polls; `DELETE` cancels. Responses use `JobResult` plus an application receipt and `Cache-Control: private, no-store`.

- [ ] Derive scope from the existing authenticated account or a cryptographically random signed HttpOnly guest cookie; use a dedicated `MEDIA_RECEIPT_SECRET` or existing server auth secret, and fail closed when signing is unavailable. Do not expose account IDs in receipts; use keyed scope hashes.
- [ ] Apply existing same-origin/CSRF conventions to mutations. Validate enumerations and input lengths; rate-limit creation and polling/cancellation/renewal separately through existing `getClientKey`/`isRateLimited`, keyed by client and listener scope.
- [ ] Call the Task 1 service with its server-only credential and subscriber identity using an eight-second per-request deadline. Normalize recoverable errors, validate/sanitize ready responses against the configured service origin, and issue ownership-bound receipts. Cancellation/renewal require both scope and receipt validation.
- [ ] Add `MEDIA_SERVICE_URL`, `MEDIA_SERVICE_API_KEY`, and `MEDIA_RECEIPT_SECRET` documentation. Add only the validated service origin to CSP media-src/connect-src; keep API responses and external leased media out of Serwist caching (the existing `/api/` exclusion remains).
- [ ] Run Node 22 lint/type checks; manually call an unconfigured route, invalid-input route, and a local service route as two separate guest cookie jars. Verify ownership rejection, expired receipts, rate limits, cancellation isolation, and unavailable-service recovery without exposing keys.
- [ ] Commit the application boundary and configuration changes.

### Task 3: Native deck adapter and resolution lifecycle

**Files:** Create `src/components/MusicPlayer/media/nativeMediaDeck.mjs`, `resolveMediaAsset.mjs`, `mediaCapabilities.mjs`, and `mediaPlayerStates.mjs`.

**Interfaces:**
- Stable player states: UNSTARTED=-1, ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3, CUED=5; these do not require `window.YT`.
- `resolveMediaAsset(request, {signal, receipt?, onPending}) -> {asset, qualities, receipt}` creates/polls through Task 2 with bounded backoff, abort support, and one lease refresh.
- `createNativeMediaDeck({host, videoId, occurrenceId, mode, maxHeight, profile, autoplay, startSeconds, events, onFallback}) -> deck` returns the existing narrow deck contract: `playVideo`, `pauseVideo`, `seekTo`, `setVolume`, `mute`, `unMute`, `getCurrentTime`, `getDuration`, `getPlayerState`, `getVideoData`, `getIframe`, `loadVideoById`, `cueVideoById`, `destroy`; caption-module methods are explicit harmless no-ops. Events retain `{target: deck, data}` shape.

- [ ] Detect container/codec support with native media capability APIs and actual `canPlayType` results. Select only service profiles the browser supports; return unavailable when none match.
- [ ] Implement the adapter around an HTML audio/video element with crossOrigin set before src, playsInline video, playback state/error/time events, clamped seeking/volume, loaded-metadata restoration, cancellation generation, and deterministic teardown.
- [ ] Preserve source volume defaults and integrate existing EQ/headroom/limiter through a native audio-processing boundary that resumes only after a user playback action. Coordinate volume with the existing normalization path so gain is not applied twice. Unsupported Web Audio must still allow ordinary media playback.
- [ ] Resolve only when the selected deck needs the requested occurrence; cueing an idle deck must not extract. Destroy cancels its receipt subscription and removes event handlers/context/media src. Lease refresh is bounded to one retry at the saved position before `onFallback`.
- [ ] Use temporary local served audio/video to manually verify real decoding, seek, buffering/end events, cancellation, autoplay denial, EQ defaults, and expired-lease recovery. Confirm late results cannot emit playback after destroy.
- [ ] Commit the adapter without changing the existing controller yet.

### Task 4: Shared controller and quality UI

**Files:** Modify `src/components/MusicPlayer/YouTubePlayer.jsx`; create `src/components/MusicPlayer/media/PlaybackQualityControl.jsx`; modify `PlayerDock.jsx` or the existing theater-control component only where necessary to expose the control.

**Interfaces:**
- Controller selects native or iframe decks while retaining the Task 3 contract; original video/queue occurrence IDs remain authoritative.
- `PlaybackQualityControl({provider, asset, qualities, selection, disabled, onChange})` shows actual metadata and available Auto/1080p/1440p/2160p choices using existing styles.

- [ ] Replace direct reliance on `window.YT.PlayerState` in common clock/control logic with Task 3 constants. Split deck construction into iframe and native paths without rewriting the queue/radio/Jam controller.
- [ ] Load provider availability independently of the iframe API so a functioning native service does not depend on YouTube iframe script availability. Default to the existing provider when configuration is absent. Preserve provider selection and pending occurrence intent across component updates.
- [ ] Wire native deck events into the existing ready/state/end callbacks, playback clock, saved-position restoration, listening insights, captions, Media Session, desktop bridge, and Jam reporting. Preserve guest/aux control permissions and cancel stale work on track/account/room/role changes.
- [ ] Switch provider/mode/quality by snapshotting occurrence, position, volume, mute, and playback intent. Silence/destroy the old provider before new playback. A native failure must rebuild the iframe for the same occurrence and position, without advancing the queue or starting a second provider.
- [ ] Prevent native extraction through existing speculative/preloaded decks. Keep the iframe preload path intact; selected-track fade/transition logic must remain safe while a native asset prepares. Do not advertise gapless native transitions without evidence.
- [ ] Add quality controls and actual codec/bitrate/height copy. Auto selects a supported source ceiling based on connection constraints and falls back to 1080p when bandwidth is unknown; expose higher available choices explicitly. No global/root CSS or palette changes.
- [ ] Manually exercise artist/release/playlist queues, repeated IDs with different occurrences, seek/previous/next/repeat/shuffle, queue reorder, paused restoration, native/iframe fallback, quality switching, and two-device Jam host/guest/aux behavior.
- [ ] Run the React quality checklist for changed TSX files if applicable; run Node 22 checks and commit controller integration.

### Task 5: End-to-end evidence and PR28 handoff

**Files:** Update `media-service/README.md`, `PRODUCTION.md`, `desktop/README.md`, and the PR28 description; create `docs/superpowers/verification/2026-10-10-ytdlp-playback.md` with observed results, not promises.

- [ ] Run Node 22 `npm run check`, `npm run check:desktop-contract`, web/desktop production audits, native JavaScript syntax checks, Python compilation, and container build where available. Record PWA build settings and command outcomes.
- [ ] Run the application against the local service and verify actual native audio/video playback, ranges, provider fallback, lease renewal/restart recovery, queue state, and presentation in a browser and actual Electron. Keep temporary probes outside the repository.
- [ ] Repeat live YouTube extraction and media-byte decoding from permitted egress. If the proxy remains blocked, mark live verification incomplete and prevent a claim that production playback works. Do not bypass the proxy or TLS checks.
- [ ] Verify the Windows package via retained CI and distinguish artifact build from manual Windows installation/playback. Keep existing installer publication/signing behavior intact.
- [ ] Perform a whole-branch code review, fix actionable findings without adding tests, and rerun only affected checks.
- [ ] Push all implementation commits to PR28, update its title/body to describe implemented behavior and limitations, and keep it open. Document the exact service hosting/configuration steps still required; no production deployment until authorized.

## Execution handoff

Recommend native execution: these five tasks share a narrow evolving service/deck contract, so implementing in one context reduces integration churn; a separate whole-branch reviewer checks the result. The owner must review this written plan and choose native or subagent-driven execution before product implementation under the applicable planning skill.
