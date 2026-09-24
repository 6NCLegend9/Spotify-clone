# HayKasa Desktop Updates + README Refresh — Design

Date: 2026-09-23  
Branch: `fix/desktop-update-release-pipeline`  
PR: #17

## Goal

Finish the desktop update pipeline so existing HayKasa Desktop users can receive future signed Windows updates from a public GitHub repository without requiring Vercel Blob, while preserving backward compatibility with already-installed builds that point at HayKasa's existing Vercel API routes.

In the same PR, upgrade the repository README from a minimal setup document into a polished project landing page using the real HayKasa branding and real product captures.

## Success criteria

1. A stable signed release publishes a complete electron-updater bundle to a public GitHub Release:
   - `latest.yml`
   - `HayKasa-Setup-X.Y.Z-x64.exe`
   - `HayKasa-Setup-X.Y.Z-x64.exe.blockmap`
   - release metadata / manifest where useful
2. Existing packaged clients can continue calling:
   - `https://haykasa.vercel.app/api/desktop/manifest`
   - `https://haykasa.vercel.app/api/desktop/update/<channel>/<file>`
3. Those Vercel routes resolve or redirect to public GitHub Release assets, so old installs do not need a feed migration before receiving the next update.
4. Stable/beta automatic updates remain Authenticode-signed and keep `verifyUpdateCodeSignature: true`.
5. Vercel Blob is no longer required for the normal public desktop update path.
6. Release workflows reject incomplete updater bundles and invalid/stale release versions.
7. PR #17 tests cover GitHub-release URLs, manifests, updater compatibility, workflow gates, and signing requirements.
8. The root README includes real HayKasa visuals, clear install/development guidance, a concise architecture section, and links to the live app and desktop release.

## Current problems

- PR #17 still assumes public desktop artifacts live in Vercel Blob for stable/beta.
- `src/app/api/desktop/update/[channel]/[file]/route.js` only creates Vercel Blob URLs.
- `src/utils/desktopInstaller.mjs` has no public GitHub fallback after the latest PR changes.
- The current `desktop-latest` GitHub Release contains only `HayKasa-Setup-x64.exe`; it is not a complete electron-updater feed.
- The current GitHub Release is a prerelease and therefore is not suitable as the final stable publication model.
- `.github/workflows/desktop-release.yml` calls `npm run prepare-github-release`, but that script does not exist in `desktop/package.json` and no corresponding script file exists.
- The root `readme.md` is functional but does not present the product, UI, desktop client, updater model, or project identity.

## Architecture

### Stable update flow

```text
Existing HayKasa Desktop
        |
        v
https://haykasa.vercel.app/api/desktop/manifest
        |
        v
HayKasa Vercel compatibility API
        |
        +----> public GitHub Release metadata
        |
        v
/api/desktop/update/stable/latest.yml
        |
        v
public GitHub Release assets
        |
        +---- latest.yml
        +---- HayKasa-Setup-X.Y.Z-x64.exe
        +---- HayKasa-Setup-X.Y.Z-x64.exe.blockmap
        |
        v
electron-updater
        |
        v
Windows Authenticode verification
```

The Vercel API remains the stable compatibility boundary. GitHub Releases become the artifact origin.

### Why not point the desktop app directly at GitHub now?

Already-installed builds are compiled with the existing HayKasa API URLs. Replacing the feed URL only in a new desktop binary would not help those clients obtain that binary. Keeping the existing API endpoints and changing their backing origin allows old and new clients to use the same update path.

## Release channels

### stable

- Public GitHub Release.
- Not marked prerelease.
- Must be built from `main`.
- Must use an explicit semantic version newer than the currently published stable version.
- Must be Authenticode-signed.
- Must include the full updater bundle.
- Tag format: `desktop-vX.Y.Z` or an equivalent immutable versioned tag.
- A moving compatibility alias may be maintained only if the workflow can do so without making the immutable versioned release ambiguous.

### beta

- Public GitHub prerelease.
- Must be Authenticode-signed.
- Version may contain a prerelease suffix.
- Full updater bundle required.

### internal / preview

- GitHub Actions artifact or clearly named prerelease.
- May remain unsigned.
- Must never be advertised as a stable automatic update.
- No protected production signing secret is required.

## Manifest and route behavior

### `/api/desktop/manifest`

Return normalized release metadata for the requested channel.

For stable/beta:
- resolve the current GitHub Release;
- require the expected update assets;
- advertise the version and public installer URL;
- report `signed: true` only for release paths produced by the protected signed workflow;
- fail closed when the release is incomplete.

The endpoint must not invent a signed release merely because an EXE exists.

### `/api/desktop/update/[channel]/[file]`

Allow only known safe updater filenames and supported channels.

For stable/beta:
- redirect to the corresponding public GitHub Release asset.
- return 404 when the release or requested artifact is unavailable.

For internal:
- keep the implementation isolated from stable/beta and do not weaken production signing checks.

