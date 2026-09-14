# KASA audio engine - phase 1

Baseline: `ee99bd94eaa38fec15a4e565cb46b3f00529087f` (approved KASA interface).

## Release status

This branch contains tested domain state, persistence, controller contracts, and React bindings.
**It is NOT an end-to-end player release.** The new reducer and hooks are not mounted in the
application yet. Existing screens, player controllers, the Redux store, authentication, APIs,
database models, and the approved design remain unchanged. Do not promote this foundation
as a working queue/UI rollout before completing the integration gates below.

## Implemented

- Serializable TypeScript track/context/occurrence/state/controller interfaces.
- Pure immutable state transitions; Redux-compatible reducer and a port onto an existing store.
- `useAudioStore` action surface and an app-root-only `useAudioController` binding.
- Complete context retention with playback starting at the selected index.
- Separate explicit-user and remaining-context queues, with explicit-user priority.
- Play Next, append, occurrence-specific remove/select/reorder, and user-only clearing.
- Promotion of a context occurrence into the explicit user queue without editing its saved playlist.
- Independent IDs for duplicate tracks, including consecutive copies of the current track.
- A 50-entry actual playback history. Previous puts the interrupted occurrence back into its tier.
- Repeat off/context/track; manual Next bypasses repeat-track. Shuffle affects only context items.
- Deterministic shuffle seeds stored in actions for replay and tests.
- Playback epochs and occurrence tokens to reject stale end/progress/error callbacks.
- Abortable media loading and protection against duplicate controller bindings and late play promises.
- Separate seek-command revisions and progress samples, avoiding a seek/timeupdate feedback loop.
- Independent volume/mute values and recoverable blocked/error playback states.
- Owner-scoped version 2 snapshots with complete context, queues, history, position and modes.
- Legacy v1 snapshot migration, labeled as unknown source rather than invented playlist provenance.
- Snapshot validation, byte limits, age limits, quota failure handling, private/Jam suppression,
  and paused restoration rather than forced autoplay.

## Explicit semantics

Starting a different context keeps the explicit user queue by default. An explicit
`preserveUserQueue: false` requests a fresh queue. Clear Queue clears only user-added upcoming
entries, not the current track, context queue, or saved playlist.

Selecting an upcoming user item plays that occurrence and retains other explicit choices.
Selecting a context item skips the preceding context items. Dragging a context item into the
user tier promotes it. User entries cannot silently be demoted into the context tier.
Reordering/removing context entries changes this listening cycle, not the saved playlist.
Repeat-context starts a new cycle from the full original container. Unshuffle restores original
source order among remaining context entries.

The runtime supports up to 5,000 entries in a context and 1,000 newly enqueued user entries.
Oversized commands are rejected, not silently truncated. A snapshot larger than 2,000,000 bytes
is not saved. The integration must surface a persistence failure rather than promise refresh
restoration for a queue that could not be stored. Previous traversal may temporarily restore
up to 50 additional upcoming occurrences; snapshot validation allows those entries.

Track state stores identifiers and display metadata, not expiring audio URLs or credentials.
Native media must be re-resolved through the existing source adapter when needed.

## Validation performed

- 93 Node tests passed, with zero failures and zero skipped tests.
- Includes 5,000 randomized transitions on deeply frozen state with occurrence/history/queue invariants.
- Strict TypeScript validation of every `src/audio/*.ts` module passed.
- Syntax/transpilation checks for the two React hooks passed.
- Controller tests use a fake provider adapter. They are not browser, YouTube, audibility,
  iOS, or Android verification.
- Full application build, full repository regression suite, React integration and real-browser
  playback verification remain pending. The local environment cannot install project packages.

Run the focused suite after the project's normal dependency installation:

```sh
node --test test/audioSession.test.mjs test/audioSnapshot.test.mjs test/audioController.test.mjs
npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --target es2022 --module commonjs src/audio/*.ts
```

The test helper uses the existing TypeScript devDependency and temporary CommonJS output.
No dependency or lockfile changes are needed.

## Integration gates - next phase

1. Migrate `src/redux/features/playerSlice.js` atomically. The new model must become the one
   authoritative state, with legacy fields as read-only projections while callers migrate.
   Do not register a second independent player slice alongside the existing one.
2. Bind the port to the existing continuously mounted YouTube decks/native engine. An adapter's
   `load` must honor its AbortSignal and tag events with the ORIGINAL load token, not whichever
   token happens to be current when an old callback arrives. All volume values use 0..1 at
   the port; provider-specific unit conversion belongs in the adapter.
3. Preserve retry/skip recovery, Jam host/guest permissions, media-session callbacks, keyboard
   handling, sleep timers, wake locks and account isolation when replacing transport callbacks.
   Audio/video presentation changes must not create another controller or reparent an iframe.
4. Replace paired queue/track dispatches with atomic context selection. Map actual source
   metadata from PlaylistDetail, SongsList, ArtistProfile, Home and search results. Do not
   synthesize missing album/artist identifiers or claim a partially fetched list is complete.
5. Migrate the existing PlaybackPersistence component. Hydrate after mount, subscribe to the
   authoritative state, save on a bounded cadence, and flush on pagehide. Check ownership,
   private-session and Jam policy again at flush time. Persisted state must not reset the
   current track midway through an account transition.
6. Bind the existing player, source label, QueueEditor, row menus and media views. Add mouse,
   touch and keyboard reordering, swipe removal, and context actions. Preserve the design.
7. Run full build, lint, typecheck, existing tests, and browser tests for route changes,
   duplicate songs, reload, account switching, rapid skipping/seeking, and view changes.

## Later work - not implemented by this phase

Crossfade/DSP, loudness normalization, playback-speed provider controls, enhanced EQ,
recommendation fetching, karaoke timing data, friend activity, new popularity metrics,
playlist canvas, search-history UI and shortcut remapping remain separate integrations.
The conflicting shortcut assignments in the request must not be implemented literally.
