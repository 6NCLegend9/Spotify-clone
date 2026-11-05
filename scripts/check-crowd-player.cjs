// Execute the real player reducer and Crowd hook; APIs/session/realtime transport stay local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const results = [];
const sources = {};
const external = new Set(['react', 'react-redux', 'next-auth/react', '@reduxjs/toolkit', '@/utils/supabaseClient', '@/services/http', '@/utils/userError']);
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const dependencies = {}; sources[key] = { code, dependencies };
  for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (external.has(spec)) { dependencies[spec] = spec; continue; }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, ...['.js', '.jsx', '.mjs'].map(ext => candidate + ext)].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved && resolved.startsWith(path.join(root, 'src') + path.sep), `Unexpected dependency: ${spec}`);
    dependencies[spec] = include(resolved);
  }
  return key;
}
const entries = {
  hook: include(path.join(root, 'src/hooks/useCrowdRadio.js')),
  request: include(path.join(root, 'src/hooks/usePlaybackRequest.js')),
  player: include(path.join(root, 'src/redux/features/playerSlice.js')),
  boundary: include(path.join(root, 'src/components/AccountPrivacyBoundary.jsx')),
  storage: include(path.join(root, 'src/utils/accountStorage.mjs')),
  queue: include(path.join(root, 'src/utils/playerQueue.mjs')),
};
const reducerFile = path.join(root, entries.player), redux = { exports: {} };
new Function('require', 'module', 'exports', sources[entries.player].code)(createRequire(reducerFile), redux, redux.exports);
const actions = redux.exports, reducer = actions.default;
const songs = [
  { id: 'aaaaaaaaaaa', title: 'First song', channel: 'Artist A', duration: 180 },
  { id: 'bbbbbbbbbbb', title: 'Second song', channel: 'Artist B', duration: 180 },
  { id: 'ccccccccccc', title: 'Third song', channel: 'Artist C', duration: 180 },
  { id: 'xxxxxxxxxxx', title: 'Alternate recording', channel: 'Artist A', duration: 180 },
];
function collection(queue = [songs[0], songs[1], songs[0], songs[2]], index = 2) {
  let state = reducer(undefined, actions.restorePlayback({ owner: 'account:A', snapshot: null }));
  return reducer(state, actions.startYoutubePlayback({ track: queue[index], queue, index, queueMode: 'collection' }));
}
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.stack || String(error) }); }
}
async function setup(page, empty = false) {
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1:3000/__crowd-qa'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' }) : route.abort());
  await page.goto('http://127.0.0.1:3000/__crowd-qa');
  for (const file of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js', '@reduxjs/toolkit/dist/redux-toolkit.umd.js']) {
    await page.addScriptTag({ path: path.join(root, 'node_modules', file) });
  }
  await page.evaluate(({ sources, entries, songs, empty }) => {
    window.qaSession = { data: { user: { id: 'A', name: 'A' } }, status: 'authenticated' };
    window.qaRoom = { code: 'ABCDEF', role: 'host', status: 'connected' };
    window.qaPending = []; window.qaRequests = []; window.qaCommands = []; window.qaHoldNotifications = false;
    window.qaTasteRequests = []; window.qaPresenceTracks = [];
    const cache = {}; let store;
    function require(name) {
      if (name === 'react') return React;
      if (name === '@reduxjs/toolkit') return RTK;
      if (name === 'next-auth/react') return { useSession: () => qaSession };
      if (name === 'react-redux') return {
        useDispatch: () => store.dispatch, useStore: () => store,
        useSelector: select => React.useSyncExternalStore(callback => store.subscribe(() => { if (!qaHoldNotifications) callback(); }), () => select(store.getState())),
      };
      if (name === '@/utils/userError') return { userErrorDetails: error => ({ message: error.message }) };
      if (name === '@/services/http') return { requestJson: (url, options) => {
        if (url === '/api/settings') { qaTasteRequests.push(url); return Promise.resolve({ genres: ['Soul'] }); }
        if (url === '/api/followedArtists') { qaTasteRequests.push(url); return Promise.resolve({ data: ['QA artist'] }); }
        qaRequests.push(options.body);
        return new Promise((resolve, reject) => qaPending.push({ resolve, reject }));
      } };
      if (name === '@/utils/supabaseClient') return { isSupabaseConfigured: () => true, getSupabase: async () => ({
        channel() { let sync; return {
          on(_type, _event, callback) { sync = callback; return this; },
          subscribe(callback) { callback('SUBSCRIBED'); return this; },
          track(profile) { qaPresenceTracks.push(profile); this.profile = profile; sync(); return Promise.resolve(); },
          presenceState() { return { self: [this.profile] }; },
        }; }, removeChannel() {},
      }) };
      if (cache[name]) return cache[name].exports;
      const source = sources[name]; if (!source) throw Error(`Unknown module ${name}`);
      const loaded = { exports: {} }; cache[name] = loaded;
      new Function('module', 'exports', 'require', source.code)(loaded, loaded.exports, spec => require(source.dependencies[spec]));
      return loaded.exports;
    }
    const player = require(entries.player), useCrowd = require(entries.hook).default, usePlaybackRequest = require(entries.request).default, Boundary = require(entries.boundary).default;
    window.qaStorage = require(entries.storage); window.qaQueue = require(entries.queue); window.qaActions = player;
    store = RTK.configureStore({ reducer: { player: player.default }, middleware: [] }); window.qaStore = store;
    const dispatch = store.dispatch;
    store.dispatch = action => { qaCommands.push(action); return dispatch(action); };
    store.dispatch(player.restorePlayback({ owner: 'account:A', snapshot: null }));
    if (!empty) store.dispatch(player.startYoutubePlayback({ track: songs[0], queue: [songs[0], songs[3]], index: 0, queueMode: 'collection' }));
    function App() {
      const crowd = useCrowd(qaRoom); window.qaCrowd = crowd;
      window.qaPlayRequest = usePlaybackRequest();
      return React.createElement('button', { onClick: () => void crowd.buildStation(), disabled: crowd.busy }, 'Build');
    }
    const host = ReactDOM.createRoot(document.getElementById('root'));
    window.qaUnmount = () => ReactDOM.flushSync(() => host.unmount());
    window.qaRender = () => ReactDOM.flushSync(() => host.render(React.createElement(React.Fragment, null, React.createElement(Boundary), React.createElement(App))));
    window.qaOwner = owner => { qaSession = owner ? { data: { user: { id: owner, name: owner } }, status: 'authenticated' } : { data: null, status: 'unauthenticated' }; qaRender(); };
    window.qaResolve = (index = 0) => qaPending[index].resolve({ tracks: [songs[1], songs[2]] });
    window.qaSettled = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    qaRender();
  }, { sources, entries, songs, empty });
  await page.waitForFunction(() => qaCrowd.members.length === 1);
}
let browser;
async function browserCheck(name, run, empty = false) {
  await check(name, async () => {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try { await setup(page, empty); await run(page); assert.deepEqual(errors, []); }
    finally { await page.close(); }
  });
}
(async () => {
  await check('alternate replaces the selected repeated occurrence and Next reaches C', async () => {
    const before = collection(), after = reducer(before, actions.replaceCurrentYoutubeTrack(songs[3]));
    assert.deepEqual(after.youtubeQueue.map(track => track.id), [songs[0].id, songs[1].id, songs[3].id, songs[2].id]);
    assert.equal(new Set(after.youtubeQueue.map(track => track.queueEntryId)).size, 4);
    const { nextQueueTrack } = await import('../src/utils/playerQueue.mjs');
    assert.equal(nextQueueTrack(after.youtubeQueue, after.youtubeVideo).id, songs[2].id);
  });
  for (const index of [0, 2]) await check(`alternate preserves occurrence ${index}, history and explicit upcoming rows`, async () => {
    let before = collection([songs[0], songs[1], { ...songs[0], queueSource: 'user' }, { ...songs[2], queueSource: 'user' }], index);
    before = { ...before, history: [{ ...songs[1], queueEntryId: 'previous' }] };
    const after = reducer(before, actions.replaceCurrentYoutubeTrack(songs[3]));
    assert.equal(after.youtubeVideo.queueEntryId, before.youtubeVideo.queueEntryId);
    assert.equal(after.youtubeVideo.queueSource, before.youtubeVideo.queueSource);
    assert.deepEqual(after.history, before.history);
    assert.deepEqual(after.youtubeQueue.map(track => track.queueEntryId), before.youtubeQueue.map(track => track.queueEntryId));
    assert.deepEqual(after.userQueue.map(track => track.queueEntryId), before.youtubeQueue.slice(index + 1).filter(track => track.queueSource === 'user').map(track => track.queueEntryId));
    const { nextQueueTrack } = await import('../src/utils/playerQueue.mjs');
    const next = nextQueueTrack(after.youtubeQueue, after.youtubeVideo);
    const advanced = reducer(after, actions.setYoutubeVideo(next));
    assert.equal(advanced.history.at(-1).queueEntryId, after.youtubeVideo.queueEntryId);
    assert.equal(advanced.history.at(-1).id, songs[3].id);
    assert.equal(advanced.userQueue.some(track => track.queueEntryId === after.youtubeVideo.queueEntryId), false);
  });
  await check('alternate preserves unique-track ordering and collection mode', () => {
    const before = collection(songs.slice(0, 3), 1), after = reducer(before, actions.replaceCurrentYoutubeTrack(songs[3]));
    assert.deepEqual(after.youtubeQueue.map(track => track.id), [songs[0].id, songs[3].id, songs[2].id]);
    assert.equal(after.queueMode, before.queueMode); assert.equal(after.queueManualEnd, before.queueManualEnd);
  });
  await check('modern missing occurrence never falls back to another occurrence of the same song', () => {
    let before = collection();
    before = { ...before, youtubeVideo: { ...before.youtubeVideo, queueEntryId: 'missing-selected-occurrence' } };
    const after = reducer(before, actions.replaceCurrentYoutubeTrack(songs[3]));
    assert.deepEqual(after.youtubeQueue.slice(1), before.youtubeQueue);
    assert.equal(after.youtubeQueue[0].queueEntryId, 'missing-selected-occurrence');
  });
  await check('legacy current falls back by content ID and adopts its existing row identity', () => {
    let before = collection(songs.slice(0, 3), 0);
    const legacy = { ...before.youtubeVideo }; delete legacy.queueEntryId;
    before = { ...before, youtubeVideo: legacy };
    const after = reducer(before, actions.replaceCurrentYoutubeTrack(songs[3]));
    assert.equal(after.youtubeQueue.length, 3);
    assert.equal(after.youtubeVideo.queueEntryId, before.youtubeQueue[0].queueEntryId);
    assert.deepEqual(after.youtubeQueue.map(track => track.id), [songs[3].id, songs[1].id, songs[2].id]);
  });
  await check('station replacement keeps the played prefix, current object, pause, position and history', () => {
    let before = collection([ { ...songs[0], queueSource: 'user' }, songs[1], { ...songs[2], queueSource: 'user' } ], 1);
    before = { ...before, isPlaying: false, position: 42, restorePosition: 17, history: [before.youtubeQueue[0]] };
    const after = reducer(before, actions.replaceUpcomingYoutubeQueue({ tracks: [songs[2], songs[3]], expectedCurrent: before.youtubeVideo, expectedOwner: before.playbackOwner }));
    assert.deepEqual(after.youtubeQueue.slice(0, 2), before.youtubeQueue.slice(0, 2));
    assert.strictEqual(after.youtubeVideo, before.youtubeVideo);
    assert.equal(after.isPlaying, false); assert.equal(after.position, 42); assert.equal(after.restorePosition, 17);
    assert.strictEqual(after.history, before.history); assert.deepEqual(after.userQueue, []);
    assert.equal(new Set(after.youtubeQueue.map(track => track.queueEntryId)).size, after.youtubeQueue.length);
    const advanced = reducer(after, actions.setYoutubeVideo(after.youtubeQueue[2]));
    assert.deepEqual(advanced.userQueue, []); assert.equal(advanced.history.at(-1).id, songs[1].id);
  });
  await check('idle station response cannot override a newer Pause', () => {
    const before = reducer(undefined, actions.restorePlayback({ owner: 'account:A', snapshot: null }));
    const paused = reducer(before, actions.playPause(false));
    const after = reducer(paused, actions.replaceUpcomingYoutubeQueue({ tracks: [songs[1]], expectedCurrent: null,
      expectedOwner: before.playbackOwner, expectedIntentRevision: before.playbackIntentRevision }));
    assert.strictEqual(after, paused);
  });
  await check('idle station auto-start requires a current intent ticket', () => {
    const before = reducer(undefined, actions.restorePlayback({ owner: 'account:A', snapshot: null }));
    const payload = { tracks: [songs[1]], expectedCurrent: null, expectedOwner: before.playbackOwner };
    assert.strictEqual(reducer(before, actions.replaceUpcomingYoutubeQueue(payload)), before);
    const after = reducer(before, actions.replaceUpcomingYoutubeQueue({ ...payload, expectedIntentRevision: before.playbackIntentRevision }));
    assert.equal(after.youtubeVideo.id, songs[1].id); assert.equal(after.isPlaying, true);
  });
  for (const change of ['track', 'occurrence', 'owner', 'empty-to-active']) await check(`authoritative station action rejects stale ${change}`, () => {
    const before = change === 'empty-to-active'
      ? reducer(undefined, actions.restorePlayback({ owner: 'account:A', snapshot: null })) : collection();
    let changed;
    if (change === 'owner') changed = { ...before, playbackOwner: 'account:B' };
    else if (change === 'empty-to-active') changed = reducer(before, actions.startYoutubePlayback({ track: songs[0], queue: [songs[0]], queueMode: 'collection' }));
    else changed = reducer(before, actions.setYoutubeVideo(before.youtubeQueue[change === 'occurrence' ? 0 : 3]));
    const after = reducer(changed, actions.replaceUpcomingYoutubeQueue({ tracks: [songs[2]], expectedCurrent: before.youtubeVideo, expectedOwner: before.playbackOwner }));
    assert.strictEqual(after, changed);
  });
  await check('unplayable station leaves existing queue untouched', () => {
    const before = collection();
    assert.strictEqual(reducer(before, actions.replaceUpcomingYoutubeQueue({ tracks: [null, {}, { id: songs[2].id, title: 'Podcast' }], expectedCurrent: before.youtubeVideo, expectedOwner: before.playbackOwner })), before);
  });
  await check('radio pruning starts after the selected repeat and preserves played prefix plus next artist', () => {
    const queue = [songs[0], { ...songs[1], channel: songs[2].channel }, { ...songs[0], queueSource: 'user' }, songs[2]];
    const before = reducer(undefined, actions.startYoutubePlayback({ track: queue[2], queue, index: 2, queueMode: 'radio' }));
    const after = reducer(before, actions.setYoutubeVideo(before.youtubeVideo));
    assert.deepEqual(after.youtubeQueue.map(track => track.queueEntryId), before.youtubeQueue.map(track => track.queueEntryId));
  });
  await check('station generates unique occurrences after actual Jam queue hydration with a stale sequence', async () => {
    const track = { ...songs[0], queueEntryId: `context:1:${songs[0].id}` };
    let before = reducer(undefined, actions.restorePlayback({ owner: 'account:A', snapshot: null }));
    before = reducer(before, actions.setYoutubeQueue([track]));
    before = reducer(before, actions.setYoutubeVideo(track));
    assert.equal(before.queueSequence, 0);
    const after = reducer(before, actions.replaceUpcomingYoutubeQueue({ tracks: [songs[0], songs[1], songs[0]], expectedCurrent: before.youtubeVideo, expectedOwner: before.playbackOwner }));
    assert.equal(new Set(after.youtubeQueue.map(item => item.queueEntryId)).size, 4);
    const { nextQueueTrack, queueAdvanceDecision } = await import('../src/utils/playerQueue.mjs');
    assert.equal(queueAdvanceDecision(after.youtubeVideo, nextQueueTrack(after.youtubeQueue, after.youtubeVideo)), 'advance');
  });
  await check('fresh queue entries never reuse current or history occurrence identities', () => {
    let before = collection([songs[2]], 0);
    before = { ...before, queueSequence: 0, history: [{ ...songs[0], queueEntryId: `user:1:${songs[0].id}` }] };
    const after = reducer(before, actions.addToQueue(songs[0]));
    assert.notEqual(after.youtubeQueue.at(-1).queueEntryId, before.history[0].queueEntryId);
    assert.deepEqual(after.history, before.history);
  });
  await check('adding an existing queue row creates a new occurrence instead of copying its identity', () => {
    const before = collection();
    let after = reducer(before, actions.addToQueue(before.youtubeVideo));
    after = reducer(after, actions.addToQueue(before.youtubeQueue[1]));
    assert.equal(new Set(after.youtubeQueue.map(item => item.queueEntryId)).size, after.youtubeQueue.length);
    assert.notEqual(after.userQueue.at(-2).queueEntryId, before.youtubeVideo.queueEntryId);
    assert.notEqual(after.userQueue.at(-1).queueEntryId, before.youtubeQueue[1].queueEntryId);
    assert.deepEqual(after.youtubeVideo, before.youtubeVideo);
  });
  for (const counter of [Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]) await check(`occurrence counter recovers safely from ${counter}`, () => {
    const before = { ...collection([songs[0]], 0), queueSequence: counter };
    const after = reducer(before, actions.addToQueue(songs[0]));
    assert.equal(Number.isSafeInteger(after.queueSequence), true);
    assert.equal(after.queueSequence, 1);
    assert.notEqual(after.youtubeQueue.at(-1).queueEntryId, before.youtubeVideo.queueEntryId);
  });
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    await browserCheck('Crowd keeps current playback anchored and Next reaches built station', async page => {
      const before = await page.evaluate(() => qaStore.getState().player);
      await page.getByRole('button', { name: 'Build' }).click();
      await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async () => { qaResolve(); await qaSettled(); });
      const result = await page.evaluate(() => {
        const state = qaStore.getState().player;
        return { state, next: qaQueue.nextQueueTrack(state.youtubeQueue, state.youtubeVideo), station: qaCrowd.station };
      });
      assert.equal(result.state.youtubeVideo.queueEntryId, before.youtubeVideo.queueEntryId);
      assert.equal(result.next?.id, songs[1].id);
      assert.equal(result.state.isPlaying, true);
      assert.equal(result.station.length, 2);
      assert.equal((await page.evaluate(() => qaCommands.filter(command => command.type === 'player/replaceUpcomingYoutubeQueue').length)), 1);
    });
    await browserCheck('Crowd preserves explicit Pause during a build without restarting current audio', async page => {
      await page.evaluate(() => { qaStore.dispatch(qaActions.setPlaybackPosition({ ...qaStore.getState().player.youtubeVideo, position: 31 })); window.qaCurrent = qaStore.getState().player.youtubeVideo; });
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async () => { qaStore.dispatch(qaActions.playPause(false)); qaResolve(); await qaSettled(); });
      assert.deepEqual(await page.evaluate(() => {
        const state = qaStore.getState().player;
        return [state.isPlaying, state.position, state.youtubeVideo === qaCurrent, qaCommands.slice(2).some(command => command.type === 'player/setYoutubeVideo')];
      }), [false, 31, true, false]);
    });
    await browserCheck('Crowd starts an empty deck with the first built occurrence in one action', async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async () => { qaResolve(); await qaSettled(); });
      assert.deepEqual(await page.evaluate(() => {
        const state = qaStore.getState().player;
        return [state.youtubeVideo.id, state.youtubeVideo.queueEntryId === state.youtubeQueue[0].queueEntryId, state.isPlaying, qaCommands.filter(command => command.type === 'player/replaceUpcomingYoutubeQueue').length];
      }), [songs[1].id, true, true, 1]);
    }, true);
    await browserCheck('current-track Crowd refresh preserves a newer pending collection Play', async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async () => {
        window.qaTicket = qaPlayRequest.begin();
        qaResolve(); await qaSettled();
      });
      assert.equal(await page.evaluate(() => qaTicket()), true);
      await page.evaluate(() => {
        if (qaTicket()) qaStore.dispatch(qaActions.startYoutubePlayback({ queue: [{ id: 'xxxxxxxxxxx', title: 'New collection' }], track: { id: 'xxxxxxxxxxx', title: 'New collection' }, queueMode: 'collection' }));
      });
      assert.equal(await page.evaluate(() => qaStore.getState().player.youtubeVideo.id), songs[3].id);
    });
    for (const holdRender of [false, true]) await browserCheck(`idle Crowd response respects Pause${holdRender ? ' before render' : ''}`, async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async holdRender => {
        qaHoldNotifications = holdRender;
        qaStore.dispatch(qaActions.playPause(false));
        window.qaUnchanged = qaStore.getState().player;
        qaResolve(); await qaSettled();
      }, holdRender);
      assert.deepEqual(await page.evaluate(() => [qaStore.getState().player === qaUnchanged, qaCrowd.station.length, qaCrowd.busy]), [true, 0, false]);
    }, true);
    await browserCheck('idle Crowd response yields to a newer Play still loading', async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async () => {
        qaStore.dispatch(qaActions.beginPlaybackRequest());
        window.qaUnchanged = qaStore.getState().player; qaResolve(); await qaSettled();
      });
      assert.deepEqual(await page.evaluate(() => [qaStore.getState().player === qaUnchanged, qaCrowd.station.length, qaCrowd.busy]), [true, 0, false]);
    }, true);
    for (const change of ['track', 'occurrence', 'room', 'role', 'disconnect', 'account', 'logout', 'privacy-clear', 'owner-before-render', 'track-before-render', 'empty-to-active-before-render']) {
      await browserCheck(`pending Crowd result cannot overwrite ${change}`, async page => {
        if (change === 'occurrence') await page.evaluate(({ songs }) => qaStore.dispatch(qaActions.startYoutubePlayback({ track: songs[0], queue: [songs[0], songs[0], songs[3]], index: 1, queueMode: 'collection' })), { songs });
        await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
        const expected = await page.evaluate(async ({ change, songs }) => {
          if (change.endsWith('before-render')) qaHoldNotifications = true;
          if (change === 'track' || change === 'track-before-render') qaStore.dispatch(qaActions.setYoutubeVideo(qaStore.getState().player.youtubeQueue.at(-1)));
          if (change === 'occurrence') qaStore.dispatch(qaActions.setYoutubeVideo(qaStore.getState().player.youtubeQueue[0]));
          if (change === 'room') { qaRoom = { ...qaRoom, code: 'UVWXYZ' }; qaRender(); }
          if (change === 'role') { qaRoom = { ...qaRoom, role: 'guest' }; qaRender(); }
          if (change === 'disconnect') { qaRoom = { ...qaRoom, status: 'disconnected' }; qaRender(); }
          if (change === 'account') qaOwner('B');
          if (change === 'logout') qaOwner(null);
          if (change === 'privacy-clear') qaStorage.clearLocalAccountCaches({ notify: true });
          if (change === 'owner-before-render') qaStore.dispatch(qaActions.restorePlayback({ owner: 'account:B', snapshot: null }));
          if (change === 'empty-to-active-before-render') qaStore.dispatch(qaActions.startYoutubePlayback({ track: songs[0], queue: [songs[0]], queueMode: 'collection' }));
          const before = qaStore.getState().player;
          await qaSettled(); qaResolve(); await qaSettled();
          return { before, after: qaStore.getState().player, station: qaCrowd.station, error: qaCrowd.error };
        }, { change, songs });
        assert.deepEqual(expected.after, expected.before);
        assert.deepEqual(expected.station, []); assert.equal(expected.error, null);
      }, change === 'empty-to-active-before-render');
    }
    for (const change of ['room', 'track', 'account']) await browserCheck(`rendered ${change} round trip still discards the original pending build`, async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async change => {
        const initial = qaStore.getState().player.youtubeVideo;
        if (change === 'room') { qaRoom = { ...qaRoom, code: 'UVWXYZ' }; qaRender(); }
        if (change === 'track') qaStore.dispatch(qaActions.setYoutubeVideo(qaStore.getState().player.youtubeQueue.at(-1)));
        if (change === 'account') qaOwner('B');
        await qaSettled();
        if (change === 'room') { qaRoom = { ...qaRoom, code: 'ABCDEF' }; qaRender(); }
        if (change === 'track') qaStore.dispatch(qaActions.setYoutubeVideo(initial));
        if (change === 'account') qaOwner('A');
        await qaSettled(); window.qaUnchanged = qaStore.getState().player;
        qaResolve(); await qaSettled();
      }, change);
      assert.deepEqual(await page.evaluate(() => [qaStore.getState().player === qaUnchanged, qaCrowd.station.length, qaCrowd.error]), [true, 0, null]);
    });
    await browserCheck('empty-deck build never replaces another audio player started during the request', async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async () => {
        qaHoldNotifications = true;
        qaStore.dispatch(qaActions.setActiveSong({ song: { id: 'owned-audio', name: 'Owned song' } }));
        window.qaUnchanged = qaStore.getState().player; qaResolve(); await qaSettled();
      });
      assert.deepEqual(await page.evaluate(() => [qaStore.getState().player === qaUnchanged, qaCrowd.station.length]), [true, 0]);
    }, true);
    await browserCheck('stale prior-room callback cannot start a request under the new room scope', async page => {
      await page.evaluate(async () => {
        const stale = qaCrowd.buildStation;
        qaRoom = { ...qaRoom, code: 'UVWXYZ' }; qaRender(); await qaSettled();
        await stale(); await qaSettled();
      });
      assert.equal(await page.evaluate(() => qaRequests.length), 0);
    });
    await browserCheck('privacy clear with stale session stops local taste loading and sharing', async page => {
      const before = await page.evaluate(() => [qaTasteRequests.length, qaPresenceTracks.length]);
      await page.evaluate(async () => { qaStorage.clearLocalAccountCaches({ notify: true }); await qaSettled(); });
      assert.deepEqual(await page.evaluate(() => [qaTasteRequests.length, qaPresenceTracks.length]), before);
      assert.deepEqual(await page.evaluate(() => [qaCrowd.members.length, qaCrowd.station.length]), [0, 0]);
    });
    for (const outcome of ['resolve', 'reject']) await browserCheck(`unmounted Crowd hook ignores a pending ${outcome}`, async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async outcome => {
        window.qaUnchanged = qaStore.getState().player; qaUnmount();
        if (outcome === 'resolve') qaResolve(); else qaPending[0].reject(Error('unmounted fixture'));
        await qaSettled();
      }, outcome);
      assert.equal(await page.evaluate(() => qaStore.getState().player === qaUnchanged), true);
    });
    await browserCheck('repeated Build calls share one in-flight station request', async page => {
      await page.evaluate(() => { void qaCrowd.buildStation(); void qaCrowd.buildStation(); });
      await page.waitForFunction(() => qaPending.length === 1);
      assert.equal(await page.evaluate(() => qaRequests.length), 1);
      await page.evaluate(async () => { qaResolve(); await qaSettled(); });
      assert.equal(await page.evaluate(() => qaCrowd.busy), false);
    });
    await browserCheck('new-room build finishes independently and discards late prior-room success or error', async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(() => { qaRoom = { ...qaRoom, code: 'UVWXYZ' }; qaRender(); });
      await page.waitForFunction(() => qaCrowd.members.length === 1 && !qaCrowd.busy);
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 2);
      await page.evaluate(async () => { qaResolve(1); await qaSettled(); window.qaResult = qaStore.getState().player; qaPending[0].reject(Error('old room failure')); await qaSettled(); });
      assert.deepEqual(await page.evaluate(() => [qaStore.getState().player === qaResult, qaCrowd.station.length, qaCrowd.error, qaCrowd.busy]), [true, 2, null, false]);
    });
    await browserCheck('station request failure remains recoverable', async page => {
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 1);
      await page.evaluate(async () => { qaPending[0].reject(Error('fixture unavailable')); await qaSettled(); });
      assert.equal(await page.evaluate(() => qaCrowd.error), 'fixture unavailable');
      assert.equal(await page.getByRole('button', { name: 'Build' }).isEnabled(), true);
      await page.getByRole('button', { name: 'Build' }).click(); await page.waitForFunction(() => qaPending.length === 2);
      await page.evaluate(async () => { qaResolve(1); await qaSettled(); });
      assert.equal(await page.evaluate(() => qaCrowd.station.length), 2);
    });
  } finally { await browser.close(); }
  const report = { passed: results.filter(result => result.pass).length, total: results.length, results };
  const output = path.resolve(process.env.HAYKASA_CROWD_PLAYER_EVIDENCE || path.join(root, 'artifacts/crowd-player'));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
