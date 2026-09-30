# PR #19 Unified Web/Desktop + Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HayKasa use one product renderer across browser and Electron, enforce a single Desktop capability contract, add real Web-in-Electron verification, and remove verified performance waste without weakening playback or Desktop security.

**Architecture:** The root Next.js application remains the only product frontend. Electron stays a thin native shell that loads the root renderer and exposes a narrow preload bridge. A root-owned Desktop contract generates the packaged Electron representation; CI validates the real root renderer inside Electron. Performance work isolates high-frequency YouTube clock updates from broad React commits and reduces large-playlist row work while preserving playback, account isolation, accessibility, and release security.

**Tech Stack:** Next.js 15.5, React 18, Redux Toolkit, Electron 44, Node 22, Playwright, GitHub Actions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-24-pr19-unified-web-desktop-performance-design.md`

## Global Constraints

- All implementation changes stay on `refactor/unify-web-desktop-pr19` and PR #19 until the user approves merge.
- `src/**` remains the single product UI/source of truth.
- `desktop/**` remains a native shell; do not add a second React/product frontend there.
- Browser mode must work when `window.heykasaDesktop` does not exist.
- Native capabilities must be feature-detected rather than inferred from Desktop version numbers.
- Keep `nodeIntegration: false`, context isolation, sandboxing, trusted-origin navigation, sender validation, signed stable/beta updates, and the existing auth handoff.
- A pure web/product change must not require a new Windows installer.
- Do not add global private-response caching or cross-account request sharing.
- Performance changes require repeatable before/after evidence.
- Do not change Electron `backgroundThrottling: false` unless tests prove background playback, Jam state, and native bridge behavior remain correct.
- Do not add speculative memoization or a new state-management framework.

## Review Focus

1. **Older installed Desktop shell opens a newer web build:** optional native features must hide/degrade while normal browsing and playback stay usable; Task 1 and Task 4 test this.
2. **Browser session has no Electron bridge:** shared components must not throw or render Desktop-only actions; Task 1 and Task 3 test this.
3. **Lyrics/PiP is open while YouTube time advances every 120 ms:** only clock subscribers should update at that frequency; full-player commits must not follow the engine poll; Task 5 tests this.
4. **A 500-track playlist changes active song or removes one row:** unaffected rows must keep stable renders/actions and keyboard/context behavior; Task 7 tests this.
5. **Desktop is hidden/backgrounded during playback:** decorative work may stop, but playback/Jam/native commands must continue; Task 6 tests this.

---

### Task 1: Canonical Desktop Capability Contract

**Files:**
- Create: `contracts/desktop.json`
- Create: `scripts/generate-desktop-contract.mjs`
- Create: `src/generated/desktopContract.mjs`
- Create: `desktop/src/generated/desktopContract.mjs`
- Modify: `desktop/src/config.mjs`
- Modify: `src/app/api/desktop/manifest/route.js`
- Modify: `src/utils/desktopEnvironment.js`
- Modify: `package.json`
- Test: `test/desktopContract.test.mjs`
- Test: `desktop/test/config.test.mjs`

**Interfaces:**
- Consumes: existing capability names and `DESKTOP_API_VERSION = 1`.
- Produces: `CURRENT_DESKTOP_API_VERSION`, `KNOWN_DESKTOP_CAPABILITIES`, generated Electron constants, and `npm run generate:desktop-contract`.

- [ ] **Step 1: Write the failing contract tests**

Create `test/desktopContract.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("desktop contract is canonical and generated outputs match it", async () => {
  const contract = JSON.parse(await readFile(path.join(root, "contracts/desktop.json"), "utf8"));
  assert.equal(contract.apiVersion, 1);
  assert.equal(new Set(contract.capabilities).size, contract.capabilities.length);
  assert.deepEqual(contract.capabilities, [
    "discordPresenceV1",
    "updaterV1",
    "autoLaunchV1",
    "desktopPreferencesV1",
    "appearanceProfilesV1",
    "trayV1",
    "diagnosticsV1",
    "authV1",
  ]);

  const webGenerated = await readFile(path.join(root, "src/generated/desktopContract.mjs"), "utf8");
  const desktopGenerated = await readFile(path.join(root, "desktop/src/generated/desktopContract.mjs"), "utf8");
  for (const capability of contract.capabilities) {
    assert.match(webGenerated, new RegExp(JSON.stringify(capability)));
    assert.match(desktopGenerated, new RegExp(JSON.stringify(capability)));
  }
  assert.match(webGenerated, /CURRENT_DESKTOP_API_VERSION = 1/);
  assert.match(desktopGenerated, /DESKTOP_API_VERSION = 1/);
});
```

Extend `desktop/test/config.test.mjs` so it imports `DESKTOP_API_VERSION` and `DESKTOP_CAPABILITIES` from `../src/config.mjs` and asserts the exact list above.

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
node --test test/desktopContract.test.mjs
npm --prefix desktop test
```

Expected: the root contract/generated files do not exist yet, so the new root test fails.

- [ ] **Step 3: Add the canonical contract and generator**

Create `contracts/desktop.json`:

```json
{
  "apiVersion": 1,
  "capabilities": [
    "discordPresenceV1",
    "updaterV1",
    "autoLaunchV1",
    "desktopPreferencesV1",
    "appearanceProfilesV1",
    "trayV1",
    "diagnosticsV1",
    "authV1"
  ]
}
```

Create `scripts/generate-desktop-contract.mjs` with deterministic validation and output:

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "contracts/desktop.json");
const contract = JSON.parse(await readFile(sourcePath, "utf8"));

if (!Number.isInteger(contract.apiVersion) || contract.apiVersion < 1) {
  throw new Error("Desktop apiVersion must be a positive integer.");
}
if (!Array.isArray(contract.capabilities) || contract.capabilities.some((value) => typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9]+V\d+$/.test(value))) {
  throw new Error("Desktop capabilities must use stable versioned identifiers.");
}
if (new Set(contract.capabilities).size !== contract.capabilities.length) {
  throw new Error("Desktop capabilities must be unique.");
}

const banner = "// Generated by scripts/generate-desktop-contract.mjs. Do not edit by hand.\n";
const list = JSON.stringify(contract.capabilities, null, 2);

const outputs = [
  {
    file: path.join(root, "src/generated/desktopContract.mjs"),
    body: `${banner}export const CURRENT_DESKTOP_API_VERSION = ${contract.apiVersion};\nexport const KNOWN_DESKTOP_CAPABILITIES = Object.freeze(${list});\n`,
  },
  {
    file: path.join(root, "desktop/src/generated/desktopContract.mjs"),
    body: `${banner}export const DESKTOP_API_VERSION = ${contract.apiVersion};\nexport const DESKTOP_CAPABILITIES = Object.freeze(${list});\n`,
  },
];

for (const output of outputs) {
  await mkdir(path.dirname(output.file), { recursive: true });
  await writeFile(output.file, output.body, "utf8");
}
```

Run the generator once and commit both generated modules.

- [ ] **Step 4: Consume generated constants in Web and Electron**

Change `desktop/src/config.mjs` from local literal constants to:

```js
import {
  DESKTOP_API_VERSION,
  DESKTOP_CAPABILITIES,
} from "./generated/desktopContract.mjs";

export { DESKTOP_API_VERSION, DESKTOP_CAPABILITIES };
```

Keep `PRODUCT_NAME`, URLs, intervals, and `desktopAppUrl` in `config.mjs`.

In `src/app/api/desktop/manifest/route.js`, import:

```js
import { CURRENT_DESKTOP_API_VERSION } from "../../../../generated/desktopContract.mjs";
```

and change the fallback:

```js
desktopApiVersion: Number.isInteger(input.desktopApiVersion) && input.desktopApiVersion > 0
  ? input.desktopApiVersion
  : CURRENT_DESKTOP_API_VERSION,
```

In `src/utils/desktopEnvironment.js`, import `KNOWN_DESKTOP_CAPABILITIES` and add:

```js
const KNOWN_CAPABILITIES = new Set(KNOWN_DESKTOP_CAPABILITIES);

export function isKnownDesktopCapability(capability) {
  return KNOWN_CAPABILITIES.has(capability);
}
```

Do not discard unknown future capabilities returned by an installed shell; preserve them in `getHeyKasaDesktopInfo()` for forward compatibility.

- [ ] **Step 5: Add package scripts and stale-output verification**

Add to root `package.json`:

```json
"generate:desktop-contract": "node scripts/generate-desktop-contract.mjs",
"check:desktop-contract": "node scripts/generate-desktop-contract.mjs && git diff --exit-code -- src/generated/desktopContract.mjs desktop/src/generated/desktopContract.mjs"
```

Do not add generation to runtime startup; generated files must be committed so packaging is deterministic.

- [ ] **Step 6: Run contract tests**

Run:

```bash
npm run check:desktop-contract
node --test test/desktopContract.test.mjs test/desktopManifest.test.mjs
npm --prefix desktop test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add contracts/desktop.json scripts/generate-desktop-contract.mjs src/generated/desktopContract.mjs desktop/src/generated/desktopContract.mjs desktop/src/config.mjs src/app/api/desktop/manifest/route.js src/utils/desktopEnvironment.js package.json test/desktopContract.test.mjs desktop/test/config.test.mjs
git commit -m "refactor: centralize desktop capability contract"
```

---

### Task 2: One-Command Local Web + Desktop Development

**Files:**
- Create: `scripts/desktop-dev-lib.mjs`
- Create: `scripts/desktop-dev.mjs`
- Modify: `package.json`
- Modify: `desktop/README.md`
- Test: `test/desktopDev.test.mjs`

**Interfaces:**
- Consumes: Electron's existing `HEYKASA_DESKTOP_URL` loopback override and `LOCAL_DEV_APP_URL=http://localhost:3003`.
- Produces: `npm run desktop:dev`, `waitForHttp(url, options)`, and deterministic child-process cleanup.

- [ ] **Step 1: Write failing orchestration tests**

Create `test/desktopDev.test.mjs`:

```js
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { waitForHttp } from "../scripts/desktop-dev-lib.mjs";

test("desktop dev readiness waits for a successful local HTTP response", async (t) => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.statusCode = requests < 2 ? 503 : 200;
    response.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  await waitForHttp(`http://127.0.0.1:${address.port}`, {
    timeoutMs: 2000,
    intervalMs: 25,
  });
  assert.ok(requests >= 2);
});

test("desktop dev readiness times out instead of hanging forever", async () => {
  await assert.rejects(
    waitForHttp("http://127.0.0.1:1", { timeoutMs: 100, intervalMs: 20 }),
    /did not become ready/,
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test test/desktopDev.test.mjs
```

Expected: FAIL because `desktop-dev-lib.mjs` does not exist.

- [ ] **Step 3: Implement the readiness helper**

Create `scripts/desktop-dev-lib.mjs`:

```js
export async function waitForHttp(url, {
  timeoutMs = 90_000,
  intervalMs = 250,
  fetchImpl = fetch,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url, { cache: "no-store" });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`HayKasa web renderer did not become ready at ${url}.`);
}

export function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    child.kill();
    return;
  }
  child.kill("SIGTERM");
}
```

- [ ] **Step 4: Implement the root-owned launcher**

Create `scripts/desktop-dev.mjs`:

```js
import { spawn } from "node:child_process";
import { stopChild, waitForHttp } from "./desktop-dev-lib.mjs";

const port = 3003;
const origin = `http://127.0.0.1:${port}`;
let web;
let desktop;
let closing = false;

const close = () => {
  if (closing) return;
  closing = true;
  stopChild(desktop);
  stopChild(web);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
process.on("exit", close);

web = spawn(process.execPath, [
  "node_modules/next/dist/bin/next",
  "dev",
  "--turbopack",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
], { stdio: "inherit", env: process.env });

try {
  await waitForHttp(origin);
  desktop = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["--prefix", "desktop", "start"],
    {
      stdio: "inherit",
      env: { ...process.env, HEYKASA_DESKTOP_URL: origin },
    },
  );
  const code = await new Promise((resolve, reject) => {
    desktop.once("error", reject);
    desktop.once("exit", resolve);
  });
  process.exitCode = Number.isInteger(code) ? code : 1;
} finally {
  close();
}
```

Add to root `package.json`:

```json
"desktop:dev": "node scripts/desktop-dev.mjs"
```

- [ ] **Step 5: Update Desktop development documentation**

Replace the manual three-command local renderer example in `desktop/README.md` with:

```bash
npm run desktop:dev
```

Keep the explicit `HEYKASA_DESKTOP_URL` instructions as an advanced/manual fallback and state that production packaged builds ignore arbitrary remote overrides.

- [ ] **Step 6: Verify**

Run:

```bash
node --test test/desktopDev.test.mjs
npm run lint -- --quiet
```

Then manually run `npm run desktop:dev` in a Desktop-capable environment and verify Electron loads the local root app.

- [ ] **Step 7: Commit**

```bash
git add scripts/desktop-dev-lib.mjs scripts/desktop-dev.mjs package.json desktop/README.md test/desktopDev.test.mjs
git commit -m "dev: run shared web renderer with desktop shell"
```

---

### Task 3: Real Web-in-Electron Smoke Test

**Files:**
- Create: `desktop/scripts/smoke-renderer.mjs`
- Modify: `desktop/package.json`
- Modify: `desktop/package-lock.json`
- Modify: `src/app/search/page.jsx` only if a stable existing accessibility selector is missing; prefer no product change.
- Test: `desktop/scripts/smoke-renderer.mjs`

**Interfaces:**
- Consumes: a running local HayKasa origin supplied as `HEYKASA_DESKTOP_SMOKE_URL`.
- Produces: `npm --prefix desktop run smoke:renderer` and a JSON summary on stdout.

- [ ] **Step 1: Add Playwright as an explicit Desktop dev dependency**

Add `playwright` at the same version as the root `@playwright/test` package:

```json
"playwright": "1.63.0"
```

Run:

```bash
npm --prefix desktop install --save-dev playwright@1.63.0
```

The dependency is dev-only and is not included in the packaged `files` list.

- [ ] **Step 2: Write the Electron smoke script**

Create `desktop/scripts/smoke-renderer.mjs`:

```js
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = String(process.env.HEYKASA_DESKTOP_SMOKE_URL || "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
  throw new Error("HEYKASA_DESKTOP_SMOKE_URL must be a loopback HTTP origin.");
}

const errors = [];
const startedAt = performance.now();
const app = await electron.launch({
  args: [desktopRoot],
  cwd: desktopRoot,
  env: {
    ...process.env,
    HEYKASA_DESKTOP_URL: origin,
  },
});

try {
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.waitForURL(`${origin}/**`);
  const bridge = await page.evaluate(() => ({
    hasDesktop: typeof window.heykasaDesktop?.getInfo === "function",
    hasNodeRequire: typeof window.require !== "undefined",
    bodyText: document.body?.innerText || "",
  }));
  assert.equal(bridge.hasDesktop, true);
  assert.equal(bridge.hasNodeRequire, false);

  await page.goto(`${origin}/search`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Browse all", exact: true }).waitFor();
  await page.getByRole("combobox", {
    name: "Search songs, artists, playlists, and genres",
    exact: true,
  }).waitFor();

  const info = await page.evaluate(() => window.heykasaDesktop.getInfo());
  assert.ok(Number.isInteger(info.apiVersion) && info.apiVersion >= 1);
  assert.ok(Array.isArray(info.capabilities));

  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify({
    ok: true,
    usableMs: Math.round(performance.now() - startedAt),
    url: page.url(),
    apiVersion: info.apiVersion,
    capabilities: info.capabilities,
  }) + "\n");
} finally {
  await app.close();
}
```

- [ ] **Step 3: Add the Desktop script**

Add:

```json
"smoke:renderer": "node scripts/smoke-renderer.mjs"
```

to `desktop/package.json`.

- [ ] **Step 4: Run locally against the shared renderer**

Start the root renderer on port 3003, then run:

```bash
HEYKASA_DESKTOP_SMOKE_URL=http://127.0.0.1:3003 npm --prefix desktop run smoke:renderer
```

Expected: JSON with `ok:true`, no renderer errors, and the `/search` URL.

- [ ] **Step 5: Verify browser-only behavior still has no native dependency**

Run the existing Playwright browser suite for search/library and add one assertion to an existing browser test:

```js
expect(await page.evaluate(() => typeof window.heykasaDesktop)).toBe("undefined");
```

The normal browser must still render Search and Library successfully.

- [ ] **Step 6: Commit**

```bash
git add desktop/scripts/smoke-renderer.mjs desktop/package.json desktop/package-lock.json e2e
git commit -m "test: verify shared renderer inside electron"
```

---

### Task 4: Split Routine Renderer CI From Heavy Native Packaging

**Files:**
- Modify: `.github/workflows/desktop-ci.yml`
- Create: `.github/workflows/desktop-package-ci.yml`
- Modify: `.github/workflows/desktop-release.yml` only to add contract generation/check before packaging.
- Test: `test/desktopCi.test.mjs`
- Modify: `test/releaseGates.test.mjs`

**Interfaces:**
- Consumes: `npm run check:desktop-contract`, `npm --prefix desktop run smoke:renderer`.
- Produces: routine renderer compatibility gate for product changes and separate Windows package gate for native changes.

- [ ] **Step 1: Write failing workflow-contract tests**

Create `test/desktopCi.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("desktop CI watches the shared product renderer and runs Electron smoke", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/desktop-ci.yml"), "utf8");
  assert.match(workflow, /- "src\/\*\*"/);
  assert.match(workflow, /- "contracts\/\*\*"/);
  assert.match(workflow, /check:desktop-contract/);
  assert.match(workflow, /smoke:renderer/);
  assert.doesNotMatch(workflow, /Build unsigned Windows installer/);
});

test("desktop package CI owns Windows packaging for native changes", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/desktop-package-ci.yml"), "utf8");
  assert.match(workflow, /- "desktop\/\*\*"/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /npm run dist/);
  assert.match(workflow, /prepare-github-release/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test test/desktopCi.test.mjs test/releaseGates.test.mjs
```

Expected: FAIL because the package workflow does not exist and the current Desktop CI still contains the Windows build.

- [ ] **Step 3: Make `desktop-ci.yml` the shared-renderer compatibility workflow**

Its PR/push paths must include:

```yaml
paths:
  - "src/**"
  - "public/**"
  - "contracts/**"
  - "scripts/desktop-dev*.mjs"
  - "package.json"
  - "package-lock.json"
  - "next.config.js"
  - "desktop/src/**"
  - "desktop/scripts/smoke-renderer.mjs"
  - "desktop/package.json"
  - "desktop/package-lock.json"
  - ".github/workflows/desktop-ci.yml"
```

Jobs:

1. root web/contract tests;
2. root production build;
3. Linux Electron smoke using `xvfb-run`.

The smoke steps must:

```yaml
- run: npm ci --no-audit --no-fund
- run: npm --prefix desktop ci --no-audit --no-fund
- run: npm run check:desktop-contract
- run: npm run build
- name: Start production renderer
  run: |
    npm start -- --hostname 127.0.0.1 --port 3003 > /tmp/heykasa-next.log 2>&1 &
    echo $! > /tmp/heykasa-next.pid
- name: Wait for renderer
  run: node -e "const u='http://127.0.0.1:3003/search';let n=0;const t=setInterval(async()=>{try{const r=await fetch(u);if(r.ok){clearInterval(t);process.exit(0)}}catch{}if(++n>120){clearInterval(t);process.exit(1)}},500)"
- name: Verify shared renderer in Electron
  env:
    HEYKASA_DESKTOP_SMOKE_URL: http://127.0.0.1:3003
  run: xvfb-run -a npm --prefix desktop run smoke:renderer
```

Add an `always()` cleanup step that kills the stored Next PID.

- [ ] **Step 4: Move Windows packaging to `desktop-package-ci.yml`**

Create a workflow triggered by native/package/release paths only:

```yaml
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - "desktop/**"
      - "contracts/**"
      - "src/app/api/desktop/**"
      - "src/utils/desktop*.mjs"
      - ".github/workflows/desktop-package-ci.yml"
      - ".github/workflows/desktop-release.yml"
  pull_request:
    paths:
      - "desktop/**"
      - "contracts/**"
      - "src/app/api/desktop/**"
      - "src/utils/desktop*.mjs"
      - ".github/workflows/desktop-package-ci.yml"
      - ".github/workflows/desktop-release.yml"
```

Move the current Windows `npm test`, runtime audit, `npm run dist`, installer verification, release-bundle preparation, and artifact upload into this workflow.

Before package build, run the root contract generator/check.

- [ ] **Step 5: Keep release security unchanged**

In `desktop-release.yml`, add contract verification before the existing web/native gate. Do not remove:

- stable-from-main check;
- protected `desktop-release` environment;
- Authenticode check;
- HMAC manifest requirement;
- complete-bundle publication verification.

- [ ] **Step 6: Verify workflow tests**

Run:

```bash
node --test test/desktopCi.test.mjs test/releaseGates.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/desktop-ci.yml .github/workflows/desktop-package-ci.yml .github/workflows/desktop-release.yml test/desktopCi.test.mjs test/releaseGates.test.mjs
git commit -m "ci: test shared renderer separately from packaging"
```

---

### Task 5: Isolate the 120 ms YouTube Playback Clock From Full Player Rendering

**Files:**
- Create: `src/components/MusicPlayer/playbackClock.js`
- Create: `src/components/MusicPlayer/ClockedSyncedLyrics.jsx`
- Create: `src/components/MusicPlayer/ClockedCaptionKaraoke.jsx`
- Modify: `src/components/MusicPlayer/YouTubePlayer.jsx`
- Modify: `src/components/MusicPlayer/PictureInPictureWindow.jsx` or its current actual extension if TypeScript.
- Test: `test/playbackClock.test.mjs`
- Test: existing playback/lyrics E2E files that cover theater, lyrics, seeking, PiP.

**Interfaces:**
- Produces:
  - `createPlaybackClockStore(initial?)`
  - `usePlaybackClock(store)`
  - `clock.read()`
  - `clock.publish({ position, duration })`
  - `clock.subscribe(listener)`
- Consumers: high-frequency lyrics, caption karaoke, and Document-PiP UI.

- [ ] **Step 1: Write the pure clock-store tests**

Create `test/playbackClock.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createPlaybackClockStore } from "../src/components/MusicPlayer/playbackClock.js";

test("playback clock publishes only meaningful snapshot changes", () => {
  const clock = createPlaybackClockStore();
  let notifications = 0;
  const unsubscribe = clock.subscribe(() => { notifications += 1; });

  clock.publish({ position: 1.2, duration: 200 });
  clock.publish({ position: 1.2, duration: 200 });
  clock.publish({ position: 1.32, duration: 200 });

  assert.equal(notifications, 2);
  assert.deepEqual(clock.read(), { position: 1.32, duration: 200 });
  unsubscribe();
});

test("playback clock clamps invalid media values", () => {
  const clock = createPlaybackClockStore({ position: 5, duration: 10 });
  clock.publish({ position: -5, duration: Number.NaN });
  assert.deepEqual(clock.read(), { position: 0, duration: 0 });
});
```

- [ ] **Step 2: Implement the external clock**

Create `src/components/MusicPlayer/playbackClock.js`:

```js
"use client";

import { useSyncExternalStore } from "react";

function safe(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function createPlaybackClockStore(initial = {}) {
  let snapshot = {
    position: safe(initial.position),
    duration: safe(initial.duration),
  };
  const listeners = new Set();

  return {
    read: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next = {}) {
      const candidate = {
        position: safe(next.position),
        duration: safe(next.duration),
      };
      if (candidate.position === snapshot.position && candidate.duration === snapshot.duration) return;
      snapshot = candidate;
      listeners.forEach((listener) => listener());
    },
  };
}

export function usePlaybackClock(clock) {
  return useSyncExternalStore(clock.subscribe, clock.read, clock.read);
}
```

- [ ] **Step 3: Verify store tests**

Run:

```bash
node --test test/playbackClock.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Add clocked high-frequency consumers**

Create `ClockedSyncedLyrics.jsx`:

```jsx
"use client";

import SyncedLyrics from "./SyncedLyrics";
import { usePlaybackClock } from "./playbackClock";

export default function ClockedSyncedLyrics({ clock, duration, ...props }) {
  const snapshot = usePlaybackClock(clock);
  return (
    <SyncedLyrics
      {...props}
      duration={snapshot.duration || duration || 0}
      currentTime={snapshot.position}
    />
  );
}
```

Create `ClockedCaptionKaraoke.jsx` using the same pattern and the existing `CaptionKaraoke` component.

Modify Document-PiP so its time display subscribes to the clock rather than receiving parent `currentTime` every engine tick.

- [ ] **Step 5: Split engine polling from broad React time state**

In `YouTubePlayer.jsx`:

1. create the clock once:

```js
const playbackClockRef = useRef(null);
if (!playbackClockRef.current) playbackClockRef.current = createPlaybackClockStore();
const playbackClock = playbackClockRef.current;
const lastUiClockCommitRef = useRef(0);
```

2. inside `tickRef.current`, publish every engine tick:

```js
const visibleTime = safeMediaTime(seekPending ? guard.target : time);
const visibleDuration = safeMediaTime(dur);
playbackClock.publish({
  position: visibleTime,
  duration: visibleDuration,
});
```

3. keep broad React state bounded to roughly 500 ms and structural duration changes:

```js
const now = performance.now();
if (now - lastUiClockCommitRef.current >= 450) {
  lastUiClockCommitRef.current = now;
  setCurrentTime(visibleTime);
}
if (visibleDuration > 0) {
  setDuration((current) => current === visibleDuration ? current : visibleDuration);
}
```

4. after an explicit seek, previous, retry, or track switch, immediately publish/reset both the clock and low-frequency React state so controls never feel delayed.

5. handlers that only need the latest time should read:

```js
const livePosition = playbackClock.read().position;
```

instead of relying on a possibly 500 ms-old render value.

- [ ] **Step 6: Replace high-frequency prop paths**

Replace docked/mobile `SyncedLyrics`, caption karaoke, and Document-PiP high-frequency time props with the clocked wrappers/store.

Keep `PlayerDock` and ordinary fullscreen seekbar on the lower-frequency `currentTime`; a 450–500 ms visual step is adequate and prevents broad commits.

- [ ] **Step 7: Add render-frequency regression instrumentation**

Add a test-only `onRenderProbe` prop or an existing test hook at the smallest player presentation boundary, not production analytics.

In the existing Playwright playback fixture, simulate 20 engine ticks at 120 ms-equivalent advancement with lyrics open and assert:

- lyrics active line advances;
- the parent player probe count is substantially lower than 20;
- seek still changes the IFrame target immediately;
- previous-track behavior still uses the live clock when position is over three seconds;
- PiP time display advances.

Do not assert an invented CPU percentage.

- [ ] **Step 8: Run playback validation**

Run:

```bash
node --test test/playbackClock.test.mjs
npm run lint
npm run typecheck
npm run test:e2e -- --project=chromium
```

Then run the existing Firefox/WebKit/mobile player suites before final PR completion.

- [ ] **Step 9: Commit**

```bash
git add src/components/MusicPlayer/playbackClock.js src/components/MusicPlayer/ClockedSyncedLyrics.jsx src/components/MusicPlayer/ClockedCaptionKaraoke.jsx src/components/MusicPlayer/YouTubePlayer.jsx src/components/MusicPlayer/PictureInPictureWindow* test/playbackClock.test.mjs e2e
git commit -m "perf: isolate high-frequency playback clock"
```

---

### Task 6: Desktop Startup Revalidation + Background Performance Measurement

**Files:**
- Modify: `desktop/src/main.mjs`
- Modify: `desktop/scripts/smoke-renderer.mjs`
- Create: `desktop/test/rendererLoadPolicy.test.mjs`
- Modify: `docs/PERFORMANCE_REVIEW.md`

**Interfaces:**
- Consumes: renderer smoke's `usableMs`, existing WebUpdateNotifier build check, existing hidden-page animation guards.
- Produces: startup measurements and a validated renderer load policy.

- [ ] **Step 1: Write the load-policy regression test**

Create `desktop/test/rendererLoadPolicy.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("desktop renderer does not globally force Cache-Control no-cache on every application load", () => {
  const source = readFileSync(path.join(root, "src/main.mjs"), "utf8");
  assert.doesNotMatch(source, /extraHeaders:\s*["']Cache-Control:\s*no-cache/);
});
```

Initially this test must fail.

- [ ] **Step 2: Capture the pre-change Desktop startup baseline**

Using Task 3's smoke command, run at least five fresh Electron launches against the same local production build and record `usableMs`.

Save the exact command and the five values in the PR work log or commit message; do not average unrelated dev-server startup time into Electron renderer startup.

- [ ] **Step 3: Remove only the unconditional request override**

Change:

```js
await window.loadURL(appUrl, { extraHeaders: "Cache-Control: no-cache\n" });
```

to:

```js
await window.loadURL(appUrl);
```

Do not change server/CDN response caching, service-worker policy, session cookies, or the WebUpdateNotifier.

- [ ] **Step 4: Re-run freshness and startup checks**

Run five fresh Electron launches against the same local production build again.

Then run a two-build freshness check:

1. start build A and launch Desktop;
2. replace the local production build with build B using a distinct `HEYKASA_BUILD_ID`;
3. relaunch Desktop;
4. verify build B is loaded;
5. while build A is still open, verify the existing web update notifier detects the changed `/api/version` response and offers reload.

If freshness fails, revert the `loadURL` change and keep the regression test aligned with the proven behavior.

- [ ] **Step 5: Verify background behavior without changing Electron throttling**

Keep `backgroundThrottling: false` in this task.

Use Electron smoke/test instrumentation to hide the main window while mocked playback is active and assert:

- playback bridge reports still arrive;
- Desktop play/pause/skip commands still dispatch;
- Jam playback event reporting remains active;
- `LightPillar` and existing visibility-aware decorative animation code do not run frames while `document.hidden` is true.

The last assertion should be added to the existing LightPillar interaction/unit harness rather than inferred from Electron CPU.

- [ ] **Step 6: Document measured results**

Append a dated PR #19 section to `docs/PERFORMANCE_REVIEW.md` containing:

- before startup samples;
- after startup samples if the header removal is retained;
- whether the header removal was kept or reverted;
- confirmation that `backgroundThrottling` remained unchanged;
- the verified hidden-window behavior.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
npm --prefix desktop test
node --test test/desktopDev.test.mjs
```

Commit:

```bash
git add desktop/src/main.mjs desktop/scripts/smoke-renderer.mjs desktop/test/rendererLoadPolicy.test.mjs docs/PERFORMANCE_REVIEW.md
git commit -m "perf: validate desktop renderer startup policy"
```

---

### Task 7: Reduce Large Playlist Row Work Without Breaking Accessibility

**Files:**
- Create: `src/components/Library/PlaylistTrackRow.jsx`
- Modify: `src/components/Library/PlaylistDetail.jsx`
- Modify: `src/app/globals.css` or the existing library stylesheet that owns playlist row styles.
- Test: existing playlist Playwright spec(s)
- Create: `e2e/playlist-performance.spec.js` if no existing file has a suitable 500-track fixture.

**Interfaces:**
- Consumes: playlist track object, active track id, stable `onPlay(track)`, stable `onRemove(track)`.
- Produces: memoized `PlaylistTrackRow` with unchanged semantic controls and contextual actions.

- [ ] **Step 1: Add a 500-track browser fixture and render-count probe**

Create an authenticated mocked playlist response with 500 valid synthetic YouTube IDs and metadata.

The test must assert before optimization:

- heading and first row become usable;
- row 500 remains reachable by scrolling;
- keyboard focus can enter row actions;
- selecting a different active track does not destroy the list scroll container;
- a test-only row render probe can count renders for a row whose active status does not change.

- [ ] **Step 2: Extract a focused memoized row**

Create `PlaylistTrackRow.jsx`:

```jsx
"use client";

import { memo } from "react";
import { FiHeart, FiPlay, FiTrash2 } from "react-icons/fi";
import AddToQueueButton from "@/components/AddToQueueButton";
import ContextMenuTarget from "@/components/ContextMenuTarget";
import MediaImage from "@/components/MediaImage";

function PlaylistTrackRow({
  track,
  index,
  active,
  removable,
  liked,
  onPlay,
  onRemove,
  cleanText,
  formatAddedDate,
  formatDuration,
}) {
  return (
    <ContextMenuTarget
      className={`playlist-track-row group grid min-h-[66px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.075] md:grid-cols-[44px_minmax(160px,2fr)_minmax(100px,1fr)_60px_96px] lg:grid-cols-[44px_minmax(200px,2fr)_minmax(120px,1fr)_120px_70px_96px] ${active ? "bg-white/[0.06]" : ""}`}
    >
      <button type="button" aria-label={`Play ${cleanText(track.title)}`} onClick={() => onPlay(track)} className={`grid h-11 w-11 place-items-center rounded-full text-sm ${active ? "text-[#00e6e6]" : "text-gray-400 group-hover:text-white"}`}>
        <span className="group-hover:hidden">{index + 1}</span>
        <FiPlay className="hidden fill-current group-hover:block" />
      </button>
      <button type="button" onClick={() => onPlay(track)} className="flex min-w-0 items-center gap-3 text-left">
        <MediaImage src={track.thumbnail} size="mq" alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="h-11 w-11 shrink-0 rounded object-cover" />
        <span className="min-w-0">
          <span className={`block truncate text-sm font-semibold ${active ? "text-[#00e6e6]" : "text-white"}`}>{cleanText(track.title)}</span>
          <span className="mt-1 block truncate text-xs text-gray-400">{cleanText(track.channel)}</span>
        </span>
      </button>
      <span className="hidden truncate text-xs text-gray-400 md:block">-</span>
      <span className="hidden text-xs text-gray-400 lg:block">{formatAddedDate(track.addedAt)}</span>
      <span className="hidden text-right text-xs tabular-nums text-gray-400 md:block">{formatDuration(track.duration)}</span>
      <div className="flex items-center justify-end gap-1">
        <AddToQueueButton track={track} onRemove={removable ? () => onRemove(track) : undefined} removeLabel={liked ? "Remove from Liked Songs" : "Remove from playlist"} className="text-gray-500 opacity-100 hover:text-white sm:opacity-0 sm:group-hover:opacity-100" />
        {removable ? (
          <button type="button" aria-label={liked ? `Remove ${cleanText(track.title)} from Liked Songs` : `Remove ${cleanText(track.title)} from playlist`} onClick={() => onRemove(track)} className="grid h-11 w-11 place-items-center rounded-full text-gray-500 opacity-100 hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100">
            {liked ? <FiHeart className="fill-current text-[#00e6e6]" /> : <FiTrash2 />}
          </button>
        ) : null}
      </div>
    </ContextMenuTarget>
  );
}

export default memo(PlaylistTrackRow);
```

Use the repository's actual import path for `ContextMenuTarget` if its current path differs.

- [ ] **Step 3: Stabilize parent inputs**

In `PlaylistDetail.jsx`:

- select only the active ID rather than the entire YouTube video object:

```js
const activeYoutubeId = useSelector((state) => state.player.youtubeVideo?.id || "");
```

- wrap `playTrack` and `removeTrack` in `useCallback` after ensuring their dependency lists include all queue/mutation state they read;
- keep mutation rollback behavior unchanged;
- render `PlaylistTrackRow` with `active={activeYoutubeId === track.id}`.

- [ ] **Step 4: Add browser rendering containment**

Add:

```css
.playlist-track-row {
  content-visibility: auto;
  contain-intrinsic-size: 66px;
}
```

Do not use `display:none`, DOM removal, or custom windowing in this PR. The full semantic list remains in the DOM/accessibility tree while the browser may defer offscreen layout/paint.

- [ ] **Step 5: Verify 500-track behavior and row render stability**

Run the 500-track Playwright case and assert:

- first usable row time is captured;
- scrolling to the final row succeeds;
- search narrows the list correctly;
- context menu/removal still works;
- active-song change causes the old/new active rows to update while an unrelated probe row does not re-render because only playback time changed.

Record the before/after first-usable measurement as evidence; do not turn a noisy single-machine number into a hard CI budget.

- [ ] **Step 6: Run playlist regression matrix**

Run:

```bash
npm run lint
npm run typecheck
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=webkit
```

Then include the playlist scenarios in the mobile Chrome/Safari final matrix.

- [ ] **Step 7: Commit**

```bash
git add src/components/Library/PlaylistTrackRow.jsx src/components/Library/PlaylistDetail.jsx src/app/globals.css e2e
git commit -m "perf: reduce large playlist row rendering"
```

---

### Task 8: Final Shared-Renderer Hardening and PR #19 Verification

**Files:**
- Modify: `readme.md`
- Modify: `desktop/README.md`
- Modify: `docs/PERFORMANCE_REVIEW.md`
- Modify: PR #19 body after validation.

**Interfaces:**
- Consumes: all previous task commands and generated artifacts.
- Produces: a reviewed PR #19 with evidence and no direct push to `main`.

- [ ] **Step 1: Run source-of-truth audit**

Search the repository for product implementations under `desktop/**`.

Allowed local Desktop UI:

- `miniPlayer.html`;
- updater/native dialogs;
- native tray/menu content;
- offline/safe-mode native fallback.

Fail the audit if `desktop/**` contains a second implementation of Search, Library, playlists, lyrics, product Settings, Home, or the main player.

Document the result in the PR body.

- [ ] **Step 2: Run full root checks**

Run:

```bash
npm run check:desktop-contract
npm test
npm run lint
npm run typecheck
npm run build
npm run benchmark:production
```

All must pass.

- [ ] **Step 3: Run browser matrix**

Run the repository's configured projects for:

- Chromium desktop;
- Firefox desktop;
- WebKit desktop;
- Mobile Chrome;
- Mobile Safari.

Any retry/flaky result must be reported explicitly rather than converted into a clean pass claim.

- [ ] **Step 4: Run Desktop validation**

Run:

```bash
npm --prefix desktop test
```

Run the Web-in-Electron smoke against the production root build.

If native/package files changed, require the `desktop-package-ci.yml` Windows job to produce and verify the NSIS installer and updater bundle.

- [ ] **Step 5: Run final performance comparison**

Collect:

- production shared JS bytes;
- Search and Library usable shell measurements;
- long-task total from the existing benchmark;
- Electron smoke `usableMs`;
- player parent-render probe count with lyrics open;
- 500-track playlist first-usable measurement.

Compare against the branch baseline captured before each performance task.

Only claim improvements supported by those measurements.

- [ ] **Step 6: Update architecture documentation**

In `readme.md` and `desktop/README.md`, state explicitly:

```text
HayKasa has one product renderer: the root Next.js application.
The Windows app is a secure Electron host for that same renderer.
Web product releases update the browser and Desktop renderer together.
A new installer is required only for native-shell changes.
```

Also document `npm run desktop:dev`, the contract generator, renderer smoke, and the two Desktop CI workflows.

- [ ] **Step 7: Whole-branch code review**

Review specifically for:

- accidental Node/native exposure to the renderer;
- duplicate capability constants;
- Desktop-only product forks;
- cross-account cache/dedup mistakes;
- playback clock behavior changes;
- missing cleanup of timers/subscriptions/processes;
- new hidden-window work;
- workflow paths that can still skip renderer verification.

Fix findings before marking the PR ready.

- [ ] **Step 8: Update PR #19 body**

Include:

- architecture changes;
- performance before/after evidence;
- exact validation matrix;
- remaining risks;
- confirmation that `main` was not modified directly.

Keep PR #19 as the sole review surface until the user approves merge.

- [ ] **Step 9: Final commit**

```bash
git add readme.md desktop/README.md docs/PERFORMANCE_REVIEW.md
git commit -m "docs: finalize unified web desktop architecture"
```
