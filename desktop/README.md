# HayKasa Desktop

HayKasa Desktop is the hardened Windows/Electron shell for the production HayKasa web application. The music product remains a Next.js application deployed on Vercel; Electron adds a deliberately narrow native boundary for updates, Discord presence, startup/tray behavior, authentication handoff, appearance settings, and local diagnostics.

## Runtime architecture

```text
HayKasa Desktop.exe
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
      └─ normal HayKasa Next.js application
```

The desktop bundle does not contain database credentials, GitHub credentials, Windows signing credentials, NextAuth secrets, Google client secrets, or other server-only material.

## Security boundary

Production renderer: `https://haykasa.vercel.app`

Electron enforces:

- `nodeIntegration: false`
- `contextIsolation: true`
- renderer sandbox enabled
- `webSecurity: true`
- permission requests denied by default
- IPC sender-origin verification for privileged requests
- an explicit preload capability surface under `window.heykasaDesktop`
- main-frame navigation restricted to the trusted HayKasa origin
- external HTTPS pages opened in the system browser
- production devtools disabled
- production Electron fuses that disable `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and CLI inspector flags
- cookie encryption, embedded ASAR integrity validation, and `onlyLoadAppFromAsar`
- stable `com.heykasa.desktop` Windows app ID and `heykasa://` protocol

The renderer never receives unrestricted filesystem, shell, process, registry, PowerShell, Node.js, or arbitrary IPC access.

## Native API

The current desktop capability contract includes:

- `discordPresenceV1`
- `updaterV1`
- `autoLaunchV1`
- `desktopPreferencesV1`
- `appearanceProfilesV1`
- `trayV1`
- `diagnosticsV1`
- `authV1`

The web app capability-checks the installed shell instead of assuming every native version exposes every feature.

## Desktop authentication

Google authentication runs in the system browser rather than an embedded login window.

1. Electron creates a random state and PKCE verifier/challenge.
2. Electron opens `/api/desktop/auth/authorize` in the user's browser.
3. The browser completes normal HayKasa authentication.
4. The server returns a short-lived one-time `heykasa://auth` grant.
5. Electron verifies state and expiry, then exchanges the code and PKCE verifier over HTTPS.
6. The server atomically consumes the grant and returns the NextAuth session token to the Electron main process.
7. Electron writes the HTTP-only session cookie into the isolated desktop partition and reloads HayKasa.

The session token does not pass through renderer JavaScript.

## Automatic updates

Web deployments and native desktop releases are intentionally separate.

### Web changes

UI, search, queue, playback, and other web changes deploy through Vercel. The desktop shell loads the production app, so web releases do not require a new Windows installer.

### Native changes

Native Electron changes use a compatibility API backed by public GitHub Releases:

```text
Installed HayKasa Desktop
        |
        +--> https://haykasa.vercel.app/api/desktop/manifest
        |
        +--> https://haykasa.vercel.app/api/desktop/update/<channel>/latest.yml
        |          |
        |          +--> validated public GitHub Release asset
        |
        +--> electron-updater
                   |
                   +--> Authenticode verification for stable/beta
```

Keeping the Vercel endpoints stable is important: already-installed clients are compiled with those URLs. The server can change the artifact origin to GitHub Releases without requiring old clients to know a new feed URL first.

### Release channels

- **stable** — immutable tag `desktop-vX.Y.Z`, non-prerelease, signed, and published only from `main`.
- **beta** — immutable tag `desktop-beta-vX.Y.Z[-prerelease]`, GitHub prerelease, signed.
- **internal** — immutable tag `desktop-internal-vX.Y.Z[-prerelease]`, GitHub prerelease, unsigned test build.

A valid release bundle must contain all of the following:

```text
latest.yml
HayKasa-Setup-X.Y.Z-x64.exe
HayKasa-Setup-X.Y.Z-x64.exe.blockmap
release-manifest.json
```

Signed stable/beta releases also publish a CycloneDX runtime SBOM.

The compatibility API rejects incomplete bundles rather than falling back to a lone EXE.

### Release-manifest trust

