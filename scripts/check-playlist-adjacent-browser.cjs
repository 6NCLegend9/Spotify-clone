// Actual React components; image failures and touch lifecycle events are synthetic.
// The refresh timer is controlled, while the resulting browser reload is real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.resolve(process.env.HAYKASA_PLAYLIST_ADJACENT_EVIDENCE || path.join(root, 'artifacts/playlist-adjacent'));
fs.mkdirSync(output, { recursive: true });
const sources = {};
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  const baseline = process.env.HAYKASA_PLAYLIST_ADJACENT_BASELINE;
  const alternate = baseline && ['PlaylistCover.jsx', 'PullToRefresh.jsx'].includes(path.basename(file))
    ? path.join(baseline, path.basename(file)) : file;
  const code = ts.transpileModule(fs.readFileSync(alternate, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const dependencies = {}; sources[key] = { code, dependencies };
  for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (['react', 'lucide-react'].includes(spec)) { dependencies[spec] = spec; continue; }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, ...['.js', '.jsx', '.mjs'].map(extension => candidate + extension)]
      .find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved && resolved.startsWith(path.join(root, 'src') + path.sep), 'Unexpected test dependency: ' + spec);
    dependencies[spec] = include(resolved);
  }
  return key;
}
const entries = {
  cover: include(path.join(root, 'src/components/PlaylistCover.jsx')),
  refresh: include(path.join(root, 'src/components/PullToRefresh.jsx')),
};
const url = 'http://127.0.0.1:3000/__playlist-adjacent-qa';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYqkAAAAASUVORK5CYII=', 'base64');
const results = [];
let browser;
async function setup(page, kind) {
  let navigations = 0;
  await page.route('**/*', route => {
    if (route.request().url() === url) {
      navigations += 1;
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="main-content"><div id="root"></div></div>' });
    }
    return route.fulfill({ contentType: 'image/png', body: png });
  });
  await page.goto(url);
  for (const module of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js']) {
    await page.addScriptTag({ path: path.join(root, 'node_modules', module) });
  }
  await page.evaluate(({ sources, entries, kind }) => {
    const cache = {};
    function require(name) {
      if (name === 'react') return React;
      if (name === 'lucide-react') return new Proxy({}, { get: (_, icon) => props => React.createElement('svg', { ...props, 'data-icon': icon }) });
      if (cache[name]) return cache[name].exports;
      const source = sources[name]; if (!source) throw Error('Unknown module ' + name);
      const module = { exports: {} }; cache[name] = module;
      new Function('module', 'exports', 'require', source.code)(module, module.exports, spec => require(source.dependencies[spec]));
      return module.exports;
    }
    const Component = require(entries[kind]).default;
    window.qaPlaylist = { coverImage: '/custom.png', cover: '/track.png', category: 'Rock' };
    window.qaTimers = new Map();
    const realSetTimeout = window.setTimeout.bind(window), realClearTimeout = window.clearTimeout.bind(window);
    let timerId = 1000000;
    window.setTimeout = (callback, delay, ...args) => {
      if (delay !== 320) return realSetTimeout(callback, delay, ...args);
      const id = ++timerId; qaTimers.set(id, () => callback(...args)); return id;
    };
    window.clearTimeout = id => { if (!qaTimers.delete(id)) realClearTimeout(id); };
    const container = document.getElementById('main-content');
    const add = container.addEventListener.bind(container), remove = container.removeEventListener.bind(container);
    window.qaMoveListeners = new Set();
    container.addEventListener = (type, handler, options) => {
      if (type === 'touchmove') qaMoveListeners.add(handler); add(type, handler, options);
    };
    container.removeEventListener = (type, handler, options) => {
      if (type === 'touchmove') qaMoveListeners.delete(handler); remove(type, handler, options);
    };
    const host = ReactDOM.createRoot(document.getElementById('root'));
    const render = () => ReactDOM.flushSync(() => host.render(React.createElement(React.StrictMode, null,
      React.createElement(Component, kind === 'cover' ? { playlist: qaPlaylist, showLabel: true } : null))));
    window.qaRender = render;
    window.qaUnmount = () => ReactDOM.flushSync(() => host.unmount());
    window.qaFailImage = () => document.querySelector('img')?.dispatchEvent(new Event('error'));
    window.qaTouch = (type, x = 20, y = 10) => {
      const event = new TouchEvent(type, { bubbles: true, cancelable: true,
        touches: ['touchend', 'touchcancel'].includes(type) ? [] : [new Touch({ identifier: 1, target: container, clientX: x, clientY: y })] });
      container.dispatchEvent(event);
      return event.defaultPrevented;
    };
    render();
  }, { sources, entries, kind });
  await frame(page);
  return () => navigations;
}
async function frame(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function failImage(page) { await page.evaluate(() => qaFailImage()); await frame(page); }
async function pull(page, distance = 200) {
  await page.evaluate(() => qaTouch('touchstart'));
  assert.equal(await page.evaluate(distance => qaTouch('touchmove', 20, distance), distance), true);
  await frame(page);
}
async function scenario(name, kind, run) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    const navigations = await setup(page, kind); await run(page, navigations); assert.deepEqual(errors, []);
    results.push({ name, pass: true });
  } catch (error) { results.push({ name, pass: false, error: String(error.message), errors }); }
  finally { await page.close(); }
}
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    await scenario('cover-both-fail-settles-on-theme', 'cover', async page => {
      assert.equal(await page.locator('img').getAttribute('src'), '/custom.png');
      await failImage(page); assert.equal(await page.locator('img').getAttribute('src'), '/track.png');
      await failImage(page); assert.equal(await page.locator('img').count(), 0);
      assert.equal(await page.locator('[data-icon]').count(), 1);
      assert.equal(await page.locator('#root').innerText(), 'Rock');
      for (let index = 0; index < 3; index += 1) { await page.evaluate(() => { qaPlaylist = { ...qaPlaylist, name: 'Changed metadata' }; qaRender(); }); await frame(page); }
      assert.equal(await page.locator('img').count(), 0, 'The same failed pair must not restart');
    });
    await scenario('cover-valid-track-fallback-stays-visible', 'cover', async page => {
      await failImage(page); assert.equal(await page.locator('img').getAttribute('src'), '/track.png');
      await page.evaluate(() => { qaPlaylist = { ...qaPlaylist, name: 'A new name' }; qaRender(); }); await frame(page);
      assert.equal(await page.locator('img').getAttribute('src'), '/track.png');
    });
    await scenario('cover-new-pair-retries-and-stale-error-isolated', 'cover', async page => {
      await page.evaluate(() => { window.qaOldImage = document.querySelector('img'); });
      await failImage(page); await failImage(page);
      await page.evaluate(() => { qaPlaylist = { ...qaPlaylist, coverImage: '/new-custom.png' }; qaRender(); qaOldImage.dispatchEvent(new Event('error')); }); await frame(page);
      assert.equal(await page.locator('img').getAttribute('src'), '/new-custom.png');
      await failImage(page); assert.equal(await page.locator('img').getAttribute('src'), '/track.png');
      await failImage(page); assert.equal(await page.locator('img').count(), 0);
    });
    await scenario('cover-identical-urls-fail-only-once', 'cover', async page => {
      await page.evaluate(() => { qaPlaylist = { ...qaPlaylist, cover: qaPlaylist.coverImage }; qaRender(); }); await frame(page);
      await failImage(page); assert.equal(await page.locator('img').count(), 0);
    });
    await scenario('cover-category-change-keeps-image-failures', 'cover', async page => {
      await failImage(page); await failImage(page);
      await page.evaluate(() => { qaPlaylist = { ...qaPlaylist, category: 'Sports' }; qaRender(); }); await frame(page);
      assert.equal(await page.locator('img').count(), 0); assert.equal(await page.locator('#root').innerText(), 'Sports');
    });
    await scenario('refresh-cancel-above-threshold-never-commits', 'refresh', async (page, navigations) => {
      await pull(page); assert.equal(await page.locator('.ptr-spinner').evaluate(node => node.classList.contains('is-ready')), true);
      await page.evaluate(() => qaTouch('touchcancel')); await frame(page);
      assert.equal(await page.locator('.ptr-indicator').getAttribute('aria-hidden'), 'true');
      assert.equal(await page.evaluate(() => qaTimers.size), 0); assert.equal(await page.evaluate(() => qaMoveListeners.size), 0);
      assert.equal(await page.evaluate(() => qaTouch('touchmove', 20, 220)), false);
      await page.evaluate(() => qaTouch('touchend')); await frame(page);
      assert.equal(await page.evaluate(() => qaTimers.size), 0); assert.equal(navigations(), 1);
    });
    await scenario('refresh-release-below-threshold-resets', 'refresh', async (page, navigations) => {
      await pull(page, 70); await page.evaluate(() => qaTouch('touchend')); await frame(page);
      assert.equal(await page.locator('.ptr-indicator').getAttribute('aria-hidden'), 'true');
      assert.equal(await page.evaluate(() => qaTimers.size), 0); assert.equal(await page.evaluate(() => qaMoveListeners.size), 0); assert.equal(navigations(), 1);
    });
    await scenario('refresh-normal-release-reloads-once', 'refresh', async (page, navigations) => {
      await pull(page); await page.evaluate(() => qaTouch('touchend')); await frame(page);
      assert.equal(await page.locator('.ptr-spinner').evaluate(node => node.classList.contains('is-spinning')), true);
      assert.equal(await page.evaluate(() => qaTimers.size), 1); assert.equal(await page.evaluate(() => qaMoveListeners.size), 0);
      await page.evaluate(() => qaTouch('touchend')); await frame(page); assert.equal(await page.evaluate(() => qaTimers.size), 1);
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.evaluate(() => [...qaTimers.values()][0]())]);
      assert.equal(navigations(), 2, 'One initial load plus one actual browser reload');
    });
    await scenario('refresh-cancel-allows-a-new-gesture', 'refresh', async page => {
      await pull(page); await page.evaluate(() => qaTouch('touchcancel')); await frame(page);
      await pull(page); await page.evaluate(() => qaTouch('touchend')); await frame(page);
      assert.equal(await page.evaluate(() => qaTimers.size), 1); assert.equal(await page.evaluate(() => qaMoveListeners.size), 0);
    });
    await scenario('refresh-unmount-removes-active-gesture-listener', 'refresh', async page => {
      await pull(page); assert.equal(await page.evaluate(() => qaMoveListeners.size), 1);
      await page.evaluate(() => qaUnmount()); assert.equal(await page.evaluate(() => qaMoveListeners.size), 0);
    });
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ scope: 'Actual React StrictMode components; controlled image error/touch events and refresh timer; real browser reload; Chromium only, no physical-device claim.', results }, null, 2));
  for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`);
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
