# PR #18 Roadmap Design: Capability Truthfulness, Audio Visualizer, and Playback Diagnostics

**Date:** 2026-09-24  
**Repository:** `6NCLegend9/Spotify-clone`  
**PR:** #18  
**Required branch:** `fix/audio-fidelity-pipeline`  
**Status:** Design approved in conversation; implementation plan not yet approved.

## 1. Constraint

All roadmap work described here must stay on the existing PR #18 branch.

Do not:
- push these changes directly to `main`;
- move this work to PR #17;
- create a replacement PR for this roadmap.

PR #18 remains the integration branch for this work.

## 2. Product intent

HayKasa must never imply that it can measure, control, or provide a media capability when the underlying playback path does not actually expose that capability.

The roadmap therefore starts by making capability claims truthful, then adds features only where their underlying signal or control is real.

The priority order is:

1. Capability truthfulness cleanup
2. Audio Visualizer + Playback Diagnostics
3. True crossfade
4. Fuzzy / typo-tolerant search
5. Large playlist virtualization
6. Friend Activity
7. Persistent collaborative playlists
8. TypeScript domain migration-by-touch

The later phases are architectural subsystems and will receive their own phase design/spec before implementation. This document fully specifies phases 1 and 2 and defines the invariants that later phases must preserve.

## 3. Verified current-state findings

### 3.1 Audio-only mode is not an audio-only YouTube stream

Current settings expose `audioOnly`. The player derives:

```js
const audioOnly = audioOnlyToggle || videoQuality === "audio-only";
const compactPlayback = audioOnly || dataSaver;
```

On the YouTube path, the IFrame media source is still the same YouTube playback. HayKasa changes presentation, not the provider stream.

**Truth requirement:** UI copy must say that the mode hides/reduces video surfaces. It must not claim that YouTube is delivering an audio-only stream.

### 3.2 Data Saver does not control YouTube bitrate

`dataSaver` is a real UI/runtime switch, but HayKasa does not own YouTube's adaptive bitrate selection.

**Truth requirement:** Data Saver may claim reduced HayKasa-side visual/preload work only where the code actually does so. It may not promise a lower provider bitrate.

### 3.3 Beat Arcade can show estimated BPM as if it were measured BPM

Uploaded local files can be decoded and analyzed from PCM. The ordinary track path builds a rhythm chart from track metadata and can fall back to deterministic BPM estimation.

The UI currently renders:

```
<game> · <track> · <bpm> BPM
```

without exposing provenance.

**Truth requirement:**
- analyzed audio: `124 BPM · Audio-analyzed chart`
- estimated/generated path: `Estimated 124 BPM · Generated chart`

The UI must not make estimated BPM look measured.

### 3.4 Smart Shuffle is deterministic behavior with misleading semantics

`PlaylistDetail.jsx` currently:
- randomly reorders playlist tracks with `Math.random()`;
- loads candidates from generic `trending`, `charts`, and `newReleases`;
- inserts a recommendation after every third user track.

That is valid queue logic, but the name implies playlist-aware musical similarity that does not currently exist.

**Truth requirement:** until playlist-aware seeding/ranking exists, surface it as `Shuffle + Recommendations`. A later Smart Shuffle upgrade may reclaim the name only after candidates are derived from playlist/track/artist/genre seeds and are ranked/deduplicated against the playlist.

### 3.5 True crossfade code exists but the capability is disabled

The YouTube player contains dual-deck and transition machinery, but the active settings are hard-coded to:

```js
const transitionMode = "off";
const crossfadeSeconds = 0;
```

Settings hydration also forces those values off.

**Truth requirement:** no UI, docs, or TODO status may say true crossfade is active until overlapping playback is enabled and verified on the supported engines.

### 3.6 Legacy quality/spatial fields outlive their real consumers

PR #18 still persists and accepts:
- `streamingQuality`
- `videoQuality`
- `spatialAudio`

in Redux, the settings API, and the `UserData` model.

The visible unsupported controls were already removed, but these fields still look like active domain capabilities to future maintainers.

**Truth requirement:** deprecate and migrate these fields out of active runtime state/API contracts. Existing stored documents must remain safe to load.

### 3.7 Desktop PiP naming is stronger than the implementation

YouTube playback uses `documentPictureInPicture.requestWindow()` to render a HayKasa-controlled floating document/player surface. This is not proof that the actual YouTube video element is in native video PiP.

