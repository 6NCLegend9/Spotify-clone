# HayKasa media service

This independently hosted service prepares anonymous YouTube source streams through yt-dlp and delivers complete, seekable audio/video files to the shared web/Electron player. FFmpeg copies streams without re-encoding. It does not provide lossless originals or Premium access.

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

The runtime/dependencies are pinned in Dockerfile/requirements.txt. To update yt-dlp/EJS, review upstream release notes, change pins together, rebuild, and manually verify extraction and actual source-stream decoding from the intended hosting egress. YouTube may reject datacenter traffic or require unsupported authentication. Do not publish a quality guarantee based only on local synthetic files or successful metadata extraction.

No service host is provisioned by this repository. Production activation requires a reachable host with working extraction egress, a writable cache, bandwidth capacity, configured secrets/origins, and live browser/Electron verification. Automated test suites were removed at the owner's request.
