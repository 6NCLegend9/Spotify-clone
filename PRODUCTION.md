# Production deployment checklist

## Before deploying

- [ ] Use Node.js 20 or 22. Do not use Node.js 24 for local production
  builds; native modules used by Next.js can crash on Windows with that
  runtime.
- [ ] Keep `.env.local` local and out of source control. Configure production
  values in Vercel Project Settings instead.
- [ ] Set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to the exact canonical HTTPS
  production origin: `https://haykasa.vercel.app`.
- [ ] Generate unique, high-entropy values for `JWT_SECRET` (or
  `NEXTAUTH_SECRET`) and `RATE_LIMIT_SECRET`.

## Authentication origin contract

- Production has one authenticated origin: `https://haykasa.vercel.app`.
  Configure every old Vercel deployment alias to redirect browser navigation to
  that host. The application also redirects the known legacy alias, but Vercel
  domain configuration remains the first line of defense.
- Local development is separate. Set both URL variables to the same loopback
  origin and actual port, such as `http://localhost:3003`. Never use the
  production HTTPS URL while running a local HTTP server; NextAuth would select
  secure cookie names that local browsers reject.
- Chrome, Edge, Firefox, Safari, mobile browsers, and installed PWAs all use the
  same relative APIs. They do not require CORS entries. Do not add wildcard
  credentialed CORS, `SameSite=None`, reflected origins, or shared cookies
  between domains. Each browser keeps and authenticates its own cookie store.
- Keep `connect-src 'self'`. Cookie-authenticated mutations reject missing and
  foreign `Origin` headers against the explicit canonical/loopback trust set.
- Preserve the existing production `JWT_SECRET`/`NEXTAUTH_SECRET` during this
  rollout. Rotating it is a separate incident-response action that signs out all
  existing sessions.

## Account security rollout

- Deploy token issuance and validation together. Existing cookies without an
  immutable account ID and `sessionVersion` will require one new login.
- Existing users without a stored version default to zero. No live database
  migration was run for this change. Password resets and Settings > Sign out all
  devices atomically increment that version; old tokens fail their next server
  validation. This does not remotely stop audio already buffered on another device.
- The all-devices action requires an explicit confirmation and a matching request
  Origin. Verify the public request origin is preserved by the deployment proxy.
- Retire previews using the old email-only token validator. Rolling back to that
  validator would bypass version revocation; require a separate session-secret
  rotation plan before such a rollback.
- Home, history, sidebar and library caches now use account identity. Legacy
  ownerless history is discarded rather than assigned to the next listener.
  Volume, caption and keyboard preferences remain device preferences during an
  account switch. Browser caches are not encrypted storage.
- Library listing, playlist detail and likes enforce current visibility. A saved
  like does not grant access after a public playlist becomes private.

## MongoDB Atlas

- [ ] Set `MONGODB_URL` or `MONGODB_URI`, plus `DB_NAME` when the database name
  is not included in the connection string.
- [ ] Create a least-privilege Atlas database user for the production database.
- [ ] Configure Atlas Network Access so Vercel functions can connect. Avoid
  broad access where a fixed egress option is available.
- [ ] Confirm the Atlas deployment region is close to the Vercel function
  region.
- [ ] Size `MONGODB_MAX_POOL_SIZE` for the number of application instances and
  Atlas connection limits. The default is 5 (valid override: 1-100), allowing
  concurrent account reads without the previous one-connection queue. Clients
  remain shared per process and idle connections are released after 10 seconds.
  Monitor pool checkout wait time and Atlas connection counts before increasing
  the cap. Restart running processes after changing connection settings.

## Library and privacy rollout

- [ ] Confirm a replica set or sharded deployment that supports multi-document
  transactions. Playlist create/delete, playlist likes and account deletion now
  update their associated records in one transaction. Standalone MongoDB is not
  sufficient; do not silently fall back to partial writes.
- [ ] Inspect representative existing records before deployment. Playlist songs
  are validated YouTube ID strings capped at 500; favourites are capped at 500.
  No historical records were migrated or indexes created by this implementation.
  Export and review legacy mixed-format or oversized records before migration.
