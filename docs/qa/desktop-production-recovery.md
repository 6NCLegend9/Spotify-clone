# Production desktop recovery

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
