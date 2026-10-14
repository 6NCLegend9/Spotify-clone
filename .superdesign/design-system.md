# HayKasa interface system

The requested reference is Spotify desktop/web first, followed by mobile. The application keeps the HayKasa name, logo and existing music providers. This supersedes the earlier cyan/navy presentation.

## Shared workspace

Desktop uses a full-width 64px toolbar above rounded, independently scrolling library and content panels. A Now playing panel can open at wide desktop sizes. The transport remains visible along the bottom, including a disabled empty state before selecting music. Sidebar and Now playing widths remain resizable.

Mobile uses the existing Home/Search/Library/Create tab bar, compact playback and a navigation drawer. Home puts its avatar and filters inside the feed. Search results stack vertically. Respect safe areas, touch targets, reduced motion and keyboard navigation.

## Appearance

- Canvas and transport: #000000.
- Main panels: #121212.
- Raised surfaces: #1f1f1f; hover/menu surfaces: #282828.
- Primary text: #ffffff; secondary text: #b3b3b3.
- Default accent: #1ed760 with black foreground. Saved custom appearance profiles continue to apply.
- Active filter chips: white with black text.
- Media art: 4–6px corners. Cards use a subtle hover fill rather than borders, glow or perspective.
- Interface typography: Arial/Helvetica/system sans-serif, bold headings and tabular player times.
- Desktop playback has a white play control; artwork play actions use the accent.
- High-contrast and reduced-motion choices remain supported.

## Working flows

Home uses eight shortcuts, Jump back in and music shelves. Made for you leads guests to sign in instead of presenting an unavailable content type. Search has a Top result and compact song rows with real play/queue actions. Full-page and sidebar libraries have search, pinned-first sorting and account-scoped local view preferences. Account menus reuse the keyboard-accessible item-menu primitive.

Owners can edit playlist name, optional description and cover in one authenticated API mutation. Existing collaborator, visibility, likes, playlist/song actions, lyrics, queue editing and Jam flows remain connected to their existing APIs. Repeat cycles off, queue, then one.

## Boundaries

Keep HayKasa branding. Do not introduce decorative controls with no behavior, advertise unavailable downloads or invent Spotify Connect or podcast service support. Unlabelled explicit lyrics remain undetectable by metadata filters.

The implementation is a music-interface parity pass. Pixel-level fidelity needs browser comparison against a concrete Spotify reference; CI compilation cannot establish it.
