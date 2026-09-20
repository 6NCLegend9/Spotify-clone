import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./support/activity-loader.mjs', import.meta.url);
const { ApiRouteError } = await import('../src/utils/apiResponseCore.mjs');
let document, writes, authorized;
const fixtures = globalThis.__activityFixtures = {
  limited: false,
  account: async () => {
    if (!authorized) throw new ApiRouteError('UNAUTHORIZED');
    return { email: 'listener@example.test', userData: document };
  },
  model: {
    findById(id) { assert.equal(id, 'listener'); return { lean: async () => structuredClone(document) }; },
    findOneAndUpdate(query, update) {
      assert.equal(query._id, 'listener');
      writes++;
      Object.assign(document, update.$set);
      document.__v++;
      return { lean: async () => structuredClone(document) };
    },
  },
};
const history = await import('../src/app/api/history/route.js');
const searches = await import('../src/app/api/searches/route.js');
const request = (body, method = 'DELETE') => new Request('http://localhost/api/activity', {
  method, headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
beforeEach(() => {
  document = { _id: 'listener', __v: 0, songHistory: [{ id: 'abcdefghijk', title: 'One' }, { id: 'lmnopqrstuv', title: 'Two' }], searches: ['One', 'Two'], settings: {} };
  writes = 0; authorized = true; fixtures.limited = false;
});
test('missing or malformed delete targets never clear activity', async () => {
  for (const route of [history, searches]) for (const body of [{}, '{', null]) {
    const response = await route.DELETE(request(body));
    assert.equal(response.status, 400);
  }
  assert.equal(writes, 0);
  assert.equal(document.songHistory.length, 2); assert.deepEqual(document.searches, ['One', 'Two']);
});
test('history removal deletes only selected song and disables caching', async () => {
  const response = await history.DELETE(request({ id: 'abcdefghijk' }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(document.songHistory.map(x => x.id), ['lmnopqrstuv']);
});
test('search deletion is case insensitive and preserves unrelated terms', async () => {
  const response = await searches.DELETE(request({ term: ' ONE ' }));
  assert.equal(response.status, 200); assert.deepEqual(document.searches, ['Two']);
});
test('authentication and rate limits prevent writes', async () => {
  for (const route of [history, searches]) {
    authorized = false;
    assert.equal((await route.DELETE(request({ id: 'abcdefghijk', term: 'One' }))).status, 401);
    authorized = true; fixtures.limited = true;
    assert.equal((await route.DELETE(request({ id: 'abcdefghijk', term: 'One' }))).status, 429);
  }
  assert.equal(writes, 0);
});
test('history caps at 100 and moves a replayed song to the front', async () => {
  document.songHistory = Array.from({ length: 100 }, (_, i) => ({ id: String(i).padStart(11, '0'), title: `Song ${i}` }));
  const entry = { id: 'abcdefghijk', title: 'New' };
  assert.equal((await history.POST(request({ entry }, 'POST'))).status, 200);
  assert.equal(document.songHistory.length, 100); assert.equal(document.songHistory[0].id, entry.id);
  await history.POST(request({ entry: document.songHistory[50] }, 'POST'));
  assert.equal(document.songHistory.length, 100); assert.equal(new Set(document.songHistory.map(x => x.id)).size, 100);
  assert.ok(document.songHistory[0].playedAt);
});
test('history stores only allowlisted artwork hosts', async () => {
  const allowed = 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg';
  assert.equal((await history.POST(request({ entry: { id: 'abcdefghijk', title: 'One', thumbnail: 'https://images.unsplash.com/photo-x' } }, 'POST'))).status, 200);
  assert.equal(document.songHistory[0].thumbnail, '');
  assert.equal((await history.POST(request({ entry: { id: 'abcdefghijk', title: 'One', thumbnail: allowed } }, 'POST'))).status, 200);
  assert.equal(document.songHistory[0].thumbnail, allowed);
});
test('private sessions do not record history or searches', async () => {
  document.settings.privateSession = true;
  const historyResponse = await history.POST(request({ entry: { id: 'abcdefghijk', title: 'One' } }, 'POST'));
  const searchResponse = await searches.POST(request({ term: 'Private' }, 'POST'));
  assert.equal(historyResponse.status, 200);
  assert.equal(searchResponse.status, 200);
  assert.equal(historyResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(searchResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(writes, 0);
});
