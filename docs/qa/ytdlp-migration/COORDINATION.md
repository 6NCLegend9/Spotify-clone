# PR42 Codex coordination: yt-dlp migration

On October 24, 2026, the user authorized creating PR42 and using a Git-tracked file for the two Codex sessions to exchange messages. This supersedes the earlier local-only/no-PR instruction. It does not authorize merging, production activation, provider-access changes or native publication.

## Shared handoff

- Repository: 6NCLegend9/Spotify-clone; PR base: main.
- Shared PR branch: feat/pr42-ytdlp-migration. The coordinator owns PR creation to avoid duplicate PRs; the peer contributes reviewed lane commits to this branch.
- Coordinator worktree: /workspace/HayKasa-pr42, isolated from existing worktrees.
- Application baseline: merged main fbaae39eae5c7e70d896955d2ca8b5c4933c608e. Both PR41 recovery commits e155f58 and 1e8d80d are ancestors. No further work is assigned to PR41.
- The audit snapshot remains based on 234fcd9; its 179 paths/664 import edges are valid recorded entries, not exhaustive ownership coverage. Read [OWNERSHIP.md](OWNERSHIP.md) for the peer's additional boundaries.
- The peer imported the verified older handoff at 7fb2a71 into a separate Windows checkout on refactor/ytdlp-player-native-20261024 and accepted the player/native lane. The acknowledgement was relayed by the user; see [peer-status.md](peer-status.md). Its machine path and chat identifiers are private.
- In [C002](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6388521667), the peer confirms a clean fresh branch feat/pr42-player-native-peer based on e685af1. The old audit checkout remains separate; do not push duplicate audit history or change the completed PR41 checkout.
- Read [inventory](README.md), [decisions](DECISIONS.md), [requirements](../../superpowers/plans/2026-10-24-ytdlp-migration.md) and the shared messages before editing.

## Communication and accepted ownership

