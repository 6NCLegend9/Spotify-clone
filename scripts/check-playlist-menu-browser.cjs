// Actual playlist menus + AccountPrivacyBoundary; only session/provider/API dependencies are controlled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.resolve(process.env.HAYKASA_PLAYLIST_MENU_EVIDENCE || path.join(root, 'artifacts/playlist-menu'));
fs.mkdirSync(output, { recursive: true });
const sources = {};
const stubs = new Set(['react', 'react-dom', 'next/navigation', 'next-auth/react', 'next/link', 'react-redux', 'react-hot-toast', 'lucide-react', '@/services/playlistApi', '@/redux/features/playerSlice', '@/redux/features/loadingBarSlice', '../Layout/AppShell']);
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  const baseline = process.env.HAYKASA_PLAYLIST_MENU_BASELINE;
  const read = baseline && ['TrackQueueMenu.jsx', 'AddToPlaylistButton.jsx'].includes(path.basename(file)) ? path.join(baseline, path.basename(file)) : file;
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
const entries = { add: include(path.join(root, 'src/components/AddToPlaylistButton.jsx')), track: include(path.join(root, 'src/components/TrackQueueMenu.jsx')), boundary: include(path.join(root, 'src/components/AccountPrivacyBoundary.jsx')), storage: include(path.join(root, 'src/utils/accountStorage.mjs')), access: include(path.join(root, 'src/utils/playlistAccess.mjs')) };
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.next/app-build-manifest.json'), 'utf8'));
const css = (manifest.pages['/layout'] || []).filter(name => name.endsWith('.css')).map(name => fs.readFileSync(path.join(root, '.next', name), 'utf8')).join('\n');
const results = [];
let browser;
async function setup(page, kind, mode = 'normal') {
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1:3000/__playlist-menu-qa'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }) : route.abort());
  await page.goto('http://127.0.0.1:3000/__playlist-menu-qa');
  await page.addStyleTag({ content: css + '\nbody{background:var(--navy);color:white;font-family:Arial,sans-serif}#fixture{display:flex;gap:24px;align-items:center;padding:40px 16px}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' });
  await page.addScriptTag({ path: path.join(root, 'node_modules/react/umd/react.development.js') });
  await page.addScriptTag({ path: path.join(root, 'node_modules/react-dom/umd/react-dom.development.js') });
  await page.evaluate(({ sources, entries, kind, mode }) => {
    window.qaSession = { data: { user: { id: 'A' } }, status: 'authenticated' };
    window.qaFetchCalls = []; window.qaAddCalls = []; window.qaAddRequests = []; window.qaToasts = []; window.qaEvents = []; window.qaPendingLists = []; window.qaPendingAdds = []; window.qaAddMode = "normal"; window.qaCreated = []; window.qaMoves = []; window.qaTrack = { id: "abcdefghijk", title: "QA track", duration: 180 }; window.qaMenuProps = {};
    window.addEventListener("heykasa:playlists-changed", event => qaEvents.push(event.detail));
    window.qaHoldLists = mode === 'loading'; window.qaHoldAdds = false; window.qaListMode = mode; window.qaDestinationLists = {};
    const list = owner => [...(qaDestinationLists[owner] || [1, 2, 3].map(index => ({ _id: `${owner}-${index}`, name: `${owner} private playlist ${index}`, user: { _id: owner, userName: owner }, collaborators: [], visibility: 'private' }))), ...qaCreated.filter(item => item.owner === owner)];
    const response = owner => ['error', 'unauthorized'].includes(qaListMode) ? { success: false, code: qaListMode === 'unauthorized' ? 'UNAUTHORIZED' : 'UNKNOWN' } : { success: true, data: { playlists: qaListMode === 'empty' ? [] : list(owner) } };
    const toast = message => qaToasts.push(String(message)); toast.error = toast; toast.success = toast;
    const cache = {};
    function require(name) {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOM;
      if (name === 'next-auth/react') return { useSession: () => qaSession };
      if (name === 'next/navigation') return { useRouter: () => ({ push() {} }) };
      if (name === 'next/link') return { __esModule: true, default: ({ href, ...props }) => React.createElement('a', { ...props, href }) };
      if (name === 'react-redux') return { useDispatch: () => () => {}, useSelector: pick => pick({ player: { youtubeVideo: { id: 'abcdefghijk' } } }) };
      if (name === 'react-hot-toast') return { toast };
      if (name === 'lucide-react') return new Proxy({}, { get: () => props => React.createElement('svg', { ...props, width: '1em', height: '1em' }) });
      if (name === '../Layout/AppShell') return { useNav: () => ({ setShowNav() {} }) };
      if (name === '@/redux/features/loadingBarSlice') return { setIsTyping: value => value };
      if (name === '@/redux/features/playerSlice') return { addToQueue() {}, playNextToQueue() {}, startYoutubePlayback() {} };
      if (name === '@/services/playlistApi') return {
        getUserPlaylists: () => {
          const owner = qaSession.data?.user?.id || 'guest'; qaFetchCalls.push(owner);
          return qaHoldLists ? new Promise(resolve => qaPendingLists.push({ owner, resolve })) : Promise.resolve(response(owner));
        },
        addSongToPlaylist: (id, song, duration, options) => {
          const owner = qaSession.data?.user?.id || 'guest'; qaAddCalls.push({ owner, id });
          qaAddRequests.push({ owner, id, song, duration, options });
          const playlist = [...list(owner), ...qaCreated].find(item => item._id === id);
          const result = !require(entries.access).canEditPlaylist(playlist, owner)
            ? { success: false, code: 'FORBIDDEN' }
            : qaAddMode === 'duplicate' && !options.allowDuplicate
            ? { success: true, duplicate: true, added: false, data: { playlist } }
            : qaAddMode === 'error' ? { success: false, code: 'NETWORK_ERROR' }
              : { success: true, added: true, data: { playlist: { ...playlist, songs: [song] } } };
          return qaHoldAdds ? new Promise(resolve => qaPendingAdds.push({ owner, resolve, result })) : Promise.resolve(result);
        },
        createPlaylist: name => {
          const owner = qaSession.data?.user?.id || 'guest';
          const playlist = { owner, user: { _id: owner }, collaborators: [], _id: `created-${qaCreated.length}`, name, songs: [] };
          qaCreated.push(playlist); return Promise.resolve({ success: true, data: { playlist } });
        },
      };
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
      React.createElement(Boundary), React.createElement('div', { id: 'fixture' },
        React.createElement('button', { id: 'before' }, 'Before'),
        React.createElement(Component, { track: qaTrack, ...qaMenuProps }),
        React.createElement('button', { id: 'after' }, 'After')))));
    window.qaRerender = render;
    window.qaSetOwner = owner => { qaSession = owner ? { data: { user: { id: owner } }, status: 'authenticated' } : { data: null, status: 'unauthenticated' }; render(); };
    window.qaResolveLists = owner => { for (const pending of qaPendingLists.splice(0)) { if (pending.owner === owner) pending.resolve(response(owner)); else qaPendingLists.push(pending); } };
    window.qaResolveAdds = owner => { for (const pending of qaPendingAdds.splice(0)) { if (pending.owner === owner) pending.resolve(pending.result); else qaPendingAdds.push(pending); } };
    render();
  }, { sources, entries, kind, mode });
  await page.waitForFunction(() => qaStorage.getActiveAccountOwner() === 'account:A');
}
const trigger = (page, kind) => page.getByRole('button', { name: kind === 'add' ? 'Add to playlist' : 'Track options', exact: true });
async function open(page, kind, keyboard = false) {
  if (keyboard) { await trigger(page, kind).focus(); await page.keyboard.press('Enter'); } else await trigger(page, kind).click();
  if (kind === 'track') await page.getByRole('menuitem', { name: 'Add to playlist', exact: true }).click();
  await page.getByRole('menu').waitFor();
}
async function close(page, kind) {
  if (kind === 'add') await page.getByRole('button', { name: 'Close playlist menu', exact: true }).click();
  else { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }
  await page.getByRole('menu').waitFor({ state: 'detached' });
}
async function scenario(name, kind, mode, run, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await setup(page, kind, mode); await run(page); assert.deepEqual(errors, []);
    results.push({ name, kind, viewport, pass: true, pageErrors: errors });
  } catch (error) {
    results.push({ name, kind, viewport, pass: false, error: String(error.message), pageErrors: errors });
    await page.screenshot({ path: path.join(output, name + '-failure.png') }).catch(() => {});
  } finally { await page.close(); }
}
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    for (const kind of ['add', 'track']) {
      await scenario(kind + '-destinations-require-ownership-or-collaboration', kind, 'normal', async page => {
        await page.evaluate(() => { qaDestinationLists.A = [
          { _id: 'own-string', name: 'Owned string', user: 'A' },
          { _id: 'own-object', name: 'Owned populated', user: { _id: 'A', userName: 'Account A' } },
          { _id: 'collab-string', name: 'Collaboration string', user: 'other', collaborators: ['A'] },
          { _id: 'collab-object', name: 'Collaboration populated', user: { _id: 'other' }, collaborators: [{ _id: 'A' }] },
          { _id: 'read-only', name: 'Saved public read-only', user: { _id: 'other' }, collaborators: [], visibility: 'public', liked: true },
          { _id: 'unidentified', name: 'Missing access metadata' }, null, {},
        ]; });
        await open(page, kind);
        await page.getByRole('menuitem', { name: 'Owned populated', exact: true }).waitFor();
        for (const name of ['Owned string', 'Owned populated', 'Collaboration string', 'Collaboration populated']) {
          assert.equal(await page.getByRole('menuitem', { name, exact: true }).isEnabled(), true, name);
        }
        assert.equal(await page.getByRole('menuitem', { name: 'Saved public read-only', exact: true }).count(), 0);
        assert.equal(await page.getByRole('menuitem', { name: 'Missing access metadata', exact: true }).count(), 0);
        await page.getByRole('menuitem', { name: 'Collaboration populated', exact: true }).click();
        await page.getByRole('menu').waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => qaAddRequests[0].id), 'collab-object');
        assert.equal(await page.evaluate(() => qaEvents.length), 1);
      });
      await scenario(kind + '-read-only-library-keeps-create-and-add', kind, 'normal', async page => {
        await page.evaluate(() => { qaDestinationLists.A = [
          { _id: 'read-only', name: 'Saved public read-only', user: 'other', collaborators: [], visibility: 'public' },
        ]; });
        await open(page, kind);
        await page.waitForFunction(() => !document.querySelector('[role=menu]')?.textContent.includes('Loading playlists'));
        assert.match(await page.getByRole('menu').innerText(), /No editable playlists/);
        assert.equal(await page.getByRole('menuitem', { name: 'Saved public read-only', exact: true }).count(), 0);
        await page.getByRole('menuitem', { name: 'Create playlist', exact: true }).click();
        await page.getByRole('dialog', { name: 'Create playlist', exact: true }).waitFor();
        await page.getByLabel('Name', { exact: true }).fill('Writable mix');
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.waitForFunction(() => qaAddRequests.length === 1);
        assert.equal(await page.evaluate(() => qaAddRequests[0].id), 'created-0');
        assert.equal(await page.evaluate(() => qaEvents.length), 2);
      });
      await scenario(kind + '-permission-revoked-after-open-is-still-denied', kind, 'normal', async page => {
        await page.evaluate(() => { qaDestinationLists.A = [{ _id: 'editable', name: 'Editable at open', user: 'A' }]; });
        await open(page, kind);
        await page.getByRole('menuitem', { name: 'Editable at open', exact: true }).waitFor();
        await page.evaluate(() => { qaDestinationLists.A[0].user = 'other'; });
        await page.getByRole('menuitem', { name: 'Editable at open', exact: true }).click();
        await page.waitForFunction(() => qaAddRequests.length === 1 && qaToasts.length === 1);
        assert.equal(await page.evaluate(() => qaEvents.length), 0, 'Rejected writes never publish a successful playlist update');
        assert.equal(await page.getByRole('menuitem', { name: 'Editable at open', exact: true }).isEnabled(), true);
        assert.equal(await page.evaluate(() => qaToasts.some(message => message.startsWith('Added to'))), false);
      });
    }
    for (const kind of ['add', 'track']) {
      await scenario(kind + '-same-owner-created-playlist', kind, 'empty', async page => {
        await open(page, kind);
        await page.waitForFunction(() => document.querySelector('[role=menu]')?.textContent.includes('No editable playlists'));
        await close(page, kind);
        await page.evaluate(() => { qaListMode = 'normal'; });
        await open(page, kind);
        await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).waitFor({ timeout: 3000 });
        assert.deepEqual(await page.evaluate(() => qaFetchCalls), ['A', 'A']);
      });
      await scenario(kind + '-cached-owner-switch', kind, 'normal', async page => {
        await open(page, kind); await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).waitFor(); await close(page, kind);
        await page.evaluate(() => qaSetOwner('B')); await page.waitForFunction(() => qaStorage.getActiveAccountOwner() === 'account:B');
        await open(page, kind); await page.getByRole('menuitem', { name: 'B private playlist 1', exact: true }).waitFor({ timeout: 3000 });
        assert.equal(await page.getByRole('menu').innerText().then(text => text.includes('A private')), false);
        assert.deepEqual(await page.evaluate(() => qaFetchCalls), ['A', 'B']);
      });
      await scenario(kind + '-open-owner-switch', kind, 'normal', async page => {
        await open(page, kind); await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => { qaSetOwner('B'); return document.body.textContent.includes('A private'); }), false, 'A names must disappear in the B commit');
        await page.getByRole('menu').waitFor({ state: 'detached', timeout: 3000 });
      });
      await scenario(kind + '-privacy-clear-with-stale-session', kind, 'normal', async page => {
        await open(page, kind); await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).waitFor();
        await page.evaluate(() => qaStorage.clearLocalAccountCaches({ notify: true }));
        await page.getByRole('menu').waitFor({ state: 'detached', timeout: 3000 });
        assert.equal(await page.locator('body').innerText().then(text => text.includes('A private')), false);
        await page.evaluate(() => qaSetOwner('B')); await page.waitForFunction(() => qaStorage.getActiveAccountOwner() === 'account:B');
        await open(page, kind); await page.getByRole('menuitem', { name: 'B private playlist 1', exact: true }).waitFor({ timeout: 3000 });
        assert.deepEqual(await page.evaluate(() => qaFetchCalls), ['A', 'B']);
      });
      await scenario(kind + '-delayed-owner-via-guest', kind, 'loading', async page => {
        await open(page, kind); await page.waitForFunction(() => qaPendingLists.length === 1);
        await page.evaluate(() => qaSetOwner(null)); await page.waitForFunction(() => qaStorage.getActiveAccountOwner() === null);
        await page.evaluate(() => { qaSetOwner('B'); qaHoldLists = false; }); await page.waitForFunction(() => qaStorage.getActiveAccountOwner() === 'account:B');
        if (await page.getByRole('menu').count()) await close(page, kind);
        await open(page, kind);
        // Let the deliberately late response reach React and commit before judging which owner's names remain.
        await page.evaluate(async () => { qaResolveLists('A'); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
        await page.getByRole('menuitem', { name: 'B private playlist 1', exact: true }).waitFor({ timeout: 3000 });
        assert.equal(await page.getByRole('menu').innerText().then(text => text.includes('A private')), false);
        assert.deepEqual(await page.evaluate(() => qaFetchCalls), ['A', 'B']);
      });
      await scenario(kind + '-pending-add-owner-switch', kind, 'normal', async page => {
        await open(page, kind); await page.evaluate(() => { qaHoldAdds = true; });
        await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).click(); await page.waitForFunction(() => qaPendingAdds.length === 1);
        await page.evaluate(() => { qaSetOwner('B'); qaHoldAdds = false; }); await page.waitForFunction(() => qaStorage.getActiveAccountOwner() === 'account:B');
        if (await page.getByRole('menu').count()) await close(page, kind);
        await open(page, kind); await page.getByRole('menuitem', { name: 'B private playlist 1', exact: true }).waitFor({ timeout: 3000 });
        await page.evaluate(() => qaResolveAdds('A')); await page.waitForTimeout(50);
        assert.equal(await page.getByRole('menuitem', { name: 'B private playlist 1', exact: true }).isEnabled(), true);
        assert.deepEqual(await page.evaluate(() => qaToasts), []);
        await page.getByRole('menuitem', { name: 'B private playlist 1', exact: true }).click();
        await page.waitForFunction(() => qaToasts.some(value => value.includes('B private')));
        assert.deepEqual(await page.evaluate(() => qaAddCalls), [{ owner: 'A', id: 'A-1' }, { owner: 'B', id: 'B-1' }]);
      });
    }
    for (const kind of ['add', 'track']) {
      await scenario(kind + '-duplicate-confirm-and-cancel', kind, 'normal', async page => {
        await page.evaluate(() => { qaAddMode = 'duplicate'; });
        await open(page, kind);
        await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).click();
        await page.getByRole('dialog', { name: 'Already in playlist', exact: true }).waitFor();
        assert.equal(await page.getByRole('menu').count(), 0);
        assert.deepEqual(await page.evaluate(() => qaToasts), [], 'A duplicate no-op is not an add success');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(await trigger(page, kind).evaluate(node => node === document.activeElement), true, 'Cancel restores the original menu trigger');
        assert.equal(await page.evaluate(() => qaAddRequests.length), 1);
        await open(page, kind); await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).click();
        await page.getByRole('dialog', { name: 'Already in playlist', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Add another copy', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        const requests = await page.evaluate(() => qaAddRequests);
        assert.equal(requests.length, 3);
        assert.equal(requests[1].options.requestId, requests[2].options.requestId, 'Confirmation preserves one add intent');
        assert.equal(requests[1].options.allowDuplicate, false);
        assert.equal(requests[2].options.allowDuplicate, true);
        assert.equal(await page.evaluate(() => qaEvents.length), 1);
        assert.deepEqual(await page.evaluate(() => qaToasts), ['Added to A private playlist 1']);
      });
      await scenario(kind + '-uncertain-add-retry-id', kind, 'normal', async page => {
        await page.evaluate(() => { qaAddMode = 'error'; }); await open(page, kind);
        await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).click();
        await page.waitForFunction(() => qaToasts.length === 1);
        await page.evaluate(() => { qaAddMode = 'normal'; });
        await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).click();
        await page.getByRole('menu').waitFor({ state: 'detached' });
        const requests = await page.evaluate(() => qaAddRequests);
        assert.equal(requests[0].options.requestId, requests[1].options.requestId);
        assert.equal(await page.evaluate(() => qaEvents.length), 1);
      });
      await scenario(kind + '-duplicate-account-clear', kind, 'normal', async page => {
        await page.evaluate(() => { qaAddMode = 'duplicate'; }); await open(page, kind);
        await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).click();
        await page.getByRole('dialog', { name: 'Already in playlist', exact: true }).waitFor();
        await page.evaluate(() => qaSetOwner('B'));
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(await page.locator('body').innerText().then(text => text.includes('A private')), false);
        assert.equal(await page.evaluate(() => qaAddRequests.length), 1);
        assert.deepEqual(await page.evaluate(() => qaEvents), []);
      });
      await scenario(kind + '-create-and-add', kind, 'normal', async page => {
        await open(page, kind); await page.getByRole('menuitem', { name: 'Create playlist', exact: true }).click();
        await page.getByRole('dialog', { name: 'Create playlist', exact: true }).waitFor();
        await page.getByLabel('Name', { exact: true }).fill('New mix');
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.waitForFunction(() => qaAddRequests.length === 1);
        assert.equal(await page.evaluate(() => qaAddRequests[0].id), 'created-0');
        assert.equal(await page.evaluate(() => qaEvents.length), 2, 'Creation and addition publish their own canonical updates');
      });
    }
    for (const kind of ['add', 'track']) {
      await scenario(kind + '-created-playlist-add-failure-retry', kind, 'normal', async page => {
        await page.evaluate(() => { qaAddMode = 'error'; });
        await open(page, kind); await page.getByRole('menuitem', { name: 'Create playlist', exact: true }).click();
        await page.getByRole('dialog', { name: 'Create playlist', exact: true }).waitFor();
        await page.getByLabel('Name', { exact: true }).fill('Retry mix');
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.waitForFunction(() => qaAddRequests.length === 1 && qaToasts.length === 2);
        assert.equal(await page.evaluate(() => qaCreated.length), 1, 'A failed add does not erase the successful creation');
        assert.equal(await page.evaluate(() => qaEvents.length), 1);
        await page.evaluate(() => { qaAddMode = 'normal'; });
        await open(page, kind); await page.getByRole('menuitem', { name: 'Retry mix', exact: true }).click();
        await page.getByRole('menu').waitFor({ state: 'detached' });
        const requests = await page.evaluate(() => qaAddRequests);
        assert.equal(requests.length, 2);
        assert.equal(requests[0].options.requestId, requests[1].options.requestId);
        assert.equal(await page.evaluate(() => qaEvents.length), 2);
      });
      for (const [name, viewport, largeText] of [['narrow', { width: 320, height: 640 }, false], ['landscape', { width: 844, height: 390 }, false], ['large-text', { width: 320, height: 640 }, true]]) {
        await scenario(kind + '-duplicate-layout-' + name, kind, 'normal', async page => {
          await page.evaluate(() => { qaAddMode = 'duplicate'; qaTrack = { ...qaTrack, title: '非常に長い曲のタイトル مرحبا 🎧 '.repeat(12) }; qaRerender(); });
          if (largeText) await page.addStyleTag({ content: 'html{font-size:32px!important}' });
          await open(page, kind); await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'Already in playlist', exact: true }); await dialog.waitFor();
          const bounds = await dialog.evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
          assert(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.top >= 0 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
          const confirm = page.getByRole('button', { name: 'Add another copy', exact: true });
          await confirm.focus();
          await confirm.evaluate(node => node.scrollIntoView({ block: 'nearest' }));
          assert.equal(await confirm.evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height >= 44; }), true, 'Confirm remains reachable with large text and long labels');
          await page.screenshot({ path: path.join(output, kind + '-duplicate-layout-' + name + '.png') });
          await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
          assert.equal(await trigger(page, kind).evaluate(node => node === document.activeElement), true);
        }, viewport);
      }
    }
    await scenario('track-unavailable-reorder-and-remove', 'track', 'normal', async page => {
      await page.evaluate(() => {
        qaTrack = { ...qaTrack, unavailable: true };
        qaMenuProps = { onMoveUp: () => qaMoves.push('up'), onMoveDown: () => qaMoves.push('down'), onRemove: () => qaMoves.push('remove') }; qaRerender();
      });
      await trigger(page, 'track').click();
      assert.equal(await page.getByRole('menuitem', { name: 'Play next', exact: true }).isEnabled(), false);
      assert.equal(await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).isEnabled(), false);
      await page.getByRole('menuitem', { name: 'Move up', exact: true }).click();
      await trigger(page, 'track').click(); await page.getByRole('menuitem', { name: 'Move down', exact: true }).click();
      await trigger(page, 'track').click(); await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => qaMoves), ['up', 'down', 'remove']);
    });
    await scenario('add-normal-keyboard', 'add', 'normal', async page => {
      await open(page, 'add', true); const first = page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }); await first.waitFor();
      assert.equal(await first.evaluate(node => node === document.activeElement), true, 'Opening the menu must move focus inside');
      for (const [key, index] of [['ArrowDown', 2], ['ArrowUp', 1], ['End', 'create'], ['Home', 1]]) {
        await page.keyboard.press(key); assert.equal(await page.getByRole('menuitem', { name: index === 'create' ? 'Create playlist' : `A private playlist ${index}`, exact: true }).evaluate(node => node === document.activeElement), true, key);
      }
      await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({ state: 'detached', timeout: 3000 });
      assert.equal(await trigger(page, 'add').evaluate(node => node === document.activeElement), true);
      await open(page, 'add', true); await page.keyboard.press('Tab');
      await page.getByRole('menu').waitFor({ state: 'detached', timeout: 3000 }); assert.equal(await page.locator('#after').evaluate(node => node === document.activeElement), true, 'Tab moves forward in page order');
      await open(page, 'add', true); await page.keyboard.press('Shift+Tab');
      await page.getByRole('menu').waitFor({ state: 'detached', timeout: 3000 }); assert.equal(await page.locator('#before').evaluate(node => node === document.activeElement), true, 'Shift+Tab moves backward in page order');
      await open(page, 'add', true); await page.keyboard.press('Enter');
      await page.getByRole('menu').waitFor({ state: 'detached', timeout: 3000 });
      assert.equal(await trigger(page, 'add').evaluate(node => node === document.activeElement), true, 'Completing the menu action restores focus');
    });
    for (const mode of ['loading', 'empty', 'error', 'unauthorized']) await scenario('add-keyboard-' + mode, 'add', mode, async page => {
      await open(page, 'add', true); if (mode !== 'loading') await page.waitForFunction(() => !document.body.textContent.includes('Loading playlists…'));
      assert.equal(await page.getByRole('menu').evaluate(node => node.contains(document.activeElement)), true, mode + ' state must own focus');
      for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) await page.keyboard.press(key);
      if (mode === 'error') { await page.keyboard.press('End'); assert.equal(await page.getByText('Try again', { exact: true }).evaluate(node => node === document.activeElement), true); }
      if (mode === 'unauthorized') { await page.keyboard.press('End'); assert.equal(await page.getByRole('menuitem', { name: 'Log in', exact: true }).evaluate(node => node === document.activeElement), true); await page.keyboard.press('Home'); assert.equal(await page.getByRole('menuitem', { name: 'Try again', exact: true }).evaluate(node => node === document.activeElement), true); }
      await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({ state: 'detached', timeout: 3000 });
      assert.equal(await trigger(page, 'add').evaluate(node => node === document.activeElement), true);
    });
    for (const [name, viewport, largeText] of [['narrow', { width: 320, height: 640 }, false], ['landscape', { width: 844, height: 390 }, false], ['large-text', { width: 320, height: 640 }, true], ['large-text-right', { width: 320, height: 640 }, true]]) await scenario('add-layout-' + name, 'add', 'normal', async page => {
      if (largeText) await page.addStyleTag({ content: 'html{font-size:32px!important}' });
      if (name === 'large-text-right') await trigger(page, 'add').evaluate(node => { node.parentElement.style.cssText = 'position:fixed;right:8px;top:40px'; });
      await page.evaluate(() => {
        window.qaFirstMenuFrame = new Promise(resolve => {
          const sample = () => {
            const menu = document.querySelector('[role=menu]');
            if (!menu) return requestAnimationFrame(sample);
            const r = menu.getBoundingClientRect();
            resolve({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight });
          };
          requestAnimationFrame(sample);
        });
      });
      await open(page, 'add'); await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).waitFor();
      const firstFrame = await page.evaluate(() => qaFirstMenuFrame);
      assert(firstFrame.left >= 0 && firstFrame.right <= firstFrame.width + 1 && firstFrame.top >= 0 && firstFrame.bottom <= firstFrame.height + 1, 'First menu frame: ' + JSON.stringify(firstFrame));
      const target = await trigger(page, 'add').evaluate(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }; });
      assert(target.width >= 44 && target.height >= 44, 'The trigger must retain a 44px touch target');
      const bounds = await page.getByRole('menu').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
      assert(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.top >= 0 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
      await page.screenshot({ path: path.join(output, 'add-layout-' + name + '.png') });
      if (largeText) {
        await page.keyboard.press('End');
        await page.waitForFunction(() => {
          const last = [...document.querySelectorAll('[role=menuitem]')].at(-1);
          const r = last.getBoundingClientRect(), menu = last.closest('[role=menu]').getBoundingClientRect();
          return document.activeElement === last && r.top >= menu.top && r.bottom <= menu.bottom && r.height >= 44;
        }, undefined, { timeout: 3000 });
        await page.screenshot({ path: path.join(output, 'add-layout-' + name + '-end.png') });
        await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({ state: 'detached', timeout: 3000 });
        assert.equal(await trigger(page, 'add').evaluate(node => node === document.activeElement), true);
      }
    }, viewport);
    await scenario('add-open-menu-rotation', 'add', 'normal', async page => {
      await open(page, 'add'); await page.getByRole('menuitem', { name: 'A private playlist 1', exact: true }).waitFor();
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => { const r = document.querySelector('[role=menu]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; });
      await page.screenshot({ path: path.join(output, 'add-open-menu-rotation.png') });
    }, { width: 390, height: 844 });
  } finally { await browser.close(); }
  const report = { scope: 'Isolated actual React components and AccountPrivacyBoundary; controlled session/API, no real account or network writes. Chromium only.', baseline: Boolean(process.env.HAYKASA_PLAYLIST_MENU_BASELINE), results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  for (const result of results) console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ': ' + result.error.split('\n')[0] : ''));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
