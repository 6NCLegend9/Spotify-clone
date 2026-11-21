// Real mounted components, desktop environment adapter, and react-hot-toast.
// Only native IPC and the release-manifest HTTP boundary are controlled here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.resolve(process.env.HAYKASA_DESKTOP_UI_EVIDENCE || path.join(root, 'artifacts/desktop-update-ui'));
const sources = {};
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const dependencies = {}; sources[key] = { code, dependencies };
  for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (['react', 'lucide-react', '@/services/http'].includes(spec)) { dependencies[spec] = spec; continue; }
    if (!spec.startsWith('.') && !spec.startsWith('@/')) {
      assert(['react-hot-toast', 'goober'].includes(spec), 'Unexpected package ' + spec);
      dependencies[spec] = include(require.resolve(spec, { paths: [path.dirname(file)] })); continue;
    }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, ...['.js', '.jsx', '.mjs'].map(extension => candidate + extension)]
      .find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved, 'Unresolved import ' + spec); dependencies[spec] = include(resolved);
  }
  return key;
}
const entries = {
  card: include(path.join(root, 'src/components/DesktopAppCard.jsx')),
  notifier: include(path.join(root, 'src/components/DesktopUpdateNotifier.jsx')),
  toast: include(require.resolve('react-hot-toast', { paths: [root] })),
};
const ready = { state: 'ready', version: '2.0.0', progress: 100, detail: 'Ready' };
const checking = { state: 'checking', version: '1.0.0', progress: 0, detail: '' };
const results = [];
let browser;
async function frame(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function setup(page, kind, options = {}) {
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' }));
  await page.goto('http://127.0.0.1:3000/__desktop-update-qa');
  for (const module of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js']) {
    await page.addScriptTag({ path: path.join(root, 'node_modules', module) });
  }
  await page.evaluate(({ sources, entries, kind, options }) => {
    const pending = {}, listeners = new Set(), calls = [];
    const ipc = (name, fallback) => {
      calls.push(name);
      if (options.reject === name) return Promise.reject(new Error(name + ' unavailable'));
      if (options.hold?.includes(name)) return new Promise((resolve, reject) => {
        (pending[name] ||= []).push({ resolve, reject });
      });
      return Promise.resolve(fallback);
    };
    window.heykasaDesktop = {
      getInfo: () => Promise.resolve({ desktopVersion: '1.0.0', apiVersion: 1, platform: 'win32', arch: 'x64',
        packaged: true, buildChannel: 'stable', capabilities: ['updaterV1', 'autoLaunchV1', 'desktopPreferencesV1', 'trayV1'] }),
      updates: {
        getStatus: () => ipc('status', options.status || { state: 'idle' }),
        onStatus: listener => { listeners.add(listener); return () => listeners.delete(listener); },
        check: () => ipc('check', { state: 'up-to-date', version: '1.0.0' }),
        install: () => ipc('install', { ok: true }),
      },
      startup: { get: () => ipc('startup', { enabled: false }) },
      preferences: { get: () => ipc('preferences', { autoUpdate: true, updateChannel: 'stable', closeToTray: true }) },
    };
    const cache = {};
    function require(name) {
      if (name === 'react') return React;
      if (name === 'lucide-react') return new Proxy({}, { get: (_, icon) => props => React.createElement('svg', { ...props, 'data-icon': icon }) });
      if (name === '@/services/http') return { requestJson: async () => ({ channel: 'stable', published: true, signed: true, latest: '2.0.0', sizeBytes: 1000000 }) };
      if (cache[name]) return cache[name].exports;
      const source = sources[name]; if (!source) throw Error('Unknown module ' + name);
      const module = { exports: {} }; cache[name] = module;
      new Function('module', 'exports', 'require', source.code)(module, module.exports, spec => require(source.dependencies[spec]));
      return module.exports;
    }
    const Component = require(entries[kind]).default, toast = require(entries.toast);
    const host = ReactDOM.createRoot(document.getElementById('root'));
    let mounted = true;
    const render = () => ReactDOM.flushSync(() => host.render(React.createElement(React.StrictMode, null,
      mounted && React.createElement(Component), React.createElement(toast.Toaster))));
    window.qa = {
      calls, pending, listeners,
      emit: status => { for (const listener of listeners) listener(status); },
      resolve: (name, value) => { const requests = pending[name]?.splice(0) || []; for (const item of requests) item.resolve(value); },
      reject: (name, message) => { const requests = pending[name]?.splice(0) || []; for (const item of requests) item.reject(new Error(message)); },
      unmount: () => { mounted = false; render(); },
      remount: () => { mounted = true; render(); },
    };
    render();
  }, { sources, entries, kind, options });
  await frame(page);
}
async function emit(page, status) { await page.evaluate(value => qa.emit(value), status); await frame(page); }
async function resolve(page, name, value) { await page.evaluate(({ name, value }) => qa.resolve(name, value), { name, value }); await frame(page); }
async function scenario(name, kind, options, run) {
  const page = await browser.newPage(); page.setDefaultTimeout(2000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try { await setup(page, kind, options); await run(page); assert.deepEqual(errors, []); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message, errors, observed: await page.evaluate(() => ({
    calls: window.qa?.calls, pending: Object.fromEntries(Object.entries(window.qa?.pending || {}).map(([key, value]) => [key, value.length])),
    remembered: localStorage.getItem('heykasa.desktop.lastNotifiedUpdate'), text: document.getElementById('root')?.innerText,
  })) }); }
  finally { await page.close(); }
}
const cardRestart = page => page.getByRole('button', { name: 'Restart and update', exact: true });
const toastRestart = page => page.getByRole('button', { name: 'Restart', exact: true });
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    await scenario('card-ready-event-survives-delayed-initial-snapshot', 'card', { hold: ['status'] }, async page => {
      await emit(page, ready); await resolve(page, 'status', checking);
      assert.equal(await cardRestart(page).count(), 1);
    });
    await scenario('card-updates-survive-unrelated-preferences-failure', 'card', { reject: 'preferences' }, async page => {
      await emit(page, ready); assert.equal(await cardRestart(page).count(), 1);
      assert.match(await page.locator('#root').innerText(), /preferences unavailable/);
    });
    await scenario('card-stale-status-read-error-does-not-obscure-ready-event', 'card', { hold: ['status'] }, async page => {
      await emit(page, ready); await page.evaluate(() => qa.reject('status', 'Obsolete snapshot failure')); await frame(page);
      assert.equal(await cardRestart(page).count(), 1); assert.doesNotMatch(await page.locator('#root').innerText(), /Obsolete snapshot failure/);
    });
    await scenario('card-status-does-not-wait-for-startup-ipc', 'card', { hold: ['startup'], status: ready }, async page => {
      assert.equal(await cardRestart(page).count(), 1);
      assert.equal(await page.getByRole('checkbox', { name: /Start HayKasa/ }).isDisabled(), true);
    });
    await scenario('card-check-response-cannot-overwrite-newer-ready-event', 'card', { hold: ['check'] }, async page => {
      await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
      await emit(page, ready); await resolve(page, 'check', checking);
      assert.equal(await cardRestart(page).count(), 1); assert.equal(await cardRestart(page).isEnabled(), true);
    });
    await scenario('card-current-check-result-is-shown', 'card', {}, async page => {
      await page.getByRole('button', { name: 'Check for updates', exact: true }).click(); await frame(page);
      assert.match(await page.locator('#root').innerText(), /HayKasa Desktop is up to date/);
    });
    await scenario('card-stale-check-error-does-not-obscure-newer-ready-state', 'card', { hold: ['check'] }, async page => {
      await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
      await emit(page, ready); await page.evaluate(() => qa.reject('check', 'Obsolete check failure')); await frame(page);
      assert.equal(await cardRestart(page).count(), 1);
      assert.doesNotMatch(await page.locator('#root').innerText(), /Obsolete check failure/);
    });
    await scenario('card-install-error-leaves-retry-available', 'card', { status: ready, reject: 'install' }, async page => {
      await cardRestart(page).click(); await frame(page);
      assert.match(await page.locator('#root').innerText(), /install unavailable/); assert.equal(await cardRestart(page).isEnabled(), true);
    });
    await scenario('notifier-new-status-retires-old-ready-snapshot', 'notifier', { hold: ['status'] }, async page => {
      await emit(page, { state: 'disabled', detail: 'Disabled by policy' }); await resolve(page, 'status', ready);
      assert.equal(await toastRestart(page).count(), 0);
    });
    await scenario('notifier-disables-stale-ready-action', 'notifier', { status: ready }, async page => {
      await emit(page, { state: 'disabled', detail: 'Disabled by policy' });
      await toastRestart(page).waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => qa.calls.filter(name => name === 'install').length), 0);
    });
    await scenario('notifier-install-rejection-keeps-retry-and-does-not-remember-success', 'notifier', { status: ready, hold: ['install'] }, async page => {
      await toastRestart(page).click(); await page.evaluate(() => qa.reject('install', 'Restart denied by current policy')); await frame(page);
      assert.match(await page.locator('#root').innerText(), /Restart denied by current policy/);
      assert.equal(await toastRestart(page).isEnabled(), true);
      assert.equal(await page.evaluate(() => localStorage.getItem('heykasa.desktop.lastNotifiedUpdate')), null);
      await toastRestart(page).click(); await resolve(page, 'install', { ok: true });
      await toastRestart(page).waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => localStorage.getItem('heykasa.desktop.lastNotifiedUpdate')), '2.0.0');
    });
    await scenario('notifier-one-install-at-a-time', 'notifier', { status: ready, hold: ['install'] }, async page => {
      await toastRestart(page).evaluate(button => { button.click(); button.click(); }); await frame(page);
      assert.equal(await page.evaluate(() => qa.calls.filter(name => name === 'install').length), 1);
      assert.equal(await page.getByRole('button', { name: /Restart/ }).isDisabled(), true);
    });
    for (const outcome of ['resolve', 'reject']) {
      await scenario('notifier-new-version-retries-after-old-install-' + outcome, 'notifier', { status: ready, hold: ['install'] }, async page => {
        await toastRestart(page).click(); await emit(page, { ...ready, version: '3.0.0' });
        await page.evaluate(outcome => qa[outcome]('install', outcome === 'reject' ? 'Old install error' : { ok: true }), outcome); await frame(page);
        assert.equal(await toastRestart(page).count(), 1); assert.equal(await toastRestart(page).isEnabled(), true);
        assert.match(await page.locator('#root').innerText(), /Desktop 3.0.0 is ready/);
        assert.doesNotMatch(await page.locator('#root').innerText(), /Old install error/);
        assert.equal(await page.evaluate(() => localStorage.getItem('heykasa.desktop.lastNotifiedUpdate')), null);
      });
    }
    await scenario('notifier-policy-change-retires-pending-install-error', 'notifier', { status: ready, hold: ['install'] }, async page => {
      await toastRestart(page).click(); await emit(page, { state: 'disabled', detail: 'Disabled by policy' });
      await page.evaluate(() => qa.reject('install', 'Retired install error')); await frame(page);
      await page.getByRole('button', { name: /Restart/ }).waitFor({ state: 'detached' });
      assert.doesNotMatch(await page.locator('#root').innerText(), /Retired install error/);
    });
    await scenario('notifier-repeated-ready-event-still-reports-current-install-error', 'notifier', { status: ready, hold: ['install'] }, async page => {
      await toastRestart(page).click(); await emit(page, ready);
      await page.evaluate(() => qa.reject('install', 'Current install error')); await frame(page);
      assert.match(await page.locator('#root').innerText(), /Current install error/); assert.equal(await toastRestart(page).isEnabled(), true);
    });
    await scenario('notifier-policy-roundtrip-does-not-revive-retired-install-result', 'notifier', { status: ready, hold: ['install'] }, async page => {
      await toastRestart(page).click(); await emit(page, { state: 'disabled' }); await emit(page, ready);
      await resolve(page, 'install', { ok: true });
      assert.equal(await toastRestart(page).count(), 1); assert.equal(await toastRestart(page).isEnabled(), true);
      assert.equal(await page.evaluate(() => localStorage.getItem('heykasa.desktop.lastNotifiedUpdate')), null);
    });
    await scenario('notifier-later-suppresses-repeat-version', 'notifier', { status: ready }, async page => {
      await page.getByRole('button', { name: 'Later', exact: true }).click();
      await toastRestart(page).waitFor({ state: 'detached' }); await emit(page, ready);
      assert.equal(await toastRestart(page).count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('heykasa.desktop.lastNotifiedUpdate')), '2.0.0');
    });
    await scenario('notifier-unmount-removes-action-and-late-errors', 'notifier', { status: ready, hold: ['install'] }, async page => {
      await toastRestart(page).click(); await page.evaluate(() => qa.unmount());
      await page.evaluate(() => qa.reject('install', 'Obsolete failure')); await frame(page);
      await page.getByRole('button', { name: /Restart/ }).waitFor({ state: 'detached' });
      assert.doesNotMatch(await page.locator('#root').innerText(), /Obsolete failure/);
      assert.equal(await page.evaluate(() => qa.listeners.size), 0);
    });
    await scenario('notifier-unmount-removes-idle-ready-action', 'notifier', { status: ready }, async page => {
      await page.evaluate(() => qa.unmount()); await toastRestart(page).waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => qa.listeners.size), 0);
    });
    await scenario('notifier-read-failure-does-not-prevent-ready-event', 'notifier', { reject: 'status' }, async page => {
      await emit(page, ready); assert.equal(await toastRestart(page).count(), 1);
    });
  } finally { await browser.close(); }
  fs.mkdirSync(output, { recursive: true });
  const hashes = Object.fromEntries(['card', 'notifier'].map(name => [entries[name], crypto.createHash('sha256').update(fs.readFileSync(path.join(root, entries[name]))).digest('hex')]));
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ scope: 'Actual React StrictMode components/environment adapter and react-hot-toast; controlled native IPC/manifest responses. No signed installer, Electron or installed-version delivery claim.', hashes, results }, null, 2));
  for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`);
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
