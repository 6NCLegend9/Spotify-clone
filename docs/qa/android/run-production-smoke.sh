#!/usr/bin/env bash
set -euo pipefail
qa_root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$qa_root"
mkdir -p artifacts/production-android
# Follow the APK actually offered in Settings, including future versioned previews.
qa_download_url="$(curl --fail --silent --show-error --head --max-time 30 --output /dev/null --write-out '%{redirect_url}' https://haykasa.vercel.app/api/android/download)"
qa_release_tag="$(node - "$qa_download_url" <<'NODE'
const assert = require('node:assert/strict');
const url = new URL(process.argv[2]);
assert.equal(url.origin, 'https://github.com');
assert.equal(url.search, '');
assert.equal(url.hash, '');
const match = url.pathname.match(/^\/6NCLegend9\/Spotify-clone\/releases\/download\/(android-preview(?:-[a-f0-9]{40})?)\/HayKasa-Android\.apk$/);
assert.ok(match, 'Settings must select a canonical HayKasa Android release');
console.log(match[1]);
NODE
)"
gh api "repos/6NCLegend9/Spotify-clone/releases/tags/$qa_release_tag" > artifacts/production-android/release.json
curl --fail --location --retry 2 --max-time 120 \
  --max-filesize 33554432 \
  --output artifacts/production-android/HayKasa-Android.apk \
  "$qa_download_url"
node docs/qa/android/production-smoke.cjs
