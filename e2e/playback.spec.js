const { test, expect } = require("@playwright/test");

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
  await testInfo.attach("playback-state", {
    body: JSON.stringify(await page.evaluate(async () => ({
      session: await fetch("/api/auth/session").then((response) => response.json()),
      snapshot: localStorage.getItem("heykasa:playback:v1:account%3Atest-a"),
      player: document.querySelector("#player")?.innerText,
    }))),
    contentType: "application/json",
  });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await page.route(/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\//, (route) => route.abort());
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") {
      return route.fulfill({ json: { user: { id: "test-a", name: "Test" }, expires: "2099-01-01T00:00:00.000Z" } });
    }
    if (pathname === "/api/auth/providers") return route.fulfill({ json: {} });
    if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    return route.fulfill({ json: { authenticated: false, data: [], genres: [], tree: [], personalGenres: [], results: [] } });
  });
});

test("refresh restores the owner's queue paused and isolates another account", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("playback-test-seeded")) return;
    const track = { id: "abcdefghijk", title: "Restore Verification Track", channel: "Test Artist" };
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({
      version: 1, owner: "account:test-a", savedAt: Date.now(),
      youtubeVideo: track, youtubeQueue: [track], position: 42,
    }));
    sessionStorage.setItem("playback-test-seeded", "true");
  });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#player")).toContainText("Restore Verification Track");
  await expect(page.locator('#player button[aria-label="Play"]:visible')).toBeVisible();
  await expect(page.locator('#player button[aria-label="Pause"]')).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#player")).toContainText("Restore Verification Track");
  await expect(page.locator('#player button[aria-label="Play"]:visible')).toBeVisible();
  await page.route("**/api/auth/session", (route) => route.fulfill({
    json: { user: { id: "test-b", name: "Other Account" }, expires: "2099-01-01T00:00:00.000Z" },
  }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Browse all" })).toBeVisible();
  await expect(page.locator("#player")).not.toContainText("Restore Verification Track");
  const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem("heykasa:playback:v1:account%3Atest-a")));
  expect(snapshot.youtubeVideo.id).toBe("abcdefghijk");
  expect(snapshot.position).toBe(42);
});

