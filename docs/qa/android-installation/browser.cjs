// Production Settings UI with isolated synthetic APIs and APK bytes.
// This verifies installation guidance, not Samsung OS installation or approval.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../../..");
const output = path.join(root, "artifacts/android-installation");
const origin = "http://127.0.0.1:3021";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const syntheticApk = Buffer.from("Synthetic QA download; not an installable Android APK.\n");
fs.mkdirSync(output, { recursive: true });
const log = fs.createWriteStream(path.join(output, "server.log"));
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3022"], {
  cwd: root,
  env: { ...process.env, NEXTAUTH_URL: origin, NEXTAUTH_SECRET: "isolated-installation-secret", JWT_SECRET: "isolated-installation-secret" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log); server.stderr.pipe(log);
// Chromium's native anchor[download] path bypasses Playwright route handlers.
// Serve APK bytes at the real same-origin HTTP boundary, before Next receives it.
let downloadRequests = 0;
const downloadBoundary = http.createServer((request, response) => {
  if (new URL(request.url, origin).pathname === "/api/android/download") {
    downloadRequests++;
    response.writeHead(200, {
      "content-type": "application/vnd.android.package-archive",
      "content-disposition": 'attachment; filename="HayKasa-Android.apk"',
      "content-length": syntheticApk.length,
      "cache-control": "no-store",
    });
    response.end(syntheticApk);
    return;
  }
  const upstream = http.request({ hostname: "127.0.0.1", port: 3022, path: request.url, method: request.method, headers: request.headers }, forwarded => {
    response.writeHead(forwarded.statusCode, forwarded.headers);
    forwarded.pipe(response);
  });
  upstream.on("error", () => { if (!response.headersSent) response.writeHead(503); response.end(); });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => { if (!response.writableEnded) upstream.destroy(); });
  request.pipe(upstream);
});
let browser, currentPage;
const results = [];