**Truth requirement:** use `Floating player (desktop)` or explicit `Document picture-in-picture controls` language, not generic wording that implies native video PiP for YouTube.

## 4. Phase 1 — Capability truthfulness cleanup

### 4.1 UI copy

Change capability names/descriptions to state exactly what the code controls.

Recommended copy:

- `Audio-focused mode`
  - “Hides video-heavy HayKasa surfaces where possible. YouTube still chooses and delivers its own media stream.”

- `Data Saver`
  - “Reduces HayKasa-side preloading and visual work where supported. Provider media quality remains adaptive.”

- `Floating player (desktop)`
  - “Opens HayKasa controls in a separate floating window where the browser supports Document Picture-in-Picture.”

- Beat Arcade provenance
  - analyzed: `<BPM> BPM · Audio-analyzed chart`
  - non-analyzed: `Estimated <BPM> BPM · Generated chart`

- Smart Shuffle temporary label
  - `Shuffle + Recommendations`
  - description: “Shuffles this playlist and periodically mixes in HayKasa discovery picks.”

### 4.2 Legacy settings migration

Remove `streamingQuality`, unsupported `videoQuality` values, and `spatialAudio` from active UI/domain contracts.

Compatibility rules:
- old persisted payloads may contain these keys;
- hydration must ignore unsupported legacy keys rather than fail;
- `videoQuality === "audio-only"` must migrate to `audioOnly: true` once, then the legacy key must stop influencing playback;
- API writes for removed settings must return a clear validation error after the migration window;
- existing MongoDB documents may retain unknown historical fields without affecting runtime behavior.

### 4.3 Documentation cleanup

Update TODO/readme/production documentation so “crossfade functional,” “high-quality streaming,” “audio-only,” PiP, and offline/PWA wording do not overstate the implementation.

Documentation must distinguish:
- selected/preferred native source profile;
- measured media facts;
- provider-managed values;
- unavailable values.

## 5. Phase 2 — Native Audio Visualizer + Playback Diagnostics

### 5.1 Core invariant: one MediaElementAudioSourceNode per media element

Current `useAudioEq` already calls `createMediaElementSource(audio)`.

Current `useAudioAnalyzer` also calls `createMediaElementSource(mediaElement)` and even notes that this throws when the element already owns a source node.

Therefore the main-player visualizer must **not** attach `useAudioAnalyzer` directly to the same `<audio>`.

There must be one owner of the native Web Audio graph.

### 5.2 Recommended graph

Keep a single graph owned by the native playback hook:

```text
HTMLAudioElement
      |
MediaElementSource
      |
EQ filters
      |
Preamp headroom
      |
Peak limiter
      |
AnalyserNode
      |
Output routing (stereo / mono)
      |
AudioContext.destination
```

Important:
- no second `AudioContext` for the same player media element;
- no second `MediaElementAudioSourceNode`;
- the analyser is an inline pass-through node, not a parallel fake animation source;
- existing EQ headroom and limiter behavior from PR #18 must remain intact;
- master-volume ownership must remain singular. Do not add a second independent master-volume authority merely for diagnostics.

### 5.3 Hook boundary

Refactor the native graph so one unit owns:
- context lifecycle;
- media source;
- EQ filters;
- preamp;
- limiter;
- analyser;
- mono/stereo routing;
- resume/teardown;
- diagnostics snapshot.

A preferred migration is to evolve `useAudioEq` into a graph owner API rather than letting another hook recreate the graph.

Conceptual API:

```ts
type NativeAudioGraph = {
  resume(): Promise<void>;
  readSpectrum(target?: Uint8Array): SpectrumFrame | null;
  getDiagnostics(): NativePlaybackDiagnostics;
  analyzerAvailable: boolean;
};
```

The exact filename may stay `useAudioEq` initially to keep blast radius small. The important part is ownership, not naming.

### 5.4 Reuse with Beat Arcade

Do not force the Arcade-specific analyzer to own the global player graph.

Instead:
- keep uploaded-file analysis independent because Arcade owns a different local media element;
- extract reusable pure FFT/band-reading helpers if useful;
- pass explicit provenance into rhythm charts: `audio-analysis` vs `estimated` vs `procedural`;
- never silently fall back from failed real analysis to a UI that still claims real analysis.

### 5.5 Visualizer rendering

