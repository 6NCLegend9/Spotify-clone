const { test, expect } = require("@playwright/test");
const { installArtistPlayer } = require("./fixtures/artist-player");

const artistId = "UCaaaaaaaaaaaaaaaaaaaaaa";
const releaseId = "MPREb_release_browser_test";
const emptyReleaseId = "MPREb_empty_release_browser_test";
const artists = [{ name: "Release Artist", channelId: artistId }];
const tracks = [
  { id: "abcdefghijk", title: "Opening song", channel: "Release Artist", channelId: artistId, artists, duration: 181, thumbnail: "/icon-192x192.png" },
  { id: "lmnopqrstuv", title: "Closing song", channel: "Release Artist", channelId: artistId, artists, duration: 242, thumbnail: "/icon-192x192.png" },
];

test("release failures can be retried, empty releases stay disabled and legacy IDs avoid provider requests", async ({ page }) => {
  await installArtistPlayer(page, tracks[0]);
  let failed = true;
  let requests = 0;
  await page.route("**/api/youtube-album?**", route => {
    requests += 1;
    const id = new URL(route.request().url()).searchParams.get("id");
    if (failed) return route.fulfill({ status: 500, json: {
      code: "INTERNAL_ERROR", title: "Release unavailable", message: "The catalog could not load this release. Please try again.",
    } });
    return route.fulfill({ json: {
      album: { id, title: id === emptyReleaseId ? "An empty catalog release" : "A catalog release", type: "album", artists },
      tracks: id === emptyReleaseId ? [] : tracks,
    } });
  });

  await page.goto("/album/legacy-album-123");
  await expect(page.getByRole("heading", { name: "This album page is unavailable", exact: true })).toBeVisible();
  expect(requests).toBe(0);

  await page.goto(`/album/${releaseId}`);
  await expect(page.locator("#main-content .page").getByRole("alert")).toContainText("Release unavailable");
  await expect(page.getByRole("heading", { name: "A catalog release", exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A catalog release", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play Closing song", exact: true })).toBeVisible();
  expect(requests).toBe(2);

  await page.goto(`/album/${emptyReleaseId}`);
  await expect(page.getByRole("heading", { name: "An empty catalog release", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No playable songs in this release", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play An empty catalog release", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play Closing song", exact: true })).toHaveCount(0);
});

test("release artwork, long titles and track controls fit compact and landscape panes", async ({ page }, testInfo) => {
  await installArtistPlayer(page, tracks[0], { accent: "#f5c542" });
  const title = "A very long catalog album title that remains readable on a small screen";
  await page.route("**/api/youtube-album?**", route => route.fulfill({ json: {
    album: { id: releaseId, title, type: "album", year: "2026", artists, thumbnail: "/icon-192x192.png" },
    tracks,
  } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/album/${releaseId}`);
  const release = page.locator("#main-content .page");
  await expect(release.getByRole("heading", { name: title, exact: true })).toBeVisible();

  for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => release.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    const play = release.getByRole("button", { name: "Play Closing song", exact: true });
    await play.focus();
    await expect(play).toBeFocused();
    for (const button of await release.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(release.getByRole("link", { name: "Release Artist", exact: true }).first()).toHaveAttribute("href", `/artist/${artistId}?name=Release%20Artist`);
    await expect(release).toContainText("3:01");
    await expect(release).toContainText("4:02");
    await page.locator("#main-content").evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`release-${viewport.width}.png`) });
  }
});
