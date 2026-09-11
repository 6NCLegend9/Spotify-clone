# Key page dependency trees

## / (Home)
Entry: `src/app/page.jsx`
Dependencies:
- `src/app/HomeClient.jsx`
  - `src/components/Homepage/Home.jsx`
    - `src/components/Homepage/HomeHeader.jsx`
    - `src/components/Homepage/QuickAccessGrid.jsx`
    - `src/components/Homepage/FeaturedRelease.jsx`
    - `src/components/Homepage/HomeRail.jsx`
    - `src/components/EmptyState.jsx`
    - `src/components/UserMessage.jsx`
    - `src/components/Skeleton.jsx` (HomeFeedSkeleton)
    - `src/hooks/useHomeFeed.js`
- Shared shell (all authenticated app pages):
  - `src/app/layout.js`
    - `src/components/Layout/AppShell.jsx`
      - `src/components/Navbar.jsx`
        - `src/components/Layout/BrandMark.jsx`
        - `src/components/Searchbar.jsx`
      - `src/components/Sidebar/Sidebar.jsx`
        - `src/components/Layout/BrandMark.jsx`
        - `src/components/Sidebar/Profile.jsx`
        - `src/components/Sidebar/Playlists.jsx`
      - `src/components/Layout/MobileTabBar.jsx`
      - `src/components/MusicPlayer/index.jsx`
        - `src/components/MusicPlayer/PlayerDock.tsx`
        - `src/components/MusicPlayer/ExpandedPlayer.tsx`
        - `src/components/MusicPlayer/QueueEditor.tsx`
        - `src/components/MusicPlayer/PlayerTimeline.tsx`

## Now playing overlay (not a route)
Entry: `src/components/MusicPlayer/PlayerDock.tsx` + `ExpandedPlayer.tsx`
Dependencies:
- `src/components/MusicPlayer/playerDock.module.css`
- `src/components/MusicPlayer/PlayerTimeline.tsx`
- `src/components/MusicPlayer/QueueEditor.tsx`
- `src/components/MusicPlayer/player.types.ts`
- `src/app/globals.css` (`.player-dock`, `.btn-primary`, `.icon-btn`)

## /library
Entry: `src/app/library/page.jsx`
Dependencies:
- `src/components/Library/LibraryView.jsx`
  - `src/components/EmptyState.jsx`
  - `src/components/UserMessage.jsx`
  - `src/components/MediaImage.jsx`
  - `src/components/Skeleton.jsx` (CardGridSkeleton)
  - `src/components/Sidebar/PlaylistModal.jsx`
  - `src/components/LikePlaylistButton.jsx`

## /search
Entry: `src/app/search/page.jsx`
Dependencies:
- `src/components/Search/BrowseAll.jsx`
- `src/components/Searchbar.jsx` (navbar)

## /settings
Entry: `src/app/settings/page.jsx`
Dependencies:
- `src/components/DeleteAccountForm.jsx`
- `src/components/ExportDataButton.jsx`
- `src/components/UserMessage.jsx`
- `src/components/GenrePreferences.jsx`
- `src/components/FeedbackPreferences.jsx`
- `src/components/ListeningInsights.jsx`
- `src/components/AccessibleDialog.jsx`

## /login
Entry: `src/app/login/page.jsx`
Dependencies:
- Auth card using `.auth-card`, `.btn-primary`, `.field` in `src/app/globals.css`
