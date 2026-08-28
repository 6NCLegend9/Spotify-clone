# Spotify-Like Clone — Build Specification

React + Tailwind CSS + MongoDB + reactbits.dev

You are building a Spotify-like clone with pixel-close UX behaviors, realistic data models, and a polished responsive UI.

## 0. Finalized Decisions & Scope

These points were ambiguous or contradictory in the original draft. They are settled here so implementation can start without follow-up questions.

- **Routing:** hash-based (`#/playlist/:id`, `#/search?q=...`) via a handwritten `useHashRoute()` hook. No `react-router` or any routing library. This resolves the "quick question" that closed the original draft.
- **State:** React state + Context only. No Redux, Zustand, Recoil, etc.
- **UI:** Tailwind CSS + handwritten components. Animations come from reactbits.dev components only.
- **Data:** MongoDB is the only database, but it is never queried directly from the browser — see Section 1.
- **Auth:** demo login only (no real password/email-verification flow), matching the original draft's `POST /api/auth/demo-login`. This is a deliberate simplification, not an oversight.
- **Catalog:** import official Spotify metadata through the server only. Real catalog tracks may play through a matched official YouTube embed; never rehost commercial audio or lyrics - see Section 9.
- **Continuity:** if this workspace still has a MongoDB cluster from a prior project, reuse its connection string and database name (see Section 10) rather than provisioning a new cluster.

## 1. Required Correction: A Minimal Server Layer Is Mandatory

The original brief said "no ... backend frameworks," which cannot be followed literally:

- Browsers have no MongoDB wire-protocol client. There is no safe way for React code running in a user's browser to open a MongoDB connection.
- Embedding a MongoDB connection string (or any DB credential) in frontend code would expose full database access to anyone who opens dev tools — an OWASP A02 (Cryptographic Failures) / A05 (Security Misconfiguration) issue, not a style preference.

So a thin server-side layer is a hard requirement, not an optional extra. Either of these satisfies the spirit of "no backend framework bloat":

- Vercel serverless functions using the official `mongodb` driver directly, or
- A minimal Node `http`/Express instance whose only job is to implement the endpoints in Section 2.2.

Rules for this layer:

- It must be the only thing holding `MONGODB_URI` and any other secret; secrets are never sent to or bundled into the frontend.
- All MongoDB queries built from user input must go through a whitelisted filter builder — never pass `req.query`/`req.body` straight into a Mongo filter object (this prevents NoSQL operator injection, e.g. `?title[$ne]=null`).
- reactbits.dev components may depend on `framer-motion` internally. Treat `framer-motion` as part of the allowed "reactbits.dev (animations)" toolkit when a chosen component requires it — don't add any other animation/UI dependency beyond what a component actually needs.

## 2. System Architecture

### 2.1 Frontend App Structure

- Implement a SPA with internal client-side routing without external routing libraries:
  - Use `window.location.hash` (e.g., `#/search?q=...`, `#/playlist/:id`, `#/track/:id`)
  - Create a `useHashRoute()` hook that parses the hash into `{ path, params, query }`
- Define a single root layout:
  - `AppShell` (sidebar + topbar + main content + bottom player)
- Views to implement (minimum):
  - Home
  - Search
  - Your Library (playlists + liked songs)
  - Playlist Detail
  - Browse by Genre
  - Track Detail (lyrics + track actions)
  - Settings/Profile (optional but recommended)

### 2.2 Backend / Data-Layer Contract (REST Endpoints)

Even if the frontend is built mock-first, define a stable API contract up front. MongoDB is the only database (no SQL, no other DB), accessed exclusively through this server layer (Section 1).

- **Auth/Demo**
  - `POST /api/auth/demo-login` → sets an httpOnly session cookie and returns `{ user }` (no token in the JSON body — see Section 8 on session storage)
  - `POST /api/auth/logout` → clears the session cookie
- **Tracks**
  - `GET /api/tracks?query=&genre=&artist=&sort=&limit=&cursor=`
    - `sort` ∈ `relevance | popularity | newest`
    - `limit` is clamped server-side (e.g., max 50) to prevent resource-exhaustion abuse
    - `cursor` is an opaque string encoding the last sort key + `_id` tiebreaker (avoid `skip`-based pagination, which gets slow on deep pages)
  - `GET /api/tracks/:trackId`
- **Playback + events**
  - `POST /api/listening-events` (records what the user played; rate-limited per user)
  - `POST /api/search-events` (stores queries; rate-limited per user)
- **Likes**
  - `POST /api/likes/:trackId`
  - `DELETE /api/likes/:trackId`
  - `GET /api/likes?limit=&cursor=`
- **Playlists**
  - `GET /api/playlists?ownerId=&search=&limit=&cursor=`
  - `POST /api/playlists` (create; validate `name` length/charset, `description` length)
  - `PATCH /api/playlists/:playlistId` (rename/metadata; owner-only)
  - `DELETE /api/playlists/:playlistId` (owner-only)
  - `GET /api/playlists/:playlistId/items`
  - `POST /api/playlists/:playlistId/items` (add multiple; owner-only)
  - `DELETE /api/playlists/:playlistId/items/:trackId` (owner-only)
- **Recommendations**
  - `GET /api/recommendations?limit=&reasonCodes=`

The frontend calls these with `fetch()` and handles loading/error states consistently.

### 2.3 Local Caching Rules (Corrected)

- Session identity must **not** live in `localStorage`. Store it as an httpOnly, `Secure`, `SameSite=Lax` cookie set by `/api/auth/demo-login` (localStorage tokens are readable by any injected script — an XSS-exploitable pattern; see Section 8).
- Use `localStorage` only for non-sensitive playback preferences:
  - `lastTrackId`, `lastPositionSec`, `volume`, `shuffle`, `repeatMode`, `crossfadeSeconds`, `videoMuted`
- Use an in-memory cache in React for:
  - fetched track by id
  - playlist by id
  - search suggestion results
- Cache invalidation: when liking/unliking, update the UI immediately, then reconcile with the server response.

### 2.4 Audio Playback Architecture

- Implement a `useAudioPlayer()` hook that stores:
  - `isPlaying`
  - `currentTrackId`
  - `progressSec`
  - `durationSec`
  - `volume`
  - `shuffle: boolean`
  - `repeatMode: "off" | "context" | "one"`
  - `queue`: array of track ids (current context)
- Functions: `play(trackId, contextQueue?, startIndex?)`, `pause()`, `seek(sec)`, `next()`, `previous()` (honoring shuffle/repeat)
- The hook must expose `crossfadeSeconds` and `setCrossfadeSeconds()` and coordinate the two media slots required by Section 2.5.
- The queue must be supported for:
  - playlist playback
  - search results playback (optional but recommended)
  - home "recommended" list playback (optional)

### 2.5 Video Clips & Crossfade Playback

- Add an optional "Video" control to Track Detail and the expanded Bottom Player. Show it only when the selected track has a licensed `videoUrl`.
- The video view must be a responsive, accessible panel with:
  - play/pause and mute controls
  - captions when a licensed caption track exists
  - poster image and loading/error/empty states
  - an `aria-label` describing the video player
- Video must never autoplay with sound. Respect the browser autoplay policy and the user's mute preference.
- Keep video separate from the audio-only player state so users can hide the video without stopping audio. If no licensed video exists, show "Video unavailable for this track" rather than a broken player.
- Implement song transitions with two media slots (`outgoing` and `incoming`) so the next track can load before the current track ends:
  - preload the incoming licensed audio/video source
  - start the incoming source at the configured transition point
  - crossfade only `opacity` and media volume, never layout dimensions
  - use an equal-power curve: outgoing volume follows `cos(t × π/2)`, incoming volume follows `sin(t × π/2)`, where $t$ runs from 0 to 1
  - default transition duration: 4 seconds; expose a setting with 0 (off), 2, 4, 6, or 8 seconds
  - cancel and clean up the transition if the user skips again, pauses, seeks, changes repeat mode, or closes the player
  - emit one listening event for the track that actually started; do not double-count the preloaded track
