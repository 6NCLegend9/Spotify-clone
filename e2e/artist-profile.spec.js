const { test, expect } = require("@playwright/test");
const { installArtistPlayer } = require("./fixtures/artist-player");

const PAC = "UCMIdeeBjp_60Jv7ROpRxK6Q";
const DRE = "UCbbbbbbbbbbbbbbbbbbbbbb";
const biography = "Artist biography supplied by the music channel. ".repeat(12) + "The complete biography remains available here.";
const credits = [{ name: "2Pac", channelId: PAC }, { name: "Dr. Dre", channelId: DRE }];
const songs = [
  { id: "abcdefghijk", title: "California Love", channel: "2Pac", channelId: PAC, artists: credits, thumbnail: "", duration: 243 },
  { id: "lmnopqrstuv", title: "Changes", channel: "2Pac", channelId: PAC, thumbnail: "", duration: 269 },
  { id: "wxyzabcdefg", title: "Keep Ya Head Up", channel: "2Pac", channelId: PAC, thumbnail: "", duration: 0 },
];
const discovery = { id: "nopqrstuvwx", title: "A related discovery", channel: "Dr. Dre", channelId: DRE, thumbnail: "", duration: 180 };

async function fixtures(page, { title = "2Pac", description = biography, accent = null } = {}) {
  await installArtistPlayer(page, songs[0], { accent });
  await page.route("**/api/youtube-channel?**", route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: {
      artist: { id: params.get("id"), title: params.get("id") === PAC ? title : "Dr. Dre", description, thumbnail: "" },
      tracks: params.get("pageToken") ? [songs[1], { ...songs[2], id: "hijklmnopqr", title: "Another song", duration: 201 }] : songs,
      nextPageToken: params.get("pageToken") ? "" : "page-two",
    } });
  });
  await page.route("**/api/channel-rabbit-hole?**", route => route.fulfill({ json: { tracks: [songs[0], discovery] } }));
  await page.route("**/api/artist-sections?**", route => route.fulfill({ json: {
    artist: { id: new URL(route.request().url()).searchParams.get("id"), title },
    popularTracks: [], releases: [], playlists: [], musicVideos: [], relatedArtists: [],
  } }));
  await page.route("**/api/followedArtists", route => route.fulfill({ json: { success: true, data: [] } }));
}

const songSection = page => page.locator('section[aria-labelledby="artist-songs-title"]');
const hero = page => page.getByRole("region", { name: "Artist actions", exact: true });
const snapshot = page => page.evaluate(() => JSON.parse(localStorage.getItem("heykasa:playback:v1:account%3Aui-test") || "{}"));

test("high contrast keeps a visible white navigation border", async ({ page }) => {
  await fixtures(page);
  await page.goto(`/artist/${PAC}?name=2Pac`);
  await expect(songSection(page).getByRole("button", { name: "Play California Love", exact: true })).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute("data-a11y-contrast", "high"));
  await expect(page.locator(".app-navbar")).toHaveCSS("border-top-color", "rgb(255, 255, 255)");
  await expect(page.locator(".app-navbar")).toHaveCSS("border-top-width", "1px");
});

test("artist songs expose duration and separate credited artist destinations", async ({ page }, testInfo) => {
  await fixtures(page);
  await page.goto(`/artist/${PAC}?name=2Pac`);
  await expect(songSection(page).getByRole("button", { name: "Play California Love", exact: true })).toBeVisible();
  await expect(page.locator('#main-content [class~="undefined"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "More to explore", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("artist-profile.png") });
  await expect(songSection(page)).toContainText("4:03", { timeout: 5000 });
  await expect(songSection(page)).toContainText("4:29");
  await expect(songSection(page)).toContainText("—");
  await expect(songSection(page).getByRole("link", { name: "Dr. Dre", exact: true })).toHaveAttribute("href", `/artist/${DRE}?name=Dr.%20Dre`);
  if (testInfo.project.name === "chromium-desktop") {
    for (const [name, viewport] of [["compact", { width: 640, height: 520 }], ["wide", { width: 1920, height: 1080 }]]) {
      await page.setViewportSize(viewport);
      if (viewport.width <= 767) {
        await expect.poll(async () => {
          const box = await page.locator(".app-sidebar").boundingBox();
          return box.x + box.width;
        }).toBeLessThanOrEqual(1);
      }
      await expect(hero(page).getByRole("button", { name: /^Play/ })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`artist-${name}.png`) });
    }
  }
});

