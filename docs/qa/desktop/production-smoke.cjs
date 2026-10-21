const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ORIGIN = 'https://haykasa.vercel.app';
const REPOSITORY = '6NCLegend9/Spotify-clone';
const output = path.resolve(process.env.HAYKASA_DESKTOP_EVIDENCE || 'artifacts/production-desktop');
const scratch = path.resolve(process.env.HAYKASA_DESKTOP_SCRATCH || output);
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(scratch, { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const safeError = value => String(value).replace(/https?:\/\/[^\s)]+/g, value => {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return '[URL]'; }
}).slice(0, 800);

async function preflight() {
  const responses = [];
  for (const route of ['/api/desktop/manifest', '/api/desktop/policy', '/api/desktop/update/stable/latest.yml', '/api/desktop/download']) {
    const response = await fetch(`${ORIGIN}${route}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const body = (await response.text()).slice(0, 30000);
    responses.push({ route, status: response.status, location: response.headers.get('location'), body });
  }
  save('public-endpoints.json', { checkedAt: new Date().toISOString(), responses });
  const download = responses.find(row => row.route === '/api/desktop/download');
  assert.equal(download.status, 302, 'Production download must resolve to a public installer');
  const url = new URL(download.location);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  const match = url.pathname.match(/^\/6NCLegend9\/Spotify-clone\/releases\/download\/([^/]+)\/([^/]+\.exe)$/);
  assert.ok(match, 'Installer must belong to the expected public release');
  const releaseResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${encodeURIComponent(match[1])}`, {
    headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000),
  });
  assert.ok(releaseResponse.ok, `Release lookup returned ${releaseResponse.status}`);
  const release = await releaseResponse.json();
  assert.equal(release.draft, false);
  const refResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/git/ref/tags/${encodeURIComponent(match[1])}`, { signal: AbortSignal.timeout(30000) });
  assert.ok(refResponse.ok, 'Public release tag must resolve');
  const ref = await refResponse.json();
  let source = ref.object;
  if (source?.type === 'tag') {
    const tagResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/git/tags/${source.sha}`, { signal: AbortSignal.timeout(30000) });
    assert.ok(tagResponse.ok);
    source = (await tagResponse.json()).object;
  }
  assert.equal(source?.type, 'commit');
  assert.match(source.sha, /^[a-f0-9]{40}$/);
  const asset = release.assets.find(item => item.browser_download_url === url.href && item.name === match[2]);
  assert.ok(asset && asset.state === 'uploaded' && asset.size > 0 && asset.size <= 250000000);
  assert.match(asset.digest, /^sha256:[a-f0-9]{64}$/);
  const installerResponse = await fetch(url, { signal: AbortSignal.timeout(120000) });
  assert.ok(installerResponse.ok, `Installer download returned ${installerResponse.status}`);
  const chunks = [];
  let received = 0;
  for await (const chunk of installerResponse.body) {
    received += chunk.length;
    assert.ok(received <= asset.size, 'Installer body exceeded its public metadata size');
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks, received);
  assert.equal(data.length, asset.size);
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  assert.equal(`sha256:${sha256}`, asset.digest);
  assert.equal(data.subarray(0, 2).toString(), 'MZ');
  fs.writeFileSync(path.join(scratch, 'HayKasa-public-setup.exe'), data);
  save('release.json', { checkedAt: new Date().toISOString(), tag: release.tag_name, target: release.target_commitish, sourceCommit: source.sha,
    publishedAt: release.published_at, releaseUrl: release.html_url, installerUrl: url.href,
    name: asset.name, sizeBytes: asset.size, sha256 });
  console.log(`Verified public ${release.tag_name} installer (${asset.size} bytes, SHA-256 ${sha256}).`);
}