- Preserve the complete licensed mix during a crossfade: vocals, bass, melody, and all other channels remain in their original balance. Do not attempt stem separation unless separately licensed vocal/bass/melody/stem URLs are provided.
- When separately licensed stems are available, fade every stem with the same normalized curve and keep the stems synchronized to the same media clock; otherwise use the single full-mix `audioUrl`.
- Crossfade must degrade gracefully when a source cannot be preloaded, a browser blocks autoplay, or a media format is unsupported: finish/stop the outgoing track and show a non-blocking error state.

### 2.6 Equalizer, Player Volume & Sharing

- Add an **Equalizer** section to Settings. Implement it with the browser Web Audio API (`AudioContext` and `BiquadFilterNode`), which is an allowed browser API and does not require another UI/audio library.
- The equalizer must provide:
  - an on/off toggle
  - presets: `Flat`, `Bass Boost`, `Treble Boost`, `Vocal`, and `Night`
  - adjustable bands at 60 Hz, 150 Hz, 400 Hz, 1 kHz, 2.4 kHz, 6 kHz, and 15 kHz
  - gain range of -12 dB to +12 dB per band, with keyboard-accessible range inputs
  - a `Reset` action that returns to Flat
  - a non-blocking unsupported-browser fallback that leaves normal playback working
- Route every playable audio source through the equalizer chain once, and disconnect/close the `AudioContext` on teardown. Do not create a new context on every render or track change.
- Prevent clipping: keep a master gain stage after the filters, clamp values at the UI and audio-node boundaries, and preserve the user's volume separately from equalizer band gains.
- Save equalizer state in `localStorage` under a versioned key such as `musicon:equalizer:v1`: enabled state, preset, band gains, and master volume. Never store session tokens or credentials there.
- Add a compact **Volume** control beside the currently playing song in the Bottom Player:
  - use an icon button plus a range slider with a visible `aria-label` and current percentage
  - support mute/unmute while remembering the previous non-zero volume
  - apply this as master volume after the equalizer; it controls the current track and any crossfade slot consistently
  - keep the control touch-friendly and avoid changing the player layout when the slider appears
- Add a **Share song** action to Track Detail, each TrackRow/TrackCard action menu, and the Bottom Player. Share a canonical hash route such as `#/track/:trackId` with title and artist text.
  - use `navigator.share()` when available and allowed
  - fall back to copying the canonical URL with `navigator.clipboard.writeText()`
  - show a non-blocking toast for success, cancellation, or failure; never use a blocking browser alert
  - provide an accessible label and tooltip, and do not include private user or queue data in the shared URL

## 3. MongoDB Data Models

Design MongoDB collections with strict, predictable fields. All queries built from user input must go through a whitelisted filter builder (never `db.collection.find(req.query)` directly) to prevent NoSQL operator injection.

**Collection: `users`**
- Fields: `_id`, `displayName`, `email` (unique), `avatarUrl` (optional), `createdAt`, `updatedAt`
- `tasteProfile` (cached snapshot): `topGenres: [{ genre, weight }]`, `topArtists: [{ artistName, weight }]`, `lastUpdatedAt`
- `settings`: `volume` (0..1), `muted` (boolean), `shuffle` (boolean), `repeatMode`, `crossfadeSeconds`, `equalizer: { enabled, preset, bands: [{ frequency, gainDb }] }`
- Indexes: unique index on `email`; index on `tasteProfile.lastUpdatedAt` (optional)

**Collection: `tracks`**
- Fields: `_id`, `title`, `artistName`, `albumName`, `albumId` (optional), `coverUrl`, `audioUrl` (must be playable by the browser — see Section 9 on licensing), `videoUrl` (optional, licensed), `captionUrl` (optional, licensed), `stems` (optional, licensed `{ vocalsUrl, bassUrl, melodyUrl }`), `durationSec` (number), `genres: string[]`, `releaseYear` (number), `popularity` (0..100), `createdAt`
- Indexes: `genres`, `{ title: 1 }`, `{ artistName: 1 }`; optional `{ popularity: -1 }`. Compound text search is optional.

**Collection: `artists`** (optional but recommended for realism)
- Fields: `_id`, `name` (unique), `genres: string[]`, `bio` (optional), `avatarUrl` (optional)

**Collection: `playlists`**
- Fields: `_id`, `ownerId` (`users._id`), `name`, `description` (optional), `isPublic` (boolean), `coverUrl` (optional), `createdAt`, `updatedAt`
- Indexes: `{ ownerId: 1, createdAt: -1 }`, `{ isPublic: 1 }`

**Collection: `playlist_items`**
- Fields: `_id`, `playlistId`, `trackId`, `addedAt`, `position` (integer)
- Uniqueness: unique index on `{ playlistId: 1, trackId: 1 }` prevents duplicates
- Indexes: `{ playlistId: 1, position: 1 }`, `{ trackId: 1 }`

**Collection: `likes`**
- Fields: `_id`, `userId`, `trackId`, `likedAt`
- Uniqueness: unique index on `{ userId: 1, trackId: 1 }`
- Indexes: `{ userId: 1, likedAt: -1 }`, `{ trackId: 1 }`

**Collection: `search_events`**
- Fields: `_id`, `userId`, `queryText`, `queryType` (`track | artist | playlist | genre | mixed`), `matchedGenres: string[]`, `matchedArtists: string[]`, `createdAt`
- Indexes: `{ userId: 1, createdAt: -1 }`; TTL index on `createdAt` with a 90-day expiry (data minimization)

**Collection: `listening_events`**
- Fields: `_id`, `userId`, `trackId`, `playedAt`, `context: { type: "home" | "playlist" | "search" | "queue" | "liked", refId?: string }`, `positionSecAtStart` (optional), `dwellSecApprox` (optional)
- Indexes: `{ userId: 1, playedAt: -1 }`, `{ trackId: 1, playedAt: -1 }`; TTL index on `playedAt` with a 180-day expiry

**Collection: `recommendations_cache`**
- Fields: `_id`, `userId`, `generatedAt`, `seedSignals: { likedTrackIdsSample, topGenresSample, topArtistsSample, recentSearchQueriesSample }`, `recommendedTrackIds: string[]`
- Indexes: `{ userId: 1, generatedAt: -1 }`

## 4. Spotify-Like UI/UX Requirements

The UI must look and behave like Spotify in a modern dark theme.

**Global Layout (`AppShell`)**
- Sidebar (desktop/tablet): Home, Search, Your Library, Create (new playlist), Liked Songs; footer with profile shortcut + Settings
- Top navigation bar: current view title on the left; search field center/right with placeholder "Search artists, songs, or playlists" (Enter routes to search results, Esc clears input); user avatar + profile menu dropdown on the right
- Main content: responsive grid
  - Desktop: two-column layout on Playlist Detail — left: playlist info + track list, right: "Songs" panel (explicit requirement)
  - Mobile: single column, songs stacked
- Bottom Player (sticky): always visible on desktop; compact by default on mobile, expands on tap to show queue + lyrics toggle

**Track list UI (cards/rows)**
- `TrackRow`: left — index + play/queue button; center — title + artist; right — duration + like button + menu
- Hover: show play button, subtle background highlight
- Selected/playing row: indicator line or highlight, animated play icon state
- Actions: like toggle, add to playlist (opens modal)

