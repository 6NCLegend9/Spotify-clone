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

test('later pagination upgrades unknown duration without replacing credits or known lengths', () => {
  const first = { ...tracks[0], duration: 0, artists: [{ name: 'Original artist' }] };
  const incoming = [{ ...first, title: 'Later title', duration: 243 }, { ...tracks[1], duration: 120 }];
  assert.deepEqual(mergePlaylistTracks([first], incoming), [{ ...first, duration: 243 }, incoming[1]]);
  assert.deepEqual(mergePlaylistTracks([{ ...first, duration: 100 }], incoming)[0], { ...first, duration: 100 });
  assert.equal(first.duration, 0);
});
