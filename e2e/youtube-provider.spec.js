import { expect, test } from "@playwright/test";

test.describe("real YouTube provider smoke", () => {
  test.skip(process.env.HEYKASA_REAL_YOUTUBE_E2E !== "1", "Real provider smoke runs only in its dedicated workflow.");

  test("creates and repositions a real cross-origin YouTube iframe", async ({ page }) => {
    const track = {
      id: "M7lc1UVf-VE",
      title: "YouTube IFrame API Demo",
      channel: "YouTube Developers",
      thumbnail: "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
      seedQuery: "YouTube IFrame API Demo",
    };

    await page.addInitScript((seed) => {
      localStorage.setItem("persist:settings", JSON.stringify({
        owner: JSON.stringify("account:test-a"),
        audioOnly: "false",
        dataSaver: "false",
        syncedLyrics: "true",
      }));
      localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({
        version: 1,
        owner: "account:test-a",
        savedAt: Date.now(),
        youtubeVideo: seed,
        youtubeQueue: [seed],
        queueMode: "radio",
        isPlaying: false,
        position: 0,
      }));
    }, track);

    await page.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/session") {
        return route.fulfill({
          json: { user: { id: "test-a", name: "Provider Smoke" }, expires: "2099-01-01T00:00:00.000Z" },
        });
      }
      if (pathname === "/api/auth/providers") return route.fulfill({ json: {} });
      if (pathname === "/api/settings") {
        return route.fulfill({ json: { authenticated: true, settings: { audioOnly: false, dataSaver: false } } });
      }
      if (pathname === "/api/favourite") {
        return route.fulfill({ json: { success: true, data: { favourites: [] } } });
      }
      return route.fulfill({
        json: { success: true, authenticated: true, data: [], results: [], genres: [], tree: [], personalGenres: [] },
      });
    });

    await page.goto("/search", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("player-dock")).toBeVisible();

    await expect.poll(
      () => page.evaluate(() => typeof window.YT?.Player === "function"),
      { timeout: 60_000 },
    ).toBe(true);

    const realFrame = page.locator(
      '[data-testid="youtube-decks"] iframe[src*="youtube.com/embed/"], [data-testid="youtube-decks"] iframe[src*="youtube-nocookie.com/embed/"]',
    ).first();
    await expect(realFrame).toBeAttached({ timeout: 60_000 });
    await expect(realFrame).toHaveAttribute("src", /M7lc1UVf-VE/);

    await page.keyboard.press("v");
    const theater = page.getByRole("dialog", { name: "Expanded video" });
    await expect(theater).toBeVisible();

    const deck = page.getByTestId("youtube-decks");
    await expect(deck).toHaveAttribute("aria-hidden", "false");
    const box = await deck.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(112);
  });
});
