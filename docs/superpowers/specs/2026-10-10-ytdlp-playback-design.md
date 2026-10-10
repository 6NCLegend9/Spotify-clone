# HayKasa yt-dlp playback design

Status: approved by the owner on 2026-10-10; implementation plan review pending.
Target: PR28, based on main after PR27. No merge or production deployment is included.

## Outcome and constraints

Use yt-dlp to play the highest-quality compatible audio and music-video streams that YouTube actually supplies, without requiring a listener subscription. Preserve HayKasa's approved artist and release pages, catalog IDs, credits, ordering, durations, queues, persistent player, desktop controls, and existing colors and root styles. Source selection cannot restore missing recording detail, manufacture lossless audio, upscale video, or promise Premium formats.

The owner explicitly requested removal of all existing tests before implementation. Remove unit/browser/native test suites, fixtures, test-only runners and dependencies, smoke hooks, benchmark harnesses, and CI calls to those files. Do not add replacement automated test suites. Retain lint, syntax/type checks, builds, dependency audits, desktop contract generation, installer artifact checks, signing checks, release version checks, and publication tooling. Record manual playback evidence separately from build evidence.

## Selected approach and alternatives

Add one independently hosted media service shared by the website and Electron's existing web renderer. The current Next.js Vercel deployment remains the application and catalog backend; its Node functions have a 30-second limit and do not currently provision Python, yt-dlp, its JavaScript challenge runtime, or FFmpeg. Long-running extraction, preparation, and media delivery belong in the service.

A desktop-only bundled yt-dlp executable would not improve the website and would require installer/runtime changes and native binary updates. Returning raw Googlevideo URLs from an API is insufficient: URLs expire, may depend on extraction egress or headers, and may fail browser CORS. Use prepared files delivered by the media service instead.

Hosting and bandwidth may cost money even though listeners do not need a subscription. No hosting provider is provisioned or deployed by this PR.

## Service boundary and runtime

Implement a containerized Python service with FastAPI/Uvicorn, pinned yt-dlp including its packaged EJS support, a supported JavaScript runtime explicitly enabled for yt-dlp, and FFmpeg/ffprobe. Pin reviewed runtime versions and document updating yt-dlp when YouTube changes extraction. Keep certificate validation and honor configured proxies. Do not silently obtain browser cookies, bypass authentication, or claim access to formats that anonymous extraction cannot retrieve.

Only accept validated 11-character YouTube video IDs. Construct the YouTube URL internally; reject arbitrary URLs, file paths, command options, playlist extraction, and unsupported modes. Spawn tools with argument arrays, never a shell. Redact direct media URLs, credentials, and request tokens from logs. Treat extracted metadata as untrusted data.

Server-authenticated application requests create jobs through POST /v1/jobs with videoId, mode (audio/video), maximum height, and a supported container/codec profile. GET /v1/jobs/:id reports pending, ready, or failed. Job endpoints require a server-only API credential. The application uses existing rate-limit conventions to bound resolver traffic and issues no extraction for catalog/search results. Resolve the selected track only; do not add per-video catalog request fan-out or speculative playlist extraction.

Use at most two preparation jobs concurrently and a bounded waiting queue of eight. Extract with a 45-second deadline, prepare with a 120-second deadline, and terminate subprocess groups on timeout or cancellation. Reject sources longer than 30 minutes or output exceeding 1 GiB; use the existing YouTube provider for those cases. Cache at most 8 GiB with a six-hour retention target, evicting least-recently-used inactive entries. Deduplicate jobs by video ID, mode, quality ceiling, and codec profile. Reserve cache space for active preparation and fail gracefully when bounds cannot be met. These resource limits are deployment configuration, not claims about media quality. The initial deployment is a single service instance with local cache/job state. Multi-instance operation requires shared asset storage and job/lease state before scaling; sharing a signing key alone is insufficient.

## Source selection and delivery

Detect browser-supported container/codec profiles before requesting an asset. Prefer source Opus/WebM where the browser supports it; offer AAC/M4A and H.264/AAC MP4 compatibility where available. Choose actual audio quality using codec-aware source metadata; do not equate every codec's numeric bitrate or select by an array index. Select video by the requested height ceiling and compatible codec, then pair it with the best compatible audio. Audio mode downloads only audio. Video mode muxes separate video/audio streams with FFmpeg stream copy and validates the result with ffprobe. Do not re-encode or invent missing formats; choose another compatible source or fall back.

Prepare playable files with appropriate seek metadata, including fast-start MP4 where applicable. Serve complete cached assets with correct Content-Type, Content-Length, HEAD, and single-byte-range support (206, Content-Range, and 416 for unsatisfiable ranges). No arbitrary upstream proxy endpoint is exposed.

