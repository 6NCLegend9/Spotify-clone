# Vercel mobile media deployment

Current live verification: [results and remaining blocker](RESULTS.md).

The frontend and Python/FFmpeg/yt-dlp container deploy atomically using Vercel
Services (Beta). Signed-in web, Electron and Android players can use
`/api/media/resolve` when source playback is activated. Anonymous playback uses
the embedded provider. Mobile native playback requests audio unless the user
opens the video view. Automatic codec selection preserves the selected song and
chooses the best compatible upstream-ranked stream without re-encoding it.

## Configuration

- Attach a **private** Vercel Blob store to the project. Vercel supplies
  `BLOB_READ_WRITE_TOKEN` to the deployed services.
- Keep the existing `JWT_SECRET` (at least 32 characters) configured. The two
  server components derive separate API and lease signing keys from this secret;
  it is never copied into browser code or returned by diagnostics.
- Native playback stays disabled by default while provider access is blocked.
  Set `MEDIA_SERVICE_PLAYBACK_ENABLED=1` only after real extraction succeeds;
  deploying the container does not automatically switch users to it.
- `MEDIA_SERVICE_INTERNAL_URL` is supplied at runtime by the frontend service
  binding. Do not set a deployment hostname manually.
- Existing external `MEDIA_SERVICE_URL`/`MEDIA_SERVICE_API_KEY` setups remain
  supported when the internal binding is absent.

Preparation finishes before the request returns. Only complete files are stored;
subsequent requests read private Blob manifests instead of process memory or
local disk. Assets are capped at 96 MiB and 30 minutes. Stream leases last up to
2 hours; records expire after 6 hours. Creation performs a bounded cache sweep and
refuses new work at capacity. Cancellation removes the requesting job's objects.
Public `/v1/assets/*` requests require an expiring HMAC signature and support
HEAD, byte ranges, suffix ranges, and seeking. `/v1/jobs/*` is not publicly routed.

`/media-health` reports container startup readiness. It does not prove YouTube
extraction or Blob availability.

## Verification

- `node docs/qa/vercel-media/config-check.cjs`: binding path preservation,
  purpose-separated authentication, delivery origin validation, external worker
  compatibility, and production exclusion of the preview probe.
- `python docs/qa/vercel-media/check.py`: pinned SDK signatures, private storage,
  stateless poll/renew, subscriber ownership, signatures, malformed requests,
  ranges, cancellation, partial upload rollback, safe storage errors, and expiry.
- Security Regression CI builds the actual container and checks its HTTP startup
  and unauthenticated RPC rejection in an isolated Ubuntu VM.
- Existing CI covers the full Next build and mobile/guest/account policies.
  Mobile Playback VM exercises real audio in Chromium, Firefox, and WebKit with
  an offline fixture. Desktop emulation cannot prove phone app switching or lock
  screen behavior.

For a live preview-only check, temporarily set `MEDIA_SERVICE_DEPLOYMENT_PROBE=1`
on the preview branch and fetch `/api/media/preflight` once. The rate-limited
probe prepares the fixed public Big Buck Bunny sample (`aqz-KE-bpKQ`) in AAC
and Opus plus the automatic profile, reads each persisted job through a
new request, checks a signed 1 KiB byte range, and cancels its objects. It accepts
only the fixed `sample` names `big-buck-bunny` (default), `on-and-on` (Cartoon,
Jéja feat. Daniel Levi), and `invincible` (DEAF KEV). For example, fetch
`/api/media/preflight?sample=on-and-on` to try a real song independently of search
and its database-backed rate limiter. Each sample is limited to one probe per
hour per server instance. It accepts no custom source IDs or credentials and is
always 404 in production. Disable the
flag after verification. A successful probe validates the deployed backend;
authenticated physical Android/iOS app switching remains a separate device check.
