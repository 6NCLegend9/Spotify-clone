# HayKasa routes

Framework: Next.js 15 App Router. Shared chrome: `src/app/layout.js` → `AppShell` (sidebar, navbar, main, player dock, mobile tab bar). Auth pages use route-level layouts that still sit inside root layout.

| URL | File | Layout | Summary |
| --- | --- | --- | --- |
| `/` | `src/app/page.jsx` → `HomeClient` → `Homepage/Home.jsx` | AppShell | Home feed: header chips, quick access, featured release, mix/track rails |
| `/search` | `src/app/search/page.jsx` | AppShell | Genre browse (`BrowseAll`) |
| `/search/[query]` | `src/app/search/[query]/page.jsx` | search layout | Search results |
| `/library` | `src/app/library/page.jsx` | library layout | Library grid (`LibraryView`) |
| `/library/liked` | `src/app/library/liked/page.jsx` | library layout | Liked Songs |
| `/library/playlist/[playlistId]` | `src/app/library/playlist/[playlistId]/page.jsx` | library layout | Library playlist detail |
| `/playlist/[playlistId]` | `src/app/playlist/[playlistId]/page.jsx` | playlist layout | Public playlist |
| `/album/[albumId]` | `src/app/album/[albumId]/page.jsx` | album layout | Album |
| `/artist/[artistId]` | `src/app/artist/[artistId]/page.jsx` | artist layout | Artist |
| `/favourite` | `src/app/favourite/page.jsx` | favourite layout | Favourites alias |
| `/following` | `src/app/following/page.jsx` | following layout | Followed artists |
| `/settings` | `src/app/settings/page.jsx` | AppShell | Playback, EQ, privacy, account |
| `/arcade` | `src/app/arcade/page.jsx` | arcade layout | Beat Arcade (gated) |
| `/jam/[code]` | `src/app/jam/[code]/page.jsx` | jam layout | Listen-together room |
| `/login` | `src/app/login/page.jsx` | login layout | Email/password login |
| `/signup` | `src/app/signup/page.jsx` | signup layout | Create account |
| `/reset-password` | `src/app/reset-password/page.jsx` | reset layout | Request reset |
| `/reset-password/[token]` | `src/app/reset-password/[token]/page.jsx` | reset layout | Set new password |
| `/verify-email/[token]` | `src/app/verify-email/[token]/page.jsx` | AppShell | Email verify |
| `/privacy` `/terms` `/accessibility` `/dmca` | matching `src/app/*/page.jsx` | AppShell | Legal |

Now playing is not a route: `AppShell` mounts `MusicPlayer` in `.app-player` when a track is active. Desktop dock is `PlayerDock`; expand opens `ExpandedPlayer` (`<dialog>` now-playing / queue, max 480px).
