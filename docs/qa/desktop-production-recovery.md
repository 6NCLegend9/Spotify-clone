# Production desktop recovery

## Update delivery correction, 2026-10-23

Scope: Windows Electron updates, the shared web manifest/feed APIs, GitHub release
preparation and the existing CI callers. This work continues PR41; PR40 playback
changes remain separate. Ponytail, cloud runtime/networking, Verification, CI/CD,
environment-variable and CLI skills were read. No applicable AGENTS.md was found.

| ID | Requirement | Status | Evidence / remaining gate |
| --- | --- | --- | --- |
| U01 | Instructions, skills, isolated changes | verified | Worktree `HayKasa-pr41-updates` starts at reviewed head `731c135`; other worktrees preserved. |
| U02 | Trace Settings -> IPC -> native updater -> manifest/feed -> GitHub release | verified | Existing Settings check calls native `manual:true`; native install calls `quitAndInstall`; publication, manifest authentication and exact metadata identity remain connected. |
| U03 | Explicit checks can receive a newer version during an active staged rollout | verified | Reproduced `deferred` instead of `ready` before editing. Controlled native-engine tests now pass; automatic checks retain their rollout bucket, 0% remains paused and required-minimum/API exceptions remain unchanged. |
| U04 | Current/newer versions are distinguished from an available update | verified | Same/older/prerelease cases exercise the existing semantic comparator. Current/newer installations report up-to-date without attempting a download. |
| U05 | Validate release metadata before publication | verified | Actual bundle CLI accepted mismatched YAML version before the fix. It now rejects mismatched version, installer path, SHA-512, file size and empty installers before emitting a new manifest. |
| U06 | Prepared GitHub bundle reaches the player-independent native update flow | verified | Actual preparation CLI -> actual trust verifier -> actual manifest/feed routes -> native updater class reaches exact fixture version `1.2.3` and explicit install command. Redirects target the same verified version; missing/tampered assets fail closed. HTTP and electron-updater are controlled fixtures; this is not Windows installation proof. |
| U07 | Signing inputs and production manifest authentication | blocked | Read-only Vercel metadata has no desktop manifest HMAC variable. GitHub environment/repository secret listing returns HTTP 403. No secret values read, generated, replaced or printed. |
| U08 | Published signed release and installed 1.0.0 -> newer-version upgrade | blocked | Production has only the legacy manual installer and no complete stable feed. Requires valid Windows signing setup, approved publication and actual Windows upgrade verification. |
| U09 | Diff, integration checks, updated PR and final evidence | implemented | Node 22 fixture/CRLF checks, mini-player/contract checks and full lint/typecheck/production build pass. Record pushed commit and new-head CI separately. PR remains draft. |

The relevant code paths are `DesktopAppCard.jsx` -> `main.mjs` update IPC ->
`updater.mjs` -> manifest and generic feed routes -> `desktopReleaseTrust.mjs` /
`desktopRelease.mjs`. Release preparation uses the same exact metadata validator
as delivery. The existing Desktop CI and signed-release web gate call
`check-auto-release.mjs`, which now also executes `check-release-delivery.mjs`.
No unused test entry point or new native bridge/API contract was introduced.

Final local verification runs under Node 22. The extended checks cover manual opt-in
at 25%, automatic deferral, 0% pause, equal/older/prerelease versions, disabled
automatic updates, unchanged signature/hash/publication gates, prepared bundle
identity, missing assets, tampered manifest authentication, corrupt metadata and
empty installers. The fixture manifest becomes published/signed through the real
route after verification; no production flags are hardcoded. Fixture authentication
does not validate a Windows Authenticode certificate or execute an installer.

These native updater changes must be included in a new Windows binary. Deploying
the website alone does not replace code in an installed 1.0.0 EXE. The current
production download remains a legacy manual installer until the signed release
procedure below succeeds. No merge, production deployment, signing-key change,
native release publication or installed-app upgrade was performed here.

Commands: `node desktop/scripts/check-auto-release.mjs` (including the delivery
fixture), its CRLF updater-source variation, `node desktop/scripts/check-mini-player.mjs`,
canonical contract generation with no generated-file diff, and
`DISABLE_PWA=1 npm run check` all exited 0. The initial manual-rollout regression
failed with `deferred` versus `ready`; the initial bundle regression accepted
`version: 99.0.0` for an installer stamped `1.2.3`. Both now pass their corrected
assertions. Screenshots or synthetic ready events cannot replace a signed upgrade
test over the public installed 1.0.0 build.

## Evidence collected on 2026-10-08

The desktop source, Electron entry point, native preload, settings card, and
desktop APIs are present on production main. The production renderer is READY
at commit `8bca882525472337525c009fcc40cd567f862a7f`. Installed clients load
`https://haykasa.vercel.app`; native installers and renderer deployment are
separate release paths.

The current download outage is reproducible:

