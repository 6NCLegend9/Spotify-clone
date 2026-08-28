# Musicon

A Spotify-inspired music discovery demo built with React, Vite, Tailwind CSS, Express, and MongoDB. It imports Spotify catalog metadata server-side and provides live YouTube music-video discovery through the official YouTube Data API.

## What It Includes

- Hash-routed Home, Search, Library, Playlist, Track, Artist, Album, Charts, Radio, Genre, and Settings views.
- Grouped search with recent queries, keyboard selection, filters, sorting, and genre browsing.
- Mongo-backed likes, owned/followed playlists, followed artists, saved albums, cursor pagination, and owner-only playlist management.
- Personalized daily and weekly discovery, cached charts, song/artist/playlist radio stations, and listening/search events.
- Full-length official YouTube playback for matched imported tracks, with queue, shuffle, repeat, crossfade, quality, equalizer, volume, and device preferences retained for supported browser audio sources.
- A ten-band equalizer, persisted quality/playback preferences, and mock playback takeover for This computer, Studio speaker, and Pocket player.
- Live YouTube music-video search and trending results, with playback in YouTube's official embedded player and captions when the video provider supplies them.

## Local Setup

1. Keep secrets in the root `.env` file. It is ignored by Git and should never be committed.
2. Install dependencies:

	```powershell
	npm install
	npm install --prefix client
	npm install --prefix server
	```

3. Import the real Spotify catalog metadata. `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` must be present in the root `.env`:

	```powershell
	npm run sync:spotify
	```

4. Start the API and Vite client together:

	```powershell
	npm run dev
	```

	The client runs at `http://localhost:5173` and proxies `/api` calls to `http://localhost:5000`.

5. Build the client and run the API smoke check:

	```powershell
	npm run build
	npm run test:smoke
	```

## Environment Contract

Server-only variables:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. |
| `MONGODB_DB_NAME` | Database name used by the API. |
| `SESSION_SECRET` | Secret used to sign the httpOnly demo-session cookie. |
| `PORT` | API port; defaults to `5000`. |
| `SITE_URL` | Allowed browser origin for credentialed CORS in production. |
| `YOUTUBE_API_KEY` | Google Cloud key for YouTube Data API v3. Keep this server-only; restrict it to YouTube Data API v3 in Google Cloud. |
| `SPOTIFY_CLIENT_ID` | Spotify application client ID used only for catalog metadata import. |
| `SPOTIFY_CLIENT_SECRET` | Spotify application client secret used only for catalog metadata import. |
| `GENIUS_ACCESS_TOKEN` | Optional Genius API token for lyric metadata and canonical page links. |

Client-only variable:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | API origin for split-origin deployments. Leave unset locally because Vite proxies `/api`. |

YouTube results are metadata from the official API and play in an official YouTube embed. Imported Spotify catalog tracks select a duration-matched official YouTube upload for in-site playback. The app never downloads or proxies provider audio/video, and it does not scrape lyrics.

## Data and API

`npm run sync:spotify` imports Spotify artists, albums, tracks, images, popularity, release data, and canonical provider identifiers into MongoDB. Imported tracks deliberately have no raw `audioUrl`; in-site playback uses a matched official YouTube upload. Full Spotify playback would require a separate user-authorized Spotify Web Playback SDK integration.

Main API groups:

- `/api/auth` for the signed demo session, profile, and persisted settings.
- `/api/tracks`, `/api/search`, `/api/artists`, and `/api/albums` for catalog discovery.
- `/api/playlists`, `/api/likes`, artist follows, playlist follows, and album saves for the library.
- `/api/recommendations`, `/api/charts`, `/api/radio`, `/api/listening-events`, and `/api/search-events` for discovery and personalization.
- `/api/youtube/search`, `/api/youtube/trending`, and `/api/youtube/videos/:videoId` for official live YouTube music-video metadata.
- `/api/lyrics` for Genius lyric metadata and canonical links when `GENIUS_ACCESS_TOKEN` is configured.
- `/api/health` for MongoDB readiness.

Most user-specific endpoints require the httpOnly demo session cookie. The client never stores a session token in localStorage.

## Deployment Notes

For a split browser/API deployment, set `VITE_API_BASE_URL` to the public API origin and set the API's `SITE_URL` to the browser origin. Set all server-side provider credentials, `SESSION_SECRET`, and MongoDB values in the deployment platform's environment settings rather than in source control.

## Limitations

This is a non-commercial discovery demo. Real catalog data does not grant raw playback rights: media remains inside official provider embeds. Genius provides metadata and links, not rehosted lyrics. Mock devices keep browser audio local, and the in-memory rate limiter is intended for local/demo use rather than horizontally scaled production infrastructure.
