# HayKasa worker inventory

Repository audit: 2026-10-14.

| Component | Code | Deployment |
| --- | --- | --- |
| Media preparation worker | `media-service/app/vercel_app.py`, `jobs.py`, `processes.py` | Vercel `media` container; runs yt-dlp/FFmpeg and persists completed assets in private Blob. Previously present only on previews; included in the production rollout. |
| Browser service worker | `src/sw.js`, `next.config.js` | Built into `/sw.js` with the Next.js frontend. Executes in users' browsers. |
| Concurrent YouTube request helper | `src/utils/youtubeApi.js` | Ordinary bounded async functions inside the calling Next.js route; no separate worker deployment. |
| Desktop updater and policy timers | `desktop/src/updater.mjs`, `policy.mjs` | Run inside the installed Windows application. |
| Discord desktop bridge | `desktop-bridge/discord-bridge.mjs` | Runs on the user's computer, binds loopback, and connects to local Discord IPC. |
| CI/build jobs | `.github/workflows/` | Run on GitHub Actions. |

No separate queue consumer, cron worker, Celery/BullMQ service, Web Worker, or
Node worker-thread entrypoint was found. The legacy `media-service/app/main.py`
is an alternative single-instance deployment of the same media pipeline, not an
additional worker to run alongside the stateless Vercel adapter.

## Production rollout

The `frontend` service binds privately to the `media` service through
`MEDIA_SERVICE_INTERNAL_URL`. Signed assets are routed through `/v1/assets/*`;
job RPC routes have no public ingress. `/media-health` checks container startup.

Worker deployment and native playback activation are separate. The internal
provider defaults to disabled unless `MEDIA_SERVICE_PLAYBACK_ENABLED=1` is set.
Production uses `0` while YouTube rejects extraction from the hosting network.
Availability returns false and create/poll/renew requests are rejected before
extraction when disabled; authenticated cancellation remains available.
Existing embedded playback continues to be selected.

Generated audio storage, renewal, and signed ranges passed live preview checks.
Real YouTube background playback remains blocked as recorded in `RESULTS.md`.
