// Offline integration: run the actual recommendation route and home-feed hook.
// Only account/database/provider/browser boundaries are substituted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => mocks[name] || require(name), console, URL, URLSearchParams, AbortController, Date, ...globals });
  return module.exports;
}
const identities = load('src/utils/songIdentity.mjs');
const discovery = load('src/utils/homeDiscovery.mjs', { './songIdentity.mjs': identities });
const seeds = load('src/utils/recommendationSeeds.mjs', { './genreNormalization.mjs': load('src/utils/genreNormalization.mjs') });
const music = load('src/utils/officialMusicSearch.mjs');
const explicit = load('src/utils/explicitContent.mjs');
const feedback = load('src/utils/recommendationFeedback.mjs');
const profile = { genres: ['Jazz', 'Soul', 'Pop', 'Rock'], followedArtists: ['Artist One', 'Artist Two', 'Artist Three'], songHistory: [{ id: 'history0001', title: 'Recent song', channel: 'Recent Artist' }], searches: ['Old search', 'New search'], settings: { explicitContent: false } };
const allSeeds = Array.from({ length: 48 }, (_, rotation) => seeds.buildPersonalizedSeeds(profile, { rotation })).flat();
for (const query of ['Rock', 'Artist Three', 'Recent Artist', 'New search']) assert(allSeeds.some(seed => seed.query === query), `Missing signal: ${query}`);
assert.equal(seeds.buildPersonalizedSeeds({ searches: ['Old', 'New'] })[0].query, 'New');
for (let rotation = 0; rotation < 8; rotation++) {
  const privateSeeds = seeds.buildPersonalizedSeeds({ ...profile, settings: { privateSession: true } }, { rotation });
  assert(privateSeeds.every(seed => !/Recent Artist|search/.test(seed.query)));
  assert.equal(new Set(privateSeeds.map(seed => seed.query)).size, privateSeeds.length);
}
assert(seeds.buildPersonalizedSeeds(null).length > 0);
const track = (i, artist = `Artist ${i % 8}`) => ({ id: `id${String(i).padStart(9, '0')}`, title: `Song number ${i}`, channel: artist });
const pool = Array.from({ length: 80 }, (_, i) => track(i));
const initial = discovery.selectHomeDiscovery([pool], { rotation: 1 }).recommendations;
const rotated = discovery.selectHomeDiscovery([pool], { rotation: 2 }).recommendations;
assert.notEqual(initial.map(t => t.id).join(), rotated.map(t => t.id).join(), 'Refresh changes the selected music');
const fresh = discovery.selectHomeDiscovery([pool], { rotation: 3, seenIds: initial.map(t => t.id) }).recommendations;
assert(fresh.every(t => !initial.some(old => old.id === t.id)), 'Unseen tracks precede seen ones');
assert.equal(new Set(initial.slice(0, 8).map(t => t.channel)).size, 8, 'First row balances artists');
const overlapping = discovery.selectHomeDiscovery([pool.slice(0, 45), pool.slice(20)], { rotation: 4 });
const displayed = [...overlapping.recommendations, ...overlapping.genreVideos.flat()];
assert.equal(new Set(displayed.map(t => t.id)).size, displayed.length, 'No duplicate across rows');
assert(overlapping.genreVideos.every(videos => videos.length === 6), 'Overlapping rows refill with distinct candidates');
const variants = discovery.selectHomeDiscovery([[{ id: 'a', title: 'Singer - Same Song (Official Audio)', channel: 'Singer' }, { id: 'b', title: 'Singer - Same Song (Official Video)', channel: 'Singer' }]]);
assert.equal(variants.recommendations.length, 1);
assert.equal(discovery.selectHomeDiscovery([pool.slice(0, 3)], { seenIds: pool.map(t => t.id) }).recommendations.length, 3, 'Exhausted pool stays usable');
assert.equal(discovery.discoverySeenIds([...pool, ...pool].map(t => t.id)).length, 80);
assert.equal(discovery.discoverySeenIds(Array.from({ length: 200 }, (_, i) => track(i).id)).length, 96);
assert.equal(discovery.discoverySeenIds([null, {}, '<script>', 'bad']).length, 0);
let account = { userData: structuredClone(profile) }, rotation = 0, providerCalls = 0, limited = false;
const route = load('src/app/api/recommendations/route.js', {
  'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers || {} }) } },
  '@/models/UserData': {}, '@/models/Genre': {}, '@/services/genreCatalog': {}, '@/utils/genreTaxonomy': {}, '@/utils/trustedOrigin': {},
  '@/utils/youtubeApi': { youtubeFetch: async (endpoint, params) => {
    providerCalls++;
    if (params.type === 'playlist') return { ok: true, data: { items: [] } };
    const items = pool.map(t => ({ id: endpoint === 'videos' ? t.id : { videoId: t.id }, snippet: { title: t.title, channelTitle: t.channel }, status: { embeddable: true, privacyStatus: 'public' } }));
    return { ok: true, data: { items } };
  } },
  '@/utils/text': { cleanTitle: s => s, cleanArtist: s => s },
  '@/utils/explicitContent.mjs': explicit,
  '@/utils/rateLimit': { getClientKey: () => 'test', isRateLimited: async () => ({ limited, retryAfter: 60 }) },
  '@/utils/recommendationSeeds.mjs': seeds,
  '@/utils/officialMusicSearch.mjs': music,
  '@/utils/songIdentity.mjs': identities,
  '@/utils/apiResponse': { apiError: (code, options) => ({ status: code === 'RATE_LIMITED' ? 429 : 400, body: { code, ...options } }), handleApiError: error => { throw error; } },
  '@/utils/userAccount': { getAuthenticatedAccount: async () => account },
  '@/utils/recommendationFeedback.mjs': feedback,
  '@/utils/homeDiscovery.mjs': discovery,
  'node:crypto': { randomInt: () => rotation++ },
});
const get = (query = '') => route.GET({ url: `https://example.invalid/api/recommendations${query}` });
const tick = () => new Promise(resolve => setImmediate(resolve));
function storage() { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values }; }
async function hookCheck() {
  const slots = [], effects = [], cleanup = [];
  let index = 0, identity = 'alice', privateSession = false;
  const sessionStorage = storage(), localStorage = storage(), requests = [];
  const realCache = load('src/utils/accountCache.mjs', { './accountStorage.mjs': load('src/utils/accountStorage.mjs') });
  const react = {
    useState: initial => { const key = index++; if (!(key in slots)) slots[key] = initial; return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }]; },
    useMemo: fn => { index++; return fn(); },
    useEffect: (fn, deps) => { const key = index++; if (!slots[key] || deps.some((value, i) => value !== slots[key][i])) { slots[key] = deps; effects.push(() => { cleanup[key]?.(); cleanup[key] = fn(); }); } },
  };
  const hook = load('src/hooks/useHomeFeed.js', {
    react, 'react-redux': { useDispatch: () => dispatch, useSelector: fn => fn({ settings: { privateSession, explicitContent: false } }) },
    'next-auth/react': { useSession: () => ({ status: 'authenticated', data: { user: { id: identity } } }) },
    '@/redux/features/loadingBarSlice': { setProgress: value => value },
    '@/services/http': { requestJson: async (url, options) => { if (!url.startsWith('/api/recommendations')) return {}; requests.push({ url, options }); return (await get(url.slice('/api/recommendations'.length))).body; } },
    '@/services/playlistApi': { getUserPlaylists: async () => ({ success: true, data: { playlists: [] } }) },
    '@/utils/userError': { toUserError: value => value },
    '@/utils/accountCache.mjs': realCache, '@/utils/explicitContent.mjs': explicit,
    '@/utils/homeDiscovery.mjs': discovery,
    '@/utils/recentActivity.mjs': { HISTORY_CHANGED: 'history', prependHistory: list => list },
  }, { sessionStorage, localStorage, window: { addEventListener() {}, removeEventListener() {} } }).default;
  function dispatch() {}
  function render() { index = 0; const value = hook(); effects.splice(0).forEach(fn => fn()); return value; }
  render(); await tick(); let home = render();
  const first = home.trending.map(t => t.id);
  home.retry(); render(); await tick(); home = render();
  assert(requests.at(-1).url.includes('seen='), 'Refresh sends prior impressions');
  assert.equal(requests.at(-1).options.cache, 'no-store');
  assert(home.trending.every(t => !first.includes(t.id)), 'Refreshed UI gets unseen songs');
  identity = 'bob'; render(); await tick(); render();
  assert.equal(requests.at(-1).url, '/api/recommendations', 'Account switch does not reuse seen tracks');
  const storedBeforePrivate = JSON.stringify([...sessionStorage.values]);
  privateSession = true; render(); await tick(); render();
  assert.equal(requests.at(-1).url, '/api/recommendations', 'Private session does not read impressions');
  assert.equal(JSON.stringify([...sessionStorage.values]), storedBeforePrivate, 'Private session does not persist impressions');
  cleanup.forEach(fn => fn?.());
}
(async () => {
  let result = await get();
  assert.equal(result.status, 200); assert.equal(result.headers['Cache-Control'], 'private, no-store');
  const firstIds = discovery.homeDiscoveryIds(result.body.sections);
  const callsBefore = providerCalls;
  // Same seed queries reuse cached candidates; impressions still change selection.
  rotation = 0;
  result = await get(`?seen=${firstIds.join(',')}`);
  assert(result.body.sections.trending.every(t => !firstIds.includes(t.id)));
  assert(providerCalls - callsBefore <= 1, 'Video candidates are reused; empty playlists may retry');
  account.userData.notInterested = [pool[0].id]; account.userData.skippedTracks = [pool[1].id];
  account.userData.snoozedTracks = [pool[2].id]; account.userData.snoozedUntil = { [pool[2].id]: new Date(Date.now() + 60000) };
  account.userData.songHistory = [pool[3]];
  const blocked = new Set(pool.slice(0, 4).map(t => t.id));
  result = await get();
  assert(discovery.homeDiscoveryIds(result.body.sections).every(id => !blocked.has(id)), 'Feedback and history exclusions remain enforced');
  assert.equal((await get(`?seen=${'x'.repeat(1153)}`)).status, 400);
  limited = true; assert.equal((await get()).status, 429); limited = false;
  account = null; result = await get(); assert.equal(result.body.mode, 'guest'); assert(result.body.sections.trending.length);
  account = { userData: structuredClone(profile) }; await hookCheck();
  console.log('PASS: rotated taste families, recent search priority, private-session signals, artist diversity, unseen priority, recording/row dedupe, sparse fallback, bounded IDs, actual API/cache/feedback/history/rate limits, actual hook refresh/account isolation/private storage');
})().catch(error => { console.error(error); process.exitCode = 1; });
