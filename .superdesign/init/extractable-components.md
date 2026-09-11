# Extractable Superdesign DraftComponents

## BrandMark
- Source: `src/components/Layout/BrandMark.jsx`
- Category: layout
- Description: HeyKasa lockup; compact logo vs banner wordmark, links home
- Extractable props: compact (boolean, default: false)
- Hardcoded: image assets, SITE_NAME alt, `/` href, brand-mark CSS classes

## Navbar
- Source: `src/components/Navbar.jsx`
- Category: layout
- Description: Top bar with menu, compact brand, home circle, search, refresh, account/login
- Extractable props: homeActive (boolean, default: true), authenticated (boolean, default: true), userName (string, default: "Account")
- Hardcoded: icon set, Log in label, search cluster structure, arcade link visibility

## Sidebar
- Source: `src/components/Sidebar/Sidebar.jsx`
- Category: layout
- Description: Left nav with brand, profile, primary links, playlists, GitHub
- Extractable props: activeItem (string, default: "home"), collapsed (boolean, default: false)
- Hardcoded: Home / Your Library / Liked Songs / Following / Settings / legal labels and icons

## MobileTabBar
- Source: `src/components/Layout/MobileTabBar.jsx`
- Category: layout
- Description: Bottom primary nav on < md: Home, Search, Your Library, Create
- Extractable props: activeItem (string, default: "home")
- Hardcoded: labels, Fi icons, Create as button not link

## PlayerDock
- Source: `src/components/MusicPlayer/PlayerDock.tsx`
- Category: layout
- Description: Bottom now-playing dock: artwork, title/channel, transport, timeline, tools; mobile play/next/expand
- Extractable props: playing (boolean, default: true), shuffle (boolean, default: false), repeat (boolean, default: false)
- Hardcoded: lucide icons, 48px thumb, cyan circular play, 44px hit targets

## EmptyState
- Source: `src/components/EmptyState.jsx`
- Category: basic
- Description: Glass panel empty/error with eyebrow, title, message, primary + ghost actions
- Extractable props: title (string, default: "Nothing here"), actionLabel (string, default: "Continue")
- Hardcoded: glass-panel, btn-primary, btn-ghost classes

## UserMessage
- Source: `src/components/UserMessage.jsx`
- Category: basic
- Description: Inline status/alert with tone colors and optional retry
- Extractable props: tone (string, default: "error"), title (string, default: "Something went wrong")
- Hardcoded: tone class map, compact padding
