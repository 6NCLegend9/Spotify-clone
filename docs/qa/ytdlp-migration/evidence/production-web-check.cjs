// Read-only live UI verification. No account writes, mocked APIs or provider flags.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');
const origin = 'https://haykasa.vercel.app';
const output = path.resolve(process.env.HAYKASA_WEB_EVIDENCE || 'artifacts/pr42-production-web');
fs.mkdirSync(output, { recursive: true });
const report = { checkedAt: new Date().toISOString(), origin, liveProduction: true,
  physicalMobile: false, audiblePlaybackVerified: false, cases: [], findings: [] };
const safeUrl = value => { try { const u = new URL(value); return u.origin + u.pathname; } catch { return 'unknown'; } };
const category = value => /ERR_[A-Z_]+|\b\w+Error\b/.exec(String(value))?.[0] || 'ConsoleError';
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const finding = (title, evidence) => report.findings.push({ title, evidence });

async function metrics(page) {
  return page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return { path: location.pathname, width: innerWidth, height: innerHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
      search: [...document.querySelectorAll('input[role="combobox"]')].filter(visible).map(el => {
        const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left, right: r.right };
      }),
      tabbar: [...document.querySelectorAll('.app-tabbar a,.app-tabbar button')].filter(visible).map(el => {
        const r = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label') || el.innerText,
          width: r.width, height: r.height, top: r.top, bottom: r.bottom };
      }),
      emptyIconButtons: [...document.querySelectorAll('button')].filter(visible).filter(el =>
        !el.innerText.trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')
        && !el.querySelector('img[alt],svg title')).length,
      songRows: document.querySelectorAll('[data-search-track]').length,
    };
  });
}

async function sample(page) {
  return page.evaluate(() => {
    const visible = el => el.getBoundingClientRect().height > 0;
    const host = document.querySelector('[data-active-deck="true"]');
    return { selected: document.querySelector('[aria-label^="Expand player:"]')?.getAttribute('aria-label') || '',
      time: Number(document.querySelector('input[aria-label="Song progress"]')?.value || 0),
      pauseVisible: [...document.querySelectorAll('button[aria-label="Pause"]')].some(visible),
      feedback: [...document.querySelectorAll('[data-testid="playback-feedback"]')].map(el => {
        const r = el.getBoundingClientRect(); return { text: el.innerText.slice(0, 600),
          inViewport: r.height > 0 && r.top >= 0 && r.bottom <= innerHeight };
      }),
      activeDeckIdentified: Boolean(host),
      nativeMedia: [...document.querySelectorAll('audio,video')].map(el => ({
        time: el.currentTime, paused: el.paused, readyState: el.readyState,
        duration: Number.isFinite(el.duration) ? el.duration : null, errorCode: el.error?.code || null,
      })),
      frames: [...(window.__qaMediaFrames || new Map()).entries()].map(([frame, value]) => ({
        active: Boolean(host?.contains(frame)), ...value,
      })),
    };
  });
}