async function browserSmoke() {
  const { chromium } = require('playwright');
  let browser;
  const report = { checkedAt: new Date().toISOString(), scope: 'Installed public Windows executable; live production website and APIs; fresh runner profile; no mocks',
    audiblePlaybackVerified: false, pages: [], consoleErrors: [], pageErrors: [], failedRequests: [] };
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 1200 }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    assert.ok(browser, 'The installed release did not expose a test-only loopback CDP endpoint; native screenshot/logs still collected');
    const context = browser.contexts()[0];
    assert.ok(context);
    const deadline = Date.now() + 60000;
    let page;
    while (Date.now() < deadline) {
      page = context.pages().find(item => { try { return new URL(item.url()).origin === ORIGIN; } catch { return false; } });
      if (page) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(page, 'Installed app must open the real production origin');
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(safeError(message.text())); });
    page.on('pageerror', error => report.pageErrors.push(safeError(error.message)));
    page.on('requestfailed', request => report.failedRequests.push({ url: safeError(request.url()), error: request.failure()?.errorText }));
    for (const [name, route] of [['home', '/'], ['search', '/search/2pac'], ['settings', '/settings']]) {
      const navigation = await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
      const state = await page.evaluate(async () => {
        let session;
        try { const response = await fetch('/api/auth/session'); const value = await response.json(); session = { status: response.status, authenticated: Boolean(value?.user) }; }
        catch { session = { unavailable: true }; }
        const api = window.heykasaDesktop;
        let info, updates;
        const bounded = promise => Promise.race([Promise.resolve(promise), new Promise((_, reject) => setTimeout(() => reject(new Error('Native reply timed out')), 8000))]);
        try { info = await bounded(api?.getInfo?.()); } catch (error) { info = { error: error.message }; }
        try { updates = await bounded(api?.updates?.getStatus?.()); } catch (error) { updates = { error: error.message }; }
        return { title: document.title, path: location.pathname, width: innerWidth, height: innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, session, info, updates,
          bodyText: document.body.innerText.slice(0, 6000), localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage) };
      });
      assert.equal(new URL(page.url()).origin, ORIGIN);
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false });
      report.pages.push({ name, navigationStatus: navigation?.status(), ...state });
      assert.equal(navigation?.status(), 200, 'Production app routes must return a successful document');
      assert.equal(state.session.authenticated, false, 'A fresh installed desktop profile must remain a guest');
      if (name === 'search') {
        const play = page.locator('button[aria-label^="Play "]:visible').first();
        if (await play.count()) {
          await play.click({ timeout: 10000 });
          await page.waitForTimeout(12000);
          const read = () => page.evaluate(() => ({
            selected: document.querySelector('[aria-label^="Expand player:"]')?.getAttribute('aria-label') || '',
            time: Number(document.querySelector('input[aria-label="Song progress"]')?.value || 0),
            pauseVisible: [...document.querySelectorAll('button[aria-label="Pause"]')].some(item => item.getBoundingClientRect().height > 0),
            feedback: document.querySelector('[data-testid="playback-feedback"]')?.innerText || ''
          }));
          const before = await read();
          await page.waitForTimeout(6000);
          const after = await read();
          report.playback = { before, after, timelineProgressVerified: Boolean(after.selected && after.selected === before.selected && after.time > before.time + 1) };
          await page.screenshot({ path: path.join(output, 'playback.png'), fullPage: false });
          const next = page.locator('button[aria-label="Next song"]:visible').first();
          if (await next.count() && await next.isEnabled()) {
            await next.click();
            await page.waitForTimeout(5000);
            const skipped = await read();
            report.playback.manualNext = { ...skipped, selectionChanged: Boolean(skipped.selected && skipped.selected !== after.selected) };
            await page.screenshot({ path: path.join(output, 'manual-next.png'), fullPage: false });
          }
        } else report.playback = { attempted: false, reason: 'No visible song Play button returned by production search' };
      }
      if (name === 'settings') {
        report.manualUpdateCheck = await page.evaluate(async () => {
          const check = window.heykasaDesktop?.updates?.check;
          if (typeof check !== 'function') return { unavailable: true };
          try { return await Promise.race([check(), new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 15000))]); }
          catch (error) { return { error: error.message }; }
        });
      }
    }
    report.cookieMetadata = (await context.cookies(ORIGIN)).map(({ name, domain, secure, httpOnly, sameSite }) => ({ name, domain, secure, httpOnly, sameSite }));
    assert.equal(report.pages.length, 3);
    report.uiSmokePassed = true;
  } catch (error) {
    report.uiSmokePassed = false;
    report.error = safeError(error.message);
    process.exitCode = 1;
  } finally {
    save('browser-results.json', report);
    if (browser) await browser.close().catch(() => {});
  }
}

(async () => {
  if (process.argv[2] === 'preflight') await preflight();
  else if (process.argv[2] === 'browser') await browserSmoke();
  else throw new Error('Expected preflight or browser');
})().catch(error => { save('fatal-error.json', { error: safeError(error.message) }); console.error(safeError(error.message)); process.exitCode = 1; });
