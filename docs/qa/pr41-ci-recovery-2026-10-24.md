# PR41 CI and preview recovery — 2026-10-24

## Reproduced failures

At PR head `234fcd985556480ca44fc77d2b397c6cfdf8522f`:

- [Vercel deployment](https://vercel.com/6nclegend9s-projects/spotify-clone/ERB1haVCPivdCWxgpT91GG4kWwur) failed while publishing the media image: `repository has reached the maximum allowed number of images`.
- [Mobile Playback VM](https://github.com/6NCLegend9/Spotify-clone/actions/runs/40000199277/job/120573999558) exhausted its 20-minute job limit downloading Ubuntu packages. Browser tests had not started.
- [Android 33](https://github.com/6NCLegend9/Spotify-clone/actions/runs/40000199083/job/120573999216) exhausted its 35-minute job limit downloading FFmpeg dependencies. Instrumentation had not started.

The package downloads selected Azure's Ubuntu mirror. The [exact runner image configuration](https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/scripts/build/configure-apt-sources.sh) already supplies signed Ubuntu archive/security fallbacks.

The recovery commit `e155f582f2aa321d55fb753c576ae759be20863e` also exposed a production-audit failure for [Zod GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), whose patched version is 4.6.6. Serwist 9.5.12 pins an older Zod; the existing `@serwist/next` override now selects 4.6.6 for that subtree. Only the resolved Zod version, tarball URL and integrity change in the lockfile. Serwist and unrelated dependency versions remain unchanged.

## Workflow changes

Both affected jobs use Ubuntu 24.04 and prefer those existing HTTPS Ubuntu mirrors. APT uses 15-second socket timeouts and one retry. Dependency installation has its own step deadline so a stalled download cannot consume the entire test budget.

The mobile job installs OS/window-manager dependencies separately from browser binaries. Chromium, Firefox, WebKit and actual window minimization remain covered. Android reuses FFmpeg when present, otherwise installs it without optional recommended packages. API 33 and 36 instrumentation remain covered. Overall job deadlines and test assertions remain unchanged.

## Registry recovery

The private `media` repository was at 50 images. The project had 23 retained deployments: 20 READY and three failed quota attempts, with no build in progress. No named sandboxes or repository sharing permissions were configured.

Before removing anything, each READY deployment's logged pushed digest was matched uniquely to an image in the complete registry inventory. All 20 referenced images and the newest 20 images were protected. Ten older, singly tagged images outside both sets were removed by exact ID after verifying their digest and tags against a fresh inventory.

The registry then contained 40 images. All 20 deployment images were verified present afterwards, including the untagged `788e8f6bf544…` image still referenced by an older deployment. Production continued to report commit `9e962793bed6c249a6583c3b7904d507a5e26386`; `/media-health` remained ready.

### Capacity maintenance

This is an operational cleanup, not an automatic retention service. At 45 images, repeat the complete reference audit before further releases:

1. List every deployment page and stop if any build is queued or running.
2. Match every retained deployment's pushed digest to the complete image inventory. Preserve unknown or ambiguous references, production/rollback versions, active previews and sandbox/shared consumers.
3. Protect recent images even when no deployment currently references them. A concurrent build may have just published its image.
4. Refresh both inventories before removal. Delete only individually verified unused IDs; never prune merely because a tag is absent.
5. Verify protected images, production version and media health after cleanup.

The installed CLI offers image inspection and deletion but does not establish deployment reference safety for the caller. Do not attach an unaudited delete-all or untagged-image cleanup command to CI.

## Verification

Local checks include actionlint 1.7.12, YAML parsing, syntax checks for all 18 Bash run steps, actual emitted mirror/APT configuration bytes, desktop release/delivery and mini-player regressions, background playback, mobile source eligibility and Android bridge/resolver/iframe lifecycle checks.

The full local web check passed: lint, TypeScript checks and the production build. Fresh hosted workflow and preview results must also pass before this recovery is considered verified; those results are recorded in the PR description. This work does not publish a signed Windows installer or establish a physical-device update.

