# Player overhaul: implemented slice

## Presentation

- `src/components/MusicPlayer/PlayerDock.tsx`: desktop track/transport/tools and mobile mini-player; presentation only.
- `ExpandedPlayer.tsx`: native modal dialog, focus return, queue search/add, playlist action and expanded transport.
- `PlayerTimeline.tsx`: bounded accessible timeline and time formatting.
- `FloatingPlayer.tsx`: in-page artwork/controls fallback when Document PiP is unavailable or rejected.
- `player.types.ts` and `playerDock.module.css`: typed props and responsive layout. New dock buttons have 48px minimum targets.
- `YouTubePlayer.jsx` retains the existing dual-deck hosts, transport, seeking, errors, Jam synchronization and video-expanded UI. Shuffle permutes upcoming tracks; repeat wraps the current queue.

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
Screenshots are written under ignored `test-results` folders.

Development-server runs have intermittently failed before the restored dock appeared; that intermittent startup issue is not proven fixed. Production browser checks cover the same flows without on-demand route compilation.
Real audio/video decoding, successful OS Document PiP windows, and physical-device background playback still require testing.

## Build inspection

`ANALYZE=true` enables Next's bundle analyzer without opening browser tabs. In PowerShell:

```powershell
$env:ANALYZE = 'true'
$env:NEXT_BUILD_DIR = '.next-check'
$env:DISABLE_PWA = '1'
npm run build
Remove-Item Env:ANALYZE, Env:NEXT_BUILD_DIR, Env:DISABLE_PWA
```

The first build after these changes reported 104kB shared first-load JS versus the earlier 103kB, and 167kB for home versus 166kB. These are Next's build estimates, not measured network transfer savings. Deferred engine requests are the verified loading improvement; overall bundle reduction has not been demonstrated.

## Remaining scope

- The legacy native-audio dock and video-expanded controls retain their previous presentation.
- App-wide light theme, navigation/drawer redesign and a full-site 48px target audit are not implemented here.
- Video PiP is disabled rather than substituted with in-page floating video. Mobile uses an explicit Expand button. Audio-only PiP still contains artwork and controls. No cross-origin capture or canvas media workaround is used.
- Production dependency audit reports a critical Next.js advisory plus high-severity advisories affecting other packages. No automatic dependency upgrades were applied; review and remediation remain necessary before release.
- TypeScript is incremental (`allowJs`, no JavaScript checking). Auth options were relocated to `src/utils/authOptions.js` because App Router route files cannot export arbitrary configuration.