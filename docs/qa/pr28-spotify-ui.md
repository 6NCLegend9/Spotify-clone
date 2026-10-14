# PR28 music interface changes

Requested order: Spotify desktop/web, followed by mobile. HayKasa branding and providers remain in place.

## Implemented

- Full-width Home/search/account toolbar; charcoal panels, green default accent, system sans-serif typography and rounded independently scrolling panels.
- Resizable library and optional Now playing sidebar; eight Home shortcuts; Jump back in and music shelves; guest sign-in state for Made for you.
- Top result and song-row search results with artwork, artist links, play, duration and queue actions. Explicit-content preferences also apply to autocomplete.
- Full-page/sidebar library search, pinned-first recent/added/alphabetical/creator sorting, pin indicators, list/grid choices and account-scoped local view preferences.
- Account dropdown with existing library, history, follows, settings and sign-out flows.
- Persistent desktop transport, disabled empty state, repeat off/queue/one, and a Now playing toggle only at widths supporting that panel.
- Mobile two-column shortcuts, stacked search results, compact transport and Home/Search/Library/Create navigation. Modal navigation makes background controls inactive.
- Playlist detail editor for name, optional description and cover. Authenticated owner-only PATCH saves all changes together. Description is bounded at 300 characters in the API/schema and returned by the shared serializer; existing playlists default to an empty description.
- Dialogs portal to the document root to avoid clipping inside independently scrolling/transformed panels. Saved appearance accents continue to apply to portals.

## Verification

The repository continues to contain no replacement test suites. Temporary probes run outside the repository exercised the actual playlist route with simulated persistence: detail save and serialization, invalid names/descriptions/covers, ownership, authentication, trusted-origin rejection and rate limiting. Library sort probes covered pins, invalid dates, creator/alphabetical ordering and immutable inputs. The actual playback handler was probed for repeat-one completion, manual skipping, queue repeat and failure avoidance.

Run `npm run check`, `npm run check:desktop-contract`, and `git diff --check` for the final source. The new system-font layout does not require Google Fonts access or build fixtures.

Browser launch/network permission was not available in this workspace. Responsive styles compile, but pixel-level comparison and interactive desktop/mobile rendering are unverified. No live production database writes, production deployment or merge were performed.

## Remaining product boundaries

This is the core music interface pass. It does not implement a podcast catalog, Spotify Connect, Spotify's licensed catalog, or subscription commerce. The unavailable Podcasts filter was replaced with a working Made for you entry. Existing source-playback deployment activation requirements still apply; see the separate yt-dlp verification document.
