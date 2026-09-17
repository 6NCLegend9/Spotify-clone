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
    if (pathname === "/api/settings") return route.fulfill({ json: { authenticated: true, settings: {} } });
    if (pathname === "/api/language") return route.fulfill({ json: { authenticated: true, language: [] } });
    if (pathname === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: [] } } });
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
  const transportScope = await dialog.getByRole("button", { name: "Shuffle", exact: true }).isVisible()
    ? dialog
    : dock;
  await transportScope.getByRole("button", { name: "Shuffle", exact: true }).click();
  await expect(transportScope.getByRole("button", { name: "Shuffle", exact: true })).toHaveAttribute("aria-pressed", "true");
  await transportScope.getByRole("button", { name: "Repeat queue" }).click();
  await expect(transportScope.getByRole("button", { name: "Repeat queue" })).toHaveAttribute("aria-pressed", "true");
  expect(favouriteRequests).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath("player-expanded.png") });
  await dialog.getByRole("button", { name: "Queue", exact: true }).click();
  const queueDialog = page.getByRole("dialog", { name: "Queue" });
  await expect(queueDialog.getByRole("button", { name: /^Second track/ })).toBeVisible();
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
  const queueDialog = page.getByRole("dialog", { name: "Queue" });
  await expect(queueDialog).toBeVisible();
  const order = () => queueDialog.locator("li[data-track-id]").evaluateAll((rows) => rows.map((row) => row.dataset.trackId));
  await queueDialog.getByRole("button", { name: "Move Third track up", exact: true }).click();
  expect(await order()).toEqual(["abcdefghijk", "12345678901", "lmnopqrstuv"]);
  await queueDialog.getByRole("button", { name: "Remove Third track from queue", exact: true }).click();
  expect(await order()).toEqual(["abcdefghijk", "lmnopqrstuv"]);
  await queueDialog.getByRole("button", { name: "Undo queue edit" }).click();
  expect(await order()).toEqual(["abcdefghijk", "12345678901", "lmnopqrstuv"]);
  await queueDialog.getByRole("button", { name: "Clear upcoming tracks" }).click();
  expect(await order()).toEqual(["abcdefghijk"]);
  await queueDialog.getByRole("button", { name: "Undo queue edit" }).click();
  await queueDialog.getByLabel("Queue playlist name").fill("Evening queue");
  await queueDialog.getByRole("button", { name: "Save queue as playlist" }).click();
  await expect(queueDialog.getByText("Playlist saved.", { exact: true })).toBeVisible();
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

