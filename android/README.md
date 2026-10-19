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

For Play Store distribution, use a release Android App Bundle (AAB) with application ID `app.haykasa.android`, a maintained private upload keystore and an increasing `versionCode`. The debug preview is a separate application and is not a Play Store release. See the release process below. Store submission and approval remain owner actions.

## Play Store release bundle

From the repository root, `npm run android:bundle` builds `android/app/build/outputs/bundle/release/app-release.aab`. Without signing environment variables, this is an **unsigned review bundle**: it cannot be installed directly or uploaded as a signed Play release. The Android APK CI workflow builds this bundle alongside the debug APK and release unit/lint checks, then uploads a clearly labeled `haykasa-android-unsigned-aab-*` artifact. Pull requests never receive release signing secrets.

For a signed upload bundle:

1. Enroll the Play Console application in **Play App Signing**. Google manages the app signing key used for delivered installs; maintain a private upload key for signing AABs sent to Play Console. Reuse the registered upload key for later releases. Do not generate disposable CI keys or confuse the preview's debug certificate with the production identity.
2. Create the protected GitHub **`android-release`** environment, restrict its deployment branches to `main`, and configure required reviewers. Store the maintained upload keystore outside this repository and back it up securely. Add these environment secrets:

   | Secret | Value |
   | --- | --- |
   | `HAYKASA_ANDROID_UPLOAD_KEYSTORE_BASE64` | Base64 encoding of the maintained upload keystore; never a committed file or release asset. |
   | `HAYKASA_ANDROID_KEYSTORE_PASSWORD` | Keystore password. |
   | `HAYKASA_ANDROID_KEY_ALIAS` | Registered upload-key alias. |
   | `HAYKASA_ANDROID_KEY_PASSWORD` | Upload-key password. |

3. Before **each** release, increase `versionCode` in `android/app/build.gradle` above every version already uploaded to Play, update `versionName`, and merge the reviewed changes into `main`. This workflow does not reserve a version in Play Console or increment it automatically. Check the owner account's accepted version codes before dispatching.
4. Run the manual [Android Play Store Bundle workflow](../.github/workflows/android-play-store.yml) from `main` and approve its protected environment. It runs release unit tests and lint, requires signing configuration, verifies that `jarsigner` explicitly reports `jar verified.`, and uploads only the signed `app-release.aab` as `haykasa-android-play-store-*`. A self-signed upload certificate is expected; this check does not require a public certificate authority. The keystore is decoded into a restricted temporary directory and removed even after failure. Missing or partial credentials fail the signed build rather than producing an unsigned release.
5. Download and extract that artifact. The owner must upload the AAB to a Play Console **internal testing** track, inspect the generated delivery artifacts and pre-launch report, and test installs/updates on supported phones before promotion. An AAB is a publishing format, not a directly installable APK.
6. Complete the store listing, verified privacy-policy URL, accurate **Data safety** declarations, content rating, target-audience and permission/service declarations, account/deletion requirements where applicable, and the owner's review/rollout approval. Declare the actual web authentication, storage and playback behavior; a successful build does not establish policy approval or live background playback.

For local signing, set `HAYKASA_ANDROID_KEYSTORE_PATH` to a readable private keystore outside the repository, set `HAYKASA_ANDROID_KEYSTORE_PASSWORD`, `HAYKASA_ANDROID_KEY_ALIAS` and `HAYKASA_ANDROID_KEY_PASSWORD`, then set `HAYKASA_ANDROID_REQUIRE_SIGNING=1` before `npm run android:bundle`. Do not place secret values in committed shell scripts, Gradle files, logs or command-line arguments. Unset signing variables when returning to unsigned/debug development; a partially configured signing environment is intentionally rejected.

The workflow prepares an upload bundle; it does **not** create a Play developer account, upload to Google Play, publish a listing, or enable automatic native updates by itself. No Play Store download link should appear until an approved listing exists. The existing public debug-preview download is unchanged. Play delivery also does not remove the yt-dlp/source-playback requirements above or override phone security policies for sideloaded APKs.

