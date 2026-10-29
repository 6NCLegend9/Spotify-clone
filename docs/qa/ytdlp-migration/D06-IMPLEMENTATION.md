# D06 implementation and verification

Contract: [ordered-transport-v1 at 2d12b17](ANDROID-TRANSPORT-DRAFT.md), confirmed in [C008](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6389527896). The user asked the coordinator to continue when the peer ran out of time; [C009](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6400510927) records the temporary lane takeover.

Baseline milestones are native `1c6b433`, client `90c3602`, and documentation head `4d5efe2`. C018's three corrections pass the inspected Windows/emulator checks; normal checks also pass at `1ec8cac`. The separate N02g retired-binding case now fails on both actual emulators when explicitly enabled. Selected screenshots are visually reviewed in the latest cross-platform section below; physical audio/live-source success and the provider migration remain unqualified. Exact-head outcomes are recorded in [PR42 comments](https://github.com/6NCLegend9/Spotify-clone/pull/42).

## Native stage — 2026-10-25

Native milestone `1c6b433` is implemented and locally checked. It was intentionally not an end-to-end fix claim: the adapter was still legacy at that commit. The subsequent client stage below connects the consumer. Jam persistence is outside D06 and remains open.

| Component | Implementation | Verification / remaining work |
| --- | --- | --- |
| [OrderedTransport](../../../android/app/src/main/java/app/haykasa/android/OrderedTransport.java) | Looper-confined command/intent/event ordering; processed/applied watermarks; immutable bounded result cache; explicit no-op acknowledgements; observed Play completion; scoped pending deadline and retirement. | 12 actual production-class JVM cases pass in both build variants. Native callback/scheduling behavior still needs instrumentation. |
| [OrderedMediaBridge](../../../android/app/src/main/java/app/haykasa/android/OrderedMediaBridge.java) | Strict typed parsing, trusted attachment authority supplied by Java, bounded Hello grants/empty reservations, CAS Bind/rebind, full-scope control, non-state lifecycle ACK/errors and ordered snapshots. | Compiles and passes lint. Actual Android service/JSON producer tests are added and compiled; not locally executed. |
| [PlaybackService](../../../android/app/src/main/java/app/haykasa/android/PlaybackService.java) / [SessionTransportPlayer](../../../android/app/src/main/java/app/haykasa/android/SessionTransportPlayer.java) | Session-only explicit system intent hook, raw-player web/policy changes, active-load/raw identity guards, current-getter observations, and one wrapper/raw release owner. Preserves legacy envelopes. | Local build succeeds. Actual MediaController/decoder/notification/foreground behavior needs emulator/device results. |
| [MainActivity](../../../android/app/src/main/java/app/haykasa/android/MainActivity.java) | Per-document attachment retirement, queued-command/sink identity checks and no untagged error fallback for ordered requests. | Compiles/lints; document replacement and real WebView bridge integration still need execution. |
| Web adapter/deck | Existing legacy implementation retained at the native milestone. The subsequent client stage is described below. | Do not qualify an old APK or a probe-timeout legacy session. |

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

