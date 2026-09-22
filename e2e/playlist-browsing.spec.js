const { test, expect } = require('@playwright/test');
const tracks = [
  { id: 'abcdefghijk', title: 'First playlist song', channel: 'Test artist', thumbnail: '/icon-192x192.png' },
  { id: 'lmnopqrstuv', title: 'Second playlist song', channel: 'Another artist', thumbnail: '/icon-192x192.png' },
];

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) await page.screenshot({ path: testInfo.outputPath('playlist-page.png') });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await page.route(/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\//, route => route.abort());
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: { user: { id: 'playlist-test', name: 'Listener' }, expires: '2099-01-01T00:00:00.000Z' } });
    if (url.pathname === '/api/settings') return route.fulfill({ json: { authenticated: true, settings: {} } });
    if (url.pathname === '/api/language') return route.fulfill({ json: { authenticated: true, language: [] } });
    if (url.pathname === '/api/favourite') return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    if (url.pathname === '/api/userPlaylists') return route.fulfill({ json: { success: true, data: { playlists: [] } } });
    if (url.pathname === '/api/recommendations') return route.fulfill({ json: { sections: { featuredPlaylists: [{ id: 'PL_fixture', title: 'Featured playlist' }] } } });
    if (url.pathname === '/api/youtube-search') return route.fulfill({ json: { results: tracks } });
    if (url.pathname === '/api/youtube-playlist') return route.fulfill({ json: {
      tracks: url.searchParams.has('pageToken') ? [tracks[0], tracks[1]] : [tracks[0]],
      playlist: { title: 'Featured playlist', channel: 'Test curator' },
      nextPageToken: url.searchParams.has('pageToken') ? '' : 'page_2',
    } });
    return route.fulfill({ json: { success: true, data: [], results: [], genres: [], releases: [], tree: [], personalGenres: [] } });
  });
});

test('home mix artwork opens its song list without starting playback, including after refresh', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Open playlist Sports Mix', exact: true }).click();
  await expect(page).toHaveURL(/\/mix\/cat-Sports$/);
  await expect(page.getByRole('heading', { name: 'Sports Mix', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Second playlist song', exact: true })).toBeVisible();
  await expect(page.locator('#player')).not.toContainText('First playlist song');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Sports Mix', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Second playlist song', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('featured playlists open, load more without duplicates, and filter songs', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Open playlist Featured playlist', exact: true }).click();
  await expect(page).toHaveURL(/\/youtube-playlist\/PL_fixture/);
  await page.getByRole('button', { name: 'Load more songs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play First playlist song', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Play Second playlist song', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search in playlist', exact: true }).fill('Another artist');
  await expect(page.getByRole('button', { name: 'Play First playlist song', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play Second playlist song', exact: true })).toBeVisible();
  await page.goto('/youtube-playlist/PL_fixture', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Featured playlist', exact: true })).toBeVisible();
});

test('the separate mix play button keeps the home page and queues the whole mix', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Play Sports Mix', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('heykasa:playback:v1:account%3Aplaylist-test') || '{}');
    return state.youtubeQueue?.map(track => track.id);
  })).toEqual(tracks.map(track => track.id));
});

test('guests can open featured library playlists without signing in', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Open playlist Featured playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Featured playlist', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play First playlist song', exact: true })).toBeVisible();
});

test('a playlist loading failure can be retried without leaving the page', async ({ page }) => {
  let fail = true;
  await page.route('**/api/youtube-playlist?**', route => fail
    ? route.fulfill({ status: 400, json: { code: 'VALIDATION_ERROR', title: 'Playlist unavailable', message: 'Please try again.' } })
    : route.fulfill({ json: { tracks, playlist: { title: 'Recovered playlist' } } }));
  await page.goto('/youtube-playlist/PL_fixture', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recovered playlist', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Second playlist song', exact: true })).toBeVisible();
});
