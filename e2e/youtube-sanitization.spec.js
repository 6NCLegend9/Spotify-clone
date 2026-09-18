const { test, expect } = require("@playwright/test");

async function installFixtures(page) {
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    localStorage.setItem("persist:settings", JSON.stringify({
      owner: JSON.stringify("account:test-a"),
      captions: "true",
      audioOnly: "false",
      dataSaver: "false",
    }));
    const track = { id: "abcdefghijk", title: "Sanitizer regression track", channel: "Test Artist" };
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({
      version: 3,
      owner: "account:test-a",
      savedAt: Date.now(),
      youtubeVideo: track,
      youtubeQueue: [track],
      position: 100,
    }));

    window.__ytPlayerVars = [];
    window.__ytCaptionCalls = [];
    window.__ytTime = 100;

    class FakePlayer {
      constructor(mountId, options) {
        const mount = document.getElementById(mountId);
        this.options = options;
        this.frame = document.createElement("iframe");
        this.frame.title = "YouTube sanitizer test player";
        this.frame.id = mountId;
        mount.replaceWith(this.frame);
        window.__ytPlayerVars.push(options.playerVars);
        window.__ytPlayer = this;
        setTimeout(() => options.events.onReady({ target: this }), 0);
      }
      getIframe() { return this.frame; }
      getDuration() { return 120; }
      getCurrentTime() { return window.__ytTime; }
      getPlayerState() { return 2; }
      getVideoData() { return { video_id: "abcdefghijk" }; }
      getPlaybackQuality() { return "medium"; }
      playVideo() {}
      pauseVideo() {}
      mute() {}
      unMute() {}
      setVolume() {}
      setPlaybackQuality() {}
      seekTo() {}
      loadVideoById() {}
      cueVideoById() {}
      loadModule(name) { window.__ytCaptionCalls.push(["load", name]); }
      unloadModule(name) { window.__ytCaptionCalls.push(["unload", name]); }
      destroy() { this.frame?.remove(); }
    }

    window.YT = {
      Player: FakePlayer,
      PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
    };
  });

  await page.route(/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\//, (route) => route.abort());
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") {
      return route.fulfill({ json: { user: { id: "test-a", name: "Test" }, expires: "2099-01-01T00:00:00.000Z" } });
    }
    if (pathname === "/api/auth/providers") return route.fulfill({ json: {} });
    if (pathname === "/api/settings") {
      return route.fulfill({ json: { authenticated: true, settings: { captions: true } } });
    }
    if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    return route.fulfill({ json: { success: true, authenticated: true, data: [], results: [], genres: [], tree: [], personalGenres: [] } });
  });
}

test("YouTube embed stays sanitized while honoring enabled captions", async ({ page }) => {
  await installFixtures(page);
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("player-dock")).toBeVisible();
  await expect(page.locator('[data-testid="youtube-decks"] iframe')).toHaveCount(1);

  await expect.poll(() => page.evaluate(() => window.__ytPlayerVars.length)).toBeGreaterThan(0);
  const vars = await page.evaluate(() => window.__ytPlayerVars[0]);
  expect(vars).toMatchObject({
    cc_load_policy: "1",
    controls: "0",
    disablekb: "1",
    enablejsapi: "1",
    fs: "0",
    iv_load_policy: "3",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
  });
  await expect.poll(() => page.evaluate(() => window.__ytCaptionCalls.some(([action, name]) => action === "load" && name === "captions"))).toBe(true);

  const deck = page.getByTestId("youtube-decks");
  await expect(deck).not.toHaveAttribute("data-kasa-end-guard", "true");
  await page.evaluate(() => { window.__ytTime = 114; });
  await expect(deck).toHaveAttribute("data-kasa-end-guard", "true");
  await page.evaluate(() => { window.__ytTime = 120; });
  await expect(deck).toHaveAttribute("data-kasa-end-guard", "true");
  await page.evaluate(() => { window.__ytTime = 125; });
  await expect(deck).toHaveAttribute("data-kasa-end-guard", "true");
  await page.evaluate(() => { window.__ytTime = 100; });
  await expect(deck).not.toHaveAttribute("data-kasa-end-guard", "true");
});
