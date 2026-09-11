const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page, serviceWorkers }) => {
  if (serviceWorkers === "block") {
    await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  }
});

test("server HTML has a nonblank startup state before JavaScript hydrates", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/search", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status", { name: "Loading HeyKasa" })).toBeVisible();
    await expect(page.getByAltText("HeyKasa")).toBeVisible();
    await expect(page.locator("noscript")).toHaveJSProperty("textContent", "JavaScript is required to play music.");
  } finally {
    await context.close();
  }
});

test("home never displays legacy account caches while account data is pending", async ({ page }) => {
  let releaseRequests;
  const pending = new Promise((resolve) => { releaseRequests = resolve; });
  await page.addInitScript(() => {
    const track = { id: "abcdefghijk", title: "Other account private track", channel: "Other account" };
    sessionStorage.setItem("HeyKasa-home-recommendations-v2:authenticated", JSON.stringify({
      sections: { trending: [track] }, mode: "personalized",
    }));
    localStorage.setItem("songHistory", JSON.stringify([track]));
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") {
      return route.fulfill({ json: { user: { id: "new-account", name: "New account" }, expires: "2099-01-01T00:00:00.000Z" } });
    }
    if (["/api/history", "/api/recommendations"].includes(pathname)) await pending;
    if (pathname === "/api/recommendations") return route.fulfill({ json: { sections: {}, mode: "personalized" } });
    if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    return route.fulfill({ json: { success: true, data: [], releases: [], genres: [], tree: [] } });
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Open Liked Songs", exact: true })).toBeVisible();
    await expect(page.getByText("Other account private track", { exact: true })).toHaveCount(0);
  } finally {
    releaseRequests();
  }
});

