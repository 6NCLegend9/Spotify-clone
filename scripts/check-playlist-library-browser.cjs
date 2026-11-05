// Actual playlist components, account boundary and event/cache helpers. Session
// and API responses are controlled; no account, provider or deployment writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.resolve(process.env.HAYKASA_PLAYLIST_LIBRARY_EVIDENCE || path.join(root, 'artifacts/playlist-library'));
fs.mkdirSync(output, { recursive: true });
const sources = {}, moduleStyles = [];
const stubs = new Set(['react', 'react-dom', 'next-auth/react', 'next/link', 'next/navigation', 'react-redux', 'lucide-react', 'react-hot-toast', '@/services/playlistApi', '@/services/libraryApi', '@/services/http', '@/components/RecommendationPlaylistCard', '../Layout/AppShell', '@/redux/features/loadingBarSlice']);
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  if (file.endsWith('.css')) {
    let css = fs.readFileSync(file, 'utf8');
    const names = [...new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1]))];
    const prefix = 'qa_' + moduleStyles.length + '_';
    const tokens = Object.fromEntries(names.map(name => [name, prefix + name]));
    css = css.replace(/\.([A-Za-z_][\w-]*)/g, (match, name) => '.' + tokens[name]);
    moduleStyles.push(css);
    sources[key] = { code: 'module.exports = ' + JSON.stringify({ __esModule: true, default: tokens }), dependencies: {} };
    return key;
  }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const dependencies = {}; sources[key] = { code, dependencies };
  for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (stubs.has(spec)) { dependencies[spec] = spec; continue; }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, ...['.js', '.jsx', '.mjs'].map(extension => candidate + extension)].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved && resolved.startsWith(path.join(root, 'src') + path.sep), 'Unexpected test dependency: ' + spec);
    dependencies[spec] = include(resolved);
  }
  return key;
}
const entries = Object.fromEntries(Object.entries({ create: 'components/Sidebar/PlaylistModal.jsx', edit: 'components/EditPlaylistDetails.jsx', like: 'components/LikePlaylistButton.jsx', menu: 'components/PlaylistItemMenu.jsx', sidebar: 'components/Sidebar/Playlists.jsx', library: 'components/Library/LibraryView.jsx', hub: 'components/Layout/CreateHub.jsx', boundary: 'components/AccountPrivacyBoundary.jsx', storage: 'utils/accountStorage.mjs', events: 'utils/playlistEvents.mjs' }).map(([key, file]) => [key, include(path.join(root, 'src', file))]));
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.next/app-build-manifest.json'), 'utf8'));
const css = (manifest.pages['/layout'] || []).filter(name => name.endsWith('.css')).map(name => fs.readFileSync(path.join(root, '.next', name), 'utf8')).join('\n') + moduleStyles.join('\n');
const results = [];
let browser;
async function setup(page, kind, options = {}) {
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1:3000/__playlist-library-qa'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }) : route.abort());
  await page.goto('http://127.0.0.1:3000/__playlist-library-qa');
  await page.addStyleTag({ content: css + '\nbody{background:var(--navy);color:white;font-family:Arial,sans-serif}#fixture{padding:16px}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' });
  for (const file of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js']) await page.addScriptTag({ path: path.join(root, 'node_modules', file) });
  await page.evaluate(({ sources, entries, kind, options }) => {
    const copy = value => JSON.parse(JSON.stringify(value));
    const owned = owner => ({ _id: owner + '-own', name: owner + ' private playlist', user: { _id: owner, userName: owner }, description: '', visibility: 'private', songs: [], items: [], liked: false, likesCount: 0 });
    const saved = { _id: 'public-1', name: 'Saved public playlist', user: { _id: 'other', userName: 'Other creator' }, description: '', visibility: 'public', songs: [], items: [], liked: true, likesCount: 1 };
    window.qaSession = options.guest ? { data: null, status: 'unauthenticated' } : { data: { user: { id: 'A' } }, status: 'authenticated' };
    window.qaCalls = []; window.qaEvents = []; window.qaToasts = []; window.qaRoutes = []; window.qaCallbacks = []; window.qaPending = [];
    window.qaModes = { lists: options.holdLists ? 'hold' : 'normal' };
    window.qaDatabase = { A: [owned('A'), copy(saved)], B: [owned('B')] };
    window.qaPlaylist = options.public ? copy(saved) : owned('A');
    window.qaShown = !['create', 'edit'].includes(kind); window.qaMounted = true; window.qaConfirm = true;
    window.confirm = () => qaConfirm;
    window.addEventListener('heykasa:playlists-changed', event => qaEvents.push(event.detail || null));
    const owner = () => qaSession.data?.user?.id || 'guest';
    const deliver = (kind, args, response) => {
      const request = { kind, owner: owner(), args: copy(args), response: copy(response) };
      qaCalls.push({ kind, owner: request.owner, args: request.args });
      if (qaModes[kind] === 'throw') return Promise.reject(Error('Synthetic network failure'));
      if (qaModes[kind] === 'error') return Promise.resolve({ success: false, message: 'Synthetic rejection' });
      return qaModes[kind] === 'hold' ? new Promise(resolve => qaPending.push({ ...request, resolve })) : Promise.resolve(response);
    };
    const api = {
      getUserPlaylists: () => deliver('lists', [], { success: true, data: { playlists: copy(qaDatabase[owner()] || []) } }),
      createPlaylist: (name, details) => {
        const playlist = { ...owned(owner()), ...details, _id: 'created-' + qaCalls.filter(call => call.kind === 'create').length, name };
        if (!['throw', 'error'].includes(qaModes.create)) qaDatabase[owner()].push(playlist);
        return deliver('create', [name, details], { success: true, data: { playlist } });
      },
      updatePlaylist: (id, action, value) => {
        const previous = qaDatabase[owner()]?.find(item => item._id === id) || qaPlaylist;
        const playlist = { ...previous, ...(action === 'details' ? value : { [action]: value }) };
        if (!['throw', 'error'].includes(qaModes.update)) qaDatabase[owner()] = qaDatabase[owner()].map(item => item._id === id ? playlist : item);
        return deliver('update', [id, action, value], { success: true, data: { playlist } });
      },
      deletePlaylist: id => {
        if (!['throw', 'error'].includes(qaModes.delete)) qaDatabase[owner()] = qaDatabase[owner()].filter(item => item._id !== id);
        return deliver('delete', [id], { success: true });
      },
      togglePlaylistLike: (id, liked) => {
        const previous = qaDatabase[owner()]?.find(item => item._id === id) || qaPlaylist;
        const likesCount = Math.max(0, previous.likesCount + (liked ? 1 : -1));
        const playlist = { ...previous, liked, likesCount };
        if (!['throw', 'error'].includes(qaModes.like)) {
          qaDatabase[owner()] = qaDatabase[owner()].filter(item => item._id !== id);
          if (liked || playlist.user._id === owner()) qaDatabase[owner()].push(playlist);
        }
        return deliver('like', [id, liked], { success: true, data: { liked, likesCount } });
      },
    };
    const toast = message => qaToasts.push(String(message)); toast.success = toast; toast.error = toast;
    const router = { push: href => qaRoutes.push(href) };
    const cache = {};
    function require(name) {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOM;
      if (name === 'next-auth/react') return { useSession: () => qaSession };
      if (name === 'next/navigation') return { useRouter: () => router, usePathname: () => '/library' };
      if (name === 'next/link') return { __esModule: true, default: ({ href, ...props }) => React.createElement('a', { ...props, href }) };
      if (name === 'react-redux') return { useDispatch: () => () => {} };
      if (name === '@/redux/features/loadingBarSlice') return { setIsTyping: value => value };
      if (name === '../Layout/AppShell') return { useNav: () => ({ setShowNav: () => {} }) };
      if (name === 'lucide-react') return new Proxy({}, { get: () => props => React.createElement('svg', { ...props, width: '1em', height: '1em' }) });
      if (name === 'react-hot-toast') return { __esModule: true, default: toast, toast };
      if (name === '@/services/playlistApi') return api;
      if (name === '@/services/http') return { requestJson: async () => ({ data: [], artists: [] }) };
      if (name === '@/services/libraryApi') return {
        getFavouriteLibrary: async () => ({ favourites: [], favouriteAddedAt: {} }),
        getPublicLibrary: () => deliver('public', [], { sections: { featuredPlaylists: [{ id: 'public-featured', title: 'Featured public playlist' }] } }),
        hydrateYouTubeTracks: async () => [],
        validYouTubeIds: values => [...new Set((values || []).filter(value => /^[A-Za-z0-9_-]{11}$/.test(value)))],
      };
      if (name === '@/components/RecommendationPlaylistCard') return { __esModule: true, default: ({ playlist }) => React.createElement('a', { href: '/playlist/' + playlist.id }, playlist.title) };
      if (cache[name]) return cache[name].exports;
      const source = sources[name]; if (!source) throw Error('Unknown module: ' + name);
      const loaded = { exports: {} }; cache[name] = loaded;
      new Function('module', 'exports', 'require', source.code)(loaded, loaded.exports, spec => require(source.dependencies[spec]));
      return loaded.exports;
    }
    const Boundary = require(entries.boundary).default;
    window.qaStorage = require(entries.storage); window.qaEventHelpers = require(entries.events);
    const Component = entries[kind] ? require(entries[kind]).default : null;
    const Sidebar = require(entries.sidebar).default, Library = require(entries.library).default;
    const host = ReactDOM.createRoot(document.getElementById('root'));
    const render = () => ReactDOM.flushSync(() => host.render(React.createElement(React.Fragment, null,
      React.createElement(Boundary), React.createElement('div', { id: 'fixture' },
        React.createElement('button', { id: 'opener', onClick: () => { qaShown = true; qaMounted = true; render(); } }, 'Open fixture'),
        qaMounted && (kind !== 'edit' || qaShown) && (kind === 'collections' ? React.createElement(React.Fragment, null, React.createElement('aside', { 'aria-label': 'Test sidebar' }, React.createElement(Sidebar)), React.createElement(Library))
          : React.createElement(Component, { show: qaShown, setShow: value => { qaShown = value; render(); }, playlist: qaPlaylist,
            onClose: () => { qaShown = false; qaMounted = false; render(); },
            onCreated: value => qaCallbacks.push({ kind: 'created', value }), onSaved: value => qaCallbacks.push({ kind: 'saved', value }),
            onChanged: value => qaCallbacks.push({ kind: 'changed', value }), onDeleted: () => qaCallbacks.push({ kind: 'deleted' }) }))))));
    window.qaRender = render;
    window.qaSetOwner = id => { qaSession = id ? { data: { user: { id } }, status: 'authenticated' } : { data: null, status: 'unauthenticated' }; render(); };
    window.qaResolve = (kind, selectedOwner) => { for (const pending of qaPending.splice(0)) { if (pending.kind === kind && (!selectedOwner || pending.owner === selectedOwner)) pending.resolve(pending.response); else qaPending.push(pending); } };
    window.qaSetMounted = value => { qaMounted = value; render(); };
    render();
    if (!qaShown) { document.getElementById('opener').focus(); qaShown = true; render(); }
  }, { sources, entries, kind, options });
  await page.waitForFunction(guest => qaStorage.getActiveAccountOwner() === (guest ? null : 'account:A'), Boolean(options.guest));
}
async function scenario(name, kind, run, options = {}, viewport = { width: 390, height: 844 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await setup(page, kind, options); await run(page); assert.deepEqual(errors, []);
    results.push({ name, pass: true, viewport, pageErrors: errors });
  } catch (error) {
    results.push({ name, pass: false, viewport, error: String(error.message), pageErrors: errors });
    await page.screenshot({ path: path.join(output, name + '-failure.png') }).catch(() => {});
  } finally { await page.close(); }
}
async function owner(page, id) {
  await page.evaluate(id => qaSetOwner(id), id);
  await page.waitForFunction(id => qaStorage.getActiveAccountOwner() === (id ? 'account:' + id : null), id);
}
async function settle(page) { await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); }); }
async function openMenu(page) { await page.getByRole('button', { name: /^Playlist options for / }).click(); await page.getByRole('menu').waitFor(); }
async function dialogFits(page, buttonName) {
  const dialog = page.getByRole('dialog');
  const submit = page.getByRole('button', { name: buttonName, exact: true });
  await submit.scrollIntoViewIfNeeded();
  const bounds = await dialog.evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
  assert(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.top >= 0 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
  const target = await submit.boundingBox(); assert(target.y >= 0 && target.y + target.height <= bounds.height + 1, 'Submit must be reachable by scrolling');
}
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    await scenario('create-default-double-submit', 'create', async page => {
      assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'My Playlist');
      await page.evaluate(() => { qaModes.create = 'hold'; document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit(); });
      await page.waitForFunction(() => qaPending.length === 1);
      assert.equal(await page.evaluate(() => qaCalls.filter(call => call.kind === 'create').length), 1);
      await page.evaluate(() => qaResolve('create'));
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.deepEqual(await page.evaluate(() => qaCalls.find(call => call.kind === 'create').args), ['My Playlist', { category: '', coverImage: '', autoFill: false }]);
      assert.equal(await page.evaluate(() => qaEvents.length), 1);
      assert.equal(await page.evaluate(() => qaEvents[0].owner), 'account:A');
      assert.equal(await page.evaluate(() => qaRoutes.length), 1);
    });
    await scenario('create-explicit-genre-wins', 'create', async page => {
      await page.getByLabel('Name', { exact: true }).fill('Chill Mix');
      await page.getByText('Genre and song suggestions (optional)', { exact: true }).click();
      await page.getByRole('button', { name: 'Rock', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill('Chill Evenings');
      assert.equal(await page.getByRole('button', { name: 'Rock', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.waitForFunction(() => qaCalls.some(call => call.kind === 'create'));
      assert.equal(await page.evaluate(() => qaCalls.find(call => call.kind === 'create').args[1].category), 'Rock');
    });
    await scenario('create-draft-owner-and-close-reset', 'create', async page => {
      await page.getByLabel('Name', { exact: true }).fill('A private draft');
      await owner(page, 'B'); assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'My Playlist');
      await page.getByLabel('Name', { exact: true }).fill('B private draft');
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Open fixture' }).click();
      assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'My Playlist');
    });
    for (const mode of ['roundtrip', 'privacy-clear', 'unmount']) await scenario('create-late-' + mode, 'create', async page => {
      await page.getByLabel('Name', { exact: true }).fill('A private request');
      await page.evaluate(() => { qaModes.create = 'hold'; });
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.waitForFunction(() => qaPending.length === 1);
      if (mode === 'roundtrip') { await owner(page, 'B'); await owner(page, 'A'); }
      else if (mode === 'privacy-clear') await page.evaluate(() => qaStorage.clearLocalAccountCaches({ notify: true }));
      else await page.evaluate(() => qaSetMounted(false));
      await page.evaluate(() => qaResolve('create', 'A')); await settle(page);
      assert.deepEqual(await page.evaluate(() => ({ events: qaEvents, routes: qaRoutes, toasts: qaToasts, callbacks: qaCallbacks })), { events: [], routes: [], toasts: [], callbacks: [] });
      if (mode !== 'unmount') assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'My Playlist');
    });
    for (const mode of ['error', 'throw']) await scenario('create-' + mode + '-retry', 'create', async page => {
      await page.evaluate(mode => { qaModes.create = mode; }, mode);
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).waitFor();
      await page.waitForFunction(() => document.body.textContent.includes('Playlist not created'));
      assert.equal(await page.getByRole('button', { name: 'Create', exact: true }).isEnabled(), true);
      assert.equal(await page.evaluate(() => qaEvents.length), 0);
      await page.evaluate(() => { qaModes.create = 'normal'; });
      await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
    });
    await scenario('edit-canonical-details', 'edit', async page => {
      await page.getByLabel('Name', { exact: true }).fill('Updated playlist');
      await page.getByLabel('Description', { exact: true }).fill('Description with עברית and 🎵');
      await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
      const value = await page.evaluate(() => qaCalls.find(call => call.kind === 'update').args);
      assert.deepEqual(value, ['A-own', 'details', { name: 'Updated playlist', description: 'Description with עברית and 🎵' }]);
      assert.equal(await page.evaluate(() => qaEvents[0].playlist.name), 'Updated playlist');
      assert.equal(await page.evaluate(() => qaCallbacks[0].kind), 'saved');
    });
    for (const mode of ['roundtrip', 'privacy-clear', 'unmount']) await scenario('edit-late-' + mode, 'edit', async page => {
      await page.evaluate(() => { qaModes.update = 'hold'; });
      await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => qaPending.length === 1);
      if (mode === 'roundtrip') { await owner(page, 'B'); assert.equal(await page.getByRole('dialog').count(), 0); await owner(page, 'A'); }
      else if (mode === 'privacy-clear') await page.evaluate(() => qaStorage.clearLocalAccountCaches({ notify: true }));
      else await page.evaluate(() => qaSetMounted(false));
      await page.evaluate(() => qaResolve('update', 'A')); await settle(page);
      assert.deepEqual(await page.evaluate(() => ({ events: qaEvents, callbacks: qaCallbacks })), { events: [], callbacks: [] });
    });
    for (const kind of ['create', 'edit']) for (const [label, viewport, large] of [['narrow', { width: 320, height: 640 }, false], ['landscape', { width: 844, height: 390 }, false], ['large-text', { width: 320, height: 640 }, true]]) await scenario(kind + '-layout-' + label, kind, async page => {
      if (large) await page.addStyleTag({ content: 'html{font-size:32px!important}' });
      await dialogFits(page, kind === 'create' ? 'Create' : 'Save');
      await page.screenshot({ path: path.join(output, kind + '-layout-' + label + '.png') });
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#opener').evaluate(node => node === document.activeElement), true);
    }, {}, viewport);
    await scenario('like-broadcasts-canonical-change', 'like', async page => {
      await page.getByRole('button', { name: 'Like playlist' }).click(); await page.getByRole('button', { name: 'Unlike playlist' }).waitFor();
      assert.equal(await page.evaluate(() => qaEvents.length), 1); assert.equal(await page.evaluate(() => qaEvents[0].playlist.liked), true);
      const target = await page.getByRole('button', { name: 'Unlike playlist' }).boundingBox(); assert(target.height >= 44);
    });
    await scenario('like-late-roundtrip', 'like', async page => {
      await page.evaluate(() => { qaModes.like = 'hold'; }); await page.getByRole('button', { name: 'Like playlist' }).click();
      await owner(page, 'B'); await owner(page, 'A'); await page.evaluate(() => qaResolve('like', 'A')); await settle(page);
      assert.deepEqual(await page.evaluate(() => ({ events: qaEvents, callbacks: qaCallbacks })), { events: [], callbacks: [] });
      await page.getByRole('button', { name: 'Like playlist' }).waitFor();
    });
    await scenario('menu-owned-delete-confirm', 'menu', async page => {
      await page.evaluate(() => { qaConfirm = false; }); await openMenu(page); await page.getByRole('menuitem', { name: 'Delete playlist' }).click();
      assert.equal(await page.evaluate(() => qaCalls.filter(call => call.kind === 'delete').length), 0);
      await page.evaluate(() => { qaConfirm = true; }); await openMenu(page); await page.getByRole('menuitem', { name: 'Delete playlist' }).click(); await settle(page);
      assert.equal(await page.evaluate(() => qaEvents[0].deletedId), 'A-own'); assert.equal(await page.evaluate(() => qaCallbacks[0].kind), 'deleted');
    });
    await scenario('menu-public-remove-is-not-delete', 'menu', async page => {
      await openMenu(page); assert.equal(await page.getByRole('menuitem', { name: 'Delete playlist' }).count(), 0);
      assert.equal(await page.getByRole('menuitem', { name: 'Edit details' }).count(), 0);
      await page.getByRole('menuitem', { name: 'Remove from Your Library' }).click(); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaCalls.map(call => call.kind)), ['like']);
      assert.equal(await page.evaluate(() => qaEvents[0].playlist.liked), false);
    }, { public: true });
    await scenario('collections-live-create-edit-delete', 'collections', async page => {
      await page.getByRole('heading', { name: 'A private playlist', exact: true }).waitFor();
      await page.evaluate(() => {
        const playlist = { ...qaDatabase.A[0], _id: 'new', name: 'New playlist' };
        qaDatabase.A.push(playlist); qaEventHelpers.notifyPlaylistChanged({ owner: 'account:A', playlist });
      });
      await page.getByRole('heading', { name: 'New playlist', exact: true }).waitFor();
      await page.getByRole('link', { name: 'New playlist Playlist · A', exact: true }).waitFor();
      assert.equal(await page.getByText('No playlists yet', { exact: true }).count(), 0);
      await page.evaluate(() => { const playlist = { ...qaDatabase.A.find(item => item._id === 'new'), name: 'Renamed playlist' }; qaDatabase.A = qaDatabase.A.map(item => item._id === 'new' ? playlist : item); qaEventHelpers.notifyPlaylistChanged({ owner: 'account:A', playlist }); });
      await page.getByRole('heading', { name: 'Renamed playlist', exact: true }).waitFor();
      await page.evaluate(() => { qaDatabase.A = qaDatabase.A.filter(item => item._id !== 'new'); qaEventHelpers.notifyPlaylistChanged({ owner: 'account:A', deletedId: 'new' }); });
      await page.waitForFunction(() => !document.body.textContent.includes('Renamed playlist'));
    }, {}, { width: 1440, height: 1000 });
    await scenario('collections-unsave-updates-liked-filter-and-sidebar', 'collections', async page => {
      await page.getByRole('heading', { name: 'Saved public playlist', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Liked', exact: true }).click();
      await page.getByRole('button', { name: 'Unlike playlist' }).click();
      await page.waitForFunction(() => !document.body.textContent.includes('Saved public playlist'));
      assert.equal(await page.getByRole('heading', { name: 'Liked Songs', exact: true }).count(), 1);
    }, {}, { width: 1440, height: 1000 });
    await scenario('collections-ignore-old-generation-and-delayed-read', 'collections', async page => {
      await page.waitForFunction(() => qaPending.filter(item => item.kind === 'lists').length === 2);
      await page.evaluate(() => { const playlist = { ...qaDatabase.A[0], _id: 'new', name: 'New during read' }; qaDatabase.A.push(playlist); qaEventHelpers.notifyPlaylistChanged({ owner: 'account:A', playlist }); });
      await page.getByRole('link', { name: 'New during read Playlist · A', exact: true }).waitFor();
      await page.waitForFunction(() => qaPending.filter(item => item.kind === 'lists').length === 4);
      await page.evaluate(() => { qaResolve('lists'); }); await settle(page);
      await page.getByRole('heading', { name: 'New during read', exact: true }).waitFor();
      const count = await page.evaluate(() => qaCalls.length);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('heykasa:playlists-changed', { detail: { owner: 'account:A', generation: -1, playlist: { _id: 'wrong', name: 'Old generation' } } })));
      await settle(page); assert.equal(await page.evaluate(() => qaCalls.length), count);
      assert.equal(await page.getByText('Old generation', { exact: true }).count(), 0);
    }, { holdLists: true }, { width: 1440, height: 1000 });
    await scenario('collections-privacy-clear-and-remount', 'collections', async page => {
      await page.getByRole('heading', { name: 'A private playlist', exact: true }).waitFor();
      await page.evaluate(() => qaStorage.clearLocalAccountCaches({ notify: true })); await settle(page);
      assert.equal(await page.getByText('A private playlist', { exact: true }).count(), 0);
      await page.evaluate(() => { qaSetMounted(false); }); await page.evaluate(() => { qaSetMounted(true); }); await settle(page);
      assert.equal(await page.getByText('A private playlist', { exact: true }).count(), 0);
      await owner(page, null); await page.evaluate(() => { qaDatabase.A[0].name = 'A fresh playlist'; }); await owner(page, 'A');
      await page.getByRole('heading', { name: 'A fresh playlist', exact: true }).waitFor();
      assert.equal(await page.getByText('A private playlist', { exact: true }).count(), 0);
    }, {}, { width: 1440, height: 1000 });
    await scenario('library-guest-public-read', 'library', async page => {
      await page.getByRole('link', { name: 'Featured public playlist', exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => qaCalls.map(call => call.kind)), ['public']);
    }, { guest: true });
    await scenario('createhub-owner-change-closes-dialog', 'hub', async page => {
      await page.evaluate(() => window.dispatchEvent(new Event('heykasa:create-playlist')));
      await page.getByRole('dialog', { name: 'Create playlist' }).waitFor(); await page.getByLabel('Name', { exact: true }).fill('A hub draft');
      await owner(page, 'B'); await page.getByRole('dialog').waitFor({ state: 'detached' });
      await page.evaluate(() => window.dispatchEvent(new Event('heykasa:create-playlist')));
      assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'My Playlist');
    });
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ scope: 'Actual React components, account privacy boundary, event and cache helpers. Controlled session/API, no external writes. Chromium only; native audio/device behavior not exercised.', results }, null, 2));
  for (const result of results) console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ': ' + result.error.split('\n')[0] : ''));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
