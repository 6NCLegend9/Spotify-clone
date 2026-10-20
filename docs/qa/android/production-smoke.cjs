// Exact released APK + live production HTTPS. No app rebuild, route interception,
// provider replacement or account writes; Playwright attaches to its WebView.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { _android } = require('playwright');
const output = path.resolve('artifacts/production-android');
const origin = 'https://haykasa.vercel.app';
const apk = path.join(output, 'HayKasa-Android.apk');
const metadata = JSON.parse(fs.readFileSync(path.join(output, 'release.json'), 'utf8'));
const asset = metadata.assets?.find(item => item.name === 'HayKasa-Android.apk');
assert.equal(asset?.browser_download_url, 'https://github.com/6NCLegend9/Spotify-clone/releases/download/android-preview/HayKasa-Android.apk');
assert.match(asset.digest, /^sha256:[a-f0-9]{64}$/);
const digest = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
assert.equal(`sha256:${digest}`, asset.digest, 'Installed APK must be byte-identical to the public release asset');
const adb = (...args) => execFileSync('adb', args, { maxBuffer: 12 * 1024 * 1024 });
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), mode: 'exact-public-apk-and-main-production',
  testRunnerCommit: process.env.GITHUB_SHA || null, origin,
  release: { tag: metadata.tag_name, target: metadata.target_commitish, publishedAt: metadata.published_at, assetId: asset.id, size: asset.size, sha256: digest },
  screenshots: [], screens: [], findings: [], consoleErrors: [], pageErrors: [], requests: [],
  physicalSpeakerAudibilityVerified: false,
  scope: 'Fresh guest; real production website/APIs/YouTube in the exact public APK. Emulator has no speaker; no credentials/account writes; no local UI or mocked provider.',
};
const save = () => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
const shot = name => { const filename = `${name}.png`; fs.writeFileSync(path.join(output, filename), adb('exec-out', 'screencap', '-p')); report.screenshots.push(filename); save(); };
const finding = (title, severity, reproduction, evidence) => { report.findings.push({ title, severity, reproduction, evidence }); save(); };
const route = value => { try { const url = new URL(value); return { host: url.hostname, path: url.pathname }; } catch { return { host: 'unknown', path: 'unknown' }; } };
// Public guest console diagnostics: retain error categories, never cookie values,
// request queries, arbitrary console payloads or authentication response bodies.
const category = message => /ERR_[A-Z_]+/.exec(message)?.[0] || /\b[A-Za-z]+Error\b/.exec(message)?.[0] || (/Content Security Policy/i.test(message) ? 'ContentSecurityPolicy' : /Failed to (load|fetch)/i.test(message) ? 'ResourceLoadFailure' : 'ConsoleError');
(async () => {
  let device, page;
  try {
    const aapt = path.join(process.env.ANDROID_HOME, 'build-tools/36.0.0/aapt');
    const badging = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' });
    const pkg = /package: name='([^']+)'/.exec(badging)?.[1];
    assert.equal(pkg, 'app.haykasa.android.debug');
    report.appVersion = /versionName='([^']+)'/.exec(badging)?.[1];
    report.androidApi = adb('shell', 'getprop', 'ro.build.version.sdk').toString().trim();
    report.webViewPackage = adb('shell', 'dumpsys', 'webviewupdate').toString().match(/Current WebView package[^\n]*/)?.[0] || 'unavailable';
    report.package = pkg;
    adb('install', '-r', apk);
    adb('shell', 'pm', 'clear', pkg); // Only this disposable emulator installation.
    adb('logcat', '-c');
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
    adb('shell', 'cmd', 'media_session', 'volume', '--stream', '3', '--set', '5');
    report.systemMusicVolume = adb('shell', 'cmd', 'media_session', 'volume', '--stream', '3', '--get').toString().trim();
    adb('shell', 'am', 'start', '-W', '-n', `${pkg}/app.haykasa.android.MainActivity`);
    [device] = await _android.devices({ omitDriverInstall: true });
    assert(device, 'An actual Android device/emulator must be connected');
    shot('00-installed-public-apk');
    const view = await device.webView({ pkg }, { timeout: 45000 });
    page = await view.page();
    page.setDefaultTimeout(30000);
    page.on('console', message => { if (message.type() === 'error' && report.consoleErrors.length < 100) report.consoleErrors.push({ category: category(message.text()), source: route(message.location().url || '') }); });
    page.on('pageerror', error => { if (report.pageErrors.length < 100) report.pageErrors.push({ name: error.name, category: category(error.message) }); });
    page.on('response', response => { const url = route(response.url()); if (url.host === 'haykasa.vercel.app' && (url.path.startsWith('/api/') || url.path.startsWith('/v1/')) && report.requests.length < 200) report.requests.push({ ...url, status: response.status() }); });
    page.on('requestfailed', request => { const url = route(request.url()); if (url.host === 'haykasa.vercel.app' && report.requests.length < 200) report.requests.push({ ...url, status: 0, category: category(request.failure()?.errorText || '') }); });
    await page.context().addInitScript(() => {
      const frames = new Map();
      window.__productionMediaProbe = { frames, sample: () => ({
        selected: document.querySelector('[data-testid="player-dock"] [aria-label^="Expand player:"]')?.getAttribute('aria-label') || '',
        progress: Number(document.querySelector('input[aria-label="Song progress"]')?.value || 0),
        pause: [...document.querySelectorAll('button[aria-label="Pause"]')].some(node => node.getBoundingClientRect().height > 0),
        feedback: [...document.querySelectorAll('[data-testid="playback-feedback"],.yt-dock-feedback')].map(node => ({ present: true, top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom, visible: node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().top < innerHeight && node.getBoundingClientRect().bottom > 0, text: node.innerText.slice(0, 400) })),
        frames: [...frames.values()].map(value => ({ ...value })),
      }) };
      addEventListener('message', event => {
        let host; try { host = new URL(event.origin).hostname; } catch { return; }
        if (!['www.youtube.com', 'www.youtube-nocookie.com', 'youtube.com', 'youtube-nocookie.com'].includes(host)) return;
        const frame = [...document.querySelectorAll('[data-testid="youtube-decks"] iframe')].find(node => node.contentWindow === event.source);
        if (!frame) return;
        let message; try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
        let value = frames.get(frame); if (!value) { value = { errors: [], states: [], position: 0, volume: null, muted: null }; frames.set(frame, value); }
        if (message?.event === 'onError' && Number.isInteger(Number(message.info))) value.errors.push(Number(message.info));
        const info = message?.info;
        if (!info || typeof info !== 'object') return;
        if (Number.isInteger(info.playerState)) { value.state = info.playerState; if (value.states.at(-1) !== info.playerState && value.states.length < 60) value.states.push(info.playerState); }
        if (Number.isFinite(info.currentTime)) value.position = info.currentTime;
        if (Number.isFinite(info.volume)) value.volume = info.volume;
        if (typeof info.muted === 'boolean') value.muted = info.muted;
      });
    });
    const capture = async name => {
      const metrics = await page.evaluate(() => ({ path: location.pathname, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth, nativePhone: document.querySelector('.app-shell')?.dataset.nativePhone || null, tabbar: [...document.querySelectorAll('.app-tabbar a,.app-tabbar button')].map(node => { const r = node.getBoundingClientRect(); return { label: node.innerText || node.getAttribute('aria-label'), top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }) }));
      assert.equal(new URL(page.url()).origin, origin, 'The real app must remain on main production');
      report.screens.push({ name, ...metrics }); shot(name);
      if (metrics.overflow > 2) finding('Horizontal page overflow', 'Low', `Open ${metrics.path} in the public Android APK`, metrics);
    };
    const navigate = async (url, selector) => { await page.goto(`${origin}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); if (selector) await page.locator(selector).first().waitFor({ state: 'visible', timeout: 45000 }); };
    const step = async (name, action) => { try { await action(); } catch (error) { report.findings.push({ title: `Production UI check could not complete: ${name}`, severity: 'Medium', reproduction: name, evidence: { name: error.name, message: error.message.slice(0, 700) } }); try { shot(`${name}-incomplete`); } catch {} save(); } };
    await navigate('/', '.page-home');
    const session = await page.evaluate(async () => { const response = await fetch('/api/auth/session', { cache: 'no-store' }); const data = await response.json(); return { status: response.status, authenticated: !!data?.user }; });
    report.freshSession = session;
    if (session.authenticated) finding('Fresh public APK unexpectedly authenticates a user', 'High', 'Install the public APK on a clean emulator and open Home', session);
    report.storage = await page.evaluate(async () => ({ localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage), indexedDatabaseNames: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map(item => item.name) : ['inspection-unavailable'] }));
    report.cookieNames = (await page.context().cookies(origin)).map(item => ({ name: item.name, secure: item.secure, httpOnly: item.httpOnly, sameSite: item.sameSite }));
    await page.waitForTimeout(3000); await capture('01-home-guest');
    await step('02-search-browse', async () => { await navigate('/search', '.page-search'); await capture('02-search-browse'); });
    await step('03-search-results', async () => { await navigate('/search/2pac', '[data-search-track]'); await page.waitForTimeout(1500); await capture('03-search-results'); });
    const artist = await page.locator('.page-search a[href^="/artist/UC"]').first().getAttribute('href').catch(() => null);
    const playlist = await page.locator('.page-search a[href^="/youtube-playlist/"]').first().getAttribute('href').catch(() => null);
    if (artist) await step('04-artist', async () => { await navigate(artist, '#artist-title'); await page.waitForTimeout(1500); await capture('04-artist'); });
    if (playlist) await step('05-playlist', async () => { await navigate(playlist, '#main-content'); await page.waitForTimeout(3000); await capture('05-playlist'); });
    await step('06-library-guest', async () => { await navigate('/library', '#main-content'); await capture('06-library-guest'); });
    await step('07-create-login-gate', async () => { await page.locator('.app-tabbar button[aria-label="Create playlist or Jam"]').click(); await page.getByRole('dialog', { name: 'Create', exact: true }).waitFor(); await capture('07-create-picker'); await page.getByRole('dialog', { name: 'Create', exact: true }).getByRole('button', { name: /Playlist/ }).click(); await page.locator('input[type=email]').waitFor(); await capture('08-login-gate'); });
    await step('09-settings-portrait', async () => { await navigate('/settings', '.page-settings'); await page.waitForTimeout(2000); await capture('09-settings-portrait'); });
    await step('10-settings-landscape', async () => { adb('shell', 'settings', 'put', 'system', 'user_rotation', '1'); await page.waitForFunction(() => innerWidth > innerHeight, null, { timeout: 15000 }); await page.waitForTimeout(1500); await capture('10-settings-landscape'); const landscape = report.screens.at(-1); if (!landscape.tabbar.some(item => item.height >= 44 && item.top >= 0 && item.bottom <= landscape.height + 1)) finding('Rotated Android phone switches to desktop navigation', 'Medium', 'Open Settings in the public APK, then rotate the phone to landscape', landscape); });
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
    await page.waitForTimeout(1000);
    await step('11-live-playback', async () => {
      await navigate('/search/Cartoon%20On%20On%20NCS?type=video', '[data-search-track] button[aria-label^="Play "]');
      report.playedSelection = await page.locator('[data-search-track] button[aria-label^="Play "]').first().getAttribute('aria-label');
      await capture('11-live-playback-before');
      await page.locator('[data-search-track] button[aria-label^="Play "]').first().click();
      await page.locator('[data-testid="player-dock"]').waitFor();
      await page.waitForTimeout(20000);
      report.playback = await page.evaluate(() => window.__productionMediaProbe.sample());
      await capture('12-live-playback-result');
      const rawProgress = report.playback.frames.some(item => item.state === 1 && item.position > 2 && item.volume > 0 && item.muted === false);
      report.providerProgressObserved = rawProgress;
      report.selectedTrackPlaybackVerified = false; // Main has no active-deck marker; do not credit an inactive preload.
      if (!rawProgress) finding('Live music has no observed provider playback progress', 'High', `Open Song search “Cartoon On On NCS” and tap the first result (${report.playedSelection})`, report.playback);
      if (!rawProgress && report.playback.pause) finding('Silent playback leaves Pause/playing controls active', 'Medium', 'Tap the first live result and wait 20 seconds', report.playback);
      const before = report.playback.selected;
      const next = page.locator('[data-testid="player-dock"] button[aria-label="Next song"]').first();
      if (await next.isVisible() && await next.isEnabled()) {
        await page.evaluate(() => window.__productionMediaProbe.frames.clear());
        await next.click(); await page.waitForTimeout(1000);
        report.manualNext = await page.evaluate(() => window.__productionMediaProbe.sample());
        report.manualNext.changedAtOneSecond = !!report.manualNext.selected && report.manualNext.selected !== before;
        await page.waitForTimeout(14000); report.manualNext.afterProviderWait = await page.evaluate(() => window.__productionMediaProbe.sample());
        await capture('13-manual-next-result');
        if (!report.manualNext.changedAtOneSecond) finding('Next does not change the selected song', 'Medium', 'After selecting a song, tap Next in the Android mini player', report.manualNext);
      } else report.manualNext = { available: false };
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await new Promise(resolve => setTimeout(resolve, 4000)); shot('14-background-home');
      report.backgroundMediaSession = adb('shell', 'dumpsys', 'media_session').toString().slice(0, 15000);
      adb('shell', 'am', 'start', '-W', '-n', `${pkg}/app.haykasa.android.MainActivity`); await page.waitForTimeout(1500); await capture('15-return-from-background');
    });
    report.completed = true;
  } catch (error) {
    report.completed = false; report.fatal = { name: error.name, message: error.message.slice(0, 1200) }; try { shot('99-incomplete'); } catch {}
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    try { const crashes = adb('logcat', '-d', 'AndroidRuntime:E', '*:S').toString(); fs.writeFileSync(path.join(output, 'crashes.log'), crashes); report.androidRuntimeCrash = /FATAL EXCEPTION/.test(crashes); if (report.androidRuntimeCrash) finding('Installed public Android APK crashes', 'High', 'Launch and tour the public APK in a fresh API36 emulator', 'See crashes.log'); } catch {}
    try { fs.writeFileSync(path.join(output, 'chromium.log'), adb('logcat', '-d', 'chromium:E', '*:S')); } catch {}
    try { fs.writeFileSync(path.join(output, 'app-services.txt'), adb('shell', 'dumpsys', 'activity', 'services', 'app.haykasa.android.debug')); } catch {}
    report.functionalPass = report.completed === true && !report.findings.length && !report.pageErrors.length;
    save(); console.log(JSON.stringify({ completed: report.completed, functionalPass: report.functionalPass, findings: report.findings.map(item => ({ title: item.title, severity: item.severity })), evidence: output }));
    await device?.close().catch(() => {});
    if (!report.functionalPass) process.exitCode = 1;
  }
})().catch(error => { report.fatal = { name: error.name, message: error.message.slice(0, 1000) }; save(); process.exitCode = 1; });
