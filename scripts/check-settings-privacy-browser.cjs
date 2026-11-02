// Actual account panels, privacy boundary, scope and error UI; session/API/Redux providers are controlled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.resolve(process.env.HAYKASA_SETTINGS_PRIVACY_EVIDENCE || path.join(root, 'artifacts/settings-privacy'));
fs.mkdirSync(output, { recursive: true });
const sources = {};
const stubs = new Set(['react', 'next-auth/react', 'next/link', 'react-redux', 'lucide-react', '@/services/http', '@/services/libraryApi', '@/redux/features/settingsSlice']);
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  const baseline = process.env.HAYKASA_SETTINGS_PRIVACY_BASELINE;
  const read = baseline && ['FeedbackPreferences.jsx', 'ListeningInsights.jsx'].includes(path.basename(file)) ? path.join(baseline, path.basename(file)) : file;
  const code = ts.transpileModule(fs.readFileSync(read, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const dependencies = {}; sources[key] = { code, dependencies };
  for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (stubs.has(spec)) { dependencies[spec] = spec; continue; }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, ...['.js', '.jsx', '.mjs'].map(ext => candidate + ext)].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved && resolved.startsWith(path.join(root, 'src') + path.sep), `Unexpected test dependency: ${spec}`);
    dependencies[spec] = include(resolved);
  }
  return key;
}
const entries = { feedback: include(path.join(root, 'src/components/FeedbackPreferences.jsx')), insights: include(path.join(root, 'src/components/ListeningInsights.jsx')), boundary: include(path.join(root, 'src/components/AccountPrivacyBoundary.jsx')), storage: include(path.join(root, 'src/utils/accountStorage.mjs')) };
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.next/app-build-manifest.json'), 'utf8'));
const css = (manifest.pages['/layout'] || []).filter(name => name.endsWith('.css')).map(name => fs.readFileSync(path.join(root, '.next', name), 'utf8')).join('\n');
const results = [];
let browser;
async function setup(page, kind) {
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1:3000/__settings-privacy-qa'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' })
    : route.request().url() === 'http://127.0.0.1:3000/icon-192x192.png'
      ? route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.join(root, 'public/icon-192x192.png')) }) : route.abort());
  await page.goto('http://127.0.0.1:3000/__settings-privacy-qa');
  await page.addStyleTag({ content: css + '\nbody{background:var(--navy);color:white;font-family:Arial,sans-serif}#root{height:100dvh;overflow-y:auto}#fixture{padding:16px;max-width:900px;margin:auto}button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' });
  await page.addScriptTag({ path: path.join(root, 'node_modules/react/umd/react.development.js') });
  await page.addScriptTag({ path: path.join(root, 'node_modules/react-dom/umd/react-dom.development.js') });
  await page.evaluate(({ sources, entries, kind }) => {
    window.qaSession = { data: { user: { id: 'A' } }, status: 'authenticated' };
    window.qaCalls = []; window.qaHydrations = []; window.qaDispatches = []; window.qaPreferenceEvents = [];
    window.qaPendingReads = []; window.qaPendingMetadata = []; window.qaPendingWrites = [];
    window.qaDisabledOwners = []; window.qaClearedOwners = []; window.qaRestoredIds = [];
    window.qaHoldReads = false; window.qaHoldMetadata = false; window.qaHoldWrites = false; window.qaFailRead = false; window.qaEmpty = false; window.qaLongText = false;
    window.addEventListener('heykasa:preferences-changed', () => qaPreferenceEvents.push(qaSession.data?.user?.id || 'guest'));
    const trackId = (owner, type) => `${owner}-${type}-01`;
    const response = (owner, url) => {
      const empty = qaEmpty || qaClearedOwners.includes(owner);
      if (url.startsWith('/api/playEvent')) return { enabled: !qaDisabledOwners.includes(owner), data: { seconds: empty ? 0 : 120, sessions: empty ? 0 : 2, topTracks: empty ? [] : [{ id: trackId(owner, 'listened'), seconds: 120 }] } };
      return { data: qaEmpty ? [] : [trackId(owner, url.includes('snoozed') ? 'snoozed' : 'hidden')].filter(id => !qaRestoredIds.includes(id)) };
    };
    const metadata = ids => ids.map(id => ({ id, title: `${id[0]} private ${id.split('-')[1]} track${qaLongText ? ' ' + 'X'.repeat(300) + ' العربية עברית 漢字 🎵' : ''}`, thumbnail: '/icon-192x192.png' }));
    const applyWrite = (owner, url, options) => {
      if (url === '/api/settings') {
        qaDisabledOwners = qaDisabledOwners.filter(value => value !== owner);
        if (options.body.settings.listeningInsights === false) qaDisabledOwners.push(owner);
      } else if (url === '/api/playEvent') qaClearedOwners.push(owner);
      else qaRestoredIds.push(options.body.id);
      return { success: true };
    };
    const cache = {};
    function require(name) {
      if (name === 'react') return React;
      if (name === 'next-auth/react') return { useSession: () => qaSession };
      if (name === 'next/link') return { __esModule: true, default: ({ href, ...props }) => React.createElement('a', { ...props, href }) };
      if (name === 'react-redux') return { useDispatch: () => action => qaDispatches.push(action) };
      if (name === '@/redux/features/settingsSlice') return { updateSetting: payload => ({ type: 'settings/updateSetting', payload }) };
      if (name === 'lucide-react') return new Proxy({}, { get: () => props => React.createElement('svg', { ...props, width: '1em', height: '1em' }) });
      if (name === '@/services/http') return { requestJson: (url, options = {}) => {
        const owner = qaSession.data?.user?.id || 'guest', method = options.method || 'GET';
        qaCalls.push({ owner, url, method, body: options.body });
        if (method === 'GET') {
          if (qaHoldReads) return new Promise((resolve, reject) => qaPendingReads.push({ owner, url, resolve, reject }));
          if (qaFailRead) return Promise.reject({ code: 'UNAVAILABLE', status: 503 });
          return Promise.resolve(response(owner, url));
        }
        return qaHoldWrites ? new Promise((resolve, reject) => qaPendingWrites.push({ owner, url, options, resolve, reject })) : Promise.resolve(applyWrite(owner, url, options));
      } };
      if (name === '@/services/libraryApi') return { hydrateYouTubeTracks: ids => {
        qaHydrations.push([...ids]);
        return qaHoldMetadata ? new Promise(resolve => qaPendingMetadata.push({ owner: ids[0]?.[0], ids, resolve })) : Promise.resolve(metadata(ids));
      } };
      if (cache[name]) return cache[name].exports;
      const source = sources[name]; if (!source) throw Error(`Unknown module ${name}`);
      const loaded = { exports: {} }; cache[name] = loaded;
      new Function('module', 'exports', 'require', source.code)(loaded, loaded.exports, spec => require(source.dependencies[spec]));
      return loaded.exports;
    }
    const Component = require(entries[kind]).default, Boundary = require(entries.boundary).default;
    window.qaStorage = require(entries.storage);
    const host = ReactDOM.createRoot(document.getElementById('root'));
    const render = () => ReactDOM.flushSync(() => host.render(React.createElement(React.Fragment, null,
      React.createElement(Boundary), React.createElement('main', { id: 'fixture' }, React.createElement(Component)))));
    window.qaSetOwner = (owner, status = owner ? 'authenticated' : 'unauthenticated') => {
      qaSession = { data: owner ? { user: { id: owner } } : null, status }; render();
    };
    window.qaSetStatus = status => { qaSession = { ...qaSession, status }; render(); };
    window.qaResolveReads = owner => { for (const pending of qaPendingReads.splice(0)) { if (pending.owner === owner) pending.resolve(response(owner, pending.url)); else qaPendingReads.push(pending); } };
    window.qaResolveMetadata = owner => { for (const pending of qaPendingMetadata.splice(0)) { if (pending.owner === owner) pending.resolve(metadata(pending.ids)); else qaPendingMetadata.push(pending); } };
    window.qaResolveWrites = (owner, fail = false) => { for (const pending of qaPendingWrites.splice(0)) { if (pending.owner === owner) { if (fail) pending.reject({ code: 'UNAVAILABLE', status: 503 }); else pending.resolve(applyWrite(owner, pending.url, pending.options)); } else qaPendingWrites.push(pending); } };
    window.qaFlush = async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); };
    render();
  }, { sources, entries, kind });
  await page.waitForFunction(() => qaStorage.getActiveAccountOwner() === 'account:A');
}
async function open(page) {
  const summary = page.locator('summary');
  if (!await page.locator('details').evaluate(node => node.open)) await summary.click();
}
async function privateTrack(page, owner, kind) {
  await page.getByText(`${owner} private ${kind === 'feedback' ? 'hidden' : 'listened'} track`, { exact: true }).waitFor({ timeout: 2000 });
}
const absentPrivate = page => page.locator('body').innerText().then(text => !text.includes('A private'));
async function scenario(name, kind, run, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await setup(page, kind); await run(page); assert.deepEqual(errors, []);
    results.push({ name, kind, viewport, pass: true, pageErrors: errors });
  } catch (error) {
    results.push({ name, kind, viewport, pass: false, error: String(error.message), pageErrors: errors });
    await page.screenshot({ path: path.join(output, name + '-failure.png') }).catch(() => {});
  } finally { await page.close(); }
}
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    for (const kind of ['feedback', 'insights']) {
      await scenario(kind + '-mounted-panel-owner-switch', kind, async page => {
        await open(page); await privateTrack(page, 'A', kind);
        assert.equal(await page.evaluate(() => { qaSetOwner('B'); return document.body.textContent.includes('A private'); }), false, 'A names must disappear in the B commit');
        await open(page); await privateTrack(page, 'B', kind);
        assert.equal(await absentPrivate(page), true);
        assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'GET').map(call => call.owner)), ['A', 'B']);
      });
      await scenario(kind + '-privacy-clear-with-stale-session', kind, async page => {
        await open(page); await privateTrack(page, 'A', kind);
        await page.evaluate(async () => { qaStorage.clearLocalAccountCaches({ notify: true }); await qaFlush(); });
        assert.equal(await absentPrivate(page), true, 'privacy generation must invalidate mounted panels');
        await open(page); await page.evaluate(() => qaFlush());
        assert.equal(await page.locator('button,select,input').count(), kind === 'feedback' ? 2 : 0);
        assert.equal(await page.evaluate(() => qaCalls.length), 1, 'stale authenticated session may not issue new account requests');
        await page.evaluate(() => qaSetOwner('B')); await open(page); await privateTrack(page, 'B', kind);
      });
      await scenario(kind + '-delayed-read-via-guest', kind, async page => {
        await page.evaluate(() => { qaHoldReads = true; }); await open(page);
        await page.waitForFunction(() => qaPendingReads.length === 1);
        await page.evaluate(() => qaSetOwner(null)); assert.equal(await absentPrivate(page), true);
        await page.evaluate(() => { qaHoldReads = false; qaSetOwner('B'); }); await open(page); await privateTrack(page, 'B', kind);
        await page.evaluate(async () => { qaResolveReads('A'); await qaFlush(); });
        assert.equal(await absentPrivate(page), true);
        assert.equal(await page.evaluate(() => qaHydrations.flat().some(id => id.startsWith('A-'))), false, 'do not start stale metadata work after account read resolves');
      });
      await scenario(kind + '-delayed-metadata-owner-switch', kind, async page => {
        await page.evaluate(() => { qaHoldMetadata = true; }); await open(page);
        await page.waitForFunction(() => qaPendingMetadata.length === 1);
        await page.evaluate(() => { qaHoldMetadata = false; qaSetOwner('B'); }); await open(page); await privateTrack(page, 'B', kind);
        await page.evaluate(async () => { qaResolveMetadata('A'); await qaFlush(); });
        assert.equal(await absentPrivate(page), true);
      });
      for (const fail of [false, true]) await scenario(kind + '-pending-mutation-owner-switch-' + (fail ? 'failure' : 'success'), kind, async page => {
        await open(page); await privateTrack(page, 'A', kind);
        await page.evaluate(() => { qaHoldWrites = true; });
        await page.getByRole('button', { name: kind === 'feedback' ? 'Restore A private hidden track' : 'Clear observations', exact: true }).click();
        await page.waitForFunction(() => qaPendingWrites.length === 1);
        await page.evaluate(() => { qaHoldWrites = false; qaSetOwner('B'); }); await open(page); await privateTrack(page, 'B', kind);
        const before = await page.evaluate(() => qaCalls.length);
        await page.evaluate(async fail => { qaResolveWrites('A', fail); await qaFlush(); }, fail);
        assert.equal(await page.getByRole('alert').count(), 0);
        assert.equal(await page.evaluate(() => qaCalls.length), before, 'A completion cannot reload B data');
        assert.deepEqual(await page.evaluate(() => qaPreferenceEvents), [], 'A completion cannot broadcast preferences for B');
        assert.deepEqual(await page.evaluate(() => qaDispatches), []);
      });
      await scenario(kind + '-same-owner-mutation-success', kind, async page => {
        await open(page); await privateTrack(page, 'A', kind);
        await page.getByRole('button', { name: kind === 'feedback' ? 'Restore A private hidden track' : 'Clear observations', exact: true }).click();
        await page.getByText(kind === 'feedback' ? 'No tracks.' : 'No observations in this period.', { exact: true }).waitFor();
        assert.equal(await absentPrivate(page), true);
        assert.deepEqual(await page.evaluate(() => qaPreferenceEvents), kind === 'feedback' ? ['A'] : []);
        const calls = await page.evaluate(() => qaCalls);
        assert.equal(calls.filter(call => call.method === 'DELETE').length, 1);
        assert.equal(calls.filter(call => call.method === 'GET').length, kind === 'feedback' ? 1 : 2);
      });
      await scenario(kind + '-pending-mutation-privacy-generation', kind, async page => {
        await open(page); await privateTrack(page, 'A', kind);
        await page.evaluate(() => { qaHoldWrites = true; });
        await page.getByRole('button', { name: kind === 'feedback' ? 'Restore A private hidden track' : 'Clear observations', exact: true }).click();
        await page.waitForFunction(() => qaPendingWrites.length === 1);
        await page.evaluate(async () => { qaStorage.clearLocalAccountCaches({ notify: true }); await qaFlush(); qaResolveWrites('A'); await qaFlush(); });
        assert.equal(await absentPrivate(page), true);
        assert.equal(await page.getByRole('alert').count(), 0);
        assert.deepEqual(await page.evaluate(() => qaPreferenceEvents), []);
        assert.equal(await page.evaluate(() => qaCalls.length), 2, 'revoked generation cannot reload data');
      });
      await scenario(kind + '-guest-and-loading-have-no-private-data', kind, async page => {
        await open(page); await privateTrack(page, 'A', kind);
        await page.evaluate(() => qaSetStatus('loading'));
        assert.equal(await absentPrivate(page), true); assert.equal(await page.locator('details').count(), 0);
        await page.evaluate(() => qaSetOwner(null)); assert.equal(await page.locator('details').count(), 0);
        await page.evaluate(() => qaSetOwner(null, 'authenticated')); assert.equal(await page.locator('details').count(), 0);
        await page.evaluate(() => qaSetOwner('B')); await open(page); await privateTrack(page, 'B', kind);
        assert.deepEqual(await page.evaluate(() => qaCalls.map(call => call.owner)), ['A', 'B']);
      });
      await scenario(kind + '-error-keyboard-retry-and-empty', kind, async page => {
        await page.evaluate(() => { qaFailRead = true; });
        await page.locator('summary').focus(); await page.keyboard.press('Enter');
        await page.getByRole('alert').waitFor();
        const retry = page.getByRole('button', { name: 'Try again', exact: true });
        await page.evaluate(() => { qaFailRead = false; qaEmpty = true; }); await retry.focus(); await page.keyboard.press('Enter');
        await page.getByText(kind === 'feedback' ? 'No tracks.' : 'No observations in this period.', { exact: true }).waitFor();
        assert.equal(await page.getByRole('alert').count(), 0);
      });
      for (const [label, viewport] of [['narrow', { width: 320, height: 720 }], ['landscape', { width: 844, height: 390 }], ['desktop', { width: 1440, height: 900 }]]) await scenario(kind + '-layout-' + label, kind, async page => {
        await page.evaluate(() => { qaLongText = true; document.documentElement.style.fontSize = '32px'; }); await open(page);
        await page.getByText(/A private (?:hidden|listened) track/).waitFor();
        const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: Math.max(document.documentElement.scrollWidth, document.getElementById('root').scrollWidth), controls: [...document.querySelectorAll('button,select')].filter(node => node.offsetWidth).map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; }) }));
        assert(layout.scroll <= layout.width + 1, 'no horizontal overflow at 200% text');
        assert(layout.controls.every(control => control.left >= 0 && control.right <= viewport.width + 1 && control.height >= 44), 'controls remain operable at 200% text');
        await page.screenshot({ path: path.join(output, kind + '-layout-' + label + '.png') });
        const lastAction = page.getByRole('button', { name: kind === 'feedback' ? /^Restore / : 'Clear observations', exact: kind !== 'feedback' });
        await lastAction.focus(); await page.evaluate(() => qaFlush());
        assert.equal(await lastAction.evaluate(node => { const r = node.getBoundingClientRect(); return document.activeElement === node && r.top >= 0 && r.bottom <= innerHeight; }), true, 'scrolling must make the last action keyboard reachable');
        await page.screenshot({ path: path.join(output, kind + '-layout-' + label + '-action.png') });
      }, viewport);
    }
    await scenario('feedback-snoozed-keyboard-restore', 'feedback', async page => {
      await open(page); await privateTrack(page, 'A', 'feedback');
      await page.getByRole('tab', { name: 'Snoozed', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.getByText('A private snoozed track', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Restore A private snoozed track', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.getByText('No tracks.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => qaCalls.at(-1).url), '/api/snoozedTracks');
      assert.deepEqual(await page.evaluate(() => qaPreferenceEvents), ['A']);
    });
    await scenario('insights-same-owner-optout-success', 'insights', async page => {
      await open(page); await privateTrack(page, 'A', 'insights');
      await page.getByRole('checkbox', { name: 'Save listening observations', exact: true }).click();
      await page.waitForFunction(() => qaDispatches.length === 1);
      await page.waitForFunction(() => document.querySelector('input[type=checkbox]')?.checked === false);
      assert.deepEqual(await page.evaluate(() => qaDispatches), [{ type: 'settings/updateSetting', payload: { key: 'listeningInsights', value: false } }]);
      assert.equal(await absentPrivate(page), true);
    });
    for (const fail of [false, true]) await scenario('insights-pending-optin-owner-switch-' + (fail ? 'failure' : 'success'), 'insights', async page => {
      await open(page); await privateTrack(page, 'A', 'insights');
      await page.evaluate(() => { qaHoldWrites = true; });
      await page.getByRole('checkbox', { name: 'Save listening observations', exact: true }).click();
      await page.waitForFunction(() => qaPendingWrites.length === 1);
      await page.evaluate(() => { qaHoldWrites = false; qaSetOwner('B'); }); await open(page); await privateTrack(page, 'B', 'insights');
      await page.evaluate(async fail => { qaResolveWrites('A', fail); await qaFlush(); }, fail);
      assert.deepEqual(await page.evaluate(() => qaDispatches), [], 'old opt-in cannot change new account Redux settings');
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.equal(await page.getByRole('checkbox', { name: 'Save listening observations', exact: true }).isChecked(), true);
    });
  } finally { await browser.close(); }
  const report = { scope: 'Isolated actual panels, privacy boundary/scope and error UI; controlled session/HTTP/hydration/Redux, no real account/network writes. Chromium only. Normal SettingsPage already keys its parent by owner; mounted-panel tests also cover standalone use and ACCOUNT_DATA_CLEARED with a stale session.', baseline: Boolean(process.env.HAYKASA_SETTINGS_PRIVACY_BASELINE), results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  for (const result of results) console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ': ' + result.error.split('\n')[0] : ''));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
