const { test, expect } = require("@playwright/test");

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