(async () => {
  let browser;
  try {
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    browser = await chromium.launch({ headless: true, ...(proxy ? { proxy: { server: proxy } } : {}) });
    report.browserVersion = browser.version();
    for (const [name, viewport, mobile] of [
      ['desktop', { width: 1440, height: 1000 }, false],
      ['phone-portrait', { width: 390, height: 844 }, true],
      ['phone-landscape', { width: 844, height: 390 }, true],
    ].filter(([name]) => !process.env.HAYKASA_WEB_CASES || process.env.HAYKASA_WEB_CASES.split(',').includes(name))) {
      const context = await browser.newContext({ ...(mobile ? devices['Pixel 7'] : {}), viewport, isMobile: mobile, hasTouch: mobile });
      const item = { name, viewport, pages: [], pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [] };
      report.cases.push(item);
      try {
        await context.addInitScript(() => {
          window.__qaMediaFrames = new Map();
          addEventListener('message', event => {
            let host; try { host = new URL(event.origin).hostname; } catch { return; }
            if (!['www.youtube.com', 'www.youtube-nocookie.com'].includes(host)) return;
            const frame = [...document.querySelectorAll('[data-testid="youtube-decks"] iframe')]
              .find(el => el.contentWindow === event.source);
            if (!frame) return;
            let data; try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
            const map = window.__qaMediaFrames, value = map.get(frame) || { errors: [] };
            if (data?.event === 'onError' && Number.isInteger(Number(data.info))) value.errors.push(Number(data.info));
            const info = data?.info;
            if (info && typeof info === 'object') {
              for (const key of ['playerState', 'currentTime', 'volume']) if (Number.isFinite(info[key])) value[key] = info[key];
              if (typeof info.muted === 'boolean') value.muted = info.muted;
            }
            map.set(frame, value);
          });
        });
        const page = await context.newPage();
        page.on('pageerror', e => item.pageErrors.push({ name: e.name, category: category(e.message) }));
        page.on('console', m => { if (m.type() === 'error') item.consoleErrors.push({ category: category(m.text()), source: safeUrl(m.location().url) }); });
        page.on('requestfailed', r => item.failedRequests.push({ url: safeUrl(r.url()), category: category(r.failure()?.errorText) }));
        page.on('response', r => { if (r.status() >= 500 && r.url().startsWith(origin)) item.serverErrors.push({ url: safeUrl(r.url()), status: r.status() }); });
        const capture = async label => {
          const state = await metrics(page); item.pages.push({ label, ...state });
          if (state.overflow > 2) finding('Horizontal overflow', { name, label, overflow: state.overflow });
          await page.screenshot({ path: path.join(output, name + '-' + label + '.png') }); save();
        };
        const navigate = async route => {
          const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
          if (response.status() !== 200) finding('Document did not return HTTP200', { name, route, status: response.status() });
          await page.locator('#main-content').waitFor({ timeout: 30000 });
          await page.waitForTimeout(2000);
        };
        await navigate('/');
        item.session = await page.evaluate(async () => {
          const r = await fetch('/api/auth/session', { cache: 'no-store' }); const d = await r.json();
          return { status: r.status, authenticated: Boolean(d?.user), localStorageKeys: Object.keys(localStorage) };
        });
        if (item.session.authenticated) finding('Fresh browser profile authenticated unexpectedly', { name });
        item.source = await page.evaluate(async () => {
          const r = await fetch('/api/media/resolve', { cache: 'no-store' }); const d = await r.json();
          return { status: r.status, enabled: d.enabled, reason: d.reason };
        });
        await capture('home');
        // Phone Home deliberately puts search behind the Search tab.
        if (mobile) {
          await page.locator('.app-tabbar a[href="/search"]:visible').click();
          await page.waitForURL(url => url.pathname === '/search');
        }
        const input = page.locator('input[role="combobox"]:visible').first();
        await input.fill('Cartoon On On NCS'); await input.press('Enter');
        await page.waitForURL(url => url.pathname.startsWith('/search/'), { timeout: 20000 });
        item.searchSubmittedToIndex = new URL(page.url()).pathname.startsWith('/search/');
        const play = page.locator('[data-search-track] button[aria-label^="Play "]:visible').first();
        await play.waitFor({ timeout: 45000 }); await page.waitForTimeout(1000); await capture('search');
        if (name !== 'phone-landscape') {
          item.selectedLabel = await play.getAttribute('aria-label'); await play.click();
          await page.waitForTimeout(20000); const before = await sample(page);
          await page.waitForTimeout(6000); const after = await sample(page);
          item.playback = { before, after, timelineProgressVerified: Boolean(after.selected && after.selected === before.selected && after.time > before.time + 1) };
          await capture('playback');
          if (!item.playback.timelineProgressVerified) finding('Live selected-song playback did not advance', { name, selectedLabel: item.selectedLabel, after });
          // Source-backed seeking/background are meaningful only after a working stream.
          if (item.playback.timelineProgressVerified) {
            const pause = page.locator('button[aria-label="Pause"]:visible').first();
            await pause.click(); const paused = await sample(page); await page.waitForTimeout(1500);
            item.explicitPause = { before: paused, after: await sample(page) };
          }
          const next = page.locator('button[aria-label="Next song"]:visible').first();
          if (await next.count() && await next.isEnabled()) {
            await next.click(); await page.waitForTimeout(1500); const skipped = await sample(page);
            item.manualNext = { changed: Boolean(skipped.selected && skipped.selected !== after.selected), selected: skipped.selected };
            if (!item.manualNext.changed) finding('Next did not change selection', { name });
          }
        }
        await navigate('/settings'); await capture('settings');
        await navigate('/library'); await capture('library');
        item.uiTourCompleted = true;
      } catch (e) { item.uiTourCompleted = false; item.error = { name: e.name, category: category(e.message), message: e.message.replace(/https?:\/\/[^\s)]+/g, safeUrl).slice(0, 500) }; }
      finally { await context.close(); save(); }
    }
    report.uiTourPassed = report.cases.every(c => c.uiTourCompleted && !c.pageErrors.length);
    const playbackCases = report.cases.filter(c => c.name !== 'phone-landscape');
    report.livePlaybackPassed = playbackCases.length > 0 && playbackCases.every(c => c.playback?.timelineProgressVerified);
    report.functionalPass = report.uiTourPassed && report.livePlaybackPassed && !report.findings.length;
  } finally { await browser?.close(); save(); }
  console.log(JSON.stringify({ uiTourPassed: report.uiTourPassed, livePlaybackPassed: report.livePlaybackPassed,
    functionalPass: report.functionalPass, findings: report.findings.length, output }));
  if (!report.functionalPass) process.exitCode = 1;
})().catch(e => { report.fatal = { name: e.name, category: category(e.message) }; save(); console.error(report.fatal); process.exitCode = 1; });
