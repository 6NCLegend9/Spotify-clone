// Production SessionProvider/UI, real anonymous session endpoint, synthetic
// private APIs. No account credentials, production writes or provider requests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const output = path.join(root, "artifacts/auth-session");
const origin = "http://127.0.0.1:3021";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(output, { recursive: true });
const log = fs.createWriteStream(path.join(output, "server.log"));
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3021"], {
  cwd: root, env: { ...process.env, NEXTAUTH_URL: origin, NEXTAUTH_SECRET: "isolated-session-audit-secret", JWT_SECRET: "isolated-session-audit-secret" }, stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log); server.stderr.pipe(log);
let browser, page;
(async () => {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited ${server.exitCode}`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await pause(500);
  }
  assert(ready, "Production server starts");
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, androidWebViewport: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport, isMobile: device !== "desktop", hasTouch: device !== "desktop", serviceWorkers: "block" });
    await context.addInitScript(() => {
      delete Object.getPrototypeOf(navigator).serviceWorker;
      localStorage.setItem("toturialComplete", "true");
    });
    page = await context.newPage();
    const errors = [], protectedRequests = [];
    let sessionMode = "real-guest", sessionRequests = 0;
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let body = { success: true, data: [] };
      if (url.pathname === "/api/auth/session") {
        sessionRequests++;
        if (sessionMode === "real-guest") return route.continue();
        body = sessionMode === "account" ? { user: { id: "507f1f77bcf86cd799439013", name: "Synthetic account", email: "qa@example.invalid" }, expires: "2099-01-01T00:00:00Z" } : null;
      } else if (["/api/settings", "/api/language", "/api/userPlaylists", "/api/favourite", "/api/history", "/api/followedArtists"].includes(url.pathname)) {
        protectedRequests.push(url.pathname);
        if (url.pathname === "/api/settings") body = { authenticated: sessionMode === "account", settings: {} };
        if (url.pathname === "/api/language") body = { success: true, authenticated: sessionMode === "account", language: ["english"] };
        if (url.pathname === "/api/userPlaylists") body = { success: true, data: { playlists: [] } };
        if (url.pathname === "/api/favourite") body = { success: true, data: { favourites: [] } };
        if (url.pathname === "/api/followedArtists") body = { success: true, data: [], artists: [] };
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(origin + "/library/liked", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Liked Songs are yours to keep", exact: true }).waitFor();
    assert(sessionRequests > 0, "Fresh profile checks the real server session endpoint");
    assert.equal(await page.locator("[aria-label^='Account menu for ']").count(), 0, "Fresh profile has no account menu");
    assert.equal((await context.cookies()).some(cookie => /(?:^|-)session-token(?:\.|$)/.test(cookie.name)), false, "Fresh guest has no authentication cookie");
    assert.deepEqual(protectedRequests, [], "Fresh guest does not request account libraries or preferences");
    await page.screenshot({ path: path.join(output, `${device}-fresh-guest.png`) });

    // Stale local account caches and persisted preference ownership cannot sign
    // a guest in or expose the previous owner's queue/history.
    await page.evaluate(() => {
      const owner = "account:507f1f77bcf86cd799439013";
      const data = { version: 1, owner, savedAt: Date.now(), data: [{ id: "synthetic01", title: "Private synthetic history" }] };
      localStorage.setItem(`heykasa:history:v1:${encodeURIComponent(owner)}`, JSON.stringify(data));
      localStorage.setItem("persist:settings", JSON.stringify({ owner: JSON.stringify(owner), _persist: JSON.stringify({ version: 6, rehydrated: true }) }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Liked Songs are yours to keep", exact: true }).waitFor();
    await page.waitForFunction(() => !Object.keys(localStorage).some(key => key.startsWith("heykasa:history:v1:account")));
    assert.equal(await page.getByText("Private synthetic history", { exact: true }).count(), 0);
    assert.equal(await page.locator("[aria-label^='Account menu for ']").count(), 0, "Persisted account ownership does not authenticate a guest");

    // Model a previously valid server session being revoked while this window
    // is hidden. Foreground revalidation must clear the authenticated UI.
    sessionMode = "account";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("[aria-label='Account menu for Synthetic account']").waitFor();
    sessionMode = "revoked";
    const beforeRefresh = sessionRequests;
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      delete document.visibilityState;
    });
    await page.getByRole("heading", { name: "Liked Songs are yours to keep", exact: true }).waitFor({ timeout: 4000 });
    assert(sessionRequests > beforeRefresh, "Returning to the foreground revalidates the session");
    assert.equal(await page.locator("[aria-label^='Account menu for ']").count(), 0, "Revoked session loses account UI without a reload");
    assert.deepEqual(errors, [], "No unhandled auth or cache errors");
    results.push({ device, passed: true, coverage: ["real anonymous session endpoint", "no authentication cookie", "guest library access gate", "no guest private API calls", "persisted account caches cannot authenticate", "revoked session refreshed on foreground"] });
    await context.close();
  }
  const report = { passed: true, scope: "Production UI in isolated Chromium profiles; simulated session revocation and visibility events, not native cookie-store inspection", results };
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(async error => { await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {}); console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill("SIGTERM"); log.end(); });
