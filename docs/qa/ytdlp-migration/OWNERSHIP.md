# PR42 ownership supplement

The 179-path inventory and 664-edge call map are a validated lexical snapshot at 234fcd9. They were not complete ownership coverage. This supplement records the peer's confirmed missing boundaries against the reconciled main baseline fbaae39. Inclusion means review ownership, not a claim that every listed file needs editing.

| Owner | Explicit paths / boundary |
| --- | --- |
| Player/native peer | desktop/src/main.mjs, desktop/src/preload.cjs, desktop/src/miniPreload.cjs, desktop/src/miniPlayer.html, desktop/src/playback.mjs, desktop/src/artworkPalette.mjs, desktop/scripts/check-mini-player.mjs: renderer → preload → main IPC, OS transport commands, mini-player state/replies. |
| Player/native peer | android/app/src/main/java/app/haykasa/android/MainActivity.java, PlaybackService.java, MediaPolicy.java and PlayAppUpdater.java: renderer commands, native replies, MediaSession/OS command entry, trusted asset policy, background service and update/capability handling. |
| Player/native peer | android/app/build.gradle, android/app/src/main/AndroidManifest.xml, android/app/src/test/java/app/haykasa/android/MediaPolicyTest.java: Media3 modules, native permissions/policy and packaged-client verification. |
| Player/native peer | src/components/MusicPlayer/media/androidAudioElement.mjs, nativeMediaDeck.mjs, mediaPlayerStates.mjs, src/utils/androidNavigation.mjs and src/components/Layout/AppShell.jsx: adapter/deck feedback, late-event protection and native Back → renderer navigation/overlay behavior. |
| Coordinator with joint schema review | src/app/api/media/resolve/route.js, src/utils/mediaService.mjs, src/utils/mediaReceipts.mjs: API → private service and scoped receipt/lease ownership, renewal, cancellation and authentication. |
| Joint contract/security/persistence | src/app/api/jam/events/route.js, src/utils/jamSignedChannel.mjs, src/utils/jamRooms.mjs, src/utils/jamAuthorization.mjs, src/utils/jamSigning.js, src/utils/sessionAuth.js, src/utils/trustedOrigin.js, src/utils/rateLimit.js and src/models/JamRoom.js: signed event consumption, authorization, queue snapshots/occurrences and persisted/broadcast data boundaries. |
| Joint contracts/build policy | contracts/desktop.json, src/generated/desktopContract.mjs, desktop/src/generated/desktopContract.mjs, scripts/generate-desktop-contract.mjs, next.config.js, src/sw.js and shared source/queue persistence: negotiate capabilities, update producers/consumers together and keep generated/native policies aligned. |

Named missing event paths are now explicit: main/native replies → preload/bridge → player consumer; OS/MediaSession → native transport; native Back → androidNavigation → AppShell; Jam signed channel → /api/jam/events → authorization/signature validation → saved queue sanitization. A mapping omission is not evidence of an authorization bypass.

The peer owns the isolated adapter defect investigation/fix. Jam occurrence identity and guest/receipt/queue schemas remain jointly reviewed. Direct application YouTube dependency removal, compatibility aliases and source-provider mappings must be distinguished; do not delete data or weaken policies solely to make a text search return zero matches.

## D06 implementation supplement — 2026-10-25

Under the user's takeover instruction in C009, the coordinator temporarily implements the player/native lane while the peer is unavailable. The original lexical inventory remains a historical snapshot; these new boundaries are explicitly included:

- `OrderedTransport.java` owns native decisions, results and scoped timers; `OrderedMediaBridge.java` owns capability/control parsing and attachment authority; `SessionTransportPlayer.java` intercepts explicit MediaSession controls. `PlaybackService.java` and `MainActivity.java` connect them. `OrderedTransportTest.java` and `OrderedBridgeTest.java` exercise actual production classes/service/session.
- `orderedAndroidTransport.mjs` consumes the confirmed protocol; `androidAudioElement.mjs` projects intent/output separately; `nativeMediaDeck.mjs` and `YouTubePlayer.jsx` handle explicit controls, current store state and visible control-channel recovery.
- `docs/qa/android/ordered-check.mjs` and `ordered-player-check.cjs` supplement the retained legacy checks. `create-fixture.cjs` packages production modules for `AndroidPlaybackTest.java` and delegates the actual document lifecycle. Android, Play Store and browser CI run the new checks; the browser module loader includes the new dependency.

See [D06 implementation/evidence](D06-IMPLEMENTATION.md). This adds no source/catalog/guest/queue-persistence ownership grant and does not settle the full-v2 contracts. The peer reviews the published native/client commits before overlapping edits on return.
