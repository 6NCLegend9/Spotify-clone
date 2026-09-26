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

test("lock-screen play reaches the engine even when playback state is already playing", async ({ page, isMobile }) => {
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
  const resumedCalls = await page.evaluate(() => window.__enginePlayCalls);
  await page.evaluate(() => window.__mediaActions.play());
  await expect.poll(() => page.evaluate(() => window.__enginePlayCalls)).toBeGreaterThan(resumedCalls);
  await expect(page.locator('#player button[aria-label="Pause"]:visible').first()).toBeVisible();

  // OS controls run while the page is hidden, unlike in-page controls.
  const hiddenPause = await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    const before = window.__enginePauseCalls;
    window.__mediaActions.pause();
    return { calls: window.__enginePauseCalls - before, state: navigator.mediaSession.playbackState };
  });
  expect(hiddenPause.calls).toBeGreaterThan(0);
  expect(hiddenPause.state).toBe("paused");
  await expect(page.locator('#player button[aria-label="Play"]:visible').first()).toBeVisible();
  const foregroundCalls = await page.evaluate(() => {
    const before = window.__enginePlayCalls;
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
    return window.__enginePlayCalls - before;
  });
  expect(foregroundCalls).toBe(0); // Explicit Pause must survive returning to the app.

  const hiddenPlay = await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    window.__mediaActions.play();
    return navigator.mediaSession.playbackState;
  });
  expect(hiddenPlay).toBe("paused"); // Deferred YouTube playback must not claim it started.
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator('#player button[aria-label="Pause"]:visible').first()).toBeVisible();
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

test("queue edits preserve playback, undo safely and save a playlist", async ({ page }, testInfo) => {
  let saved;
  await page.route("**/api/userPlaylists", (route) => {
    if (route.request().method() === "POST") { saved = route.request().postDataJSON(); return route.fulfill({ json: { success: true } }); }
    return route.fulfill({ json: { success: true, data: { playlists: [] } } });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("queue-seeded")) return;
    const tracks = [{ id: "abcdefghijk", title: "Current track" }, { id: "lmnopqrstuv", title: "Second track", queueSource: "user" }, { id: "12345678901", title: "Third track", queueSource: "user" }];
    localStorage.setItem("persist:settings", JSON.stringify({ owner: JSON.stringify("account:test-a"), audioOnly: "true" }));
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({ version: 1, owner: "account:test-a", savedAt: Date.now(), youtubeVideo: tracks[0], youtubeQueue: tracks, position: 42 }));
    sessionStorage.setItem("queue-seeded", "true");
  });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Expand player: Current track" }).click();
  const dialog = page.getByRole("dialog", { name: "Now playing" });
  await dialog.getByRole("button", { name: "Queue", exact: true }).click();
  const queueDialog = page.getByRole("dialog", { name: "Queue" });
  await expect(queueDialog).toBeVisible();
  const order = () => queueDialog.locator("li[data-track-id]").evaluateAll((rows) => rows.map((row) => row.dataset.trackId));
  await queueDialog.getByRole("button", { name: "Drag Third track to reorder", exact: true }).press("ArrowUp");
  expect(await order()).toEqual(["abcdefghijk", "12345678901", "lmnopqrstuv"]);
  await queueDialog.getByRole("button", { name: "Remove Third track from queue", exact: true }).click();
  expect(await order()).toEqual(["abcdefghijk", "lmnopqrstuv"]);
  await queueDialog.getByRole("button", { name: "Undo queue edit" }).click();
  expect(await order()).toEqual(["abcdefghijk", "12345678901", "lmnopqrstuv"]);
  await queueDialog.getByRole("button", { name: "Clear added tracks" }).click();
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
});

