import { mergePlaylistTracks } from "../src/utils/discoveryPlaylist.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the real route with isolated upstream responses; no YouTube credentials.
const source = (await readFile(new URL('../src/app/api/youtube-playlist/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');
const durationSource = (await readFile(new URL('../src/utils/youtubeApi.js', import.meta.url), 'utf8')).match(/export function parseIsoDuration[\s\S]*?\n}/)[0];
const parseIsoDuration = new Function(durationSource.replace('export ', '') + '; return parseIsoDuration;')();
const makeRoute = new Function('mergePlaylistTracks', 'NextResponse', 'hasYouTubeApiKey', 'youtubeFetch', 'hydrateYoutubeCatalogTracks', 'parseIsoDuration', 'cleanTitle', 'filterMusicPlaybackResults', 'getClientKey', 'isRateLimited', 'apiError', 'handleApiError',
  source.replace(/export /g, '') + '\nreturn GET;');
function routeFor(upstream) {
  return makeRoute(mergePlaylistTracks, { json: Response.json }, () => true, upstream, async tracks => tracks, parseIsoDuration, x => x, tracks => tracks, () => 'fixture', async () => ({ limited: false }),
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
test('real music mix playlist IDs longer than 64 characters can open their songs', async () => {
  const playlistId = `RDCLAK5uy_${'a'.repeat(65)}`;
  const get = routeFor(async resource => ({ ok: true, data: { items: resource === 'playlistItems'
    ? [item('abcdefghijk')] : [{ snippet: { title: 'Real mix' } }] } }));
  const response = await get({ nextUrl: new URL(`https://example.com/api?id=${playlistId}`) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).playlist.id, playlistId);
});
test('a valid empty playlist is distinct from a deleted playlist', async () => {
  for (const exists of [true, false]) {
    const get = routeFor(async resource => ({ ok: true, data: { items: resource === 'playlists' && exists ? [{ snippet: { title: 'Empty playlist' } }] : [] } }));
    const response = await get({ nextUrl: new URL('https://example.com/api?id=PL_test') });
    assert.equal(response.status, exists ? 200 : 404);
  }
});
test('playlist route retains duration supplied by the fallback listing', async () => {
  const get = routeFor(async resource => ({ ok: true, data: { items: resource === 'playlistItems'
    ? [{ ...item('abcdefghijk'), contentDetails: { duration: 'PT4M3S' } }]
    : [{ snippet: { title: 'Playlist' } }] } }));
  const data = await (await get({ nextUrl: new URL('https://example.com/api?id=PL_test') })).json();
  assert.equal(data.tracks[0].duration, 243);
});

test('duplicate playlist pages upgrade missing duration and preserve the first title', async () => {
  const get = routeFor(async (resource, params) => ({ ok: true, data: resource === 'playlistItems'
    ? params.pageToken ? { items: [{ ...item('abcdefghijk'), contentDetails: { duration: 'PT4M3S' } }] }
      : { items: [{ ...item('abcdefghijk'), snippet: { ...item('abcdefghijk').snippet, title: 'First title' } }], nextPageToken: 'page2' }
    : { items: [{ snippet: { title: 'Playlist' } }] } }));
  const response = await get({ nextUrl: new URL('https://example.com/api/youtube-playlist?id=PL_test') });
  const body = await response.json();
  assert.equal(body.tracks.length, 1);
  assert.equal(body.tracks[0].duration, 243);
  assert.equal(body.tracks[0].title, 'First title');
});
