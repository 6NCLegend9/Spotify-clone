# HayKasa Android

Android 6.0+ app containing the production mobile interface and a native Media3 audio service. The website supplies accounts, playlists, search, and the authenticated media resolver. The Android service owns successfully resolved source audio, audio focus, headphone disconnection, media notifications and lock-screen play/pause/seek. The bridge only accepts messages from the main frame of `https://haykasa.vercel.app`, and the service accepts only that origin's signed `/v1/assets/<id>` source URLs. Cookies and signed source URLs are not logged or written to app preferences. Android backs up neither app data nor sessions.

## Background playback dependency

An APK does not bypass embedded YouTube playback restrictions. Native playback requires the existing yt-dlp service to return a complete playable asset. Its Vercel activation flag `MEDIA_SERVICE_PLAYBACK_ENABLED=1` must only be enabled after a real extraction, asset download and decoding check succeeds from the intended host. Backend credentials, private Blob configuration and signed delivery must already be configured as described in `media-service/README.md` and `PRODUCTION.md`. No yt-dlp binaries or provider credentials are shipped in the APK.

When source playback is unavailable, the existing embedded player remains a foreground fallback. That fallback does not promise background audio. Native playback is selected only in audio mode; video uses the existing player. Native EQ, normalization and mono processing are not implemented in this initial Media3 output; volume is supported. Multi-track continuation still uses the web queue and source resolver; reliable queue transitions with the WebView suspended, Android process recreation, network loss and OEM battery restrictions require on-device verification. This is an initial Android build, not a verified production release.

The first native release loads the live website. **The web bridge integration in this PR must reach production before the installed app can use Media3.** Existing browser playback continues unchanged when the native bridge is absent. Website fixes arrive with normal production deployments; changes to Java/native dependencies require another APK.

## Build and install

Use JDK 21, Android SDK platform 36 and build tools 36.0.0. Set `ANDROID_HOME` to your SDK or configure Android Studio's local SDK path. From this directory:

```sh
./gradlew testDebugUnitTest lintDebug assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

On Windows PowerShell, use `.\gradlew.bat` in place of `./gradlew`. From the repository root, `npm run android:build` also builds the debug APK.

The Android APK GitHub Actions workflow also builds an installable `app-debug.apk` artifact for PRs and main. Download the workflow artifact, extract it and open the APK on an Android phone; allow installation from that browser/file manager when Android asks. Debug builds use package `app.haykasa.android.debug`. CI debug signing keys are disposable: uninstall an earlier CI build if its signing key differs. A debug APK is for testing, not Play Store distribution.

For a production release, use Android Studio's **Generate Signed Bundle / APK**, a maintained private release keystore, application ID `app.haykasa.android`, and increasing `versionCode`. Keep the keystore outside the repository. Never distribute an unsigned release or commit signing credentials. Play Store submission and native update publishing are not configured by this initial build.

## Verification before distribution

1. Merge/deploy the bridge and verify authenticated source resolution on production. Do not infer playback success from metadata alone or turn the worker on based on synthetic tests.
2. Install on a phone, log in, select audio mode and play a source-backed track. Switch to another app and lock the phone. Confirm audible playback and notification play/pause/seek, then disconnect headphones and verify pause.
3. Verify next-track resolution, queue edits, repeat/shuffle, session expiry/logout, expired source leases, calls/audio focus, battery saver, task removal and activity/process recreation. Network or service failure must show the existing fallback/error state.
4. Verify login/signup, playlist creation/cover upload, Android Back, external links, keyboard/search and edge-to-edge screen insets. Third-party OAuth providers may disallow WebView login; browser SSO transfer is not implemented.

Local deterministic tests verify bridge commands, production deck integration, native URL policy and a real Chromium DOM with a synthetic native bridge. They do not establish live YouTube extraction or physical-device background behavior.

## Android virtual-phone checks

The Android APK workflow installs the app on a hardware-accelerated Android 13 Pixel 5 emulator and executes instrumentation inside the actual WebView and Media3 service. It opens the live guest homepage, checks horizontal overflow, opens Search, and verifies keyboard dismissal and Android Back. A separate isolated fixture runs the production resolver client, native bridge and media deck with a mocked resolver API and an in-memory synthetic audio stream. It checks the foreground media service, playback after pressing Home, system media pause/resume and seeking. This fixture does not establish live yt-dlp extraction, authenticated flows, lock-screen behavior or reliable queue transitions.

The workflow uploads device screenshots, Android test reports, crash logs and media-service state as an `android-emulator-*` artifact. Reproduce with `npm ci`, `node docs/qa/android/create-fixture.cjs`, then `bash docs/qa/android/run-emulator.sh` while an API 33+ emulator is connected. The virtual-phone run exposed missing service session registration and Search/Back lifecycle failures; these are covered by the instrumentation checks. The resolver also avoids newer `AbortSignal.any`/`timeout` APIs for older Android WebViews.

## Mobile robustness updates

Root Android Back now backgrounds the launcher task after keyboard and route history handling, keeping the live WebView connected to native audio. This preserves the current player when returning from another app; it does not restore the queue after Android kills the process. Instrumentation covers leaving with both Home and root Back and returning to the original Activity.

Native cue changes release the prior asset and ignore stale preparation/renewal callbacks; playing a newly cued track starts a single source request. Track changes also refresh the title sent to the native media session. Mobile search now preserves the main branch's results-page submission behavior.
