# PR28 source playback verification — 2026-10-10

Implementation is on `feat/ytdlp-media-quality`, targeting `main`. PR28 remains draft/open. No production deployment, release publication, merge, or service provisioning was performed. Repository test suites were deleted at the owner's request; the manual probes below are temporary files outside the repository.

## Verified locally

- Node 22: `NEXT_BUILD_DIR=.next-check npm run check` exited 0: lint with zero warnings, route type generation/TypeScript, production build. Serwist/PWA was enabled in the final build; 69 routes generated.
- `npm run check:desktop-contract`, native JavaScript syntax checks, Python compilation, and web/desktop production dependency audits passed. Both audits reported zero vulnerabilities.
- The pinned Docker image built and booted as its non-root media user. `/health` returned ready. BuildKit supplied the environment's trusted proxy CA; TLS verification remained enabled.
- Format-selection, subprocess deadline/output bounds, signed ranges, and request/session ownership were exercised through temporary probes. Real HTTP verified deduplication, independent subscriber cancellation, lease renewal, HEAD, four-byte 206 delivery, unsatisfiable 416, expired-lease 403, and bad-authentication 401. A second guest cookie jar could not poll the first guest's Next.js receipt (403).
- Actual Chromium and actual Electron 44 decoded generated 1080p VP9/Opus media through the genuine Next.js resolver and FastAPI signed asset routes. Catalog/session responses were fixtures. Both restored a paused track at four seconds, played at master volume 0.35, switched Auto to 1080p preserving position/intent, paused, and selected the second release track at zero. The Electron preload bridge was present. No page/CSP errors were observed.
- Chromium audio-only playback decoded the generated Opus asset and exercised the same restoration and release queue flow. Captured audio RMS was positive (approximately 0.088 Chromium/audio, 0.086 Electron), establishing decoded synthetic audio, not a quality comparison to YouTube.
- Delaying resolver requests by 2.5 seconds in Chromium preserved a pause and seek to nine seconds during a quality switch. Skipping before preparation completed started the next occurrence at zero. An isolated adapter probe verified failed restoration retains four seconds, next-track preparation failure falls back at zero rather than the previous track's 73 seconds, and obsolete duration is cleared.

## Whole-branch review

A separate reviewer inspected the implementation without modifying it. All three actionable findings were fixed in one pass:

1. Delayed readiness overwrote current pause/seek or applied an old occurrence snapshot: readiness callbacks are occurrence-bound; native playback uses current intent and the adapter's current pending position.
2. Next-track fallback inherited the old media timestamp: unresolved fallback uses the pending occurrence position and discards the obsolete source.
3. Native restoration failure lost the saved position: restoration initializes the deck with `startSeconds`.

Affected browser/Electron probes, adapter transition probes, lint/type/build, Python compilation, and Docker build were rerun after these changes. Edited presentation components retain existing palette classes; no root CSS or color definitions were changed.

## Incomplete external verification

A real anonymous YouTube job in the rebuilt container failed recoverably with `preparation_failed` and returned no asset. Independent requests established the environment proxy rejects YouTube CONNECT requests with 403. This does not verify live extraction, actual delivered YouTube bitrate/resolution, or live music playback. No TLS/proxy bypass was attempted.

Two-device live Jam synchronization, the full catalog/queue permutation matrix, mobile device playback, long-running lease expiry/restart recovery in the UI, and manual Windows installation/playback were not established by the synthetic probes. Existing Jam permissions/controller routes were retained and reviewed; this is not runtime evidence for those flows. Windows CI packaging is distinct from installing and playing on Windows. Current-head CI status is available on PR28; earlier green runs must not be attributed to this implementation.

## Activation requirements

1. Provision one service instance behind HTTPS with persistent bounded cache, FFmpeg, Node/EJS, and egress that permits anonymous extraction. Multiple workers/replicas are unsupported.
2. Configure private `MEDIA_API_KEY`/`MEDIA_LEASE_SECRET`, public service origin and explicit renderer CORS origins. Keep signed URL query strings out of access logs.
3. Configure Next.js `MEDIA_SERVICE_URL`, matching `MEDIA_SERVICE_API_KEY`, and `MEDIA_RECEIPT_SECRET`; rebuild so CSP includes the exact origin.
4. Verify live source extraction and decoded audio/video, real Jam sessions, fallback/lease recovery, and Windows playback from the proposed host. Obtain production deployment authorization before activation.

Without service configuration the existing YouTube player remains available. Source selection uses only available compatible streams, copies them without re-encoding, and does not promise lossless audio, Premium formats, invented bitrate, or upscaled video.
