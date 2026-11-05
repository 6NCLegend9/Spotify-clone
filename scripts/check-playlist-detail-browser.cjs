// Real playlist screen, hydration/services, account boundary and player reducer.
// HTTP/session are isolated fixtures; this does not verify source audio playback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.resolve(process.env.HAYKASA_PLAYLIST_DETAIL_EVIDENCE || path.join(root, 'artifacts/playlist-detail'));
fs.mkdirSync(output, { recursive: true });
const sources = {}, styles = [];
const external = new Set(['react', 'react-dom', 'next-auth/react', 'next/link', 'next/image', '@/assets/HayKasa-logo-removebg.png', 'next/navigation', 'react-redux', '@reduxjs/toolkit', 'lucide-react', 'react-hot-toast', '@/services/http', '@/services/dataAPI', '../Layout/AppShell']);
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  if (file.endsWith('.css')) {
    const css = fs.readFileSync(file, 'utf8'); styles.push(css);
    sources[key] = { code: 'module.exports = ' + JSON.stringify({ __esModule: true, default: Object.fromEntries([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => [match[1], match[1]])) }), dependencies: {} };
    return key;
  }
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics?.length || 0, 0, file);
  const code = compiled.outputText, dependencies = {};
  sources[key] = { code, dependencies };
  for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (external.has(spec)) { dependencies[spec] = spec; continue; }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, ...['.js', '.jsx', '.mjs', '.ts', '.tsx'].map(extension => candidate + extension)].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved && resolved.startsWith(path.join(root, 'src') + path.sep), 'Unexpected dependency: ' + spec);
    dependencies[spec] = include(resolved);
  }
  return key;
}
const entries = Object.fromEntries(Object.entries({ detail: 'components/Library/PlaylistDetail.jsx', mix: 'components/Homepage/MixCard.jsx', recommendation: 'components/RecommendationPlaylistCard.jsx', search: 'components/YouTubeMusicResults.jsx', artist: 'components/ArtistProfile.jsx', player: 'redux/features/playerSlice.js', boundary: 'components/AccountPrivacyBoundary.jsx', storage: 'utils/accountStorage.mjs', events: 'utils/playlistEvents.mjs', items: 'utils/playlistItems.mjs' }).map(([key, file]) => [key, include(path.join(root, 'src', file))]));
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.next/app-build-manifest.json'), 'utf8'));
const css = (manifest.pages['/layout'] || []).filter(name => name.endsWith('.css')).map(name => fs.readFileSync(path.join(root, '.next', name), 'utf8')).join('\n') + styles.join('\n');
const results = [];
let browser;
async function setup(page, options = {}) {
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1:3000/__playlist-detail-qa'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }) : route.abort());
  await page.goto('http://127.0.0.1:3000/__playlist-detail-qa');
  await page.addStyleTag({ content: css + '\nbody{background:var(--navy);color:white;font-family:Arial,sans-serif}button:focus-visible,select:focus-visible{outline:2px solid var(--accent)}' });
  for (const file of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js', '@reduxjs/toolkit/dist/redux-toolkit.umd.js']) await page.addScriptTag({ path: path.join(root, 'node_modules', file) });
  await page.evaluate(({ sources, entries, options }) => {
    const copy = value => JSON.parse(JSON.stringify(value));
    window.qaSession = options.loading ? { data: null, status: 'loading' } : options.guest ? { data: null, status: 'unauthenticated' } : { data: { user: { id: 'A', name: 'Playlist QA' } }, status: 'authenticated' };
    window.qaCalls = []; window.qaPending = []; window.qaToasts = []; window.qaRoutes = [];
    window.qaQuery = 'QA collection'; window.qaCollectionId = 'mixA'; window.qaSearchParams = 'type=playlist';
    window.qaModes = { metadata: options.metadata || 'normal', read: options.read || 'normal', discovery: options.discovery || 'normal', mixA: 'hold', mixB: options.holdMixB ? 'hold' : 'normal' };
    const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'aaaaaaaaaaa', 'ccccccccccc'];
    window.qaPlaylist = { _id: '507f1f77bcf86cd799439012', name: 'QA playlist', description: 'Songs for the day', visibility: options.guest ? 'public' : 'private', user: { _id: options.guest ? 'other' : 'A', userName: 'Playlist QA' }, collaborators: options.collaborator ? [{ _id: 'B' }] : [], songs: options.empty ? [] : ids, items: options.empty ? [] : ids.map((id, index) => ({ id, entryId: 'entry-' + index, addedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString() })), revision: 0, songDurations: { aaaaaaaaaaa: 180, bbbbbbbbbbb: 240, ccccccccccc: 120 }, liked: false, smartShuffle: Boolean(options.smart) };
    window.qaMetadata = { aaaaaaaaaaa: { id: 'aaaaaaaaaaa', title: 'Alpha song', channel: 'Zulu artist', duration: 180 }, bbbbbbbbbbb: { id: 'bbbbbbbbbbb', title: 'Bravo song', channel: 'Echo artist', duration: 240 }, ccccccccccc: { id: 'ccccccccccc', title: 'Charlie song', channel: 'Delta artist', duration: 120 } };
    const deliver = (kind, response) => {
      const request = { kind, owner: qaSession.data?.user?.id || 'guest', response: copy(response) };
      if (qaModes[kind] === 'error') return Promise.reject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
      return qaModes[kind] === 'hold' ? new Promise((resolve, reject) => qaPending.push({ ...request, resolve, reject })) : Promise.resolve(response);
    };
    const requestJson = (url, config = {}) => {
      const parsed = new URL(url, location.origin), body = config.body || {};
      qaCalls.push({ url, method: config.method || 'GET', body: copy(body), owner: qaSession.data?.user?.id || 'guest' });
      if (parsed.pathname === '/api/youtube-videos') return deliver('metadata', { tracks: parsed.searchParams.getAll('id').flatMap(id => qaMetadata[id] ? [copy(qaMetadata[id])] : []) });
      if (parsed.pathname === '/api/recommendations') return deliver('discovery', { sections: { trending: [{ id: 'ddddddddddd', title: 'Discovery song', duration: 200 }] } });
      if (parsed.pathname === '/api/youtube-playlist') return deliver(parsed.searchParams.get('id'), { tracks: [copy(qaMetadata[parsed.searchParams.get('id') === 'mixA' ? 'aaaaaaaaaaa' : 'bbbbbbbbbbb'])] });
      if (parsed.pathname === '/api/youtube-search') return Promise.resolve({ results: [{ id: 'mixA', title: 'Mix A', channel: 'QA artist' }, { id: 'mixB', title: 'Mix B', channel: 'QA artist' }] });
      if (parsed.pathname === '/api/youtube-channel') return Promise.resolve({ artist: { id: parsed.searchParams.get('id'), title: 'QA artist' }, tracks: [copy(qaMetadata.aaaaaaaaaaa)] });
      if (parsed.pathname === '/api/artist-sections') return Promise.resolve({ artist: { id: parsed.searchParams.get('id') }, playlists: [{ id: 'mixA', title: 'Mix A' }, { id: 'mixB', title: 'Mix B' }] });
      if (parsed.pathname === '/api/channel-rabbit-hole') return Promise.resolve({ tracks: [] });
      if (parsed.pathname === '/api/followedArtists') return Promise.resolve({ success: true, data: [], artists: [] });
      if (parsed.pathname === '/api/favourite') return deliver('read', { data: { favourites: ['aaaaaaaaaaa', 'bbbbbbbbbbb'], favouriteDurations: qaPlaylist.songDurations } });
      if (parsed.pathname === '/api/userPlaylists/songs') {
        if (!config.method || config.method === 'GET') return deliver('read', { success: true, data: copy(qaPlaylist) });
        if (body.expectedRevision !== qaPlaylist.revision || qaModes.mutation === 'conflict') return Promise.reject({ code: 'CONFLICT', status: 409 });
        if (config.method === 'DELETE') {
          qaPlaylist.items = qaPlaylist.items.filter(item => item.entryId !== body.entryId);
        } else if (config.method === 'PATCH') {
          const selected = qaPlaylist.items.find(item => item.entryId === body.entryId);
          qaPlaylist.items = qaPlaylist.items.filter(item => item.entryId !== body.entryId);
          const index = body.beforeEntryId === null ? qaPlaylist.items.length : qaPlaylist.items.findIndex(item => item.entryId === body.beforeEntryId);
          qaPlaylist.items.splice(index, 0, selected);
        }
        qaPlaylist.songs = qaPlaylist.items.map(item => item.id); qaPlaylist.revision++;
        return deliver('mutation', { success: true, data: config.method === 'DELETE' ? copy(qaPlaylist.songs) : { playlist: copy(qaPlaylist) }, playlist: copy(qaPlaylist) });
      }
      if (parsed.pathname === '/api/userPlaylists') return Promise.resolve({ success: true, data: { playlists: [copy(qaPlaylist)] } });
      throw new Error('Unexpected HTTP fixture ' + url);
    };
    const toast = message => qaToasts.push(String(message)); toast.success = toast; toast.error = toast;
    const router = { push: href => qaRoutes.push(href), replace: href => qaRoutes.push(href) };
    const cache = {}; let store;
    function require(name) {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOM;
      if (name === '@reduxjs/toolkit') return RTK;
      if (name === 'next-auth/react') return { useSession: () => qaSession };
      if (name === 'next/navigation') return { useRouter: () => router, usePathname: () => '/search/' + qaQuery, useSearchParams: () => new URLSearchParams(qaSearchParams) };
      if (name === 'next/link') return { __esModule: true, default: ({ href, prefetch, ...props }) => React.createElement('a', { ...props, href }) };
      if (name === 'react-redux') return { useDispatch: () => store.dispatch, useStore: () => store, useSelector: select => React.useSyncExternalStore(store.subscribe, () => select(store.getState())) };
      if (name === 'next/image') return { __esModule: true, default: ({ unoptimized, ...props }) => React.createElement('img', props) };
      if (name === '@/assets/HayKasa-logo-removebg.png') return { __esModule: true, default: '' };
      if (name === '../Layout/AppShell') return { useNav: () => ({ setShowNav: () => {} }) };
      if (name === 'lucide-react') return new Proxy({}, { get: () => props => React.createElement('svg', { ...props, width: '1em', height: '1em' }) });
      if (name === 'react-hot-toast') return { __esModule: true, default: toast, toast };
      if (name === '@/services/http') return { requestJson };
      if (name === '@/services/dataAPI') return { getFavourite: async () => ['aaaaaaaaaaa', 'bbbbbbbbbbb'], addFavourite: async () => ({ success: true, data: { favourites: ['bbbbbbbbbbb'] } }) };
      if (cache[name]) return cache[name].exports;
      const source = sources[name]; if (!source) throw new Error('Missing fixture module ' + name);
      const module = { exports: {} }; cache[name] = module;
      new Function('require', 'module', 'exports', source.code)(spec => require(source.dependencies[spec]), module, module.exports);
      return module.exports;
    }
    const player = require(entries.player); window.qaActions = player;
    store = RTK.configureStore({ reducer: (state, action) => {
      if (action.type === 'qa/patch-player') return { ...state, player: { ...state.player, ...action.payload } };
      return { player: player.default(state?.player, action), loadingBar: { isTyping: false }, settings: { privateSession: true, explicitContent: false } };
    } });
    window.qaStore = store; window.qaStorage = require(entries.storage); window.qaEvents = require(entries.events);
    const Detail = require(entries.detail).default, Mix = require(entries.mix).default, Boundary = require(entries.boundary).default;
    const Recommendation = require(entries.recommendation).default, Search = require(entries.search).default, Artist = require(entries.artist).default;
    const host = ReactDOM.createRoot(document.getElementById('root'));
    window.qaMounted = true;
    const render = () => ReactDOM.flushSync(() => host.render(React.createElement(React.Fragment, null, React.createElement(Boundary), qaMounted && (options.surface === 'recommendation'
      ? React.createElement('div', { style: { width: 'min(180px,100%)' } }, React.createElement(Recommendation, { playlist: { id: qaCollectionId, title: 'Mix A', channel: 'QA artist' } }))
      : options.surface === 'search' ? React.createElement(Search, { query: qaQuery })
      : options.surface === 'artist' ? React.createElement(Artist, { artistId: qaCollectionId === 'mixA' ? 'UCabcdefghijklmnopqrstuv' : 'UCzyxwvutsrqponmlkjihgfed', initialName: 'QA artist' })
      : options.mix
      ? React.createElement(React.Fragment, null, React.createElement(Mix, { mix: { id: 'mixA', playlistId: 'mixA', title: 'Mix A' } }), React.createElement(Mix, { mix: { id: 'mixB', playlistId: 'mixB', title: 'Mix B' } }))
      : React.createElement(Detail, { kind: options.liked ? 'liked' : 'playlist', playlistId: qaPlaylist._id })))));
    window.qaSetOwner = id => { qaSession = id ? { data: { user: { id } }, status: 'authenticated' } : { data: null, status: 'unauthenticated' }; render(); };
    window.qaResolve = (kind, response) => { const selected = qaPending.filter(item => item.kind === kind); qaPending = qaPending.filter(item => item.kind !== kind); for (const item of selected) item.resolve(response || item.response); };
    window.qaRender = render; render();
  }, { sources, entries, options });
}
const rows = page => page.locator('.playlist-track-row');
const row = (page, id) => page.locator(`[data-playlist-entry="${id}"]`);
async function ready(page) { await page.getByRole('button', { name: 'Play artwork for Alpha song', exact: true }).first().waitFor(); }
async function state(page) { return page.evaluate(() => qaStore.getState().player); }
async function order(page) { return rows(page).evaluateAll(nodes => nodes.map(node => node.dataset.playlistEntry)); }
async function settle(page) { await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); }); }
async function scenario(name, run, options = {}, viewport = { width: 390, height: 844 }) {
  const page = await browser.newPage({ viewport, hasTouch: viewport.width < 640 }); page.setDefaultTimeout(6000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try { await setup(page, options); await run(page); await settle(page); assert.deepEqual(errors, []); results.push({ name, pass: true, viewport }); }
  catch (error) { results.push({ name, pass: false, error: String(error.stack || error), pageErrors: errors }); await page.screenshot({ path: path.join(output, name + '-failure.png') }).catch(() => {}); }
  finally { await page.close(); }
}
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    await scenario('home-mix-slow-request-yields-to-newer-play', async page => {
      await page.getByRole('button', { name: 'Play Mix A' }).click();
      await page.getByRole('button', { name: 'Play Mix B' }).click();
      await page.waitForFunction(() => qaStore.getState().player.youtubeVideo?.id === 'bbbbbbbbbbb');
      await page.evaluate(() => qaResolve('mixA')); await settle(page);
      assert.equal((await state(page)).youtubeVideo.id, 'bbbbbbbbbbb');
    }, { mix: true });
    await scenario('home-mix-delayed-play-respects-pause-even-when-already-paused', async page => {
      await page.getByRole('button', { name: 'Play Mix A' }).click();
      await page.evaluate(() => { qaStore.dispatch(qaActions.playPause(false)); qaResolve('mixA'); }); await settle(page);
      assert.equal((await state(page)).isPlaying, false); assert.equal((await state(page)).youtubeVideo, null);
    }, { mix: true });
    await scenario('home-mix-provider-status-is-not-a-new-playback-intent', async page => {
      await page.getByRole('button', { name: 'Play Mix A' }).click();
      await page.evaluate(() => {
        qaStore.dispatch(qaActions.playPause(false, { intent: false }));
        qaStore.dispatch(qaActions.playPause(true, { intent: false }));
        qaResolve('mixA');
      });
      await page.waitForFunction(() => qaStore.getState().player.youtubeVideo?.id === 'aaaaaaaaaaa');
    }, { mix: true });
    await scenario('home-mix-latest-pending-intent-wins-and-position-ticks-dont-cancel', async page => {
      await page.getByRole('button', { name: 'Play Mix A' }).click();
      await page.getByRole('button', { name: 'Play Mix B' }).click();
      await page.evaluate(() => qaResolve('mixA')); await settle(page); assert.equal((await state(page)).youtubeVideo, null);
      await page.evaluate(() => { qaStore.dispatch(qaActions.setPlaybackPosition({ id: 'aaaaaaaaaaa', position: 30 })); qaResolve('mixB'); });
      await page.waitForFunction(() => qaStore.getState().player.youtubeVideo?.id === 'bbbbbbbbbbb');
    }, { mix: true, holdMixB: true });
    for (const change of ['owner', 'clear', 'unmount']) await scenario('home-mix-stale-' + change, async page => {
      await page.getByRole('button', { name: 'Play Mix A' }).click();
      await page.evaluate(change => {
        if (change === 'owner') qaSetOwner('B');
        else if (change === 'clear') qaStorage.clearLocalAccountCaches({ notify: true });
        else { qaMounted = false; qaRender(); }
        qaResolve('mixA');
      }, change); await settle(page); assert.equal((await state(page)).youtubeVideo, null); assert.deepEqual(await page.evaluate(() => qaToasts), []);
    }, { mix: true });
    await scenario('home-mix-current-request-starts-and-error-allows-retry', async page => {
      await page.evaluate(() => { qaModes.mixA = 'error'; }); await page.getByRole('button', { name: 'Play Mix A' }).click();
      await page.waitForFunction(() => qaToasts.length === 1);
      await page.evaluate(() => { qaModes.mixA = 'hold'; }); await page.getByRole('button', { name: 'Play Mix A' }).click();
      await page.evaluate(() => qaResolve('mixA')); await page.waitForFunction(() => qaStore.getState().player.youtubeVideo?.id === 'aaaaaaaaaaa');
      assert.equal((await state(page)).isPlaying, true);
    }, { mix: true });
    for (const surface of ['recommendation', 'search', 'artist']) await scenario(surface + '-delayed-collection-respects-pause', async page => {
      const play = page.getByRole('button', { name: surface === 'search' ? 'Play playlist Mix A' : 'Play Mix A', exact: true });
      // Invoke the actual handler separately from the card overlap regression.
      await play.waitFor(); await play.evaluate(button => button.click());
      await page.waitForFunction(() => qaPending.some(item => item.kind === 'mixA'));
      await page.evaluate(() => { qaStore.dispatch(qaActions.playPause(false)); qaResolve('mixA'); }); await settle(page);
      assert.equal((await state(page)).isPlaying, false); assert.equal((await state(page)).youtubeVideo, null);
    }, { surface, guest: true }, surface === 'search' ? { width: 1440, height: 1000 } : undefined);
    for (const surface of ['recommendation', 'search', 'artist']) {
      const name = surface === 'search' ? 'Play playlist Mix A' : 'Play Mix A';
      const viewport = surface === 'search' ? { width: 1440, height: 1000 } : undefined;
      for (const change of ['new-play', 'owner', 'clear', 'unmount', 'identity']) await scenario(surface + '-pending-collection-yields-to-' + change, async page => {
        await page.getByRole('button', { name, exact: true }).waitFor();
        await page.getByRole('button', { name, exact: true }).evaluate(button => button.click());
        await page.waitForFunction(() => qaPending.some(item => item.kind === 'mixA'));
        await page.evaluate(change => {
          if (change === 'new-play') {
            const track = qaMetadata.bbbbbbbbbbb;
            qaStore.dispatch(qaActions.startYoutubePlayback({ track, queue: [track], queueMode: 'collection' }));
          } else if (change === 'owner') qaSetOwner('B');
          else if (change === 'clear') qaStorage.clearLocalAccountCaches({ notify: true });
          else if (change === 'unmount') { qaMounted = false; qaRender(); }
          else { qaQuery = 'New query'; qaCollectionId = 'mixB'; qaRender(); }
          qaResolve('mixA');
        }, change);
        await settle(page);
        assert.equal((await state(page)).youtubeVideo?.id || null, change === 'new-play' ? 'bbbbbbbbbbb' : null);
        assert.deepEqual(await page.evaluate(() => qaToasts), []);
      }, { surface }, viewport);
      await scenario(surface + '-current-collection-error-can-retry-and-play', async page => {
        await page.evaluate(() => { qaModes.mixA = 'error'; });
        const play = page.getByRole('button', { name, exact: true });
        await play.waitFor(); await play.evaluate(button => button.click());
        await page.waitForFunction(() => qaToasts.length === 1);
        await page.waitForFunction(name => ![...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name)?.disabled, name);
        await page.evaluate(() => { qaModes.mixA = 'hold'; });
        await play.evaluate(button => button.click());
        await page.waitForFunction(() => qaPending.some(item => item.kind === 'mixA'));
        await page.evaluate(() => qaResolve('mixA'));
        await page.waitForFunction(() => qaStore.getState().player.youtubeVideo?.id === 'aaaaaaaaaaa');
        assert.equal((await state(page)).isPlaying, true);
      }, { surface, guest: true }, viewport);
    }
    await scenario('recommendation-menu-open-playlist-navigates', async page => {
      await page.getByRole('button', { name: 'Playlist options for Mix A' }).click();
      await page.getByRole('menuitem', { name: 'Open playlist', exact: true }).focus(); await page.keyboard.press('Enter'); await settle(page);
      assert.equal((await page.evaluate(() => qaRoutes)).length, 1);
      assert((await page.evaluate(() => qaRoutes[0])).startsWith('/youtube-playlist/mixA'));
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.equal((await state(page)).youtubeVideo, null);
    }, { surface: 'recommendation', guest: true });
    await scenario('recommendation-play-and-menu-do-not-overlap', async page => {
      const play = await page.getByRole('button', { name: 'Play Mix A', exact: true }).boundingBox();
      const menu = await page.getByRole('button', { name: 'Playlist options for Mix A' }).boundingBox();
      assert(play && menu);
      assert(play.width >= 44 && play.height >= 44 && menu.width >= 44 && menu.height >= 44);
      assert(play.x + play.width <= menu.x || menu.x + menu.width <= play.x || play.y + play.height <= menu.y || menu.y + menu.height <= play.y, 'Play and menu have separate hit areas');
      await page.getByRole('button', { name: 'Play Mix A', exact: true }).click();
      assert.equal(await page.evaluate(() => qaPending.filter(item => item.kind === 'mixA').length), 1, 'Actual pointer reaches Play');
    }, { surface: 'recommendation', guest: true });
    await scenario('duplicates-hydrate-once-with-date-and-total', async page => {
      await ready(page); assert.deepEqual(await order(page), ['entry-0', 'entry-1', 'entry-2', 'entry-3']);
      assert.equal(await row(page, 'entry-2').locator('[data-track-duration]').innerText(), '3:00');
      assert((await page.locator('.collection-hero').innerText()).includes('4 songs, 12 min'));
      const ids = await page.evaluate(() => qaCalls.filter(call => call.url.startsWith('/api/youtube-videos')).flatMap(call => new URL(call.url, location.origin).searchParams.getAll('id')));
      assert.deepEqual(ids, ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
    });
    await scenario('second-copy-and-hero-pause-resume-preserve-position', async page => {
      await ready(page); await row(page, 'entry-2').getByRole('button', { name: 'Play artwork for Alpha song' }).click();
      assert.equal((await state(page)).currentIndex, 2); assert.equal((await state(page)).youtubeVideo.playlistEntryId, 'entry-2');
      assert.equal(await page.locator('.playlist-track-row[data-active="true"]').count(), 1);
      await page.evaluate(() => qaStore.dispatch({ type: 'qa/patch-player', payload: { position: 73 } }));
      const original = (await state(page)).youtubeVideo.queueEntryId;
      await page.getByRole('button', { name: 'Pause QA playlist', exact: true }).click();
      assert.equal((await state(page)).isPlaying, false); assert.equal((await state(page)).position, 73);
      await page.getByRole('button', { name: 'Play QA playlist', exact: true }).click();
      assert.equal((await state(page)).youtubeVideo.queueEntryId, original); assert.equal((await state(page)).position, 73);
      await row(page, 'entry-2').getByRole('button', { name: 'Pause artwork for Alpha song' }).click();
      assert.equal((await state(page)).isPlaying, false);
    });
    await scenario('normal-shuffle-and-delayed-discovery-respect-pause', async page => {
      await ready(page); await page.getByRole('button', { name: 'Play QA playlist', exact: true }).click();
      await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
      let current = await state(page); assert.equal(current.shuffleEnabled, true); assert.equal(current.youtubeQueue.length, 4);
      await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
      assert.deepEqual((await state(page)).youtubeQueue.map(track => track.playlistEntryId), ['entry-0', 'entry-1', 'entry-2', 'entry-3']);
      await page.getByRole('button', { name: 'Pause QA playlist', exact: true }).click();
      await page.evaluate(() => qaResolve('discovery')); await settle(page);
      current = await state(page); assert.equal(current.isPlaying, false); assert.equal(current.youtubeQueue.length, 4);
    }, { smart: true, discovery: 'hold' });
    await scenario('shuffle-start-selects-from-whole-playlist-and-keeps-all-occurrences', async page => {
      await ready(page); await page.evaluate(() => { Math.random = () => 0.5; });
      await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
      await page.getByRole('button', { name: 'Play QA playlist', exact: true }).click();
      const current = await state(page);
      assert.equal(current.youtubeVideo.playlistEntryId, 'entry-2'); assert.equal(current.currentIndex, 0);
      assert.deepEqual(current.youtubeQueue.map(track => track.playlistEntryId).sort(), ['entry-0', 'entry-1', 'entry-2', 'entry-3']);
      await row(page, 'entry-1').getByRole('button', { name: 'Play artwork for Bravo song' }).click();
      assert.equal((await state(page)).currentIndex, 0); assert.equal((await state(page)).youtubeQueue.length, 4);
    });
    await scenario('sorting-and-filtering-dont-write-custom-order', async page => {
      await ready(page); await page.getByLabel('Sort playlist', { exact: true }).selectOption('artist');
      assert.deepEqual(await order(page), ['entry-3', 'entry-1', 'entry-0', 'entry-2']);
      await page.getByRole('button', { name: 'Search in playlist', exact: true }).click(); await page.getByPlaceholder('Search by title or artist').fill('Alpha');
      await page.waitForFunction(() => document.querySelectorAll('.playlist-track-row').length === 2);
      await row(page, 'entry-2').getByRole('button', { name: 'Play artwork for Alpha song' }).click();
      assert.equal((await state(page)).youtubeVideo.playlistEntryId, 'entry-2'); assert.equal((await state(page)).youtubeQueue.length, 4);
      await page.getByRole('button', { name: 'Clear search', exact: true }).click(); await page.getByLabel('Sort playlist', { exact: true }).selectOption('custom');
      // useDeferredValue may commit the cleared filter after the input/select
      // events. Wait for the observable result, never a fixed delay.
      await page.waitForFunction(() => document.querySelectorAll('.playlist-track-row').length === 4);
      assert.deepEqual(await order(page), ['entry-0', 'entry-1', 'entry-2', 'entry-3']);
      assert.equal(await page.evaluate(() => qaCalls.filter(call => ['PATCH', 'DELETE', 'POST'].includes(call.method)).length), 0);
    });
    await scenario('remove-exact-copy-and-canonical-event', async page => {
      await ready(page); await row(page, 'entry-2').getByRole('button', { name: 'Queue options' }).click();
      await page.getByRole('menuitem', { name: 'Remove from playlist', exact: true }).click();
      await row(page, 'entry-2').waitFor({ state: 'detached' }); assert.deepEqual(await order(page), ['entry-0', 'entry-1', 'entry-3']);
      const call = await page.evaluate(() => qaCalls.find(call => call.method === 'DELETE'));
      assert.deepEqual(call.body, { playlistID: '507f1f77bcf86cd799439012', song: 'aaaaaaaaaaa', entryId: 'entry-2', expectedRevision: 0 });
    });
    await scenario('play-next-on-saved-duplicate-and-current-row-is-effective', async page => {
      await ready(page); await row(page, 'entry-0').getByRole('button', { name: 'Play artwork for Alpha song' }).click();
      const currentId = (await state(page)).youtubeVideo.queueEntryId;
      await row(page, 'entry-2').getByRole('button', { name: 'Queue options' }).click(); await page.getByRole('menuitem', { name: 'Play next', exact: true }).click();
      assert.equal((await state(page)).youtubeQueue[1].playlistEntryId, 'entry-2');
      await row(page, 'entry-0').getByRole('button', { name: 'Queue options' }).click(); await page.getByRole('menuitem', { name: 'Play next', exact: true }).click();
      const result = await state(page); assert.equal(result.youtubeQueue[1].id, 'aaaaaaaaaaa');
      assert.notEqual(result.youtubeQueue[1].queueEntryId, currentId); assert.equal(result.youtubeVideo.queueEntryId, currentId);
      assert.equal(result.youtubeQueue.length, 5);
    });
    await scenario('keyboard-touch-reorder-saves-entry-and-revision', async page => {
      await ready(page); await row(page, 'entry-2').getByRole('button', { name: 'Queue options' }).click();
      await page.getByRole('menuitem', { name: 'Move up', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('.playlist-track-row')[1]?.dataset.playlistEntry === 'entry-2');
      assert.deepEqual(await order(page), ['entry-0', 'entry-2', 'entry-1', 'entry-3']);
      await row(page, 'entry-2').getByRole('button', { name: 'Queue options' }).click(); await page.getByRole('menuitem', { name: 'Move down', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.playlist-track-row')[1]?.dataset.playlistEntry === 'entry-1');
      assert.deepEqual(await page.evaluate(() => qaCalls.filter(call => call.method === 'PATCH').map(call => call.body.expectedRevision)), [0, 1]);
    });
    await scenario('desktop-drag-reorders-without-playing-and-ignores-external-drops', async page => {
      await ready(page);
      await row(page, 'entry-2').dragTo(row(page, 'entry-0'));
      await page.waitForFunction(() => qaPlaylist.items[0].entryId === 'entry-2');
      assert.equal((await state(page)).isPlaying, false);
      const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData('text/plain', 'external-file-or-text'); return data; });
      await row(page, 'entry-0').dispatchEvent('drop', { dataTransfer: transfer });
      assert.equal(await page.evaluate(() => qaCalls.filter(call => call.method === 'PATCH').length), 1);
      await transfer.dispose();
      await row(page, 'entry-0').dragTo(row(page, 'entry-3'), { targetPosition: { x: 10, y: 62 } });
      await page.waitForFunction(() => qaPlaylist.items.at(-1).entryId === 'entry-0');
      assert.equal(await page.evaluate(() => qaCalls.filter(call => call.method === 'PATCH').at(-1).body.beforeEntryId), null);
    }, {}, { width: 1440, height: 1000 });
    await scenario('reorder-conflict-keeps-concurrent-song-and-reloads', async page => {
      await ready(page); await page.evaluate(() => {
        qaPlaylist.items.push({ id: 'bbbbbbbbbbb', entryId: 'concurrent-entry', addedAt: new Date().toISOString() });
        qaPlaylist.songs.push('bbbbbbbbbbb'); qaPlaylist.revision++;
      });
      await row(page, 'entry-2').getByRole('button', { name: 'Queue options' }).click(); await page.getByRole('menuitem', { name: 'Move up', exact: true }).click();
      await row(page, 'concurrent-entry').waitFor(); assert.equal(await rows(page).count(), 5);
      assert.equal(await page.evaluate(() => qaPlaylist.items[2].entryId), 'entry-2');
      assert((await page.locator('main').innerText()).includes('Order not saved'));
    });
    await scenario('metadata-error-preserves-saved-rows-and-retry', async page => {
      await page.getByText('Your saved songs are still here.', { exact: false }).waitFor(); assert.equal(await rows(page).count(), 4);
      assert((await page.locator('.collection-hero').innerText()).includes('4 songs, 12 min'));
      await page.evaluate(() => { qaModes.metadata = 'normal'; }); await page.getByRole('button', { name: /try again/i }).click(); await ready(page);
      assert.deepEqual(await order(page), ['entry-0', 'entry-1', 'entry-2', 'entry-3']);
    }, { metadata: 'error' });
    await scenario('unavailable-song-remains-removable-and-movable', async page => {
      await ready(page); await page.evaluate(() => {
        qaMetadata.ccccccccccc = null; sessionStorage.clear();
        qaEvents.notifyPlaylistChanged({ owner: 'account:A', playlist: { ...qaPlaylist, name: 'Updated QA playlist' } });
      });
      await row(page, 'entry-3').getByText('Unavailable song', { exact: true }).waitFor();
      await row(page, 'entry-3').getByRole('button', { name: 'Queue options' }).click();
      assert.equal(await page.getByRole('menuitem', { name: 'Play next', exact: true }).isDisabled(), true);
      await page.getByRole('menuitem', { name: 'Move up', exact: true }).click(); await page.waitForFunction(() => qaPlaylist.items[2].entryId === 'entry-3');
    });
    await scenario('late-metadata-and-private-account-roundtrip-are-isolated', async page => {
      await page.waitForFunction(() => qaPending.some(item => item.kind === 'metadata'));
      await page.evaluate(() => { qaModes.metadata = 'normal'; qaPlaylist = { ...qaPlaylist, name: 'B playlist', user: { _id: 'B' }, items: [], songs: [] }; qaSetOwner('B'); });
      await page.getByRole('heading', { name: 'B playlist', exact: true }).waitFor();
      await page.evaluate(() => qaResolve('metadata')); await settle(page); assert.equal(await rows(page).count(), 0);
      assert.equal(await page.getByText('Alpha song', { exact: true }).count(), 0);
      await page.evaluate(() => qaStorage.clearLocalAccountCaches({ notify: true })); await settle(page);
      assert.equal(await page.getByRole('heading', { name: 'B playlist', exact: true }).count(), 0);
    }, { metadata: 'hold' });
    await scenario('old-read-cannot-overwrite-new-playlist-event', async page => {
      await page.waitForFunction(() => qaPending.some(item => item.kind === 'read'));
      await page.evaluate(() => { qaPlaylist = { ...qaPlaylist, name: 'Fresh playlist', revision: 2 }; qaEvents.notifyPlaylistChanged({ owner: 'account:A', playlist: qaPlaylist }); qaResolve('read'); });
      await page.getByRole('heading', { name: 'Fresh playlist', exact: true }).waitFor(); await ready(page);
      assert.equal(await page.getByRole('heading', { name: 'QA playlist', exact: true }).count(), 0);
    }, { read: 'hold' });
    await scenario('guest-public-read-play-and-no-edit', async page => {
      await ready(page); await page.getByRole('button', { name: 'Play QA playlist', exact: true }).click();
      assert.equal((await state(page)).isPlaying, true);
      assert.equal(await page.getByRole('button', { name: 'Remove Alpha song from playlist' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Playlist options', exact: true }).count(), 0);
    }, { guest: true });
    await scenario('guest-session-resolution-loads-details-without-resetting-early-play', async page => {
      await page.evaluate(() => {
        window.qaDestructiveClears = 0;
        window.addEventListener('heykasa:account-data-cleared', () => qaDestructiveClears++);
        const track = qaMetadata.bbbbbbbbbbb;
        qaStore.dispatch(qaActions.startYoutubePlayback({ queue: [track], track, queueMode: 'radio' }));
        qaSetOwner(null);
      });
      await ready(page);
      assert.equal((await state(page)).youtubeVideo.id, 'bbbbbbbbbbb');
      assert.equal((await state(page)).isPlaying, true);
      assert.equal(await page.evaluate(() => qaDestructiveClears), 0);
    }, { guest: true, loading: true });
    await scenario('empty-playlist-search-action-and-no-play', async page => {
      await page.getByRole('heading', { name: 'Let’s find some songs for your playlist' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Play QA playlist', exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('link', { name: 'Find songs', exact: true }).getAttribute('href'), '/search');
    }, { empty: true });
    for (const [label, viewport, large] of [['phone', { width: 390, height: 844 }, false], ['narrow', { width: 320, height: 640 }, false], ['landscape', { width: 844, height: 390 }, false], ['desktop', { width: 1440, height: 1000 }, false], ['large-text', { width: 320, height: 640 }, true]]) await scenario('layout-' + label, async page => {
      await ready(page);
      assert.equal(await page.locator('.collection-hero-content').evaluate(node => getComputedStyle(node).flexDirection), viewport.width >= 560 ? 'row' : 'column');
      if (large) await page.addStyleTag({ content: 'html{font-size:32px!important}' });
      await page.evaluate(() => { qaMetadata.aaaaaaaaaaa.title = 'مرحبا 🎵 — LongSong'.repeat(60); sessionStorage.clear(); qaEvents.notifyPlaylistChanged({ owner: 'account:A', playlist: qaPlaylist }); });
      await row(page, 'entry-0').locator('[data-track-duration]').waitFor();
      const metrics = await rows(page).evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(), d = node.querySelector('[data-track-duration]').getBoundingClientRect(), b = node.querySelector('[data-item-menu-trigger]').getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height, width: innerWidth, controlGap: Math.abs(d.top + d.height / 2 - b.top - b.height / 2), buttonHeight: b.height }; }));
      for (const item of metrics) { assert(item.left >= 0 && item.right <= item.width + 1, JSON.stringify(item)); assert.equal(item.height, large ? 132 : 66); assert(item.controlGap < 2); assert(item.buttonHeight >= 44); }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, label + '-hero.png') });
      await rows(page).first().scrollIntoViewIfNeeded(); await settle(page);
      await page.screenshot({ path: path.join(output, label + '-tracks.png') });
      await page.getByRole('button', { name: 'Playlist options', exact: true }).click();
      const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Delete playlist', exact: true }).scrollIntoViewIfNeeded();
      const bounds = await dialog.boundingBox(); assert(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    }, {}, viewport);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ scope: 'Actual screen/services/hydration/reducer/account boundary; local HTTP/session fixtures. No source audio or native/device playback verification.', results }, null, 2));
  for (const result of results) console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ': ' + result.error.split('\n')[0] : ''));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
