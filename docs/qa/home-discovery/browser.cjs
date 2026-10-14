// Real Next.js homepage, synthetic API/account responses, no external traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, 'artifacts/home-discovery');
fs.mkdirSync(output, { recursive: true });
const fixtures = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/haykasa-home-fixtures.json', 'utf8'));
const port = 3012, origin = `http://127.0.0.1:${port}`;
const serverLog = fs.createWriteStream(path.join(output, 'server.log'));
const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: root, env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NEXTAUTH_URL: origin, NEXTAUTH_SECRET: 'isolated-homepage-browser-session-secret', JWT_SECRET: 'isolated-homepage-browser-session-secret' }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let browser;
function syntheticTrack(i) { return { id: `hx${String(i).padStart(9, '0')}`, title: `History song ${i}`, channel: `History Artist ${i % 5}` }; }
async function inspect(page) {
  return page.locator('.page-home').evaluate(home => {
    const values = attr => [...home.querySelectorAll(`[${attr}]`)].map(node => node.getAttribute(attr)).filter(Boolean);
    const halves = Object.fromEntries([...home.querySelectorAll('[data-home-section]')].map(section => [section.dataset.homeSection, { tracks: section.querySelectorAll('[data-home-track]').length, playlists: section.querySelectorAll('[data-home-playlist]').length }]));
    const overflow = home.getBoundingClientRect().right > innerWidth + 2 || document.documentElement.scrollWidth > innerWidth + 2;
    return { tracks: values('data-home-track'), recordings: values('data-home-recording'), playlists: values('data-home-playlist'), halves, overflow };
  });
}
function verify(state) {
  for (const field of ['tracks', 'recordings', 'playlists']) assert.equal(new Set(state[field]).size, state[field].length, `No repeated ${field} on entire homepage`);
  assert.equal(state.overflow, false, 'Page does not overflow viewport horizontally');
  assert.equal(state.halves['for-you'].tracks, 12);
  assert.equal(state.halves.explore.tracks, 12);
  assert.equal(state.halves['for-you'].playlists, 4);
  assert.equal(state.halves.explore.playlists, 4);
}
(async () => {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error(`Next exited with ${server.exitCode}; see server.log`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await wait(1000);
  }
  assert(ready, 'Next dev server starts');
  browser = await chromium.launch({ headless: true });
  for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
    for (const [name, fixture] of Object.entries(fixtures)) {
      const context = await browser.newContext({ viewport, isMobile: device === 'mobile', hasTouch: device === 'mobile', reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.addInitScript(() => { localStorage.setItem('toturialComplete', 'true'); });
      const page = await context.newPage();
      const errors = [], recommendationRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      const history = Array.from({ length: 20 }, (_, i) => syntheticTrack(i));
      const release = { ...fixture.initial.sections.forYou.tracks[0], publishedAt: new Date().toISOString() };
      let requestCount = 0;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let body = { success: true, data: [] };
        if (url.pathname === '/api/auth/session') body = { user: { id: 'alice', name: 'Home QA', email: 'qa@example.invalid' }, expires: '2099-01-01T00:00:00.000Z' };
        if (url.pathname === '/api/settings') body = { authenticated: true, settings: { privateSession: name === 'private', explicitContent: false } };
        if (url.pathname === '/api/recommendations') { recommendationRequests.push(url.search); body = requestCount++ ? fixture.refreshed : fixture.initial; }
        if (url.pathname === '/api/history') body = { success: true, data: history };
        if (url.pathname === '/api/userPlaylists') body = { success: true, data: { playlists: [{ _id: 'playlist-one', name: 'My playlist' }, { _id: 'playlist-one', name: 'My playlist' }] } };
        if (url.pathname === '/api/followedArtists/releases') body = { releases: [release, release, history[0]] };
        if (url.pathname === '/api/media/resolve') body = { enabled: false };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-home-section="explore"] [data-home-track]').first().waitFor({ timeout: 90000 });
      await page.getByRole('button', { name: 'Refresh discovery', exact: true }).waitFor();
      // Wait for the independent history/library/release requests to settle.
      await page.waitForFunction(() => document.querySelector('.home-quick [data-home-playlist]'));
      const before = await inspect(page); verify(before);
      const pageCopy = await page.locator('.page-home').innerText();
      if (['activity', 'searchOnly', 'historyOnly'].includes(name)) assert(pageCopy.includes('Inspired by your recent searches and listening.'));
      if (['taste', 'artistOnly'].includes(name)) assert(pageCopy.includes('Songs and playlists inspired by your genres and favorite artists.'));
      if (['empty', 'private'].includes(name)) assert(pageCopy.includes('Popular right now'));
      if (['taste', 'activity'].includes(name)) {
        await page.screenshot({ path: path.join(output, `${device}-${name}-taste.png`) });
        await page.locator('[data-home-section="explore"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${device}-${name}-explore.png`) });
      }
      await page.getByRole('button', { name: 'Refresh discovery', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Refresh discovery"]:not(:disabled)'));
      const after = await inspect(page); verify(after);
      if (name !== 'private') {
        assert(recommendationRequests.at(-1).includes('seen='));
        assert(recommendationRequests.at(-1).includes('seenPlaylists='));
      }
      assert.equal(errors.length, 0, `No UI exceptions: ${errors.join('; ')}`);
      results.push({ device, scenario: name, status: 'passed', before, after, requests: recommendationRequests.length });
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
      console.log(`PASS ${device}/${name}: both halves 12 songs + 4 playlists; whole-page duplicate and overflow checks; refresh`);
      await context.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; fs.writeFileSync(path.join(output, 'failure.txt'), String(error.stack)); }).finally(async () => { await browser?.close(); server.kill('SIGTERM'); serverLog.end(); });
