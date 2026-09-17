const { test, expect } = require("@playwright/test");

function genericPayload() {
  return {
    success: true,
    authenticated: true,
    data: [],
    results: [],
    releases: [],
    genres: [],
    tree: [],
    personalGenres: [],
    sections: {},
  };
}

async function installApiFixtures(page, { authenticated }) {
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") {
      return route.fulfill({
        json: authenticated
          ? { user: { id: "route-smoke-user", name: "Route Smoke" }, expires: "2099-01-01T00:00:00.000Z" }
          : {},
      });
    }
    if (pathname === "/api/auth/providers") return route.fulfill({ json: {} });
    if (pathname === "/api/settings") return route.fulfill({ json: { authenticated, settings: {} } });
    if (pathname === "/api/language") return route.fulfill({ json: { authenticated, language: [] } });
    if (pathname === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: [] } } });
    if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    if (pathname === "/api/followedArtists") return route.fulfill({ json: { success: true, data: [], artists: [] } });
    if (pathname === "/api/followedArtists/releases") return route.fulfill({ json: { success: true, releases: [] } });
    if (pathname === "/api/history") return route.fulfill({ json: { success: true, data: [] } });
    if (pathname === "/api/recommendations") return route.fulfill({ json: { success: true, sections: {}, mode: authenticated ? "personalized" : "guest" } });
    return route.fulfill({ json: genericPayload() });
  });
}

async function smokeRoutes(page, routes, browserName) {
  for (const path of routes) {
    await test.step(path, async () => {
      const pageErrors = [];
      const onPageError = (error) => pageErrors.push(error.message);
      page.on("pageerror", onPageError);
      try {
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle");
        expect.soft(response, `${path} should return a document response`).not.toBeNull();
        expect.soft(response?.status() || 0, `${path} should resolve instead of returning 4xx/5xx`).toBeLessThan(400);
        await expect.soft(page.locator("body"), `${path} should render a body`).toBeVisible();
        await expect.soft(
          page.getByRole("heading", { name: "This page couldn’t load", exact: true }),
          `${path} should not expose the application error boundary`,
        ).toHaveCount(0);
        expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path} should not overflow horizontally`).toBe(true);
        const unexpectedPageErrors = pageErrors.filter((message) => browserName !== "webkit"
          || !/^\/localhost:\\d+\/.* due to access control checks\\.$/.test(message));
        expect.soft(unexpectedPageErrors, `${path} should not throw uncaught browser errors`).toEqual([]);
      } finally {
        page.off("pageerror", onPageError);
      }
    });
  }
}

test("public, legal and auth-entry routes render without runtime crashes", async ({ page, browserName }) => {
  await installApiFixtures(page, { authenticated: false });
  await smokeRoutes(page, [
    "/search",
    "/login",
    "/signup",
    "/reset-password",
    "/accessibility",
    "/privacy",
    "/terms",
    "/dmca",
  ], browserName);
});

test("authenticated top-level application routes render without runtime crashes", async ({ page, browserName }) => {
  await installApiFixtures(page, { authenticated: true });
  await smokeRoutes(page, [
    "/",
    "/search",
    "/library",
    "/library/liked",
    "/favourite",
    "/following",
    "/settings",
    "/arcade",
  ], browserName);
});
