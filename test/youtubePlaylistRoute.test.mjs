import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the real route with isolated upstream responses; no YouTube credentials.
const source = (await readFile(new URL('../src/app/api/youtube-playlist/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');
const makeRoute = new Function('NextResponse', 'hasYouTubeApiKey', 'youtubeFetch', 'cleanTitle', 'filterMusicPlaybackResults', 'getClientKey', 'isRateLimited', 'apiError', 'handleApiError',
  source.replace(/export /g, '') + '\nreturn GET;');
function routeFor(upstream) {
  return makeRoute({ json: Response.json }, () => true, upstream, x => x, tracks => tracks, () => 'fixture', async () => ({ limited: false }),
    (code, detail) => Response.json({ code, ...detail }, { status: code === 'VALIDATION_ERROR' ? 400 : 404 }),
    () => Response.json({ code: 'INTERNAL_ERROR' }, { status: 500 }));
}
const item = (id, privacyStatus = 'public') => ({ snippet: { resourceId: { videoId: id }, title: id, videoOwnerChannelTitle: 'Artist' }, status: { privacyStatus } });
test('playlist route supplies metadata and pagination while omitting private videos', async () => {
  const calls = [];
  const get = routeFor(async (resource, params) => {
    calls.push([resource, params]);
    return { ok: true, data: resource === 'playlistItems'
      ? { items: [item('abcdefghijk'), item('private0000', 'private')], nextPageToken: 'page_2=' }
      : { items: [{ snippet: { title: 'Shared playlist', channelTitle: 'Creator' } }] } };
  });
  const data = await (await get({ nextUrl: new URL('https://example.com/api?id=PL_test') })).json();
  assert.equal(data.playlist.title, 'Shared playlist');
  assert.deepEqual(data.tracks.map(t => t.id), ['abcdefghijk']);
  assert.equal(data.nextPageToken, 'page_2=');
  assert.equal(calls[0][1].maxResults, '50');
});
test('later pages forward the token without fetching metadata again', async () => {
  const calls = [];
  const get = routeFor(async (resource, params) => { calls.push([resource, params]); return { ok: true, data: { items: [item('lmnopqrstuv')] } }; });
  const data = await (await get({ nextUrl: new URL('https://example.com/api?id=PL_test&pageToken=page_2%3D') })).json();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].pageToken, 'page_2=');
  assert.equal(data.nextPageToken, '');
  assert.equal(data.playlist, null);
});
test('invalid page tokens are rejected before upstream requests', async () => {
  const get = routeFor(() => { throw Error('must not call upstream'); });
  const response = await get({ nextUrl: new URL('https://example.com/api?id=PL_test&pageToken=%3Cscript%3E') });
  assert.equal(response.status, 400);
});
test('a valid empty playlist is distinct from a deleted playlist', async () => {
  for (const exists of [true, false]) {
    const get = routeFor(async resource => ({ ok: true, data: { items: resource === 'playlists' && exists ? [{ snippet: { title: 'Empty playlist' } }] : [] } }));
    const response = await get({ nextUrl: new URL('https://example.com/api?id=PL_test') });
    assert.equal(response.status, exists ? 200 : 404);
  }
});
