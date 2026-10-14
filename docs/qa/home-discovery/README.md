# Homepage discovery variety

Run `node docs/qa/home-discovery/check.cjs` (also included in CI).

Previously the homepage always used the first three taste signals, kept only
eight top search hits per signal, concatenated those groups, and displayed the
same recordings again in genre rows. Follow lists could permanently hide newer
listening/search signals. The guest response was also cached at the CDN.

The route now rotates up to three signals across saved genres, follows, listening,
and newest searches. Each search contributes up to 32 candidates; per-query
caches reuse provider results across seed combinations. Selection prioritizes
unseen tracks, balances artists, and deduplicates recording identities across
the discovery rows. Recently played recordings and feedback/explicit filters
remain excluded. Guest charts supply up to 50 candidates. Final responses use
private/no-store caching while provider searches remain cached.

Home offers a Refresh control. The account-scoped existing session cache retains
at most 96 displayed video IDs for up to 24 hours, sent as bounded soft exclusions
on subsequent requests. Exhausted catalogs can reuse seen tracks to avoid an empty
feed. No impressions are read or written during a private session. Existing
account-cache cleanup removes impressions at sign-out; no additional persistent
profile fields or database writes are introduced.

Offline integration checks execute the real selection utilities, API GET handler,
and home-feed hook with synthetic account/provider/browser boundaries. They cover
signal rotation, recent search priority, private-session exclusion, artist
balance, refresh novelty, duplicate recordings/rows, sparse pools, bounded IDs,
candidate cache reuse, history/feedback exclusions, request limits, account
switches, and private-session storage. External YouTube availability and an actual
signed-in browser session are separate from these isolated checks.