test("artist collection playback and pagination retain the current queue until an explicit play", async ({ page }) => {
  await fixtures(page);
  await page.goto(`/artist/${PAC}?name=2Pac`);
  await expect(songSection(page).getByRole("button", { name: "Play California Love", exact: true })).toBeVisible();
  await hero(page).getByRole("button", { name: /^Play/ }).click();
  await expect.poll(async () => (await snapshot(page)).youtubeQueue?.map(track => track.id)).toEqual(["abcdefghijk", "lmnopqrstuv", "wxyzabcdefg"]);
  await songSection(page).getByRole("button", { name: /Load more/ }).click();
  await expect(songSection(page).getByRole("button", { name: "Play Another song", exact: true })).toBeVisible();
  await expect(songSection(page).getByRole("button", { name: "Play Changes", exact: true })).toHaveCount(1);
  expect((await snapshot(page)).youtubeQueue.map(track => track.id)).toEqual(["abcdefghijk", "lmnopqrstuv", "wxyzabcdefg"]);
  await songSection(page).getByRole("button", { name: "Play Another song", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).youtubeVideo?.id).toBe("hijklmnopqr");
  const saved = await snapshot(page);
  expect(saved.youtubeQueue.map(track => track.id)).toEqual(["abcdefghijk", "lmnopqrstuv", "wxyzabcdefg", "hijklmnopqr"]);
  expect(saved.playbackContext).toMatchObject({ type: "artist", id: PAC });
  const related = page.locator("section").filter({ has: page.getByRole("heading", { name: "More to explore", exact: true }) });
  await expect(related.getByRole("button", { name: "Play California Love", exact: true })).toHaveCount(0);
  await related.getByRole("button", { name: "Play A related discovery", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).youtubeVideo?.id).toBe(discovery.id);
  expect((await snapshot(page)).youtubeQueue.map(track => track.id)).toEqual([discovery.id]);
  expect((await snapshot(page)).playbackContext).toMatchObject({ type: "artist", id: PAC });
});

test("artist songs can be added to the queue without replacing the current song", async ({ page }) => {
  await fixtures(page);
  await page.goto(`/artist/${PAC}?name=2Pac`);
  const options = songSection(page).getByRole("button", { name: "Queue options", exact: true });
  await expect(options.nth(1)).toBeVisible({ timeout: 5000 });
  await options.nth(1).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Add to queue", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).youtubeQueue?.map(track => track.id)).toEqual(["abcdefghijk", "lmnopqrstuv"]);
  expect((await snapshot(page)).youtubeVideo.id).toBe("abcdefghijk");
});

