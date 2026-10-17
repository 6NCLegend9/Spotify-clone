# Hosted live extraction retest after registry cleanup — 2026-10-17

The media registry capacity blocker has been cleared. The protected preview
`dpl_HUVQ5GBKtzEBU6Ua6x6opkTGNb2a` successfully deployed commit
`97b9ecfa1f786d8e5367961431a739c970064694` and ran the actual preview preflight.

Live response: HTTP 503:

```json
{"ready":false,"storage":"passed","range":"passed","stage":"extraction_mp4-aac","reason":"source_access_restricted"}
```

Private Blob persistence, lease renewal and signed byte-range delivery passed.
The next boundary, yt-dlp extraction of the public sample `aqz-KE-bpKQ`, was
rejected by YouTube's bot-verification response from the deployed worker.
No real source asset reached decoding or Android playback. This is a current
hosted extraction failure, distinct from the earlier sandbox proxy refusal.
Changing the Android shell cannot supply the missing upstream audio asset.

`MEDIA_SERVICE_DEPLOYMENT_PROBE` was reset to `0` after verification. Production
source playback remains disabled. Activation still requires an authorized media
source or hosting egress that can successfully extract and deliver real audio;
no provider authentication or access restrictions were bypassed.

---

# Live yt-dlp retest — 2026-10-17

Result: **blocked; live extraction and Android playback did not pass verification**.
The successful Android emulator tests used synthetic audio and do not change this result.

| Boundary | Current evidence |
| --- | --- |
| Deployed worker health | Production `/media-health` returns HTTP 200 with `ready: true`. |
| Production playback gate | A valid mobile `POST /api/media/resolve` returns HTTP 503, `state: failed`, `reason: service_disabled`. |
| Real sandbox extraction | The production `JobManager`, yt-dlp `2026.8.19` and EJS `0.8.0` attempted the fixed public sample `aqz-KE-bpKQ`, audio `mp4-aac`. It failed with `upstream_tool_failed`; the redacted subprocess diagnostic identifies an outbound proxy tunnel refusal, `403 Forbidden`, before reaching YouTube. This is not evidence of YouTube's current response from Vercel. |
| Deployed live diagnostic | A protected, preview-only deployment was attempted. The newest-SHA build was canceled after discovering the registry limit; a retry using the already-deployed `8d2b588` SHA also failed at container image push. Vercel reports `denied: repository has reached the maximum allowed number of images`. No new preflight extraction request ran. |
| Live asset delivery, decoding and Android background playback | Not reached: no live asset was produced. |

**High availability finding: media container registry capacity blocks deployments.**
The rejected registry repository is `vcr.vercel.com/6nclegend9s-projects/spotify-clone/media`.
To reproduce, rebuild the worker image and push it through the Vercel preview build.
The build fails when writing its image manifest, including when reusing an existing commit tag.
Clear unused images in the project's **Sandboxes → Container Registry** while retaining images
used by active deployments, or increase the registry allowance. Deleting preview deployment
URLs alone must not be assumed to clear registry images.

Diagnostic preview: `dpl_CJQYF93oLs5o8Hvqo3tetPPoBBxV`, commit
`8d2b588faea9eeed9f11afe9782b7e929b411e7c` (media-service and resolver code identical
to the tested Android branch head `6e2d109`). The first attempt was
`dpl_BiMmdcrjhbPMjJf5ZDU1FJbzWD8k` (canceled).

After the attempt, branch-scoped `MEDIA_SERVICE_DEPLOYMENT_PROBE` was reset to `0`.
Production configuration and its playback flag were unchanged. No user login, cookies,
provider credentials, or source-access bypasses were used. The 2026-10-14 YouTube
bot-verification finding below remains historical evidence, not a new extraction result.
After registry capacity is restored, rerun `/api/media/preflight` on a protected diagnostic
preview. Only a successful live asset download and decode can support proceeding to
live Android background verification.

---

# Vercel mobile media verification — 2026-10-14

Status: infrastructure verified on preview; YouTube extraction blocked. The
worker can be deployed to production with native playback disabled. Do not enable
source playback until a working authorized source is available. See `WORKERS.md`.

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

At the time of these preview checks, production remained on the existing main
deployment. The subsequent worker rollout keeps source playback disabled.
Physical Android/iOS app
switching and lock-screen playback have not been verified. A desktop browser
with a mobile user agent does not establish those behaviors.