**[PR42 Conversation comments](https://github.com/6NCLegend9/Spotify-clone/pull/42) are the primary channel**, following the user's latest instruction. Use role-labelled comments with commit, files, evidence and next action; [AGENT-MESSAGES.md](AGENT-MESSAGES.md) retains handoff and agreed decision links. Read comments and fetch before each stage/shared-contract edit. A message is not acknowledged until the peer replies. Direct queue attempts failed on both hosts; no direct session connection is claimed.

C002 acknowledges C001; [coordinator C004](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6388875193) acknowledges C002/C003. Receipt through PR comments is now verified in both directions. New proposals still require their own review; receipt alone is not wire-contract approval.

| Owner | Area | Responsibilities |
| --- | --- | --- |
| Coordinator | Backend catalog and acquisition | media-service/, server catalog adapter replacing src/utils/youtubeApi.js, API handlers, source-access evidence, bounded subprocess/cache/ownership/security behavior. |
| Coordinator temporarily while peer is unavailable; C009/user instruction | Player and native playback | Web/Electron player consumers, Android service/bridge/policy/build, desktop IPC/transport/mini-player, native queue/media-session/background reliability and relevant tests. Peer coordinates before resuming overlapping files. |
| Both review; coordinator integrates | Shared contracts and persisted data | playerSlice, playbackSnapshot, route schemas, Jam occurrence identity/signing, guest ownership, source/asset metadata, CSP/build policies and cross-lane tests. Agree interfaces before changing producers/consumers independently. |

Use separate branches/worktrees. Preserve remote commits and reconcile normally when the shared branch advances. No force-push, reset, stash or cleanup of another agent's work. A conflict or ownership question goes in the mailbox before overlapping edits.

## Decision status and remaining gates

1. Source scope is acknowledged in C029: index and replace application-owned YouTube integrations with yt-dlp while preserving saved media. The user restates this on2026-10-29; source feasibility is an execution gate, not another pending confirmation of the instruction.
2. Guest access: preserve listening through a bounded ownership/authentication model. The current direct-media resolver requires an account; removing the embed without its replacement changes guest behavior.
3. Catalog/live/long-track capabilities: prove channel/playlist/album/MPR/caption/filter/pagination support or report explicit capability limits. No invented data or silent feature removal.
4. Playback contract: the coordinator accepts the peer's high-level v2 principles, not a frozen wire schema. Exact command/event ordering, preparation/seek ranges, native renewal/queue ownership and legacy behavior require joint agreement.

[DECISIONS.md](DECISIONS.md) records proposals and their status. No overlapping runtime implementation is cleared by an acknowledgement of ownership alone.

The narrower D06 existing Android transport fix is now confirmed at 2d12b17 in [C007/C008](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6389527896) and cleared for implementation in the peer's lane. It does not freeze the complete source/guest/queue/streaming v2 contract above.

## Gates and current evidence

- Provider removal remains unimplemented. yt-dlp is updated to 2026.10.26 at 2694bb7 with EJS 0.8.0. C032 records actual Windows/Android/browser/source outcomes. Normal 1ec8cac has 11 green checks, but opt-in N02g fails on both emulators (21 each, 20 pass) and public native live playback fails. Jam, full queue/renewal/DSP and physical audio remain open.
- Final PR41 checks and Vercel preview passed. The earlier media-container registry denial is historical. This resolves the stale-baseline/deployment-readiness report, not source feasibility.
- Production capability remains enabled:false/reason:service_disabled. Four uncached fixed-song requests across August/current SDK previews fail 503 source_access_restricted after generated storage/ranges pass. No actual-source decoding/startup/bitrate is established. Branch-preview diagnostic configuration is verified reset 0; no production activation/provider authentication changes.
- Preserve source codecs where compatible, SSRF/TLS protections, bounded CPU/disk/output, scoped ownership, leases and cleanup. Never force readiness flags true.
- Preserve saved songs/playlists/follows, repeated queue occurrences, account isolation and private-session rules through compatible legacy reads. Delivery credentials/receipts must not enter persisted tracks or Jam broadcasts.
- Retain the stack and first-release playback-during-extraction requirement. Native Android queue reliability precedes BPM/widening. Completed files alone and audible Safari HLS do not establish on-the-fly streaming or a working EQ path.
- Follow applicable AGENTS.md/SKILL.md instructions, review each stage's diff, verify the changed flow and reconcile the requirements checklist before any completion claim.

Next coordinator/peer action: review C025/C030 and agree the bounded/compatible retired-identity correction; review the current provider index and C032 source failures. An authorized alternative staging worker/VM has been requested while unblocked work continues. Guest/full-v2 and physical/native qualification remain open. No activation, merge or native publication.

## Graphify review — 2026-10-29

Codex 1 uses Ponytail and the local Graphify Codex skill as requested. Code-only maps cover 36 player and 9 Android core files; outputs/caches stay outside the source tree. [Portable map/query evidence](evidence/graphify-d06-review.json) records exact source commit, scope, confidence and diagnostics. Each graph has one source-explained self-loop; post-build diagnostics cannot prove full extraction coverage. Graph topology is not a defect reproduction. C025 uses actual production Java sources with isolated platform/host code and provides a [compiled diagnostic service patch](evidence/retired-binding-replay.patch). No runtime or frozen-wire change is made by this review.

## Full index and cross-platform verification — 2026-10-29

The [current index](inventory-current.json) and [generator](evidence/index-provider-paths.cjs) supersede the initial snapshot for path coverage. [Graphify provenance](evidence/graphify-migration-index.json) covers 487 supported code files; inferred edges and coverage limits remain explicit. [Cross-platform results](evidence/cross-platform-20261029.json) link exact artifact digests and limits; [source probes](evidence/source-access-20261029.json) record the failed gate. PR comments are signed Codex 1; no peer acknowledgement of the new policy/results is assumed.
