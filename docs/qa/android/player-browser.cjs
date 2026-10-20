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
  await context.addInitScript(() => {
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
  });
  page = await context.newPage();
  const errors = [], searches = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => {
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
  });
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
  const result = { passed: true, scope: "Production mobile UI with synthetic provider and APIs", searchTransitions, coverage: ["consecutive Search skips", "startup fade overlapping manual Skip", "consecutive Liked Songs skips", "terminal 100/101/150/153 preserve selection and queue", "visible recovery panel", "no automatic reload or alternate search", "manual Skip after each error", "no unhandled UI exceptions"] };
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(async error => { await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {}); console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill("SIGTERM"); log.end(); });