**Playlist Detail view (explicit "songs on the right side" requirement)**
- Desktop: left column — cover, name, description, "Play" button (plays the full queue), optional like/follower count; right column — "Songs" panel header, track list with play/like/add actions, optional "Add to queue"
- Mobile/tablet: songs panel becomes the main content under the playlist header

**Lyrics panel / Track detail**
- Toggle button "Lyrics", scrollable lyrics container, loading skeleton while fetching
- Data source: `tracks.lyricsText`, optionally `lyricsByTimestamp` — see Section 9 for what lyrics content is actually allowed
- If lyrics are missing: show "Lyrics unavailable for this track"
- While playing: highlight the current line if timestamped, otherwise show static text
- Track Detail must expose the optional Video control described in Section 2.5 and keep it separate from the audio controls.

**Search behavior**
- Debounce input (250–350ms); suggestions dropdown (artists, tracks, playlists)
- Results page sections: Tracks, Artists (optional), Playlists (optional), Genres (chips)
- Filters: genre chips, liked-only toggle, sort dropdown (relevance/popularity/newest)
- Clicking a suggestion navigates to the relevant track/playlist/genre view

**"Made for you" personalization sections**
- Home sections: Made for you, Continue listening, Because you liked (genre-based)
- Recommendations re-render when the user likes a track, plays tracks, or searches
- Explainability badge, e.g. "Because you like {Artist}" / "More {Genre}-heavy picks"

**Interactions & micro-details**
- Loading: skeleton rows for track lists, skeleton cover cards for carousels
- Empty states: friendly, Spotify-like copy
- Toasts: "Added to playlist", "Removed from liked songs"
- Keyboard: visible focus states; Enter activates the focused item
- Accessibility: buttons must have `aria-label`; the current track row must use `aria-current`
- Crossfade verification: test off/2/4/6/8-second transitions, rapid skip, pause during fade, seek during fade, unavailable incoming media, and reduced-motion mode. Confirm there is no duplicate listening event and no audible fallback clip.
- Equalizer verification: test Flat and every preset, band reset, -12/+12 dB limits, mute/unmute volume restoration, playback continuity while changing bands, and the unsupported-Web-Audio fallback.
- Share verification: test native share, clipboard fallback, cancellation, unavailable clipboard, keyboard activation, and that the shared URL opens the correct track without private data.

## 5. Recommendation Logic & Personalization

Uses liked songs, searched queries, and recently played tracks.

**Event capture**
- On like: call `POST /api/likes/:trackId`; update the taste profile (immediately or via an async job simulation)
- On play: call `POST /api/listening-events` with `trackId` and `context` (`type` + `refId` for playlist/search)
- On search: call `POST /api/search-events` with `queryText`, `queryType`, and `matchedGenres`/`matchedArtists` if derivable

**Taste profile extraction**
- From likes: accumulate weights for genres and artists of liked tracks
- From search events: boost genres/artists whose names match query tokens
- From listening events: apply recency decay, conceptually `recencyWeight = exp(-ageHours / 24)`
- Cache the computed profile in `users.tasteProfile` with `lastUpdatedAt`

**Recommendation scoring formula (deterministic)**

For each candidate track, compute:
- `genreScore` = sum of weights of candidate genres that appear in the user's top genres
- `artistScore` = weight of the candidate artist in the user's top artists
- `recencyScore` = boost if the candidate artist/genre appears in recent listens
- `popularityScore` = `track.popularity` normalized to 0..1

```
finalScore = 0.45 × genreScore + 0.35 × artistScore + 0.15 × recencyScore + 0.05 × popularityScore
```

Exclusions: remove already-liked tracks from "Fresh" sections; if the user selects "liked-only," show only liked tracks.

**Why-this text generation**

Pick 1–2 signals per recommended track:
- Genre overlap: "Because you often listen to {Genre}"
- Else artist overlap: "Because you liked {Artist}"
- Else: "Based on your recent activity"

**Recommendation refresh rules**
- Refresh on: like/unlike, playing ≥ N tracks in a session (e.g., 5), a new search submitted
- Caching: reuse `recommendations_cache` if `generatedAt` is < 30 minutes old, otherwise recompute

## 6. Frontend Implementation Details

### 6.1 Required Hooks
- `useHashRoute()` → `{ view, params, query }`
- `useAudioPlayer()` → playback state + controls
- `useLikedTracks(userId)` → loads liked track ids, supports optimistic UI
- `usePlaylists(userId)` → loads playlist list with pagination
- `useSearch(query, filters)` → results + loading + suggestions
- `useRecommendations(userId)` → recommended tracks with "why" text

### 6.2 Required Components
`AppShell`, `SidebarNav`, `TopNavSearch`, `BottomPlayerBar`, `QueuePanel` (next-up list), `TrackRow`, `TrackCard` (carousels), `PlaylistCard`, `PlaylistDetail`, `LyricsPanel`, `AddToPlaylistModal`, `CreatePlaylistModal`, `ToastHost`, and skeleton components: `SkeletonTrackRow`, `SkeletonPlaylistCard`, `SkeletonCover`.

### 6.3 State Management
React state + Context only (handwritten, no external state libraries):
- `PlayerContext` (audio + queue)
- `UserContext` (session)
- `CacheContext` (optional)

### 6.4 reactbits.dev Animation Requirements
Apply subtle animations for: hover transitions on tracks, modal open/close (scale + opacity), sidebar collapse (slide), carousel slide, bottom player expand on mobile.
- Prefer `transform`/`opacity` only; avoid animating layout properties (`width`/`height`/`top`/`left`) to prevent layout thrashing.
- If a chosen reactbits component needs `framer-motion`, that's the one permitted exception (see Section 1) — don't add unrelated animation libraries.

### 6.5 Design Tokens (see `Assets.md`)
Use the palette defined in `Assets.md` as the Tailwind theme, not a generic "Spotify green":

| Token | Hex | Primary usage |
|---|---|---|
| Deep Navy | `#0D1B2A` | Backgrounds, dark panels, high-contrast text |
| Azure Blue | `#007BFF` | Secondary accents, links, nav highlights |
| Sunset Orange | `#FF6700` | Play buttons, primary CTAs, active states |
| Off-White | `#F5F5F0` | Body text, card backgrounds, light contrast |

