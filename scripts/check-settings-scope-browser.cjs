// Actual account-bound UI, privacy boundary and language reducer; session/API are controlled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.resolve(process.env.HAYKASA_SETTINGS_SCOPE_EVIDENCE || path.join(root, 'artifacts/settings-scope'));
fs.mkdirSync(output, { recursive: true });
const sources = {};
const controlled = new Set(['react', 'react-dom', 'next-auth/react', 'next/link', 'react-redux', 'react-hot-toast', 'lucide-react', '@reduxjs/toolkit', '@/services/http', '@/redux/features/playerSlice']);
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  const baseline = process.env.HAYKASA_SETTINGS_SCOPE_BASELINE;
  const read = baseline && ['GenrePreferences.jsx', 'UpdatesBell.jsx', 'LanguageSync.jsx'].includes(path.basename(file)) ? path.join(baseline, path.basename(file)) : file;
  const code = ts.transpileModule(fs.readFileSync(read, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const dependencies = {}; sources[key] = { code, dependencies };
  for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (controlled.has(spec)) { dependencies[spec] = spec; continue; }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, ...['.js', '.jsx', '.mjs'].map(ext => candidate + ext)].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved && resolved.startsWith(path.join(root, 'src') + path.sep), `Unexpected test dependency: ${spec}`);
    dependencies[spec] = include(resolved);
  }
  return key;
}
const entries = Object.fromEntries(['GenrePreferences', 'UpdatesBell', 'LanguageSync', 'AccountPrivacyBoundary'].map(name => [name, include(path.join(root, 'src/components', name + '.jsx'))]));
entries.storage = include(path.join(root, 'src/utils/accountStorage.mjs'));
entries.language = include(path.join(root, 'src/redux/features/languagesSlice.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.next/app-build-manifest.json'), 'utf8'));
const css = (manifest.pages['/layout'] || []).filter(name => name.endsWith('.css')).map(name => fs.readFileSync(path.join(root, '.next', name), 'utf8')).join('\n');
const results = [];
let browser;
async function setup(page, kind, mode) {
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1:3000/__settings-scope-qa'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }) : route.abort());
  await page.goto('http://127.0.0.1:3000/__settings-scope-qa');
  await page.addStyleTag({ content: css + '\nbody{background:var(--navy);color:white;font-family:Arial,sans-serif}#fixture{padding:16px}button:focus-visible,a:focus-visible{outline:2px solid var(--accent)}' });
  for (const file of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js', '@reduxjs/toolkit/dist/redux-toolkit.umd.js']) await page.addScriptTag({ path: path.join(root, 'node_modules', file) });
  await page.evaluate(({ sources, entries, kind, mode }) => {
    window.qaSession = mode === 'guest' ? { data: null, status: 'unauthenticated' }
      : { data: { user: { id: 'A' } }, status: 'authenticated' };
    window.qaCalls = []; window.qaToasts = []; window.qaPending = []; window.qaApiMode = mode; window.qaLanguage = null; window.qaNotificationRevision = 0; window.qaHold = mode === 'hold' ? ['GET'] : []; window.qaMounted = true;
    const toast = message => qaToasts.push(String(message)); toast.error = toast; toast.success = toast;
    const originalInterval = window.setInterval;
    window.setInterval = (callback, ...args) => { window.qaPoll = callback; return originalInterval(callback, ...args); };
    const payload = (url, owner, options) => {
      if (qaApiMode === "error" && ["/api/genres", "/api/language"].includes(url) && !options.method) throw Error("QA load failure");
      const personal = { id: `${owner}-private`, name: `${owner} private genre`, defaultName: `${owner} private genre`, scope: 'personal', aliases: [] };
      const rock = { id: 'rock', name: 'Rock', defaultName: 'Rock', scope: 'system', aliases: [], children: [] };
      if (url === '/api/settings') return { authenticated: true, genres: [personal.name] };
      if (url === '/api/genres') return options.method === 'POST' ? { genre: { ...personal, id: `${owner}-created`, name: options.body.name, defaultName: options.body.name }, created: true }
        : { genres: [rock, personal], tree: [rock], personalGenres: [personal] };
      if (url.startsWith('/api/genres?')) return { success: true };
      if (url === '/api/recommendations') return { profile: { genres: options.body.genres } };
      if (url === '/api/language') return options.method === 'PUT' ? { success: true, language: options.body.language }
        : { authenticated: owner !== 'guest', language: qaLanguage === 'empty' ? [] : qaLanguage === 'null' ? null : owner === 'A' ? ['armenian'] : ['spanish'] };
      if (url === '/api/notifications') return { items: [{ id: `${owner}-release-${qaNotificationRevision}`, type: 'release', title: `${owner} private artist`, body: `${owner} private song`, unread: true, createdAt: new Date().toISOString() }] };
      if (url === '/api/notifications/read') return { success: true };
      throw Error(`Unexpected API ${url}`);
    };
    const requestJson = async (url, options = {}) => {
      const owner = qaSession.data?.user?.id || 'guest', method = options.method || 'GET';
      const call = { owner, url, method, body: options.body, useCache: options.useCache };
      Object.defineProperty(call, "aborted", { enumerable: true, get: () => Boolean(options.signal?.aborted) }); qaCalls.push(call);
      const value = payload(url, owner, options);
      if (qaHold.includes(method)) return new Promise((resolve, reject) => qaPending.push({ owner, url, method, resolve: () => resolve(value), reject }));
      return Promise.resolve(value);
    };
    const cache = {};
    function require(name) {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOM;
      if (name === '@reduxjs/toolkit') return RTK;
      if (name === 'next-auth/react') return { useSession: () => qaSession };
      if (name === 'next/link') return { __esModule: true, default: ({ href, ...props }) => React.createElement('a', { ...props, href }) };
      if (name === 'react-hot-toast') return { __esModule: true, default: toast, toast };
      if (name === 'lucide-react') return new Proxy({}, { get: () => props => React.createElement('svg', { ...props, width: '1em', height: '1em' }) });
      if (name === '@/services/http') return { requestJson };
      if (name === '@/redux/features/playerSlice') return { startYoutubePlayback: payload => ({ type: 'test/play', payload }) };
      if (name === 'react-redux') return {
        useDispatch: () => qaDispatch,
        useSelector: pick => React.useSyncExternalStore(qaStore.subscribe, () => pick(qaStore.getState())),
      };
      if (cache[name]) return cache[name].exports;
      const source = sources[name]; if (!source) throw Error(`Unknown module ${name}`);
      const loaded = { exports: {} }; cache[name] = loaded;
      new Function('module', 'exports', 'require', source.code)(loaded, loaded.exports, spec => require(source.dependencies[spec]));
      return loaded.exports;
    }
    const reducer = require(entries.language).default;
    window.qaStore = RTK.configureStore({ reducer: { languages: reducer, settings: (state = { privateSession: false, browserNotifications: false }) => state } });
    window.qaDispatch = qaStore.dispatch;
    const Component = require(entries[kind]).default, Boundary = require(entries.AccountPrivacyBoundary).default;
    window.qaStorage = require(entries.storage);
    const host = ReactDOM.createRoot(document.getElementById('root'));
    const render = () => ReactDOM.flushSync(() => host.render(React.createElement(React.Fragment, null, React.createElement(Boundary),
      React.createElement('div', { id: 'fixture' }, qaMounted ? React.createElement(Component, { status: qaSession.status }) : null))));
    window.qaSetOwner = owner => { qaSession = owner ? { data: { user: { id: owner } }, status: 'authenticated' } : { data: null, status: 'unauthenticated' }; render(); };
    window.qaRemount = () => { qaMounted = false; render(); qaMounted = true; render(); };
    window.qaResolve = (owner, method = 'GET', reject = false) => {
      for (const pending of qaPending.splice(0)) { if (pending.owner === owner && pending.method === method) reject ? pending.reject(Error('QA failure')) : pending.resolve(); else qaPending.push(pending); }
    };
    window.qaSetLanguage = language => qaDispatch(require(entries.language).setLanguages(language));
    render();
  }, { sources, entries, kind, mode });
  await page.waitForFunction(owner => qaStorage.getActiveAccountOwner() === owner, mode === 'guest' ? null : 'account:A');
}
async function settle(page) { await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); }); }
async function ready(page, kind, owner = 'A') {
  if (kind === 'GenrePreferences') await page.getByRole('button', { name: `Remove ${owner} private genre from your picks`, exact: true }).waitFor({ timeout: 2000 });
  if (kind === 'UpdatesBell') await page.waitForFunction(owner => qaCalls.some(call => call.url === '/api/notifications' && call.owner === owner), owner);
  if (kind === 'LanguageSync') await page.waitForFunction(language => qaStore.getState().languages.languages[0] === language, owner === 'A' ? 'armenian' : 'spanish', { timeout: 2000 });
  await settle(page);
}
async function scenario(name, kind, mode, run, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport }); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try { await setup(page, kind, mode); await run(page); assert.deepEqual(errors, []); results.push({ name, kind, pass: true, pageErrors: errors }); }
  catch (error) { results.push({ name, kind, pass: false, error: String(error.message), pageErrors: errors }); await page.screenshot({ path: path.join(output, name + '-failure.png') }).catch(() => {}); }
  finally { await page.close(); }
}
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    await scenario('notifications-fresh-guest-privacy-boundary', 'UpdatesBell', 'guest', async page => {
      await ready(page, 'UpdatesBell', 'guest');
      await page.getByRole('button', { name: /Open notifications/ }).click();
      await page.getByText('guest private artist', { exact: true }).waitFor();
      assert(!(await page.evaluate(() => qaCalls)).some(call => call.method !== 'GET'));
    });
    for (const kind of ['GenrePreferences', 'UpdatesBell', 'LanguageSync']) {
      await scenario(kind + '-authenticated-switch', kind, 'normal', async page => {
        await ready(page, kind); if (kind === 'UpdatesBell') await page.getByRole('button', { name: /Open notifications/ }).click();
        const immediate = await page.evaluate(() => { qaHold = ['GET']; qaSetOwner('B'); return { old: document.body.textContent.includes('A private'), language: qaStore.getState().languages.languages }; });
        assert.equal(immediate.old, false, 'A data must disappear in the B commit');
        if (kind === 'LanguageSync') assert.notDeepEqual(immediate.language, ['armenian']);
        await settle(page); await page.evaluate(() => { qaHold = []; qaResolve('B'); }); await ready(page, kind, 'B');
        assert((await page.evaluate(() => qaCalls)).some(call => call.owner === 'B' && call.method === 'GET'), 'B needs its own request');
      });
      await scenario(kind + '-delayed-read', kind, 'hold', async page => {
        await page.waitForFunction(() => qaPending.length > 0);
        await page.evaluate(() => { qaHold = []; qaSetOwner('B'); }); await ready(page, kind, 'B');
        await page.evaluate(() => qaResolve('A')); await settle(page);
        if (kind === 'UpdatesBell') await page.getByRole('button', { name: /Open notifications/ }).click();
        assert.equal(await page.locator('body').innerText().then(text => text.includes('A private')), false);
        if (kind === 'LanguageSync') assert.deepEqual(await page.evaluate(() => qaStore.getState().languages.languages), ['spanish']);
      });
      await scenario(kind + '-logout-remount', kind, 'normal', async page => {
        await ready(page, kind); await page.evaluate(() => qaSetOwner(null)); await settle(page);
        assert.equal(await page.locator('body').innerText().then(text => text.includes('A private')), false);
        if (kind === 'LanguageSync') assert.notDeepEqual(await page.evaluate(() => qaStore.getState().languages.languages), ['armenian']);
        await page.evaluate(() => { qaHold = ['GET']; qaSetOwner('B'); qaRemount(); }); await settle(page);
        assert.equal(await page.locator('body').innerText().then(text => text.includes('A private')), false, 'Remount must not restore A module cache');
        await page.evaluate(() => { qaHold = []; qaResolve('B'); }); await ready(page, kind, 'B');
      });
      await scenario(kind + '-privacy-clear', kind, 'normal', async page => {
        await ready(page, kind); if (kind === 'UpdatesBell') await page.getByRole('button', { name: /Open notifications/ }).click();
        await page.evaluate(() => qaStorage.clearLocalAccountCaches({ notify: true })); await settle(page);
        assert.equal(await page.locator('body').innerText().then(text => text.includes('A private')), false);
        if (kind === 'LanguageSync') assert.notDeepEqual(await page.evaluate(() => qaStore.getState().languages.languages), ['armenian']);
      });
    }
    await scenario('genre-save-loop-stops-on-switch', 'GenrePreferences', 'normal', async page => {
      await ready(page, 'GenrePreferences'); await page.evaluate(() => { qaHold = ['POST']; });
      await page.getByRole('button', { name: 'Remove A private genre from your picks', exact: true }).click();
      await page.getByRole('button', { name: 'Add Rock to your picks', exact: true }).click();
      await page.evaluate(() => { qaSetOwner('B'); qaHold = []; }); await ready(page, 'GenrePreferences', 'B');
      await page.evaluate(() => qaResolve('A', 'POST')); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'POST').map(({ owner, body }) => ({ owner, body }))), [{ owner: 'A', body: { genres: [] } }]);
      await page.getByRole('button', { name: 'Add Rock to your picks', exact: true }).click(); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'POST').at(-1).body.genres), ['B private genre', 'Rock']);
    });
    await scenario('genre-stale-delete', 'GenrePreferences', 'normal', async page => {
      await ready(page, 'GenrePreferences'); await page.evaluate(() => { qaHold = ['DELETE']; });
      await page.getByRole('button', { name: 'Delete custom genre A private genre', exact: true }).click(); await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page.evaluate(() => { qaSetOwner('B'); qaHold = []; }); await ready(page, 'GenrePreferences', 'B'); await page.evaluate(() => qaResolve('A', 'DELETE')); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaToasts), []); await ready(page, 'GenrePreferences', 'B');
    });
    await scenario('language-current-saving-no-hydration-write', 'LanguageSync', 'normal', async page => {
      await ready(page, 'LanguageSync'); assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'PUT')), []);
      await page.evaluate(() => qaSetLanguage(['french'])); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'PUT').map(({ owner, body }) => ({ owner, body }))), [{ owner: 'A', body: { language: ['french'] } }]);
    });
    await scenario('language-stale-save-feedback', 'LanguageSync', 'normal', async page => {
      await ready(page, 'LanguageSync'); await page.evaluate(() => { qaHold = ['PUT']; qaSetLanguage(['french']); }); await settle(page);
      await page.evaluate(() => { qaSetOwner('B'); qaHold = []; }); await ready(page, 'LanguageSync', 'B'); await page.evaluate(() => qaResolve('A', 'PUT', true)); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaToasts), []); assert.deepEqual(await page.evaluate(() => qaStore.getState().languages.languages), ['spanish']);
    });
    await scenario('genre-stale-create', 'GenrePreferences', 'normal', async page => {
      await ready(page, 'GenrePreferences'); await page.evaluate(() => { qaHold = ['POST']; });
      await page.getByRole('button', { name: 'Create custom', exact: true }).click(); await page.getByLabel('Genre name').fill('A new private genre');
      await page.getByRole('button', { name: 'Create & select', exact: true }).click(); await page.waitForFunction(() => qaPending.some(call => call.method === 'POST'));
      await page.evaluate(() => { qaSetOwner('B'); qaHold = []; }); await ready(page, 'GenrePreferences', 'B'); await page.evaluate(() => qaResolve('A', 'POST')); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaToasts), []); assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.locator('body').innerText().then(text => text.includes('A new private')), false);
      assert.equal(await page.evaluate(() => qaCalls.some(call => call.owner === 'B' && call.method === 'POST')), false);
    });
    await scenario('genre-stale-save-error', 'GenrePreferences', 'normal', async page => {
      await ready(page, 'GenrePreferences'); await page.evaluate(() => { qaHold = ['POST']; }); await page.getByRole('button', { name: 'Add Rock to your picks', exact: true }).click();
      await page.evaluate(() => { qaSetOwner('B'); qaHold = []; }); await ready(page, 'GenrePreferences', 'B'); await page.evaluate(() => qaResolve('A', 'POST', true)); await settle(page);
      assert.equal(await page.getByText('Changes were not saved', { exact: true }).count(), 0); assert.deepEqual(await page.evaluate(() => qaToasts), []);
      assert((await page.evaluate(() => qaCalls)).filter(call => call.owner === 'A' && call.method === 'POST').every(call => call.aborted), 'A mutation must receive an abort on owner change');
      assert((await page.evaluate(() => qaCalls)).filter(call => call.url === '/api/genres' && call.method === 'GET').every(call => call.useCache === false));
    });
    await scenario('genre-load-error-retry', 'GenrePreferences', 'error', async page => {
      await page.getByText('Music taste is unavailable', { exact: true }).waitFor(); await page.evaluate(() => { qaApiMode = 'normal'; });
      await page.getByRole('button', { name: 'Try again', exact: true }).click(); await ready(page, 'GenrePreferences');
    });
    await scenario('notifications-stale-announcement', 'UpdatesBell', 'normal', async page => {
      await ready(page, 'UpdatesBell'); await page.evaluate(() => { qaHold = ['GET']; qaNotificationRevision = 1; qaPoll(); }); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(() => { qaSetOwner('B'); qaHold = []; }); await ready(page, 'UpdatesBell', 'B'); await page.evaluate(() => qaResolve('A')); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaToasts), []); assert((await page.evaluate(() => qaCalls)).filter(call => call.owner === 'A' && call.method === 'GET').every(call => call.aborted));
    });
    await scenario('notifications-guest-read-local-only', 'UpdatesBell', 'normal', async page => {
      await ready(page, 'UpdatesBell'); await page.evaluate(() => qaSetOwner(null)); await settle(page); await page.getByRole('button', { name: /Open notifications/ }).click(); await settle(page);
      assert.equal(await page.evaluate(() => qaCalls.filter(call => call.owner === 'guest' && call.method === 'POST').length), 0);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('heykasa.notifications.seen'))), ['guest-release-0']);
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
    });
    await scenario('language-guest-choices-stay-on-device', 'LanguageSync', 'normal', async page => {
      await ready(page, 'LanguageSync'); await page.evaluate(() => qaSetOwner(null)); await settle(page); await page.evaluate(() => qaSetLanguage(['french'])); await settle(page);
      await page.evaluate(() => qaSetOwner('B')); await ready(page, 'LanguageSync', 'B'); await page.evaluate(() => qaSetOwner(null)); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaStore.getState().languages.languages), ['french']); assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'PUT')), []);
    });
    await scenario('language-failed-hydration-does-not-write', 'LanguageSync', 'error', async page => {
      await page.waitForFunction(() => qaToasts.length === 1); await page.evaluate(() => qaSetLanguage(['french'])); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'PUT')), []);
    });
    for (const mode of ['empty', 'null']) await scenario('language-' + mode + '-preference', 'LanguageSync', 'hold', async page => {
      await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(mode => { qaLanguage = mode; qaHold = []; qaSetOwner('B'); qaResolve('A'); }, mode); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaStore.getState().languages.languages), mode === 'empty' ? [] : ['english']);
      assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'PUT')), []);
      await page.evaluate(() => qaSetLanguage(['german'])); await settle(page); assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'PUT').map(call => call.owner)), ['B']);
    });
    await scenario('genre-keyboard-current-saving' , 'GenrePreferences', 'normal', async page => {
      await ready(page, 'GenrePreferences'); const pick = page.getByRole('button', { name: 'Add Rock to your picks', exact: true }); await pick.focus(); await page.keyboard.press('Enter'); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'POST').at(-1).body.genres), ['A private genre', 'Rock']);
      await page.screenshot({ path: path.join(output, 'genre-narrow.png') });
    }, { width: 390, height: 844 });
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ scope: 'Isolated actual components + AccountPrivacyBoundary + installed Redux Toolkit/actual language reducer; controlled API/session, no real accounts/network writes; Chromium only.', results }, null, 2));
  for (const result of results) console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ': ' + result.error.split('\n')[0] : ''));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
