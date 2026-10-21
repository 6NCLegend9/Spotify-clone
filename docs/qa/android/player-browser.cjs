// Actual production mobile UI and queue; synthetic APIs and IFrame API only.
// This verifies client transitions, not YouTube availability or Android decoding.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const output = path.join(root, "artifacts/android-player-browser");
const origin = "http://127.0.0.1:3019";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(output, { recursive: true });
const log = fs.createWriteStream(path.join(output, "server.log"));
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3019"], {
  cwd: root, env: { ...process.env, NEXTAUTH_URL: origin, NEXTAUTH_SECRET: "isolated-player-secret", JWT_SECRET: "isolated-player-secret" }, stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log); server.stderr.pipe(log);
const tracks = Array.from({ length: 8 }, (_, index) => ({
  id: `qa${String(index).padStart(9, "0")}`, title: `Blue song ${index + 1}`,
  channel: `Blue Artist ${index + 1}`, channelId: `UC${String(index).padStart(22, "0")}`,
  duration: 180 + index, thumbnail: "/icon-192x192.png",
}));
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" });
  const installSyntheticPlayer = () => {
    delete Object.getPrototypeOf(navigator).serviceWorker;
    localStorage.setItem("toturialComplete", "true");
    localStorage.setItem("heykasa.media.presentation", "audio");
    const players = [], calls = [], skips = [];
    class SyntheticPlayer {
      constructor(elementId, options) {
        this.options = options; this.id = options.videoId; this.state = -1;
        this.position = 0; this.started = 0; this.destroyed = false; this.timer = null;
        this.frame = document.createElement("iframe");
        this.frame.title = "Synthetic playback engine (no external media)";
        document.getElementById(elementId).replaceWith(this.frame);
        players.push(this); calls.push({ action: "construct", id: this.id, at: performance.now() });
        setTimeout(() => { if (!this.destroyed) options.events.onReady?.({ target: this }); }, 0);
      }
      notify(state) { this.state = state; this.options.events.onStateChange?.({ target: this, data: state }); }
      playVideo() {
        if (this.destroyed || this.state === 1 || this.timer) return;
        this.notify(3);
        this.timer = setTimeout(() => { this.timer = null; if (!this.destroyed) { this.started = performance.now(); this.notify(1); } }, 500);
      }
      pauseVideo() { this.position = this.getCurrentTime(); clearTimeout(this.timer); this.timer = null; this.notify(2); }
      loadVideoById(value) {
        clearTimeout(this.timer); this.timer = null;
        this.id = typeof value === "string" ? value : value.videoId;
        this.position = Number(value.startSeconds) || 0; this.state = -1;
        calls.push({ action: "load", id: this.id, at: performance.now() });
        this.playVideo();
      }
      cueVideoById(value) { this.pauseVideo(); this.id = typeof value === "string" ? value : value.videoId; this.position = Number(value.startSeconds) || 0; this.notify(5); }
      getVideoData() { return { video_id: this.id }; }
      getPlayerState() { return this.state; }
      getCurrentTime() { return this.position + (this.state === 1 ? (performance.now() - this.started) / 1000 : 0); }
      getDuration() { return 180; }
      seekTo(value) { this.position = value; this.started = performance.now(); }
      getIframe() { return this.frame; }
      mute() {} unMute() {} setVolume() {} loadModule() {} unloadModule() {} setOption() {}
      destroy() { this.destroyed = true; clearTimeout(this.timer); this.frame.remove(); }
      fail(code) { this.options.events.onError?.({ target: this, data: code }); }
    }
    window.YT = { Player: SyntheticPlayer, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
    window.qaYouTube = { players, calls, skips, active: () => players.filter(player => !player.destroyed).at(-1) };
    document.addEventListener("click", event => {
      if (event.target.closest("[data-testid='player-dock'] button[aria-label='Next song']")) {
        const player = window.qaYouTube.active();
        skips.push({ id: player?.id, state: player?.getPlayerState(), at: performance.now() });
      }
    }, true);
  };
  await context.addInitScript(installSyntheticPlayer);
  page = await context.newPage();
  const errors = [], searches = [];
  page.on("pageerror", error => errors.push(error.message));
  const intercept = route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body = { success: true, data: [] };
    if (url.pathname === "/api/auth/session") body = { user: { id: "507f1f77bcf86cd799439013", name: "Mobile player QA", email: "qa@example.invalid" }, expires: "2099-01-01T00:00:00Z" };
    if (url.pathname === "/api/settings") body = { authenticated: true, settings: { privateSession: false, explicitContent: true, fadeEnabled: true, fadeSeconds: .8 } };
    if (url.pathname === "/api/language") body = { success: true, authenticated: true, language: ["English"] };
    if (url.pathname === "/api/userPlaylists") body = { success: true, data: { playlists: [] } };
    if (url.pathname === "/api/followedArtists") body = { success: true, data: [], artists: [] };
    if (url.pathname === "/api/media/resolve") body = { enabled: false };
    if (url.pathname === "/api/youtube-videos") body = { tracks };
    if (url.pathname === "/api/favourite") body = { success: true, data: { favourites: tracks.map(track => track.id).reverse() } };
    if (url.pathname === "/api/youtube-search") {
      searches.push(Object.fromEntries(url.searchParams));
      body = { results: url.searchParams.get("type") === "video" ? tracks : [], nextPageToken: "" };
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  };
  await context.route("**/*", intercept);
  const dock = page.locator("[data-testid='player-dock']");
  const next = () => dock.getByRole("button", { name: "Next song", exact: true }).filter({ visible: true });
  const title = async () => (await dock.getByRole("button", { name: /^Expand player:/ }).getAttribute("aria-label")).replace("Expand player: ", "");
  const waitTrack = async name => { await dock.getByRole("button", { name: `Expand player: ${name}`, exact: true }).waitFor(); };
  // Search starts radio with just the selected song; the production extender
  // obtains synthetic candidates through the normal search API.
  await page.goto(origin + "/search/Blue?type=video", { waitUntil: "domcontentloaded" });
  await page.locator("[data-search-track]").first().getByRole("button", { name: "Play Blue song 1", exact: true }).tap();
  await waitTrack(tracks[0].title);
  await page.waitForFunction(() => window.qaYouTube.active()?.getPlayerState() === 1);
  const searchTransitions = [await title()];
  for (let step = 0; step < 2; step++) {
    const before = await title();
    await next().tap();
    await page.waitForFunction(previous => document.querySelector("[data-testid='player-dock'] [aria-label^='Expand player:']")?.getAttribute("aria-label") !== `Expand player: ${previous}`, before, { timeout: 6000 });
    searchTransitions.push(await title());
    await page.waitForFunction(() => window.qaYouTube.active()?.getPlayerState() === 1);
  }
  assert.equal(new Set(searchTransitions).size, 3, "Consecutive mobile Search skips advance to distinct songs");
  // A fresh document ensures an outstanding startup fade-in. Skip while the
  // synthetic engine is buffering; it starts playing during the 800ms fade.
  await page.goto(origin + "/library/liked", { waitUntil: "domcontentloaded" });
  const playCollection = page.getByRole("button", { name: "Play Liked Songs", exact: true });
  await playCollection.tap();
  await waitTrack(tracks[0].title);
  await page.waitForFunction(() => window.qaYouTube.active()?.getPlayerState() === 3);
  await next().tap();
  assert.equal(await page.evaluate(() => window.qaYouTube.skips.at(-1)?.state), 3, "The actual Skip tap occurs while startup is still buffering");
  await waitTrack(tracks[1].title);
  await page.waitForFunction(() => window.qaYouTube.active()?.getPlayerState() === 1);
  await next().tap();
  await waitTrack(tracks[2].title);
  await page.waitForFunction(() => window.qaYouTube.active()?.getPlayerState() === 1);
  await page.screenshot({ path: path.join(output, "mobile-skip.png") });
  for (const [offset, code, message] of [
    [0, 150, "YouTube does not allow this video to play here."],
    [1, 101, "YouTube does not allow this video to play here."],
    [2, 100, "This video is unavailable or private."],
    [3, 153, "YouTube could not verify this player."],
  ]) {
    const beforeFailure = { title: await title(), calls: await page.evaluate(() => window.qaYouTube.calls.length), searches: searches.length };
    await page.evaluate(value => window.qaYouTube.active().fail(value), code);
    const feedback = page.getByTestId("playback-feedback").filter({ visible: true });
    await feedback.getByText(message, { exact: true }).waitFor();
    await dock.getByRole("button", { name: "Play", exact: true }).filter({ visible: true }).waitFor();
    await pause(1400);
    assert.equal(await title(), beforeFailure.title, `Provider error ${code} does not consume the queue`);
    assert.equal(await page.evaluate(() => window.qaYouTube.calls.length), beforeFailure.calls, `Provider error ${code} does not reload or recreate the player`);
    assert.equal(searches.length, beforeFailure.searches, `Provider error ${code} does not search alternative uploads`);
    const bounds = await feedback.boundingBox();
    assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844, `Provider error ${code} recovery panel remains in the phone viewport`);
    assert.equal(await feedback.getByRole("button", { name: "Retry", exact: true }).count(), code === 153 ? 1 : 0, "Manual retry is shown only when useful");
    await page.screenshot({ path: path.join(output, `mobile-provider-${code}.png`) });
    await next().tap();
    await waitTrack(tracks[3 + offset].title);
    await page.waitForFunction(() => window.qaYouTube.active()?.getPlayerState() === 1);
  }
  assert.equal(await page.getByText("Some account preferences couldn't sync.", { exact: false }).count(), 0, "Synthetic account preferences sync without an unrelated warning");
  assert.deepEqual(errors, [], "Production player has no unhandled UI exceptions");
  const layoutResults = [];
  const nativeAgent = "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0.0.0 Mobile Safari/537.36 HayKasaAndroid/1.0.2-debug";
  for (const scenario of [
    { name: "native-fine-landscape", viewport: { width: 802, height: 345 }, screen: { width: 393, height: 852 }, isMobile: true, hasTouch: false, userAgent: nativeAgent, native: true },
    { name: "native-coarse-landscape", viewport: { width: 802, height: 345 }, screen: { width: 393, height: 852 }, isMobile: true, hasTouch: true, userAgent: nativeAgent, native: true },
    { name: "desktop-fine-short-window", viewport: { width: 802, height: 345 }, screen: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, native: false },
    { name: "native-tablet-landscape", viewport: { width: 1024, height: 600 }, screen: { width: 800, height: 1280 }, isMobile: true, hasTouch: true, userAgent: nativeAgent, native: false },
  ]) {
    const { name, native, ...options } = scenario;
    const layout = await browser.newContext({ ...options, serviceWorkers: "block", reducedMotion: "reduce" });
    await layout.addInitScript(installSyntheticPlayer);
    await layout.route("**/*", intercept);
    page = await layout.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/settings", { waitUntil: "domcontentloaded" });
    await page.locator(".page-settings h1").waitFor();
    await page.waitForFunction(expected => document.querySelector(".app-shell")?.getAttribute("data-native-phone") === String(expected), native);
    const layoutMetrics = async () => page.evaluate(() => {
      const box = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, display: getComputedStyle(node).display }; };
      return { width: innerWidth, height: innerHeight, fine: matchMedia("(pointer:fine)").matches, overflow: document.documentElement.scrollWidth - innerWidth,
        native: document.querySelector(".app-shell")?.getAttribute("data-native-phone"), tabbar: box(document.querySelector(".app-tabbar")),
        tabs: [...document.querySelectorAll(".app-tabbar a,.app-tabbar button")].map(box), sidebar: box(document.querySelector(".app-sidebar")), empty: box(document.querySelector(".empty-player-dock")), dock: box(document.querySelector("[data-testid='player-dock']")),
      };
    });
    const requirePhone = metrics => {
      assert.equal(metrics.overflow, 0, `${name}: no horizontal overflow`);
      assert.equal(metrics.fine, !options.hasTouch, `${name}: the intended pointer mode is actually emulated`);
      assert.equal(metrics.tabs.length, 4);
      assert(metrics.tabbar && metrics.tabbar.height >= 44 && metrics.tabbar.y >= 0 && metrics.tabbar.bottom <= metrics.height + 1, `${name}: phone navigation remains inside the viewport`);
      assert(metrics.tabs.every(box => box.width >= 44 && box.height >= 44 && box.x >= 0 && box.right <= metrics.width + 1 && box.y >= 0 && box.bottom <= metrics.height + 1), `${name}: all four navigation targets remain reachable`);
      assert(!metrics.sidebar || metrics.sidebar.display === "none" || metrics.sidebar.right <= 1, `${name}: desktop library rail stays closed`);
    };
    const empty = await layoutMetrics();
    if (native) {
      requirePhone(empty);
      assert(!empty.empty || empty.empty.display === "none", `${name}: no empty desktop transport`);
    } else {
      assert(empty.tabbar.display === "none" || empty.tabbar.height === 0, `${name}: existing desktop/tablet navigation is preserved`);
      assert(empty.sidebar && empty.sidebar.x >= 0 && empty.sidebar.width > 0, `${name}: existing workspace sidebar is preserved`);
    }
    await page.screenshot({ path: path.join(output, `${name}-empty.png`) });
    if (native) {
      await page.goto(origin + "/search/Blue?type=video", { waitUntil: "domcontentloaded" });
      await page.locator("[data-search-track]").first().getByRole("button", { name: "Play Blue song 1", exact: true }).click();
      await page.waitForFunction(() => window.qaYouTube.active()?.getPlayerState() === 1);
      const playing = await layoutMetrics();
      requirePhone(playing);
      assert(playing.dock && playing.dock.height <= 90 && playing.dock.y >= 0 && playing.dock.bottom <= playing.tabbar.y + 1, `${name}: active player remains compact above navigation`);
      await page.screenshot({ path: path.join(output, `${name}-playing.png`) });
      layoutResults.push({ name, passed: true, empty, playing });
    } else layoutResults.push({ name, passed: true, empty });
    await layout.close();
  }
  assert.deepEqual(errors, [], "All phone and desktop/tablet layouts have no unhandled UI errors");
  const result = { passed: true, scope: "Production mobile UI with synthetic provider and APIs", searchTransitions, layoutResults, coverage: ["consecutive Search skips", "startup fade overlapping manual Skip", "consecutive Liked Songs skips", "terminal 100/101/150/153 preserve selection and queue", "visible recovery panel", "no automatic reload or alternate search", "manual Skip after each error", "no unhandled UI exceptions"] };
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(async error => { await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {}); console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill("SIGTERM"); log.end(); });