- Implement a consistent spacing scale, readable typography, and visible focus rings.
- Keep color usage consistent with the table above (e.g., don't repurpose Sunset Orange for destructive actions — use a distinct error color not in this palette, defined once in the Tailwind config).

### 6.6 Responsive Behavior Targets
Breakpoints: `sm` mobile, `md` tablet, `lg` desktop.
- **Desktop:** sidebar visible; Playlist Detail shows the songs panel on the right.
- **Tablet:** sidebar can collapse to icons-only; Playlist Detail can become two columns but tighter.
- **Mobile:** sidebar becomes a drawer or is hidden; songs list stacks; bottom player becomes compact and touch-friendly.

## 7. Catalog Import Plan

**Seed minimums**
- Tracks: 200–500
- Artists: 50–120
- Playlists: 20–60
- Genres: at least 12–25
- Playlist items: 5–80 tracks per playlist, varied
- Demo user interactions: 30–150 likes, 50–200 search events, 80–400 listening events

**Genre distribution:** each genre should have enough tracks (e.g., 8–30) and some artists should belong to multiple genres.

**Recommendation test strategy:** after importing, have the demo user like tracks from 2–3 genres, search for a specific artist plus a genre term, then open a few tracks in the official player — "Made for you" should change noticeably.

**Provider constraint (see Section 9):** imported Spotify records keep provider IDs, canonical URLs, cover art, artist/album metadata, and `audioUrl: null`. Playback must stay inside an official provider embed; never rehost commercial audio or lyrics.

## 8. Security & Privacy Checklist

- **Session storage:** httpOnly, `Secure`, `SameSite=Lax` cookie only — never a token in `localStorage` (Section 2.3). Tokens in `localStorage` are readable by any injected script (XSS-exploitable).
- **NoSQL injection:** every MongoDB filter built from user input goes through a whitelisted filter builder — never pass `req.query`/`req.body` straight into `.find()` (Section 1).
- **Input validation:** enforce length/charset limits on `playlist.name`, `playlist.description`, and `queryText`; clamp `limit` params server-side (Section 2.2).
- **Output handling:** rely on React's default escaping for track titles, descriptions, and lyrics; never use `dangerouslySetInnerHTML` for user- or seed-provided text.
- **Rate limiting:** apply per-user limits to `POST /api/likes/*`, `/api/listening-events`, `/api/search-events`, and `/api/playlists*` to prevent abuse.
- **CORS:** restrict the API to the known frontend origin (`SITE_URL`) only.
- **Authorization:** playlist mutation endpoints must verify the requester owns the playlist, not just that they're logged in.
- **Secrets:** `MONGODB_URI` and `SESSION_SECRET` live only in server-side environment variables, excluded from version control via `.gitignore`, and are never bundled into frontend code.
- **Data minimization:** TTL indexes on `search_events` (90 days) and `listening_events` (180 days), per Section 3.

## 9. Legal & Content Note - Audio & Lyrics

This is a non-commercial discovery demo, not a licensed streaming service:

- Spotify metadata may be imported server-side through the official Spotify Web API. Do not expose Spotify credentials to the frontend.
- Do not rehost, proxy, download, or stream real commercial audio, including Spotify preview URLs, without a license.
- Spotify metadata does not authorize raw Spotify playback. Full Spotify playback requires an authorized Spotify user session and official playback SDK; otherwise use a matched official YouTube embed when one is available.
- Never scrape, paste, or rehost copyrighted lyrics. Genius integration may provide metadata and a canonical Genius page link only.
- Label the app clearly as a discovery demo in its UI.

## 10. Environment Variables

**Server-only** (never exposed to the frontend bundle):
- `MONGODB_URI` — reuse the existing cluster's connection string if continuing in this workspace
- `MONGODB_DB_NAME` — reuse the existing database name if continuing in this workspace
- `SESSION_SECRET` — signs the httpOnly session cookie used by demo login
- `PORT` — local dev server port
- `SITE_URL` — the deployed frontend origin, used for CORS

**Frontend-only** (safe to expose, prefixed per the build tool's convention, e.g. `VITE_`):
- `VITE_API_BASE_URL` — base URL the frontend calls for the API

**Not needed for this spec** (dropped along with the real Spotify Web API integration, Google OAuth, and email verification a prior project in this workspace used): `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`, `MAIL_EMAIL`/`MAIL_SECRET`/`MAIL_HOST`/`MAIL_PORT`/`MAIL_SECURE`, `VITE_GOOGLE_CLIENT`. Reintroduce them only if a later revision adds real third-party auth, email, or the real Spotify catalog.

## 11. Deliverables Checklist

**Codebase**
- React app with all required views and components
- Tailwind config + theme styling (Section 6.5)
- reactbits.dev animations integrated
- Defined API calls to the MongoDB-backed server (mock data layer acceptable during early development)
- Audio player works end-to-end

**Documentation** — README with setup instructions, environment variables (Section 10), data schema descriptions, API contract summary, how to run the seed script, and known limitations.

**Quality gates**
- Responsive UI verified for desktop (columns + right-side songs panel), tablet, and mobile (compact player + single column)
- Like/playlist actions reflect in the UI immediately (optimistic UX) and reconcile after the server responds
- Equalizer, volume/mute, and share actions verified on desktop and mobile; shared track URLs resolve correctly.

## 12. Folder Structure & Remaining Implementation Decisions

These were the last ambiguities blocking a cold start; they're settled here.

**Build tooling:** Vite for the client dev server/bundler, with Tailwind wired in via `@tailwindcss/vite` (or PostCSS). Vite is build tooling, not an application library, so it isn't restricted by Section 0's "no extra libraries" rule.

**Icons:** hand-written inline SVG React components under `client/src/assets/icons/` — no icon library (`lucide-react`, `react-icons`, etc.), since that would violate the "no other third-party UI libs" rule.

**`useHashRoute()` matching:** a small ordered route table (`client/src/routes.js`) of `{ pattern: "/playlist/:id", view: "playlistDetail" }` entries. The hook matches the current hash against this table (simple segment-by-segment comparison, no regex engine needed) to produce `{ path, params, query }`.

**Demo login mechanics:** `POST /api/auth/demo-login` takes no request body. The server finds-or-creates one fixed seeded demo user (e.g., `email: "demo@musicon.local"`), sets the session cookie, and returns `{ user }`. There is no signup form or credential input in this spec.

**Testing scope:** automated tests are optional for this build. Manual verification against the Section 11 quality gates is sufficient; add tests later if the project grows past a demo.

**Folder structure:**

```
/
├── client/                      # React + Tailwind SPA (Vite)
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              # AppShell + view switch driven by useHashRoute
│       ├── routes.js            # path-pattern → view table (see above)
│       ├── hooks/                # useHashRoute, useAudioPlayer, useLikedTracks,
│       │                         # usePlaylists, useSearch, useRecommendations
│       ├── context/              # PlayerContext, UserContext, CacheContext
│       ├── components/           # AppShell, SidebarNav, TopNavSearch, BottomPlayerBar,
│       │                         # QueuePanel, TrackRow, TrackCard, PlaylistCard,
│       │                         # LyricsPanel, AddToPlaylistModal, CreatePlaylistModal,
│       │                         # ToastHost, Skeleton*
│       ├── views/                # Home, Search, Library, PlaylistDetail, Genre,
│       │                         # TrackDetail, Settings
│       ├── assets/icons/         # hand-written SVG icon components
│       ├── lib/api.js            # fetch wrapper (credentials: "include" for the session cookie)
│       └── styles/               # Tailwind entry + config-driven tokens (Section 6.5)
├── server/                       # thin API layer (Section 1)
│   ├── package.json
│   ├── db/connection.js
│   ├── db/collections.js         # collection name constants
│   ├── lib/filterBuilder.js       # whitelisted query builder (Sections 1 & 8)
│   ├── lib/session.js             # httpOnly cookie session helpers
│   ├── routes/                    # or api/ if using Vercel serverless functions
│   └── scripts/seed.js            # Section 7 seed script
├── Rules.md
├── Assets.md
└── .gitignore
```

---

This spec is implementation-ready. Routing is finalized as hash-based (Section 0); folder structure and the remaining open decisions are finalized in this section. Begin with the folder scaffold above, then the MongoDB connection + seed script, then the frontend shell.

Add-on Requirements: Settings, Quality Control, Equalizer, Favorite Playlists, and Deeper Personalization (Daily + Weekly)

Below are the missing “last details” you requested. Integrate these into your existing Spotify-like clone prompt/spec.

1) Settings Page (must be full-featured, Spotify-like)
Build a Settings view under Your Library → Settings (or profile menu). The settings page must include these sections:

Profile**
  Display name (editable)
  Avatar (upload URL or preset avatar for demo)
  Account info (email + created date)
  Session/logout button (demo is fine)

Playback & Audio (EQ + Playback Quality)**
  Equalizer (EQ)
    Provide an interactive EQ UI with sliders:
      Bands: 10-band (recommended) OR 5-band (minimum)
      Bands example (10-band): 31Hz, 62Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz
    Each slider stores a value range (example: -12dB ... +12dB)
    Show a preset dropdown:
      Flat
      Boost Bass
      Boost Treble
      Vocal
      Rock
      Pop
      Hip-Hop/Rap
    When EQ changes:
      Update the audio output using Web Audio API:
        Create an AudioContext
        Connect ` element source → multiple BiquadFilterNode`s → destination
      Persist EQ settings to backend (or at least persist locally, but backend is preferred)
  Playback Quality
    User can choose Network-based streaming mode and Manual override.
    UI options:
      Auto (Network-based) (default)
      Low
      Medium
      High
      Ultra
    “Auto” behavior:
      Measure network conditions using download speed estimation:
        Start a short fetch (or use navigator.connection if available)
        Pick quality tier:
          Low: slow networks / high latency
          Medium: moderate networks
          High: fast networks
          Ultra: very fast + stable
      When quality changes:
        If a track is already playing, optionally switch to a better/worse audioUrl without breaking UX (best-effort)
        If not playing, apply quality on next play

Audio Behavior**
  Gapless / Crossfade toggle (optional but recommended)
  Normalize volume (loudness) toggle (UI toggle even if simple)
  Skip silence toggle (UI toggle; can be simulated)

Data Saver**
  Limit background data toggle
  Allow downloads toggle (if you support downloads)

Keyboard shortcuts (optional)**
  Show a list of controls and a “Enable/Disable shortcuts” toggle

Persistence**
  Persist settings in users.settings:
    eqBands: number[]
    eqPreset: string
    qualityMode: "auto" | "low" | "medium" | "high" | "ultra"
    qualityEffective: computed tier (optional cache)
    dataSaverEnabled: boolean
  Save changes on interaction (debounce 300–600ms) to reduce API spam

2) Audio Quality Architecture (Low/Medium/High/Ultra)
To support the quality selector, your track model and playback logic must support multiple quality audio sources.