Stable and beta `release-manifest.json` files are HMAC-authenticated by the protected release workflow. The Vercel compatibility API verifies that signature and then verifies that the signed version, channel, installer URL, SHA-512, and size match the selected GitHub Release bundle.

The HMAC does not replace Windows Authenticode. It protects server-side release metadata; the packaged application still keeps `verifyUpdateCodeSignature: true` so Windows installer authenticity remains the final native-code trust boundary.

Internal previews explicitly remain unsigned and are never reported as stable/beta signed releases.

### Updater behavior

The installed application:

- checks the server-owned manifest before calling `electron-updater`
- checks after a randomized startup delay and again every six hours
- rechecks after system resume
- downloads eligible releases automatically
- keeps automatic downgrade disabled
- disables web-installer updates
- installs a downloaded update on full exit or when the user chooses Restart and update
- refuses stable/beta auto-update when the release manifest does not say `signed: true`

The renderer cannot provide an arbitrary executable URL to the native updater.

## Staged rollout

Stable updates support deterministic percentage rollout using a local installation UUID and a stable `0-99` bucket.

`HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT` controls stable eligibility. If it is not configured, production defaults to a staged **25%** rollout rather than silently exposing a new stable release to every installation. Operators can increase or decrease the percentage after observing the rollout. A client outside the current rollout enters the updater `deferred` state and checks again later. Manual checks do not bypass the rollout gate.

## Runtime kill switches

`/api/desktop/policy` can remotely disable native capabilities without shipping another executable.

Supported production controls include:

- `HEYKASA_DESKTOP_ENABLED`
- `HEYKASA_DESKTOP_AUTH_ENABLED`
- `HEYKASA_DESKTOP_DISCORD_ENABLED`
- `HEYKASA_DESKTOP_UPDATER_ENABLED`
- `HEYKASA_DESKTOP_MAINTENANCE_MESSAGE`
- `HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT`

A transient policy fetch failure keeps the last accepted policy instead of silently re-enabling a disabled feature.

## Crash recovery and diagnostics

Desktop settings and JSONL logs are stored under Electron's user-data directory. Repeated startup/renderer crashes can put the next session into safe mode, which keeps the web app and authentication available while disabling nonessential updater/Discord integrations for that run.

Diagnostic logging redacts token-, cookie-, password-, secret-, credential-, PKCE-, authorization-, and auth-code-shaped fields. Diagnostics failures do not terminate playback.

## Development

From the repository root, start the shared Next.js renderer and the Electron shell together:

```powershell
npm install
npm run desktop:install
npm run desktop:dev
```

`desktop:dev` starts the root HayKasa app on port 3003, waits for it to become ready, launches Electron against that same renderer, and cleans up the paired development processes when the Desktop process exits.

Run these commands from the repository root with Node 22:

| Command | Purpose |
| --- | --- |
| `npm run desktop` | Launch Electron using the production renderer |
| `npm run desktop:dev` | Launch the local renderer and Electron together |
| `npm run desktop:install` | Install locked desktop dependencies |
| `npm run desktop:test` | Run native unit tests |
| `npm run desktop:pack` | Create an unpacked Windows x64 application |
| `npm run desktop:build` | Build the Windows NSIS installer in `desktop/dist/` |

Use Windows for installer builds and packaged runtime verification. The root
`npm run build` builds the Next.js web renderer. Neither build command publishes
an installer or updates installed clients. Signed public updates use the
protected Desktop Release workflow described below.

For native-only testing:

```powershell
npm --prefix desktop test
```

Advanced/manual fallback:

```powershell
cd desktop
$env:HEYKASA_DESKTOP_URL="http://localhost:3003"
npm start
```

Local renderer overrides are allowed only in unpackaged development builds and only for `localhost` / `127.0.0.1`. Packaged production builds ignore arbitrary renderer overrides and always use the trusted HayKasa production origin.

Create an unsigned package for development/CI:

```powershell
npm run pack
```

Build the normal NSIS installer:

```powershell
npm run dist
```

Prepare the full GitHub Release bundle after a build:

```powershell
$env:HEYKASA_DESKTOP_RELEASE_CHANNEL="internal"
$env:HEYKASA_DESKTOP_MINIMUM_VERSION="1.0.0"
npm run prepare-github-release
```

