# Artist links and search navigation

Collaborations such as `BigXthaPlug, Ro$ama, Yung Hood, Murdagang PB` now render separate artist credits and links, including credits restored from older playback snapshots. A channel ID is attached only to its matching artist, never copied across the entire collaboration. Ampersands, `and`, and slashes remain part of artist/band names.

Name-based artist links resolve the matching channel and navigate directly, without the previous channel chooser. Matching prefers the artist's own channel over duplicate Topic/VEVO labels and recognizes spacing, case and dollar-sign styling. Missing matches show a retry/search state instead of sending the listener to an unrelated channel.

Submitting an artist name in the main search field looks for that channel and opens it directly. Queries without an artist match retain music search. Explicit artist-search results also navigate to the matching artist. Editing the input, starting a new search, playing a suggestion, changing routes or unmounting cancels stale navigation.

Validation: temporary Node assertions exercised the four credits from the screenshot, unique links, restored aggregate credits, preserved `AC/DC` and `Simon & Garfunkel`, main/Topic channel preference, `Ro$ama`/`Rosama` matching and unrelated-query fallback. Lint/type/build verification is recorded in the PR. Browser interaction and real provider-channel identity remain unverified in this workspace; channel IDs come from the provider, not invented mappings. Changes require deployment of PR #28 before appearing on the main site.
