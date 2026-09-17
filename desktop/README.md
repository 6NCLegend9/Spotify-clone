# HeyKasa Desktop

HeyKasa Desktop is a hardened Electron shell around the production HeyKasa web app. It adds native Windows capabilities without copying the music application or exposing Node.js to the renderer.

## Runtime boundary

- Renderer: `https://haykasa.vercel.app`
- Native API: context-isolated preload bridge (`window.heykasaDesktop`)
- Node integration in renderer: disabled
- Renderer sandbox: enabled
- Browser permission requests: denied by default
- Navigation: HeyKasa stays in the app; external HTTPS links open in the system browser
- PWA service workers/cache storage: cleared for the desktop partition at startup

## Native capabilities (API v1)

- Discord Rich Presence through Discord Desktop native IPC
- Desktop updater lifecycle and status API
- Start-with-Windows preference
- Desktop diagnostics/version/capability discovery

The standalone `desktop-bridge/` remains available during migration for browser development. The desktop app does not need that localhost WebSocket bridge; it talks to Discord IPC directly.

## Development

```powershell
cd desktop
npm install
npm test
$env:HEYKASA_DESKTOP_URL="http://localhost:3000"
npm start
```

Local HTTP renderer overrides are accepted only in unpackaged development builds and only for `localhost` / `127.0.0.1`.

## Windows package

```powershell
cd desktop
npm install
npm run dist
```

The first production public release still requires the release infrastructure described below: Windows code-signing credentials and a public immutable update/download location. Until an update feed is configured, update checks fail closed with a `disabled` state instead of calling an invalid endpoint.

## Release invariants

1. Never ship server secrets, GitHub credentials, signing keys, database credentials, auth cookies, or Vercel write tokens in the desktop bundle.
2. Keep `appId` (`com.heykasa.desktop`) and the `heykasa://` protocol stable after the first public release.
3. Sign Windows release artifacts before publishing them.
4. Upload installer/update artifacts first and publish updater metadata last.
5. Published version artifacts are immutable. A rollback is a new higher patch version, not an overwritten installer.
6. Stable releases must pass the web CI plus Windows desktop tests before publication.

## Update feed

`src/config.mjs` intentionally leaves the production update feed blank until signed release storage exists. The release pipeline can temporarily supply `HEYKASA_DESKTOP_UPDATE_URL`; the permanent production feed should be pinned in desktop configuration once the public Blob/update root is provisioned.
