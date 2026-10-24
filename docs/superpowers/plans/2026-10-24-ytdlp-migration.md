# Local yt-dlp migration: requirements and integration inventory

Baseline: 234fcd985556480ca44fc77d2b397c6cfdf8522f, including PR41's icon/search work.
Local branch: refactor/ytdlp-only-local-20261024. The user explicitly said not to create PR42 yet. No PR, push, deployment, production activation or native release is authorized by this local migration stage.

## Scope decision

The user requested finding every YouTube-related path and changing the application to yt-dlp. One source decision is still pending: remove the application's embedded player / Data API / youtubei.js integrations while obtaining YouTube media through yt-dlp, or remove YouTube as a media source too. yt-dlp is an acquisition tool, not an independent music catalog. Existing media identifiers must remain readable in either case. The inventory and contract trace do not depend on that decision; provider-dependent implementation does.

## Requirements checklist

Statuses: pending, implemented, verified, blocked or explicitly deferred. Verification always names its scope; fixtures and compilation do not count as live playback or physical-device proof.

| ID | Requirement / affected platforms | Status | Evidence / next step |
| --- | --- | --- | --- |
| W01 | Read instructions and relevant skills; inspect environment | Verified | No applicable AGENTS.md found. Ponytail restored/read; cloud runtime/networking, full-flow verification and Vercel Services read. Unrelated Discord/database bindings must not be used for HayKasa tests. |
| W02 | Isolate work and preserve PR41 | Verified | New local worktree at /workspace/HayKasa-ytdlp-local based on 234fcd9. Original worktrees unchanged. No PR42 created. |
| W03 | Inventory all tracked integration paths, dependencies, native code, configuration and checks | Verified | docs/qa/ytdlp-migration/inventory.json: 179 matching tracked text paths; 107 web runtime, 4 native runtime, 8 build/security configuration, 2 source-adapter paths, 23 verification-code paths, 35 historical/fixture paths. call-map.json adds 664 import edges, 20 named API call sites and 167 connected paths without direct matches. All recorded paths/line numbers validated against the baseline worktree; cross-process boundaries traced separately. Excludes credentials and binary artifacts. |
| W04 | Determine whether YouTube remains an upstream source | Pending | Clarification requested. yt-dlp can obtain media from YouTube without using its embedded player; this still uses YouTube content. |
| W05 | Coordinate implementation and independent review with the user's other Codex | Implemented | docs/qa/ytdlp-migration/COORDINATION.md records the local handoff, proposed backend/player-native ownership and review protocol. Other-session branch/worktree, shared-file access and ownership acknowledgement are still pending; no cross-chat connection is claimed. |
| S01 | Repeated uncached extraction and actual decoding from intended deployed environment | Blocked | Earlier hosted attempts returned source_access_restricted. Latest production capability check returned enabled:false, reason:service_disabled. Keep activation disabled; no inference of playback success from repository support. |
| S02 | Resolve deployment readiness before hosted verification | Blocked | PR41 icon preview failed pushing its media container image to Vercel's registry. Requires a working diagnostic deployment before new hosted extraction evidence. No production/provider access changes in this local stage. |
| C01 | Search, filters, pagination, artist/channel metadata, playlists and albums through yt-dlp | Pending | Replace Data API and youtubei.js calls together with server routes and consumers. Confirm yt-dlp support for each operation; do not invent catalog data or silently drop features. |
| C02 | Captions, artist discovery, comments-derived recommendations and followed releases | Pending | These call the shared YouTube helper and need explicit replacements or visible capability failures. Preserve private-session and account boundaries. |
| C03 | Bounded shared metadata caching, request coalescing, concurrency and validation | Pending | Reuse existing provider cache/rate-limit boundaries where applicable. Validate arguments and normalized results on both service boundaries. |
| C04 | Preserve guest listening when removing embedded playback | Pending | Current yt-dlp media resolver requires authentication; guests currently use the embed. Define bounded guest ownership/rate limits alongside removal, rather than silently requiring accounts. |
| P01 | One HayKasa-owned playback path; remove IFrame SDK and embed fallback | Pending | Trace the mixed player before editing; retain play intent, queue identity, repeat/shuffle, seek, recovery and transport controls. Source errors must remain visible without retry loops. |
| P02 | Preserve best compatible source audio without unnecessary conversion | Pending | Keep existing packet-preserving AAC/Opus behavior. No promise of improved source quality or guaranteed 320 kbps. |
| P03 | Persistent elements/nodes, autoplay/CORS, expiry/renewal/reconnect and prepared seek ranges | Pending | Existing native deck/resolver/Android bridge must change with the player contract. Preserve user Pause during preparation and stale-event protection. |
| P04 | First-release playback during extraction | Blocked | Retained from the agreed audio-engine requirements. Completed-file playback is a fallback and does not satisfy this requirement. Source feasibility remains first. |
| N01 | Android service ownership of queue, advancement, source renewal and reconnect | Pending | Existing single-item service plus JavaScript advancement is insufficient; keep full native queue work ahead of BPM/widening. Requires updated APK, not only a website update. |
| N02 | Acknowledged native commands/capabilities and old-client compatibility | Pending | Bridge/service/producers/consumers must be reviewed together. Preserve existing saved data; older binaries must get compatible behavior or a clear required update. |
| N03 | Screen-off, notification controls, audio focus, interruptions, route changes and Bluetooth | Pending | Runtime verification after the native implementation. Browser mocks are not physical-device proof. |
| D01 | Preserve playlists, favorites, history, follows and account privacy | Pending | Identify persisted YouTube-named fields and source IDs. Use backward-compatible reads/versioned migration, not blind renames or destructive database writes. |
| D02 | Rename application-facing routes/types/components and update all callers | Pending | Inventory legacy public URLs and cached clients before removing routes. Compatibility adapters may be required to keep existing links/data readable. |
| B01 | Remove old application-owned provider dependencies and configuration | Pending | Remove youtubei.js / Data API key requirements / IFrame SDK only after their callers have replacements. Google account sign-in is a separate integration and must not be removed accidentally. |
| B02 | CSP, image URLs, preconnects, service worker, desktop artwork and Android policies | Pending | Browser access policies must match the new delivery path. Source URLs and trusted thumbnail-host mappings are data/security rules, not automatically unused code. Keep SSRF, TLS, bounded subprocess and authenticated delivery checks. |
| A01 | Separate Original/Processed modes; source/delivered/processed telemetry; no bit-perfect hardware claim | Pending | Preserve agreed audio-engine requirements; no fake bitrate, EQ or normalization completion claims. |
| A02 | EQ, normalization/DRC/limiting distinction and measured sample-peak protection | Pending | Android native EQ and the promised protection remain unfinished per the PR40 checklist. Source migration alone does not complete DSP. |
| A03 | Safari HLS processing qualification and fallback | Blocked | Physical supported iPhone/Mac tests remain unavailable. Audible HLS or canPlayType does not prove the Web Audio EQ path. |
| A04 | True-peak guarantee, hardware bit-perfect output, BPM and stereo widening | Explicitly deferred | Retain previously agreed scope; native queue reliability and source access come first. |
| T01 | Stage-by-stage diffs, checks and actual flow verification | Pending | Validate search/catalog, stream delivery/decoding, seeking, queue, renewal, reconnect and background separately. Stop provider-backed testing at the first failed source boundary; independent isolated checks may continue. |
| T02 | Final checklist, affected files, commits and explicit remaining blockers | Pending | Record source inspection, fixtures, emulator and physical-device results separately. No external PR/push until the user requests it. |