Update the tracks schema**
  Add:
    audioSources object with URLs by quality
      audioSources: { low: url, medium: url, high: url, ultra: url }
    If you don’t want ultra for all tracks, allow missing fields.

Playback logic rule**
  Add getEffectiveAudioUrl(track, userSettings):
    If qualityMode !== "auto" → use chosen tier
    If auto → compute tier based on measured network (and cache for ~5 minutes)
    Fallback order if a tier is missing: ultra → high → medium → low

UI rule**
  Show current quality indicator near player controls:
    Example: “Quality: High” or an icon
  If user changes quality while playing:
    Best-effort reload from the chosen source at the same approximate seek time
    Keep progress bar consistent

3) Favorite Playlists with “No Limit of Songs”
You requested a favorite playlist system where the user can like/save without song limit.

Interpretation (recommended model)**
  Create a concept of Favorite Playlists that are unbounded in size.
  Implement as:
    A user can create multiple “Favorite playlists” (or a fixed set)
    Each playlist can hold any number of tracks (practically “no limit”)

Required playlists behavior**
  No cap on number of tracks
  UI supports:
    infinite scroll or pagination in playlist view (to handle large sets)
    fast add/remove actions
  If you prefer Spotify’s “Liked Songs”:
    Treat Liked Songs as a special unlimited playlist-like set

Data model**
  You can implement “favorites playlists” as normal playlists:
    playlists + playlist_items
  Enforce only performance indexes (not a song limit)
  Optional: add playlists.type:
    "user" | "favorites" | "system"
    So you can mark special ones as non-deletable

4) Daily Personalization + “Weekly New Discoveries” + “Your Discoveries”
You requested:
daily related songs based on likes + searches
weekly 2 playlists
  Weekly: New Discoveries
  Your Discoveries
and “no limit” liked behavior feeding it

Implement these exactly as system-generated playlists with rules.

System-generated playlist types**
  Add playlist “system” types:
    WeeklyNewDiscoveries
    YourDiscoveries
  These playlists must be regenerated on a schedule:
    Daily for the daily mix
    Weekly for the weekly playlists

What “Daily related songs” means**
  Inputs:
    user liked songs
    user searches
    recently played tracks (optional but recommended)
  Output:
    a daily section on Home: “Daily picks”
    and/or a system playlist like DailyDiscoveries
  “Styled based on what he liked” rule (explicit)
    If the user likes Rap/R&B tracks:
      boost Rap and R&B heavily
      also boost overlapping artists frequently
      include blended picks:
        “Rap x R&B crossover”
        “Similar energy”
    If user likes multiple clusters (e.g., Pop + EDM):
      balance between clusters using weights from tasteProfile

Weekly playlist #1: “New Discoveries”**
  Must be generated from:
    tracks NOT liked by the user
    tracks NOT listened heavily recently
  Must focus on novelty:
    prefer candidates with decent popularity + freshness
    reduce repeats compared to the last generated week

Weekly playlist #2: “Your Discoveries”**
  Must be more “taste-fitting”:
    higher weight for genres/artists user likes
    allow some familiarity, but still avoid exact repeats too often

Regeneration schedule**
  Weekly playlists regenerate:
    once per week (based on server time or a deterministic week id)
  Daily picks regenerate:
    once per day (based on date)
  Store results in MongoDB cache:
    recommendations_cache keyed by userId + windowType (daily/weekly) + windowId

UI requirements on Home**
  Show:
    Daily picks (daily section)
    New Discoveries (weekly playlist card)
    Your Discoveries (weekly playlist card)
  Each playlist card:
    shows subtitle like “Updated today” / “Updated this week”
    has a “Play” button and opens playlist detail

5) Recommendation Logic must expand to “Explainability” + “Why these daily/weekly songs”
You already had recommendation scoring—now extend it:

Add candidate freshness & anti-repeat**
  Keep in MongoDB:
    last time each track was recommended to this user
      e.g. recommendations_history (optional collection) OR store in recommendations_cache
  Penalize tracks recommended in the last:
    7 days (for weekly)
    1–2 days (for daily)

Explainability text (must be shown in UI)**
  For daily and weekly lists, each track (or at least each card) must have:
    “Because you like {Artist}”
    OR “Because you listen to {Genre}”
    OR “Based on your searches for {query}”
    OR “Fresh picks similar to your taste”

Weighted blend rule (explicit)**
  Use 3 buckets:
    Liked taste (most weight)
    Search signals
    Recency
  Example:
    daily: 0.5 liked + 0.3 search + 0.2 recency
    weekly: 0.6 liked + 0.25 search + 0.15 recency
  Apply anti-repeat penalties on top

6) Required new MongoDB fields/collections for these features
Add these to your spec (so the full system supports settings + EQ + quality + daily/weekly playlists).

users.settings**
  eqBands: number[]
  eqPreset: string
  qualityMode: "auto" | "low" | "medium" | "high" | "ultra"
  dataSaverEnabled: boolean
  updatedAt

tracks.audioSources**
  audioSources.low
  audioSources.medium
  audioSources.high
  audioSources.ultra (optional)

recommendations_cache (extend)**
  windowType: "daily" | "weekly"
  windowId (ex: date string for daily, week number for weekly)
  recommendedTrackIds
  reasonsByTrackId (optional but recommended for UI)

(Optional but recommended) recommendations_history**
  userId
  trackId
  recommendedAt
  windowType
  Index on { userId: 1, trackId: 1 } and { userId: 1, recommendedAt: -1 }

One clarifying question (so I finalize the “last parts” perfectly)
For lyrics, do you want:
  Static lyrics (no timestamps), or
  Timed lyrics (highlight current line while playing)?
