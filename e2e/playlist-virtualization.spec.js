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

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => Number(await list.getAttribute("data-mounted-rows"))).toBeLessThan(100);
  await expect(page.getByRole("button", { name: "Play Virtual song 1", exact: true })).toBeVisible();
});
