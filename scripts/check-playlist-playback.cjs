// Run the actual reducer/helpers with local tracks; this does not claim live audio playback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const ts = requireFromRoot('typescript');
const filename = path.join(root, 'src/redux/features/playerSlice.js');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled)(createRequire(filename), loaded, loaded.exports);
const actions = loaded.exports;
const reducer = actions.default;
const songs = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee']
  .map((id, index) => ({ id, title: `Song ${index + 1}`, channel: `Artist ${index + 1}`, duration: 180, playlistEntryId: `saved-${index + 1}` }));
const context = (id = 'collection-A') => ({ type: 'playlist', id, name: id });
const occurrences = state => state.youtubeQueue.map(track => track.queueEntryId);
const contents = state => state.youtubeQueue.map(track => track.id);
function collection(queue = songs, index = 0, initial, id = 'collection-A') {
  const action = actions.startYoutubePlayback({ queue, track: queue[index], index, queueMode: 'collection', autoExtend: false, context: context(id) });
  action.payload.shuffleSeed = 0.123;
  return reducer(initial, action);
}
function shuffle(state, enabled) {
  const action = actions.setQueueShuffle(enabled);
  action.payload.seed = 0.321;
  return reducer(state, action);
}
const results = [];
async function check(name, test) {
  try { await test(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.stack }); }
}

