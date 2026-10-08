import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const require = createRequire(import.meta.url);
const { installArtistPlayer } = require("../../e2e/fixtures/artist-player.js");
const ARTIST = "UCaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "UCbbbbbbbbbbbbbbbbbbbbbb";
const ALBUM = "MPREb_desktop_smoke";
const STORAGE = "heykasa:playback:v1:account%3Aui-test";
const tracks = [
  { id: "abcdefghijk", title: "Desktop opening song", duration: 243.9 },
  { id: "bcdefghijkl", title: "Desktop closing song", duration: 3723.9 },
  { id: "cdefghijklm", title: "Desktop unknown song", duration: 0 },
].map(track => ({ ...track, channel: "Desktop Artist", channelId: ARTIST, artists: [{ name: "Desktop Artist", channelId: ARTIST }], thumbnail: "/icon-192x192.png" }));
const artist = { id: ARTIST, title: "Desktop Artist", description: "A fixture biography for the Electron renderer.", banner: "/haykasa-og.png", thumbnail: "/icon-192x192.png" };
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}"), STORAGE);

// Real Electron + preload + shared production renderer. Catalog and YouTube
// player fixtures isolate external services; this does not verify live audio.
export async function smokeArtistRenderer(page, origin) {
  const fixtureContext = page.context();
  await installArtistPlayer(fixtureContext, tracks[0], { preserveSavedPlayback: true, durationById: Object.fromEntries(tracks.map(track => [track.id, track.duration])) });
  await fixtureContext.route("https://i.ytimg.com/**", route => route.fulfill({ path: fileURLToPath(new URL("../../public/icon-192x192.png", import.meta.url)), contentType: "image/png" }));
  await fixtureContext.route("**/api/youtube-channel?**", route => route.fulfill({ json: { artist, tracks, nextPageToken: "" } }));
  await fixtureContext.route("**/api/artist-sections?**", route => route.fulfill({ json: {
    artist, popularTracks: [{ ...tracks[0], duration: 0 }, ...tracks.slice(1)],
    releases: [{ id: ALBUM, title: "Desktop Album", type: "album", year: "2026", thumbnail: artist.thumbnail }, { id: "MPREb_desktop_single", title: "Desktop Single", type: "single", thumbnail: artist.thumbnail }],
    playlists: [{ id: "PL_desktop", title: "Desktop Essentials", thumbnail: artist.thumbnail }],
    musicVideos: [{ ...tracks[1], title: "Desktop music video" }],
    relatedArtists: [{ id: OTHER, title: "Desktop Related Artist", thumbnail: artist.thumbnail }],
  } }));
  await fixtureContext.route("**/api/channel-rabbit-hole?**", route => route.fulfill({ json: { tracks: [{ ...tracks[0], id: "defghijklmn", title: "Desktop live performance" }] } }));
  await fixtureContext.route("**/api/favourite", route => route.fulfill({ json: { success: true, data: { favourites: [tracks[0].id] } } }));
  await fixtureContext.route("**/api/followedArtists", route => route.fulfill({ json: { success: true, data: [], artists: [] } }));
  await fixtureContext.route("**/api/youtube-videos?**", route => route.fulfill({ json: { tracks } }));
  await fixtureContext.route("**/api/youtube-album?**", route => route.fulfill({ json: { album: { id: ALBUM, title: "Desktop Album", type: "album", artists: tracks[0].artists, thumbnail: artist.thumbnail }, tracks } }));
  await page.goto(`${origin}/artist/${ARTIST}?name=Desktop%20Artist`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Desktop Artist", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => typeof window.heykasaDesktop?.getInfo), "function");
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  for (const name of ["Popular", "You liked", "Discography", "Featuring Desktop Artist", "Music videos", "Watch more from Desktop Artist", "Fans also like", "About Desktop Artist"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeAttached();
  }
  const popular = page.getByRole("region", { name: "Popular", exact: true });
  await expect(popular).toContainText("4:03");
  await expect(popular).toContainText("1:02:03");
  await expect(popular).toContainText("—");
  await page.getByRole("region", { name: "Artist actions", exact: true }).getByRole("button", { name: "Play songs by Desktop Artist", exact: true }).click();
  await expect.poll(async () => (await saved(page)).youtubeQueue?.map(track => track.id)).toEqual(tracks.map(track => track.id));
  assert.equal((await saved(page)).queueMode, "collection");
  await expect(page.locator('[data-testid="youtube-decks"] iframe')).toHaveCount(1);
  const frame = await page.locator('[data-testid="youtube-decks"] iframe').elementHandle();
  const discography = page.getByRole("region", { name: "Discography", exact: true });
  await discography.getByRole("button", { name: "Singles and EPs", exact: true }).click();
  await expect(discography.getByRole("link", { name: "Desktop Album", exact: true })).toHaveCount(0);
  await discography.getByRole("button", { name: "Popular releases", exact: true }).click();
  await discography.getByRole("link", { name: "Desktop Album", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/album/${ALBUM}`));
  await expect(page.getByRole("heading", { name: "Desktop Album", exact: true })).toBeVisible();
  assert.equal(await frame.evaluate(node => node.isConnected), true, "route navigation retains the actual provider frame");
  const release = page.getByRole("region", { name: "Desktop Album songs", exact: true });
  await expect(release).toContainText("1:02:03");
  await release.getByRole("button", { name: "Play Desktop closing song", exact: true }).click();
  await expect.poll(async () => (await saved(page)).youtubeVideo?.id).toBe(tracks[1].id);
  await expect(page.getByTestId("player-dock")).toContainText("1:02:03");
  assert.deepEqual((await saved(page)).playbackContext, { type: "album", id: ALBUM, name: "Desktop Album" });
  assert.deepEqual((await saved(page)).youtubeQueue.map(track => track.id), tracks.map(track => track.id));
  await page.getByRole("link", { name: "Desktop Artist", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/artist/${ARTIST}`));
  assert.equal(await frame.evaluate(node => node.isConnected), true);
  await page.reload();
  await expect(page.getByTestId("player-dock").getByText("Desktop closing song", { exact: true })).toBeVisible();
  assert.deepEqual((await saved(page)).youtubeQueue.map(track => track.id), tracks.map(track => track.id));
  assert.equal((await saved(page)).playbackContext.id, ALBUM);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  return { artist: true, release: true, durations: true, collectionQueue: true, persistentPlayer: true, fixtureCatalogAndPlayback: true, livePlaybackVerified: false, windowsPackageVerified: false };
}
