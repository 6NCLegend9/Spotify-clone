# Vercel mobile media verification — 2026-10-14

Status: infrastructure verified on preview; YouTube extraction blocked. Do not
enable this candidate in production until a working authorized source is available.

Code verified by CI: `ac750ffa394b426f2e775fff9e705ae5af672311`.
The live backend check ran against commit
`a7a5dfb0de2f1587f1215e0e1eb8fade13a1e724`, deployment
`dpl_AKnrw5XFQndPGdQ2st49Pst6sQVq`. The subsequent code change requests the
browser playback audio session; it does not change extraction or storage.

## Passed checks

- Vercel container startup and private frontend service binding.
- FFmpeg generation of a short AAC fixture, upload to private Blob, manifest
  read-back through a separate request, lease renewal, signed 1 KiB range
  delivery with HTTP 206, and fixture cancellation.
- Full CI, Security Regression, and Mobile Playback VM passed for the code SHA
  above. The VM covers Chromium, Firefox, and WebKit using offline audio.
- Installed Blob SDK response objects are used in storage regression fixtures.
  Ownership, invalid signatures, malformed bodies and ranges, upload rollback,
  safe error responses, and expiration cleanup are covered.

## Open finding: YouTube rejects extraction from the deployed worker

Category: Upstream access / playback availability.
Severity: High — blocks the requested YouTube background playback feature.

Reproduction:

1. On a protected preview, enable the branch-scoped
   `MEDIA_SERVICE_DEPLOYMENT_PROBE=1` and deploy.
2. Fetch `/api/media/preflight` once. The diagnostic first checks generated
   audio independently, then extracts the fixed public sample `aqz-KE-bpKQ`.
3. Observe HTTP 503 with this response:

```json
{
  "ready": false,
  "storage": "passed",
  "range": "passed",
  "stage": "extraction_mp4-aac",
  "reason": "source_access_restricted"
}
```

Expected: both source audio profiles prepare and support signed range requests.
Actual: the worker classifies YouTube's bot-verification response as an access
restriction. The Opus source check is not reached after the AAC failure.

Impact: functioning Vercel hosting and storage cannot by themselves make the
blocked YouTube source available. Connecting an authorized media origin or an
authorized worker with working provider access is required before activation.
No provider authentication was bypassed and no personal cookies were requested.

## Fixed during verification

- Private Blob manifest reads failed with `GetBlobResult` lacking `stream`.
  The pinned SDK returns `content` bytes. The reader now uses that contract,
  disables cached manifest reads, and tests with the actual SDK response class.
- The previous fixed sample `BaW_jenozKc` returned “This video is unavailable.”
  The diagnostic now uses the public sample above and recognizes that error.
- Preview diagnostics previously required MongoDB before reaching the worker.
  They now use a bounded preview-only memory limiter; production authentication
  and its persistent limits retain their existing database checks.

Production remains on the existing main deployment. Physical Android/iOS app
switching and lock-screen playback have not been verified. A desktop browser
with a mobile user agent does not establish those behaviors.
