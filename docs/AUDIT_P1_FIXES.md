# P1 audit fixes

Source baseline: `bc08e0f59a893c88a4745b75af47daa9f9ff5cec`.

## Changes

- Type checking first runs `next typegen`, so a clean checkout has the Next and CSS module declarations plus generated route validation before `tsc`.
- Play next computes the current track index after removing the requested track. Regression tests exercise earlier/later/current/new tracks and paused playback.
- Google requires an explicitly verified email and stable provider subject. It refuses unverified pre-registered accounts and does not silently link existing password accounts. New Google accounts pin the subject; verified legacy accounts without passwords can pin it conditionally. Previously password-linked users without a stored subject must use credentials; an explicit authenticated provider-linking UI remains future work.
- Discord initiation and exchange require a fresh application session and trusted origin. An exchange nonce is hashed in MongoDB, expires after five minutes, is bound to the user's current session version, and is consumed atomically. Responses containing tokens are not cached. This is an application exchange nonce: Discord RPC AUTHORIZE returns a code, not a provider-echoed OAuth state (https://docs.discord.com/developers/topics/rpc#authorize).
- Jam rooms and membership are created on the server, with authenticated user IDs defining roles. Host-only sync/end/accept events are authorized on the server. Guest members retain enqueue permission. Events carry an ECDSA P-256 server signature verified in the browser; unsigned realtime presence, tampering, replay, other-room and other-event envelopes are rejected. Supabase continues to transport broadcasts; it is not the source of identity. Rooms expire after 30 seconds without a host message and admit at most 50 account identities.
- The YouTube mock replaces the mounting element with an iframe and removes it on destruction, matching the lifecycle expected by the playback test.

## Validation and release conditions

Local Node 22: unit tests, lint, typecheck and production build have run successfully during implementation. Production dependency audit reported zero vulnerabilities. Consult the PR's latest CI for the final commit status.

Local source was materialized through the GitHub connector with each file checked against its Git blob SHA. Unavailable binary/static assets were not substituted. The remote change is built from the original complete Git tree, preserving those assets.

Browser installation in this runtime returned invalid/truncated Chrome ZIP archives, so local browser E2E completion has not been established. Real Google/Discord authorization and a two-client Jam session with the deployed MongoDB/Supabase configuration still require validation. Do not interpret unit fixtures as evidence that these providers were exercised.

Before release, verify the `user.googleSubject` sparse unique index and `jamRooms` code uniqueness / expiration indexes in the actual database. Deploying the new protocol ends compatibility with legacy unsigned Jam rooms: all participants must refresh and create a new room. Server event signing adds an authenticated API request per outgoing realtime event; measure room latency and request load before expanding use. Broadcast contents are signed, not encrypted; private-channel access policy remains a separate Supabase configuration concern.

This patch does not complete the remaining P2 work: player responsibility split, responsive/theme consolidation, pagination and measured database changes, session-cache limits, shared lyrics caching, cross-device email retry handling, and dead-code cleanup. It also does not configure repository branch protection or Vercel release gating.
