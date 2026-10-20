#!/usr/bin/env bash
set -euo pipefail
qa_root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$qa_root"
mkdir -p artifacts/production-android
# Read-only public metadata and download; preserve the exact public signature.
gh api repos/6NCLegend9/Spotify-clone/releases/tags/android-preview > artifacts/production-android/release.json
curl --fail --location --retry 2 --max-time 120 \
  --output artifacts/production-android/HayKasa-Android.apk \
  https://github.com/6NCLegend9/Spotify-clone/releases/download/android-preview/HayKasa-Android.apk
node docs/qa/android/production-smoke.cjs
