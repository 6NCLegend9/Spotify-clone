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