## Verification before distribution

1. Merge/deploy the bridge and verify authenticated source resolution on production. Do not infer playback success from metadata alone or turn the worker on based on synthetic tests.
2. Install on a phone, log in, select audio mode and play a source-backed track. Switch to another app and lock the phone. Confirm audible playback and notification play/pause/seek, then disconnect headphones and verify pause.
3. Verify next-track resolution, queue edits, repeat/shuffle, session expiry/logout, expired source leases, calls/audio focus, battery saver, task removal and activity/process recreation. Network or service failure must show the existing fallback/error state.
4. Verify login/signup, playlist creation/cover upload, Android Back, external links, keyboard/search and edge-to-edge screen insets. Third-party OAuth providers may disallow WebView login; browser SSO transfer is not implemented.

Local deterministic tests verify bridge commands, production deck integration, native URL policy and a real Chromium DOM with a synthetic native bridge. They do not establish live YouTube extraction or physical-device background behavior.

## Android virtual-phone checks

The Android APK workflow installs the app on hardware-accelerated Pixel 5 emulators running Android 13 (API 33) and Android 16 (API 36), then executes instrumentation inside the actual WebView and Media3 service. The independent matrix jobs retain failures from both versions. It opens the live guest homepage, checks horizontal overflow, opens Search, and verifies keyboard dismissal and Android Back. A separate isolated fixture runs the production resolver client, native bridge and media deck with a mocked resolver API and an in-memory synthetic audio stream. It checks the foreground media service, playback after pressing Home, system media pause/resume and seeking. This fixture does not establish live yt-dlp extraction, authenticated flows, lock-screen behavior or reliable queue transitions.

The workflow uploads device screenshots, Android test reports, crash logs and media-service state as an `android-emulator-api-<api>-*` artifact for each API level. Reproduce with `npm ci`, `node docs/qa/android/create-fixture.cjs`, then `bash docs/qa/android/run-emulator.sh` while an API 33+ emulator is connected. The virtual-phone run exposed missing service session registration and Search/Back lifecycle failures; these are covered by the instrumentation checks. The resolver also avoids newer `AbortSignal.any`/`timeout` APIs for older Android WebViews.

## Mobile robustness updates

Root Android Back now backgrounds the launcher task after keyboard and route history handling, keeping the live WebView connected to native audio. This preserves the current player when returning from another app; it does not restore the queue after Android kills the process. Instrumentation covers leaving with both Home and root Back and returning to the original Activity.

Native cue changes release the prior asset and ignore stale preparation/renewal callbacks; playing a newly cued track starts a single source request. Track changes also refresh the title sent to the native media session. Mobile search now preserves the main branch's results-page submission behavior.

Version 1.0.1 also prevents a startup fade from cancelling a manual Skip, permits the trusted WebView's asynchronous track playback, and stops repeated recovery attempts when YouTube rejects player verification. A renderer exit releases abandoned native players and offers a native Retry action that creates a new WebView. Route Back uses the web router when available so returning Home keeps the active playback document connected.

Downloading the standard APK from a localhost website does not point the installed app at localhost: its trusted website and media origin remain `https://haykasa.vercel.app`. Both deployed web changes and the new APK are needed to exercise all these fixes. Native notification next/previous queue commands are not implemented; the in-app controls own queue navigation.

## PR35 follow-up repairs

The playback notification now returns to the existing Activity/WebView instead of opening a second bridge. Instrumentation uses the media session's actual notification PendingIntent to exercise this path.

Each native audio load retires the previous subscription and releases its ExoPlayer source, including an empty-source reset. Late messages from an old subscription are ignored. Cueing a new track cannot leave the previous source playable through the system media session. The existing bridge and emulator checks cover source retirement, cue cleanup and subsequent playback.

Submitting search text records the normalized query for authenticated, nonprivate sessions while retaining the results-page navigation. Guest and private-session submissions do not write history. These repairs do not change the source-playback activation requirements or establish live extraction, physical-device behavior, process restoration or suspended next-track continuation.

## Public preview download