test("lock-screen play reaches the engine even when playback state is already playing", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    window.__mediaActions = {};
    window.__enginePlayCalls = 0;
    window.__enginePauseCalls = 0;
    window.__engineTime = 42;
    localStorage.setItem("persist:settings", JSON.stringify({ owner: JSON.stringify("account:test-a"), audioOnly: "true" }));
    Object.defineProperty(navigator, "mediaSession", { configurable: true, value: {
      setActionHandler(action, handler) { window.__mediaActions[action] = handler; },
      setPositionState() {},
    } });
    window.YT = {
      PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
      Player: class {
        constructor(frame, options) {
          const mount = typeof frame === "string" ? document.getElementById(frame) : frame;
          this.frame = document.createElement("iframe");
          this.frame.id = mount.id;
          this.frame.title = "YouTube test player";
          mount.replaceWith(this.frame);
          window.__engineEvents = options.events;
          window.__engine = this;
          setTimeout(() => options.events.onReady({ target: this }), 0);
        }
        getIframe() { return typeof this.frame === "string" ? document.getElementById(this.frame) : this.frame; }
        getDuration() { return 180; }
        getCurrentTime() { return window.__engineTime; }
        getPlayerState() { return 2; }
        getVideoData() { return { video_id: "abcdefghijk" }; }
        getPlaybackQuality() { return "medium"; }
        playVideo() { window.__enginePlayCalls += 1; }
        pauseVideo() { window.__enginePauseCalls += 1; }
        mute() {}
        unMute() {}
        setVolume() {}
        setPlaybackQuality() {}
        seekTo() {}
        destroy() { this.frame.remove(); }
      },
    };
    const track = { id: "abcdefghijk", title: "Lock screen test", channel: "Test" };
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({
      version: 1, owner: "account:test-a", savedAt: Date.now(),
      youtubeVideo: track, youtubeQueue: [track], position: 42,
    }));
  });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("player-dock")).toBeVisible();
  await expect(page.locator('[data-testid="youtube-decks"] iframe')).toHaveCount(1);
  const immediateCalls = await page.evaluate(() => {
    const before = window.__enginePlayCalls;
    window.__mediaActions.play();
    return window.__enginePlayCalls - before;
  });
  expect(immediateCalls).toBeGreaterThan(0);
  await expect(page.locator('#player button[aria-label="Pause"]:visible').first()).toBeVisible();
  const calls = await page.evaluate(() => window.__enginePlayCalls);
  await page.evaluate(() => window.__mediaActions.play());
  await expect.poll(() => page.evaluate(() => window.__enginePlayCalls)).toBeGreaterThan(calls);
  await page.evaluate(() => window.__mediaActions.pause());
  await expect(page.locator('#player button[aria-label="Play"]:visible').first()).toBeVisible();
  await page.getByRole("button", { name: "Expand player: Lock screen test", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Now playing" });
  await dialog.getByLabel("Sleep timer", { exact: true }).selectOption("15");
  await page.evaluate(() => window.__mediaActions.play());
  const pauses = await page.evaluate(() => window.__enginePauseCalls);
  await page.clock.fastForward(900_100);
  await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__enginePauseCalls)).toBeGreaterThan(pauses);
  await expect(dialog.getByLabel("Sleep timer", { exact: true })).toHaveValue("off");
  await dialog.getByLabel("Sleep timer", { exact: true }).selectOption("track");
  await page.evaluate(() => window.__mediaActions.play());
  await page.clock.fastForward(15_000);
  await page.evaluate(() => {
    window.__engineTime = 180;
    window.__engineEvents.onStateChange({ data: 0, target: window.__engine });
  });
  await expect(dialog.getByLabel("Sleep timer", { exact: true })).toHaveValue("off");
  await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("chunk errors show a dismissible notice without reloading", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Browse all" })).toBeVisible();
  await expect(page.getByTestId("jam-button")).toBeVisible();
  await page.evaluate(() => {
    window.__recoveryMarker = "unchanged";
    window.dispatchEvent(new ErrorEvent("error", { message: "ChunkLoadError: Loading chunk test failed" }));
  });
  await expect(page.getByRole("button", { name: "Dismiss reload notice" })).toBeVisible();
  expect(await page.evaluate(() => window.__recoveryMarker)).toBe("unchanged");
  await page.getByRole("button", { name: "Dismiss reload notice" }).click();
  await expect(page.getByRole("button", { name: "Dismiss reload notice" })).toHaveCount(0);
});

test("empty search does not mount the player or request the YouTube API", async ({ page }) => {
  const providerRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("youtube.com/iframe_api")) providerRequests.push(request.url());
  });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Browse all" })).toBeVisible();
  await expect(page.getByTestId("player-dock")).toHaveCount(0);
  expect(providerRequests).toEqual([]);
});

test("responsive player expands, exposes queue modes and preserves deck hosts", async ({ page }, testInfo) => {
  const favouriteRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/favourite" && request.method() === "GET") favouriteRequests.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem("persist:settings", JSON.stringify({ owner: JSON.stringify("account:test-a"), audioOnly: "true" }));
    const tracks = [
      { id: "abcdefghijk", title: "A Very Long Track Title That Must Stay Inside The Player", channel: "Test Artist" },
      { id: "lmnopqrstuv", title: "Second track", channel: "Another Artist" },
      { id: "12345678901", title: "Third track", channel: "Another Artist" },
    ];
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({
      version: 1, owner: "account:test-a", savedAt: Date.now(),
      youtubeVideo: tracks[0], youtubeQueue: tracks, position: 42,
    }));
  });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  const dock = page.getByTestId("player-dock");
  await expect(dock).toBeVisible();
  expect(await dock.evaluate((element) => element.parentElement.getBoundingClientRect().height - element.getBoundingClientRect().height)).toBeLessThan(2);
  await expect.poll(() => dock.locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => {
    const rect = button.getBoundingClientRect();
    return rect.width < 48 || rect.height < 48;
  }).map((button) => button.getAttribute("aria-label")))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId("youtube-decks").evaluate((element) => { window.__deckHost = element; });
  await page.screenshot({ path: testInfo.outputPath("player-dock.png") });
  const expand = dock.getByRole("button", { name: /^Expand player:/ });
  await expand.click();
  const dialog = page.getByRole("dialog", { name: "Now playing" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Shuffle", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Shuffle", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Repeat queue" }).click();
  await expect(dialog.getByRole("button", { name: "Repeat queue" })).toHaveAttribute("aria-pressed", "true");
  expect(favouriteRequests).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath("player-expanded.png") });
  await dialog.getByRole("button", { name: "Queue", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /^Second track/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.getByTestId("youtube-decks").evaluate((element) => element === window.__deckHost)).toBe(true);
  await expect(dock.getByRole("button", { name: /picture in picture|floating player/i })).toHaveCount(0);
  await page.locator('a[href="/terms"]:visible').first().click();
  await expect(page).toHaveURL(/\/terms$/);
  expect(await page.getByTestId("youtube-decks").evaluate((element) => element === window.__deckHost)).toBe(true);
});

