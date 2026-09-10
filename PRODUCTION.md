# Production deployment checklist

## Before deploying

- [ ] Use Node.js 20 or 22. Do not use Node.js 24 for local production
  builds; native modules used by Next.js can crash on Windows with that
  runtime.
- [ ] Keep `.env.local` local and out of source control. Configure production
  values in Vercel Project Settings instead.
- [ ] Set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to the same canonical HTTPS
  production origin (for example, `https://haykasa.vercel.app`).
- [ ] Generate unique, high-entropy values for `JWT_SECRET` (or
  `NEXTAUTH_SECRET`) and `RATE_LIMIT_SECRET`.

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

## SMTP

- [ ] Set `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, and
  `MAIL_FROM`.
- [ ] Verify the `MAIL_FROM` domain with the SMTP provider and configure SPF,
  DKIM, and DMARC.
- [ ] Confirm these public HTTPS assets are deployed and accessible:
  `/icon-192x192.png` and `/email-light-pillar.png`.
- [ ] Optionally set `MONITORED_INBOX` to receive account-deletion notices.
- [ ] Test signup verification and password reset delivery. Reset links expire
  after 15 minutes.

## Optional integrations

- [ ] Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to enable Google
  sign-in. If either is absent, the Google control stays hidden.
- [ ] Add the canonical NextAuth callback URL to the Google OAuth client:
  `https://<production-domain>/api/auth/callback/google`.
- [ ] Set `YOUTUBE_API_KEY` for official YouTube Data API features.

## Release verification

- [ ] Run `npm run check:deployment` in the production environment before
  promotion. It reports setting names only and does not test network connectivity
  or credential validity. Missing optional integrations produce warnings.
- [ ] Run `npm test` and `npm run test:e2e`. Local browser tests use an existing
  server at `http://localhost:3000` (override with `PLAYWRIGHT_BASE_URL`). CI
  starts the built application on port 3100 in an isolated browser context.
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
- [ ] Verify the production response includes HSTS, CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`, and
  does not include `X-Powered-By`.
- [ ] Exercise login, signup, verification, reset, database writes, YouTube
  search/playback, lyrics, analytics consent, and PWA update behavior.

## Playback verification boundaries

Browser regression tests use synthetic sessions and block YouTube requests.
They verify paused queue restoration, account separation and manual chunk-error
recovery, not provider decoding, real authentication or screen-off playback.
Test those separately on physical iOS and Android devices and desktop browsers.
Queue snapshots are local, account-scoped metadata, expire after 30 days, and
contain at most 200 tracks. Private sessions and active Jams are not saved.
Browser storage is not encrypted account storage; clear site data on shared
devices. Saved positions update approximately every five playback seconds.

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
