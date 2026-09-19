# HayKasa design system

HayKasa is a free dark music streaming web app. Visual identity is deep navy with a single electric cyan accent (`#00e6e6`). This language is **global** — Home, Library, Search, artist/playlist pages, Settings, auth, and the player all share the same recipes. Do not introduce Spotify green, extra brand colors, or light mode unless asked.

## Product
- Name: HayKasa / HayKasa Music
- Tagline: Free Music Streaming
- Logo: `src/assets/HayKasa-logo-removebg.png` (compact mark), `src/assets/HayKasa-banner-removebg.png` (wordmark). Always use the real lockup, never initials or a generic note icon in logo positions.
- Live: https://haykasa.vercel.app

## Color
- Canvas / page: `#000814` (`navy`)
- Surfaces: `#07121d` surface, `#0b1722` raised, `#101c28` panel
- Text: `#f4f7fb`; secondary `#9aa8b5`
- Accent / CTAs / active nav / play button: `#00e6e6` on `#001014` text
- Supporting teal: `#64c9d7` / `#22a6b3` for atmosphere only, not primary buttons
- Hairline: `rgba(255, 255, 255, 0.1)` on chrome (sidebar, navbar, dock, panels)
- Fill: `rgba(255,255,255,0.07)` idle, `0.08` hover, `0.14` press
- Glass: `rgba(7,18,29,0.72)` + 12px blur
- Glow: reserved for primary CTAs, not cards

## Type
- UI: Poppins 400–800
- Page titles, greetings, and shelf titles: Poppins 700, tight tracking
- Display (Righteous) only for decorative mix stamps
- Tabular time in the player: `tabular-nums`

## Shape & density
- Media art: **4px** radius everywhere
- Cards / library tiles / shelves: transparent, hover fill, no cyan border or lift-glow
- Filter chips: pill; **active is white on black**, inactive is white/8% — not cyan
- Play FAB: cyan circle (`#00e6e6` on `#001014`) — HayKasa stand-in for Spotify green
- Icon buttons: 44×44 minimum; hover is white fill, not cyan glow
- Sidebar 260px (16.25rem); collapsed ~84px
- Top bar 64px desktop, 56px + safe-area mobile
- Player dock ~80–184px; mobile tab bar ~60px + safe-area

## Motion
- 180–220ms, `cubic-bezier(0.22, 1, 0.36, 1)`
- Respect `prefers-reduced-motion` and scrolling pause of decorative animation
- Atmosphere (Ghost Fibers) stays quiet (~32% opacity) on every route

## Layout
Desktop: collapsible left sidebar + top navbar (home circle + pill search + account) + scrollable content + bottom player dock.

Home (Spotify-close): All/Music/Podcasts chips → “Good morning/afternoon/evening” → 8 recently-played shortcuts → New release from → Jump back in / Made For You / mixes with **Show all**.

Mobile: hamburger + compact brand in navbar, bottom tab bar (Home / Search / Your Library / Create), compact dock (art + title + cyan play/next/expand). Expanded now playing is a `dialog`: stacked Now playing / Queue under 1024px (full-bleed under 480px); **desktop split** (art + transport | queue).

## Components
- Primary button: cyan pill, bold, light glow
- Ghost: translucent pill, white hover fill
- Chips (`.home-chip`): white when selected — Home, Library, Search
- Nav active: cyan text + 3px left accent bar
- Cards (`.card`, `.library-tile`, `.home-shelf-card`): shared shelf recipe
- Play control (`.play-fab`): cyan overlay on covers; static on playlist heroes
- Empty states: glass panel, eyebrow, title, muted body, primary + ghost
- Player: lucide transport, 48px 4px-radius thumb in dock, cyan circular play, `#00e6e6` range accent

## Do not
- Do not use Spotify green (`#1DB954` / `#1ed760`) — cyan is the brand play color
- Do not replace HayKasa logo with a music-note glyph or letter H
- Do not drop below 44px hit targets on controls
- Do not invent a second accent color
- Do not restyle a single page away from this system
