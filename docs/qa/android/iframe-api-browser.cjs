// Actual production UI with guest APIs and an isolated synthetic IFrame SDK.
// No provider streams or external requests are sent. The timeout uses real time.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const output = path.join(root, "artifacts/android-iframe-api");
const origin = "http://127.0.0.1:3024";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const track = { id: "qa000000001", title: "SDK recovery song", channel: "Synthetic Artist", channelId: "UCabcdefghijklmnopqrstuv", duration: 180, thumbnail: "/icon-192x192.png" };
fs.mkdirSync(output, { recursive: true });
const log = fs.createWriteStream(path.join(output, "server.log"));
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3024"], {
  cwd: root, env: { ...process.env, NEXTAUTH_URL: origin, NEXTAUTH_SECRET: "isolated-sdk-qa", JWT_SECRET: "isolated-sdk-qa" }, stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log); server.stderr.pipe(log);
// Delivered only when the user explicitly retries the failed SDK request.
const syntheticSdk = `(${function installSyntheticSdk() {
  const players = [], calls = [];
  class Player {
    constructor(elementId, options) {
      this.options = options; this.id = options.videoId; this.state = -1;
      this.position = 0; this.started = 0; this.muted = true; this.destroyed = false;
      this.frame = document.createElement("iframe"); this.frame.title = "Synthetic SDK; no media";
      document.getElementById(elementId).replaceWith(this.frame);
      players.push(this); calls.push({ action: "construct", id: this.id });
      setTimeout(() => { if (!this.destroyed) options.events.onReady?.({ target: this }); }, 0);
    }
    notify(state) { this.state = state; this.options.events.onStateChange?.({ target: this, data: state }); }
    playVideo() { if (this.destroyed || this.state === 1) return; this.started = performance.now(); this.notify(1); }
    pauseVideo() { this.position = this.getCurrentTime(); this.notify(2); }
    loadVideoById(value) { this.id = typeof value === "string" ? value : value.videoId; this.position = Number(value.startSeconds) || 0; calls.push({ action: "load", id: this.id }); this.playVideo(); }
    cueVideoById(value) { this.id = typeof value === "string" ? value : value.videoId; this.position = Number(value.startSeconds) || 0; this.notify(5); }
    getVideoData() { return { video_id: this.id }; }
    getPlayerState() { return this.state; }
    getCurrentTime() { return this.position + (this.state === 1 ? (performance.now() - this.started) / 1000 : 0); }
    getDuration() { return 180; }
    getIframe() { return this.frame; }
    seekTo(value) { this.position = value; this.started = performance.now(); }
    mute() { this.muted = true; }
    unMute() { this.muted = false; calls.push({ action: "unmute", id: this.id }); }
    isMuted() { return this.muted; }
    setVolume() {} loadModule() {} unloadModule() {} setOption() {}
    destroy() { this.destroyed = true; this.frame.remove(); }
  }
  window.YT = { Player, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  window.qaSdk = { players, calls, active: () => players.filter(player => !player.destroyed).at(-1) };
  window.onYouTubeIframeAPIReady?.();
}.toString()})();`;
let browser, currentPage;
const results = [];
(async () => {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited ${server.exitCode}`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await pause(500);
  }
  assert(ready, "Production server starts");
  browser = await chromium.launch({ headless: true });
  for (const scenario of [
    { name: "mobile-delayed-session", viewport: { width: 390, height: 844 }, mobile: true, initial: "error", delaySession: true },
    { name: "mobile-script-error", viewport: { width: 390, height: 844 }, mobile: true, initial: "error" },
    { name: "narrow-script-error", viewport: { width: 320, height: 720 }, mobile: true, initial: "error" },
    { name: "landscape-script-error", viewport: { width: 802, height: 345 }, mobile: true, initial: "error" },
    { name: "desktop-sdk-never-ready", viewport: { width: 1440, height: 1000 }, mobile: false, initial: "silent" },
  ]) {
    const context = await browser.newContext({ viewport: scenario.viewport, isMobile: scenario.mobile, hasTouch: scenario.mobile, serviceWorkers: "block", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      delete Object.getPrototypeOf(navigator).serviceWorker;
      localStorage.setItem("toturialComplete", "true");
      localStorage.setItem("heykasa.media.presentation", "audio");
    });
    const page = await context.newPage(); currentPage = page;
    let sdkRequests = 0, sdkStartedAt = 0, permitSdk = false;
    let releaseSession;
    const sessionReady = new Promise(resolve => { releaseSession = resolve; });
    const errors = [], searches = [], writes = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.href === "https://www.youtube.com/iframe_api") {
        sdkRequests++; if (!sdkStartedAt) sdkStartedAt = performance.now();
        if (permitSdk) return route.fulfill({ contentType: "application/javascript", body: syntheticSdk });
        return scenario.initial === "error" ? route.abort("failed") : route.fulfill({ contentType: "application/javascript", body: "/* Loaded but intentionally never initializes YT.Player. */" });
      }
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (request.method() !== "GET") writes.push({ path: url.pathname, method: request.method() });
      let body = { success: true, data: [] };
      if (url.pathname === "/api/auth/session") { if (scenario.delaySession) await sessionReady; body = {}; }
      if (url.pathname === "/api/settings") body = { authenticated: false, settings: { privateSession: false, explicitContent: true } };
      if (url.pathname === "/api/language") body = { success: true, language: ["English"] };
      if (url.pathname === "/api/userPlaylists") body = { success: true, data: { playlists: [] } };
      if (url.pathname === "/api/followedArtists") body = { success: true, data: [], artists: [] };
      if (url.pathname === "/api/media/resolve") body = { enabled: false, reason: "authentication_required" };
      if (url.pathname === "/api/youtube-videos") body = { tracks: [track] };
      if (url.pathname === "/api/favourite") body = { success: true, data: { favourites: [] } };
      if (url.pathname === "/api/youtube-search") { searches.push(Object.fromEntries(url.searchParams)); body = { results: url.searchParams.get("type") === "video" ? [track] : [], nextPageToken: "" }; }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(origin + "/search/SDK?type=video", { waitUntil: "domcontentloaded" });
    await page.locator("[data-search-track]").first().getByRole("button", { name: `Play ${track.title}`, exact: true }).click();
    const dock = page.locator("[data-testid='player-dock']");
    const selected = dock.getByRole("button", { name: `Expand player: ${track.title}`, exact: true });
    await selected.waitFor();
    if (scenario.delaySession) {
      const sessionResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/session');
      releaseSession();
      await sessionResponse;
      await pause(500);
      await selected.waitFor({ timeout: 3000 });
    }
    const message = page.getByText("The music player could not connect to YouTube.", { exact: true }).filter({ visible: true });
    await message.waitFor({ timeout: 20000 });
    const failureElapsedMs = performance.now() - sdkStartedAt;
    if (scenario.initial === "silent") assert(failureElapsedMs >= 14500 && failureElapsedMs < 20000, "A loaded but never-ready SDK fails within its real 15-second deadline");
    await dock.getByRole("button", { name: "Play", exact: true }).filter({ visible: true }).waitFor();
    assert.equal(await dock.getByRole("button", { name: "Pause", exact: true }).filter({ visible: true }).count(), 0, "A missing SDK cannot pretend to be playing");
    const feedback = page.locator('[data-testid="playback-feedback"]:visible');
    assert.equal(await feedback.locator('details').getAttribute('open'), null, "Additional failure details start collapsed");
    const bounds = await feedback.boundingBox();
    assert(bounds && bounds.x >= -2 && bounds.x + bounds.width <= scenario.viewport.width + 2 && bounds.y >= -2 && bounds.y + bounds.height <= scenario.viewport.height + 2, `SDK failure message is visible inside the viewport: ${JSON.stringify(bounds)}`);
    assert(bounds.height <= 96, `Collapsed playback feedback stays compact: ${bounds.height}px`);
    await feedback.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible' });
    const dockBounds = await dock.boundingBox();
    assert(dockBounds && bounds.y + bounds.height <= dockBounds.y + 2, 'Feedback leaves transport controls accessible');
    await page.screenshot({ path: path.join(output, `${scenario.name}-compact.png`) });
    await feedback.locator('summary').click();
    const expanded = await feedback.boundingBox();
    assert(expanded && expanded.height > bounds.height, 'Details expands only on request');
    const contrast = await feedback.getByRole('link', { name: 'Open YouTube', exact: true }).evaluate(link => {
      const luminance = css => {
        const components = css.match(/[\d.]+/g).slice(0, 3).map(value => {
          const channel = Number(value) / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return components[0] * .2126 + components[1] * .7152 + components[2] * .0722;
      };
      const foreground = luminance(getComputedStyle(link).color);
      const linkBackground = getComputedStyle(link).backgroundColor.match(/[\d.]+/g).map(Number);
      const panelBackground = getComputedStyle(link.closest('[data-testid="playback-feedback"]')).backgroundColor.match(/[\d.]+/g).map(Number);
      const alpha = linkBackground[3] ?? 1;
      const composite = luminance(`rgb(${panelBackground.slice(0, 3).map((value, index) => linkBackground[index] * alpha + value * (1 - alpha)).join(',')})`);
      return (Math.max(foreground, composite) + .05) / (Math.min(foreground, composite) + .05);
    });
    assert(contrast >= 4.5, `YouTube link meets normal-text contrast: ${contrast}`);
    for (const action of await feedback.locator("button,a").all()) {
      await action.scrollIntoViewIfNeeded();
      const actionBounds = await action.boundingBox();
      assert(actionBounds && actionBounds.x >= expanded.x - 2 && actionBounds.x + actionBounds.width <= expanded.x + expanded.width + 2 && actionBounds.y >= expanded.y - 2 && actionBounds.y + actionBounds.height <= expanded.y + expanded.height + 2 && actionBounds.height >= 44, `Error action stays accessible inside feedback: ${await action.innerText()} ${JSON.stringify(actionBounds)}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, "Error actions do not overflow horizontally");
    assert.equal(sdkRequests, 1, "A failed SDK is not retried automatically");
    await pause(1200); // Let any initial radio setup finish before checking for recovery loops.
    const stableSearchCount = searches.length;
    await pause(1400);
    assert.equal(searches.length, stableSearchCount, "SDK failure does not loop alternative-upload searches");
    assert.equal(sdkRequests, 1, "SDK failure does not schedule an automatic script reload");
    await selected.waitFor();
    await page.screenshot({ path: path.join(output, `${scenario.name}.png`) });
    permitSdk = true;
    await feedback.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction(() => window.qaSdk?.active()?.getPlayerState() === 1 && window.qaSdk.active().getCurrentTime() > 1 && !window.qaSdk.active().isMuted());
    await dock.getByRole("button", { name: "Pause", exact: true }).filter({ visible: true }).waitFor();
    assert.equal(sdkRequests, 2, "Manual Retry starts exactly one fresh SDK request");
    assert.equal(await message.count(), 0, "Manual Retry clears the connection error");
    await selected.waitFor();
    assert.equal(await page.evaluate(id => window.qaSdk.active().getVideoData().video_id === id, track.id), true, "Retry preserves the selected song rather than consuming the queue");
    assert.equal(await page.evaluate(() => window.qaSdk.calls.some(call => call.action === "unmute")), true, "Recovered playback explicitly unmutes the provider");
    assert.deepEqual(errors, [], "SDK failure and recovery cause no unhandled UI exceptions");
    assert.deepEqual(writes.filter(write => write.path !== "/api/media/resolve"), [], "Guest recovery does not write account data");
    await page.screenshot({ path: path.join(output, `${scenario.name}-recovered.png`) });
    results.push({ scenario: scenario.name, passed: true, failureElapsedMs: Math.round(failureElapsedMs), sdkRequests, collapsedHeight: bounds.height, linkContrast: contrast, coverage: ["compact visible failure", "details disclosure", "accessible link contrast", "paused controls", "selected song retained", "no automatic SDK retries", "no alternative search loop", "manual retry recovery", "synthetic progressing unmuted playback", "viewport bounds", "guest isolation"] });
    await context.close();
  }
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: true, syntheticOnly: true, results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(async error => {
  await currentPage?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  const geometry = await currentPage?.evaluate(() => {
    const nodes = []; let node = document.querySelector(".yt-dock-feedback");
    while (node && nodes.length < 12) {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      nodes.push({ tag: node.tagName, className: node.className, display: style.display, position: style.position, overflow: style.overflow, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
      node = node.parentElement;
    }
    return nodes;
  }).catch(() => null);
  if (geometry) fs.writeFileSync(path.join(output, "failure-geometry.json"), JSON.stringify(geometry, null, 2));
  console.error(error); process.exitCode = 1;
}).finally(async () => { await browser?.close(); server.kill("SIGTERM"); log.end(); });
