const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await page.route(/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\//, (route) => route.abort());
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/session") {
      return route.fulfill({ json: { user: { id: "theater-user", name: "Theater Test" }, expires: "2099-01-01T00:00:00.000Z" } });
    }
    if (pathname === "/api/auth/providers") return route.fulfill({ json: {} });
    if (pathname === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    if (pathname === "/api/settings") return route.fulfill({ json: { authenticated: true, settings: {} } });
    if (pathname === "/api/language") return route.fulfill({ json: { authenticated: true, language: [] } });
    if (pathname === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: [] } } });
    return route.fulfill({ json: { authenticated: false, data: [], genres: [], tree: [], personalGenres: [], results: [] } });
  });
});

test("expanded media hides chrome on tap/idle and preserves the selected media mode", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("persist:settings", JSON.stringify({
      owner: JSON.stringify("account:theater-user"),
      audioOnly: "false",
      dataSaver: "false",
    }));
    const track = { id: "abcdefghijk", title: "Theater controls verification", channel: "Test Artist" };
    localStorage.setItem("heykasa:playback:v1:account%3Atheater-user", JSON.stringify({
      version: 3,
      owner: "account:theater-user",
      savedAt: Date.now(),
      youtubeVideo: track,
      youtubeQueue: [track],
      position: 42,
      queueMode: "radio",
    }));
  });

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  const dock = page.getByTestId("player-dock");
  await expect(dock).toBeVisible();
  const host = page.getByTestId("youtube-decks");
  await expect(host).toBeAttached();

  await page.keyboard.press("v");
  const theater = page.getByRole("dialog", { name: "Expanded video" });
  await expect(theater).toBeVisible();
  await expect(theater).toHaveAttribute("data-controls", "visible");

  let box = await host.boundingBox();
  expect(box).not.toBeNull();
  const center = () => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

  await page.mouse.click(center().x, center().y);
  await expect(theater).toHaveAttribute("data-controls", "hidden");
  await page.mouse.click(center().x, center().y);
  await expect(theater).toHaveAttribute("data-controls", "visible");

  await page.waitForTimeout(6800);
  await expect(theater).toHaveAttribute("data-controls", "hidden");
  await page.mouse.move(center().x + 8, center().y + 8);
  await expect(theater).toHaveAttribute("data-controls", "visible");

  await theater.getByRole("button", { name: "Switch to audio", exact: true }).click();
  const audioTheater = page.getByRole("dialog", { name: "Expanded audio" });
  await expect(audioTheater).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("heykasa.media.presentation"))).toBe("audio");

  await audioTheater.getByRole("button", { name: "Collapse player", exact: true }).click();
  await expect(audioTheater).toHaveCount(0);
  await dock.getByRole("button", { name: /^Expand player:/ }).click();
  const drawer = page.getByRole("dialog", { name: "Now playing" });
  await expect(drawer.getByRole("button", { name: "Switch to video", exact: true })).toBeVisible();
});