- [ ] Test simultaneous edits against staging: different favourite IDs, duplicate
  additions, remove/add and the last playlist slot. Conditional writes compare the
  version and changed fields and retry at most five times; unresolved contention
  returns `409`, not an overwritten list.
- [ ] Inject failure into test-environment deletion/creation to confirm rollback.
  Local model fixtures do not prove live transaction configuration or capacity.
- [ ] Account deletion requires same-origin JSON `{ "confirm": "DELETE" }` and
  removes owned data plus collaborator/like references. Export format version 2
  includes owned preferences and activity, not credentials or other listeners'
  collaborator/like identities.
- [ ] Insights are off by default. They retain at most 1,000 observations, show
  the last 30 days, and prune older observations on the next event write. Inactive
  accounts can retain older entries until a write, clear, opt-out or deletion.
  This is not a background TTL purge. Confirm the separate backup retention policy.
- [ ] Verify opt-out deletes observations, private mode prevents new writes, and
  repeated event IDs count once. Observed minutes exclude seeks/stalls and long
  sampling gaps; they are not total lifetime listening.
- [ ] New snoozes expire after seven days. Legacy snoozes without dates remain
  restorable exclusions; no historical expiry dates were invented.

## SMTP

- [ ] Set `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, and
  `MAIL_FROM`.
- [ ] Verify the `MAIL_FROM` domain with the SMTP provider and configure SPF,
  DKIM, and DMARC.
- [ ] Confirm these public HTTPS assets are deployed and accessible:
  `/icon-192x192.png` and `/email-light-pillar.png`.
- [ ] Optionally set `MONITORED_INBOX` to receive account-deletion notices.
- [ ] Test signup verification and password reset delivery. Reset links expire
  after 15 minutes. Verify a reset also rejects a previously issued session.
- [ ] Confirm verification and reset links start with
  `https://haykasa.vercel.app` and contain only a random one-time token. Opening
  a verification link must not change the account until the user presses
  **Verify email**; mail scanners and prefetchers may perform GET requests.
- [ ] There is no email-provider allow-list. “Accept all emails” means ordinary
  valid public addresses, subdomains, mixed case, and plus-addressing are
  accepted regardless of provider. Inbox delivery still requires a verified
  sender domain, healthy SMTP credentials and reputation, plus SPF, DKIM, and
  DMARC alignment.

## Optional integrations

- [ ] Google sign-in remains disabled by `GOOGLE_SIGN_IN_ENABLED` in
  `src/utils/siteConfig.js`. Enabling it requires a separate change and both
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; credentials alone do not enable it.
- [ ] Add the canonical NextAuth callback URL to the Google OAuth client:
  `https://<production-domain>/api/auth/callback/google`.
- [ ] Set `YOUTUBE_API_KEY` for official YouTube Data API features.

## Release verification

- [ ] Run `npm run audit:production`. CI rejects high/critical production
  advisories. Also review `npm audit` for development/build-tool advisories.
- [ ] Run `npm run check` for unit/handler tests, lint, type checks and the build.
- [ ] Run `npm run check:deployment` in the production environment before
  promotion. It reports setting names only and does not test network connectivity
  or credential validity. Missing optional integrations produce warnings.
- [ ] Run `npm test` and `npm run test:e2e`. Local browser tests use an existing
  server at `http://localhost:3000` (override with `PLAYWRIGHT_BASE_URL`). CI
  starts the built application on port 3100 in an isolated browser context.
  The auth matrix runs on Chromium, Firefox, WebKit, mobile Chrome, and mobile
  Safari using local request fixtures; it does not call the live website.
- [ ] To build locally without touching a running dev server's `.next` output,
  set `NEXT_BUILD_DIR=.next-check` and `DISABLE_PWA=1` for that build only.
  CI runs the normal PWA-enabled production build.
- [ ] Promote a verified preview to production; retain the previous deployment
  for rollback. Roll back the deployment if auth or playback smoke checks fail.
  Database migrations require a separate reviewed rollback plan.

- [ ] Run `npm run lint` and `npm run build` with production-like environment
  variables on Node.js 20 or 22. GitHub Actions CI uses Node 22.
- [ ] Confirm `/api/auth/providers` contains only configured providers.
- [ ] Confirm API and auth responses are not served from the service-worker
  cache.
