const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, 'artifacts/playlist-duration');
fs.mkdirSync(output, { recursive: true });
const port = 3013, origin = `http://127.0.0.1:${port}`;
const log = fs.createWriteStream(path.join(output, 'server.log'));
const production = process.env.HAYKASA_QA_PRODUCTION === '1';
const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), production ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env: { ...process.env, NODE_ENV: production ? 'production' : 'development', NEXT_TELEMETRY_DISABLED: '1', NEXTAUTH_URL: origin, NEXTAUTH_SECRET: 'isolated-playlist-browser-secret', JWT_SECRET: 'isolated-playlist-browser-secret' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.pipe(log); server.stderr.pipe(log);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
const results = [];
(async () => {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error(`Next exited: ${server.exitCode}`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await wait(1000);
  }
  assert(ready);
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  for (const [device, viewport] of Object.entries({ mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 1000 } })) {
    for (const scenario of ['liked-saved', 'playlist-saved', 'liked-legacy', 'liked-unknown', 'playlist-virtual']) {
      const liked = scenario.startsWith('liked');
      const ids = Array.from({ length: scenario.endsWith('virtual') ? 240 : 15 }, (_, i) => `qp${String(i).padStart(9, '0')}`);
      const durationMap = scenario.includes('unknown') || scenario.includes('legacy') ? {} : Object.fromEntries(ids.map(id => [id, 218]));
      const context = await browser.newContext({ viewport, isMobile: device === 'mobile', hasTouch: device === 'mobile', serviceWorkers: 'block', reducedMotion: 'reduce' });
      await context.addInitScript(({ id }) => {
        // Playlist tests do not exercise PWA registration. Playwright's blocked
        // register() resolves undefined, unlike a real browser registration;
        // expose the supported no-service-worker branch instead of that shim.
        for (let prototype = navigator; prototype; prototype = Object.getPrototypeOf(prototype)) {
          if (Object.hasOwn(prototype, 'serviceWorker')) delete prototype.serviceWorker;
        }
        localStorage.setItem('toturialComplete', 'true');
        sessionStorage.setItem('HayKasa-track-cache-v1', JSON.stringify({ [id]: { track: { id, title: 'Stale track', duration: 0 }, expiresAt: Date.now() + 999999 } }));
      }, { id: ids[0] });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let detailsRequests = 0;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let body = { success: true, data: [] };
        if (url.pathname === '/api/auth/session') body = { user: { id: '507f1f77bcf86cd799439013', name: 'Playlist QA', email: 'qa@example.invalid' }, expires: '2099-01-01T00:00:00Z' };
        if (url.pathname === '/api/settings') body = { authenticated: true, settings: { explicitContent: false, privateSession: false } };
        if (url.pathname === '/api/language') body = { authenticated: true, language: [] };
        if (url.pathname === '/api/favourite') body = { success: true, data: { favourites: ids, favouriteDurations: durationMap } };
        if (url.pathname === '/api/userPlaylists/songs') body = { success: true, data: { _id: '507f1f77bcf86cd799439012', name: 'QA playlist', user: { _id: '507f1f77bcf86cd799439013', userName: 'Playlist QA' }, songs: ids, songDurations: durationMap, collaborators: [] } };
        if (url.pathname === '/api/userPlaylists') body = { success: true, data: { playlists: [] } };
        if (url.pathname === '/api/media/resolve') body = { enabled: false };
        if (url.pathname === '/api/youtube-videos') {
          detailsRequests++;
          body = { tracks: url.searchParams.getAll('id').map((id, i) => ({ id, title: i === 0 ? 'A very long song title '.repeat(15) : `Song ${id}`, channel: 'Artist', duration: scenario.includes('legacy') ? 218 : 0 })) };
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(origin + (liked ? '/library/liked' : '/library/playlist/507f1f77bcf86cd799439012'), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.locator('.playlist-track-row').first().waitFor({ timeout: 90000 });
      const row = page.locator('.playlist-track-row').first();
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      const metrics = await row.evaluate(row => {
        const rect = row.getBoundingClientRect(), duration = row.querySelector('[data-track-duration]').getBoundingClientRect(), menu = row.querySelector('[data-item-menu-trigger]').getBoundingClientRect();
        return { height: rect.height, duration: row.querySelector('[data-track-duration]').textContent, menuY: menu.top + menu.height / 2, durationY: duration.top + duration.height / 2, right: rect.right, width: innerWidth };
      });
      assert.equal(metrics.height, 66, 'Compact row matches virtualization height');
      assert(Math.abs(metrics.menuY - metrics.durationY) < 2, 'Menu and duration stay on the same line');
      assert(metrics.right <= metrics.width + 1, 'Row fits viewport');
      assert.equal(metrics.duration, scenario.includes('unknown') ? '—' : '3:38');
      const copy = await page.locator('.page-collection').innerText();
      assert(!copy.includes('songs, 0 min'), 'Unknown totals never show fake zero minutes');
      assert(copy.includes(scenario.includes('unknown') ? 'Duration unavailable' : scenario.endsWith('virtual') ? '14 hr 32 min' : '54 min'));
      assert(detailsRequests > 0, 'Unknown cached metadata was retried');
      await row.locator('[data-item-menu-trigger]').click();
      await page.getByRole('menu').waitFor();
      assert.equal(await row.evaluate(node => node.getBoundingClientRect().height), 66, 'Open menu does not expand row');
      assert.equal(errors.length, 0, errors.join('; '));
      await page.screenshot({ path: path.join(output, `${device}-${scenario}.png`) });
      results.push({ device, scenario, status: 'passed', metrics, detailsRequests });
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
      console.log(`PASS ${device}/${scenario}: 66px row, duration, total, stale cache retry, menu`);
      await context.close();
    }
  }
  // Exercise the real SessionProvider transition that the Android guest tour
  // exposed: generation changes after loading must restart the public read.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    for (let prototype = navigator; prototype; prototype = Object.getPrototypeOf(prototype)) {
      if (Object.hasOwn(prototype, 'serviceWorker')) delete prototype.serviceWorker;
    }
    localStorage.setItem('toturialComplete', 'true');
  });
  let releaseSession;
  const sessionReady = new Promise(resolve => { releaseSession = resolve; });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let publicReads = 0;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let body = { success: true, data: [] };
    if (url.pathname === '/api/auth/session') { await sessionReady; body = {}; }
    if (url.pathname === '/api/settings') body = { authenticated: false, settings: {} };
    if (url.pathname === '/api/language') body = { authenticated: false, language: [] };
    if (url.pathname === '/api/recommendations') { publicReads++; body = { sections: { featuredPlaylists: [] } }; }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const sessionRequested = page.waitForRequest(request => new URL(request.url()).pathname === '/api/auth/session');
  await page.goto(origin + '/library', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sessionRequested;
  await page.locator('.page .animate-shimmer').first().waitFor();
  releaseSession();
  await page.locator('.page').getByRole('link', { name: 'Log in', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'No featured playlists right now', exact: true }).waitFor();
  assert.equal(await page.locator('.page .animate-shimmer').count(), 0);
  assert.equal(publicReads, 1, 'Guest resolution makes exactly one public-library read');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'mobile-guest-library.png') });
  results.push({ device: 'mobile', scenario: 'guest-session-resolution', status: 'passed', publicReads });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS mobile/guest-session-resolution: initial loading completes without stalling');
  await context.close();
})().catch(error => { console.error(error); process.exitCode = 1; fs.writeFileSync(path.join(output, 'failure.txt'), String(error.stack)); }).finally(async () => { await browser?.close(); server.kill('SIGTERM'); log.end(); });
