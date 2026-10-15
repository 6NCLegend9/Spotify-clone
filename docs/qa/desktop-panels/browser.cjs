// Real production UI with synthetic, account-scoped APIs and paused playback.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const output = path.join(root, "artifacts/desktop-panels");
fs.mkdirSync(output, { recursive: true });
const origin = "http://127.0.0.1:3016";
const log = fs.createWriteStream(path.join(output, "server.log"));
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3016"], {
  cwd: root,
  env: { ...process.env, NEXTAUTH_URL: origin, NEXTAUTH_SECRET: "isolated-panels-browser-secret", JWT_SECRET: "isolated-panels-browser-secret" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log); server.stderr.pipe(log);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const owner = "account:507f1f77bcf86cd799439013";
const artistId = "UCabcdefghijklmnopqrstuv";
const tracks = Array.from({ length: 4 }, (_, i) => ({
  id: `qa${String(i).padStart(9, "0")}`, title: i ? `Next song ${i}` : "Blue evening",
  channel: "Blue Artist", channelId: artistId, source: "youtube", queueEntryId: `qa-${i}`, duration: 200,
}));
const playlists = [{ _id: "507f1f77bcf86cd799439012", name: "Evening mix", songs: [], pinned: true }, { _id: "507f1f77bcf86cd799439014", name: "Morning mix", songs: [] }];
let browser, currentPage;
const results = [];
(async () => {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Server exited ${server.exitCode}`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await wait(1000);
  }
  assert(ready, "Production server starts");
  browser = await chromium.launch({ headless: true });
  for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, laptop: { width: 1181, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport, isMobile: device === "mobile", hasTouch: device === "mobile", serviceWorkers: "block", reducedMotion: "reduce" });
    await context.addInitScript(({ owner, tracks }) => {
      delete Object.getPrototypeOf(navigator).serviceWorker;
      localStorage.setItem("toturialComplete", "true");
      localStorage.setItem("heykasa.media.presentation", "audio");
      localStorage.setItem(`heykasa:playback:v1:${encodeURIComponent(owner)}`, JSON.stringify({ version: 3, owner, savedAt: Date.now(), youtubeVideo: tracks[0], youtubeQueue: tracks, queueMode: "collection", queueManualEnd: true, playbackContext: { type: "playlist", name: "Evening mix" } }));
    }, { owner, tracks });
    let artists = [{ name: "Blue Artist", channelId: artistId }];
    const errors = [], additions = [];
    const page = await context.newPage();
    currentPage = page;
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(root, "public/icon-192x192.png")) });
        return route.abort();
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/userPlaylists/songs" && route.request().method() === "POST") additions.push(route.request().postDataJSON());
      let body = { success: true, data: [] };
      if (url.pathname === "/api/auth/session") body = { user: { id: owner.slice(8), name: "Panel QA", email: "qa@example.invalid" }, expires: "2099-01-01T00:00:00Z" };
      if (url.pathname === "/api/settings") body = { authenticated: true, settings: { privateSession: false, explicitContent: false } };
      if (url.pathname === "/api/userPlaylists") body = { success: true, data: { playlists } };
      if (url.pathname === "/api/followedArtists") body = { success: true, data: artists.map(a => a.name), artists };
      if (url.pathname === "/api/favourite") body = { success: true, data: { favourites: tracks.map(t => t.id), favouriteDurations: Object.fromEntries(tracks.map(t => [t.id, 200])) } };
      if (url.pathname === "/api/youtube-videos") body = { tracks };
      if (url.pathname === "/api/media/resolve") body = { enabled: false };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(origin + "/library/liked", { waitUntil: "domcontentloaded" });
    await page.locator(".playlist-track-row").first().waitFor();
    const sidebar = page.locator("#app-sidebar");
    if (device === "mobile") await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await sidebar.getByText("Evening mix", { exact: true }).waitFor();
    const initialUrl = page.url();
    await sidebar.getByRole("button", { name: "Artists", exact: true }).click();
    await sidebar.getByRole("link", { name: "Blue Artist Artist", exact: true }).waitFor();
    assert.equal(await sidebar.locator("[data-library-playlist]").count(), 0);
    assert.equal(page.url(), initialUrl, "Filtering keeps the central page");
    artists = [{ name: "Updated Artist", channelId: artistId }];
    await page.evaluate(() => window.dispatchEvent(new Event("heykasa:follows-changed")));
    await sidebar.getByText("Updated Artist", { exact: true }).waitFor();
    assert((await sidebar.getByRole("link", { name: "Updated Artist Artist" }).getAttribute("href")).startsWith(`/artist/${artistId}`));
    await sidebar.getByRole("button", { name: "All", exact: true }).click();
    await sidebar.getByRole("searchbox", { name: "Filter your library", exact: true }).fill("liked");
    assert.equal(await sidebar.locator("[data-library-playlist]").count(), 0);
    await sidebar.getByRole("link", { name: "Liked Songs Pinned · Your saved songs" }).waitFor();
    await sidebar.getByRole("searchbox").fill("zzzz no match");
    await sidebar.getByRole("status").filter({ hasText: "No library items match" }).waitFor();
    await sidebar.getByRole("searchbox").fill("");
    await sidebar.getByRole("button", { name: "Playlists", exact: true }).click();
    assert.equal(await sidebar.locator("[data-library-playlist]").count(), 2);
    assert.equal(await sidebar.getByText("Updated Artist", { exact: true }).count(), 0);
    await sidebar.getByLabel("Sort sidebar library", { exact: true }).selectOption("alphabetical");
    await sidebar.getByRole("button", { name: "Use grid view" }).click();
    await sidebar.getByRole("button", { name: "Use list view" }).waitFor();
    assert.equal(await sidebar.getByText("No playlists yet", { exact: true }).count(), 0);
    const gridCard = sidebar.locator("[data-library-playlist]").first().locator("..");
    await page.waitForFunction(() => {
      const card = document.querySelector("#app-sidebar [data-library-playlist]")?.parentElement;
      const menu = card?.querySelector("[data-item-menu-trigger]");
      return card && menu && menu.getBoundingClientRect().top < card.getBoundingClientRect().top + 10;
    });
    assert((await gridCard.locator("[data-item-menu-trigger]").boundingBox()).y < (await gridCard.boundingBox()).y + 10, "Grid actions overlay the artwork instead of adding a row");
    if (device !== "mobile") {
      await page.getByRole("button", { name: "Collapse your library", exact: true }).click();
      await sidebar.getByRole("link", { name: "Open playlist Evening mix", exact: true }).waitFor();
      await page.getByRole("button", { name: "Expand your library", exact: true }).click();
      const leftResize = page.getByRole("separator", { name: "Resize library sidebar", exact: true });
      await leftResize.focus(); await page.keyboard.press("End");
      await page.waitForFunction(() => Math.round(document.querySelector("#app-sidebar").getBoundingClientRect().width) === 420);
      assert.equal(Math.round((await sidebar.boundingBox()).width), 420, "Library uses the requested width");
      await leftResize.dblclick();
      const panel = page.getByRole("complementary", { name: "Now playing", exact: true });
      await panel.getByRole("heading", { name: "Evening mix", exact: true }).waitFor();
      await panel.getByRole("heading", { name: "Artists on this track", exact: true }).waitFor();
      await panel.getByRole("link", { name: "Blue Artist Visit artist", exact: true }).waitFor();
      await panel.getByRole("button", { name: "Play Next song 1", exact: true }).waitFor();
      await panel.getByRole("button", { name: "Expand player", exact: true }).waitFor();
      await panel.getByRole("button", { name: "Show all", exact: true }).click();
      await page.getByRole("dialog", { name: "Queue", exact: true }).waitFor();
      await page.getByRole("button", { name: "Close queue", exact: true }).click();
      await panel.getByRole("button", { name: "Add to playlist", exact: true }).click();
      await page.getByRole("menuitem", { name: "Evening mix", exact: true }).click();
      assert.equal(additions.length, 1, "Panel action saves through the existing playlist API");
      assert.equal(additions[0].song, tracks[0].id);
      assert.equal(additions[0].playlistID, playlists[0]._id);
      await panel.getByRole("button", { name: "Expand player", exact: true }).click();
      await page.getByRole("dialog", { name: "Expanded audio", exact: true }).waitFor();
      await page.getByRole("button", { name: "Collapse player", exact: true }).click();
      const rightResize = page.getByRole("separator", { name: "Resize now playing panel", exact: true });
      await rightResize.focus(); await page.keyboard.press("End");
      await page.waitForFunction(() => Math.round(document.querySelector("#desktop-now-playing").getBoundingClientRect().width) === 420);
      assert.equal(Math.round((await panel.boundingBox()).width), 420);
      await rightResize.dblclick();
      await panel.getByRole("button", { name: "Close now playing panel", exact: true }).click();
      assert.equal(await panel.isVisible(), false);
      await page.getByRole("button", { name: "Open now playing panel", exact: true }).click();
      assert.equal(await panel.isVisible(), true);
      assert.equal(await page.locator("[data-testid='player-dock']").count(), 1, "Toggling panels retains one player");
      await page.reload({ waitUntil: "domcontentloaded" });
      await sidebar.getByRole("button", { name: "Use list view" }).waitFor();
      assert.equal(await sidebar.getByLabel("Sort sidebar library", { exact: true }).inputValue(), "alphabetical");
      await sidebar.getByRole("button", { name: "Use list view", exact: true }).click();
      await sidebar.getByRole("button", { name: "All", exact: true }).click();
      await page.screenshot({ path: path.join(output, `${device}-panels.png`) });
    } else {
      assert.equal(await page.locator("#desktop-now-playing").isVisible(), false);
      await page.screenshot({ path: path.join(output, "mobile-library.png") });
      await sidebar.getByRole("button", { name: "Close menu", exact: true }).click();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, "No horizontal page overflow");
    assert.deepEqual(errors, [], "No unhandled UI exceptions");
    results.push({ device, passed: true });
    await context.close();
  }
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(async error => { await currentPage?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {}); console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); server.kill("SIGTERM"); log.end();
});