Settings places **Download for Android** beside the Windows desktop download. It uses `/api/android/download` to download the standalone `HayKasa-Android.apk` from this repository's public `android-preview` prerelease. Users do not need a GitHub account or ZIP extraction. Android may require permission to install apps from the browser; Samsung Auto Blocker can prevent installation even when that permission is granted. The download card includes installation help and a **Use web app** alternative.

`/api/android/manifest` checks the exact release tag and APK name, uploaded state, canonical GitHub URL, size and SHA-256 metadata before enabling the download. Missing releases disable the button; lookup failures can be retried. GET and HEAD downloads use the same fixed public release target. These endpoints contain no credentials and do not proxy APK bytes through Vercel.

The public preview is the debug-signed APK from the verified PR35 build. Publishing it as a GitHub Release keeps the download available after the Actions artifact expires. It is labeled Preview and does not provide automatic Android updates or Play Store distribution. CI debug signing keys are disposable, so replacing the public APK with a separately signed build may require uninstalling an older preview. Use a maintained private signing key before promising production updates.

Public preview replacement is a deliberate release operation: use an APK from a successful Android unit/lint/build and emulator run, verify its artifact digest and source commit, and retain the exact public filename and preview tag. The `Publish Android Preview` workflow validates that the selected APK and emulator jobs passed and the source was merged into main, checks the artifact digest and APK signature, then publishes the initial preview. Repeating publication with the same APK is harmless; a different existing APK is rejected instead of silently replaced. Normal APK CI builds do not replace this public download automatically. No signing keys belong in release assets or the repository.

### Samsung: “Unknown app blocked”

This dialog comes from Samsung Auto Blocker before HayKasa is installed. The downloadable preview is an APK from outside the Play Store or Galaxy Store. Auto Blocker can reject such installations even when an APK is correctly signed; changing the app's name or signature cannot override this phone policy. HayKasa has no published store listing in this repository's distribution configuration.

Choose **Use web app** in Settings to continue in the browser without installing an APK or changing installation controls. This uses existing browser playback support and does not enable embedded YouTube background playback.

If you choose to install the preview manually:

1. Review **Settings → Security and privacy → Auto Blocker** on the phone. Samsung requires this setting to be off to install APKs outside approved stores.
2. Under **Install unknown apps**, allow the browser or file manager used to open the downloaded APK. Menu names vary across Android versions.
3. Open `HayKasa-Android.apk` in Downloads and follow Android's installation prompt.
4. Restore your previous installation permissions and Auto Blocker setting after installation.

HayKasa cannot detect this dialog from the website, alter the phone's security settings, or guarantee installation on a restricted device. Store distribution requires a maintained release/upload key, a store developer account, and an approved listing. A Play Store or Galaxy Store download button must only be added after a real listing exists. The public preview can be older than the current source branch; these instructions do not replace its APK or add newer native fixes to it.

## Native screen layout and updates

Version 1.0.2 (version code 3) sizes the WebView inside a native safe-area container. The status bar, camera cutout, navigation buttons and keyboard reduce the actual CSS viewport; they no longer overlap fixed top controls or bottom tabs. Both the main interface and native connection/retry screen use this container. Portrait/landscape viewport and combined cutout/keyboard inset checks run with the Android instrumentation suite.

For a nondebug build installed through Google Play, the native app checks for available updates when it enters the foreground. An eligible flexible update opens Google's consent flow and downloads through Play. Once downloaded, HayKasa offers **Restart** or **Later**; installation/restart only follows the user's Restart choice. Play unavailability or an update-check failure leaves the current app usable. The same version is not repeatedly prompted during one process session.

This needs an actual Play listing/test track, an eligible signed build installed from Play, and a newer version code published to that user's track. The repository prepares the bundle but does not create a developer account, upload to Play or approve a listing. Verify the real flow using two consecutive internal-test releases before production rollout. Existing debug/sideloaded previews skip Play update checks; merging this PR cannot replace their installed APK or signing key. Website deployments continue to supply web interface changes when loaded, while native changes require a new installed app version.