You’re right to call that out. A “Spotify clone alike” needs a lot of additional Spotify-standard behaviors, not just playlists/likes/player. I can’t guarantee a perfect 1:1 clone of Spotify (it’s proprietary and tied to their backend/catalog), but I can give you a Spotify-realism feature checklist and then we can incorporate everything into your full professional prompt/spec.

What’s usually missing when a “Spotify clone” is simplified
1) Playback realism (Spotify-grade player behavior)
Queue model**:
  “Queue” vs “Next up” (and how it changes when you enqueue vs play next)
  “Play from start” behavior, and how previous/next works in shuffle vs repeat modes
Progress + seeking fidelity**:
  Scrub/seek preview behavior (UI updates immediately; audio seeks)
  Correct handling when track duration differs by quality source
Playback modes + states**:
  Shuffle and Repeat modes must interact correctly (off/context/track)
  Handle edge cases: track missing in selected quality, buffering, audio error
Crossfade / gapless** (even if simplified):
  Ensure the UI + settings reflect actual behavior
Device behavior concept**:
  “Connect to a device” UX exists on Spotify; in your case simulate:
    current device indicator
    “Take over playback” action (mock state)

2) Library accuracy (Spotify’s saved behavior)
Liked Songs vs “Favorite playlists”**:
  Spotify treats Liked Songs as a special saved state, with its own semantics
“Save to Your Library”** model for playlists:
  In Spotify, playlists can be followed/saved; the UI differentiates it from ownership
Follow/Unfollow playlists**:
  Your prompt should include both:
    owned playlists
    followed playlists
Collecting albums/artists**:
  Spotify users can follow artists and save albums (often overlooked)

3) Search & browsing quality (Spotify’s discovery)
Result types and interactions**:
  Search returns mixed content (tracks, albums, artists, playlists)
  Click behavior differs:
    track plays
    album opens album view
    artist opens artist view
    playlist opens playlist view
Search suggestions (Spotify-like)**:
  Popular suggestions, recent searches, and partial match behavior
Filters that are actually useful**:
  “Songs” vs “Artists” toggles (not just genre chips)
Browse pages beyond “Home + Genre”**:
  Spotify has multiple browse modules:
    editorial picks
    charts/top tracks
    new releases
    radio-like experiences

4) Artist/album pages (major Spotify surface area)
Artist page**:
  Bio section
  Top tracks
  Albums (grid)
  Related artists
Album page**:
  Album header
  Tracklist order exactly as released
  “Play album” behavior
Without these, the clone feels incomplete even if playlists work perfectly.

5) Charts, Radios, and “radio” UX
Spotify’s biggest missing piece in most clones:
  Radio:
    “Artist Radio”
    “Song Radio”
    “Playlist Radio”
  It continuously queues similar tracks
Charts / top lists:
  “Weekly Top 50”, “Viral”, “Trending” modules (can be mocked)

6) Offline + downloads (optional but usually expected)
If you want realism, add a simulated “Downloads” area:
  Download toggle per track/album/playlist
  Storage management UI (even if mocked)

7) Notifications, toasts, and “state correctness”
Spotify has consistent feedback:
  add/remove confirmations
  like animation timing
  success/failure handling
Also: optimistic UI + rollback
  If server fails, UI must revert reliably.

8) Accessibility and keyboard navigation (Spotify-level polish)
Beyond “aria-label”:
  predictable focus order
  Esc behavior per modal/dropdown
  roving tabindex for lists
  visible focus rings consistent with theme

What I need from you to “match Spotify more” (2 quick questions)
1) Scope goal: do you want a clone that’s:
UX-perfect for the web player + navigation** (and data can be mocked), or
near-feature-complete** (artist/album pages, artist radio, charts, etc.) even if catalog is limited?

2) Audio reality: are you going to use:
a fixed set of provided audio URLs** (each track already has low/med/high/ultra URLs or just one), or
one audio URL only** (quality selector becomes simulated UI only)?

Next step
If you answer those two, I’ll update your master “professional prompt” by adding the missing Spotify-like modules in a structured way, including:
exact new pages/components (Artist, Album, Artist/Track Radio, Charts modules)
queue + repeat/shuffle edge cases
settings details expansion (including which ones truly affect playback)
MongoDB fields needed for library follow/save, radio state, and generated modules (daily/weekly + charts)

Yes—there are still several “big Spotify behaviors” that most Spotify-like clones miss. Below is an additional completeness checklist you can add to your prompt.

1) Library semantics & follow system (often missing)
Follow artists**
  Let users follow/unfollow artists
  Save “followed artists” to Your Library
  Feed artist-follow signals into daily/weekly recommendations
Follow playlists (not just own)**
  Distinguish:
    Owned playlists (created by user)
    Followed playlists (followed but not owned)
  UI shows correct badges and prevents wrong permissions (e.g., can’t delete others’ playlists)
Saved albums (optional but very Spotify-like)**
  Follow/save albums and show under Library

2) Radio & continuous discovery (major missing part)
Artist Radio / Song Radio / Playlist Radio**
  Selecting a seed creates an infinite queue of similar tracks
  UI: “Radio” header + “Stop radio” / “Change station”
Queue behavior**
  Radio continuously adds to the queue as you near the end
  Repeat modes + shuffle should still behave sensibly

3) Queue, “Up next”, and enqueue actions (big realism detail)
Add to queue vs play next**
  Provide actions:
    Play now
    Add to queue
    Play next
  “Queue” should not always replace context—Spotify treats these differently
Queue editing (optional but realistic)**
  Show Up Next list with ability to remove items
  Queue order persists until cleared

4) Context playback & navigation preservation
Context awareness**
  When you go from Playlist → Search → back, playback continues correctly
  Track list “playing row” indicator must remain correct across views
Now Playing mini details**
  Player bar can open:
    Lyrics/queue panel
    Track details drawer/modal

5) Playlist management realism
Playlist reorder**
  Optional: allow changing track order in a playlist
Track position correctness**
  When inserting into playlist, store position properly
Collaborative playlists (optional)**
  If you add it, include roles:
    owner/editor/viewer

6) “Devices” & playback takeover (Spotify-like UX)
Even if you don’t implement multi-device audio, include the UX:
Device list**
  “This computer” device + “Other devices”
Take over playback**
  Clicking another device switches “activeDeviceId” state
Now playing sync**
  UI reflects active device, even if audio stays local (mock is OK)

7) Search completeness (what Spotify returns)
Search results grouped by type**
  Songs/Tracks, Artists, Albums, Playlists
Recent searches**
  Show in suggestions dropdown
Auto-correct / partial match behavior**
  Tokenize and fuzzy match lightly using your dataset fields
Search tabs**
  Like Spotify’s “Songs / Albums / Artists / Playlists” filter at top

8) Album + Artist pages (major surface area)
If you want it to feel “Spotify-real” beyond playlists:
Artist page**
  header, followers placeholder, bio
  Top tracks
  Albums grid
  Related artists
  Artist Radio entry point
Album page**
  album info, “Play album”
  tracklist order exactly as released
Genre pages**
  curated modules: top tracks, popular artists, related genres

9) Editorial modules / charts (often missing but easy to fake)
Charts**
  Daily/weekly charts page (e.g., “Top Songs”)
Trending / Viral**
  Shuffle a deterministic set based on day/week
New Releases**
  based on track releaseYear or seeded “releaseDate”

10) Playback settings that actually affect output
Beyond EQ and quality tier:
Normalization / loudness**
  Add a toggle and apply a gain curve (even approximate)
Crossfade (simulated)**
  UI toggle + best-effort crossfade using two audio elements (optional but impressive)
Buffer/error handling**
  If audio fails:
    show error toast
    try fallback quality source (high→medium→low)