(async () => {
  const queueHelpers = await import('../src/utils/playerQueue.mjs');
  const { normalizePlaybackSnapshot } = await import('../src/utils/playbackSnapshot.mjs');
  await check('shuffle preserves current audio identity, Pause, position and history', () => {
    let before = collection(songs, 1);
    before = { ...before, isPlaying: false, position: 71, restorePosition: 11, history: [before.youtubeQueue[0]] };
    const after = shuffle(before, true);
    assert.equal(after.shuffleEnabled, true);
    assert.strictEqual(after.youtubeVideo, before.youtubeVideo);
    assert.equal(after.isPlaying, false);
    assert.equal(after.position, 71);
    assert.equal(after.restorePosition, 11);
    assert.strictEqual(after.history, before.history);
    assert.deepEqual(after.youtubeQueue.slice(0, 2), before.youtubeQueue.slice(0, 2));
    assert.notDeepEqual(occurrences(after), occurrences(before));
    assert.deepEqual(occurrences(shuffle(after, false)), occurrences(before));
  });
  await check('shuffle reducer replays the same prepared action deterministically', () => {
    const before = collection();
    const action = actions.setQueueShuffle(true);
    assert.deepEqual(reducer(before, action), reducer(before, action));
    const start = actions.startYoutubePlayback({ queue: songs, track: songs[0], queueMode: 'collection' });
    assert.deepEqual(reducer(shuffle(before, true), start), reducer(shuffle(before, true), start));
  });
  await check('starting another collection obeys shuffle and replaces its restore baseline', () => {
    const shuffled = shuffle(collection(), true);
    const second = songs.map((song, index) => ({ ...song, playlistEntryId: `second-${index}` }));
    const after = collection(second, 0, shuffled, 'collection-B');
    assert.equal(after.shuffleEnabled, true);
    assert.equal(after.playbackContext.id, 'collection-B');
    assert.notDeepEqual(contents(after), second.map(track => track.id));
    assert.equal(after.youtubeVideo.playlistEntryId, 'second-0');
    assert.deepEqual(contents(shuffle(after, false)), second.map(track => track.id));
    assert.equal(after.unshuffledQueueEntryIds.some(id => occurrences(shuffled).includes(id)), false);
  });
  await check('shuffle off keeps already played order while restoring only upcoming collection', () => {
    let state = shuffle(collection(), true);
    const next = queueHelpers.nextQueueTrack(state.youtubeQueue, state.youtubeVideo);
    state = reducer(state, actions.setYoutubeVideo(next));
    const prefix = state.youtubeQueue.slice(0, 2);
    const after = shuffle(state, false);
    assert.deepEqual(after.youtubeQueue.slice(0, 2), prefix);
    assert.strictEqual(after.youtubeVideo, state.youtubeVideo);
    const pending = songs.filter(song => !prefix.some(track => track.id === song.id)).map(song => song.id);
    assert.deepEqual(after.youtubeQueue.slice(2).map(song => song.id), pending);
  });
  await check('replacement station has its own shuffle baseline without resuming paused audio', () => {
    let before = shuffle(collection(), true);
    before = reducer(before, actions.playPause(false));
    const after = reducer(before, actions.replaceUpcomingYoutubeQueue({
      tracks: songs.slice(1), expectedCurrent: before.youtubeVideo, expectedOwner: before.playbackOwner,
    }));
    // The action requires an authenticated/guest ownership scope; give the
    // fixture one before accepting the replacement.
    assert.strictEqual(after, before);
    before = { ...before, playbackOwner: 'account:A' };
    const accepted = reducer(before, actions.replaceUpcomingYoutubeQueue({
      tracks: songs.slice(1), expectedCurrent: before.youtubeVideo, expectedOwner: 'account:A',
    }));
    assert.strictEqual(accepted.youtubeVideo, before.youtubeVideo);
    assert.equal(accepted.isPlaying, false);
    assert.deepEqual(contents(shuffle(accepted, false)), songs.map(song => song.id));
    assert.equal(accepted.youtubeQueue.slice(1).some(track => occurrences(before).includes(track.queueEntryId)), false);
  });
  await check('empty-deck station keeps its selected first occurrence when shuffle is enabled', () => {
    let before = reducer(undefined, actions.restorePlayback({ owner: 'account:A', snapshot: null }));
    before = shuffle(before, true);
    const after = reducer(before, actions.replaceUpcomingYoutubeQueue({ tracks: songs, expectedOwner: 'account:A' }));
    assert.equal(after.youtubeVideo.id, songs[0].id);
    assert.equal(after.youtubeQueue[0].queueEntryId, after.youtubeVideo.queueEntryId);
    assert.deepEqual(contents(shuffle(after, false)), songs.map(song => song.id));
  });
  await check('explicit queue additions play in insertion order before remaining collection', () => {
    let state = collection(songs.slice(0, 3));
    const original = state.youtubeQueue;
    state = reducer(state, actions.addToQueue(songs[3]));
    state = reducer(state, actions.addToQueue(songs[4]));
    assert.deepEqual(contents(state), [songs[0].id, songs[3].id, songs[4].id, songs[1].id, songs[2].id]);
    assert.deepEqual(state.youtubeQueue.filter(track => track.queueSource === 'context'), original);
    for (const expected of [songs[3], songs[4], songs[1], songs[2]]) {
      const next = queueHelpers.nextQueueTrack(state.youtubeQueue, state.youtubeVideo);
      assert.equal(next.id, expected.id);
      state = reducer(state, actions.setYoutubeVideo(next));
    }
    assert.equal(queueHelpers.nextQueueTrack(state.youtubeQueue, state.youtubeVideo), null);
  });
  await check('explicit additions retain priority and order through shuffle on and off', () => {
    let state = collection();
    state = reducer(state, actions.addToQueue(songs[3]));
    state = reducer(state, actions.addToQueue(songs[4]));
    const pending = state.userQueue.map(track => track.queueEntryId);
    for (const enabled of [true, false]) {
      state = shuffle(state, enabled);
      assert.deepEqual(state.youtubeQueue.slice(1, 3).map(track => track.queueEntryId), pending);
      assert.deepEqual(state.userQueue.map(track => track.queueEntryId), pending);
    }
  });
  await check('adding the current recording creates a distinct next occurrence', () => {
    const before = collection();
    const after = reducer(before, actions.addToQueue(before.youtubeVideo));
    const next = queueHelpers.nextQueueTrack(after.youtubeQueue, after.youtubeVideo);
    assert.equal(next.id, after.youtubeVideo.id);
    assert.notEqual(next.queueEntryId, after.youtubeVideo.queueEntryId);
    assert.equal(queueHelpers.queueAdvanceDecision(after.youtubeVideo, next), 'advance');
  });
  await check('restoring pending queue excludes already played user occurrences and current', () => {
    let state = collection();
    state = reducer(state, actions.addToQueue(songs[3]));
    state = reducer(state, actions.addToQueue(songs[4]));
    state = reducer(state, actions.setYoutubeVideo(state.userQueue[0]));
    const pending = state.userQueue.map(track => track.queueEntryId);
    const restored = reducer(state, actions.restorePlayback({ owner: 'account:A', snapshot: state }));
    assert.deepEqual(restored.userQueue.map(track => track.queueEntryId), pending);
    assert.equal(restored.userQueue.some(track => track.queueEntryId === restored.youtubeVideo.queueEntryId), false);
    assert.deepEqual(occurrences(restored), occurrences(state));
  });
  await check('second saved occurrence stays selected across shuffle and snapshot restore', () => {
    const repeated = [songs[0], songs[1], { ...songs[0], playlistEntryId: 'saved-repeat' }, songs[2]];
    const state = shuffle(collection(repeated, 2), true);
    assert.equal(state.youtubeVideo.playlistEntryId, 'saved-repeat');
    assert.equal(state.youtubeVideo.queueEntryId, state.youtubeQueue[2].queueEntryId);
    const restored = reducer(undefined, actions.restorePlayback({ owner: 'account:A', snapshot: state }));
    assert.equal(restored.youtubeVideo.playlistEntryId, 'saved-repeat');
    assert.equal(restored.youtubeVideo.queueEntryId, state.youtubeVideo.queueEntryId);
    assert.equal(restored.shuffleEnabled, true);
    assert.deepEqual(restored.unshuffledQueueEntryIds, state.unshuffledQueueEntryIds);
  });
  await check('provider replacement preserves saved playlist identity and queue occurrence', () => {
    const before = collection(songs, 1);
    const after = reducer(before, actions.replaceCurrentYoutubeTrack(songs[4]));
    assert.equal(after.youtubeVideo.playlistEntryId, before.youtubeVideo.playlistEntryId);
    assert.equal(after.youtubeVideo.queueEntryId, before.youtubeVideo.queueEntryId);
  });
  await check('snapshot bounds optional saved identity and rejects unknown shuffle baseline entries', () => {
    const state = collection([{ ...songs[0], playlistEntryId: 'p'.repeat(500), privateReceipt: 'must not persist' }]);
    const normalized = normalizePlaybackSnapshot({ ...state, unshuffledQueueEntryIds: ['missing', ...occurrences(state), ...occurrences(state)] });
    assert.equal(normalized.youtubeVideo.playlistEntryId.length, 160);
    assert.equal('privateReceipt' in normalized.youtubeVideo, false);
    assert.deepEqual(normalized.unshuffledQueueEntryIds, occurrences(state));
    const legacy = normalizePlaybackSnapshot({ youtubeVideo: songs[0], youtubeQueue: songs });
    assert.equal(legacy.shuffleEnabled, false);
  });
  await check('fresh collection launches keep transient queue identities fresh', () => {
    const before = collection();
    const after = collection(songs, 0, before);
    assert.equal(occurrences(after).some(id => occurrences(before).includes(id)), false);
    assert.equal(after.youtubeVideo.playlistEntryId, before.youtubeVideo.playlistEntryId);
  });
  console.log(JSON.stringify({ checks: results.length, passed: results.filter(result => result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
