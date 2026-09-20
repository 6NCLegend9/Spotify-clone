# Guest search and playback investigation — 20 September 2026

## Observed behavior

On https://haykasa.vercel.app/, an unauthenticated browser returned suggestions
and song results for `Adele Hello`. Selecting the suggestion opened a search
for `Adele - Hello Adele`. Selecting `Adele - Hello` loaded YouTube video
`T1tl66trXTQ`; the app continued to show 0:00 with a Pause control. This is not
evidence that every guest search fails, nor proof of the cause of that stall.
Cross-browser playback and production server logs were not available in this investigation.

The supplied screenshots show two distinct provider restrictions: an upload
that cannot play outside YouTube, and a YouTube sign-in/bot-verification prompt.
HayKasa guest authentication does not authenticate a viewer with YouTube.
An API key for search does not grant permission to play a restricted upload.

## Confirmed code defects and changes

- Song queries were rewritten with `official music video|official audio`.
  Preserve the user's sanitized query, including language and requested version.
- Source-branding bonuses outweighed song relevance. Rank by query-word
  coverage first, then official-source preferences. A channel name containing
  `VEVO` or `Official` is still a heuristic, not verification of ownership.
- A thrown HTTP fallback request escaped directly to the outer error handler,
  skipping the youtubei.js search implementation. Isolate fallback attempts.
  Exhausted provider failures remain errors instead of successful empty results.
- Fallback mappers fabricated `embeddable: true` from search/oEmbed metadata.
  Leave unknown permission unspecified, filter explicit negative permissions,
  identify fallback search responses, and explain their playback limitations.
- The player offered Retry for embedding-denied and unavailable uploads.
  Those errors now explain the restriction and offer other versions, Skip,
  and Open YouTube. Transient errors retain manual Retry. No automated bypass
  or repeated retry loop is added.

## Validation and remaining work

Eleven focused Node tests pass: unchanged multilingual queries, requested-song
ranking, fallback failures, actual youtubeFetch integration with mocked upstreams,
unknown embed permission, official-only filter behavior, and error recovery policy.
The official API request retains `videoEmbeddable=true` and
`videoSyndicated=true`. Its region/session-dependent playback outcome must still
be confirmed by the embedded player.

Full application build, lint, typecheck and browser regression gates must run
in CI; only the relevant source subset was available locally. No production
environment variables were read or changed, and this branch is not a deployment.

Before release, check CI and the preview deployment; test guest search with
Latin and non-Latin song names, explicit live/cover versions, a known playable
video and a known embedding-denied video. Confirm stable playback beyond 30
seconds in desktop Chrome, Firefox, Safari and Android. Check production
YouTube Data API configuration and quota in the hosting/Google consoles; this
investigation does not establish whether the current key is missing or exhausted.

YouTube verification and rights restrictions cannot be fixed by frontend code.
Guaranteed playback independent of YouTube requires an authorized media source
whose playback rights cover the app's users.

References:
- https://developers.google.com/youtube/iframe_api_reference#onError
- https://developers.google.com/youtube/v3/docs/search/list
