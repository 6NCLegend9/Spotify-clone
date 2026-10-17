// Production UI, isolated synthetic APIs; external provider requests are blocked.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const output = path.join(root, "artifacts/search");
fs.mkdirSync(output, { recursive: true });
const origin = "http://127.0.0.1:3017";
const log = fs.createWriteStream(path.join(output, "server.log"));
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3017"], {
  cwd: root, env: { ...process.env, NEXTAUTH_URL: origin, NEXTAUTH_SECRET: "isolated-search-secret", JWT_SECRET: "isolated-search-secret" }, stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log); server.stderr.pipe(log);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const channelId = "UCabcdefghijklmnopqrstuv";
const artist = { id: channelId, title: "Blue Artist", thumbnail: "/icon-192x192.png" };
const tracks = Array.from({ length: 8 }, (_, index) => ({ id: `qa${String(index).padStart(9, "0")}`, title: `Blue song ${index + 1}`, channel: artist.title, channelId, duration: 180 + index, thumbnail: "/icon-192x192.png" }));
const playlist = { id: "PLabcdefghijklmnopqrstuv", title: "Blue essentials", channel: artist.title, thumbnail: "/icon-192x192.png" };
let browser, currentPage;
const results = [];
(async () => {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Production server exited ${server.exitCode}`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await pause(1000);
  }
  assert(ready, "Production server starts");
  browser = await chromium.launch({ headless: true });
  for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport, isMobile: device === "mobile", hasTouch: device === "mobile", serviceWorkers: "block", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      delete Object.getPrototypeOf(navigator).serviceWorker;
      localStorage.setItem("toturialComplete", "true");
      localStorage.setItem("heykasa.media.presentation", "audio");
    });
    const page = await context.newPage(); currentPage = page;
    const errors = [], writes = [], searchRequests = [];
    let recents = ["Blue evening", "Blue sunrise"], favourites = [], failSearch = false;
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let body = { success: true, data: [] };
      if (url.pathname === "/api/auth/session") body = { user: { id: "507f1f77bcf86cd799439013", name: "Search QA", email: "qa@example.invalid" }, expires: "2099-01-01T00:00:00Z" };
      if (url.pathname === "/api/settings") body = { authenticated: true, settings: { privateSession: false, explicitContent: true } };
      if (url.pathname === "/api/userPlaylists") body = { success: true, data: { playlists: [] } };
      if (url.pathname === "/api/followedArtists") body = { success: true, data: [], artists: [] };
      if (url.pathname === "/api/media/resolve") body = { enabled: false };
      if (url.pathname === "/api/youtube-videos") body = { tracks };
      if (url.pathname === "/api/searches") {
        if (request.method() === "POST") writes.push({ endpoint: "search-history", payload: request.postDataJSON() });
        if (request.method() === "DELETE") {
          const payload = request.postDataJSON(); writes.push({ endpoint: "searches", payload });
          recents = recents.filter(term => term !== payload.term);
        }
        body = { success: true, data: recents };
      }
      if (url.pathname === "/api/favourite") {
        if (request.method() === "POST") {
          const payload = request.postDataJSON(); writes.push({ endpoint: "favourite", payload });
          favourites = [tracks[0].id];
        }
        body = { success: true, data: { favourites } };
      }
      if (url.pathname === "/api/youtube-search") {
        searchRequests.push(Object.fromEntries(url.searchParams));
        if (failSearch) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic search outage" }) });
        const type = url.searchParams.get("type"), empty = url.searchParams.get("q") === "No synthetic matches";
        body = { results: empty ? [] : type === "channel" ? [artist] : type === "playlist" ? [playlist] : url.searchParams.has("pageToken") ? [tracks[5], tracks[6], tracks[7]] : tracks.slice(0, 6), nextPageToken: empty || type !== "video" || url.searchParams.has("pageToken") ? "" : "synthetic-page-2" };
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    if (device === "desktop") {
      await page.goto(origin + "/library/liked", { waitUntil: "domcontentloaded" });
      const emptyInput = page.getByRole("combobox", { name: "Search songs, artists, playlists, and genres", exact: true });
      await emptyInput.click();
      await pause(600); // More than the 350ms navigation debounce.
      assert.equal(new URL(page.url()).pathname, "/library/liked", "Focusing empty search does not navigate away");
      await emptyInput.press("Escape");
    }
    if (device === "mobile") {
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page.locator(".app-tabbar a[href='/search']").waitFor();
      await page.evaluate(() => {
        window.addEventListener("heykasa:open-search", () => {
          window.mobileSearchFocus = {
            path: location.pathname,
            focused: document.activeElement === document.querySelector("input[role='combobox']"),
            activeGesture: navigator.userActivation?.isActive === true,
          };
        }, { once: true });
      });
      await page.locator(".app-tabbar a[href='/search']").tap();
      await page.waitForURL(url => url.pathname === "/search");
      assert.deepEqual(await page.evaluate(() => window.mobileSearchFocus), { path: "/", focused: true, activeGesture: true }, "Home search focuses during the original tap before navigation");
      const mobileInput = page.getByRole("combobox", { name: "Search songs, artists, playlists, and genres", exact: true });
      await page.waitForFunction(() => document.activeElement === document.querySelector("input[role='combobox']"));
      assert.equal(await mobileInput.getAttribute("aria-expanded"), "true", "Search tab focuses input after leaving hidden Home navbar");
      assert.equal(await mobileInput.evaluate(input => getComputedStyle(input).fontSize), "16px", "Mobile input avoids Safari focus zoom threshold");
      assert.equal(await page.locator("[data-search-opening]").count(), 0, "Temporary Home navbar reveal is removed after navigation");
      await page.getByRole("button", { name: "Close search suggestions", exact: true }).click();
      await page.locator(".app-tabbar a[href='/']").tap();
      await page.waitForURL(url => url.pathname === "/");
      await page.waitForFunction(() => getComputedStyle(document.querySelector(".app-navbar")).display === "none");
      assert.equal(await mobileInput.getAttribute("aria-expanded"), "false", "Returning Home keeps closed search collapsed");
      await page.locator(".app-tabbar a[href='/search']").tap();
      await page.waitForURL(url => url.pathname === "/search");
      await page.getByRole("button", { name: "Close search suggestions", exact: true }).click();
    } else {
      await page.goto(origin + "/search", { waitUntil: "domcontentloaded" });
    }
    const recent = page.getByRole("region", { name: "Recent searches", exact: true });
    await recent.getByRole("link", { name: /Blue evening/ }).waitFor();
    await recent.getByRole("button", { name: "Remove recent search Blue evening", exact: true }).click();
    await recent.getByRole("link", { name: /Blue evening/ }).waitFor({ state: "detached" });
    assert(writes.some(write => write.endpoint === "searches" && write.payload.term === "Blue evening"), "Recent removal reaches DELETE API");
    await page.goto(origin + "/search/Blue", { waitUntil: "domcontentloaded" });
    const result = page.getByRole("region", { name: "Search results for Blue", exact: true });
    await result.getByRole("link", { name: "View playlist Blue essentials", exact: true }).waitFor();
    assert.equal(await result.locator("[data-search-track]").count(), 4, "All previews four songs");
    assert.equal(await result.getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed"), "true");
    assert((await result.getByRole("link", { name: "Blue Artist Artist", exact: true }).first().getAttribute("href")).startsWith(`/artist/${channelId}`));
    assert((await result.getByRole("link", { name: "View playlist Blue essentials", exact: true }).getAttribute("href")).startsWith(`/youtube-playlist/${playlist.id}`));
    await result.getByRole("button", { name: "Songs", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-search-track]").length === 6);
    await result.getByRole("button", { name: "Load more results", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-search-track]").length === 8);
    assert.equal(new Set(await result.locator("[data-search-track]").evaluateAll(nodes => nodes.map(node => node.dataset.searchTrack))).size, 8, "Duplicate continuation item removed");
    assert(searchRequests.some(request => request.pageToken === "synthetic-page-2"));
    await result.getByRole("button", { name: "Artists", exact: true }).click();
    await result.getByRole("link", { name: "Blue Artist Artist", exact: true }).waitFor();
    assert(new URL(page.url()).pathname === "/search/Blue", "Artist filter stays on search");
    await result.getByRole("button", { name: "Playlists", exact: true }).click();
    await result.getByRole("link", { name: "View playlist Blue essentials", exact: true }).waitFor();
    const input = page.getByRole("combobox", { name: "Search songs, artists, playlists, and genres", exact: true });
    if (device === "mobile") {
    await input.fill("Blue");
    const suggestions = page.locator("[data-search-suggest='true']");
    await suggestions.getByRole("gridcell", { name: "Open artist Blue Artist", exact: true }).waitFor();
    await suggestions.getByRole("gridcell", { name: "Play Blue song 1", exact: true }).waitFor();
    const urlBeforeFill = page.url();
    await suggestions.getByRole("button", { name: "Use suggestion Blue song 1", exact: true }).click();
    assert.equal(await input.inputValue(), "Blue song 1");
    assert.equal(page.url(), urlBeforeFill, "Fill arrow edits query without navigation");
    await input.fill("Blue");
    await suggestions.getByRole("gridcell", { name: "Play Blue song 1", exact: true }).waitFor();
    const liveSong = suggestions.getByRole("gridcell", { name: "Play Blue song 1", exact: true }).locator("..");
    await liveSong.getByRole("button", { name: "Queue options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Add to queue", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await input.click();
    await suggestions.getByRole("gridcell", { name: "Play Blue song 1", exact: true }).waitFor();
    await liveSong.getByRole("button", { name: "Save to Liked Songs", exact: true }).click();
    await liveSong.getByRole("button", { name: "Remove from Liked Songs", exact: true }).waitFor();
    assert(writes.some(write => write.endpoint === "favourite"), "Live result saves through favourites API");
    await suggestions.getByRole("gridcell", { name: "Play Blue song 1", exact: true }).click();
    await page.locator("[data-testid='player-dock']").waitFor();
    assert.equal(await input.getAttribute("aria-expanded"), "false", "Playback closes live search");
    await input.click();
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    assert.equal(await input.inputValue(), "");
    await page.getByRole("button", { name: "Close search suggestions", exact: true }).click();
    assert.equal(await input.getAttribute("aria-expanded"), "false");
    await input.fill("Blue");
    await suggestions.getByRole("gridcell", { name: "Open artist Blue Artist", exact: true }).waitFor();
    // Simulated keyboard viewport: this verifies layout geometry, not an OS keyboard.
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 420 });
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => {
      const rect = document.querySelector("[data-search-suggest='true']")?.getBoundingClientRect();
      return rect && rect.top >= 0 && rect.height > 0 && rect.bottom <= 421;
    });
    await page.evaluate(() => {
      delete window.visualViewport.height;
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => {
      const popup = document.querySelector("[data-search-suggest='true']")?.getBoundingClientRect();
      const chrome = [document.querySelector(".app-player"), document.querySelector(".app-tabbar")].find(node => node?.getBoundingClientRect().height > 0)?.getBoundingClientRect();
      return popup && chrome && Math.abs(popup.bottom - chrome.top) <= 2;
    });
    await page.screenshot({ path: path.join(output, `${device}-live-search.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, "Live search fits viewport");
    await suggestions.getByRole("gridcell", { name: "Open artist Blue Artist", exact: true }).click();
    await page.waitForURL(url => url.pathname === `/artist/${channelId}`);
    assert.equal(await input.getAttribute("aria-expanded"), "false", "Artist option navigates directly and closes popup");
    assert(writes.some(write => write.endpoint === "search-history" && write.payload.term === "Blue"), "Artist click records originating query");
    } else {
      await input.fill("Blue typing");
      await page.waitForURL(url => url.pathname === "/search/Blue%20typing" && !url.searchParams.has("type"));
      const typed = page.getByRole("region", { name: "Search results for Blue typing", exact: true });
      await typed.locator("[data-search-track]").first().waitFor();
      assert.equal(await input.evaluate(node => node === document.activeElement), true, "Desktop typing keeps focus");
      assert.equal(await input.getAttribute("aria-expanded"), "false", "Desktop renders full results rather than suggestions");
      await page.goBack({ waitUntil: "domcontentloaded" });
      await pause(600);
      assert.equal(new URL(page.url()).pathname, "/search/Blue", "Back navigation is not replaced by the focused input");
      assert.equal(new URL(page.url()).searchParams.get("type"), "channel");
      await input.fill("Blue retype");
      await input.fill("Blue typing");
      await page.waitForURL(url => url.pathname === "/search/Blue%20typing" && !url.searchParams.has("type"));
      await typed.locator("[data-search-track]").first().waitFor();
      const row = typed.locator("[data-search-track]").first();
      await row.getByRole("button", { name: "Queue options", exact: true }).click();
      await page.getByRole("menuitem", { name: "Add to queue", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await row.getByRole("button", { name: "Save to Liked Songs", exact: true }).click();
      await row.getByRole("button", { name: "Remove from Liked Songs", exact: true }).waitFor();
      await row.getByRole("button", { name: "Play Blue song 1", exact: true }).click();
      await page.locator("[data-testid='player-dock']").waitFor();
      await page.screenshot({ path: path.join(output, "desktop-search-results.png") });
      await input.click();
      await page.getByRole("button", { name: "Clear search", exact: true }).click();
      assert.equal(await input.inputValue(), "");
      await input.press("Escape");
      assert.equal(await input.getAttribute("aria-expanded"), "false");
    }
    await input.fill("Blue Artist");
    await input.press("Enter");
    await page.waitForURL(url => url.pathname === "/search/Blue%20Artist");
    await page.getByRole("region", { name: "Search results for Blue Artist", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[role="combobox"]').getAttribute("aria-busy") === "false");
    assert(writes.some(write => write.endpoint === "search-history" && write.payload.term === "Blue Artist"), "Artist-name submission records query and opens the search index");
    await page.goto(origin + "/search/No%20synthetic%20matches", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "No music found", exact: true }).waitFor();
    failSearch = true;
    await page.goto(origin + "/search/Synthetic%20outage", { waitUntil: "domcontentloaded" });
    await page.getByText("Search is temporarily unavailable", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, "No horizontal page overflow");
    assert.deepEqual(errors, [], "No unhandled UI exceptions");
    results.push({ device, passed: true, coverage: ["recent removal", "mixed results", "song preview", "filters", "pagination deduplication", "artist links", "playlist links", ...(device === "mobile" ? ["Home-to-Search focus", "mobile input font", "query fill", "live track menu", "simulated keyboard viewport"] : ["desktop live results", "non-search empty focus", "track menu"]), "save track", "playback dispatch", "clear", "dismiss", "explicit artist navigation", "artist-name search index", "query history", "empty results", "API failure", "overflow", "unhandled errors"] });
    await context.close();
  }
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(async error => { await currentPage?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {}); console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill("SIGTERM"); log.end(); });