### `/api/desktop/download`

Prefer the current public stable GitHub installer for browser downloads. Preserve local-development behavior where useful.

## GitHub release publication

The release workflow will:

1. validate the requested version and channel;
2. run web/native tests and production dependency audits;
3. stamp the desktop package version;
4. build the Windows NSIS installer;
5. verify Authenticode signature for stable/beta;
6. verify `latest.yml`, installer, and blockmap are present and internally consistent;
7. publish the complete bundle to a versioned GitHub Release;
8. verify the published asset URLs are reachable;
9. expose a job summary with version, channel, release URL, installer asset, and checksum.

The obsolete Vercel Blob publication requirement will be removed from the public update path.

## Signing and security

- Keep `verifyUpdateCodeSignature: true`.
- Stable/beta require `HEYKASA_WINDOWS_CSC_LINK` and `HEYKASA_WINDOWS_CSC_PASSWORD`.
- Do not disable signature verification to support older unsigned builds.
- Do not expose signing secrets to PR or preview jobs.
- Keep downgrade protection enabled.
- Keep web-installer updates disabled in electron-updater.
- Validate release asset names and prevent arbitrary redirect targets.
- Treat a GitHub release as publishable only when all required updater artifacts exist.

## Tests

### Unit / contract tests

Add or update tests for:

- GitHub stable/beta release URL construction.
- Channel normalization.
- Safe asset filename validation.
- Manifest normalization from GitHub release metadata.
- Incomplete release rejection.
- Stable signing requirement.
- Version monotonicity.
- Existing `UPDATE_FEED_BASE_URL` compatibility.
- Browser download route fallback/redirect behavior.
- Removal of Vercel Blob as a required production dependency.

### Workflow tests

Assert that:

- stable releases run only from `main`;
- stable/beta signing secrets remain isolated to the protected job;
- the release workflow publishes `latest.yml`, EXE, and blockmap;
- stable is not published as a prerelease;
- preview/internal does not require production signing secrets;
- no workflow references the nonexistent `prepare-github-release` command unless that command is intentionally added and tested.

### Verification

Before completion:
- run web desktop-contract tests;
- run desktop native tests;
- run release/workflow tests;
- run typecheck/build where the PR already requires them;
- inspect GitHub Actions results on the final PR head;
- verify the public update routes and release assets with HTTP requests after a test/publication path is available.

## README redesign

The root `readme.md` will become the repository landing page rather than only a setup note.

### Structure

1. Centered HayKasa branded header using existing logo/banner assets.
2. Short product statement.
3. Status/stack badges.
4. Primary links:
   - Live HayKasa app
   - Windows Desktop release/download
   - PR/repository documentation where relevant
5. Real product screenshot gallery.
6. Core features.
7. Desktop app section.
8. Desktop update architecture diagram.
9. Tech stack.
10. Local development.
11. Verification/test commands.
12. Production/release notes.
13. Security principles.
14. License / project ownership footer.

### Visual direction

- Use the existing HayKasa logo/banner rather than inventing a disconnected brand.
- Use GitHub-safe HTML/Markdown for alignment and layout.
- Use badges and selective emoji/icons for color; avoid a noisy badge wall.
- Keep screenshots large enough to understand the UI.
- Prefer 2–4 strong product captures over many redundant images.
- Use collapsible technical details only where they improve readability.

## Website media capture

Use the live HayKasa site and browser automation to capture current product UI after implementation verification.

Target captures:
- Desktop home/discovery view.
- Search / playlist / queue experience.
- Expanded player or now-playing experience.
- Mobile responsive view.

Assets will be stored under a repository-owned documentation path such as:

```text
docs/assets/readme/
  haykasa-home.png
  haykasa-search-queue.png
  haykasa-player.png
  haykasa-mobile.png
```

An animated GIF may be added only if it can demonstrate a meaningful interaction without creating an excessively large repository asset. Static screenshots are the required baseline. A video link may be included when GitHub README rendering cannot provide a good inline video experience.

Sensitive/private account information must not appear in the captures.

## Scope boundaries

This PR may modify:
- desktop updater/release code;
- GitHub Actions desktop workflows;
- desktop-related API routes and helpers;
- tests covering those paths;
- desktop/update documentation;
- root README and README media assets.

This PR will not:
- redesign unrelated application UI;
- change playback logic;
- change authentication behavior;
- weaken Windows update signing;
- move unrelated backend/database code;
- add new product features unrelated to release/update reliability or README presentation.

## Rollout

1. Merge PR #17 after all checks pass.
2. Configure the Windows signing secrets required by the protected release workflow.
3. Publish the first complete stable GitHub Release, expected version `1.1.0` unless a newer version is required at release time.
4. Confirm the compatibility API exposes the release.
5. Verify a packaged `1.0.0` client detects, downloads, and stages the new signed release.
6. Keep the compatibility API stable for future desktop versions.