Ready jobs return sanitized available-quality metadata and a service asset URL protected by a short-lived signed lease scoped to one opaque asset. Keep source URLs and service API credentials out of browser responses. Restrict CORS to configured web origins, including the pinned production renderer used by Electron. Bind lease renewal to the application's selected-track resolver; retain active assets until their leases expire. A two-hour lease covers the bounded track length; refresh before expiry and recover a deleted asset at the saved position. Do not distribute requests to multiple instances until assets and job/lease state are shared. Never depend on local cache surviving a restart.

## Next.js integration

Add /api/media/resolve to validate and rate-limit track resolution, call the authenticated media service, and return normalized pending/ready/failure responses. Poll and cancel through this same application boundary so the service job API credential remains private. Preserve guest playback: identify a signed-in listener by the existing account session or a guest by an opaque signed HttpOnly session cookie. Bind each job receipt to that listener scope and enforce ownership for polling, cancellation, and lease renewal. Rate-limit those operations as well as creation; renewal cannot become an unmetered extraction path. Validate requested height against a fixed allowlist and mode/profile against enumerations; reject malformed job receipts. Limit every individual application request to a short upstream timeout; preparation never occupies a Vercel function until completion.

Configure MEDIA_SERVICE_URL and MEDIA_SERVICE_API_KEY server-side. An absent or unhealthy service produces a recoverable unavailable response. Require HTTPS in production. Do not embed the API credential in public environment variables. Update CSP media-src/connect-src narrowly for the configured service origin and keep private resolver responses and signed asset URLs out of service-worker caches. Preserve the current catalog metadata and availability/embeddability cache fields.

## Shared renderer and player behavior

Introduce a native-media provider alongside the existing YouTube provider. Resolve a track when playback is requested, then play the prepared asset through an HTML audio/video element. Keep the original YouTube video ID and queue occurrence identity throughout resolution, playback, history, persistence, and fallback. Never use a format ID or asset ID as a catalog identity.

Use the existing Redux queue and playback commands. Preserve pause/resume, seek, previous/next, repeat, shuffle, queue editing, collection queues, Media Session, desktop playback bridge, background playback, and saved-position restoration. Cancel stale resolution when the track occurrence or account changes; a late response must never start a replaced track. Cancel pending work on Jam room/role changes as well. Preserve Jam host/guest/aux permissions and synchronize native-provider position, pause state, and occurrence changes through the existing Jam protocol; guest playback controls must not gain host permissions. Private-session/account transitions must preserve current privacy and persistence rules. Only one provider may emit sound at a time. Transfer the position, volume, mute state, and playback intent when changing provider or quality, then tear down the old provider. Handle autoplay denial through the existing user playback action.

Native audio can use HayKasa's existing audio processing with its clipping protection. Keep default playback unboosted; EQ and volume controls must not be presented as improving source fidelity. Preserve the existing YouTube fallback's volume rules. Do not change default colors, root CSS, or unrelated navigation.

Keep the existing theater/video presentation. Add a small quality control using current styles: audio source details and video Auto, 1080p, 1440p, or 2160p when those formats exist. Auto uses supported formats and available playback bandwidth, without claiming a fixed resolution. Display actual codec/height and known source bitrate; show unknown values honestly. Do not offer unavailable quality options. Changing quality retains the playback position and queue occurrence.

## Failure behavior

Unconfigured service, extraction rejection, unsupported codecs, timeout, cache exhaustion, preparation error, expired lease, and native playback failure remain recoverable. Attempt one bounded asset refresh for expiry; otherwise fall back to the existing YouTube player for the same occurrence and position. Report the provider and reason through existing technical diagnostics without logging secrets. Do not loop indefinitely or advance the queue merely because resolution failed. Existing YouTube availability restrictions still apply; extraction is not a claim that unavailable content is playable.

## Verification and delivery

After implementation, run the Node 22 lint/type/build gate, native syntax checks, desktop contract generation check, Python compilation, container build, and production dependency audits. The repository will contain no automated test suites under the owner's instruction.

Manually verify actual audio/video decoding, visible resolution, seeking, pause/resume, quality switching, provider fallback, restored position, queue mutation, artist/release collection playback, and desktop media controls and two-device Jam synchronization in a browser and actual Electron. Exercise byte ranges, job deduplication, cancellation, limits, and credential/CORS boundaries using temporary local probes outside the repository. Label fixture or synthetic probes explicitly; they do not prove live YouTube playback.

Current feasibility evidence: yt-dlp 2026.8.19 with EJS 0.8.0 installed in a scratch directory; Python, Node 22, and FFmpeg available. An anonymous live YouTube extraction and an independent curl request both failed at the environment proxy with CONNECT 403. No live source formats, playback quality, or production extraction have been verified. Repeat the live checks from the intended media-service host before enabling the provider for production users.

Deliver the service, configuration documentation, and renderer changes on PR28 after design/plan review. Keep the PR open. Deployment requires a chosen reachable media-service host, working extraction egress, storage and bandwidth capacity, and production configuration. Windows package build evidence is separate from manual installation and playback on Windows. No merge, release publication, or production deployment is implied by this specification.
