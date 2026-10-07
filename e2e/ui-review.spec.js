const { test, expect } = require('@playwright/test');
const { installUiFixtures } = require('./fixtures/ui-redesign');
test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) await page.screenshot({ path: testInfo.outputPath('review.png') });
});

test('desktop reserves player space only after a song is selected', async ({ page }) => {
  await installUiFixtures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/search');
  await expect(page.getByRole('heading', { name: 'Browse all', exact: true })).toBeVisible();
  const shell = page.locator('.app-shell');
  await expect(shell).toHaveAttribute('data-has-track', 'false');
  await expect.poll(() => shell.evaluate(el => getComputedStyle(el).getPropertyValue('--desktop-player-h').trim())).toBe('0px');
  await expect(page.getByTestId('player-dock')).toHaveCount(0);
  await expect(page.locator('.now-playing-panel')).toBeHidden();
});

test('phone navbar controls share a row without overflow', async ({ page }) => {
  await installUiFixtures(page);
  for (const width of [320, 390, 640]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/search');
    const menu = page.getByRole('button', { name: 'Open menu', exact: true }).first();
    const search = page.getByRole('combobox').first();
    await expect(menu).toBeVisible();
    await expect(search).toBeVisible();
    const a = await menu.boundingBox(); const b = await search.boundingBox();
    expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('liked collection is built in and unavailable tracks keep their rows', async ({ page }) => {
  await installUiFixtures(page);
  await page.route('**/api/favourite', route => route.fulfill({ json: { success: true, data: { favourites: ['abcdefghijk', '12345678901'] } } }));
  await page.route('**/api/youtube-videos?**', route => route.fulfill({ json: { tracks: [{ id: 'abcdefghijk', title: 'Available song', channel: 'Artist', duration: 200, thumbnail: '/icon-192x192.png' }] } }));
  await page.goto('/library');
  await expect(page.locator('.app-content').getByRole('link', { name: /Liked Songs/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(page.locator('.app-content').getByRole('link', { name: /Liked Songs/ }).first()).toBeVisible();
  await page.goto('/library/liked');
  const missing = page.locator('.playlist-track-row[data-unavailable="true"]');
  await expect(missing).toContainText('Unavailable song');
  await expect(missing).toContainText('Video unavailable or private');
  await expect(missing.getByRole('link')).toHaveCount(0);
  expect(await missing.locator('button').first().evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThanOrEqual(.4);
  await expect(missing.getByRole('button', { name: 'Unavailable song unavailable', exact: true })).toBeDisabled();
  await expect(missing.locator('button[data-item-menu-trigger]')).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.playlist-track-row').getByText('3:20', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.getByRole('button', { name: 'Play Available song', exact: true }).click();
  await expect(page.getByTestId('player-dock')).toContainText('Available song');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-has-track', 'true');
  await expect(page.locator('.now-playing-panel')).toBeVisible();
  await expect.poll(() => page.locator('.app-shell').evaluate(el => getComputedStyle(el).getPropertyValue('--desktop-player-h').trim())).toBe('90px');
});

test('metadata request failures show an error rather than unavailable song rows', async ({ page }) => {
  await installUiFixtures(page);
  await page.route('**/api/favourite', route => route.fulfill({ json: { success: true, data: { favourites: ['abcdefghijk'] } } }));
  await page.route('**/api/youtube-videos?**', route => route.fulfill({ status: 503, json: { success: false, code: 'SERVICE_UNAVAILABLE', message: 'Please retry' } }));
  await page.goto('/library/liked');
  await expect(page.locator('.playlist-track-row[data-unavailable="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /retry|try again/i }).first()).toBeVisible();
});
