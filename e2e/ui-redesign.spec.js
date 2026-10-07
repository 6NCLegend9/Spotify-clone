const { test, expect } = require("@playwright/test");
const { installUiFixtures, UI_TRACK } = require("./fixtures/ui-redesign");

test.afterEach(async ({ page }, testInfo) => {
  if (page.isClosed()) return;
  await testInfo.attach("ui-screenshot", { body: await page.screenshot(), contentType: "image/png" });
});

async function expectNoOverflow(page) {
  await expect.poll(() => page.evaluate(() => {
    const content = document.querySelector(".app-content");
    return document.documentElement.scrollWidth <= window.innerWidth + 1
      && (!content || content.scrollWidth <= content.clientWidth + 1);
  })).toBe(true);
}

async function expectInViewport(locator, page) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const size = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
}

test("shell reflows at policy boundaries without exposing conflicting navigation", async ({ page, isMobile }) => {
  await installUiFixtures(page, { playback: true });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  for (const width of [320, 390, 640, 767, 768, 1024, 1180, 1181, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoOverflow(page);
    const tabs = page.locator(".app-tabbar");
    if (width <= 767) await expect(tabs).toBeVisible();
    else await expect(tabs).toBeHidden();
    const rightPanel = page.locator(".now-playing-panel");
    if (width === 1180) await expect(rightPanel).toBeHidden();
    if (width === 1181) await expect(rightPanel).toBeVisible();
    // These viewport checks preserve the context's real pointer capability.
    if (!isMobile && width >= 768) await expect(page.locator(".app-sidebar")).toBeVisible();
  }
});

test("custom appearance accent survives navigation and reload", async ({ page }) => {
  await installUiFixtures(page, { accent: "#ffcc66" });
  for (const path of ["/search", "/library", "/settings"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator(".app-shell").evaluate((el) => getComputedStyle(el).getPropertyValue("--accent").trim())).toBe("#ffcc66");
    await expectNoOverflow(page);
  }
  await page.reload();
  await expect.poll(() => page.locator(".app-shell").evaluate((el) => getComputedStyle(el).getPropertyValue("--accent").trim())).toBe("#ffcc66");
});

test("compact player volume fits and restored track survives browsing", async ({ page, isMobile }) => {
  test.skip(isMobile, "Fine-pointer compact-window coverage.");
  await installUiFixtures(page, { playback: true });
  await page.setViewportSize({ width: 640, height: 520 });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  const dock = page.getByTestId("player-dock");
  await expect(dock).toContainText(UI_TRACK.title);
  const volume = dock.getByRole("button", { name: "Volume controls" });
  await expectInViewport(volume, page);
  await volume.click();
  await expectInViewport(page.getByTestId("player-volume-popover"), page);
  await expect(page.getByTestId("player-volume-popover").getByRole("slider", { name: "Volume" })).toHaveValue("0.35");
  await page.keyboard.press("Escape");
  await page.locator('.app-tabbar a[href="/library"]').click();
  await expect(dock).toContainText(UI_TRACK.title);
  await expectNoOverflow(page);
});

test("public and form surfaces reflow at narrow width", async ({ page }) => {
  await installUiFixtures(page);
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {} }));
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of ["/login", "/signup", "/reset-password", "/resend-verification", "/privacy", "/terms", "/accessibility", "/dmca", "/open-desktop"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expectNoOverflow(page);
    await expect(page.getByRole("heading", { name: "This page couldn’t load", exact: true })).toHaveCount(0);
  }
});

test("RTL and doubled content scale keep search and keyboard focus reachable", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard and content-scale check uses a desktop context.");
  await installUiFixtures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Browse all", exact: true })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
    document.querySelector(".app-content").style.zoom = "2";
  });
  await expectNoOverflow(page);
  const search = page.getByRole("combobox").first();
  await search.focus();
  await expect(search).toBeFocused();
  await expectInViewport(search, page);
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});