Visualizer location:
- Expanded Player only for the first release;
- no 60 FPS React state loop;
- render with `<canvas>` and `requestAnimationFrame`;
- desktop target: up to display refresh rate, capped by actual need;
- mobile target: 30 FPS;
- stop animation while hidden, paused for long periods, or component is unmounted;
- respect `prefers-reduced-motion` by disabling aggressive motion and offering a static/minimal representation.

Visualizer availability:
- native audio with real analyser: show real spectrum;
- YouTube IFrame: do **not** show audio-reactive FFT bars;
- unsupported browser/audio graph: show a clearly non-reactive artwork treatment or no visualizer.

A decorative fallback must never be labeled audio-reactive.

### 5.6 Diagnostics: native audio

The diagnostics surface may expose facts the application can actually observe:

- Playback engine: `Native Audio`
- selected source profile: e.g. `Preferred 320 kbps source` when that repository-defined source was selected
- media readyState/networkState
- currentTime/duration
- buffered-ahead seconds
- master volume setting
- EQ preset and six bands
- EQ headroom in dB
- limiter reduction from `DynamicsCompressorNode.reduction`
- analyser status and FFT size
- mono/stereo routing state
- playback state: playing/paused/buffering/error
- current media error code, sanitized
- current crossfade capability state

Do not show source URLs, auth tokens, signed URLs, cookies, or account identifiers.

### 5.7 Diagnostics: YouTube

YouTube diagnostics must be intentionally more limited:

- Playback engine: `YouTube IFrame`
- Provider media quality: `Provider managed`
- Audio bitrate: `Unavailable via YouTube IFrame API`
- Audio analyser: `Unavailable — cross-origin provider playback`
- EQ: `Unavailable for YouTube media` unless a future provider path genuinely routes samples through Web Audio
- master volume setting
- IFrame player state: playing/paused/buffering/ended
- currentTime/duration where the IFrame API exposes them
- last playback failure/recovery code, sanitized
- crossfade state

Do **not** display a “delivered 720p/1080p” claim based on deprecated/unsupported `getPlaybackQuality` behavior. PR #18 intentionally removed that false certainty.

### 5.8 Diagnostics UI

Two levels:

1. Expanded Player
   - compact visualizer/engine badge
   - minimal state only

2. Support Diagnostics
   - detailed structured panel
   - copy/export remains sanitized
   - no secrets or media URLs

Example native panel:

```text
Playback Engine      Native Audio
Source Profile       Preferred 320 kbps
Playback             Playing
Buffered Ahead       18.4 s
Master Volume        100%
EQ                    Bass Boost
EQ Headroom          -5.2 dB
Limiter Reduction    -0.4 dB
Analyzer             Active · FFT 2048
Crossfade            Disabled
```

Example YouTube panel:

```text
Playback Engine      YouTube IFrame
Media Quality        Provider managed
Audio Bitrate        Unavailable
Audio Analyzer       Unavailable (provider iframe)
EQ                    Unavailable for YouTube
Master Volume        100%
Playback             Playing
Crossfade            Disabled
```

## 6. Error handling and lifecycle

- If Web Audio is unsupported, playback must continue without EQ/analyser enhancements.
- If graph construction fails, record a sanitized diagnostic and continue with the safest available playback behavior.
- Analyser teardown must not interrupt playback owned elsewhere.
- Unmount must cancel `requestAnimationFrame`.
- AudioContext shutdown must happen once per graph owner.
- Visibility changes must pause visualizer work without pausing music.
- Reduced-motion behavior must not alter audio.
- Diagnostics collection must not become a playback dependency.

## 7. Phase 2 tests

Required regression coverage:

### Graph
- one `createMediaElementSource` for the main native player element;
- graph order preserves EQ -> preamp -> limiter -> analyser -> output;
- mono/stereo rewiring does not remove/bypass the analyser unexpectedly;
- analyser setup does not create a second context/source for the same player.

### Truthfulness
- YouTube never claims FFT/analyser availability;
- YouTube never claims a known audio bitrate;
- YouTube never claims a delivered video resolution from unsupported APIs;
- Beat Arcade marks estimated/generated charts;
- analyzed local audio marks audio-analyzed charts;
- legacy quality/spatial settings no longer appear as active capabilities.

### Runtime
- visualizer teardown cancels animation frames;
- reduced-motion path is honored;
- mobile visualizer rate is capped;
- visualizer does not interrupt play/pause/seek;
- playback survives analyser unavailability;
- diagnostics redact URLs/tokens/account identifiers.

### Browser
- Chromium desktop
- Firefox desktop
- WebKit desktop
- Mobile Chrome
- Mobile Safari

