import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionPlayback, discoveryPlaylistHref, mergePlaylistTracks } from '../src/utils/discoveryPlaylist.mjs';

const tracks = [{ id: 'abcdefghijk', title: 'First' }, { id: 'lmnopqrstuv', title: 'Second' }];
test('mix and featured playlist links survive direct navigation and special characters', () => {
  assert.equal(discoveryPlaylistHref({ id: 'cat-Hip-Hop' }), '/mix/cat-Hip-Hop');
  const url = new URL(discoveryPlaylistHref({ playlistId: 'PL_test', title: 'R&B / Hits', channel: 'A & B' }), 'https://example.com');
  assert.equal(url.pathname, '/youtube-playlist/PL_test');
  assert.equal(url.searchParams.get('title'), 'R&B / Hits');
  assert.equal(url.searchParams.get('creator'), 'A & B');
});
test('playing a mix retains every song and selects the requested track instead of starting radio', () => {
  const playback = collectionPlayback({ id: 'mood-chill', title: 'Chill Mix', query: 'chill' }, tracks, tracks[1].id);
  assert.deepEqual(playback.queue.map(t => t.id), tracks.map(t => t.id));
  assert.equal(playback.track.id, tracks[1].id);
  assert.equal(playback.queueMode, 'collection');
  assert.equal(playback.autoExtend, false);
  assert.deepEqual(playback.context, { type: 'playlist', id: 'mood-chill', name: 'Chill Mix' });
});
test('pagination preserves order, removes duplicates and ignores invalid entries', () => {
  assert.deepEqual(mergePlaylistTracks([tracks[0]], [null, {}, tracks[0], tracks[1]]), tracks);
  assert.equal(collectionPlayback({ id: 'empty' }, null), null);
});