## Initial integration trace

1. Catalog UI: Searchbar / search page, home discovery, artist pages, playlist/library views, followed releases and recommendation features call /api/youtube-* or server helpers.
2. Catalog server: src/utils/youtubeApi.js centralizes Google Data API, youtubei.js/Innertube and direct provider requests. Its consumers include artist-sections, channel-rabbit-hole, crowd-radio, recommendations, userPlaylists and followedReleases, not only the six youtube-* routes.
3. Playback UI: MusicPlayer/YouTubePlayer.jsx combines the provider's two-deck iframe player with a HayKasa native media deck. Queue state, persistence, desktop/Discord/Jam/arcade hooks and player panels share the Redux YouTube-named fields.
4. HayKasa delivery: media/resolveMediaAsset.mjs -> /api/media/resolve -> mediaService.mjs -> private media service. media-service/app/jobs.py invokes yt-dlp/FFmpeg. Vercel's adapter persists completed assets in private Blob and returns scoped expiring delivery URLs.
5. Native rendering: media/nativeMediaDeck.mjs chooses browser audio/video or androidAudioElement.mjs -> Android MainActivity message listener -> PlaybackService/Media3 -> bridge events. Renewal/queue responsibilities still include JavaScript and must be moved under native ownership for reliable background operation.
6. Security/build: next.config.js allows provider connections/frames/images; layout.js preconnects to provider origins; sw.js caches source assets; Android diagnostics/policy and desktop artwork validate provider-hosted media. All must be reviewed with the replacement delivery contract.
7. Data: provider IDs and YouTube-named Redux/persistence fields are used by playlists, favorites, history, follows, Jam, desktop playback and arcade. Their data cannot be erased simply to make a text search return zero matches.

Historical QA reports remain evidence. Runtime integration removal, legacy data compatibility and source-provider adapter references will be tracked separately so a string rename cannot be mistaken for a completed migration.
