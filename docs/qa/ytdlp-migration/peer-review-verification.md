# Coordinator verification of peer review — 2026-10-24

Application baseline: main fbaae39eae5c7e70d896955d2ca8b5c4933c608e. No runtime fixes are applied in this record.

## Confirmed with actual modules and isolated fixtures

**P2 — Android adapter accepts late same-source playing after Pause.**

Using the actual createAndroidAudioElement module with a synthetic EventTarget audio element and bridge: set a source, load it, call Play, then Pause before native feedback. Play rejects AbortError and paused is true. Deliver the old load ID's playing event; paused becomes false. The pending Play promise remains rejected. This confirms the state ambiguity described by the peer, not audible output or a physical-device restart. Ownership: player/native peer; fix pending agreed event/command semantics.

**P2 — Jam persistence loses distinct occurrences.**

Pass two tracks with content ID abcdefghijk and queueEntryId occurrence-1 / occurrence-2 through the actual sanitizeSavedQueue. Output length is one and queueEntryId is absent. The actual normalizePlaybackSnapshot retains both occurrences for the same input. This confirms the persistence mismatch, not an auth/signature bypass. Ownership: joint persistence/contract review; fix pending.

The isolated Node 22.23.4 reproduction ran with no external requests and no unrelated database/Discord bindings. The portable [reproduction script](evidence/reproduce-peer-findings.mjs) uses the actual modules and can be run from the repository root with `node docs/qa/ytdlp-migration/evidence/reproduce-peer-findings.mjs`. The expected bad states were reproduced; its assertions intentionally describe the defects, not a passing regression test for a fix. Retire/update this baseline reproduction when the peer adds the actual fix regression tests.

Observed result: Play rejected with AbortError; pausedAfterPause:true; pausedAfterDelayedPlaying:false. Jam inputOccurrences:2; savedOccurrences:1; savedOccurrenceIdentityPresent:false; snapshotOccurrences:2.

## Confirmed by source/ancestry inspection

- Missing Electron IPC/mini-player, native policy/build/updater/navigation and media receipt/Jam event boundaries exist and require the ownership supplement. The original matching-file/import records remain valid but were incomplete coverage.
- Generalized source IDs are rejected by the current playback snapshot. This is a conditional migration risk; the existing source-specific format is not independently a defect.
- Direct media still rejects guests at the existing authenticated resolver. Guest listening requires a real ownership/access model before removing its embed path.
- Both PR41 recovery commits e155f582f2aa321d55fb753c576ae759be20863e and 1e8d80dd50b72bdb13356cb6b6440078a0b30e1d are ancestors of PR42's baseline; the reported stale-baseline gap is resolved here. No PR41 worktree was changed.
- GitHub reported all completed final-PR41 checks successful, including both Android emulators, Windows packaging and Vercel preview. Earlier container-registry denial is historical; current infrastructure is not assumed broken from that old failure.
- A fresh production /api/media/resolve read still returned enabled:false, reason:service_disabled. No new extraction, source decode, bitrate, physical-device output or background-playback proof was obtained.

Direct chat messaging remains unavailable. The peer acknowledgement was relayed by the user; subsequent shared messages are exchanged through Git, with acknowledgement required before claiming receipt or agreement.