(async () => {
  await new Promise((resolve, reject) => {
    downloadBoundary.once("error", reject);
    downloadBoundary.listen(3021, "127.0.0.1", resolve);
  });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited ${server.exitCode}`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await pause(500);
  }
  assert(ready, "Production server starts");
  browser = await chromium.launch({ headless: true });
  const viewports = { narrow: { width: 320, height: 720 }, mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 1000 } };
  for (const [device, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport, isMobile: device !== "desktop", hasTouch: device !== "desktop", acceptDownloads: true, serviceWorkers: "block", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      delete Object.getPrototypeOf(navigator).serviceWorker;
      localStorage.setItem("toturialComplete", "true");
    });
    const page = await context.newPage(); currentPage = page;
    const errors = [];
    let manifestMode = "available", manifestRequests = 0, releaseManifest;
    const previousDownloadRequests = downloadRequests;
    let manifestGate = new Promise(resolve => { releaseManifest = resolve; });
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let body = { success: true, data: [] };
      if (url.pathname === "/api/auth/session") body = { user: { id: "507f1f77bcf86cd799439013", name: "Installation QA", email: "qa@example.invalid" }, expires: "2099-01-01T00:00:00Z" };
      if (url.pathname === "/api/settings") body = { success: true, authenticated: true, settings: { privateSession: false, explicitContent: true }, genres: [] };
      if (url.pathname === "/api/language") body = { success: true, authenticated: true, language: ["English"] };
      if (url.pathname === "/api/genres") body = { success: true, genres: [], tree: [], personal: [] };
      if (url.pathname === "/api/userPlaylists") body = { success: true, data: { playlists: [] } };
      if (url.pathname === "/api/followedArtists") body = { success: true, data: [], artists: [] };
      if (url.pathname === "/api/favourite") body = { success: true, data: { favourites: [] } };
      if (url.pathname === "/api/media/resolve") body = { enabled: false };
      if (url.pathname === "/api/desktop/manifest") body = { published: false };
      if (url.pathname === "/api/android/manifest") {
        manifestRequests++;
        const mode = manifestMode;
        if (manifestGate) await manifestGate;
        if (mode === "error") return route.fulfill({ status: 503, headers: { "retry-after": "0" }, contentType: "application/json", body: JSON.stringify({ available: false, message: "Synthetic release lookup outage" }) });
        body = mode === "unavailable" ? { available: false } : { available: true, downloadUrl: "/api/android/download", sizeBytes: 5026587, sha256: "a".repeat(64), preview: true, minimumAndroid: "6.0" };
      }
      if (url.pathname === "/api/android/download") {
        // Some engines route downloads; all engines use the same local byte boundary.
        return route.continue();
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });

    const card = page.locator("[data-testid='android-download-card']");
    const details = card.locator("details");
    const summary = card.locator("summary");
    const waitHelp = open => page.waitForFunction(expected => document.querySelector("[data-testid='android-download-card'] details")?.open === expected, open);
    const assertFits = async state => {
      const geometry = await card.evaluate(node => {
        const bounds = node.getBoundingClientRect();
        return { pageOverflow: document.documentElement.scrollWidth > innerWidth + 2, cardOverflow: node.scrollWidth > node.clientWidth + 2, left: bounds.left, right: bounds.right, width: innerWidth };
      });
      assert.equal(geometry.pageOverflow, false, `${device}: ${state} has no page overflow`);
      assert.equal(geometry.cardOverflow, false, `${device}: ${state} has no download-card overflow`);
      assert(geometry.left >= -2 && geometry.right <= geometry.width + 2, `${device}: ${state} card stays within viewport`);
    };

    await page.goto(origin + "/settings", { waitUntil: "domcontentloaded" });
    await card.getByRole("button", { name: "Checking download…", exact: true }).waitFor();
    assert.equal(await card.getByRole("button", { name: "Checking download…", exact: true }).isDisabled(), true, "Loading disables APK download");
    await card.getByText(/Samsung Auto Blocker can prevent installation/).waitFor();
    await assertFits("loading");
    releaseManifest(); manifestGate = null;
    const download = card.getByRole("link", { name: "Download for Android", exact: true });
    await download.waitFor();
    assert.equal(await download.getAttribute("href"), "/api/android/download");
    assert.equal(await download.getAttribute("aria-describedby"), "android-install-note", "Download is described by the Samsung installation note");
    await card.getByText("Android 6.0+ · Preview · 4.8 MB", { exact: true }).waitFor();
    assert.equal(await details.evaluate(node => node.open), false, "Installation help starts collapsed");
    await summary.focus();
    await page.keyboard.press("Enter");
    await waitHelp(true);
    await card.getByText(/Signing an APK does not bypass Auto Blocker/).waitFor();
    assert.equal(await details.locator("ol li").count(), 4, "Manual installation guidance includes restoring phone settings");
    await assertFits("keyboard-expanded help");
    await summary.focus();
    await page.keyboard.press("Space");
    await waitHelp(false);

    const [apk] = await Promise.all([page.waitForEvent("download"), download.click()]);
    assert.equal(apk.suggestedFilename(), "HayKasa-Android.apk", "Download preserves the APK filename");
    assert.equal(await apk.failure(), null, "Synthetic APK download completes");
    assert.equal(downloadRequests - previousDownloadRequests, 1, "A single click starts one APK download");
    const downloadedBytes = fs.readFileSync(await apk.path());
    assert.deepEqual(downloadedBytes, syntheticApk, "The isolated fixture downloads only synthetic bytes");
    await waitHelp(true);
    await assertFits("download-expanded help");
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${device}-installation-help.png`), fullPage: false });
    assert.equal(await card.getByRole("link", { name: "Use web app", exact: true }).getAttribute("href"), "/");
    await card.getByRole("link", { name: "Use web app", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/");
    assert.equal(downloadRequests - previousDownloadRequests, 1, "Browser fallback does not download another APK");

    manifestMode = "unavailable";
    await page.goto(origin + "/settings", { waitUntil: "domcontentloaded" });
    const unavailable = card.getByRole("button", { name: "Android download unavailable", exact: true });
    await unavailable.waitFor();
    assert.equal(await unavailable.isDisabled(), true, "Unavailable releases cannot be downloaded");
    assert.equal(await card.getByRole("link", { name: "Download for Android", exact: true }).count(), 0);
    await card.getByRole("button", { name: "Try again", exact: true }).waitFor();
    await assertFits("missing release");

    manifestMode = "error";
    await page.goto(origin + "/settings", { waitUntil: "domcontentloaded" });
    await unavailable.waitFor();
    const failedRequestCount = manifestRequests;
    await card.getByText("The Android download is temporarily unavailable. Please try again.", { exact: true }).waitFor();
    manifestMode = "available";
    manifestGate = new Promise(resolve => { releaseManifest = resolve; });
    await card.getByRole("button", { name: "Try again", exact: true }).click();
    const checking = card.getByRole("button", { name: "Checking download…", exact: true });
    await checking.waitFor();
    assert.equal(await checking.isDisabled(), true, "Retry keeps the download disabled while rechecking");
    await page.waitForFunction(() => document.querySelector("[data-testid='android-download-card'] [role='status']")?.textContent === "Checking download…");
    releaseManifest(); manifestGate = null;
    await download.waitFor();
    assert.equal(manifestRequests, failedRequestCount + 1, "Retry makes exactly one fresh manifest request");
    assert.equal(await card.getByRole("button", { name: "Try again", exact: true }).count(), 0, "Successful retry clears the error action");
    await assertFits("successful retry");
    assert.equal(await page.getByText("Some account preferences couldn't sync.", { exact: false }).count(), 0, "Isolated account preferences sync successfully");
    assert.deepEqual(errors, [], "Production Settings UI has no unhandled exceptions");
    results.push({ device, viewport, passed: true, coverage: ["loading", "pre-download Samsung explanation", "accessible download description", "keyboard help toggle", "download expands help", "APK filename and synthetic bytes", "browser fallback", "unavailable release", "lookup failure", "retry loading and recovery", "responsive layout", "no unhandled UI exceptions"] });
    await context.close();
  }
  const report = { passed: true, scope: "Production Settings UI with synthetic APIs and APK bytes; does not test Samsung OS installation", results };
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(async error => {
  await currentPage?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  console.error(error); process.exitCode = 1;
}).finally(async () => { await browser?.close(); downloadBoundary.close(); server.kill("SIGTERM"); log.end(); });