Native-stage CI: [Android run 40218841017](https://github.com/6NCLegend9/Spotify-clone/actions/runs/40218841017) reports API33, API36 and APK jobs successful for `1c6b433`. The main `check` job also passed; `sandbox-regressions` was cancelled. Artifact download failed from this host, and log retrieval returned no content. These are reported CI outcomes, not independently inspected per-test counts, screenshots or audible evidence.

## Negotiated client and integration stage — 2026-10-25

The confirmed wire contract is unchanged. No provider, catalog, guest authentication, queue persistence, production flags or full-v2 ownership interfaces change in this stage.

| Component | Implementation | Local verification |
| --- | --- | --- |
| [orderedAndroidTransport.mjs](../../../src/components/MusicPlayer/media/orderedAndroidTransport.mjs) | Bounded capability negotiation and cached legacy mode, exact scope/CAS recovery, strict frame invariants, pending-intent overlay, correlated immutable results, separate actual output, scoped deadlines and lifecycle controls. A known binding reconnects without replaying Load/Play/seek/volume; missing continuity requires a deliberate new-source decision. | 23 actual consumer/deck cases with scripted envelopes cover delayed/fresh-old-processed frames, notification Play, supersession, terminal replay, pre-application rejection, no-op Pause, timeouts, counter validation, bounded requests, reset, missing load and legacy latch/downgrade behavior. Fixtures are not native producer proof. |
| [androidAudioElement.mjs](../../../src/components/MusicPlayer/media/androidAudioElement.mjs) | Existing legacy envelope retained. Ordered intent/output/error events are separate, no DOM `playing` is fabricated from posting Play, source IDs retire, and decoder errors are reported once per load. | Retained legacy bridge/deck regression suite and real headless Chromium DOM check pass. They use a synthetic bridge, not an Android emulator. |
| [nativeMediaDeck.mjs](../../../src/components/MusicPlayer/media/nativeMediaDeck.mjs) | Consumes ordered intent independently of output. Transport failure does not pause/release/retry the decoder. Exposes deliberate reconnect and fresh-source reload; lifecycle release does not impersonate user Pause. Recovered metadata preserves native position and intent. | Actual deck plus actual adapter fixtures verify delayed ACK behavior, no corrective commands, no source fallback on control failure and reconnect without replay. |
| [YouTubePlayer.jsx](../../../src/components/MusicPlayer/YouTubePlayer.jsx) | Qualified native commands bypass renderer watchdog/visibility/seek replay; explicit app/Jam/repeat controls remain connected. Native intent updates store/refs, while stale effects read the latest store. Existing error/retry UI separates reconnect from track reload. | [Component callback checks](../android/ordered-player-check.cjs) execute production callbacks/effects in isolated state; prove stale Pause/React output cannot issue corrective commands and actual output cannot clear a control-channel error. Lint/typecheck/production build pass. |
| APK integration fixture / [AndroidPlaybackTest](../../../android/app/src/androidTest/java/app/haykasa/android/AndroidPlaybackTest.java) | Uses the production adapter/deck, real WebMessage bridge and real Media3 decoder with local PCM bytes. Now asserts negotiated mode, holds actual producer replies across Pause/system Play, replays the older ACK, checks native intent ownership, and reconnects without a new web revision. Navigation delegates document-attachment lifecycle. | Generated fixture and instrumentation compile. **The new connected assertions have not yet been executed locally or by CI at this milestone.** No KVM/emulator is available on this host. |

Checks run for the client stage:

```sh
npm run android:check
NODE_PATH=<existing-playwright-install> node docs/qa/android/browser.cjs
node docs/qa/background-playback/check.cjs
node docs/qa/mobile-source-playback/check.cjs
node docs/qa/android/resolve-check.cjs
node docs/qa/android/release-check.mjs
node docs/qa/security-audit/run.cjs <scratch-report.json> --verify-fixes
npm run lint
npm run typecheck
npm run build
node docs/qa/android/create-fixture.cjs
./android/gradlew -p android --no-daemon compileDebugAndroidTestJavaWithJavac
```

The build uses locked dependencies in this isolated worktree. Unrelated host credentials are unset; no database, real user account, source activation or provider permission is assumed. The test-only resolver and PCM fixture do not prove authenticated source extraction, delivered bitrate or audible hardware output. Web and Play Store/Android/browser CI check entry points include the new regression scripts.

The existing security assertions pass across 2,612 isolated cases: zero uncaught exceptions and zero network attempts. Its field named `http500` counts all 5xx responses; all 62 recorded responses were expected `503` results for unconfigured/stubbed media or catalog services, not HTTP500 crashes.

Next: publish the complete client stage and inspect its CI/emulator results. The Android race is fixed in the scripted consumer and component regressions; final producer/consumer qualification remains pending. Source access, native queue/renewal v2, interruption/Bluetooth/physical-device qualification and Jam occurrence loss remain open in the checklist. PR42 remains draft; no native release or production activation.

## Runtime-stage CI — `90c3602`

[Android run 40226176682](https://github.com/6NCLegend9/Spotify-clone/actions/runs/40226176682) reports API33 emulator, API36 emulator and APK jobs successful. This run includes the new actual-producer/WebView assertions described above, in addition to the eight service/session cases. The main check, offline-browser, homepage-browser and sandbox-regressions jobs also pass for this runtime commit; [C013](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6402313465) records the outcomes.

Artifact retrieval for both API33 and API36 returned HTTP403 from unexpired download URLs. The uploaded XML/screenshots could not be independently inspected from this host. These are CI-reported execution results; no exact per-suite counts, screenshot inspection, physical-device audio or live-source success is inferred. Physical interruption/Bluetooth/screen-off qualification and old-binary device qualification remain open.

Vercel initially failed for a separate confirmed infrastructure reason: the project's media repository had reached its 50-image limit. Under the user's existing unused-image cleanup authorization, all 35 retained deployments were enumerated (no next page), the actual image build references of all 30 READY deployments were audited, and current production was explicitly protected. Twenty images referenced by neither retained source SHAs nor active build references were removed sequentially. A fresh registry listing confirmed exactly the 30 protected images remained before the retry. No deployment was deleted; production remains READY at `fbaae39` / `dpl_CZdXuHfMnRLQzp41Hcm5GbpVi6ee`.

Preview-only retry [dpl_6J3GyzCQMQryWCYED3JoYad1GGNZ](https://spotify-clone-6y01blrdn-6nclegend9s-projects.vercel.app) reached READY at runtime SHA `90c36020710a6b660bfb2966b3d052ce1724ac62`, branch `feat/pr42-ytdlp-migration`, with no production target. GitHub's Vercel context then reported SUCCESS; all runtime checks are green. A fresh production capability read still returns `enabled:false, reason:service_disabled`. No provider access or native release was activated.

## C018 review corrections — 2026-10-28

**Codex 1 (Coordinator)** acknowledges **Codex 2 (Player/native peer)** in [C019](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6479411431). Baseline is exact `4d5efe2`; these are corrections to the existing D06 implementation, with no wire-schema change or source activation.

The affected story is application Play/Pause → Android media adapter → ordered bridge/service → correlated results and state → Play promise and UI. The backend resolver, storage, catalog and web/Electron playback paths are unchanged. Native validation requires a rebuilt APK; deploying JavaScript cannot replace the installed service.

| Review issue | Reproduction at baseline | Correction and focused evidence |
| --- | --- | --- |
| Play confirmation lost behind another ReadState | Actual adapter with controlled replies/timers: general state read is held, an obsolete matching Play completion arrives, then the general buffering reply returns. After 40 seconds both Play calls remain pending, no error is exposed, and zero timers remain. Only the initial volume ACK is lost; subsequent volume ACKs succeed. | Keep one queued latest revision lookup behind the in-flight read, and retain the original 32-second Play deadline until settlement. Clear queued work on settlement/recovery/disposal. Three new cases cover successful confirmation without fabricated playing, missing confirmation, repeated calls, and deadline preservation. All 26 scripted consumer/deck cases pass. |
| Rebinding to the current binding ID resets native replay protection | Actual bridge/owner/policy compiled with isolated platform/host stubs: Play W1 → Pause W2 → fresh-grant B-to-B Bind → replay W1 changes processed revisions `2 → 0 → 1`, writes `2 → 3`, and intent to playing. | Reject non-identical Bind reuse with BIND_CONFLICT before consuming the grant or retiring the owner. The same isolated check now reports `2 → 2 → 2`, writes `2 → 2`, and paused output. Exact lost-reply Bind and fresh-ID rebind remain valid. New actual-service `currentBindingReuseCannotResetTheReplayWatermark` verifies these boundaries in instrumentation. |
| Windows checkout breaks component verification | Feeding CRLF bytes to the actual baseline script fails at the LF-only Redux-effect marker: Production callback missing. | Normalize source newlines at the verification boundary, then execute the same production callbacks/effect with fresh isolated state for LF and CRLF inputs. Removing normalization makes the CRLF test fail. Full `npm run android:check` also passes on a separate real-CRLF file checkout on Linux. The Android workflow now adds a Windows job that explicitly checks out/asserts CRLF and runs that exact command. |

Local checks for this correction:

- Full `npm run android:check`: retained legacy regressions, **26** ordered consumer/deck cases, and both LF/CRLF component runs pass.
- `npm run check`: ESLint, generated types/TypeScript and normal PWA production build pass on Node22.
- Real headless Chromium adapter check passes; its bridge is synthetic and is not an Android device.
- Debug/release JVM suites: **18 each**, zero failures/errors/skips; both lint variants: zero errors/fatal issues; APK/AAB build and instrumentation compilation pass.
- The new service instrumentation case is compiled locally, not executed on this host; no emulator/KVM is available here. Exact-head API33/API36 and actual Windows execution must be read from their own CI run, not inferred from the baseline.
- Workflow YAML parsing, diff/whitespace inspection, frozen-contract preservation and documentation-link checks are performed for this milestone.

Baseline evidence update: Codex 2 C018 downloaded both artifacts from [run 40315715423](https://github.com/6NCLegend9/Spotify-clone/actions/runs/40315715423), matched artifact digests, and inspected their XML: API33 and API36 each **19 tests**, zero failures/errors/skips. That resolves the earlier download/XML limitation for `4d5efe2`. It does not qualify this correction head or establish visual screenshot review, live extraction or physical audibility.

All three narrow review requirements are tracked as locally verified in the [requirements checklist](../../superpowers/plans/2026-10-24-ytdlp-migration.md); actual-platform execution is tracked separately. PR42 stays draft. Source/guest/full-v2 decisions, complete provider migration, native queue/renewal, DSP, Jam occurrence persistence, physical devices and live-source playback remain open. No release, merge, production change or provider-access change is included.

### CI runner compatibility follow-up

The correction commit is `1309a66a2b28a7f524a708e83f91919d9cee121e`. Its new Windows CRLF job passes, with the full command and both component variants visible in the inspected log; main, security and mobile-browser checks also pass. [Android run 40763330538](https://github.com/6NCLegend9/Spotify-clone/actions/runs/40763330538) passes APK and both emulator jobs. Codex 1 downloaded both emulator artifacts, matched their SHA256 digests to metadata, and inspected XML: **API33: 20 tests; API36: 20 tests; zero failures/errors/skips**, including the new actual-service binding-reuse regression. Screenshots were not visually reviewed. Downloaded APK check reports also show 18 passing JVM tests per variant. This is controlled emulator/build evidence, not physical/live-source/audio proof. Homepage run `40763330551` fails before tests at browser installation: `Playwright does not support chromium on ubuntu26.04-x64`. The floating `ubuntu-latest` image changed to an unsupported OS for the existing Playwright 1.56.1 pin. Homepage and its sibling playlist browser workflow now explicitly use Ubuntu24.04, matching the mobile job. Dependencies, assertions and test deadlines are unchanged. Native/emulator and follow-up-head CI results are reported separately in PR42 comments.

### Inspected final runtime checks — `264de97`

[C023](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6480384925) records all 11 completed checks/status entries as green for `264de976b150ee8dfe0baf38c3bb61407d5a857c`. Application/native runtime is unchanged from `1309a66`. The actual Windows log includes the CRLF guard, full Android check command, 26 consumer/deck cases and both LF/CRLF component runs. API33/API36 XML from [run 40765070207](https://github.com/6NCLegend9/Spotify-clone/actions/runs/40765070207) is independently inspected, with 20 tests per API and zero failures/errors/skips. Artifact digests match GitHub metadata:

| API | Artifact ID | SHA256 |
| --- | --- | --- |
| 33 | 12850566746 | `751d903325b32eb1d6975ab114b4a6ebf418115c3f22821e5ef9c9c0af8b43b6` |
| 36 | 12850636482 | `50269f447d34e020e0c3e35c1cff56f09127860aeb5e3b77cd96998dcc8989e6` |

These reports include the **current-ID** reuse case. They do not include the **retired-ID** sequence below. A documentation-only follow-up does not establish a newer device/audio result.

## Ponytail and Graphify review — 2026-10-29

[C024](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6502711954) resumes the review with Ponytail and Graphify's Codex skill. Graphify 0.9.95 is installed in an isolated cloud tool environment; its local Codex skill is installed/read. This does not install anything on the user's PC or in account Settings. No application dependencies are added.

Two code-only scopes at exact source `264de97` cover **36 player files** (320 nodes, 688 edges) and **9 Android core files** (251 nodes, 573 edges). Four CSS files are unclassified/excluded; this is not a layout or full-repository audit. Extraction uses no model API calls. [Portable scope/query evidence](evidence/graphify-d06-review.json) records file lists, graph digests, complete focused queries, navigation hubs and diagnostics. Graphs/reports/caches stay outside the application worktree.

The main navigation hubs are OrderedAndroidTransport/YouTubePlayer/MusicPlayer and PlaybackService/OrderedMediaBridge/OrderedTransport. Manual tracing connects the renderer's binding selection and bridge messages to native Bind validation, owner retirement and PlaybackService mutation. Each graph has one source-explained self-loop: scheduled source renewal in nativeMediaDeck, and overloaded command delegation in PlaybackService. No missing/dangling endpoints are reported in the normalized graphs; that does not prove complete extraction or recover raw producer losses. External taglib-wasm is a reference label, not a verified repository file. Graph topology guides inspection; the following actual-source execution establishes the defect.

### N02g — P2 / Medium: retired binding regains command authority

**Status: confirmed, unfixed.** Same engine, live load and trusted attachment throughout:

1. Bind B1; send Play W1, then Pause W2.
2. Obtain a fresh Hello grant and correctly rebind to B2; send Pause W1 in B2.
3. Obtain another fresh grant. Bind with `bindingId=B1` and `expectedBindingId=B2`.
4. Replay the original B1 Play W1.

Expected: reject the retired identity without changing current Pause/output/watermarks; old Play remains out of scope. Actual: native accepts B1 again and creates a new owner with reset counters. The old Play becomes authoritative. [OrderedMediaBridge](../../../android/app/src/main/java/app/haykasa/android/OrderedMediaBridge.java) rejects the current ID and preserves exact Bind retries, but retains no retired-identity check. The frozen D06 reset rule forbids reusing retired bindings.

Actual production OrderedMediaBridge, OrderedTransport and MediaPolicy compiled with isolated clock/Handler/player-host code produce:

```text
Current-ID rebind: rejected=true; processed=2 -> 2 -> 2; writes=2 -> 2; playing=false
Retired-ID reuse: rejected=false; writes=3 -> 4; processed=1; playing=true
AssertionError: Retired binding reuse must not revive old command authority
```

The normal renderer chooses fresh UUIDs. This is a native validation failure under a malformed sequence; an ordinary-client restart, remote authorization bypass and audible physical-device restart have not been demonstrated.

The [portable diagnostic patch](evidence/retired-binding-replay.patch) adds `retiredBindingCannotBeReactivatedAfterAnIntermediateScope` to the actual-service instrumentation suite. It requires BIND_CONFLICT, submits the old Play even if rejection is missing, then checks INVALID_SCOPE, current Pause/watermark and unchanged player ownership. Its proposed Java method compiles with `compileDebugAndroidTestJavaWithJavac`; the original source is restored byte-for-byte. The patch is **not enabled in the normal gate or emulator-executed**. The standalone actual-source reproduction fails at the tested runtime, as expected for this open defect. Existing green 20-test reports cannot qualify it.

### Proposed correction and integration gate

[Codex 1 C025](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6503058848) requests joint review of a native-issued binding identity tied to the one-use Hello grant, including negotiated capability and older-renderer/new-binary behavior. A v1 retained-history alternative must specify bounded capacity plus exhaustion/release/recovery semantics. Remembering just one prior ID or retaining unbounded history is insufficient. Any correction must retain exact lost-Bind retries, fresh-scope recovery, current Pause, notification Play and legacy behavior, then enable this regression and test the actual service on API33/API36.

This review changes evidence and maintained status only. The shared frozen contract and runtime remain unchanged; no peer approval is assumed. N02g stays pending in the checklist and PR42 stays draft. Source/guest/full-v2 decisions, repeated uncached deployed source playback, native queue/renewal, DSP, Jam persistence, physical qualification and native publication remain open.

## Cross-platform execution — 2026-10-29

The user requests testing unverified website, Windows and Android behavior, then restates the complete yt-dlp replacement instruction. [C027–C032](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6505789948) record the stages as **Codex 1 (Coordinator)**. [Machine-readable results](evidence/cross-platform-20261029.json) contain exact run/artifact digests, reproduction steps, impact, recommended fixes and remaining gaps. The source instruction is acknowledged in C029; application integration removal is still unfinished.

| Platform / boundary | Executed behavior | Result and limit |
| --- | --- | --- |
| Actual public Windows EXE | Install verified `desktop-latest` 1.0.0 in a fresh Windows profile; navigate Home/Search/Settings, select a song, Next and native update check. | Pages/guest state/selection pass. Both selected songs remain at 0 with provider rejection. Update state is disabled; manifest is unpublished/unsigned, stable feed 404 and installer NotSigned. Run 40936174419. |
| Current Windows native code | Actual Electron/Windows icon decode and toolbar acceptance for playing/paused/empty states; invoke production callbacks. | Four distinct 16px glyphs plus high-DPI companions, accepted native toolbars and expected commands pass. Run 40939672371. This does not put those changes in public 1.0.0 or qualify actual user hover. |
| Actual public Android APK | Byte-verified 1.0.2-debug on API36, live main production, fresh guest; select Cartoon On & On, Next, Home and return. | Focused retry completes and fails functional playback: error 150, progress 0, provider LOGIN_REQUIRED / bot confirmation. Next changes selection within one second. No AndroidRuntime crash observed in this completed run. Run 40941822310; initial full-tour run 40936180373 is cancelled/incomplete. |
| PR Android service / decoder | Opt-in diagnostic on API33 and API36, real service/MediaSession/WebView and generated media. | Each has 21 unique tests: 20 pass, only retiredBindingCannotBeReactivatedAfterAnIntermediateScope fails. Actual AAC/Opus 48kHz stereo decoding produces output buffers/time progression. Run 40936464357; synthetic clips are not live songs or physical audibility. |
| Actual production website | Chromium desktop 1440×1000 and phone portrait/landscape; real Search-tab/Enter/navigation and playback requests without API mocks. | UI/navigation/guest/overflow checks pass, Enter reaches search index. Playback fails before SDK access because the cloud proxy refuses CONNECT403 to YouTube. That environmental failure is distinct from public-app provider rejection. |
| Browser DSP / minimized window | Independently inspect digest-verified Chromium/Firefox/WebKit results at exact 03f0005, unchanged DSP/player source. | Original waveform, single Quiet gain, mono, measured preset headroom and context cleanup pass. Synthetic track advance/Pause/logout pass while minimized, but visibilityState remains visible; actual hidden mobile OS/background and Safari HLS EQ are not proved. |
| Actual Vercel worker | Two uncached songs with August SDK, then the same two using official current 2026.10.26. | All four return 503 source_access_restricted after generated storage/ranges pass. No actual song reaches delivery/decoding; startup latency and live bitrate remain unmeasured. See [source evidence](evidence/source-access-20261029.json). |

All listed artifact digests and ZIP integrity are independently checked. Selected Windows home/settings/failure screenshots, PR Android landscape/failure screenshots and the mobile-browser failure screenshot are visually inspected. This is scoped review, not every screen, physical device or accessibility condition.

The public APK's first attempt times out before final evidence is saved. QA-only `1ec8cac` bounds ADB calls, saves incomplete observations before cleanup, adds a watchdog and permits a focused retry. The completed second run therefore supplies the playback/crash observation; missing initial fields are not treated as passes. The normal full tour remains default. No native app behavior changes in this QA correction.

SDK update `2694bb7` changes yt-dlp to official 2026.10.26, retaining required EJS 0.8.0; existing Python 3.12 images meet its new >=3.11 requirement. Actual FFmpeg packet/remux/metadata and installed Blob SDK/security/storage/lease/range/upload-close checks pass in isolation. The updated deployed source still fails. This maintenance update is not a source-access fix or a completed migration. The branch-preview diagnostic flag is verified reset 0; production remains unactivated.

The [expanded index](inventory-current.json) and [Graphify provenance](evidence/graphify-migration-index.json) cover the connected removal paths beyond the initial player-only map. Remaining acceptance: source gate, N02g correction, full provider/guest/catalog contracts, actual-song seek/renewal/reconnect, native queue ownership, Android EQ, physical devices, actual Safari HLS processing and native update publication. PR42 stays draft; no merge or release.