test("home and sidebar discard account A after a live session switch", async ({ page }) => {
  let accountId = "account-a";
  const settingsRequests = [];
  let releaseRequests;
  const pending = new Promise((resolve) => { releaseRequests = resolve; });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const requestedAccount = accountId;
    if (pathname === "/api/auth/session") {
      return route.fulfill({ json: { user: { id: accountId, name: accountId }, expires: "2099-01-01T00:00:00.000Z" } });
    }
    if (pathname === "/api/settings") {
      settingsRequests.push(requestedAccount);
      return route.fulfill({ json: { authenticated: true, settings: { normalization: requestedAccount === "account-a" ? "quiet" : "normal" } } });
    }
    if (requestedAccount === "account-b" && ["/api/history", "/api/recommendations", "/api/userPlaylists"].includes(pathname)) await pending;
    const track = { id: "abcdefghijk", title: "Account A private history", channel: "Account A" };
    if (pathname === "/api/recommendations") return route.fulfill({ json: { sections: {}, mode: "personalized" } });
    if (pathname === "/api/history") return route.fulfill({ json: { success: true, data: requestedAccount === "account-a" ? [track] : [] } });
    if (pathname === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: requestedAccount === "account-a" ? [{ _id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Account A private playlist", songs: [] }] : [] } } });
    if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    return route.fulfill({ json: { success: true, data: [], releases: [], genres: [], tree: [] } });
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Account A private history", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Account A private playlist", { exact: true }).first()).toBeVisible();
    accountId = "account-b";
    await page.evaluate(() => {
      window.__accountSwitchMarker = "same-page";
      window.dispatchEvent(new StorageEvent("storage", {
        key: "nextauth.message",
        newValue: JSON.stringify({ event: "session", data: { trigger: "getSession" }, timestamp: Date.now() }),
      }));
    });
    await expect.poll(() => settingsRequests.includes("account-b")).toBe(true);
    await expect(page.getByText("Account A private history", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Account A private playlist", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.__accountSwitchMarker)).toBe("same-page");
    releaseRequests();
    await expect(page.getByText("Account A private history", { exact: true })).toHaveCount(0);
  } finally {
    releaseRequests();
  }
});

test("home starts independent account reads and exposes quick access before recommendations", async ({ page }) => {
  const requested = new Set();
  let releaseSlowRequests;
  const pending = new Promise((resolve) => { releaseSlowRequests = resolve; });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    requested.add(pathname);
    if (pathname === "/api/auth/session") {
      return route.fulfill({ json: { user: { id: "home-test", name: "Test" }, expires: "2099-01-01T00:00:00.000Z" } });
    }
    if (["/api/history", "/api/recommendations"].includes(pathname)) await pending;
    if (pathname === "/api/recommendations") return route.fulfill({ json: { sections: {}, mode: "personalized" } });
    if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    return route.fulfill({ json: { success: true, data: [], releases: [], genres: [], tree: [] } });
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Open Liked Songs", exact: true })).toBeVisible();
    await expect.poll(() => requested.has("/api/history") && requested.has("/api/recommendations")
      && requested.has("/api/userPlaylists") && requested.has("/api/followedArtists/releases")).toBe(true);
  } finally {
    releaseSlowRequests();
  }
});

for (const destination of ["/library", "/following", "/library/liked"]) {
  test(`account navigation caches stay isolated on ${destination}`, async ({ page, isMobile }) => {
    let accountId = "nav-a";
    const track = { id: "abcdefghijk", title: "Private saved track from A", channel: "Artist A", duration: 180 };
    await page.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/session") return route.fulfill({ json: { user: { id: accountId, name: accountId }, expires: "2099-01-01T00:00:00.000Z" } });
      if (pathname === "/api/settings") return route.fulfill({ json: { authenticated: true, settings: {} } });
      if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: accountId === "nav-a" ? [track.id] : [] } } });
      if (pathname === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: accountId === "nav-a" ? [{ _id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Private saved playlist from A", songs: [], user: "nav-a" }] : [] } } });
      if (pathname === "/api/followedArtists") return route.fulfill({ json: { success: true, data: accountId === "nav-a" ? ["Private followed artist from A"] : [], artists: [{ name: "Private followed artist from A", channelId: "channel-a", thumbnail: "/icon-192x192.png" }] } });
      if (pathname === "/api/youtube-videos") return route.fulfill({ json: { tracks: [track] } });
      if (pathname === "/api/recommendations") return route.fulfill({ json: { sections: {}, mode: "personalized" } });
      return route.fulfill({ json: { success: true, data: [], releases: [], genres: [], tree: [] } });
    });
    const privateText = destination === "/library" ? "Private saved playlist from A"
      : destination === "/following" ? "Private followed artist from A" : track.title;
    await page.goto(destination, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(privateText, { exact: true }).first()).toBeVisible();
    accountId = "nav-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "nextauth.message",
      newValue: JSON.stringify({ event: "session", data: { trigger: "getSession" }, timestamp: Date.now() }),
    })));
    await expect(page.getByText(privateText, { exact: true })).toHaveCount(0);
    const homeLink = isMobile
      ? page.locator(".app-tabbar").getByRole("link", { name: "Home", exact: true })
      : page.getByRole("link", { name: "Home", exact: true }).first();
    await homeLink.press("Enter");
    await expect(page.getByRole("link", { name: "Open Liked Songs", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText(privateText, { exact: true })).toHaveCount(0);
  });
}

test("a pending favourite removal cannot publish the previous account's list", async ({ page }) => {
  let accountId = "mutation-a";
  let removalStarted = false;
  let releaseRemoval;
  const pending = new Promise((resolve) => { releaseRemoval = resolve; });
  const tracks = [
    { id: "abcdefghijk", title: "Account A track", channel: "Artist A" },
    { id: "lmnopqrstuv", title: "Account B track", channel: "Artist B" },
  ];
  await page.addInitScript(() => {
    window.__publishedFavourites = [];
    window.addEventListener("favourites-changed", (event) => window.__publishedFavourites.push(event.detail));
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") return route.fulfill({ json: { user: { id: accountId, name: accountId }, expires: "2099-01-01T00:00:00.000Z" } });
    if (pathname === "/api/settings") return route.fulfill({ json: { authenticated: true, settings: {} } });
    if (pathname === "/api/language") return route.fulfill({ json: { authenticated: true, language: [] } });
    if (pathname === "/api/favourite") {
      if (route.request().method() === "POST") {
        removalStarted = true;
        await pending;
        return route.fulfill({ json: { success: true, data: { favourites: ["12345678901"] } } });
      }
      return route.fulfill({ json: { success: true, data: { favourites: [tracks[accountId === "mutation-a" ? 0 : 1].id] } } });
    }
    if (pathname === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: [] } } });
    if (pathname === "/api/youtube-videos") return route.fulfill({ json: { tracks } });
    return route.fulfill({ json: { success: true, data: [], results: [], genres: [], tree: [], personalGenres: [] } });
  });
  try {
    await page.goto("/library/liked", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Remove Account A track from Liked Songs", exact: true }).press("Enter");
    await expect.poll(() => removalStarted).toBe(true);
    accountId = "mutation-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "getSession" }, timestamp: Date.now() }),
    })));
    await expect(page.getByRole("button", { name: "Remove Account B track from Liked Songs", exact: true })).toBeAttached();
    const completed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/favourite" && response.request().method() === "POST");
    releaseRemoval();
    await (await completed).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => window.__publishedFavourites)).toEqual([]);
  } finally {
    releaseRemoval();
  }
});

