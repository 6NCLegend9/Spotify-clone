# Player overhaul: implemented slice

## Presentation

- `src/components/MusicPlayer/PlayerDock.tsx`: desktop track/transport/tools and mobile mini-player; presentation only.
- `ExpandedPlayer.tsx`: native modal dialog, focus return, queue search/add, playlist action and expanded transport.
- `PlayerTimeline.tsx`: bounded accessible timeline and time formatting.
- `FloatingPlayer.tsx`: in-page artwork/controls fallback when Document PiP is unavailable or rejected.
- `player.types.ts` and `playerDock.module.css`: typed props and responsive layout. New dock buttons have 48px minimum targets.
- `YouTubePlayer.jsx` retains the existing dual-deck hosts, transport, seeking, errors, Jam synchronization and video-expanded UI. Shuffle permutes upcoming tracks; repeat wraps the current queue.

## Queue and timers

- `QueueEditor.tsx` supplies upcoming-only move up/down, remove and clear commands,
	a ten-second Undo and a named private-playlist save. The current track and iframe
	hosts are not replaced by queue edits. Undo invalidates on another queue change,
	track change or account restoration. Clearing upcoming tracks stops automatic
	refill for the current session; it is not a persisted radio preference.
- Expanded audio and video queue views reuse the editor. Jam guests cannot edit
	the host queue; host changes use the existing snapshot broadcast. Two-device
	reconnect behavior still needs real Jam testing.
- `sleepTimer.mjs`, `useSleepTimer.js` and `SleepTimerControl.jsx` implement 15/30/60
	minutes or end-of-track, cancellation and tab-local refresh persistence. Account
	changes discard the previous timer; Jams disable it. A manual track change
	cancels end-of-track mode. Deadline checks call the active engine's Pause and
	are repeated on visibility/pageshow and explicit Play.
- Native explicit Play resumes suspended/interrupted Web Audio processing and
	the media element together. Rejected autoplay is reported, not repeatedly retried.
- The snapshot throttle now keeps its last-saved position across renders instead
	of resetting each time the display progress changes.
- Optional listening insights sample actual media progress outside React state.
	Seeks, pauses, stalled progress and long sampling gaps do not inflate observed
	seconds. They are off by default and do not turn OS-suspended time into claimed
	listening time. See `PRODUCTION.md` for opt-in, retention and test boundaries.

## Lazy boundaries

- `AppShell.jsx` mounts the dynamically imported player only with selected/restored media.
- `MusicPlayer/index.jsx` includes YouTube in the deferred player bundle to avoid a serial engine download. Native audio, fullscreen artwork, downloads, lyrics and PiP presentation remain separate.
- `PlayerDock.tsx` imports the expanded player only when a panel is requested.
- `YouTubePlayer.jsx` imports synced lyrics, document PiP and floating controls on demand.
- `src/app/loading.tsx` supplies an App Router fallback without converting server pages to client components.
- Existing Next.js chunk splitting and optimized icon imports remain in place. No custom vendor cache groups were added.
- The shared workspace retains its global GhostFibers background; it is not deferred by this implementation.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run test:e2e`.
The browser suite uses synthetic accounts and blocks YouTube. It verifies restoration/account separation, manual reload recovery, no YouTube API request on empty search, 48px dock buttons, dialog focus, queue toggles, PiP fallback/rejection, and deck host identity across resize and client navigation.
It also exercises queue move/remove/clear/Undo/private save, timer persistence and
actual mocked-engine pause commands at deadline and end-of-track. Unit tests cover
native media/context commands and timer clock changes. The complete application
verification passed 108 Node checks and 42 desktop/mobile browser tests.
Screenshots are written under ignored `test-results` folders.

Development-server runs have intermittently failed before the restored dock appeared; that intermittent startup issue is not proven fixed. Production browser checks cover the same flows without on-demand route compilation.
Real audio/video decoding, successful OS Document PiP windows, and physical-device background playback still require testing.

## Phone lock-screen playback

- Media Session exposes OS transport controls and metadata; it does not prevent
	the browser from suspending a page or a YouTube iframe.
- Screen Wake Lock keeps a visible display awake. The browser releases it when
	the page hides; it cannot keep playback alive after the user locks the phone.
- The active engine owns Media Session actions. The container publishes metadata
	and position only, so it cannot replace engine Play with a Redux-only update.
- Native audio Play/Pause requests act directly on the audio element, including
	when the element is paused but application state still reports playing.
- YouTube actions call the iframe API directly, register independently when an
	action is unsupported, and clean up on engine changes. The audio-only setting
	still uses a YouTube iframe; it is not an independent native audio stream.
- The mocked-engine browser regression checks initial Play, repeated Play while
	application state is playing, and Pause. It does not emulate OS suspension.

Physical-device acceptance still requires the phone model, OS/browser versions,
track source, and browser-tab versus installed-app mode. Start a track with a tap,
lock for at least 60 seconds, try lock-screen Pause/Play, then unlock and check
position and explicit-pause behavior. Test track completion/next-track separately.
Do not claim continuous phone-lock playback until this passes. Reliable background
audio may require a permitted direct audio source and native media playback;
changing wake locks or Media Session metadata cannot guarantee it for YouTube.

## Build inspection

`ANALYZE=true` enables Next's bundle analyzer without opening browser tabs. In PowerShell:

```powershell
$env:ANALYZE = 'true'
$env:NEXT_BUILD_DIR = '.next-check'
$env:DISABLE_PWA = '1'
npm run build
Remove-Item Env:ANALYZE, Env:NEXT_BUILD_DIR, Env:DISABLE_PWA
```

The first dock build reported 104kB shared first-load JS and 167kB for home.
The subsequent roadmap build reports 106kB shared and 172kB for home. These are
Next's estimates, not measured transfer savings. Overall bundle reduction has
not been demonstrated; the production benchmark separates navigation and assets.

## Remaining scope

- The legacy native-audio dock and video-expanded controls retain their previous presentation.
- App-wide light theme, navigation/drawer redesign and a full-site 48px target audit are not implemented here.
- Video PiP is disabled rather than substituted with in-page floating video. Mobile uses an explicit Expand button. Audio-only PiP still contains artwork and controls. No cross-origin capture or canvas media workaround is used.
- The 2026-09-10 account-security pass updated Next.js/tooling, Nodemailer and affected transitive dependencies; the resulting audit reported zero findings. See `PRODUCTION.md` for scoped overrides, rollout requirements and validation limits.
- TypeScript is incremental (`allowJs`, no JavaScript checking). Auth options were relocated to `src/utils/authOptions.js` because App Router route files cannot export arbitrary configuration.