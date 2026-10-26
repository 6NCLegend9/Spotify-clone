# HayKasa

**Music discovery, personal libraries, and queue-based playback across web, Windows, and Android.**

[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](./package.json)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](./package.json)
[![Windows Desktop](https://img.shields.io/badge/Windows-Electron-47848F?logo=electron&logoColor=white)](./desktop/README.md)
[![Android Preview](https://img.shields.io/badge/Android-Preview-3DDC84?logo=android&logoColor=white)](./android/README.md)
[![CI](https://github.com/6NCLegend9/Spotify-clone/actions/workflows/ci.yml/badge.svg)](https://github.com/6NCLegend9/Spotify-clone/actions/workflows/ci.yml)

[Open HayKasa](https://haykasa.vercel.app) · [Downloads and releases](https://github.com/6NCLegend9/Spotify-clone/releases) · [Quick start](#quick-start) · [Architecture](#architecture) · [Documentation](#documentation) · [Contributing](#contributing)

![HayKasa banner](./src/assets/HayKasa-banner-removebg.png)

## Purpose and vision

HayKasa helps listeners organize music and discover something new from one shared application. It combines search, saved libraries, familiar recommendations, exploration, and listening together through Jam sessions.

The project is for listeners using browsers or installed apps, and developers contributing to a shared web product with native integrations. Its approach keeps accounts and libraries in the same backend while Windows and Android add operating-system controls. The repository is named `Spotify-clone`; the application is branded **HayKasa**.

## Key features

- **Search and discovery:** song, artist, and playlist results; suggestions, filters, pagination, and individual artist-channel links. Submitting a query opens the search index.
- **Personalized home:** familiar recommendations balanced with exploration, using favorite genres/artists and listening/search activity, with deduplication across sections.
- **Queue controls:** play next, append, reorder, remove, shuffle, repeat, and saved playback snapshots.
- **Personal library:** liked songs, playlists, collaborators, public/private visibility, followed artists, and listening history.
- **Lyrics and captions:** timed text associated with the active track when available from the provider.
- **Jam sessions:** shared listening, host/guest controls, QR/link invitations, and server-authorized realtime events.
- **Responsive interface:** desktop library/player panels, mobile navigation, keyboard controls, and accessibility preferences.
- **Native integration:** Windows tray, media controls, Discord presence, and updater; Android Media3 audio service, lock-screen controls, safe screen insets, and Play Store update prompts.

## Platform status and playback limits

| Platform or component | Current behavior and limits |
| --- | --- |
| **Web / PWA** | Primary application. Embedded YouTube remains a playback path and is subject to provider restrictions. Installing the PWA does not guarantee background playback on phones. |
| **Windows desktop** | Electron loads the production website. Native updates require a complete, authenticated release bundle and valid Windows code signing. Web deployment alone does not update Electron or its native integrations. |
| **Android preview** | This checkout declares **1.0.3 / version code 4**, Android 6.0+. The standard APK loads the production website, including when downloaded from a local site. Public APKs may be older. Website changes require deployment; Java/service changes require a new binary. |
| **Source audio / yt-dlp** | Implemented as an optional authenticated path for web, desktop, and Android. Production source playback remains disabled in the latest recorded verification; hosted extraction encountered `source_access_restricted`. Storage or range-delivery success does not prove playable live audio. |

Android's service can play a successfully resolved, completed audio asset outside the WebView. Next/previous queue advancement and source renewal still depend on JavaScript; a fully native background queue is unfinished. Native EQ, normalization, and mono processing are also unfinished. The embedded fallback remains a foreground path.

**PR42 is a draft migration.** Ordered Android transport is implemented with recorded fixture and CI evidence, but removing YouTube integrations, proving repeated deployed source access, native queue ownership, streaming during extraction, and the full DSP design remain incomplete. Consult the [requirements checklist](./docs/superpowers/plans/2026-10-24-ytdlp-migration.md), [transport implementation evidence](./docs/qa/ytdlp-migration/D06-IMPLEMENTATION.md), and dated [hosted verification results](./docs/qa/vercel-media/RESULTS.md). Physical-device audio and Safari EQ qualification remain separate requirements.

## Quick start

### 1. Install prerequisites

- **Node.js 22.x and npm**, matching [package.json](./package.json), [.nvmrc](./.nvmrc), and CI.
- **Git** to clone the repository.
- **MongoDB with transaction support:** use a development Atlas database, replica set, or supported sharded deployment. Playlist/account operations use transactions; a standalone MongoDB server is insufficient.
- **SMTP credentials** for signup verification and password reset. Email/password login requires a verified account; Google sign-in is currently disabled in [siteConfig.js](./src/utils/siteConfig.js).

Use a development database and mail configuration. Optional integrations are listed below.

### 2. Clone and configure

```bash
git clone https://github.com/6NCLegend9/Spotify-clone.git
cd Spotify-clone
npm ci
cp .env.example .env.local
```

In Windows PowerShell, use `Copy-Item .env.example .env.local` for the copy step. The tracked [.env.example](./.env.example) starts with production URLs: **replace them before running locally**.

Edit `.env.local` with your development values:

```dotenv
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_CLUSTER/haykasa_dev
JWT_SECRET=YOUR_GENERATED_AUTH_SECRET
NEXTAUTH_SECRET=YOUR_GENERATED_AUTH_SECRET
RATE_LIMIT_SECRET=YOUR_SEPARATE_GENERATED_RATE_LIMIT_SECRET
MAIL_HOST=YOUR_SMTP_HOST
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=YOUR_SMTP_USER
MAIL_PASS=YOUR_SMTP_PASSWORD
MAIL_FROM="HayKasa <YOUR_VERIFIED_SENDER_EMAIL>"
```

Replace every `YOUR_*` placeholder. Generate a random secret with this command, run it again for an independent rate-limit secret, and store the results only in your local configuration:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use the same auth value for `JWT_SECRET` and `NEXTAUTH_SECRET`. Both app URLs must match the actual origin, including host and port. Set either `MONGODB_URI` or `MONGODB_URL`; if both are populated, `MONGODB_URL` takes precedence. Use `DB_NAME` if the URI does not select the intended database. Adjust SMTP port/TLS settings for your provider.

### 3. Start the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Configure working MongoDB and SMTP before testing signup, email verification, password reset, or library writes. Restart the development server after changing environment variables.

### Optional integrations

| Integration | Configuration and prerequisites |
| --- | --- |
| Official YouTube Data API | Server-only `YOUTUBE_API_KEY`. The current catalog also has a no-key fallback; availability depends on upstream access. |
| Jam | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, with the matching Supabase project configuration. |
| Source audio | Server-side media credentials, storage, and a qualified extraction/delivery environment. Follow the [media service guide](./media-service/README.md) and [Vercel guide](./docs/qa/vercel-media/README.md). |
| Discord presence | Desktop integration and Discord application configuration; see the [desktop guide](./desktop/README.md). |

Keep private credentials out of `NEXT_PUBLIC_*` variables, Git, screenshots, and logs. Supabase's public client key does not replace server authorization. Google OAuth credentials alone do not enable the disabled sign-in feature.

## Usage and examples

### Use the interface

1. Open **Search**, enter a song or artist, and submit to see results. Select an artist result or individual artist link to open that channel.
2. Sign up, verify your email, and sign in to save likes and playlists in **Your Library**.
3. Use a track's menu to **Play next**, **Add to queue**, or **Add to playlist**. Open the queue panel to manage upcoming tracks.
4. Set favorite genres/artists to influence Home; listening and search activity provide additional recommendation signals.
5. Open **Settings** for playback preferences and platform downloads. Jam requires its realtime integration to be configured.

### Inspect local endpoints

These read-only examples target your local server. Search depends on provider access and rate limits:

```bash
curl --get 'http://localhost:3000/api/youtube-search' \
  --data-urlencode 'q=2Pac' \
  --data-urlencode 'type=video'
```

Check whether the current client is eligible for source playback:

```bash
curl 'http://localhost:3000/api/media/resolve'
```

An unconfigured service reports `service_unconfigured`; a configured but disabled internal service reports `service_disabled`. An enabled service requires an authenticated session. Neither an enabled capability response nor metadata establishes successful extraction or decoded audio.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Web interface | Next.js 15 App Router, React 18, Tailwind CSS, Framer Motion |
| Client state | Redux Toolkit, Redux Persist |
| Authentication and persistence | NextAuth credentials/session handling, bcrypt, MongoDB, Mongoose, SMTP |
| Discovery and playback | YouTube APIs / `youtubei.js`, embedded player, browser media APIs and Web Audio |
| Optional source service | Python / FastAPI, yt-dlp, FFmpeg, private Vercel Blob or standalone Docker |
| Realtime | Supabase Realtime with server-signed Jam events |
| Windows | Electron, electron-builder, electron-updater |
| Android | Java, WebView, AndroidX Media3, Google Play in-app updates, Gradle |
| Checks and delivery | ESLint, TypeScript, browser/native fixtures, GitHub Actions, Vercel, GitHub Releases |

Exact dependency declarations and pins live in [package.json](./package.json), [desktop/package.json](./desktop/package.json), [Android build configuration](./android/app/build.gradle), and [media-service requirements](./media-service/requirements.txt).

## Architecture

```mermaid
flowchart LR
    Browser["Browser / PWA"] --> App["Next.js + React"]
    Desktop["Electron shell"] --> App
    Android["Android WebView"] --> App
    App --> API["Next.js API routes"]
    App --> Player["Shared player controller"]
    API --> DB["MongoDB"]
    API --> Catalog["YouTube catalog"]
    API --> Jam["Supabase Realtime"]
    API --> Media["Optional yt-dlp / FFmpeg service"]
    Media --> Assets["Completed assets / signed byte ranges"]
    Assets --> Player
    Player --> WebOutput["Browser media / embedded player"]
    Player --> Native["Android Media3 service"]
```

- **UI and state:** App Router pages and React components consume APIs; Redux holds player/queue state, with local snapshots for recovery. MongoDB holds account-owned libraries and activity.
- **Playback:** the shared controller selects the embedded provider or resolves a source asset through `/api/media/resolve`. The media service prepares complete files and issues signed delivery URLs. Current completed-file delivery is not streaming during extraction.
- **Android boundary:** trusted-origin WebView messages reach `MainActivity`, the ordered bridge, and `PlaybackService`. The service separates play intent, command acknowledgements, and observed playback. Older APKs retain a legacy path; they do not gain native capabilities through a website update.
- **Desktop boundary:** a sandboxed renderer uses a restricted preload API for native controls. Packaged builds load `https://haykasa.vercel.app`; development overrides are restricted to loopback origins.
- **Trust and storage:** APIs validate sessions, origins, and ownership. Job/receipt secrets remain server-side; expiring delivery URLs are private bearer capabilities. Jam publishes authorized signed events.

The source-access feasibility gate must pass before source playback is activated or the working fallback is removed. The [migration map](./docs/qa/ytdlp-migration/README.md) traces affected catalog, player, native, API, persistence, and security components.

## Project structure

```text
Spotify-clone/
├── src/
│   ├── app/                 # App Router pages and API routes
│   ├── components/          # Search, library, Jam, layout, and shared player
│   │   └── MusicPlayer/media/ # Resolver, browser DSP, and Android adapters
│   ├── hooks/               # Player, platform, captions, and UI integrations
│   ├── models/              # Mongoose persistence models
│   ├── redux/               # Client state and persistence integration
│   └── utils/               # Auth, catalog, recommendations, and validation
├── android/                 # WebView shell, Media3 service, and native tests
├── desktop/                 # Electron main/preload, updater, and packaging
├── desktop-bridge/          # Legacy development-only Discord bridge
├── media-service/           # Python extraction, storage, and signed delivery
├── contracts/               # Shared desktop contract source
├── scripts/                 # Development, configuration, and release tooling
├── public/                  # App icons, artwork, and static assets
├── docs/                    # QA evidence, specifications, and requirements
├── .github/workflows/       # Web, native, security, and release pipelines
└── .env.example             # Environment variable template
```

## Platform development

### Windows desktop

Desktop development starts its own renderer at **`http://127.0.0.1:3003`**. Before starting, set both `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` in `.env.local` to that exact origin; the launcher does not change them for you. Use Node.js 22 and run these commands from the repository root:

```powershell
npm run desktop:install
npm run desktop:dev
```

Use `npm run desktop` to launch Electron against the production website. Build and verify Windows packages on Windows:

```powershell
npm run desktop:pack
npm run desktop:build
```

The unpacked application and NSIS installer are written under `desktop/dist/`. Root `npm run build` builds only the web application. Packaging does not publish updates. See [desktop setup and signing](./desktop/README.md).

### Android

Install **JDK 21**, **Android SDK platform 36**, and **build tools 36.0.0**; set `JAVA_HOME` and `ANDROID_HOME` to those installations. From the root:

```bash
npm run android:check
npm run android:build
npm run android:bundle
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`; the release bundle is `android/app/build/outputs/bundle/release/app-release.aab`. Without release-signing configuration the AAB is unsigned and cannot be uploaded to Play. A debug preview uses a separate application ID and is not a Play Store release.

**Download for Android** in Settings selects a validated public preview, which may predate this checkout. Preview APKs require manual installation; Play-installed builds use Play update prompts for published versions. Samsung Auto Blocker may block sideloaded APKs even when signed. See [Android installation and release guidance](./android/README.md), including the Play signing process and emulator-test limits.

## Verification

Run the standard web gate with Node.js 22:

```bash
npm run check
```

This runs ESLint, Next.js type generation, TypeScript checking, and a production build. Use `npm run build` followed by `npm start` to serve the production web build locally; these commands do not publish a deployment.

| Check | Command or workflow |
| --- | --- |
| Production dependency advisories | `npm run audit:production` |
| Android adapter/deck/component regressions | `npm run android:check` |
| Generated desktop contract consistency | `npm run check:desktop-contract` |
| Web and focused regression checks | [CI](./.github/workflows/ci.yml) |
| Authorization, corruption/fuzzing, and media worker fixtures | [Security Regression](./.github/workflows/security-regression.yml) |
| Homepage, search, panels, and player browser scenarios | [Homepage/browser checks](./.github/workflows/home-discovery-vm.yml) |
| Controlled mobile background playback | [Mobile Playback VM](./.github/workflows/mobile-playback-vm.yml) |
| Playlist spacing and duration | [Playlist checks](./.github/workflows/playlist-duration-vm.yml) |
| Android unit/lint/APK/AAB and API 33/36 instrumentation | [Android APK](./.github/workflows/android-ci.yml) |
| Desktop contract and Windows packaging | [Desktop CI](./.github/workflows/desktop-ci.yml), [package CI](./.github/workflows/desktop-package-ci.yml) |
| Actual public downloads | [Windows smoke check](./.github/workflows/desktop-production-smoke.yml), [Android production QA](./.github/workflows/android-production-qa.yml) |

**Match evidence to the claim.** Code inspection, compilation, controlled browser fixtures, CI-reported emulator execution, physical-device behavior, and live source playback are different levels of evidence. Synthetic audio and green CI do not establish hosted extraction, measured live bitrate, audible hardware output, or phone app-switching reliability. Read each report's date, commit, and limits.

## Deployment and updates

Production configuration and smoke checks are documented in [PRODUCTION.md](./PRODUCTION.md). [vercel.json](./vercel.json) defines the Next.js frontend and media container, service binding, and signed-asset routing. Source playback requires qualified extraction, credentials, private storage, and the explicit activation gate.

`npm run check:deployment` validates **production** configuration names and values; it rejects local HTTP origins and does not test credentials or service connectivity. Run it with the intended production configuration, then perform the real smoke checks before promotion.

| Delivery path | Publication requirements |
| --- | --- |
| Web changes | Deploy the web application. Both packaged native shells load the production site. |
| Windows native updates | The [Desktop Release workflow](./.github/workflows/desktop-release.yml) attempts stable releases on `main` and supports manual channels. Stable/beta require signing, authenticated release metadata, installer, `latest.yml`, and blockmap. Internal/preview artifacts do not establish stable updater eligibility. Check setup with `npm run desktop:release:check`. |
| Android preview | [Publish Android Preview](./.github/workflows/android-preview-release.yml) publishes immutable source-SHA previews only after qualifying main builds and emulator checks. Sideloaded previews need manual installation. |
| Android Play release | The protected [Play Store workflow](./.github/workflows/android-play-store.yml) prepares a signed AAB; Play Console submission, approval, and rollout are separate owner actions. Installed store builds can then prompt for available updates. |

Unsigned desktop preview artifacts are available through the [Desktop Preview workflow](./.github/workflows/desktop-preview.yml). Keep the native signing and update trust checks intact. Merging web code is not evidence that a new APK/EXE was published or installed.

## Documentation

This index links every other tracked Markdown document in the repository. Dated reports, plans, and design snapshots record their original scope; they can describe older behavior. Use current code and newer verification results when references differ.

### Setup, platforms, and operations

- [Production configuration, authentication, database, and rollout checklist](./PRODUCTION.md)
- [Android build, installation, native playback, and verification limits](./android/README.md)
- [Windows architecture, security boundary, updater, signing, and release setup](./desktop/README.md)
- [Media service architecture and single-instance Docker setup](./media-service/README.md)
- [Genre system and recommendation configuration](./GENRE_SYSTEM.md)
- [Local DevTools security and performance audit guide](./DEVTOOL_AUDIT_GUIDE.md)
- [QA audit and refactor log](./TODO.md)
- [Legacy development-only Discord bridge](./desktop-bridge/README.md)

### Implementation, reliability, and performance

- [Provider reliability and shared metadata caching](./docs/backend-reliability.md)
- [Player architecture and implemented features](./docs/PLAYER_OVERHAUL.md)
- [Motion performance and interaction checks](./docs/motion-performance.md)
- [Performance review](./docs/PERFORMANCE_REVIEW.md)
- [Home background image sources and licenses](./docs/HOME_BACKGROUND_LICENSES.md)
- [P1 audit remediation notes](./docs/AUDIT_P1_FIXES.md)
- [Guest search and playback investigation](./docs/GUEST_SEARCH_PLAYBACK_FIX.md)
- [Original QA findings](./docs/QA_FINDINGS.md)
- [Retired audio-engine prototype and cleanup record](./docs/AUDIO_ENGINE_PHASE1.md)

### QA guides, audits, and verification reports

- [Audio fidelity, packet-preserving remux, and browser DSP checks](./docs/qa/audio-quality/README.md)
- [Android playback and session audit — 2026-10-20](./docs/qa/android-playback-audit-2026-10-20.md)
- [Production web/Windows/Android audit — 2026-10-20](./docs/qa/production-audit-2026-10-20.md)
- [Ponytail playback audit — 2026-10-21](./docs/qa/ponytail-playback-audit-2026-10-21.md)
- [Shared UI icon verification — 2026-10-23](./docs/qa/ui-icons-2026-10-23.md)
- [Search bar sizing verification — 2026-10-23](./docs/qa/search-bar-2026-10-23.md)
- [PR41 CI and preview recovery — 2026-10-24](./docs/qa/pr41-ci-recovery-2026-10-24.md)
- [Balanced homepage discovery and deduplication](./docs/qa/home-discovery/README.md)
- [Artist channel layout and navigation](./docs/qa/artist-profile.md)
- [Playlist row spacing and saved durations](./docs/qa/playlist-duration/README.md)
- [Authenticated background-playback policy and checks](./docs/qa/background-playback/README.md)
- [Mobile source playback selection and validation](./docs/qa/mobile-source-playback/README.md)
- [Vercel media deployment and infrastructure verification](./docs/qa/vercel-media/README.md)
- [Worker inventory, bindings, and activation gates](./docs/qa/vercel-media/WORKERS.md)
- [Dated hosted extraction, storage, and delivery results](./docs/qa/vercel-media/RESULTS.md)
- [Production desktop release and updater recovery](./docs/qa/desktop-production-recovery.md)
- [Robustness, corruption/fuzzing, and security audit report](./docs/qa/security-audit/REPORT.md)
- [Security audit remediation record](./docs/qa/security-audit/FIXES.md)
- [PR23 responsive UI verification ledger](./docs/qa/pr23-ui-redesign.md)
- [PR24 artist-page verification](./docs/qa/pr24-spotify-artist.md)
- [PR25 duration and desktop verification](./docs/qa/pr25-duration-desktop.md)
- [PR28 artist links and search navigation](./docs/qa/pr28-artist-links.md)
- [PR28 playlist creation and presentation](./docs/qa/pr28-playlists/README.md)
- [PR28 music interface changes](./docs/qa/pr28-spotify-ui.md)
- [PR28 Windows desktop update preparation](./docs/qa/pr28-windows-desktop.md)

### Active audio and migration work

These files separate agreed contracts and implemented slices from pending or blocked requirements. Earlier handoffs remain historical; use the requirements checklist and latest implementation evidence for current status.

- [Audio-engine requirements, findings, and first-release gates](./docs/superpowers/plans/2026-10-22-pr40-audio-engine.md)
- [PR42 migration requirements and status checklist](./docs/superpowers/plans/2026-10-24-ytdlp-migration.md)
- [Integration inventory and replacement map](./docs/qa/ytdlp-migration/README.md)
- [Source, guest-access, and contract decision status](./docs/qa/ytdlp-migration/DECISIONS.md)
- [Confirmed D06 ordered Android transport contract](./docs/qa/ytdlp-migration/ANDROID-TRANSPORT-DRAFT.md)
- [D06 native/client implementation and verification evidence](./docs/qa/ytdlp-migration/D06-IMPLEMENTATION.md)
- [Coordination process and approval boundaries](./docs/qa/ytdlp-migration/COORDINATION.md)
- [Component ownership and integration boundaries](./docs/qa/ytdlp-migration/OWNERSHIP.md)
- [Shared decision and handoff messages](./docs/qa/ytdlp-migration/AGENT-MESSAGES.md)
- [Independent review reproductions](./docs/qa/ytdlp-migration/peer-review-verification.md)
- [Initial peer acknowledgement and inventory gaps](./docs/qa/ytdlp-migration/peer-status.md)

### Historical implementation plans

- [2026-09-24 — PR #19 Unified Web/Desktop + Performance Implementation Plan](./docs/superpowers/plans/2026-09-24-pr19-unified-web-desktop-performance.md)
- [2026-09-26 — PR19 Desktop Release and Runtime Hardening Implementation Plan](./docs/superpowers/plans/2026-09-26-pr19-desktop-release-runtime-hardening.md)
- [2026-09-26 — PR19 Final Integration and Verification Implementation Plan](./docs/superpowers/plans/2026-09-26-pr19-final-integration-verification.md)
- [2026-09-26 — PR19 Playback and Responsive Hardening Implementation Plan](./docs/superpowers/plans/2026-09-26-pr19-playback-responsive-hardening.md)
- [2026-09-26 — PR19 Playlist, Performance, and Domain Cleanup Implementation Plan](./docs/superpowers/plans/2026-09-26-pr19-playlist-performance-cleanup.md)
- [2026-09-26 — PR19 Search and Radio Rate-Limit Implementation Plan](./docs/superpowers/plans/2026-09-26-pr19-search-radio-rate-limits.md)
- [2026-09-26 — PR19 System Hardening Execution Index](./docs/superpowers/plans/2026-09-26-pr19-system-hardening-index.md)
- [2026-10-06 — HayKasa Responsive UI Redesign Implementation Plan](./docs/superpowers/plans/2026-10-06-pr23-responsive-ui-redesign.md)
- [2026-10-10 — HayKasa yt-dlp Playback Implementation Plan](./docs/superpowers/plans/2026-10-10-ytdlp-playback.md)

### Historical design specifications

- [2026-09-23 — HayKasa Desktop Updates + README Refresh — Design](./docs/superpowers/specs/2026-09-23-desktop-updater-github-releases-readme-design.md)
- [2026-09-24 — PR #18 Roadmap Design: Capability Truthfulness, Audio Visualizer, and Playback Diagnostics](./docs/superpowers/specs/2026-09-24-pr18-roadmap-design.md)
- [2026-09-24 — PR #19 Design — One HayKasa Product Codebase Across Web and Desktop](./docs/superpowers/specs/2026-09-24-pr19-unified-web-desktop-performance-design.md)
- [2026-09-26 — PR #19 System Hardening Design](./docs/superpowers/specs/2026-09-26-pr19-system-hardening-design.md)
- [2026-10-06 — PR23: HayKasa responsive interface redesign](./docs/superpowers/specs/2026-10-06-pr23-responsive-ui-redesign-design.md)
- [2026-10-10 — HayKasa yt-dlp playback design](./docs/superpowers/specs/2026-10-10-ytdlp-playback-design.md)

### Historical source-playback verification

- [PR28 source playback verification — 2026-10-10](./docs/superpowers/verification/2026-10-10-ytdlp-playback.md)

### Design-tool reference snapshots

These files include older palette and component references. The implemented styles and components determine the current interface.

- [HayKasa interface system](./.superdesign/design-system.md)
- [Shared UI primitives](./.superdesign/init/components.md)
- [Extractable Superdesign DraftComponents](./.superdesign/init/extractable-components.md)
- [Shared layout components](./.superdesign/init/layouts.md)
- [Key page dependency trees](./.superdesign/init/pages.md)
- [HayKasa routes](./.superdesign/init/routes.md)
- [HayKasa theme tokens](./.superdesign/init/theme.md)

### Executable QA and screenshot collections

- [Android bridge, resolver, player, and emulator fixtures](./docs/qa/android/)
- [Android download and installation-help browser checks](./docs/qa/android-installation/)
- [Search browser scenarios](./docs/qa/search/)
- [Desktop and mobile panel scenarios](./docs/qa/desktop-panels/)
- [Integration-conflict checks](./docs/qa/integration-conflicts/)
- [Security audit fixtures and evidence](./docs/qa/security-audit/)
- [Artist-profile screenshots](./docs/qa/artist-profile/)
- [Responsive UI screenshots](./docs/qa/pr23-ui/)

## Contributing

1. Start from an up-to-date branch and create a focused working branch. Install with `npm ci` to preserve the lockfile.
2. Trace the affected UI, player, API, native bridge/service, and persistence paths before editing. Update connected contracts and consumers together, retaining compatibility for existing accounts and installed clients.
3. Keep changes small. Update the relevant guide and add a focused regression check for changed behavior; documentation-only changes need link, example, and consistency checks.
4. Run `npm run check` for web code and the affected platform/security checks. Report the commands, results, source commit, and device limitations in the pull request. Compilation alone does not prove playback.
5. Open a pull request describing the problem, resulting behavior, and validation. For active PR42 work, read the [coordination instructions](./docs/qa/ytdlp-migration/COORDINATION.md) and existing comments before overlapping edits.

File reproducible bugs through [GitHub Issues](https://github.com/6NCLegend9/Spotify-clone/issues/new/choose), including platform, app version/build, steps, and redacted logs. Do not post credentials, account data, signed delivery URLs, or exploitable security details in public reports. Arrange a private disclosure channel with the maintainer for sensitive findings.

Preserve session revocation, account/playlist authorization, signed Jam events, trusted native origins, SSRF restrictions, bounded extraction/storage, and updater signature verification. Keep secrets and generated builds out of commits. [PRODUCTION.md](./PRODUCTION.md) covers rollout and operational security.

## License

HayKasa is released under the [MIT License](./LICENSE), copyright © 2026 **6NCLegend9 and contributors**. Include the license when redistributing the software. Third-party dependencies and media retain their own licenses; see [home background attribution](./docs/HOME_BACKGROUND_LICENSES.md) for bundled image sources.

---

**HayKasa — music lives here.**
