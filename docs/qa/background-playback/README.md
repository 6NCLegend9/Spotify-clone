# Authenticated background playback

Native media resume no longer uses the iframe-only foreground restriction. A current authenticated session whose account matches the playback owner may resume native audio while the page is hidden. Explicit lock-screen/headset Play remains a user action. Guest/stale account contexts retain foreground recovery. Existing owner cleanup, explicit Pause/Stop and media lifecycle handling remain in place.

The player uses codec capabilities rather than a browser-name allowlist: Opus/WebM or AAC/MP4, with the existing embedded fallback if native playback is unavailable. Media Session metadata and playback state now tolerate missing constructors and rejected setters, so optional browser APIs cannot prevent remaining media controls from being registered.

Native play/context resume catches synchronous throws and promise rejections. Late errors from a paused, destroyed, superseded or previous-track play attempt do not override newer playback intent. Autoplay denial requests a user action rather than trying to bypass browser policy.

Unavailable/private uploads (100), owner embed restrictions (101/150), and player verification failures (153) pause the selected song and show recovery actions immediately. These errors do not automatically replace uploads or advance the queue. Other transient failures retain bounded retries and alternate uploads; exhausting that budget pauses the current queue occurrence. Normal track completion and explicit Next remain available.

## Verification

Run `node docs/qa/background-playback/check.cjs` and `npm run check`. The synthetic component-deck harness covers authenticated/guest/mismatched account policy, explicit media-key intent, absent/partial Media Session APIs, Opus/AAC capability selection, native Play/Pause, synchronous and asynchronous permission denial, stale rejection after Pause and decode fallback. The checks also run in regular CI. They do not reproduce actual browser or OS suspension.

The same harness executes the production failure callback for numeric/string 100/101/150/153, including an embed restriction interrupting a pending Skip fade. It verifies immediate pause, preservation of the selected song and occurrence, no reload/search/queue advance, and the manual retry policy. Repeated transient failures must exhaust their retry/alternate budget and stop without advancing the queue.

Manual device checks: with the media service enabled, sign in, tap Play, switch tabs, minimize, then lock the screen on Chrome/Edge, Firefox, Safari, Android and iOS. Verify audio continues where supported, lock-screen controls work, a track can finish and advance, and explicit Pause/Stop remains paused on returning. Repeat with unsupported codecs/Media Session and a failed source request; verify the existing fallback/error flow. Log out or switch accounts and verify prior playback clears.

## Production availability check

On October 14, 2026, a read-only GET to `https://haykasa.vercel.app/api/media/resolve` returned HTTP 200 with `{ "enabled": false }`. The production native source service was not enabled during this check. No media jobs or user data were requested.

## Activation and browser limits

The existing native source path requires `MEDIA_SERVICE_URL`, `MEDIA_SERVICE_API_KEY` and an appropriate receipt signing secret. Deployment/activation of that external service was outside this code change; configured service readiness and real source extraction remain separate checks. If native playback is unavailable, the app uses the embedded provider, whose background behavior depends on the provider and browser. Browser autoplay requires user interaction, and mobile OS/browser suspension cannot be overridden by a web application. No claim of universal locked-screen playback is made.
