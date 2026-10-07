const { test, expect } = require("@playwright/test");
const { installUiFixtures } = require("./fixtures/ui-redesign");

const views = [
  { label: "phone-search", width: 390, height: 844, path: "/search" },
  { label: "phone-landscape", width: 844, height: 390, path: "/search", playback: true },
  { label: "tablet-library", width: 1024, height: 768, path: "/library" },
  { label: "desktop-home", width: 1440, height: 900, path: "/" },
  { label: "wide-settings", width: 1920, height: 1080, path: "/settings" },
  { label: "compact-player", width: 640, height: 520, path: "/search", playback: true },
  { label: "narrow-login", width: 320, height: 740, path: "/login", guest: true },
];

for (const view of views) {
  test(`visual reflow: ${view.label}`, async ({ page }, testInfo) => {
    await installUiFixtures(page, { playback: view.playback });
    if (view.guest) await page.route("**/api/auth/session", (route) => route.fulfill({ json: {} }));
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.goto(view.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".app-shell")).toBeVisible();
    // Capture settled page content rather than a route's initial skeleton.
    await expect(page.locator(view.path === "/" ? ".home-display" : ".app-content h1").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByRole("heading", { name: "This page couldn’t load", exact: true })).toHaveCount(0);
    if (view.playback) await expect(page.getByTestId("player-dock")).toBeVisible();
    if (view.label === "phone-landscape") {
      const phone = await page.locator(".app-shell").getAttribute("data-phone");
      if (phone === "true") await expect(page.locator(".app-tabbar")).toBeVisible();
      const expand = page.getByTestId("player-dock").getByRole("button", { name: /^Expand player:/ });
      await expand.click();
      const dialog = page.getByRole("dialog", { name: "Now playing" });
      await expect(dialog).toBeVisible();
      await expect.poll(async () => {
        const box = await dialog.boundingBox();
        return box && box.y >= -1 && box.y + box.height <= view.height + 1;
      }).toBe(true);
    }
    const colors = await page.locator(".app-shell").evaluate((el) => {
      const css = getComputedStyle(el);
      return ["--text", "--muted", "--navy-surface", "--navy-raised"].map((name) => css.getPropertyValue(name).trim());
    });
    function luminance(hex) {
      const rgb = hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16) / 255);
      return rgb.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    }
    for (const foreground of colors.slice(0, 2)) {
      for (const background of colors.slice(2)) {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        expect((values[0] + .05) / (values[1] + .05)).toBeGreaterThanOrEqual(4.5);
      }
    }
    const screenshotPath = testInfo.outputPath(`${view.label}.png`);
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach(view.label, { path: screenshotPath, contentType: "image/png" });
  });
}