test("queue edits preserve playback, undo safely, save a playlist and keep a sleep deadline", async ({ page }, testInfo) => {
  let saved;
  await page.route("**/api/userPlaylists", (route) => {
    if (route.request().method() === "POST") { saved = route.request().postDataJSON(); return route.fulfill({ json: { success: true } }); }
    return route.fulfill({ json: { success: true, data: { playlists: [] } } });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("queue-seeded")) return;
    const tracks = [{ id: "abcdefghijk", title: "Current track" }, { id: "lmnopqrstuv", title: "Second track" }, { id: "12345678901", title: "Third track" }];
    localStorage.setItem("persist:settings", JSON.stringify({ owner: JSON.stringify("account:test-a"), audioOnly: "true" }));
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({ version: 1, owner: "account:test-a", savedAt: Date.now(), youtubeVideo: tracks[0], youtubeQueue: tracks, position: 42 }));
    sessionStorage.setItem("queue-seeded", "true");
  });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Expand player: Current track" }).click();
  const dialog = page.getByRole("dialog", { name: "Now playing" });
  await dialog.getByLabel("Sleep timer", { exact: true }).selectOption("15");
  const deadline = await page.evaluate(() => JSON.parse(sessionStorage.getItem("heykasa:sleep-timer:v1")).deadline);
  await dialog.getByRole("button", { name: "Queue", exact: true }).click();
  const order = () => dialog.locator("li[data-track-id]").evaluateAll((rows) => rows.map((row) => row.dataset.trackId));
  await dialog.getByRole("button", { name: "Move Third track up", exact: true }).click();
  expect(await order()).toEqual(["abcdefghijk", "12345678901", "lmnopqrstuv"]);
  await dialog.getByRole("button", { name: "Remove Third track from queue", exact: true }).click();
  expect(await order()).toEqual(["abcdefghijk", "lmnopqrstuv"]);
  await dialog.getByRole("button", { name: "Undo queue edit" }).click();
  expect(await order()).toEqual(["abcdefghijk", "12345678901", "lmnopqrstuv"]);
  await dialog.getByRole("button", { name: "Clear upcoming tracks" }).click();
  expect(await order()).toEqual(["abcdefghijk"]);
  await dialog.getByRole("button", { name: "Undo queue edit" }).click();
  await dialog.getByLabel("Queue playlist name").fill("Evening queue");
  await dialog.getByRole("button", { name: "Save queue as playlist" }).click();
  await expect(dialog.getByText("Playlist saved.", { exact: true })).toBeVisible();
  expect(saved).toMatchObject({ name: "Evening queue", songs: ["abcdefghijk", "12345678901", "lmnopqrstuv"] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("queue-editor.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("player-dock").getByRole("button", { name: "Play", exact: true }).first()).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Expand player: Current track" }).click();
  await expect(dialog.getByLabel("Sleep timer", { exact: true })).toHaveValue("15");
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("heykasa:sleep-timer:v1")).deadline)).toBe(deadline);
  await dialog.getByLabel("Sleep timer", { exact: true }).selectOption("off");
  expect(await page.evaluate(() => sessionStorage.getItem("heykasa:sleep-timer:v1"))).toBeNull();
});

