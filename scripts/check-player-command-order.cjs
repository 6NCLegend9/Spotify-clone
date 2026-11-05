// Execute the production player callbacks and reducer with deferred local
// responses. These checks establish command ordering, not audible playback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const playerFile = path.join(root, 'src/redux/features/playerSlice.js');
const componentFile = path.join(root, 'src/components/MusicPlayer/YouTubePlayer.jsx');
const component = fs.readFileSync(componentFile, 'utf8');
const parsed = ts.createSourceFile(componentFile, component, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const names = ['capturePlaybackScope', 'getNextVideo', 'extendQueue', 'playNextOrContinue', 'handlePlaybackFailure'];
const bodies = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(parsed))) {
    bodies.set(node.name.getText(parsed), node.initializer.getText(parsed));
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
for (const name of names.slice(1)) assert(bodies.has(name), `Missing actual player callback: ${name}`);
// The old implementation has no scope helper. Do not invent a guard for it:
// the exact old callbacks must still demonstrate the original failures.
const callbacks = [...bodies].map(([name, source]) => `const ${name} = ${source};`).join('\n');
const loaded = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(playerFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(createRequire(playerFile), loaded, loaded.exports);
const actions = loaded.exports, reducer = actions.default;
const songs = [
  { id: 'aaaaaaaaaaa', title: 'Alpha song (Official Audio)', channel: 'Artist Alpha', duration: 180 },
  { id: 'bbbbbbbbbbb', title: 'Beta song (Official Audio)', channel: 'Artist Beta', duration: 180 },
  { id: 'ccccccccccc', title: 'Gamma song (Official Audio)', channel: 'Artist Gamma', duration: 180 },
  { id: 'ddddddddddd', title: 'Delta song (Official Audio)', channel: 'Artist Delta', duration: 180 },
];
const results = [];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
let helpers;
function fixture(track = songs[0]) {
  let state = reducer(undefined, actions.restorePlayback({ owner: 'account:A', snapshot: null }));
  state = reducer(state, actions.startYoutubePlayback({ track, queue: [track], queueMode: 'radio' }));
  let generation = 0;
  const calls = { actions: [], errors: [], toasts: [], pauses: 0, marks: 0, requests: [] };
  const media = { provider: 'youtube', pauseVideo() { calls.pauses++; }, getCurrentTime: () => 0 };
  const context = {
    ...helpers, ...actions, console, AbortController, URLSearchParams, Set, Date,
    store: { getState: () => ({ player: state, settings: { explicitContent: true, privateSession: false } }) },
    dispatch(action) { calls.actions.push(action); state = reducer(state, action); },
    videoRef: { current: state.youtubeVideo }, queueRef: { current: state.youtubeQueue },
    playbackOwner: state.playbackOwner, queueMode: state.queueMode,
    queueManualEnd: state.queueManualEnd, playbackContext: state.playbackContext,
    playbackHistory: state.history, status: 'authenticated',
    asyncPlaybackLifetimeRef: { current: {} }, accountStorageGeneration: () => generation,
    jamRef: { current: null }, isJamGuestRef: { current: false },
    manualEndRef: { current: false }, repeatRef: { current: false }, repeatModeRef: { current: 'off' },
    userPausedRef: { current: false }, trackChangeUntilRef: { current: 0 },
    autoExtendingRef: { current: null }, lastExtendScopeRef: { current: null },
    lastExtendEmptyRef: { current: false }, lastExtendAtRef: { current: 0 },
    failureResolveRef: { current: null }, sameIdRetryRef: { current: null },
    alternateAttemptRef: { current: { identity: null } },
    sourceSwitchRef: { current: null }, fallbackOccurrenceRef: { current: null },
    activeDeckRef: { current: 'A' }, apiReady: false,
    getActivePlayer: () => media,
    cancelFade() {}, abortCrossfade() {}, clearActiveBufferTimers() {},
    markExpectPlaying() { calls.marks++; }, recordPlayEvent() {}, replayCurrent() {},
    applyPlaybackVolume() {}, mountDeck() {}, mediaLoadOptions: () => ({}),
    setPlayerError(value) { if (value) calls.errors.push(value); },
    setSourceAudioReason() {}, setSourceRevision() {},
    toast: Object.assign(value => calls.toasts.push(value), { error: value => calls.toasts.push(value) }),
    requestJson: () => { throw Error('Every network request requires an explicit local fixture'); },
    resolveAlternateUpload: () => { throw Error('Every alternate lookup requires an explicit local fixture'); },
    extendQueueRef: { current: () => { throw Error('Every Next extension requires a local fixture'); } },
  };
  vm.runInNewContext(callbacks + '\nglobalThis.production = { getNextVideo, extendQueue, playNextOrContinue, handlePlaybackFailure };', context, { filename: componentFile });
  return {
    context, calls, state: () => state,
    dispatch: action => context.dispatch(action),
    render() {
      context.videoRef.current = state.youtubeVideo;
      context.queueRef.current = state.youtubeQueue;
      context.manualEndRef.current = state.queueManualEnd;
      context.playbackOwner = state.playbackOwner;
      context.queueMode = state.queueMode;
      context.queueManualEnd = state.queueManualEnd;
      context.playbackContext = state.playbackContext;
      context.playbackHistory = state.history;
    },
    invalidatePrivacy() { generation++; },
    nextFixture({ append = false } = {}) {
      const response = deferred();
      context.extendQueueRef.current = async () => {
        const tracks = await response.promise;
        if (append) context.dispatch(actions.appendToQueue(tracks));
        return tracks;
      };
      return response;
    },
    networkFixture() {
      const response = deferred();
      context.requestJson = (url, options) => { calls.requests.push({ url, options }); return response.promise; };
      context.extendQueueRef.current = context.production.extendQueue;
      return response;
    },
    alternateFixture() {
      const response = deferred();
      context.resolveAlternateUpload = () => response.promise;
      return response;
    },
  };
}
function select(f, track = songs[2], queue = [songs[2], songs[3]]) {
  f.dispatch(actions.startYoutubePlayback({ track, queue, queueMode: 'collection' }));
}
function assertUnchanged(f, before, message) {
  assert.strictEqual(f.state(), before, message);
  assert.equal(f.calls.pauses, 0, 'A stale operation must not pause the active player');
  assert.equal(f.calls.errors.length, 0, 'A stale operation must not surface its error');
  assert.equal(f.calls.toasts.length, 0, 'A stale operation must not announce its result');
}
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.stack || String(error) }); }
}
(async () => {
  const local = file => pathToFileURL(path.join(root, file)).href;
  helpers = {
    ...await import(local('src/utils/playerQueue.mjs')),
    ...await import(local('src/utils/radioSeed.mjs')),
    ...await import(local('src/utils/youtubePlaybackError.mjs')),
    ...await import(local('src/utils/explicitContent.mjs')),
    ...await import(local('src/utils/youtubeSearchUrl.mjs')),
  };
  await check('Next selects an accepted appended occurrence before React updates refs', async () => {
    const f = fixture(), response = f.nextFixture({ append: true });
    const next = f.context.production.playNextOrContinue();
    response.resolve([songs[1]]); await next;
    assert.equal(f.state().youtubeVideo.id, songs[1].id);
    assert.equal(f.state().youtubeVideo.queueEntryId, f.state().youtubeQueue.at(-1).queueEntryId);
    assert.equal(f.state().isPlaying, true);
  });
  for (const change of ['Pause', 'selection-before-render', 'selection-after-render', 'owner-before-render', 'repeated-occurrence', 'new-pending-Play', 'privacy-clear', 'unmount', 'Jam-guest']) {
    await check(`Delayed Next yields to ${change}`, async () => {
      const f = fixture(), response = f.nextFixture();
      const next = f.context.production.playNextOrContinue();
      if (change === 'Pause') f.dispatch(actions.playPause(false));
      if (change.startsWith('selection')) select(f);
      if (change === 'selection-after-render') f.render();
      if (change === 'owner-before-render') {
        f.dispatch(actions.restorePlayback({ owner: 'account:B', snapshot: null })); select(f);
      }
      if (change === 'repeated-occurrence') select(f, songs[0], [songs[0], songs[1]]);
      if (change === 'new-pending-Play') f.dispatch(actions.beginPlaybackRequest());
      if (change === 'privacy-clear') f.invalidatePrivacy();
      if (change === 'unmount') f.context.asyncPlaybackLifetimeRef.current = {};
      if (change === 'Jam-guest') {
        f.context.jamRef.current = { code: 'ABCDEF', role: 'guest', status: 'connected' };
        f.context.isJamGuestRef.current = true;
      }
      const before = f.state(); response.resolve([songs[1]]); await next;
      assertUnchanged(f, before, 'The older Next response must preserve the latest selection/intent');
    });
  }
  await check('An empty old Next response cannot pause a newer track', async () => {
    const f = fixture(), response = f.nextFixture();
    const next = f.context.production.playNextOrContinue(); select(f, songs[2], [songs[2]]); f.render();
    const before = f.state(); response.resolve([]); await next; assertUnchanged(f, before);
  });
  await check('Passive provider status does not cancel a pending explicit Next', async () => {
    const f = fixture(), response = f.nextFixture({ append: true });
    const next = f.context.production.playNextOrContinue(); f.dispatch(actions.playPause(false, { intent: false }));
    response.resolve([songs[1]]); await next;
    assert.equal(f.state().youtubeVideo.id, songs[1].id); assert.equal(f.state().isPlaying, true);
  });
  await check('Current alternate recovery preserves its queue occurrence', async () => {
    const f = fixture(), response = f.alternateFixture(), entry = f.state().youtubeVideo.queueEntryId;
    const pending = f.context.production.handlePlaybackFailure({ code: 'stall' });
    response.resolve(songs[1]); await pending;
    assert.equal(f.state().youtubeVideo.id, songs[1].id);
    assert.equal(f.state().youtubeVideo.queueEntryId, entry); assert.equal(f.state().isPlaying, true);
  });
  for (const change of ['Pause', 'owner-before-render', 'new-pending-Play', 'repeated-occurrence', 'privacy-clear', 'unmount']) {
    await check(`Delayed alternate recovery yields to ${change}`, async () => {
      const f = fixture(), response = f.alternateFixture();
      const pending = f.context.production.handlePlaybackFailure({ code: 'stall' });
      if (change === 'Pause') f.dispatch(actions.playPause(false));
      if (change === 'owner-before-render') {
        f.dispatch(actions.restorePlayback({ owner: 'account:B', snapshot: null })); select(f);
      }
      if (change === 'new-pending-Play') f.dispatch(actions.beginPlaybackRequest());
      if (change === 'repeated-occurrence') select(f, songs[0], [songs[0]]);
      if (change === 'privacy-clear') f.invalidatePrivacy();
      if (change === 'unmount') f.context.asyncPlaybackLifetimeRef.current = {};
      const before = f.state(); response.resolve(songs[1]); await pending; assertUnchanged(f, before);
    });
  }
  await check('An empty stale alternate response cannot stop a newer command', async () => {
    const f = fixture(), response = f.alternateFixture();
    const pending = f.context.production.handlePlaybackFailure({ code: 'stall' });
    f.dispatch(actions.playPause(false)); const before = f.state();
    response.resolve(null); await pending; assertUnchanged(f, before);
  });
  for (const change of ['none', 'Pause', 'occurrence', 'owner-same-recording', 'context', 'mode-before-render', 'selection-before-render', 'privacy-clear']) {
    await check(`Radio extension handles ${change} without crossing its source scope`, async () => {
      const f = fixture(), response = f.networkFixture();
      const pending = f.context.production.extendQueue();
      assert(f.calls.requests.length > 0, 'The real discovery callback issued its controlled request');
      if (change === 'Pause') f.dispatch(actions.playPause(false));
      if (change === 'occurrence') {
        f.dispatch(actions.startYoutubePlayback({ track: songs[0], queue: [songs[0]], queueMode: 'radio' })); f.render();
      }
      if (change === 'owner-same-recording') {
        f.dispatch(actions.restorePlayback({ owner: 'account:B', snapshot: null }));
        f.dispatch(actions.startYoutubePlayback({ track: songs[0], queue: [songs[0]], queueMode: 'radio' })); f.render();
      }
      if (change === 'context' || change === 'mode-before-render') {
        const snapshot = { ...f.state(), playbackContext: { type: 'radio', id: 'new-context', name: 'New radio' },
          queueMode: change === 'context' ? 'radio' : 'collection' };
        f.dispatch(actions.restorePlayback({ owner: 'account:A', snapshot }));
        if (change === 'context') f.render();
      }
      if (change === 'selection-before-render') select(f);
      if (change === 'privacy-clear') f.invalidatePrivacy();
      const before = f.state(); response.resolve({ results: [songs[1]] }); await pending;
      if (change === 'none' || change === 'Pause') {
        assert.equal(f.state().youtubeQueue.at(-1).id, songs[1].id, 'Current discovery appends an accepted candidate');
        assert.equal(f.state().isPlaying, before.isPlaying, 'Queue-only discovery never changes Play/Pause');
        assert.equal(f.state().playbackIntentRevision, before.playbackIntentRevision);
      } else assertUnchanged(f, before, 'An old source cannot append into a different owner/occurrence/context');
    });
  }
  await check('Next never selects raw extras rejected from the canonical queue', async () => {
    const original = { ...songs[0], title: 'Artist Alpha - One & Only' };
    const duplicate = { ...songs[1], title: 'Artist &#65;lpha - One &amp; Only', channel: 'Other Uploader' };
    const f = fixture(original), response = f.networkFixture();
    const next = f.context.production.playNextOrContinue();
    response.resolve({ results: [duplicate] }); await next;
    assert.equal(f.state().youtubeQueue.length, 1, 'The actual reducer rejected the normalized duplicate');
    assert.equal(f.state().youtubeVideo.id, original.id, 'A rejected result cannot become the selected track');
    assert(f.state().youtubeQueue.some(track => track.queueEntryId === f.state().youtubeVideo.queueEntryId));
    assert.equal(f.state().isPlaying, false, 'A radio with no accepted next occurrence stops honestly');
  });
  await check('Next waits for the existing prefetch instead of treating busy as empty', async () => {
    const f = fixture(), response = f.networkFixture();
    const prefetch = f.context.production.extendQueue();
    const requests = f.calls.requests.length;
    const next = f.context.production.playNextOrContinue();
    await tick();
    assert.equal(f.calls.requests.length, requests, 'The current discovery request is shared');
    response.resolve({ results: [songs[1]] }); await Promise.all([prefetch, next]);
    assert.equal(f.state().youtubeVideo.id, songs[1].id, 'The requested Next reaches the prepared occurrence');
    assert.equal(f.state().isPlaying, true);
  });
  await check('An obsolete extension cannot clear or populate a newer request', async () => {
    const f = fixture(), firstResponse = f.networkFixture();
    const first = f.context.production.extendQueue();
    const firstRequests = f.calls.requests.length;
    const oldSignals = f.calls.requests.map(call => call.options.signal);
    f.dispatch(actions.startYoutubePlayback({ track: songs[2], queue: [songs[2]], queueMode: 'radio' })); f.render();
    const nextResponse = f.networkFixture(), next = f.context.production.extendQueue();
    const newRequest = f.context.autoExtendingRef.current;
    firstResponse.resolve({ results: [songs[1]] }); await first;
    const stillOwnsBusy = f.context.autoExtendingRef.current === newRequest;
    nextResponse.resolve({ results: [songs[3]] }); await next;
    assert(f.calls.requests.length > firstRequests, 'A new scope starts its own discovery request');
    assert(oldSignals.every(signal => signal?.aborted), 'The superseded request is aborted');
    assert(stillOwnsBusy, 'The old finally block must not release the new request');
    assert.equal(f.state().youtubeQueue.at(-1).id, songs[3].id);
    assert(!f.state().youtubeQueue.some(track => track.id === songs[1].id), 'The obsolete response cannot append');
    assert.equal(f.context.autoExtendingRef.current, null);
  });
  for (const change of ['source', 'owner']) await check(`Empty discovery cooldown does not block a new ${change}`, async () => {
    const f = fixture(), emptyResponse = f.networkFixture();
    const empty = f.context.production.extendQueue(); emptyResponse.resolve({ results: [] }); await empty;
    assert.equal(f.context.lastExtendEmptyRef.current, true);
    const beforeRequests = f.calls.requests.length;
    if (change === 'owner') f.dispatch(actions.restorePlayback({ owner: 'account:B', snapshot: null }));
    const track = change === 'source' ? songs[2] : songs[0];
    f.dispatch(actions.startYoutubePlayback({ track, queue: [track], queueMode: 'radio' })); f.render();
    const nextResponse = f.networkFixture(), next = f.context.production.extendQueue();
    nextResponse.resolve({ results: [songs[3]] }); await next;
    assert(f.calls.requests.length > beforeRequests, 'The previous scope cannot throttle the new one');
    assert.equal(f.state().youtubeQueue.at(-1).id, songs[3].id);
  });
  await check('Immediate Next honors explicit user priority before React queue refs update', async () => {
    const f = fixture();
    f.dispatch(actions.appendToQueue([songs[1]])); f.render();
    f.dispatch(actions.addToQueue(songs[2]));
    // The rendered queue still points at the automatic song. The real store
    // already contains the user's insertion, which must be selected first.
    assert.equal(f.context.queueRef.current[1].id, songs[1].id);
    assert.equal(f.state().youtubeQueue[1].id, songs[2].id);
    await f.context.production.playNextOrContinue();
    assert.equal(f.state().youtubeVideo.id, songs[2].id);
    assert.equal(f.state().youtubeVideo.queueSource, 'user');
    assert.equal(f.state().isPlaying, true);
  });
  await check('An obsolete recovery finally cannot release a newer same-occurrence request', async () => {
    const f = fixture(), oldResponse = f.alternateFixture();
    const first = f.context.production.handlePlaybackFailure({ code: 'stall' });
    f.dispatch(actions.restorePlayback({ owner: 'account:B', snapshot: null }));
    f.dispatch(actions.startYoutubePlayback({ track: songs[0], queue: [songs[0]], queueMode: 'radio' })); f.render();
    const newResponse = f.alternateFixture(), next = f.context.production.handlePlaybackFailure({ code: 'stall' });
    const newRequest = f.context.failureResolveRef.current;
    oldResponse.resolve(songs[1]); await first;
    const stillOwnsRecovery = f.context.failureResolveRef.current === newRequest;
    const afterOldResponse = f.state().youtubeVideo.id;
    newResponse.resolve(songs[2]); await next;
    assert(stillOwnsRecovery, 'An old owner cannot clear the replacement recovery lock');
    assert.equal(afterOldResponse, songs[0].id, 'The old alternate remains discarded');
    assert.equal(f.state().youtubeVideo.id, songs[2].id);
    assert.equal(f.state().playbackOwner, 'account:B');
    assert.equal(f.context.failureResolveRef.current, null);
  });
  const report = {
    scope: 'Exact production callbacks and actual reducer/queue/radio helpers; deferred local responses only. No network, decoder, browser, native service or audible-device verification.',
    componentSha256: crypto.createHash('sha256').update(component).digest('hex'),
    scopeHelperPresent: bodies.has('capturePlaybackScope'),
    passed: results.filter(result => result.pass).length, total: results.length, results,
  };
  const output = path.resolve(process.env.HAYKASA_PLAYER_COMMAND_ORDER_EVIDENCE || path.join(root, 'artifacts/player-command-order'));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error.split('\n')[0] : ''}`);
  console.log(`${report.passed}/${report.total} player command-order checks passed`);
  if (report.passed !== report.total) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
