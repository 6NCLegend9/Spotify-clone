# Playlist creation and presentation follow-up

Creating from the sidebar, full library or Create hub now emits the same owner-scoped library event. The event carries the server-created playlist, so the sidebar inserts it immediately and then refreshes from the API. Successful creation closes the mobile drawer and opens the new playlist. Rejected requests retain the form and never add a phantom playlist. Duplicate submissions are blocked; responses arriving after account changes or unmount do not navigate or expose the previous account’s playlist.

The signed-in sidebar has a permanent Liked Songs entry and no longer displays the contradictory “No playlists yet” card. Playlist filtering controls appear when custom playlists exist. Guests retain the signup prompt.

The creation dialog uses a responsive centered panel with a name, optional cover and collapsed genre/autofill options. Enter submits the form. Playlist pages use larger artwork and title, a gradient header, compact controls and no unavailable owner controls in Liked Songs. Empty collections show a simple Find songs action instead of an empty table and boxed placeholder. Mobile track rows hide numbering and reserve space for both actions; desktop rows retain album, date and duration columns. Row heights retain the virtualization contract.

## Automated verification

Run `node docs/qa/pr28-playlists/check.cjs` and `npm run check` from the repository root. The focused harness transpiles and executes the actual creation/sidebar components with synthetic hook, session, router and API adapters. It checks success, failed creation, duplicate submission, account change, unmount, immediate sidebar insertion, owner-scoped events and duplicate events. These are component logic checks, not browser or database integration tests.

## Interactive checks still required

1. At phone and desktop widths, create through each entry point, with and without cover/genre/autofill. Confirm the new detail page opens, the drawer closes and the sidebar contains the playlist without an empty card.
2. Refresh and verify the playlist persists. Repeat with Liked Songs only; there should be no empty-playlist sidebar card.
3. Reject a create request and retry; confirm the name/cover remain and no phantom item appears.
4. View an empty playlist, an empty Liked Songs collection and a populated playlist. Check artwork/title, Find songs, track action alignment and scrolling. Check a long name and keyboard focus/Enter/Escape.
5. Edit the title/cover, add songs and remove a playlist; confirm library refresh and existing owner/collaborator behavior.

Playwright’s browser executable is absent in this workspace. Screenshot/layout and live authenticated persistence checks were not performed; no production traffic or deployment was used.
