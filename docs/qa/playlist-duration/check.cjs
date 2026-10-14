const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const modules = new Map(), mocks = {};
const storage = new Map();
function load(file) {
  const absolute = path.resolve(root, file);
  if (modules.has(absolute)) return modules.get(absolute).exports;
  const module = { exports: {} }; modules.set(absolute, module);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const resolve = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const found = [base, `${base}.js`, `${base}.mjs`].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
      if (found) return load(found);
    }
    return require(name);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: resolve, console, URL, URLSearchParams, Date, Map, Set, process, window: {}, sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } });
  return module.exports;
}
const util = load('src/utils/playlistDuration.mjs');
const id = 'abcdefghijk', other = 'ABCDEFGHIJK';
for (const input of [-1, 0, null, undefined, NaN, Infinity, {}, 86401]) assert.equal(util.knownDuration(input), 0);
assert.equal(util.playlistDurationLabel([{ duration: 0 }]), 'Duration unavailable');
assert.equal(util.playlistDurationLabel([{ duration: 218 }, { duration: 0 }]), 'At least 3 min');
assert.equal(util.playlistDurationLabel([{ duration: 218 }, { duration: 62 }]), '4 min');
assert.equal(util.playlistDurationLabel([{ duration: 20 }]), '20 sec');
assert.equal(util.playlistDurationLabel([{ duration: 3605 }]), '1 hr 0 min');
assert.equal(util.withSavedDurations([{ id, duration: 0 }], { [id]: 218 })[0].duration, 218);
assert.equal(util.withSavedDurations([{ id, duration: 225 }], { [id]: 218 })[0].duration, 225);
assert.equal(util.durationMapForMembers([id], new Map([[id, 218], [other, 900]]))[id], 218);
assert.equal(util.durationMapForMembers([], { [id]: 218 })[id], undefined);
let profile = { _id: '507f1f77bcf86cd799439011', favourites: [] };
let playlist = { _id: '507f1f77bcf86cd799439012', name: 'Test', songs: [], user: '507f1f77bcf86cd799439013' };
const realMutation = load('src/utils/documentMutation.mjs');
mocks['next/server'] = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
mocks['@/utils/apiResponse'] = { ApiRouteError: class extends Error {}, readRequestJson: r => r.json(), apiError: code => ({ status: 400, body: { code } }), handleApiError: error => { throw error; } };
mocks['@/utils/trustedOrigin'] = { isTrustedRequestOrigin: () => true };
mocks['@/utils/rateLimit'] = { isRateLimited: async () => ({ limited: false }) };
mocks['@/utils/userAccount'] = { getAuthenticatedAccount: async () => ({ userData: profile, email: 'test@example.invalid' }) };
mocks['@/utils/sessionAuth'] = { getSessionUser: async () => ({ _id: playlist.user }) };
mocks['@/utils/dbconnect'] = { default: async () => {} };
mocks['@/models/UserData'] = { default: 'profile' };
mocks['@/models/Playlist'] = { default: 'playlist' };
mocks['@/utils/documentMutation.mjs'] = { ...realMutation, mutateDocument: async (model, _, transform) => {
  const document = model === 'profile' ? profile : playlist;
  Object.assign(document, transform(document)); return document;
} };
const favourite = load('src/app/api/favourite/route.js');
const songs = load('src/app/api/userPlaylists/songs/route.js');
const request = body => ({ json: async () => body });
(async () => {
  assert.equal((await favourite.POST(request({ id, liked: true, duration: 218 }))).status, 200);
  assert.equal((await favourite.GET({})).body.data.favouriteDurations[id], 218, 'Liked duration survives save/load');
  await favourite.POST(request({ id, liked: true })); assert.equal(profile.favouriteDurations[id], 218, 'Adding without duration preserves known value');
  await favourite.POST(request({ id, liked: false })); assert.equal(profile.favouriteDurations[id], undefined);
  assert.equal((await songs.POST(request({ playlistID: playlist._id, song: id, duration: 218 }))).status, 200);
  assert.equal(playlist.songDurations[id], 218);
  const serialized = load('src/utils/playlistThemes.js').serializePlaylist(playlist, playlist.user);
  assert.equal(serialized.songDurations[id], 218, 'Playlist response preserves duration map');
  await songs.DELETE(request({ playlistID: playlist._id, song: id })); assert.equal(playlist.songDurations[id], undefined);
  for (const duration of [-1, 0, 1e30, null, {}, '218']) {
    assert.equal((await favourite.POST(request({ id, liked: true, duration }))).status, 400);
    assert.equal((await songs.POST(request({ playlistID: playlist._id, song: id, duration }))).status, 400);
  }
  let calls = 0, sent;
  mocks['@/utils/accountStorage.mjs'] = { accountStorageGeneration: () => 0 };
  mocks['@/utils/userError'] = { toUserError: error => error };
  mocks['@/services/http'] = { requestJson: async (_, options) => { calls++; sent = options?.body; return { tracks: [{ id, title: 'Saved song', duration: 0 }], success: true }; } };
  storage.set('HayKasa-track-cache-v1', JSON.stringify({ [id]: { track: { id, duration: 0 }, expiresAt: Date.now() + 999999 } }));
  const library = load('src/services/libraryApi.js');
  const hydrated = await library.hydrateYouTubeTracks([id], { durations: { [id]: 218 } });
  assert.equal(hydrated[0].duration, 218); assert.equal(calls, 1, 'Zero-duration client cache is retried');
  assert.equal(JSON.parse(storage.get('HayKasa-track-cache-v1'))[id], undefined, 'Unknown duration is not cached for 30 minutes');
  const api = load('src/services/playlistApi.js');
  await api.addSongToPlaylist(playlist._id, id, 218); assert.equal(sent.duration, 218);
  await api.addSongToPlaylist(playlist._id, id, 0); assert.equal(sent.duration, undefined);
  const policy = load('src/utils/providerCachePolicy.mjs');
  assert.equal(policy.cacheableProviderResult({ ok: true, durationIncomplete: true, data: { items: [{ snippet: { title: 'Song' } }] } }), false, 'Incomplete durations do not poison shared cache');
  console.log('PASS: save/load/remove durations in both APIs, invalid duration rejection, serialization, zero-cache retry, provider precedence, honest total labels, service payload and incomplete-provider cache policy');
})().catch(error => { console.error(error); process.exitCode = 1; });
