const { test, expect } = require("@playwright/test");
const { installArtistPlayer } = require("./fixtures/artist-player");

const PAC = "UCMIdeeBjp_60Jv7ROpRxK6Q";
const DRE = "UCbbbbbbbbbbbbbbbbbbbbbb";
const OT = "UCcccccccccccccccccccccc";
const track = {
  id: "abcdefghijk", title: "California Love (Official Music Video)",
  channel: "2Pac", channelId: PAC, thumbnail: "/icon-192x192.png",
  artists: [{ name: "2Pac", channelId: PAC }, { name: "Dr. Dre", channelId: DRE }],
};

async function fixtures(page, selected = track) {
  await installArtistPlayer(page, selected);
  await page.route("**/api/youtube-channel?**", route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: { artist: { id: url.searchParams.get("id"), title: url.searchParams.get("name"), description: "", thumbnail: "" }, tracks: [], nextPageToken: "" } });
  });
}

async function expectSameQueue(page) {
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("heykasa:playback:v1:account%3Aui-test") || "{}");
    return { current: saved.youtubeVideo?.id, queue: saved.youtubeQueue?.map(item => item.id) };
  })).toEqual({ current: track.id, queue: [track.id] });
}

test("each credited artist has their own link after playback restoration", async ({ page }, testInfo) => {
  await fixtures(page);
  await page.goto("/search");
  const dock = page.getByTestId("player-dock");
  await expect(dock.getByRole("link", { name: "2Pac", exact: true })).toHaveAttribute("href", `/artist/${PAC}?name=2Pac`);
  const guest = dock.getByRole("link", { name: "Dr. Dre", exact: true });
  await expect(guest).toHaveAttribute("href", `/artist/${DRE}?name=Dr.%20Dre`);
  await expect(page.locator('[data-testid="youtube-decks"] iframe')).toHaveCount(1);
  const frame = await page.locator('[data-testid="youtube-decks"] iframe').elementHandle();
  await page.screenshot({ path: testInfo.outputPath("artist-links.png") });
  await guest.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/artist/${DRE}\\?name=Dr\\.%20Dre$`));
  await expect(page.getByRole("heading", { name: "Dr. Dre", exact: true })).toBeVisible();
  expect(await frame.evaluate(node => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => [window.__artistProviderMounts, window.__artistProviderDestroys])).toEqual([1, 0]);
  await expectSameQueue(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/search$/);
  await expectSameQueue(page);
  for (const viewport of [{ width: 320, height: 740 }, { width: 640, height: 520 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await guest.focus();
    await expect(guest).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test("title credits resolve a featured artist instead of sending both to the uploader", async ({ page }) => {
  await fixtures(page, { ...track, artists: undefined, title: "$UICIDEBOY$ Ft. That Mexican OT - Texas to Louisiana (Music Video)", channel: "Trunk Bangers and TRUNK MAFIA MUSIC", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa" });
  await page.route("**/api/youtube-search?**", route => route.fulfill({ json: { results: [{ id: OT, type: "channel", title: "That Mexican OT", channelId: OT }] } }));
  await page.goto("/search");
  const artist = page.getByTestId("player-dock").getByRole("link", { name: "That Mexican OT", exact: true });
  await expect(artist).toHaveAttribute("href", "/artist?name=That%20Mexican%20OT");
  await artist.click();
  await expect(page).toHaveURL(new RegExp(`/artist/${OT}\\?name=That%20Mexican%20OT$`));
  await expect(page.getByRole("heading", { name: "That Mexican OT", exact: true })).toBeVisible();
  await expectSameQueue(page);
});

test("playlist artist links navigate without playing the row", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/favourite", route => route.fulfill({ json: { success: true, data: { favourites: ["lmnopqrstuv"] } } }));
  await page.route("**/api/youtube-videos?**", route => route.fulfill({ json: { tracks: [{ ...track, id: "lmnopqrstuv", title: "Another song", duration: 200 }] } }));
  await page.goto("/library/liked");
  const artist = page.locator(".playlist-track-row").getByRole("link", { name: "Dr. Dre", exact: true });
  // Artist links retain the browser's link menu, rather than the song's actions.
  expect(await artist.evaluate(link => link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))).toBe(true);
  await artist.click();
  await expect(page.getByRole("heading", { name: "Dr. Dre", exact: true })).toBeVisible();
  await expectSameQueue(page);
});

test("mobile artist navigation dismisses the player sheet", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile sheet behavior");
  await fixtures(page);
  await page.goto("/search");
  await page.getByTestId("player-dock").getByRole("button", { name: /^Expand player:/ }).click();
  const sheet = page.getByRole("dialog", { name: "Now playing" });
  await sheet.getByRole("link", { name: "Dr. Dre", exact: true }).first().click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dr. Dre", exact: true })).toBeVisible();
  await expectSameQueue(page);
});

test("queue artist navigation closes its dialog and preserves playback", async ({ page, isMobile }) => {
  await fixtures(page);
  await page.goto("/search");
  const dock = page.getByTestId("player-dock");
  await expect(page.locator('[data-testid="youtube-decks"] iframe')).toHaveCount(1);
  if (isMobile) {
    await dock.getByRole("button", { name: /^Expand player:/ }).click();
    await page.getByRole("dialog", { name: "Now playing" }).getByRole("button", { name: /^(Queue|Show queue)$/ }).first().click();
  } else await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const queue = page.getByRole("dialog", { name: "Queue", exact: true });
  await queue.getByRole("link", { name: "Dr. Dre", exact: true }).click();
  await expect(queue).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByRole("heading", { name: "Dr. Dre", exact: true })).toBeVisible();
  expect(await page.evaluate(() => [window.__artistProviderMounts, window.__artistProviderDestroys])).toEqual([1, 0]);
  await expectSameQueue(page);
});

test("ambiguous artist matches require a choice and failed lookups can be retried", async ({ page }) => {
  await fixtures(page);
  let failed = true;
  await page.route("**/api/youtube-search?**", route => failed
    ? route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE", message: "Please retry" } })
    : route.fulfill({ json: { results: [{ id: PAC, type: "channel", title: "2Pac" }, { id: DRE, type: "channel", title: "2Pac - Topic" }] } }));
  await page.goto("/artist?name=2Pac");
  await expect(page.getByRole("button", { name: /try again|retry/i }).first()).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: /try again|retry/i }).first().click();
  const choices = page.getByRole("region", { name: "Artist matches", exact: true });
  await expect(choices.getByRole("link", { name: "2Pac", exact: true })).toHaveAttribute("href", `/artist/${PAC}?name=2Pac`);
  await expect(choices.getByRole("link", { name: "2Pac - Topic", exact: true })).toHaveAttribute("href", `/artist/${DRE}?name=2Pac%20-%20Topic`);
  await expect(page).toHaveURL(/\/artist\?name=2Pac$/);
});

test("a name lookup with no results gives a search recovery path", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/youtube-search?**", route => route.fulfill({ json: { results: [] } }));
  await page.goto("/artist?name=Missing%20Artist");
  await expect(page.getByRole("heading", { name: "No matching artist found", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Search music", exact: true })).toHaveAttribute("href", "/search/Missing%20Artist");
  await expectSameQueue(page);
});
