import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Exercise the publisher's provenance gate; fake GitHub never supplies an APK.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "haykasa-release-check-"));
const publisher = fileURLToPath(new URL("../../../scripts/publish-android-preview.mjs", import.meta.url));
try {
  fs.writeFileSync(path.join(fixture, "git"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  fs.writeFileSync(path.join(fixture, "gh"), `#!/usr/bin/env node
const endpoint = process.argv[3];
const result = endpoint.includes('/jobs?') ? { jobs: JSON.parse(process.env.QA_ANDROID_JOBS) }
  : endpoint.includes('/artifacts?') ? { artifacts: [] }
  : { status: 'completed', conclusion: 'success', path: '.github/workflows/android-ci.yml', head_repository: { full_name: '6NCLegend9/Spotify-clone' }, head_sha: 'a'.repeat(40) };
console.log(JSON.stringify(result));
`, { mode: 0o700 });
  const passed = name => ({ name, conclusion: "success" });
  const cases = [
    [[passed("apk"), passed("emulator")], true],
    [[passed("apk"), passed("Android 33 emulator"), passed("Android 36 emulator")], true],
    [[passed("apk"), passed("Android 33 emulator")], false],
    [[passed("apk"), passed("emulator"), passed("Android 33 emulator")], false],
    [[passed("apk"), passed("Android 33 emulator"), { name: "Android 36 emulator", conclusion: "failure" }], false],
    [[passed("Android 33 emulator"), passed("Android 36 emulator")], false],
    [[passed("apk"), { name: "emulator", conclusion: "failure" }], false],
    [[], false],
  ];
  for (const [jobs, accepted] of cases) {
    const result = spawnSync(process.execPath, [publisher], {
      cwd: fixture, encoding: "utf8",
      env: { ...process.env, PATH: `${fixture}${path.delimiter}${process.env.PATH}`, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "6NCLegend9/Spotify-clone", ANDROID_PREVIEW_RUN_ID: "123", QA_ANDROID_JOBS: JSON.stringify(jobs) },
    });
    assert.equal(result.status, 1, "Synthetic fixtures must never publish");
    assert.match(result.stderr, accepted ? /Exactly one unexpired Android debug artifact/ : /APK and all required emulator jobs must pass/);
  }
  console.log(`Android preview provenance: ${cases.length} legacy/matrix pass, failure and missing-job checks passed; no publication.`);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