11) Account realism
Profile**
  Stats: total playlists, liked songs count
Security/limits**
  if you add login, include logout and session expiration behavior (demo ok)

12) Performance + correctness details
Pagination + virtualized lists (optional)**
  If you have 1000+ tracks, lists must remain smooth
Optimistic updates with rollback**
  Like/unlike and add/remove playlist:
    apply instantly
    if API fails → revert state + toast
Loading skeletons consistency**
  Everywhere: track lists, carousels, search results, playlist items

Full “Spotify Everything” Master Prompt (Near-Complete UX + Realistic Data/Logic)
You are a senior full-stack developer. Build a Spotify-like web app that is as complete as possible on the web by implementing Spotify-style UI/UX, behaviors, screens, and data modeling, while allowing a small catalog for audio to keep it feasible.
Use only:
React**
Tailwindcss**
MongoDB**
reactbits.dev** (animations)

No other libraries, no Redux, no Next.js, no Express, no router libs.
Routing must be hash-based: #/home, #/search?..., #/album/:id, #/artist/:id, etc.

0) Hard constraints
No other DB/tools** besides MongoDB.
No other JS libraries** besides React + Tailwind + reactbits.dev.
Use fetch() for API calls.
Use `` for playback.
Use Web Audio API only for EQ (no external DSP libs).
Implement only what’s needed to simulate Spotify behavior realistically (catalog can be small; behavior must be “Spotify-correct”).

1) App shell & Spotify-grade navigation
Implement the following primary destinations (views) and preserve Spotify-like navigation consistency:

Home**
  Editor modules: Continue listening, Made for you, Daily picks, Weekly: New Discoveries, Weekly: Your Discoveries
  Discovery modules: Trending, New releases, Because you listened to…, Because you like…
  Each module has:
    skeleton loading
    “See all” behavior
    carousels + grids depending on screen size
Search**
  Search bar + suggestions dropdown:
    tabs: Songs, Artists, Albums, Playlists
    keyboard navigation (↑/↓, Enter)
    recent searches section
  Results page grouped by type + filters:
    genre chips
    Liked only toggle
    sorting: relevance/popularity/newest
Your Library**
  Liked Songs (special saved collection)
  Playlists (owned + followed)
  Artists (followed)
  Albums (saved) (recommended for “full Spotify” — include if feasible)
Browse**
  Genre hubs + curated collections (mock editorial)
Playlists**
  Owned + followed lists
  playlist detail navigation
Artist page**
  Follow/unfollow
  Top tracks
  Albums grid
  Related artists carousel
  Entry point for Artist Radio
Album page**
  Header + Play album
  Tracklist order preserved
  Track actions + Like
Charts / Top**
  Daily/weekly charts snapshots
  Trending/Viral sections
Radio**
  Entry points and station pages:
    Song Radio, Artist Radio, Playlist Radio
  Station UI includes: seed info, “Stop radio”, “Change station”
Settings**
  Complete playback settings, EQ, quality control, data saver, privacy (as mock if needed), devices/session UI (see full section below)

2) Player & playback system (Spotify-correct behaviors)
Implement a playback engine with Spotify-like concepts:

Player bar**
  Sticky bottom player on desktop/tablet
  Mobile: compact → expandable (tap/drag) with queue + lyrics toggle
  Shows:
    album art
    track title + artist(s)
    play/pause, next/previous
    seek/progress bar (scrub support)
    volume + mute
    shuffle + repeat mode buttons
    quality indicator
Queue + Up Next**
  Maintain:
    contextQueue (tracks for playlist/album/radio)
    upNext (computed next items)
    queueItems list for “Add to queue” edits
  Must support actions:
    Play now (switch context correctly)
    Add to queue (append without losing current context)
    Play next (if feasible)
  Shuffle + repeat correctness:
    repeat off / repeat context / repeat one
    shuffle affects next selection while respecting repeat one
Previous/Next edge cases**
  Keep history to support “Previous” accurately
  Ensure playing a track directly sets correct position & updates “playing row”
Audio quality tier selection**
  Track data supports multiple sources (see schema).
  Player selects audio URL by:
    Manual quality mode: Low/Medium/High/Ultra
    Auto quality mode: computed from network conditions
  If a tier is missing, fallback tier order: ultra → high → medium → low
  If audio fails, attempt fallback and show toast
Crossfade / gapless UX**
  Include UI toggles.
  Implementation:
    best-effort crossfade using two `` elements (allowed if done with plain browser APIs)
Lyrics support**
  Track detail / player expand includes a Lyrics panel
  Two modes:
    Static lyrics (if you can’t do timestamps)
    If you include timestamps, highlight current line
  If missing: show “Lyrics unavailable for this track”

3) Library semantics (Saved vs Followed vs Owned)
Implement Spotify-correct library behaviors and UI:

Liked Songs**
  Like/unlike toggles saved state for tracks
  Treated as a “special collection” with unlimited size (practically unbounded)
Playlists**
  Owned playlists: created by user
  Followed playlists: followed by user but owned elsewhere (if you seed public playlists)
  UI must reflect:
    delete only for owned playlists
    follow/unfollow for non-owned
    add/remove songs works for owned; for followed show “save for me” if you choose (define behavior in prompt output)
Follow Artists**
  Follow/unfollow artist
  Followed artists appear in Library
  Follow influences personalization + daily/weekly playlists + radios
(Recommended) Saved Albums**
  Save/un-save album
  Show in Library
  Influences personalization

4) Radios (must be first-class, Spotify-like)
Implement continuous discovery using station sessions:

Radio types**
  Artist Radio seeded by artist
  Song Radio seeded by track
  Playlist Radio seeded by playlist context
Radio session engine**
  On start:
    generate initial queue (e.g., 25–50 tracks)
    populate radioQueueItems ordered by similarity + novelty
  As user nears end:
    append more tracks automatically (“feed the queue”)
  Similarity signals:
    shared genres
    artist overlap
    track feature proxies: popularity + release year proximity + “style tags” from your seed
Radio station UI**
  Shows station name + seed details
  “Stop radio” clears/pauses session queue logic
  “Change station” starts new session

5) Personalization (Daily + Weekly) + Explainability
You must implement Spotify-like personalization with anti-repeat and reasons.

Event capture (stored in MongoDB)**
  Likes/unlikes
  Searches (with query type: track/artist/album/playlist/genre)
  Plays (with context type: home/playlist/album/search/radio/queue/liked)
Taste profile**
  Compute/maintain users.tasteProfile:
    topGenres, topArtists
    recency weighting from listens
Explainability**
  For each recommended track show reason:
    “Because you liked {Artist}”
    “Because you like {Genre}”
    “Because of your searches for {query}”
    “Fresh picks similar to your taste”
Daily system**
  Generate Daily picks (and/or Daily module) refreshed daily (windowId = date)
  Output supports a “system playlist” representation
Weekly system (2 playlists, exact names)**
  Weekly: New Discoveries
    Focus novelty + reduce repeats
    Prefer tracks user hasn’t liked/listened heavily
  Weekly: Your Discoveries
    Strong taste-fit
    Still includes novelty (anti-repeat rules)
Anti-repeat**
  Track recommendation history per window:
    penalize recently recommended tracks
    penalize heavy recent listens (thresholds configurable)
Regeneration triggers**
  regenerate on:
    meaningful like event
    new search submission
    when enough listening events accumulated
  otherwise reuse cached results for performance

6) Charts, Trending, and New Releases (Spotify-like editorial modules)
Implement these “catalog-driven modules” even if the catalog is small.

Charts**
  Daily and Weekly top charts based on listening events + popularity + anti-bias
  Store snapshots in MongoDB for consistent playback
