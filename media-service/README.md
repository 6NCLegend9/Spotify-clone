# HayKasa media service

The service prepares public YouTube source streams through yt-dlp and delivers complete, seekable files to signed-in web, desktop and Android players when native playback is activated. Guests use the embedded provider. Song lookup and selected video IDs remain unchanged.

Production uses the stateless Vercel Services deployment and private Blob storage described in [Vercel setup and verification](../docs/qa/vercel-media/README.md). The frontend receives the private service URL from its binding. Worker startup does not prove usable source audio; activation requires successful real extraction, delivery and decoding. See the [live verification results](../docs/qa/vercel-media/RESULTS.md) before enabling `MEDIA_SERVICE_PLAYBACK_ENABLED`. FFmpeg copies streams without re-encoding. It does not provide lossless originals or Premium access.

The `auto` profile uses yt-dlp's format ranking to choose compatible Opus or AAC from the same source, with video pairing when requested. Single-codec clients retain explicit profiles. Prepared descriptors report FFprobe's sample rate, channels and audio bitrate, labeling container/upstream bitrate estimates. [Audio quality tests](../docs/qa/audio-quality/README.md) verify real remuxed packet hashes and browser DSP; increasing a number cannot restore detail absent from the source.

## Alternative standalone Docker deployment

The instructions below apply when the Vercel internal binding is absent. They describe the compatible single-instance service with local persistent storage, rather than the stateless production container.

Build with `docker build -t haykasa-media media-service`. Run one instance with port 8090 behind HTTPS and a writable persistent volume mounted at `/cache`. Set:

- `MEDIA_API_KEY`: a random secret of at least 32 characters, shared with Next.js `MEDIA_SERVICE_API_KEY`.
- `MEDIA_LEASE_SECRET`: a separate random signing secret of at least 32 characters.
- `MEDIA_PUBLIC_ORIGIN`: the public HTTPS service origin; HTTP loopback is allowed for local development.
- `MEDIA_ALLOWED_ORIGINS`: comma-separated renderer origins, including `https://haykasa.vercel.app` and any explicitly permitted preview origin.
- `MEDIA_JS_RUNTIME`: defaults to `node:/usr/local/bin/node`.

Set `MEDIA_SERVICE_URL` to the public origin in Next.js and configure its API credential and `MEDIA_RECEIPT_SECRET`. Rebuild Next.js when changing the service origin so CSP includes it. Keep service credentials out of public environment variables, images, logs, and Git. Inherit an operator-configured HTTP proxy and trusted CA if required; do not disable TLS checks. Disable proxy/access-log recording of query strings: asset URLs contain expiring bearer leases.

Run exactly one Uvicorn worker/replica. Local job state and assets are not distributed. Scaling requires shared asset, subscriber, job, and lease storage first. Restarting invalidates in-memory jobs and leases; the player must recover or fall back.

Bounds: two active preparations, eight queued, 45-second extraction and 120-second preparation deadlines, 30-minute source limit, 1 GiB output limit, 8 GiB total cache/reservations, six-hour retention target and two-hour leases. Each active job reserves 2 GiB for intermediate/output files. Active leased assets cannot be evicted for space; exhausted capacity fails gracefully. Keep enough filesystem capacity for the configured cache. Proxy/server response limits must support large files and byte ranges.

Only `/health` and signed `/v1/assets/:id` delivery are public. All job routes require `Authorization: Bearer <MEDIA_API_KEY>` and a server-derived `X-Media-Subscriber` identity. CORS is explicit and does not replace authorization. Signed URLs are bearer capabilities; use HTTPS and keep them private.

The runtime/dependencies are pinned in Dockerfile/requirements.txt. yt-dlp 2026.10.26 requires Python 3.11 or later; both worker images already use Python 3.12. Its default dependency still requires the pinned EJS 0.8.0. To update yt-dlp/EJS, review upstream release notes, change compatible pins together, rebuild, and manually verify extraction and actual source-stream decoding from the intended hosting egress. YouTube may reject datacenter traffic or require unsupported authentication. Do not publish a quality guarantee based only on local synthetic files or successful metadata extraction.

Production activation requires working extraction egress, storage, bandwidth capacity, configured server credentials, and live mobile device verification. Automated storage, delivery and synthetic-audio checks are documented in [Vercel verification](../docs/qa/vercel-media/README.md#verification); they do not establish live source playback.
