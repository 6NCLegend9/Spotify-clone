const { test, expect } = require("@playwright/test");
const { installUiFixtures } = require("./fixtures/ui-redesign");

test("website offers the legacy manual installer without claiming a stable update", async ({ page }) => {
  await installUiFixtures(page);
  await page.route("**/api/desktop/manifest", route => route.fulfill({ json: {
    latest: "1.0.0", minimum: "1.0.0", channel: "stable", published: false,
    signed: false, downloadUrl: "", manualDownload: {
      downloadUrl: "/api/desktop/download", sizeBytes: 110799796,
      source: "github-legacy", signatureVerified: false,
      releaseNotesUrl: "https://github.com/6NCLegend9/Spotify-clone/releases/tag/desktop-latest",
    },
  } }));
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  const download = page.getByRole("link", { name: "Download for Windows", exact: true });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute("href", "/api/desktop/download");
  await expect(page.getByText("Legacy installer", { exact: false })).toBeVisible();
  await expect(page.getByText("Previously published Windows installer.", { exact: false })).toContainText("Automatic updates are not available");
  await expect(page.getByRole("button", { name: "Installer unavailable" })).toHaveCount(0);
});
