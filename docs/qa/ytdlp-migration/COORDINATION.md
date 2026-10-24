# Shared Codex coordination: yt-dlp migration

The user authorized working with their other Codex on October 24, 2026. They explicitly said **do not create PR42 yet**. This file is the local handoff and proposed ownership record; it does not establish that the other session has connected or accepted a task.

## Current handoff

- Repository: 6NCLegend9/Spotify-clone.
- Working directory: /workspace/HayKasa-ytdlp-local.
- Local branch: refactor/ytdlp-only-local-20261024.
- Audit commit: c0a10ef, based on PR41 source 234fcd9.
- Current application changes on this branch: none; the audit and requirements are committed locally.
- Read [integration inventory](README.md), [all matching paths](inventory.json), [call map](call-map.json), and the [requirements checklist](../../superpowers/plans/2026-10-24-ytdlp-migration.md) before editing.
- Other Codex's branch/worktree: **awaiting identification**.
- Other Codex's ownership acknowledgement: **pending**.
- In-session agent discovery currently lists only the coordinating root agent. A shared Business workspace alone does not establish cross-chat messaging or a shared executor/filesystem. The peer should confirm that it can read this exact file and audit commit.
- The user supplied the other thread's codex:// deep link. A targeted handoff through the installed codex queue command failed with exit 1: thread/queue/add could not read the thread because no rollout was found in this runtime's thread store. No message delivery or shared-server connection is established. The thread identifier and raw command result are kept only in local scratch evidence, not published in this handoff.

## Proposed work split — peer acknowledgement required

| Owner | Area | Files / responsibilities |
| --- | --- | --- |
| Coordinating Codex | Backend catalog and acquisition | media-service/, server catalog adapter replacing src/utils/youtubeApi.js, API handlers, source-access evidence, bounded subprocess/cache/ownership/security behavior. |
| Other Codex | Player and native playback | MusicPlayer components/decks, Android service/bridge, desktop transport, media-session/queue/background behavior and native capability compatibility. |
| Coordinating Codex integrates; both review | Shared contracts and persisted data | playerSlice, playbackSnapshot, route schemas, guest ownership, source/asset metadata, build/CSP policies and tests whose assertions span both lanes. Agree the contract before changing producers/consumers separately. |

These are proposed lanes, not permission to overwrite work already in progress. If the peer already owns either area, record that before either agent edits its files. Do not check out, reset, stash or clean another worktree. Use separate branches/worktrees; exchange reviewed commits or patches. No force-pushes or destructive data migration.

## Decisions that remain open

1. **Source scope:** remove direct application YouTube APIs/embeds/SDK while obtaining existing YouTube media through yt-dlp, or also remove YouTube content and choose another catalog/source. The user's clarification is pending. yt-dlp is not an independent music catalog.
2. **Guest listening:** current direct-media resolution requires an account, while current guests use the embed. Removing it requires a bounded guest ownership/authentication design or an explicitly agreed product change.
3. **Catalog capability:** prove channel/playlist/album/caption support through yt-dlp, including legacy MPR album identifiers. Do not replace unsupported sections with invented data or silently remove them.
4. **Native contract:** service queue ownership, renewal/reconnect, command acknowledgements and older-client behavior must be defined before changing the bridge and its caller independently.

## Gates both agents must preserve

- No PR42 creation, merge, production activation, native release or provider-credential/access-method changes in the current local stage.
- Source access is the first feasibility gate. The last production capability read returned service_disabled; earlier hosted extraction returned source_access_restricted. Keep synthetic/local fixture results separate from real extraction, delivery, decoding, audible output and screen-off proof.
- PR41's icon preview also hit a Vercel media-container registry push denial. Do not describe a failed/unavailable deployment as a working source test.
- Keep source codec preservation, SSRF/TLS protections, bounded CPU/disk/output, scoped asset ownership, leases and cleanup. Do not force readiness flags true.
- Preserve existing saved songs, playlists, favorites, follows, queues, account isolation and private-session rules. Neutral naming requires compatible legacy reads.
- Retain the stack. Native Android queue reliability precedes BPM/widening. Completed files alone do not satisfy the previously agreed playback-during-extraction requirement. Safari HLS audibility does not prove its EQ path.
- Read applicable AGENTS.md / SKILL.md instructions, inspect each stage's diff, run relevant checks and reconcile the checklist before claiming completion.

## Peer acknowledgement / review exchange

The peer should create a separate peer-status.md beside this file containing:

- Its branch/worktree and base commit, confirming access to this handoff.
- The accepted file ownership, current dirty files/commits, and any overlap.
- Its review of the source scope, catalog feasibility and proposed playback contract.
- Findings with exact file/line references, reproductions and severity; distinguish confirmed defects from risks.
- For each completed stage: commit or patch, affected files, checks/results, known limits and a request for the other agent's independent review.

The coordinating Codex will review that file and reconcile accepted findings here and in the requirements checklist. A proposed change is not agreed until the peer's acknowledgement/review exists. If the sessions cannot see the same files, exchange the branch/commit/patch through the repository before editing overlapping code; do not assume shared chat memory.

## Coordinator status

- Verified audit inventory: 179 tracked matching paths; 664 local-import edges; 20 named API sites; five manually traced cross-process boundaries.
- Runtime implementation: not started; source-scope clarification and peer identity/ownership are pending.
- Partner communication: this handoff is prepared; a targeted queue attempt using the supplied deep link failed because the thread was not found locally. No message to the external session has been delivered. The peer can still acknowledge through shared files or repository commits if it has access.
