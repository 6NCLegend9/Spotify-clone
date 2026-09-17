# HeyKasa Desktop v1

HeyKasa Desktop `1.0.0` is a hardened Electron shell around the production HeyKasa web application. The music product remains deployed by Next.js/Vercel; Electron adds a narrow set of Windows-native capabilities without exposing Node.js to the renderer.

## Runtime architecture

```text
HeyKasa Desktop.exe
  ├─ Electron main process
  │   ├─ signed auto-updater
  │   ├─ Discord Desktop IPC
  │   ├─ Windows startup / tray
  │   ├─ system-browser auth handoff
  │   ├─ runtime policy / kill switches
  │   ├─ crash-loop safe mode
  │   └─ local diagnostics
  │
  ├─ context-isolated preload API
  │
  └─ https://haykasa.vercel.app
      └─ the normal HeyKasa Next.js application
```

The desktop shell does not contain database credentials, GitHub credentials, signing credentials, Vercel write tokens, Google client secrets, NextAuth secrets, or other server-only material.

## Security boundary

Production renderer: `https://haykasa.vercel.app`

Electron enforces:

- `nodeIntegration: false`
- `contextIsolation: true`
- renderer sandbox enabled
- `webSecurity: true`
- permission requests denied by default
- IPC sender-origin verification on every privileged request
- only the explicit preload methods under `window.heykasaDesktop`
- navigation restricted to the trusted HeyKasa renderer origin
- external HTTPS pages opened in the system browser
- PWA service workers and Cache Storage cleared from the desktop partition at startup
- single-instance execution
- stable `com.heykasa.desktop` Windows app ID
- stable `heykasa://` protocol registration

The renderer never receives unrestricted filesystem, shell, process, registry, PowerShell, Node.js, or arbitrary IPC access.

## Native API v1

The exposed capability contract currently includes:

- `discordPresenceV1`
- `updaterV1`
- `autoLaunchV1`
- `desktopPreferencesV1`
- `trayV1`
- `diagnosticsV1`
- `authV1`

The web app checks capabilities instead of assuming that every installed desktop version supports every native feature.

## Discord Rich Presence

Desktop Rich Presence talks directly to Discord Desktop native IPC (`discord-ipc-0` through `discord-ipc-9`). The Electron desktop path does not use `ws://127.0.0.1:64650`.

The old `desktop-bridge/` remains only as a browser-development/migration fallback. It is not required by HeyKasa Desktop.

Discord activity is sanitized before it reaches the native pipe. If richer payloads are rejected, the client falls back from buttons/assets to a minimal activity rather than crashing playback.

## Desktop authentication

Google authentication uses the system browser rather than an embedded Google login window.

Flow:

1. Electron generates a cryptographically random state and PKCE verifier/challenge.
2. Electron opens `/api/desktop/auth/authorize` in the user's normal browser.
3. The browser completes normal HeyKasa/Google authentication.
4. The server creates a short-lived, one-time desktop grant and redirects to `heykasa://auth`.
5. Electron validates state and expiry and exchanges the one-time code plus PKCE verifier over HTTPS.
6. The server consumes the grant atomically and returns a NextAuth session token to the Electron main process.
7. Electron writes the HTTP-only session cookie into `persist:heykasa` and reloads the web application.

The session token never passes through renderer JavaScript.

## Automatic updates

Desktop v1 separates web updates from native updates.

### Web changes

Queue/player/search/UI changes are deployed through Vercel. The desktop window loads the production site and can notify the user when a newer web build is available. HeyKasa does not forcibly reload during playback.

### Native changes

Electron/Discord/updater/native changes are distributed as signed Windows releases.

The installed app:

- checks a server-owned release manifest first
- checks for updates after a randomized startup delay
- checks again every six hours
- rechecks after system resume
- downloads eligible signed releases automatically
- never allows automatic downgrade
- installs a downloaded update when HeyKasa fully exits, or when the user selects Restart and update

The update endpoint is compiled into the signed app. A remotely loaded renderer cannot choose an arbitrary executable URL.

## Staged rollout

Stable desktop updates support deterministic percentage rollout.

Each installation gets one random local installation UUID. That UUID is hashed into a stable `0-99` bucket and is not exposed to the renderer or support report.

`HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT` controls stable eligibility:

- `0` - no stable installation downloads the new release
- `5` - approximately 5% of installations are eligible
- `25` - approximately 25%
- `100` - full rollout

A client outside the current rollout enters the updater `deferred` state and checks again later. Manual update checks do not bypass the rollout gate.

Internal and beta channels are separate release channels and are not constrained by the stable percentage gate.

## Runtime kill switches

`/api/desktop/policy` provides operational controls for native capabilities.

Supported production environment controls:

- `HEYKASA_DESKTOP_ENABLED`
- `HEYKASA_DESKTOP_AUTH_ENABLED`
- `HEYKASA_DESKTOP_DISCORD_ENABLED`
- `HEYKASA_DESKTOP_UPDATER_ENABLED`
- `HEYKASA_DESKTOP_MAINTENANCE_MESSAGE`
- `HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT`

The app refreshes policy periodically and after resume. If Discord is remotely disabled, the current activity is cleared and the pipe is disconnected. If the updater is disabled, scheduled checks stop. Authentication can also be disabled without shipping a new executable.

A temporary policy fetch failure keeps the most recently accepted native policy instead of silently re-enabling a feature that was disabled.

