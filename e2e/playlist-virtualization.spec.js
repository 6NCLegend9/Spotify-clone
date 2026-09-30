const { test, expect } = require("@playwright/test");

function trackId(index) {
  return String(index).padStart(11, "0");
}

const TRACK_COUNT = 500;
const ids = Array.from({ length: TRACK_COUNT }, (_, index) => trackId(index));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await page.route(/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\//, (route) => route.abort());
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/session") {
      return route.fulfill({
        json: {
          user: { id: "virtual-list-user", name: "Virtual Listener" },
          expires: "2099-01-01T00:00:00.000Z",
        },
      });
    }
    if (url.pathname === "/api/settings") {
      return route.fulfill({ json: { authenticated: true, settings: {} } });
    }
    if (url.pathname === "/api/language") {
      return route.fulfill({ json: { authenticated: true, language: [] } });
    }
    if (url.pathname === "/api/favourite") {
      return route.fulfill({
        json: {
          success: true,
          data: { favourites: ids, favouriteAddedAt: {} },
        },
      });
    }
    if (url.pathname === "/api/youtube-videos") {
      const requested = url.searchParams.getAll("id");
      return route.fulfill({
        json: {
          tracks: requested.map((id) => {
            const index = Number(id);
            return {
              id,
              title: `Virtual song ${index + 1}`,
              channel: `Artist ${index + 1}`,
              thumbnail: "/icon-192x192.png",
              duration: 180,
            };
          }),
        },
      });
    }
    if (url.pathname === "/api/userPlaylists") {
      return route.fulfill({ json: { success: true, data: { playlists: [] } } });
    }
    if (url.pathname === "/api/recommendations") {
      return route.fulfill({ json: { sections: {} } });
    }
    return route.fulfill({
      json: { success: true, data: [], results: [], genres: [], tree: [], personalGenres: [] },
    });
  });
});

test("500-track liked collection mounts a bounded row window while keeping endpoints reachable", async ({ page }) => {
  await page.goto("/library/liked", { waitUntil: "domcontentloaded" });

  const list = page.locator('[data-playlist-virtualized="true"]');
  await expect(list).toHaveAttribute("data-total-rows", String(TRACK_COUNT));

  const mountedAtTop = Number(await list.getAttribute("data-mounted-rows"));
  expect(mountedAtTop).toBeGreaterThan(0);
  expect(mountedAtTop).toBeLessThan(100);
  await expect(page.getByRole("button", { name: "Play Virtual song 500", exact: true })).toBeVisible();

  const scrollRoot = page.locator("[data-app-scroll-container]");
  await scrollRoot.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(async () => Number(await list.getAttribute("data-mounted-rows"))).toBeLessThan(100);
  await expect(page.getByRole("button", { name: "Play Virtual song 1", exact: true })).toBeVisible();
});


test("playlist scroll restoration is isolated by collection across client navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Collection restoration needs one browser-level state regression.");

  const playlists = [
    { _id: "playlist-a", name: "Playlist A", songs: ids, visibility: "private", user: { _id: "virtual-list-user", userName: "Virtual Listener" } },
    { _id: "playlist-b", name: "Playlist B", songs: ids, visibility: "private", user: { _id: "virtual-list-user", userName: "Virtual Listener" } },
  ];

  await page.route("**/api/userPlaylists", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/userPlaylists" || route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { success: true, data: { playlists } } });
  });
  await page.route("**/api/userPlaylists/songs?**", (route) => {
    const url = new URL(route.request().url());
    const playlistId = url.searchParams.get("playlist");
    const playlist = playlists.find((item) => item._id === playlistId);
    if (!playlist) return route.fulfill({ status: 404, json: { success: false } });
    return route.fulfill({ json: { success: true, data: playlist } });
  });

  await page.goto("/library/playlist/playlist-a", { waitUntil: "domcontentloaded" });
  const scrollRoot = page.locator("[data-app-scroll-container]");
  const list = page.locator('[data-playlist-virtualized="true"]');
  await expect(list).toHaveAttribute("data-total-rows", String(TRACK_COUNT));

  await scrollRoot.evaluate((element) => element.scrollTo(0, 6200));
  await expect.poll(() => scrollRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(5000);
  const playlistAScroll = await scrollRoot.evaluate((element) => element.scrollTop);

  await page.locator('a[href="/library/playlist/playlist-b"]').first().click();
  await expect(page).toHaveURL(/\/library\/playlist\/playlist-b$/);
  await expect(list).toHaveAttribute("data-total-rows", String(TRACK_COUNT));
  await scrollRoot.evaluate((element) => element.scrollTo(0, 1500));
  await expect.poll(() => scrollRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000);

  await page.locator('a[href="/library/playlist/playlist-a"]').first().click();
  await expect(page).toHaveURL(/\/library\/playlist\/playlist-a$/);
  await expect.poll(
    () => scrollRoot.evaluate((element) => element.scrollTop),
    { timeout: 10_000 },
  ).toBeGreaterThan(playlistAScroll - 250);
  const restored = await scrollRoot.evaluate((element) => element.scrollTop);
  expect(Math.abs(restored - playlistAScroll)).toBeLessThan(300);
});
