# yt-dlp migration: dependency index and verification

PR42 starts from merged main fbaae39eae5c7e70d896955d2ca8b5c4933c608e, including the final PR41 recovery fixes. The original lexical audit remains a snapshot at 234fcd985556480ca44fc77d2b397c6cfdf8522f. Direct integration removal remains unimplemented: the required source gate still fails. The updated yt-dlp pin is not a completed migration.

Both Codex sessions should read the [coordination handoff](COORDINATION.md), [ownership supplement](OWNERSHIP.md), [decision status](DECISIONS.md) and [message record](AGENT-MESSAGES.md) before editing. Peer C002 acknowledges coordinator C001, and coordinator C004 acknowledges C002/C003: receipt through [PR42 comments](https://github.com/6NCLegend9/Spotify-clone/pull/42) is verified in both directions. The hosts retain separate filesystems and no direct session connection. Ownership is accepted; exact shared wire semantics remain under review.

## Current evidence — 2026-10-29

The user restates the all-path replacement instruction; [C029](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6505989717) acknowledges it. These records are current; the original snapshot below remains historical evidence.

- [Current index](inventory-current.json): 498 runtime/tooling code paths,195 direct candidates (109 runtime/config),1,304 static imports,472 API references and explicit IPC/native/security/packaging boundaries. [Regenerate](evidence/index-provider-paths.cjs) with the locked TypeScript parser. Locks/credentials/generated QA inventories are excluded. Three unresolved test imports are virtual/external references; no missing runtime module is demonstrated. Review membership does not mean every path needs deletion.
- [Graphify provenance](evidence/graphify-migration-index.json):487 supported code files across web, desktop, Android and worker. Digests, exact query vocabulary/hashes, EXTRACTED/INFERRED counts and limits are recorded. CSS/images/HTML policies require separate review; topology is not runtime or unused-code proof.
- [Cross-platform report](evidence/cross-platform-20261029.json): exact public EXE/APK, Windows controls, real Android 33/36 service tests, production browser tours and isolated three-engine DSP. [C032](https://github.com/6NCLegend9/Spotify-clone/pull/42#issuecomment-6506805362) separates passing UI/selection/decoder checks from failed live playback/update/retired-binding behavior.
- [Source attempts](evidence/source-access-20261029.json): August and current 2026.10.26 both fail both uncached songs with source_access_restricted. Generated storage/ranges pass; actual-song decoding/quality/startup are not reached. No activation, release or fabricated readiness.

Removal targets are direct APIs, youtubei.js, SDK/iframe fallback and connected consumers. Preserve account sign-in, playlist sharing, saved IDs/library data and meaningful legacy-read tests. Internal yt-dlp acquisition URLs and historical reports are distinct from direct browser integrations. Replace catalog capabilities explicitly; do not silently drop albums, captions, filters or guest listening.

To regenerate the index and run the read-only live web check in a disposable QA checkout:

```bash
npm ci
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
node docs/qa/ytdlp-migration/evidence/index-provider-paths.cjs
node docs/qa/ytdlp-migration/evidence/production-web-check.cjs
```

The web check uses fresh guest profiles, real production APIs and no mocks. It writes screenshots/results to `artifacts/pr42-production-web` and exits nonzero when functional playback fails. It does not alter production configuration or create accounts. Phone results are browser emulation; native APK tests are separate.

The user requested every related path, not just the video player. [inventory.json](inventory.json) lists 179 tracked text paths with matching line numbers: 121 runtime/native/source-adapter/build paths, 23 verification-code paths and 35 historical documentation / fixture paths. [call-map.json](call-map.json) records static imports, API consumers and manually traced boundaries; connected files without a direct provider-name match are included for review. The peer found additional IPC/native/security boundaries, now explicit in the ownership supplement. These records validate recorded entries, not exhaustive ownership or successful playback.

| Flow / entry point | Current integration | Replacement work and compatibility obligation |
| --- | --- | --- |
| Searchbar, search results, song picker, home discovery | src/app/api/youtube-search/route.js → src/utils/youtubeApi.js → Google Data API / direct Innertube / youtubei.js | yt-dlp discovery backend, normalized results, bounded search/cache/concurrency, actual channel/playlist support, filters and pagination. Remove embed-only eligibility filters without losing explicit-content checks. |
| Track details and playlist durations | src/app/api/youtube-videos/route.js; fetchYoutubeTracksByIds / hydrateYoutubeCatalogTracks | yt-dlp metadata hydration with duration/artist/thumbnail metadata. Preserve request ordering, batch bounds and incomplete-duration cache policy. |
| Artist page and followed releases | src/app/api/youtube-channel/route.js; fetchYouTubeChannel / fetchLatestChannelVideos / searchChannelsViaInnertube; src/utils/followedReleases.mjs | yt-dlp channel/artist lookup and bounded catalog extraction. Preserve exact artist links, thumbnails, release dates, deduplication and follow identity. |
| Artist sections and album/release pages | src/app/api/artist-sections/route.js; src/app/api/youtube-album/route.js; src/utils/artistMusicCatalog.mjs | Verify yt-dlp support for music browse/release IDs and related sections. Current album IDs use MPR-prefixed browse identifiers; ordinary playlist extraction must not be presented as equivalent without proof. |
| External playlists and playlist links | src/app/api/youtube-playlist/route.js; src/app/youtube-playlist/[id] | yt-dlp playlist metadata/entries and native audio delivery. Plan backward-compatible existing URLs and saved playlist IDs; preserve unavailable-track handling and pagination. |
| Lyrics/captions | src/app/api/youtube-captions/route.js; src/hooks/useYoutubeCaptions.js; src/utils/youtubeCaptions.mjs | yt-dlp subtitle metadata/acquisition with bounded parsing and existing timed-line contract. Stop provider iframe caption module calls. |
| Recommendations, crowd radio, channel rabbit-hole | recommendations, crowd-radio, channel-rabbit-hole and userPlaylists API routes plus shared catalog functions | Replace all shared-helper reads, including comments-derived links and popular-track discovery. Keep half-personal/half-discovery policy, exclusions, explicit/private/account filters and deduplication. |
| Main player | src/components/MusicPlayer/YouTubePlayer.jsx combines native media, SDK readiness and iframe fallback | One owned engine without SDK/iframe fallback, preserving intent, occurrence identity, duration/seek, errors, queue editing, shuffle/repeat, volume and recovery. No synthetic source-success response. |
| Browser/native media deck | media/nativeMediaDeck.mjs → resolveMediaAsset.mjs → /api/media/resolve | Preserve CORS/autoplay, source renewal and user Pause. Engine errors must produce visible bounded recovery rather than recreating a provider iframe. Persistent elements/nodes and Original/Processed requirements remain tracked in the migration checklist. |
| Android app | androidAudioElement → MainActivity → PlaybackService/Media3 → bridge events | Native queue/advancement, renewal/reconnect, interruptions, notification controls and acknowledged commands. A website-only deployment cannot deliver these native service changes. |
| Desktop transport/artwork | useDesktopPlaybackBridge, desktop/src/playback.mjs, desktop/src/artworkPalette.mjs | Preserve commands/metadata and update validated artwork origins. Keep native updater/security work from PR41. |
| Redux, local snapshots, history and shared consumers | playerSlice.js, PlaybackPersistence.jsx, playbackSnapshot.mjs, Jam/Discord/arcade/player panels | YouTube-named fields and source IDs are persisted data. Versioned compatible reads must accompany neutral naming; never erase users' songs, queues or follows to remove a text match. |
| Preparation/delivery | /api/media/resolve → mediaService.mjs → Vercel binding → media-service/app/vercel_app.py / jobs.py → private Blob and signed ranges | Keep authentication, scoped ownership, lease expiry, byte-range validation, bounded processes/disk/output and TLS. Source access and extraction-time streaming are independent requirements. |
| Guest playback | IFrame path currently permits guests; direct media resolution requires a signed-in user | Removing the embed also removes current guest playback unless the new design explicitly preserves an appropriately bounded guest ownership/authentication contract. Do not silently introduce a sign-in requirement. |
| Network/build policy | next.config.js, layout.js, sw.js, package.json / lockfile, Android diagnostics and desktop artwork | Remove SDK/Data API/youtubei.js dependencies only with replacement callers. Review CSP/frame/connect/image hosts, preconnects, service-worker caches and native URL restrictions. Keep unrelated Google account sign-in. |
| Tests / documentation | Inventory includes 23 matching verification scripts plus transitive callers; historical reports are separate | Replace iframe/provider fixtures with real new-engine contract checks; preserve meaningful security/queue/account tests and historical failure evidence. Update maintained setup docs when implementation exists. |

## Confirmed blockers and limits

- Production /api/media/resolve returned enabled:false, reason:service_disabled in the latest read-only check. Earlier hosted probes reached storage/range delivery, then failed with source_access_restricted. These are distinct failures and neither establishes usable live audio.
- Final PR41 checks and preview passed; the previous media-container registry denial is historical. PR42 must pass its own checks. Healthy deployment does not establish source access, and this stage does not change production flags, provider credentials or registry contents.
- The service now pins official 2026.10.26 / EJS 0.8.0 at 2694bb7. Existing images satisfy Python >=3.11. Real FFmpeg/Blob SDK checks pass, but updated deployed extraction still fails; see current evidence above.
- Application-facing removal scope is acknowledged in C029. yt-dlp is an acquisition tool, not an independent catalog; preserve saved identities and verify required catalog capabilities. Source access and guest/full-v2 contracts remain open.

The full [requirements checklist](../../superpowers/plans/2026-10-24-ytdlp-migration.md) retains the agreed source-access gate, Android queue ownership, security, compatibility, DSP, Safari and extraction-time-streaming requirements. No compilation, mock or string rename will be counted as proof of live background playback.

The narrower Android D06 implementation is tracked in [D06 evidence](D06-IMPLEMENTATION.md). Normal checks pass, but opt-in retired-binding tests fail on both OS versions. Public APK 1.0.2 lacks native 1.0.3 changes. These results do not complete migration or physical/audio qualification.