// The approved artwork/video/expanded presentation replaces the legacy immersive layout.
// Keep the lifecycle, geometry, responsive and interaction assertions on the new views.
test("audio, sidebar video and expanded video preserve the existing media host", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("persist:settings", JSON.stringify({ owner: JSON.stringify("account:test-a"), audioOnly: "false", dataSaver: "false" }));
    const tracks = [{ id: "abcdefghijk", title: "Video expansion verification", channel: "Test Artist" }, { id: "lmnopqrstuv", title: "Next verification track", channel: "Test Artist" }];
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({ version: 1, owner: "account:test-a", savedAt: Date.now(), youtubeVideo: tracks[0], youtubeQueue: tracks, position: 42 }));
  });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  const dock = page.getByTestId("player-dock");
  await expect(dock).toBeVisible();
  await page.getByTestId("youtube-decks").evaluate((host) => {
    window.__videoHost = host;
    const frame = document.createElement("iframe");
    frame.title = "Layout verification video";
    frame.srcdoc = '<body style="margin:0;background:#168477;color:white;display:grid;place-items:center;height:100vh;font:24px sans-serif">Video frame</body>';
    host.querySelector(".yt-crop-frame").appendChild(frame);
    window.__videoFrame = frame;
    window.__frameParent = frame.parentElement;
    window.__frameLoads = 0;
    frame.addEventListener("load", () => { window.__frameLoads += 1; });
  });
  await expect.poll(() => page.evaluate(() => window.__frameLoads)).toBe(1);
  const assertStable = async () => {
    expect(await page.getByTestId("youtube-decks").evaluate((host) => host === window.__videoHost && host.contains(window.__videoFrame) && window.__videoFrame.parentElement === window.__frameParent)).toBe(true);
    expect(await page.evaluate(() => window.__frameLoads)).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("heykasa:playback:v1:account%3Atest-a")).youtubeVideo.id)).toBe("abcdefghijk");
  };
  const assertVideoFits = async (target) => {
    await expect.poll(async () => {
      const area = await target.boundingBox();
      const media = await page.getByTestId("youtube-decks").boundingBox();
      return area && media ? Math.abs(area.x - media.x) + Math.abs(area.y - media.y) + Math.abs(area.width - media.width) + Math.abs(area.height - media.height) : Infinity;
    }).toBeLessThan(4);
  };
  if ((await page.viewportSize()).width >= 1180) {
    const side = page.locator("#kasa-now-playing-slot");
    await expect(side.getByRole("button", { name: "Switch to video", exact: true })).toBeVisible();
    await side.getByRole("button", { name: "Switch to video", exact: true }).click();
    await expect(side.getByRole("button", { name: "Switch to audio", exact: true })).toBeVisible();
    await assertVideoFits(page.getByTestId("sidebar-media"));
    await side.getByRole("button", { name: "Expand music video", exact: true }).click();
    const expanded = page.getByTestId("kasa-player-view");
    await expect(expanded).toHaveAttribute("data-view", "expanded");
    await assertVideoFits(page.getByTestId("expanded-media"));
    await expect(expanded.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(expanded.getByLabel("Preferred video quality")).toBeVisible();
    await assertStable();
    await expanded.getByRole("button", { name: "Minimize video", exact: true }).click();
    await expect(expanded).toHaveCount(0);
    await assertVideoFits(page.getByTestId("sidebar-media"));
    await side.getByRole("button", { name: "Switch to audio", exact: true }).click();
  }
  for (const size of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    const open = dock.getByRole("button", { name: /^Expand player:/ });
    await open.click();
    const view = page.getByTestId("kasa-player-view");
    await expect(view).toHaveAttribute("data-view", "drawer");
    await expect(view).toHaveAttribute("data-mode", "audio");
    await view.getByRole("button", { name: "Switch to video", exact: true }).click();
    await expect(view).toHaveAttribute("data-mode", "video");
    await assertVideoFits(view.getByTestId("drawer-media"));
    await view.getByRole("button", { name: "Expand music video", exact: true }).click();
    await expect(view).toHaveAttribute("data-view", "expanded");
    await assertVideoFits(view.getByTestId("expanded-media"));
    await expect(view.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    const overflow = await view.locator("button:visible,select:visible").evaluateAll((controls) => controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1;
    }).map((element) => element.getAttribute("aria-label") || element.textContent));
    expect(overflow, `${size.width}px control bounds`).toEqual([]);
    await assertStable();
    await page.screenshot({ path: testInfo.outputPath(`approved-video-${size.width}.png`) });
    await view.getByRole("button", { name: "Switch to audio", exact: true }).click();
    await expect(view).toHaveAttribute("data-view", "drawer");
    await expect(view).toHaveAttribute("data-mode", "audio");
    await page.keyboard.press("Escape");
    await expect(view).toHaveCount(0);
    await expect(open).toBeFocused();
    await assertStable();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