Stable/beta preparation additionally requires `HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET`; stable/beta publication also requires a valid Windows signing certificate in the protected workflow.

## CI and release workflow

Desktop releases use the signed GitHub release workflow below. The retired Vercel
Blob publishing scripts and their npm commands are no longer supported.

`.github/workflows/desktop-ci.yml` validates the server/desktop contract, native tests, runtime dependency audit, and Windows packaging. It uploads unsigned CI artifacts only; it does not publish an end-user update feed.

`.github/workflows/desktop-preview.yml` is also an unsigned Actions-artifact smoke path.

`.github/workflows/desktop-release.yml` is the manual publication workflow:

1. run production web/runtime audits, desktop API tests, typecheck, and Next.js build;
2. reject stable releases that are not dispatched from `main`;
3. validate release-version monotonicity against the current compatibility manifest;
4. build and test the Windows package;
5. verify Authenticode for beta/stable;
6. generate and validate the complete updater bundle;
7. reject an already-existing versioned tag or release before publication;
8. publish that bundle as an immutable public GitHub Release;
9. fetch every required public release asset to verify publication;
10. verify the live HayKasa manifest, updater metadata route, and stable installer redirect against the published signed manifest.

Stable publication additionally requires an HTTPS release-notes URL. Release-workflow third-party Actions are pinned to reviewed immutable commit SHAs rather than mutable major tags.

Protected `desktop-release` environment secrets required for beta/stable:

- `HEYKASA_WINDOWS_CSC_LINK`
- `HEYKASA_WINDOWS_CSC_PASSWORD`
- `HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET`

Vercel Blob is not required for the normal public desktop update path.

## Production configuration

The production Vercel deployment must expose the desktop API routes and share the same `HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET` used by the protected signed-release workflow.

Optional operational configuration:

- `HEYKASA_DESKTOP_UPDATE_ROLLOUT_PERCENT`
- the desktop feature/maintenance switches listed above
- `HEYKASA_DESKTOP_DOWNLOAD_URL` as an emergency explicit installer override
- `HEYKASA_DESKTOP_MANIFEST_URL` as an emergency signed-manifest override

If no valid signed GitHub stable release is available, the stable manifest stays unpublished instead of inventing or trusting an unsigned update.

## Release invariants

1. Never package server secrets, GitHub write credentials, signing keys, database credentials, auth cookies, or OAuth client secrets into the desktop app.
2. Keep `com.heykasa.desktop`, `heykasa://`, and the Vercel compatibility endpoints stable after public release.
3. Never present unsigned internal builds as signed production releases.
4. Do not publish stable releases from a feature branch.
5. Do not publish a release unless the metadata, installer, blockmap, and release manifest are all present.
6. Never silently replace an immutable versioned beta/stable release.
7. Never auto-downgrade an installed app.
8. Keep Authenticode verification enabled for production updates.
9. A renderer compromise must remain constrained by preload allowlists, IPC sender validation, payload validation, and operational kill switches.
10. A failed updater, policy server, Discord client, or diagnostics path must not stop normal music playback.

## License

The desktop shell uses the repository's [MIT License](../LICENSE). Packaged builds include `licenses/LICENSE` in the application resources. Preserve this file when redistributing the desktop package.

### Manual download during release migration

When no verified signed stable release is available, `/api/desktop/manifest`
can expose a separate `manualDownload` descriptor for the existing
`desktop-latest/HayKasa-Setup-x64.exe` asset. Its repository, tag, filename,
uploaded state, size, SHA-256, and canonical GitHub asset URL are pinned and
validated before `/api/desktop/download` redirects. Mismatched asset metadata fails closed. GitHub metadata is cached for up to
five minutes; the redirect does not independently verify downloaded bytes. The website labels this as a legacy installer and does not promise
automatic updates or a verified publisher signature.

This descriptor does not set `published`, `signed`, or the updater's
`downloadUrl`. Stable and beta automatic updates continue to require the
verified signed release bundle. A verified stable installer takes precedence
and replaces the manual fallback automatically. Deploy the web change before
expecting the production download button to change.