test("reduced-motion artist navigation resets page-local content while keeping the persistent player", async ({ page }) => {
  await fixtures(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/artist/${PAC}?name=2Pac`);
  await expect(songSection(page).getByRole("button", { name: "Play California Love", exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="youtube-decks"] iframe')).toHaveCount(1);
  const frame = await page.locator('[data-testid="youtube-decks"] iframe').elementHandle();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route(`**/api/youtube-channel?id=${DRE}**`, async route => {
    await waiting;
    await route.fulfill({ json: { artist: { id: DRE, title: "Dr. Dre", description: "A different biography.", thumbnail: "" }, tracks: [{ ...discovery, title: "A different song" }], nextPageToken: "" } });
  });
  try {
    await page.getByTestId("player-dock").getByRole("link", { name: "Dr. Dre", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dr. Dre", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(hero(page).getByRole("button", { name: /^Play/ })).toBeDisabled();
    await expect(songSection(page).getByRole("button", { name: "Play California Love", exact: true })).toHaveCount(0);
    expect(await frame.evaluate(node => node.isConnected)).toBe(true);
    expect((await snapshot(page)).youtubeVideo.id).toBe("abcdefghijk");
  } finally { release(); }
  await expect(songSection(page).getByRole("button", { name: "Play A different song", exact: true })).toBeVisible();
  expect(await page.evaluate(() => [window.__artistProviderMounts, window.__artistProviderDestroys])).toEqual([1, 0]);
});

test("artist follow failures recover and retry persists the requested artist", async ({ page }) => {
  await fixtures(page);
  let fail = true;
  let followed = false;
  await page.route("**/api/followedArtists", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { success: true, data: followed ? ["2Pac"] : [], artists: followed ? [{ name: "2Pac", channelId: PAC }] : [] } });
    expect(route.request().postDataJSON()).toMatchObject({ name: "2Pac", channelId: PAC, followed: true });
    if (fail) return route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE", message: "Please retry" } });
    followed = true;
    return route.fulfill({ json: { success: true, data: ["2Pac"], artists: [{ name: "2Pac", channelId: PAC }] } });
  });
  await page.goto(`/artist/${PAC}?name=2Pac`);
  await expect(songSection(page).getByRole("button", { name: "Play California Love", exact: true })).toBeVisible();
  await hero(page).getByRole("button", { name: "Follow", exact: true }).click();
  await expect(hero(page).getByRole("button", { name: "Follow", exact: true })).toHaveAttribute("aria-pressed", "false");
  fail = false;
  await hero(page).getByRole("button", { name: "Follow", exact: true }).click();
  await expect(hero(page).getByRole("button", { name: "Following", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("artist error, retry and empty states cannot play stale content", async ({ page }) => {
  await fixtures(page, { description: "" });
  let fail = true;
  await page.route("**/api/youtube-channel?**", route => fail ? route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE", message: "Please retry" } }) : route.fulfill({ json: { artist: { id: PAC, title: "2Pac", description: "", thumbnail: "" }, tracks: [], nextPageToken: "" } }));
  await page.goto(`/artist/${PAC}?name=2Pac`);
  const alert = page.locator("#main-content .page").getByRole("alert");
  await expect(alert).toContainText("Artist unavailable");
  await expect(alert.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(hero(page).getByRole("button", { name: /^Play/ })).toBeDisabled();
  fail = false;
  await alert.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No songs found for 2Pac", exact: true })).toBeVisible();
  await expect(hero(page).getByRole("button", { name: /^Play/ })).toBeDisabled();
  expect((await snapshot(page)).youtubeVideo.id).toBe("abcdefghijk");
});

test("guests can play artist songs and have a clear path to log in before following", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/auth/session", route => route.fulfill({ json: {} }));
  await page.goto(`/artist/${PAC}?name=2Pac`);
  await expect(songSection(page).getByRole("button", { name: "Play California Love", exact: true })).toBeVisible();
  await expect(hero(page).getByRole("link", { name: "Log in to follow", exact: true })).toHaveAttribute("href", "/login");
  await expect(hero(page).getByRole("button", { name: "Follow", exact: true })).toHaveCount(0);
  await hero(page).getByRole("button", { name: /^Play/ }).click();
  await expect(page.getByTestId("player-dock").getByText("California Love", { exact: true })).toBeVisible();
});

test("artist long text, biography and controls remain usable at compact sizes", async ({ page }, testInfo) => {
  const title = "A".repeat(100);
  await fixtures(page, { title, accent: "#ffcc00" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/artist/${PAC}?name=${title}`);
  await expect(songSection(page).getByRole("button", { name: "Play California Love", exact: true })).toBeVisible();
  for (const viewport of [{ width: 320, height: 740 }, { width: 640, height: 520 }, { width: 844, height: 390 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { timeout: 5000 }).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator("#main-content .page").evaluate(node => node.scrollWidth - node.clientWidth), { timeout: 5000, message: `Artist pane overflow at ${viewport.width}x${viewport.height}` }).toBeLessThanOrEqual(1);
    const play = hero(page).getByRole("button", { name: /^Play/ });
    await play.focus();
    await expect(play).toBeFocused();
    const bounds = await play.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    const queueButton = songSection(page).getByRole("button", { name: "Queue options", exact: true }).first();
    await queueButton.focus();
    await expect(queueButton).toBeFocused();
    const queueBounds = await queueButton.boundingBox();
    expect(queueBounds.width).toBeGreaterThanOrEqual(44);
    expect(queueBounds.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#main-content").evaluate(node => { node.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const about = page.locator("summary").filter({ hasText: /^About / });
  await about.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(biography, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("artist-long-text.png") });
});
