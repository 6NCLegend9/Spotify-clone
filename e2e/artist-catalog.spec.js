const { test, expect } = require("@playwright/test");
const { installArtistPlayer } = require("./fixtures/artist-player");

const ARTIST = "UCaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "UCbbbbbbbbbbbbbbbbbbbbbb";
const albumId = "MPREb_test_album";
const singleId = "MPREb_test_single";
const tracks = Array.from({ length: 7 }, (_, index) => ({
  id: ["abcdefghijk", "lmnopqrstuv", "wxyzabcdefg", "hijklmnopqr", "stuvwxyzabc", "defghijklmn", "opqrstuvwxy"][index],
  title: `Catalog song ${index + 1}`, channel: "Catalog Artist", channelId: ARTIST,
  artists: [{ name: "Catalog Artist", channelId: ARTIST }], duration: 180 + index,
  thumbnail: "/icon-192x192.png",
}));
const albumTracks = [{ ...tracks[5], title: "Album opening song" }, { ...tracks[6], title: "Album closing song" }];
const savedOutsideCatalog = { ...tracks[0], id: "zzzzzzzzzzz", title: "An older saved song" };
const releases = [
  { id: albumId, title: "Catalog Album", type: "album", year: "2026", thumbnail: "/icon-192x192.png" },
  { id: singleId, title: "Catalog Single", type: "single", year: "2025", thumbnail: "/icon-192x192.png" },
];
const sectionData = {
  artist: { id: ARTIST, title: "Catalog Artist", description: "A real provider biography.", banner: "/haykasa-og.png", thumbnail: "/icon-192x192.png" },
  popularTracks: tracks, releases,
  playlists: [{ id: "PL_catalog_playlist", title: "Artist Essentials", description: "A playlist featuring this artist", thumbnail: "/icon-192x192.png" }],
  musicVideos: [{ ...tracks[3], title: "Official music video" }],
  relatedArtists: [{ id: OTHER, title: "Related Artist", thumbnail: "/icon-192x192.png" }],
};
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem("heykasa:playback:v1:account%3Aui-test") || "{}"));

async function fixtures(page, { sectionsFail = false, durationById = {} } = {}) {
  await installArtistPlayer(page, tracks[0], { durationById });
  await page.route("**/api/youtube-channel?**", route => route.fulfill({ json: { artist: sectionData.artist, tracks, nextPageToken: "" } }));
  await page.route("**/api/artist-sections?**", route => sectionsFail
    ? route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE", message: "Catalog temporarily unavailable" } })
    : route.fulfill({ json: sectionData }));
  await page.route("**/api/channel-rabbit-hole?**", route => route.fulfill({ json: { tracks: [{ ...tracks[0], id: "yyyyyyyyyyy", title: "A live performance" }] } }));
  await page.route("**/api/followedArtists", route => route.fulfill({ json: { success: true, data: [], artists: [] } }));
  await page.route("**/api/favourite", route => route.fulfill({ json: { success: true, data: { favourites: [tracks[0].id, savedOutsideCatalog.id, "xxxxxxxxxxx"] } } }));
  await page.route("**/api/youtube-videos?**", route => route.fulfill({ json: { tracks: [
    { ...tracks[0], channel: "Label Uploader", channelId: OTHER, artists: [{ name: "Label Uploader", channelId: OTHER }] },
    savedOutsideCatalog,
    { ...tracks[1], id: "xxxxxxxxxxx", channelId: OTHER, artists: [{ name: "Catalog Artist", channelId: OTHER }] },
  ] } }));
  await page.route("**/api/youtube-album?**", route => route.fulfill({ json: { album: { ...releases[0], artists: tracks[0].artists }, tracks: albumTracks } }));
}