## Crash recovery and safe mode

Desktop settings are stored locally under Electron's user-data directory.

The shell tracks clean exits, startup crash streaks, and renderer crashes. Repeated crashes put the next/current session in safe mode. Safe mode keeps the web music application and authentication available, while disabling nonessential Discord and updater integrations for that run.

A successful clean exit clears the crash streak so a recovered application does not remain permanently stuck in safe mode.

## Diagnostics

Desktop logs are local JSONL files under the Electron user-data `logs` directory. They rotate at approximately 2 MB.

The logger intentionally redacts fields whose names indicate tokens, cookies, passwords, secrets, credentials, PKCE material, authorization values, or authentication codes. Logs are bounded and diagnostics failures never terminate the app.

The web Support diagnostics panel can include a sanitized snapshot of desktop state and the most recent native log entries. It never includes the local installation UUID.

## Desktop preferences

Machine-local preferences are deliberately separate from HeyKasa account settings:

- Start with Windows
- automatic desktop updates
- close/minimize to system tray
- update channel
- crash/safe-mode state

They are not synced to another computer through Redux/account settings.

## Development

```powershell
cd desktop
npm install
npm test
$env:HEYKASA_DESKTOP_URL="http://localhost:3000"
npm start
```

Local renderer overrides are allowed only in unpackaged development builds and only for `localhost` / `127.0.0.1`.

To create an unsigned Windows CI/development package:

```powershell
npm run pack
```

To create the normal installer:

```powershell
npm run dist
```

A production release must be code-signed; manually generated unsigned installers are not a stable release.

## CI

`.github/workflows/desktop-ci.yml` validates both sides of the boundary:

- server/Next.js desktop contract tests on Ubuntu
- native desktop tests on Windows
- production dependency audit
- unsigned Windows packaging smoke test
- executable artifact verification

The workflow is path-filtered and uses `cancel-in-progress` so rapid development pushes do not leave every obsolete CI run executing.

## Signed release workflow

`.github/workflows/desktop-release.yml` is manual only.

Before the Windows release job can publish anything, the web gate must pass:

- production dependency audit
- desktop API/auth/policy tests
- TypeScript/Next.js type check
- production Next.js build

Stable releases are rejected unless the workflow runs from `main`. Internal/beta builds may be generated from a development ref for controlled testing.

Required GitHub `desktop-release` environment secrets:

- `HEYKASA_WINDOWS_CSC_LINK`
- `HEYKASA_WINDOWS_CSC_PASSWORD`
- `BLOB_READ_WRITE_TOKEN`
- `HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET`

The HMAC secret must be at least 32 characters. None of these values are packaged into the app.

## Vercel production configuration required before v1 publication

The web deployment that supports Desktop v1 needs the desktop endpoints and the following server environment configuration where applicable:

- `HEYKASA_DESKTOP_BLOB_BASE_URL` - public read-only Vercel Blob base URL
- `HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET` - same manifest-verification secret used by the release workflow
- optional `HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT`
- optional desktop feature/maintenance switches listed above

`HEYKASA_DESKTOP_BLOB_BASE_URL` is validated to a public `*.public.blob.vercel-storage.com` origin before the update proxy redirects to it.

## Release publication order

The release script follows an atomic order:

1. Build and sign the Windows installer.
2. Verify the Authenticode signature in CI.
3. Upload the versioned installer and blockmaps as immutable Blob objects.
4. Verify the uploaded artifacts are reachable and have the expected size.
5. Calculate installer SHA-512.
6. Publish the HMAC-signed `release-manifest.json`.
7. Publish normalized `latest.yml` last. This is the updater publication switch.

Published version artifacts are immutable. A bad release is fixed by publishing a newer patch version; an existing installer is never silently replaced and automatic downgrade remains disabled.

## Recommended v1 rollout

1. Finish Desktop v1 code and make Desktop CI green.
2. Merge the required web/desktop API code to `main`.
3. Deploy and verify the production desktop API endpoints before distributing an installer.
4. Configure the Blob base URL, signing secrets, HMAC secret, and release environment.
5. Publish `internal` and test installation/auth/Discord/update/reboot behavior on a real Windows machine.
6. Publish `beta` and repeat smoke testing.
7. Publish `stable` with a low rollout percentage.
8. Monitor diagnostics and increase stable rollout gradually to `100`.

## Current development deployment state

While Desktop v1 is being built on `desktop-app-development`, that branch intentionally sets Vercel Git deployment to disabled in `vercel.json`. This prevents every desktop commit from creating another Vercel deployment. Re-enable deployment only when the v1 code is ready for final web/desktop verification.

## Release invariants

1. Never ship server secrets, GitHub credentials, signing keys, database credentials, auth cookies, OAuth client secrets, or Vercel write tokens in the desktop bundle.
2. Keep `com.heykasa.desktop` and `heykasa://` stable after the first public release.
3. Do not publish unsigned Windows releases.
4. Do not publish stable releases directly from a feature branch.
5. Upload immutable binaries before mutable updater metadata.
6. Never silently overwrite a published version.
7. Never auto-downgrade an installed app.
8. A renderer compromise must still be constrained by preload allowlists, IPC sender validation, payload validation, and operational kill switches.
9. A failed updater, policy server, Discord client, or diagnostics path must not stop normal music playback.