test("video expansion fits desktop and mobile without replacing the media host", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("persist:settings", JSON.stringify({ owner: JSON.stringify("account:test-a"), audioOnly: "false", dataSaver: "false" }));
    const track = { id: "abcdefghijk", title: "Video expansion verification", channel: "Test Artist" };
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({
      version: 1, owner: "account:test-a", savedAt: Date.now(),
      youtubeVideo: track, youtubeQueue: [track], position: 42,
    }));
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
  });
  await page.keyboard.press("v");
  const videoDialog = page.getByRole("dialog", { name: "Expanded video" });
  await expect(videoDialog).toBeVisible();
  await expect(videoDialog.getByRole("button", { name: "Collapse video", exact: true })).toBeVisible();
  const geometry = await page.getByTestId("youtube-decks").evaluate((host) => {
    const rect = host.getBoundingClientRect();
    const frame = window.__videoFrame.getBoundingClientRect();
    return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom,
      viewportHeight: window.innerHeight, frameWidth: frame.width, frameHeight: frame.height,
      sameHost: host === window.__videoHost, sameFrame: host.contains(window.__videoFrame) };
  });
  expect(geometry.width).toBeGreaterThan(300);
  expect(geometry.height).toBeGreaterThan(250);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(Math.abs(geometry.frameWidth - geometry.width)).toBeLessThan(2);
  expect(Math.abs(geometry.frameHeight - geometry.height)).toBeLessThan(2);
  expect(geometry.sameHost && geometry.sameFrame).toBe(true);
  const phonePortrait = (await page.viewportSize()).width <= 767;
  const tabBar = page.getByRole("navigation", { name: "Primary" });
  if (phonePortrait) {
    await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-layout", "phone-portrait");
    await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-chrome", "visible");
    await expect(tabBar).toBeHidden();
    expect(geometry.height).toBeGreaterThan(geometry.viewportHeight * 0.55);
    expect(geometry.height).toBeLessThan(geometry.viewportHeight * 0.88);
    const chromeBelow = await page.getByTestId("youtube-player").evaluate((player) => {
      const video = player.querySelector("[data-testid='youtube-decks']").getBoundingClientRect();
      const play = [...player.querySelectorAll("button")].find((button) => /^(Play|Pause)$/.test(button.getAttribute("aria-label") || ""));
      return Boolean(play && play.getBoundingClientRect().top >= video.bottom - 2);
    });
    expect(chromeBelow).toBe(true);
    await page.getByTestId("video-tap-target").click();
    await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-chrome", "hidden");
    const filled = await page.getByTestId("youtube-decks").evaluate((host) => {
      const frame = host.querySelector("iframe");
      const hostRect = host.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        hostFilled: hostRect.height >= window.innerHeight * 0.92,
        frameWidth: frameRect.width,
        viewportWidth: window.innerWidth,
      };
    });
    expect(filled.hostFilled).toBe(true);
    expect(filled.frameWidth).toBeLessThan(filled.viewportWidth * 1.25);
    await page.getByRole("button", { name: "Show player controls" }).click();
    await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-chrome", "visible");
  } else {
    await expect.poll(() => page.getByTestId("youtube-player").getAttribute("data-chrome"), { timeout: 12000 }).toBe("hidden");
    await page.mouse.move(48, 48);
    await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-chrome", "visible");
  }
  await expect(page.getByRole("button", { name: "Collapse video", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("video-expanded.png") });
  await page.mouse.move(64, 64);
  await page.getByRole("button", { name: "Collapse video", exact: true }).click();
  await expect(dock).toBeVisible();
  expect(await page.getByTestId("youtube-decks").evaluate((host) => host === window.__videoHost)).toBe(true);
  await expect(dock.getByRole("button", { name: "Floating video", exact: true })).toHaveCount(0);
  await page.keyboard.press("v");
  await expect(page.getByRole("button", { name: "Collapse video", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand floating video", exact: true })).toHaveCount(0);
  expect(await page.getByTestId("youtube-decks").evaluate((host) => host === window.__videoHost && host.contains(window.__videoFrame))).toBe(true);
  for (const width of [320, 360, 390, 768]) {
    await page.mouse.move(72, 72);
    await page.getByRole("button", { name: "Collapse video", exact: true }).click();
    await page.setViewportSize({ width, height: 844 });
    await expect(dock).toBeVisible();
    await expect.poll(() => dock.locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left < 0 || rect.right > window.innerWidth || rect.width < 48 || rect.height < 48;
    }).map((button) => ({ label: button.getAttribute("aria-label"), rect: button.getBoundingClientRect().toJSON() }))), { message: `Dock controls at ${width}px` }).toEqual([]);
    expect(await dock.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await dock.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe("none");
    await page.screenshot({ path: testInfo.outputPath(`dock-${width}.png`) });
    await page.keyboard.press("v");
    await expect(page.getByRole("button", { name: "Collapse video", exact: true })).toBeVisible();
    const outside = await page.getByTestId("youtube-player").locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left < 0 || rect.right > window.innerWidth;
    }).map((button) => button.getAttribute("aria-label")));
    expect(outside, `Expanded controls at ${width}px`).toEqual([]);
    if (width <= 390) {
      await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-layout", "phone-portrait");
      await expect(tabBar).toBeHidden();
      const sheet = await page.getByTestId("youtube-decks").evaluate((host) => {
        const rect = host.getBoundingClientRect();
        return { height: rect.height, viewportHeight: window.innerHeight };
      });
      expect(sheet.height).toBeGreaterThan(sheet.viewportHeight * 0.55);
      expect(sheet.height).toBeLessThan(sheet.viewportHeight * 0.88);
    }
    await page.screenshot({ path: testInfo.outputPath(`expanded-${width}.png`) });
  }
  await page.getByRole("button", { name: "Collapse video", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dock).toBeVisible();
  await page.keyboard.press("v");
  await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-layout", "phone-portrait");
  expect(await page.getByTestId("youtube-decks").evaluate((host) => host === window.__videoHost && host.contains(window.__videoFrame))).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-layout", "phone-landscape");
  await expect(tabBar).toBeHidden();
  expect(await page.getByTestId("youtube-decks").evaluate((host) => host === window.__videoHost && host.contains(window.__videoFrame))).toBe(true);
  const landscape = await page.getByTestId("youtube-player").evaluate((player) => {
    const video = player.querySelector("[data-testid='youtube-decks']").getBoundingClientRect();
    const play = [...player.querySelectorAll("button")].find((button) => /^(Play|Pause)$/.test(button.getAttribute("aria-label") || ""));
    const playRect = play?.getBoundingClientRect();
    return {
      sideBySide: Boolean(playRect && playRect.left >= video.right - 8),
      overflow: Boolean(playRect && (playRect.right > window.innerWidth + 1 || playRect.bottom > window.innerHeight + 1)),
      videoHeight: video.height,
      viewportHeight: window.innerHeight,
    };
  });
  expect(landscape.sideBySide).toBe(true);
  expect(landscape.overflow).toBe(false);
  expect(landscape.videoHeight).toBeGreaterThan(landscape.viewportHeight * 0.7);
  await page.screenshot({ path: testInfo.outputPath("expanded-landscape.png") });
  await page.getByTestId("video-tap-target").click();
  await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-chrome", "hidden");
  const filledLandscape = await page.getByTestId("youtube-decks").evaluate((host) => host.getBoundingClientRect().height >= window.innerHeight * 0.92);
  expect(filledLandscape).toBe(true);
  await page.getByRole("button", { name: "Show player controls" }).click();
  await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-chrome", "visible");
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(page.getByTestId("youtube-player")).toHaveAttribute("data-layout", "phone-landscape");
  await expect(tabBar).toBeHidden();
  expect(errors).toEqual([]);
});
