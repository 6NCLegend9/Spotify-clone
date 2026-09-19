# HayKasa

HayKasa is a responsive music discovery and playback application with search, playlists, favourites, queue management, and YouTube-backed playback.

## Requirements

- Node.js 22 (Node.js 20.9 or newer is supported; Node.js 24 is not yet supported)
- npm
- MongoDB
- SMTP credentials for account email flows

## Local setup

1. Clone the repository and install the locked dependencies.

   ```sh
   git clone https://github.com/6NCLegend9/Spotify-clone.git
   cd Spotify-clone
   npm ci
   ```

2. Copy the environment template and fill in the required values.

   ```sh
   cp .env.example .env.local
   ```

   At minimum, configure the MongoDB, authentication, and mail variables documented in `.env.example`. Keep both local URL variables on the same loopback origin:

   ```dotenv
   NEXTAUTH_URL=http://localhost:3000
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   Google sign-in, YouTube search, Discord presence, and Supabase Jam support are optional integrations and require their corresponding variables.

3. Start the development server.

   ```sh
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Verification

Run the static, unit, and production-build checks:

```sh
npm run check
```

Install a browser once, then run the Chromium end-to-end suite:

```sh
npx playwright install chromium
npm run test:e2e -- --project=chromium-desktop
```

The full CI workflow also runs Firefox, WebKit, mobile browser projects, a production dependency audit, and the production performance benchmark.

## Production

Production configuration, deployment checks, and operational notes are documented in [PRODUCTION.md](./PRODUCTION.md). Deployments must use HTTPS; `DISABLE_HTTPS_UPGRADE=1` is reserved for local CI servers that intentionally run over HTTP.