Trending/Viral**
  Deterministic “hotness” score using:
    recent listens
    search spikes
    popularity priors
New releases**
  Based on releaseDate / createdAt
  Show “released this week” and “recently added” modules

7) Settings (EQ + Quality + Devices) — must be complete
Your Settings page must include:

Audio**
  Equalizer
    10-band slider EQ with ranges (e.g., -12dB..+12dB)
    preset dropdown:
      Flat, Boost Bass, Boost Treble, Vocal, Rock, Pop, Hip-Hop/Rap
    Live update via Web Audio API graph:
      audio element → filter bank → destination
  Playback Quality
    Modes:
      Auto (network-based)
      Low / Medium / High / Ultra manual
    “Auto” must:
      estimate bandwidth/latency (using fetch timing or navigator.connection when available)
      map to tier
    If quality changes while playing:
      best-effort reload to the correct tier maintaining progress as close as possible
  Normalization toggle (simulate gain curve or volume compensation)
  Crossfade toggle (if implemented, wire it to player)
  Data saver toggle:
    “Prefer lower quality”
    “Limit background discovery” (can be mock but behavior should reduce fetch frequency)
Devices & Playback**
  Device list UI:
    “This computer”
    “Other devices” (seeded mock devices)
  “Take over playback” switches active device indicator
  Toast: “Playback moved to {deviceName}”
Privacy/Sharing (mock if needed)**
  Manage radio personalization toggles (optional but include UI)
Account**
  Profile info (display name, avatar)
  Logout demo button

8) Backend/API contract (MongoDB-backed; exact endpoints)
Even if you mock a backend, the prompt must define the API contract precisely.

Auth**
  POST /api/auth/demo-login
  POST /api/auth/logout
Tracks**
  GET /api/tracks?query=&genre=&artist=&album=&type=track&sort=&quality=&limit=&cursor=
  GET /api/tracks/:trackId
Artists**
  GET /api/artists?query=&limit=&cursor=
  GET /api/artists/:artistId
Albums**
  GET /api/albums?query=&limit=&cursor=
  GET /api/albums/:albumId
Playlists**
  GET /api/playlists?ownerId=&followedBy=&search=&limit=&cursor=
  POST /api/playlists (create)
  PATCH /api/playlists/:playlistId (rename/metadata)
  DELETE /api/playlists/:playlistId (owned only)
  POST /api/playlists/:playlistId/items (add tracks)
  DELETE /api/playlists/:playlistId/items/:trackId
  GET /api/playlists/:playlistId/items?limit=&cursor=
  Follow playlists
    POST /api/playlists/:playlistId/follow
    DELETE /api/playlists/:playlistId/follow
Library**
  Like tracks
    POST /api/likes/:trackId
    DELETE /api/likes/:trackId
    GET /api/likes?limit=&cursor=
  Follow artists
    POST /api/artists/:artistId/follow
    DELETE /api/artists/:artistId/follow
  Save albums (recommended)
    POST /api/albums/:albumId/save
    DELETE /api/albums/:albumId/save
Events (must be persisted)**
  POST /api/events/likes
  POST /api/events/search
  POST /api/events/listening
Personalization & windows**
  GET /api/personalization/daily?date=YYYY-MM-DD
  GET /api/personalization/weekly?weekId=YYYY-Www
  GET /api/personalization/reasons?trackIds=...
Recommendations**
  GET /api/recommendations?context=daily|weekly|home&limit=&windowId=
Radio**
  POST /api/radio/sessions (start)
  GET /api/radio/sessions/:sessionId/queue?limit=&cursor=
  POST /api/radio/sessions/:sessionId/stop

9) MongoDB data model (large enough for “everything”)
Implement the following collections (with indexes). This is where “full Spotify” realism comes from.

users**
  taste profile + settings + quality + eq
tracks**
  include multi-quality URLs
  store genres, releaseDate, popularity, style tags
  store lyrics (static or timed)
artists**
albums**
playlists**
  include ownerId, type (owned, followed, system)
  system types: weekly_new_discoveries, weekly_your_discoveries, daily_picks
playlist_items**
likes**
followed_artists**
followed_playlists**
saved_albums* *(recommended)
search_events**
listening_events**
radio_sessions**
radio_queue_items**
charts_snapshots**
personalization_cache**
  keys per user + windowId + type + generatedAt
recommendations_history**
  anti-repeat penalties for daily/weekly

Important indexes
likes: { userId: 1, trackId: 1 } unique + { userId: 1, likedAt: -1 }
listening_events: { userId: 1, playedAt: -1 }, { trackId: 1, playedAt: -1 }
search_events: { userId: 1, createdAt: -1 }
followed_artists unique: { userId: 1, artistId: 1 }
followed_playlists unique: { userId: 1, playlistId: 1 }
playlist_items unique: { playlistId: 1, trackId: 1 }
recommendations_history: { userId: 1, windowType: 1, trackId: 1 }

10) Seed data requirements (must be “full scope”)
Because you want both “small audio catalog” and “Spotify-complete behavior,” you must seed enough metadata.

Minimum seed counts**
  Tracks: 300–800
  Artists: 80–200
  Albums: 120–300
  Playlists: 60–150
  Genres: 18–35
Quality sources**
  For each track include:
    audioSources.low/medium/high/ultra (can reuse sample audio URLs if necessary)
Lyrics**
  Provide lyrics for at least:
    40–70% of tracks (static is OK)
User demo**
  At least 1–3 demo users
  Seed:
    likes: 100–400
    search_events: 200–800
    listening_events: 400–2000
Radio readiness**
  Ensure genre/artist overlap exists:
    an artist must belong to multiple genre tags
    tracks share artists and cross-genre tags
Charts readiness**
  Seed enough plays in recent windows so daily/weekly charts are non-empty

11) Frontend implementation blueprint
Your UI must be componentized and animation-polished.

Required components**
  AppShell
  SidebarNav
  TopNavSearch
  BottomPlayerBar + QueuePanel + LyricsPanel
  TrackRow (index, play/queue, like, menu)
  TrackCard (carousel)
  PlaylistDetail (must show Songs with Spotify-like rows)
  ArtistPage
  AlbumPage
  ChartsPage
  RadioStationPage
  SettingsPage (EQ + quality + devices)
  Modals/Toasts
Animation requirements**
  Use reactbits.dev for:
    hover elevation
    modal open/close
    carousel slide transitions
    mobile player expansion
Responsive requirements**
  Desktop:
    playlist/album pages use Spotify-like layout (metadata + tracklist)
  Tablet:
    compressed sidebar
  Mobile:
    single-column content
    compact player defaults + expandable sheet

12) Deliverables checklist (what you must produce)
Working React UI**
Tailwind dark theme** Spotify-like
reactbits.dev animations integrated**
Audio player functional**
MongoDB schemas + indexes + seed script**
API contract implemented (or mocked to spec)**
Daily + Weekly system playlists**
  Weekly names exactly:
    New Discoveries
    Your Discoveries
Radios implemented**
  Artist Radio / Song Radio / Playlist Radio
Charts implemented**
Artist + Album pages implemented**
Settings implemented**
  EQ + quality + devices UI

FGot it — crossfade must be both UI + real playback using dual `` elements (so the user actually hears the transition), while keeping Spotify-correct controls (seek/progress, next/previous, shuffle/repeat).

Before I generate the final “one true” master prompt for your repo (with exact component + MongoDB + logic details), I need just one last decision:

How should your crossfade behave when switching quality tiers?**
  Option A: Crossfade first, then swap to the new quality after the transition
  Option B: Swap quality immediately, then crossfade using the new tier sources