The current PR validation matrix should remain the minimum bar.

## 8. Later phase boundaries

These phases remain in PR #18, but each needs its own approved design/spec before implementation.

### Phase 3 — True crossfade

Goal: actual overlapping outgoing/incoming audio, not a fade-out-only transition.

Requirements:
- provider-specific capability matrix;
- explicit state machine;
- preload readiness gate;
- abort/recovery path;
- no overlap when the next source is not ready;
- preserve queue/Jam/skip semantics;
- native dual-deck graph must not create conflicting media-source ownership;
- YouTube dual-IFrame overlap must only be enabled if browser/provider behavior is verified.

### Phase 4 — Fuzzy / typo-tolerant search

Goal: queries like misspelled artist/title names still surface the intended music without destroying exact-match relevance.

Requirements:
- normalized exact-match tier first;
- typo-tolerant candidate generation/ranking second;
- artist/title token weighting;
- no silent query replacement when intent is ambiguous;
- telemetry/diagnostics may record algorithm tier, never private query history beyond existing policy;
- avoid adding a large dependency unless a measured need justifies it.

### Phase 5 — Large playlist virtualization

Goal: playlist UI cost should scale with visible rows rather than total playlist size.

Current model already permits up to 500 playlist songs.

Requirements:
- virtualize track rows while preserving keyboard navigation, row menus, selection, queue actions, search filtering, sticky headers, and scroll restoration;
- no broken screen-reader semantics;
- test 500-song and synthetic larger datasets;
- do not virtualize small lists if it worsens UX.

### Phase 6 — Friend Activity

There is no verified friend-presence subsystem today.

Requirements:
- explicit user privacy controls;
- private-session suppression;
- presence TTL/expiry;
- no location exposure;
- do not present stale activity as live;
- use an existing realtime substrate only after validating operational fit;
- the UI must distinguish live, recent, and offline/unknown.

### Phase 7 — Persistent collaborative playlists

Current code already has:
- collaborators persisted in MongoDB;
- owner/collaborator authorization;
- collaborator track editing;
- optimistic concurrency at the playlist document level.

V2 should add:
- durable invitations rather than “email exists now” ambiguity;
- roles/permissions if needed;
- mutation revision/version handling;
- conflict-safe updates;
- collaborator removal;
- activity/audit events where appropriate;
- realtime refresh only if it is reliable and privacy-safe.

### Phase 8 — TypeScript domain migration-by-touch

No big-bang rewrite.

Create stable domain types first:
- `Track`
- `PlaybackSource`
- `PlaybackEngine`
- `PlaybackDiagnostics`
- `Playlist`
- `PlaylistCollaborator`
- `SearchResult`
- `QueueEntry`

Rules:
- files materially changed by a roadmap phase should migrate when doing so clarifies boundaries;
- JS API routes/models may remain JS until touched by a phase that benefits from conversion;
- runtime validation remains required at network/database boundaries; TypeScript alone is not validation;
- avoid broad mechanical conversion unrelated to the active phase.

## 9. Smart Shuffle upgrade gate

The `Smart Shuffle` name may return only when the implementation can prove playlist-aware discovery.

Minimum algorithm contract:
- seed from current playlist tracks/artists/genres;
- exclude current playlist IDs;
- cap repeated artist density;
- keep genre/style affinity;
- preserve some exploration diversity;
- deduplicate candidates;
- expose a deterministic testable ranking layer separate from fetching.

Until then, call the existing behavior `Shuffle + Recommendations`.

## 10. Definition of done for the first implementation cycle

The first implementation cycle is complete only when:

1. misleading capability copy/state identified in sections 3–4 is corrected or deprecated;
2. the native player has exactly one Web Audio graph owner;
3. the analyser is part of that graph;
4. Expanded Player renders a real native spectrum without React 60 FPS state churn;
5. YouTube never renders fake audio-reactive bars;
6. diagnostics report only observed/owned capabilities;
7. Beat Arcade exposes BPM/chart provenance;
8. the full existing PR #18 validation matrix passes;
9. a code review verifies no new misleading capability claims were introduced.

## 11. Explicit non-goals for the first cycle

Do not combine the first cycle with:
- Friend Activity;
- collaborative-playlist V2;
- large-list virtualization;
- fuzzy search;
- full TypeScript migration;
- enabling crossfade.

Those remain later PR #18 commits after their phase specs are approved.
