# D06 implementation and verification

Contract: [ordered-transport-v1 at 2d12b17](ANDROID-TRANSPORT-DRAFT.md), confirmed in [C008](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6389527896). The user asked the coordinator to continue when the peer ran out of time; [C009](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6400510927) records the temporary lane takeover.

## Native stage — 2026-10-25

Implemented and locally checked; **not an end-to-end fix claim**. The current web adapter still uses legacy messages. Both original defects remain open; Jam persistence is outside this stage.

| Component | Implementation | Verification / remaining work |
| --- | --- | --- |
| [OrderedTransport](../../../android/app/src/main/java/app/haykasa/android/OrderedTransport.java) | Looper-confined command/intent/event ordering; processed/applied watermarks; immutable bounded result cache; explicit no-op acknowledgements; observed Play completion; scoped pending deadline and retirement. | 12 actual production-class JVM cases pass in both build variants. Native callback/scheduling behavior still needs instrumentation. |
| [OrderedMediaBridge](../../../android/app/src/main/java/app/haykasa/android/OrderedMediaBridge.java) | Strict typed parsing, trusted attachment authority supplied by Java, bounded Hello grants/empty reservations, CAS Bind/rebind, full-scope control, non-state lifecycle ACK/errors and ordered snapshots. | Compiles and passes lint. Actual Android service/JSON producer tests are added and compiled; not locally executed. |
| [PlaybackService](../../../android/app/src/main/java/app/haykasa/android/PlaybackService.java) / [SessionTransportPlayer](../../../android/app/src/main/java/app/haykasa/android/SessionTransportPlayer.java) | Session-only explicit system intent hook, raw-player web/policy changes, active-load/raw identity guards, current-getter observations, and one wrapper/raw release owner. Preserves legacy envelopes. | Local build succeeds. Actual MediaController/decoder/notification/foreground behavior needs emulator/device results. |
| [MainActivity](../../../android/app/src/main/java/app/haykasa/android/MainActivity.java) | Per-document attachment retirement, queued-command/sink identity checks and no untagged error fallback for ordered requests. | Compiles/lints; document replacement and real WebView bridge integration still need execution. |
| Web adapter/deck | Existing legacy implementation retained at this milestone. | Ordered consumer, recovery/error visibility and ordering regressions pending. Do not qualify an old APK or a probe-timeout legacy session. |

Android version is **1.0.3 / code 4**. Standard `desugar_jdk_libs:2.1.5` keeps the Java functional APIs available on the existing API23 minimum; the minimum OS is unchanged. A new installed native binary is required. No artifact was published as a release and production was not activated.

The service no longer exposes its raw ExoPlayer directly through MediaSession. Existing instrumentation's decoder inspections were updated to inspect the actual raw decoder behind the forwarding wrapper; their checks were retained.

## Local evidence

Run with a task-local JDK21/Android SDK36 and the environment's existing proxy/CA trust:

```sh
./android/gradlew -p android --no-daemon testDebugUnitTest lintDebug assembleDebug \
  testReleaseUnitTest lintRelease bundleRelease compileDebugAndroidTestJavaWithJavac
```

- Debug and release JVM suites: **18 tests each, zero failures/errors/skips**, including the same 12 new transport-owner cases in each variant.
- Debug and release lint: **zero errors**. Existing deprecation warnings are not playback evidence.
- Debug APK and release AAB built successfully. This is compilation/packaging evidence only.
- Instrumentation source compilation succeeds, including eight new [OrderedBridgeTest](../../../android/app/src/androidTest/java/app/haykasa/android/OrderedBridgeTest.java) cases for actual service/codec/session behavior: no-op/lookup, load conflict/stale scope, numeric fuzz, bind/rebind, MediaController Play after Pause, consumed-grant/missing-load safety, detached-wrapper isolation, and exhausted-counter recovery.
- The current host has no `/dev/kvm` or running Android emulator. **Those eight instrumentation tests are compiled, not locally executed.** API33/36 CI must supply their execution results; physical-device and audible-output qualification remain separate.

No source extraction, live bitrate, native queue ownership, source renewal/reconnect, DSP, or Safari/iPhone success is established by this stage. The source-access gate and unresolved source/guest/full-v2 decisions remain in the [requirements checklist](../../superpowers/plans/2026-10-24-ytdlp-migration.md).

Next: connect and regression-test the capability-aware web adapter/deck, verify the real producer/consumer path and older clients, then reconcile CI/device evidence. PR42 remains draft.