- [ ] Confirm `/login` preserves a safe same-origin return path, an unverified
  account shows verification guidance, and a credentials `401` displays the
  matching public reason instead of being treated as a transport failure.
- [ ] Verify the production response includes HSTS, CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`, and
  does not include `X-Powered-By`.
- [ ] Exercise login, signup, verification, reset, database writes, YouTube
  search/playback, lyrics, session revocation, and PWA update behavior.
- [ ] Run `npm run benchmark:production` after building. For isolated output,
  set `NEXT_BUILD_DIR=.next-check`. The runner allocates and cleans up its own
  loopback server. `node scripts/benchmark-dev.mjs --production --browser` also
  runs the browser suite against that server.
- [ ] Review `artifacts/performance.json`: build ID, commit, dirty-worktree flag,
  raw server timings and synthetic navigation samples. CI uploads it by commit.
  Establish repeated staging/field baselines before setting regression thresholds;
  the local report is evidence, not a production latency guarantee.

## Dependency maintenance

The 2026-09-10 security pass resolved Next.js/tooling to 15.5.25 and Nodemailer
to 9.1.1. Targeted transitive updates cleared the reported audit findings.
`npm audit` reported zero findings after installation; this is not a guarantee
against unknown vulnerabilities or a substitute for future audits.

Scoped overrides in `package.json` address pinned upstream dependencies:

- Next.js uses the application's patched PostCSS and Sharp versions.
- The PWA builder's Terser plugin uses serialize-javascript 7.0.5. Its Node 20+
  requirement matches the supported runtime; a PWA-enabled build was verified.
- NextAuth's optional Nodemailer peer uses the application's patched mailer.
  No NextAuth email provider is enabled. Its credential/token callbacks and local
  SMTP message generation were tested; live OAuth and SMTP delivery still need
  staging verification before changing provider configuration.

Remove overrides only when upstream ranges cover safe versions and the same
build, authentication and PWA checks pass. Stop local Next processes before
replacing framework dependencies, then start a fresh process.

## Playback verification boundaries

Browser regression tests use synthetic sessions and block YouTube requests.
They verify paused queue restoration, account separation and manual chunk-error
recovery, not provider decoding, live database authentication or screen-off playback.
Unit tests exercise the real auth callbacks and route handlers with model/token
fixtures, including reset replay, version revocation and playlist access changes.
They do not prove live database concurrency or exercise the Google OAuth exchange.
Most browser tests expose service workers as unavailable so API fixtures stay
isolated. A separate worker-enabled test verifies production registration and
that account API responses are not cached. Set `PLAYWRIGHT_PWA=1` when running
that test against a local PWA-enabled build; CI enables it automatically.
Test those separately on physical iOS and Android devices and desktop browsers.
Queue snapshots are local, account-scoped metadata, expire after 30 days, and
contain at most 200 tracks. Private sessions and active Jams are not saved.
Browser storage is not encrypted account storage; clear site data on shared
devices. Saved positions update approximately every five playback seconds.

Queue editing changes upcoming tracks only and preserves the current media host.
Undo expires after ten seconds and invalidates on another queue mutation or
track/account change. Clearing upcoming tracks prevents automatic refill during
the current player session. Saving the queue creates a private playlist. Jam
guests cannot reorder host playback; host edits reuse Jam's existing broadcast.
Validate two-device Jam synchronization separately.

Sleep timers offer 15/30/60 minutes or the end of the selected track. They are
tab-local, survive refresh via session storage and are disabled during Jams.
Account changes drop the prior owner's timer; skipping cancels end-of-track mode.
The deadline is checked again on return or Play. An exact stop while the OS has
suspended JavaScript cannot be guaranteed. Native Play resumes its audio context
through an explicit playback action, not a hidden-page keepalive.

## Support and operations

Settings > Support diagnostics previews/downloads/clears the last 100 allowlisted
in-memory technical events. Nothing is uploaded to a reporting service. Reloads
and account changes clear it. Query strings, account IDs, track titles, tokens,
arbitrary exception text and request bodies are omitted. Server errors include an
`X-Request-Id` matching their redacted log. `SERVER_DIAGNOSTICS=1` optionally logs
session-lookup/provider durations to existing stdout. Configure log access and
retention in hosting; no third-party analytics or cloud resource was installed.

Record build/version, browser/OS, tab versus installed app, source type, steps,
expected/actual behavior and a reviewed diagnostic report for incidents. Use
`.github/ISSUE_TEMPLATE/bug_report.yml`. Never request passwords, tokens, API keys
or private playlist links. Turn reproducible incidents into focused regressions.

Before promotion, use synthetic accounts in a dedicated staging database for the
auth/privacy/transaction matrix. Restore a backup into a separate approved test
database and verify ownership/references. Rehearse deployment rollback; reverting
session-version validation changes security semantics. These live infrastructure
drills have not been executed locally.

Browser fixtures verify current PWA registration and API NetworkOnly behavior,
not an upgrade from an older deployment. Stage an old-to-new worker update while
playing; confirm there is no forced reload, then check assets and auth. Physical
iOS/Android lock-screen, headset, VoiceOver/TalkBack and battery checks remain
necessary. Viewport emulation is not physical-device certification.

## API additions

| Endpoint | Contract |
| --- | --- |
| `POST /api/favourite` | `{ id, liked: boolean }` sets membership; omitted `liked` retains legacy toggle behavior. |
| `POST /api/userPlaylists/like` | `{ playlistId, liked: boolean }` changes both relationship records transactionally. |
| `POST /api/userPlaylists` | Optional `songs`: up to 500 valid IDs; deduplicated and private by default. |
| `POST`/`DELETE /api/userPlaylists/songs` | `{ playlistID, song }` applies idempotent membership with permission/limit checks. |
| `GET`/`POST`/`DELETE /api/notInterested` | Read hidden IDs, hide `{ id }`, or restore `{ id }`. |
| `GET`/`POST`/`DELETE /api/snoozedTracks` | Read active IDs, snooze `{ id }` for seven days, or restore `{ id }`. |
| `GET /api/youtube-search` | `q`, `type=video/channel/playlist`, `order=relevance/date`, video `duration=any/short/medium/long`, optional `pageToken`; returns `results` and `nextPageToken`. |
| `GET /api/playEvent` | `days=7/30`: private retained insight summary and `enabled`. |
| `POST /api/playEvent` | Legacy `{ id, event }` remains feedback. Insight observations require owner, UUID `eventId`, `startedAt`, observed `listenedSeconds` and opt-in. |
| `DELETE /api/playEvent` | Clears the current account's saved observations. |

Newest/duration filters and continuation require the official provider. When it
is unavailable, they return an explicit error instead of ignoring the choice.
Basic relevance can use the existing fallback. Search choices persist in the URL;
extras remain on-demand. Search result pages are `noindex`; the sitemap contains
durable public pages without artificial `lastModified` dates. Robots is not auth.

## Loading measurements

Development now uses `npm run dev` (Turbopack); `npm run dev:webpack` retains the
previous compiler. Restart the process to switch. See `docs/PERFORMANCE_REVIEW.md`
for compiler comparisons, the 167-role review dispositions and known limitations.
`npm run benchmark:dev` measures an isolated dev server and cleans it up afterward.

Use `npm run build` followed by `npm start` to evaluate production loading.
`npm run dev` compiles routes and API handlers on first use; those compilation
times are not production chunk transfer times. The isolated `.next-check` build
must also be started with `NEXT_BUILD_DIR=.next-check` and `DISABLE_PWA=1`.

Local checks on 2026-09-10 found:

- Twelve concurrent read-only MongoDB pings took about 2.72 seconds with a
  one-connection pool versus 0.69 seconds with five after warming. The first
  five-connection batch took 3.14 seconds while connections opened. This isolates
  pool queueing; it is not an end-to-end API latency guarantee.
- Production search returned in 17ms with DOMContentLoaded at 67ms on localhost.
  Network, database region, browser cache and device speed affect real results.
- Home first-load JS remains 167kB in Next's build report. The player is still
  deferred until a track is selected, but its YouTube engine now loads in the
  same async bundle, removing one serial import. Optional Three.js, Supabase and
  tagging chunks were absent from the observed initial search downloads.
- YouTube playback no longer performs the native player's redundant favourites
  request. The browser test checks one successful favourites read through expansion.