| Endpoint | Result |
| --- | --- |
| `/api/desktop/manifest` | 200, `published: false`, `signed: false`, `source: "none"`, empty download URL |
| `/api/desktop/download` | 404, signed installer not published |
| `/api/desktop/update/stable/latest.yml` | 404, update artifact not found |
| `/api/desktop/policy` | 200, maintenance disabled, auth/Discord/updater enabled |

GitHub still has `desktop-latest`, published 2026-09-22, marked prerelease,
with one `HayKasa-Setup-x64.exe` asset. It has no complete versioned stable
bundle. The current compatibility API accepts a non-prerelease
`desktop-vX.Y.Z` bundle with authenticated metadata, not that legacy asset.
The Desktop Release workflow has zero runs. Successful Desktop Package CI
builds upload test artifacts; they do not publish the stable download feed.

The latest Windows Package CI run on 2026-10-04
([37209334751](https://github.com/6NCLegend9/Spotify-clone/actions/runs/37209334751))
succeeded, including installer construction, packaged Windows runtime smoke,
and release bundle preparation. The latest production-main Desktop CI and
PR25 Desktop CI also succeeded. This does not reproduce the owner's reported
build failure; a failing command or run is still needed to identify that
specific failure. A successful CI artifact is not a published installer or
an available automatic update.

The settings card previously claimed the installer was being prepared without
any evidence of an active build. The recovery change explains that the signed
installer is unavailable and that existing installed clients remain usable.
It preserves the release verification and updater trust checks.

The owner's follow-up identified the root `package.json` commands. Those only
exposed desktop launch/development; root `build` was a web build. The combined
PR25 recovery adds `desktop:install`, `desktop:build`, `desktop:pack`, and
`desktop:test`, delegating to the existing desktop toolchain. Windows installer
builds remain Windows operations; these commands do not publish releases.
`desktop:dev` also directly spawned `npm.cmd`, which Node 22 rejects on Windows.
It now launches npm's JavaScript CLI through Node without a shell. Focused
launcher tests cover paths with spaces and missing npm invocation context;
Windows Package CI now runs these tests as well.

## Concrete recovery procedure (not executed)

1. Review and merge renderer changes separately. PR25 (`479b499`) contains
   artist/release behavior and duration fixes verified in actual Linux
   Electron with fixture playback. Deploy approved web changes to production
   so installed clients receive them. No installer is needed for those UI
   changes.
2. Verify the protected GitHub `desktop-release` environment has
   `HEYKASA_WINDOWS_CSC_LINK`, `HEYKASA_WINDOWS_CSC_PASSWORD`, and
   `HEYKASA_DESKTOP_MANIFEST_HMAC_SECRET`. Verify production Vercel shares the
   same HMAC secret. The GitHub integration returned HTTP 403 when listing
   protected environment secret names, so secret presence/equality was not
   established by this investigation; do not print their values.
3. After release approval, dispatch `.github/workflows/desktop-release.yml`
   **from main**, with channel `stable`, version `1.1.0`, minimum version
   `1.0.0`, and an approved public HTTPS release-notes URL. Recheck the live
   version and existing tags first; choose a newer version if either changed.
4. Require the workflow's Windows package smoke and Authenticode verification
   to pass before publication. The immutable `desktop-v1.1.0` release must
   include `HayKasa-Setup-1.1.0-x64.exe`, its `.blockmap`, `latest.yml`,
   HMAC-authenticated `release-manifest.json`, and runtime SBOM. Never relabel
   the legacy EXE as a signed stable release.
5. Require the existing production-release verifier to pass: manifest must
   identify the signed release and its exact hash/size; updater metadata and
   installer endpoints must redirect to that same bundle. Keep the current
   25% production update rollout until observation supports increasing it.
6. Verify the published installer on Windows: install, launch, authentication,
   tray behavior, signed update check, and live catalog/audio playback. The
   Linux fixture smoke does not establish those results.

An unsigned Windows Package CI was dispatched for the recovery branch
([37845337876](https://github.com/6NCLegend9/Spotify-clone/actions/runs/37845337876));
it passed installer construction, packaged Windows runtime verification,
and release-bundle preparation and uploaded the CI artifact. PR25's Windows
package check also passed
([37844903468](https://github.com/6NCLegend9/Spotify-clone/actions/runs/37844903468)).
These verify Windows CI packaging and the production native boundary, not
manual Windows installation, signed automatic updates, or live audio playback.
CI artifacts do not publish a public release. No signed-release
workflow dispatch, stable publication, merge, or production deployment was
performed. Restoring the public installer requires the signed publication
above; changing the download card alone cannot restore it.

Follow-up validation: lint, TypeScript, and 28 desktop download/manifest/release
and release-gate tests passed. A direct production navigation from Linux
Electron reached its offline fallback in this cloud network; this probe does
not establish production desktop usability or live playback. Read-only HTTPS
endpoint probes succeeded. The PR25 local Electron fixture verification is
recorded separately in that PR's QA report.
