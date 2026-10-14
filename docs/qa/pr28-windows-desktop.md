# Windows desktop update preparation

PR #28 prepares desktop version 1.1.0. Desktop Package CI stamps every Windows test installer as `1.1.0-internal.<run_number>` and embeds the internal channel. These versions advance between workflow runs and remain below the eventual stable 1.1.0 release. The artifact contains the NSIS installer, its blockmap, `latest.yml`, and `release-manifest.json`.

Desktop settings now read the selected channel's manifest, refresh it after a manual check, distinguish a failed request from an unpublished release, and offer a native-backed Stable/Beta selector. Internal is available only to internal or development builds. The native API reports the embedded build channel; existing production builds default to Stable when that field is absent. Native channel restrictions and stable/beta signature checks remain enforced.

## Live state observed before this change

Production served main commit `c737b973285d5ebbfe5335576c537e390f610cc7`. Stable, beta and internal manifests were unpublished. Stable offered only a legacy 1.0.0 manual installer, and the stable `latest.yml` endpoint returned 404. GitHub's `desktop-latest` prerelease contained only an EXE, without the metadata or blockmap needed for auto-updates.

## Windows verification

1. Download and extract the Desktop Package CI artifact for this PR. Install its versioned EXE. Internal builds are unsigned; use them only for testing.
2. Open Settings → HayKasa Desktop. Confirm the installed version and Internal test builds channel. Switch channels and confirm the latest-release label follows the selected channel.
3. A packaged internal installer still loads the production website. Updated settings/UI become visible after PR #28's web changes are deployed; installing the native shell alone does not deploy them.
4. For a real update test, publish two increasing internal versions with the Desktop Release workflow and complete bundles. Install the older version, select Internal, then check for updates. Confirm checking → downloading → ready, restart, and verify the newer installed version and preserved preferences.
5. Before stable activation, run the signed Desktop Release workflow on main with a higher version, Windows signing credentials and the manifest HMAC secret in the protected release environment. Verify the published manifest, metadata, and a real Windows upgrade.

No Windows installation or real binary upgrade has been performed in this Linux workspace. An artifact alone is not a published update feed. Production deployment and signed release publication remain separate activation steps.
