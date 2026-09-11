const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: { id: "discovery-user", name: "Listener" }, expires: "2099-01-01T00:00:00.000Z" } });
    if (path === "/api/settings") return route.fulfill({ json: { authenticated: true, settings: {} } });
    if (path === "/api/language") return route.fulfill({ json: { authenticated: true, language: [] } });
    if (path === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: [] } } });
    if (path === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    return route.fulfill({ json: { success: true, data: [], results: [], genres: [], tree: [], personalGenres: [] } });
  });
});

test("search filters persist in the URL and pagination deduplicates results", async ({ page }, testInfo) => {
  const requests = [];
  await page.route("**/api/youtube-search?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(params));
    const type = params.get("type");
    const first = { id: "abcdefghijk", title: "First result", channel: "Artist", thumbnail: "/icon-192x192.png" };
    if (type === "channel") return route.fulfill({ json: { results: [{ ...first, id: "channel-fixture", title: "Artist result" }] } });
    if (type === "playlist") return route.fulfill({ json: { results: [{ ...first, id: "playlist-fixture", title: "Playlist result" }] } });
    return route.fulfill({ json: { results: params.has("pageToken")
      ? [first, { ...first, id: "lmnopqrstuv", title: "Second result" }] : [first], nextPageToken: params.has("pageToken") ? "" : "page-2" } });
  });
  await page.goto("/search/cafe", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Play First result", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more results" }).click();
  await expect(page.getByRole("button", { name: "Play Second result", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play First result", exact: true })).toHaveCount(1);
  await page.getByLabel("Filter song duration").selectOption("short");
  await expect(page).toHaveURL(/duration=short/);
  await page.getByLabel("Sort search results").selectOption("date");
  await expect.poll(() => requests.some((params) => params.duration === "short" && params.order === "date")).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Filter song duration")).toHaveValue("short");
  await expect(page.getByLabel("Sort search results")).toHaveValue("date");
  await page.getByRole("tab", { name: "Artists", exact: true }).click();
  await expect(page).toHaveURL(/type=channel/);
  await expect(page.getByRole("link", { name: "Artist result", exact: true })).toBeVisible();
  await expect(page.getByLabel("Filter song duration")).toHaveCount(0);
  await page.getByRole("tab", { name: "Playlists", exact: true }).click();
  await expect(page.getByRole("button", { name: "Playlist result", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("search-controls.png") });
});

test("saved feedback can be restored from Settings", async ({ page }) => {
  const restored = [];
  await page.route(/\/api\/(notInterested|snoozedTracks)$/, (route) => {
    if (route.request().method() === "DELETE") {
      restored.push(route.request().postDataJSON().id);
      return route.fulfill({ json: { success: true, data: [] } });
    }
    return route.fulfill({ json: { success: true, data: ["abcdefghijk"] } });
  });
  await page.route("**/api/youtube-videos?**", (route) => route.fulfill({ json: { tracks: [{ id: "abcdefghijk", title: "Hidden track", thumbnail: "/icon-192x192.png" }] } }));
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.locator("summary").filter({ hasText: "Hidden and snoozed tracks" }).click();
  await expect(page.getByRole("button", { name: "Restore Hidden track", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore Hidden track", exact: true }).click();
  await expect(page.getByText("No tracks.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Snoozed", exact: true }).click();
  await page.getByRole("button", { name: "Restore Hidden track", exact: true }).click();
  expect(restored).toEqual(["abcdefghijk", "abcdefghijk"]);
});

test("insights are opt-in and diagnostics show a redacted downloadable preview", async ({ page }, testInfo) => {
  let enabled = false;
  let cleared = 0;
  const writes = [];
  await page.route("**/api/settings", (route) => {
    if (route.request().method() === "PUT") {
      enabled = route.request().postDataJSON().settings.listeningInsights;
      writes.push(enabled);
      return route.fulfill({ json: { success: true, settings: { listeningInsights: enabled } } });
    }
    return route.fulfill({ json: { authenticated: true, settings: { listeningInsights: false } } });
  });
  await page.route("**/api/playEvent**", (route) => {
    if (route.request().method() === "DELETE") { cleared += 1; return route.fulfill({ json: { success: true } }); }
    return route.fulfill({ json: { success: true, enabled, data: { seconds: 0, sessions: 0, topTracks: [] } } });
  });
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.locator("summary").filter({ hasText: "Listening insights" }).click();
  const consent = page.getByRole("checkbox", { name: "Save listening observations" });
  await expect(consent).not.toBeChecked();
  expect(writes).toEqual([]);
  await consent.click();
  await expect(consent).toBeChecked();
  await expect(page.getByText("No observations in this period.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear observations" }).click();
  await expect.poll(() => cleared).toBe(1);
  await consent.click();
  await expect(consent).not.toBeChecked();
  expect(writes).toEqual([true, false]);
  await page.locator("summary").filter({ hasText: "Support diagnostics" }).click();
  const preview = page.getByLabel("Diagnostic report preview");
  await expect(preview).toContainText('"formatVersion": 1');
  await expect(preview).not.toContainText("discovery-user");
  await expect(preview).not.toContainText("csrfToken");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("heykasa-diagnostics.json");
  await page.getByRole("button", { name: "Clear report", exact: true }).click();
  await expect(preview).toContainText('"events": []');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("insights-diagnostics.png") });
});

test("an old account's pending insight save cannot enable insights for the next account", async ({ page }) => {
  let currentId = "insights-a";
  let releaseSave;
  let saveStarted = false;
  const pending = new Promise((resolve) => { releaseSave = resolve; });
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    user: { id: currentId, name: currentId }, expires: "2099-01-01T00:00:00.000Z",
  } }));
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "PUT") {
      saveStarted = true;
      await pending;
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: { authenticated: true, settings: { listeningInsights: false } } });
  });
  await page.route("**/api/playEvent**", (route) => route.fulfill({ json: { success: true, enabled: false, data: { topTracks: [] } } }));
  try {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.locator("summary").filter({ hasText: "Listening insights" }).click();
    await page.getByRole("checkbox", { name: "Save listening observations" }).click();
    await expect.poll(() => saveStarted).toBe(true);
    currentId = "insights-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "getSession" }, timestamp: Date.now() }),
    })));
    await expect(page.getByRole("link", { name: "Open settings for insights-b" })).toBeVisible();
    releaseSave();
    await page.locator("summary").filter({ hasText: "Listening insights" }).click();
    await expect(page.getByRole("checkbox", { name: "Save listening observations" })).not.toBeChecked();
    await expect.poll(() => page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem("persist:settings") || "{}");
      return [JSON.parse(settings.owner || "null"), JSON.parse(settings.listeningInsights || "false")];
    })).toEqual(["account:insights-b", false]);
  } finally { releaseSave(); }
});