# Ponytail playback audit — October 21, 2026

The production website contains PR39, but live music is still unverified and failed in this environment. The local repairs below address a reproduced startup bug, obstructive failure UI, and lost diagnostics. They do not establish successful YouTube playback or a delivered audio bitrate.

## Deployment and test scope

- Live site: <https://haykasa.vercel.app>.
- Production deployment: `dpl_Fk8adzUPBoMw7J31GqtFtjkfJZ1D`, READY, commit `70a93bc9352aa74ac00d45589ed3e89e96ecfe66`.
- Real production checks used fresh desktop and mobile Chromium browser profiles, ordinary clicks, live APIs, and no response replacements. Mobile viewport emulation is not an installed APK.
- Production HTML was `private, no-cache, no-store`; the service worker was `no-cache, no-store, must-revalidate`. Fresh and reloaded pages provided no evidence of stale PR39 web code. This does not inspect every existing user's cache.
- The Android manifest offered a preview built from the merge commit. The stable Windows installer was still 1.0.0, with no published signed update. Shared web UI updates do not replace installed native APK/EXE code.
- Reproduction scripts, original JSON, screenshots, build output, and local verification results are under `artifacts/ponytail-production-playback-2026-10-21/`.

## Findings and local repairs

### Play selection disappears when the initial session check finishes

**Category:** Playback state / startup race. **Severity:** Medium.

**Reproduction:** Delay the first `/api/auth/session` response in an isolated local browser test. Select a song while the response is pending. Release the response as an unauthenticated guest. Before the repair, the player dock disappears: `PlaybackPersistence` restores an empty or older guest snapshot over the explicit selection.

One live mobile attempt also lost its selected dock after Play, without a JavaScript exception. The isolated timing test reproduces a concrete cause; it does not prove that every physical-phone failure has this cause.

**Repair:** Wait for session resolution before initializing playback ownership. Preserve an explicitly selected, unowned track when it becomes the initial guest session, and avoid restoring a queue already owned by the resolved session. Restored queues remain paused. Account changes and explicit clearing still remove personal playback.

**Coverage:** The browser fixture withholds the session until after a normal Play click. Reducer checks cover the retained occurrence and play intent, untouched saved queues, account sign-in, account switching, sign-out, and explicit clearing.

### Playback failure panel covers mobile results and has low-contrast links

**Category:** Responsive UI / accessibility. **Severity:** Medium.

**Reproduction:** Select a song when the YouTube SDK fails to load. The production screenshot shows a large panel covering the result card and songs, with dark blue text against a dark background.

**Repair:** Keep the main error and Retry visible in a compact panel. Put explanations and secondary actions in a native Details disclosure. Use an opaque surface and readable, underlined link text. Keep the playback dock and navigation accessible.

**Coverage:** Local compiled UI checks cover narrow phone, ordinary phone, landscape, desktop, disclosure behavior, 44px action targets, link contrast, no overflow, and explicit Retry. The SDK in these UI checks is synthetic; its reported progress is not evidence of audible music.

### Worker failures and provider diagnostics lose their useful error categories

**Category:** Error reporting / observability. **Severity:** Medium.

**Reproduction:** Pass a failed worker result with `reason: "source_access_restricted"` through `normalizeMediaResult`. Before the repair, it becomes `source_unavailable`. The native fallback then discards its reason. `diagnosticRecord` also rejects the `native_fallback` and `sdk_unavailable` codes emitted by the player.

**Repair:** Preserve only a small allowlist of classified worker failures. Retain safe fallback reasons and known YouTube error codes in support diagnostics, and distinguish disabled audio from provider access denial in the explanatory UI. Arbitrary upstream text, URLs, and credentials remain excluded.

**Coverage:** Real module checks reproduced the classification loss before editing. Regression assertions cover the allowed categories and reject arbitrary text, objects, signed URLs, and unknown codes.

## Live playback remains blocked

**Category:** Playback availability. **Severity:** High. **Status:** Unresolved.

1. Search for `Cartoon On On NCS` or `DEAF KEV Invincible NCS`.
2. Choose `K4DyBUG242c` or `J2X5mJ3HDYE`.
3. Production `/api/media/resolve` reports `enabled: false, reason: "service_disabled"`. A valid POST returns HTTP 503 with the same reason, before extraction or account lookup.
4. In this VM, `https://www.youtube.com/iframe_api` fails with `net::ERR_TUNNEL_CONNECTION_FAILED`. No CSP rejection or page JavaScript exception was captured. This proxy failure does not establish that the script is blocked on a user's physical device.

No active audio asset loaded, so no live codec, bitrate, speaker output, or background playback can be credited. Manual Next changed selection in the completed live attempts; selection changes do not establish music playback.

The preceding hosted-worker checks for the same production source tree returned `source_access_restricted` and YouTube's bot-verification message for both songs. Those are retained in `artifacts/pr39-merged-production-2026-10-21/worker-extraction-repeat.json`; this audit did not repeat unchanged extraction attempts, activate direct audio, or bypass verification.

Enabling a flag cannot supply a playable source that the provider refuses to deliver. A working authorized source and a successful real-song check are required before enabling this path or calling playback fixed.

## Verification limits

The optimized production build passed compilation, lint, and type checks. All five controlled browser scenarios passed; each collapsed error panel measured 74px, and the tested link contrast was 13.79:1. The focused playback, media configuration/privacy, and source-eligibility checks passed. The isolated security regression command passed with 2,612 cases, zero external requests, and zero uncaught exceptions; deliberate mocked server failures in that suite are not production HTTP errors.

The repairs are local until explicitly published. Production observations above describe the existing PR39 deployment. Current build/test outcomes are recorded with the artifacts; a passed failure-handling or generated-audio test is never a live playback pass.

No installed Windows or Android runtime was rerun in this audit. No account writes, production credentials copied into local testing, production environment changes, merges, native releases, or provider-restriction bypasses were performed.