test("session revocation requires confirmation and retains a usable error state", async ({ page }, testInfo) => {
  let attempts = 0;
  let signedIn = true;
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") return route.fulfill({ json: signedIn
      ? { user: { id: "session-test", name: "Session test" }, expires: "2099-01-01T00:00:00.000Z" } : {} });
    if (pathname === "/api/settings") return route.fulfill({ json: { authenticated: true, settings: {} } });
    if (pathname === "/api/language") return route.fulfill({ json: { authenticated: true, language: [] } });
    if (pathname === "/api/auth/csrf") return route.fulfill({ json: { csrfToken: "fixture-csrf" } });
    if (pathname === "/api/auth/signout") {
      signedIn = false;
      return route.fulfill({ json: { url: `${new URL(route.request().url()).origin}/login` } });
    }
    if (pathname === "/api/account/sessions") {
      expect(route.request().postDataJSON()).toEqual({ confirm: true });
      attempts += 1;
      return attempts === 1
        ? route.fulfill({ status: 503, json: { success: false, code: "SERVICE_UNAVAILABLE", title: "Try again", message: "Could not sign out devices." } })
        : route.fulfill({ json: { success: true, data: null } });
    }
    if (pathname === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: [] } } });
    if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    return route.fulfill({ json: { success: true, data: [], genres: [], tree: [], personalGenres: [] } });
  });
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "Sign out all devices", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Sign out all devices?" });
  await expect(dialog).toBeVisible();
  expect(attempts).toBe(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  expect(await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("sign-out-devices.png") });
  await dialog.getByRole("button", { name: "Sign out all devices", exact: true }).click();
  await expect(dialog.getByText("Could not sign out devices.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sign out all devices", exact: true })).toBeEnabled();
  expect(attempts).toBe(1);
  await dialog.getByRole("button", { name: "Sign out all devices", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(attempts).toBe(2);
});

test.describe("production PWA", () => {
  test.use({ serviceWorkers: "allow" });
  test("registers successfully and never caches account API responses", async ({ page, context }) => {
    test.skip(!process.env.CI && process.env.PLAYWRIGHT_PWA !== "1", "Requires a PWA-enabled production build");
    let currentAccount = "pwa-a";
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const headers = { "Cache-Control": "private, no-store" };
      if (pathname === "/api/auth/session") {
        return route.fulfill({ headers, json: { user: { id: currentAccount, name: currentAccount }, expires: "2099-01-01T00:00:00.000Z" } });
      }
      if (pathname === "/api/settings") return route.fulfill({ headers, json: { authenticated: true, settings: {} } });
      if (pathname === "/api/language") return route.fulfill({ headers, json: { authenticated: true, language: [] } });
      if (pathname === "/api/userPlaylists") return route.fulfill({ headers, json: { success: true, data: { playlists: [] } } });
      return route.fulfill({ headers, json: { success: true, data: [], genres: [], tree: [], personalGenres: [] } });
    });
    await page.goto("/search", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Browse all" })).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith("/sw.js"));
    const readAccount = () => page.evaluate(async () => (await (await fetch("/api/auth/session")).json()).user.id);
    expect(await readAccount()).toBe("pwa-a");
    currentAccount = "pwa-b";
    expect(await readAccount()).toBe("pwa-b");
    const privateCacheEntries = await page.evaluate(async () => {
      const entries = await Promise.all((await caches.keys()).map(async (name) => {
        const cache = await caches.open(name);
        return (await cache.keys()).map((request) => new URL(request.url).pathname);
      }));
      return entries.flat().filter((pathname) => pathname.startsWith("/api/")
        || /^\/(?:login|signup|reset-password|verify-email)(?:\/|$)/.test(pathname));
    });
    expect(privateCacheEntries).toEqual([]);
    expect(errors).toEqual([]);
  });
});