test("mobile video defaults on and exposes the live iframe only after sheet motion settles", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.removeItem("heykasa.media.presentation");
    localStorage.setItem("persist:settings", JSON.stringify({
      owner: JSON.stringify("account:test-a"),
      audioOnly: "false",
      dataSaver: "false",
    }));
    const track = { id: "abcdefghijk", title: "Mobile video stability", channel: "Test Artist" };
    localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({
      version: 1,
      owner: "account:test-a",
      savedAt: Date.now(),
      youtubeVideo: track,
      youtubeQueue: [track],
      position: 42,
    }));
  });

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  const dock = page.getByTestId("player-dock");
  await expect(dock).toBeVisible();

  await page.getByTestId("youtube-decks").evaluate((host) => {
    const frame = document.createElement("iframe");
    frame.title = "Mobile video stability frame";
    frame.srcdoc = '<body style="margin:0;background:#168477;height:100vh"></body>';
    host.querySelector(".yt-crop-frame").appendChild(frame);
  });

  const expand = dock.getByRole("button", { name: "Expand player: Mobile video stability" });
  // Dispatch synchronously so this assertion observes the sheet while its entry
  // animation is actually active. A normal Playwright click can spend longer
  // than the 300ms animation in actionability/stability checks on busy CI.
  await expand.dispatchEvent("click");
  const dialog = page.getByRole("dialog", { name: "Now playing" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/sheetEntering/);
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const responsiveState = await page.evaluate(() => ({
    width: innerWidth,
    phone: matchMedia("(max-width: 767px)").matches,
    compactTouch: matchMedia("(max-width: 767px), (orientation: landscape) and (max-height: 540px) and (max-width: 1100px), (pointer: coarse) and (max-width: 1180px) and (max-height: 900px)").matches,
  }));
  expect(responsiveState).toEqual({ width: 390, phone: true, compactTouch: true });

  const moving = await page.getByTestId("youtube-decks").evaluate((host) => ({
    hidden: host.getAttribute("aria-hidden"),
    opacity: getComputedStyle(host).opacity,
  }));
  expect(moving.hidden).toBe("true");
  expect(Number(moving.opacity)).toBe(0);

  await page.clock.fastForward(380);
  await expect(dialog).not.toHaveClass(/sheetEntering/);

  const settled = await page.getByTestId("youtube-decks").evaluate((host) => {
    const rect = host.getBoundingClientRect();
    return {
      hidden: host.getAttribute("aria-hidden"),
      opacity: getComputedStyle(host).opacity,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });

  expect(settled.hidden).toBe("false");
  expect(Number(settled.opacity)).toBe(1);
  expect(settled.width).toBeGreaterThan(200);
  expect(settled.height).toBeGreaterThan(100);
  expect(settled.left).toBeGreaterThanOrEqual(-1);
  expect(settled.top).toBeGreaterThanOrEqual(-1);
  expect(settled.right).toBeLessThanOrEqual(settled.viewportWidth + 1);
  expect(settled.bottom).toBeLessThanOrEqual(settled.viewportHeight + 1);
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

  const expanded = page.getByRole("dialog", { name: "Expanded video" });
  const assertExpandedLayout = async (label) => {
    await expect(expanded).toBeVisible();
    await expect(expanded.getByRole("button", { name: "Collapse video", exact: true })).toBeVisible();
    const geometry = await page.getByTestId("youtube-decks").evaluate((host) => {
      const rect = host.getBoundingClientRect();
      const frame = window.__videoFrame.getBoundingClientRect();
      return {
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        frameWidth: frame.width, frameHeight: frame.height,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        sameHost: host === window.__videoHost,
        sameFrame: host.contains(window.__videoFrame),
      };
    });
    expect(geometry.left, label).toBeGreaterThanOrEqual(-1);
    expect(geometry.top, label).toBeGreaterThanOrEqual(-1);
    expect(geometry.right, label).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.bottom, label).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.width, label).toBeGreaterThan(Math.min(240, geometry.viewportWidth * 0.6));
    expect(geometry.height, label).toBeGreaterThan(Math.min(150, geometry.viewportHeight * 0.35));
    expect(geometry.frameWidth, label).toBeGreaterThanOrEqual(geometry.width);
    expect(geometry.frameHeight, label).toBeGreaterThanOrEqual(geometry.height);
    expect(geometry.sameHost && geometry.sameFrame, label).toBe(true);
    const outside = await expanded.locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1;
    }).map((button) => button.getAttribute("aria-label")));
    expect(outside, label).toEqual([]);
  };

  const revealControls = async () => {
    const box = await page.getByTestId("youtube-decks").boundingBox();
    expect(box).not.toBeNull();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(center.x, center.y);
    if (await expanded.getAttribute("data-controls") !== "visible") {
      await page.mouse.click(center.x, center.y);
    }
    await expect(expanded).toHaveAttribute("data-controls", "visible");
  };

  await page.keyboard.press("v");
  await assertExpandedLayout("initial viewport");
  await page.screenshot({ path: testInfo.outputPath("video-expanded.png") });
  await revealControls();
  await expanded.getByRole("button", { name: "Collapse video", exact: true }).click();
  await expect(dock).toBeVisible();

  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 768, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(dock).toBeVisible();
    expect(await dock.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press("v");
    await assertExpandedLayout(`${viewport.width}x${viewport.height}`);
    if (viewport.width <= 767) {
      await expect(page.locator(".app-tabbar")).toHaveAttribute("inert", "");
    }
    await page.screenshot({ path: testInfo.outputPath(`expanded-${viewport.width}x${viewport.height}.png`) });
    await revealControls();
    await expanded.getByRole("button", { name: "Collapse video", exact: true }).click();
  }

  await expect(dock).toBeVisible();
  expect(await page.getByTestId("youtube-decks").evaluate((host) => host === window.__videoHost && host.contains(window.__videoFrame))).toBe(true);
  expect(errors).toEqual([]);
});