test("artist catalog exposes Spotify sections, release filters and genuine liked songs", async ({ page }, testInfo) => {
  await fixtures(page);
  await page.goto(`/artist/${ARTIST}?name=Catalog%20Artist`);
  await expect(page.getByRole("heading", { name: "Discography", exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#main-content [class~="undefined"]')).toHaveCount(0);
  const popular = page.locator('section[aria-labelledby="artist-songs-title"]');
  await expect(popular.getByRole("button", { name: "Play Catalog song 1", exact: true })).toBeVisible();
  await expect(popular.getByRole("button", { name: "Play Catalog song 6", exact: true })).toHaveCount(0);
  await popular.getByRole("button", { name: /See more|Show more/i }).click();
  await expect(popular.getByRole("button", { name: "Play Catalog song 7", exact: true })).toBeVisible();
  const discography = page.getByRole("region", { name: "Discography", exact: true });
  await discography.getByRole("button", { name: "Albums", exact: true }).click();
  await expect(discography.getByRole("link", { name: "Catalog Album", exact: true })).toBeVisible();
  await expect(discography.getByRole("link", { name: "Catalog Single", exact: true })).toHaveCount(0);
  await discography.getByRole("button", { name: "Singles and EPs", exact: true }).click();
  await expect(discography.getByRole("link", { name: "Catalog Single", exact: true })).toBeVisible();
  await expect(discography.getByRole("link", { name: "Catalog Album", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "You liked", exact: true })).toBeVisible();
  const liked = page.locator("section").filter({ has: page.getByRole("heading", { name: "You liked", exact: true }) });
  await expect(liked).toContainText("2 songs");
  await liked.getByRole("button").click();
  await expect.poll(async () => (await saved(page)).youtubeQueue?.map(item => item.id)).toEqual([tracks[0].id, savedOutsideCatalog.id]);
  await page.route("**/api/favourite", route => route.fulfill({ json: { success: true, data: { favourites: [savedOutsideCatalog.id] } } }));
  await page.evaluate(id => window.dispatchEvent(Object.assign(new CustomEvent("favourites-changed", { detail: [id] }), { accountOwner: "account:ui-test" })), savedOutsideCatalog.id);
  await expect(liked).toContainText("1 song");
  await expect(page.getByRole("heading", { name: "Featuring Catalog Artist", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Artist Essentials", exact: true })).toHaveAttribute("href", /youtube-playlist\/PL_catalog_playlist/);
  await expect(page.getByRole("heading", { name: "Music videos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watch more from Catalog Artist", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Related Artist", exact: true })).toHaveAttribute("href", `/artist/${OTHER}?name=Related%20Artist`);
  await discography.getByRole("button", { name: "Popular releases", exact: true }).click();
  await popular.getByRole("button", { name: "Show less", exact: true }).click();
  await page.locator("#main-content").evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath("artist-catalog.png") });
  for (const id of ["artist-discography-title", "artist-videos-title"]) {
    await page.locator(`#${id}`).evaluate(node => node.scrollIntoView({ block: "start" }));
    await page.locator("#main-content").evaluate(node => { node.scrollTop = Math.max(0, node.scrollTop - 80); });
    await page.screenshot({ path: testInfo.outputPath(`${id}.png`) });
  }
});

test("release links browse real tracks and independent release play starts an album collection", async ({ page }) => {
  await fixtures(page);
  await page.goto(`/artist/${ARTIST}?name=Catalog%20Artist`);
  const discography = page.getByRole("region", { name: "Discography", exact: true });
  await discography.getByRole("button", { name: "Play Catalog Album", exact: true }).click();
  await expect.poll(async () => (await saved(page)).youtubeQueue?.map(item => item.id)).toEqual(albumTracks.map(item => item.id));
  expect((await saved(page)).playbackContext).toMatchObject({ type: "album", id: albumId });
  await expect(page).toHaveURL(/\/artist\//);
  await discography.getByRole("link", { name: "Catalog Album", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/album/${albumId}`));
  await expect(page.getByRole("heading", { name: "Catalog Album", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Catalog Album songs", exact: true }).getByRole("button", { name: "Play Album closing song", exact: true }).click();
  await expect.poll(async () => (await saved(page)).youtubeVideo?.id).toBe(albumTracks[1].id);
  expect((await saved(page)).youtubeQueue.map(item => item.id)).toEqual(albumTracks.map(item => item.id));
  expect((await saved(page)).playbackContext).toMatchObject({ type: "album", id: albumId });
});

test("shuffle, artist menu and compact page remain usable without changing collection semantics", async ({ page }, testInfo) => {
  await fixtures(page);
  await page.goto(`/artist/${ARTIST}?name=Catalog%20Artist`);
  const actions = page.getByRole("region", { name: "Artist actions", exact: true });
  await actions.getByRole("button", { name: /Shuffle/ }).click();
  await expect.poll(async () => (await saved(page)).youtubeQueue?.length).toBe(7);
  expect((await saved(page)).youtubeQueue.map(item => item.id).sort()).toEqual(tracks.map(item => item.id).sort());
  expect((await saved(page)).playbackContext).toMatchObject({ type: "artist", id: ARTIST });
  await actions.getByRole("button", { name: /options/i }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator("#main-content .page").evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    const shuffle = actions.getByRole("button", { name: /Shuffle/ });
    await shuffle.focus();
    await expect(shuffle).toBeFocused();
    const box = await shuffle.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#main-content").evaluate(node => { node.scrollTop = 700; });
  const quickControls = page.getByRole("region", { name: "Artist quick controls", exact: true });
  const quickPlay = quickControls.getByRole("button", { name: /^Play/ });
  await expect(quickPlay).toBeVisible();
  await quickPlay.click();
  await expect.poll(async () => (await saved(page)).youtubeQueue?.map(item => item.id)).toEqual(tracks.map(item => item.id));
  await page.locator("#main-content").evaluate(node => { node.scrollTop = 0; });
  await expect(quickControls).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("artist-catalog-mobile.png") });
});

test("optional artist catalog failures leave songs playable and can be retried", async ({ page }) => {
  await fixtures(page, { sectionsFail: true });
  await page.goto(`/artist/${ARTIST}?name=Catalog%20Artist`);
  await expect(page.getByRole("heading", { name: "Songs & videos", exact: true })).toBeVisible();
  const actions = page.getByRole("region", { name: "Artist actions", exact: true });
  await actions.getByRole("button", { name: /^Play/ }).click();
  await expect.poll(async () => (await saved(page)).youtubeQueue?.length).toBe(7);
  await page.route("**/api/artist-sections?**", route => route.fulfill({ json: sectionData }));
  await page.locator("#main-content .page").getByRole("alert").getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discography", exact: true })).toBeVisible();
  expect((await saved(page)).youtubeQueue.map(item => item.id)).toEqual(tracks.map(item => item.id));
});

test("switching accounts while liked songs load cannot show the previous account's library", async ({ page }) => {
  await fixtures(page);
  let account = "ui-test";
  let firstRead = false;
  let nextRead = false;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route("**/api/auth/session", route => route.fulfill({ json: { user: { id: account, name: account }, expires: "2099-01-01T00:00:00.000Z" } }));
  await page.route("**/api/favourite", async route => {
    const requestOwner = account;
    if (requestOwner === "ui-test") { firstRead = true; await pending; }
    else nextRead = true;
    await route.fulfill({ json: { success: true, data: { favourites: requestOwner === "ui-test" ? [savedOutsideCatalog.id] : [] } } });
  });
  try {
    await page.goto(`/artist/${ARTIST}?name=Catalog%20Artist`);
    await expect.poll(() => firstRead).toBe(true);
    account = "account-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "getSession" }, timestamp: Date.now() }),
    })));
    await expect.poll(() => nextRead).toBe(true);
    const liked = page.locator("section").filter({ has: page.getByRole("heading", { name: "You liked", exact: true }) });
    await expect(liked).toContainText("No liked songs yet");
    const responses = page.waitForResponse(response => new URL(response.url()).pathname === "/api/favourite");
    release();
    await (await responses).finished();
    await expect(liked).toContainText("No liked songs yet");
    await expect(liked.getByRole("button")).toHaveCount(0);
  } finally { release(); }
});

test("Popular and video rails preserve credits and format known, unknown and hour durations", async ({ page }) => {
  await fixtures(page, { durationById: { [tracks[1].id]: 3723.9 } });
  await page.route("**/api/artist-sections?**", route => route.fulfill({ json: {
    ...sectionData,
    popularTracks: tracks.map((track, index) => ({ ...track, duration: index === 0 ? 0 : index === 1 ? 3723.9 : track.duration })),
    musicVideos: [
      { ...sectionData.musicVideos[0], duration: 3723.9 },
      { ...tracks[4], id: "qrstuvwxyzz", title: "Unknown duration video", duration: 0 },
    ],
  } }));
  await page.goto(`/artist/${ARTIST}?name=Catalog%20Artist`);
  const popular = page.getByRole("region", { name: "Popular", exact: true });
  await expect(popular).toContainText("3:00");
  await expect(popular).toContainText("1:02:03");
  const videos = page.getByRole("region", { name: "Music videos", exact: true });
  await expect(videos).toContainText("1:02:03");
  await expect(videos).toContainText("—");
  await expect(popular.getByRole("link", { name: "Catalog Artist", exact: true }).first()).toHaveAttribute("href", `/artist/${ARTIST}?name=Catalog%20Artist`);
  await popular.getByRole("button", { name: "Play Catalog song 2", exact: true }).click();
  await expect(page.getByTestId("player-dock")).toContainText("1:02:03");
});
