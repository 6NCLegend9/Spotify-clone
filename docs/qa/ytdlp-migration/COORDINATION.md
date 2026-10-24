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
| Player/native peer; accepted by coordinator | Player and native playback | Web/Electron player consumers, Android service/bridge/policy/build, desktop IPC/transport/mini-player, native queue/media-session/background reliability and relevant tests. |
| Both review; coordinator integrates | Shared contracts and persisted data | playerSlice, playbackSnapshot, route schemas, Jam occurrence identity/signing, guest ownership, source/asset metadata, CSP/build policies and cross-lane tests. Agree interfaces before changing producers/consumers independently. |

Use separate branches/worktrees. Preserve remote commits and reconcile normally when the shared branch advances. No force-push, reset, stash or cleanup of another agent's work. A conflict or ownership question goes in the mailbox before overlapping edits.

## Decisions still open

1. Source scope: retain existing YouTube media through yt-dlp while removing application-owned APIs/embeds/SDK, or choose replacement sources and saved-track matching. yt-dlp is not an independent music catalog.
2. Guest access: preserve listening through a bounded ownership/authentication model. The current direct-media resolver requires an account; removing the embed without its replacement changes guest behavior.
3. Catalog/live/long-track capabilities: prove channel/playlist/album/MPR/caption/filter/pagination support or report explicit capability limits. No invented data or silent feature removal.
4. Playback contract: the coordinator accepts the peer's high-level v2 principles, not a frozen wire schema. Exact command/event ordering, preparation/seek ranges, native renewal/queue ownership and legacy behavior require joint agreement.

[DECISIONS.md](DECISIONS.md) records proposals and their status. No overlapping runtime implementation is cleared by an acknowledgement of ownership alone.

## Gates and current evidence

- Runtime migration has not started. The adapter late-event and Jam occurrence-loss defects were independently reproduced using actual modules with isolated fixtures; fixes remain assigned/pending. See [verification](peer-review-verification.md).
- Final PR41 checks and Vercel preview passed. The earlier media-container registry denial is historical. This resolves the stale-baseline/deployment-readiness report, not source feasibility.
- Fresh production capability read: enabled:false, reason:service_disabled. Earlier hosted extraction returned source_access_restricted. Repeated uncached extraction, delivery and decoding from the intended deployment remain the first source gate; synthetic fixtures are not live playback or screen-off proof.
- Preserve source codecs where compatible, SSRF/TLS protections, bounded CPU/disk/output, scoped ownership, leases and cleanup. Never force readiness flags true.
- Preserve saved songs/playlists/follows, repeated queue occurrences, account isolation and private-session rules through compatible legacy reads. Delivery credentials/receipts must not enter persisted tracks or Jam broadcasts.
- Retain the stack and first-release playback-during-extraction requirement. Native Android queue reliability precedes BPM/widening. Completed files alone and audible Safari HLS do not establish on-the-fly streaming or a working EQ path.
- Follow applicable AGENTS.md/SKILL.md instructions, review each stage's diff, verify the changed flow and reconcile the requirements checklist before any completion claim.

Next peer action: reply to C004 with the concrete additive native transport fields/capability, bootstrap/reset behavior, MediaSession interception approach and regression matrix. The coordinator accepts C003's need to fix the producer and adapter together; exact fields are not yet agreed. No adapter-only suppression or runtime protocol edit before joint confirmation.
