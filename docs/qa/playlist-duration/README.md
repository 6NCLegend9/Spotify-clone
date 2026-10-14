# Playlist row spacing and saved durations

The mobile playlist grid had two columns but three visible cells (title, duration,
actions), so its menu wrapped to a second grid line. Use three explicit columns
and preserve the 66px row height shared with playlist virtualization. Desktop
album/date columns remain controlled by collection container width.

Save bounded positive duration metadata with Liked Songs and playlist membership,
including the current player's known length. Keep existing values on re-add and
remove metadata on deletion. Existing documents need no migration. The playlist
hydrator prefers provider lengths, then saved metadata, and retries old cached
entries that lack a duration. Search-result durations are reused for later video
detail requests. Incomplete video metadata is not retained in long-lived client,
provider, or CDN caches; the video cache key version invalidates older entries.

Unknown durations remain unknown rather than displaying invented numbers. Totals
show `Duration unavailable` when nothing is known, or `At least …` for a partial
sum. Old saves without duration metadata depend on a successful provider lookup;
the change cannot recover a length that the provider never supplies.

`node docs/qa/playlist-duration/check.cjs` exercises real save/remove API handlers,
serialization, payload validation, saved-duration fallback, stale-zero cache retry,
cache policy and total labels against isolated boundaries.

`node docs/qa/playlist-duration/browser.cjs` renders the actual Next.js collection
page with controlled API fixtures. Desktop/mobile cases cover Liked Songs, regular
playlists, legacy zero caches, missing metadata, and a 240-track virtualized list.
It measures 66px row height and duration/menu alignment, checks durations/totals,
opens the row menu and checks UI errors. Screenshots/results are uploaded by
`.github/workflows/playlist-duration-vm.yml`. No real account or catalog is modified.
