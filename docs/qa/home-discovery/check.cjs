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
const genreNormalization = load('src/utils/genreNormalization.mjs');
const seeds = load('src/utils/recommendationSeeds.mjs', { './genreNormalization.mjs': genreNormalization, './genreTaxonomy.js': load('src/utils/genreTaxonomy.js', { './genreNormalization.mjs': genreNormalization }) });
const music = load('src/utils/officialMusicSearch.mjs');
const explicit = load('src/utils/explicitContent.mjs');
const feedback = load('src/utils/recommendationFeedback.mjs');
const profile = { genres: ['Jazz', 'Soul', 'Pop', 'Rock'], followedArtists: ['Artist One', 'Artist Two', 'Artist Three'], songHistory: [{ id: 'history0001', title: 'Recent song', channel: 'Recent Artist' }], searches: ['Old search', 'New search'], settings: { explicitContent: false } };
const allSeeds = Array.from({ length: 48 }, (_, rotation) => seeds.buildPersonalizedSeeds(profile, { rotation })).flat();
for (const query of ['Rock', 'Artist Three']) assert(allSeeds.some(seed => seed.query === query), `Missing taste signal: ${query}`);
assert(allSeeds.every(seed => seed.basis === 'taste'), 'Saved taste takes priority over incidental activity');
const activity = { songHistory: [{ channel: 'Recent Artist' }], searches: ['Old search', 'New search'] };
assert(seeds.buildPersonalizedSeeds(activity).some(seed => seed.query === 'Recent Artist'));
assert(seeds.buildPersonalizedSeeds(activity).some(seed => seed.query === 'New search'));
assert.equal(seeds.resolveRecommendationPlan('personalized', null).kind, 'popular');
assert.equal(seeds.buildPersonalizedSeeds({ ...activity, settings: { privateSession: true } }).length, 0);
const jazzPlan = seeds.resolveRecommendationPlan('personalized', { genres: ['Jazz'] }, { rotation: 0 });
assert(jazzPlan.explorationSeeds.every(seed => !['Jazz', 'Pop'].includes(seed.query) && seed.fresh), 'Exploration uses related styles and recent publication searches');
assert(seeds.buildPersonalizedSeeds({ followedArtistsMeta: [{ name: 'Metadata Artist' }] }).some(seed => seed.query === 'Metadata Artist'));
assert.equal(seeds.buildPersonalizedSeeds({ searches: ['Old', 'New'] })[0].query, 'New');
for (let rotation = 0; rotation < 8; rotation++) {
  const privateSeeds = seeds.buildPersonalizedSeeds({ ...profile, settings: { privateSession: true } }, { rotation });
  assert(privateSeeds.every(seed => !/Recent Artist|search/.test(seed.query)));
  assert.equal(new Set(privateSeeds.map(seed => seed.query)).size, privateSeeds.length);
}
assert.equal(seeds.buildPersonalizedSeeds(null).length, 0);
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
const providerQueries = [];
const route = load('src/app/api/recommendations/route.js', {
  'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers || {} }) } },
  '@/models/UserData': {}, '@/models/Genre': {}, '@/services/genreCatalog': {}, '@/utils/genreTaxonomy': {}, '@/utils/trustedOrigin': {},
  '@/utils/youtubeApi': { youtubeFetch: async (endpoint, params) => {
    providerCalls++;
    providerQueries.push({ endpoint, ...params });
    if (params.type === 'playlist') return { ok: true, data: { items: Array.from({ length: 12 }, (_, i) => ({ id: { playlistId: `PLfixture${String(i).padStart(8, '0')}` }, snippet: { title: `Playlist number ${i}`, channelTitle: 'Curator' } })) } };
    const items = pool.map(t => ({ id: endpoint === 'videos' ? t.id : { videoId: t.id }, snippet: { title: t.title, channelTitle: t.channel, publishedAt: new Date().toISOString() }, status: { embeddable: true, privacyStatus: 'public' } }));
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
  assert(requests.at(-1).url.includes('seenPlaylists='), 'Refresh also rotates previously displayed playlists');
  assert(home.trending.every(t => !first.includes(t.id)), 'Refreshed UI gets unseen songs');
  identity = 'bob'; render(); await tick(); render();
  assert.equal(requests.at(-1).url, '/api/recommendations', 'Account switch does not reuse seen tracks');
  const storedBeforePrivate = JSON.stringify([...sessionStorage.values]);
  privateSession = true; render(); await tick(); render();
  assert.equal(requests.at(-1).url, '/api/recommendations', 'Private session does not read impressions');
  assert.equal(JSON.stringify([...sessionStorage.values]), storedBeforePrivate, 'Private session does not persist impressions');
  cleanup.forEach(fn => fn?.());
}
async function highlightCheck() {
  const slots = [], effects = [], cleanup = [];
  let index = 0, identity = 'alice', status = 'authenticated', privateSession = false, explicitContent = false, failWeek = false, favouriteCalls = 0, hold = null;
  const today = new Date(), likedAt = new Date(today); likedAt.setFullYear(today.getFullYear() - 1);
  const memory = { id: 'ann00000001', title: 'Anniversary song', channel: 'Memory' };
  const weekly = { id: 'wk000000001', title: 'Weekly song', channel: 'Weekly' };
  const blockedTrack = { id: 'ex000000001', title: 'Explicit song', explicit: true };
  const react = {
    useState: initial => { const key = index++; if (!(key in slots)) slots[key] = initial; return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }]; },
    useEffect: (fn, deps) => { const key = index++; if (!slots[key] || deps.some((value, i) => value !== slots[key][i])) { slots[key] = deps; effects.push(() => { cleanup[key]?.(); cleanup[key] = fn(); }); } },
  };
  const hook = load('src/hooks/useHomeHighlights.js', {
    react, 'react-redux': { useSelector: fn => fn({ settings: { privateSession, explicitContent } }) },
    'next-auth/react': { useSession: () => ({ status, data: { user: { id: identity } } }) },
    '@/services/http': { requestJson: async () => { if (failWeek) throw Error('offline'); return { tracks: [weekly, blockedTrack] }; } },
    '@/services/libraryApi': {
      getFavouriteLibrary: async () => { favouriteCalls++; if (hold) await hold; return { favouriteAddedAt: { [memory.id]: likedAt.toISOString() } }; },
      hydrateYouTubeTracks: async ids => [memory, weekly, blockedTrack].filter(track => ids.includes(track.id)),
    },
    '@/utils/accountCache.mjs': { accountOwner: (session, state) => state === 'unauthenticated' ? 'guest' : `account:${session.user.id}` },
    '@/utils/explicitContent.mjs': explicit,
    '@/utils/thisDayOnKasa.mjs': load('src/utils/thisDayOnKasa.mjs', { './youtubeVideoId.mjs': load('src/utils/youtubeVideoId.mjs') }),
  }).default;
  let refreshing = false;
  function render() { index = 0; const value = hook(refreshing); effects.splice(0).forEach(fn => fn()); return value; }
  render(); await tick(); let value = render();
  assert.equal(value.anniversary[0].id, memory.id);
  assert.deepEqual(Array.from(value.weekly, track => track.id), [weekly.id], 'Explicit weekly tracks are excluded');
  explicitContent = true; assert.equal(render().weekly.length, 2, 'Explicit setting applies immediately');
  privateSession = true; assert.equal(render().anniversary.length, 0, 'Private session hides memories before effects settle');
  await tick(); assert.equal(render().anniversary.length, 0);
  const beforeGuest = favouriteCalls; status = 'unauthenticated'; render(); await tick(); assert.equal(render().anniversary.length, 0); assert.equal(favouriteCalls, beforeGuest, 'Guest does not fetch a personal library');
  status = 'authenticated'; privateSession = false; failWeek = true; identity = 'bob'; render(); await tick(); value = render();
  assert.equal(value.anniversary.length, 1, 'Weekly failure does not suppress memories'); assert.equal(value.weekly.length, 0);
  let release; hold = new Promise(resolve => { release = resolve; }); identity = 'alice'; render();
  status = 'unauthenticated'; assert.equal(render().anniversary.length, 0); release(); await tick(); assert.equal(render().anniversary.length, 0, 'A stale account request cannot restore memories after logout');
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
  assert.equal(providerCalls, callsBefore, 'Per-query candidates and playlists are reused');
  assert.equal(result.body.sections.forYou.tracks.length, 12);
  assert.equal(result.body.sections.explore.tracks.length, 12);
  assert.equal(result.body.sections.forYou.playlists.length, 4);
  assert.equal(result.body.sections.explore.playlists.length, 4);
  const listIds = [...result.body.sections.forYou.playlists, ...result.body.sections.explore.playlists].map(p => p.id);
  assert.equal(new Set(listIds).size, listIds.length, 'Distinct playlists across both halves');
  account.userData.notInterested = [pool[0].id]; account.userData.skippedTracks = [pool[1].id];
  account.userData.snoozedTracks = [pool[2].id]; account.userData.snoozedUntil = { [pool[2].id]: new Date(Date.now() + 60000) };
  account.userData.songHistory = [pool[3]];
  const blocked = new Set(pool.slice(0, 4).map(t => t.id));
  result = await get();
  assert(discovery.homeDiscoveryIds(result.body.sections).every(id => !blocked.has(id)), 'Feedback and history exclusions remain enforced');
  assert.equal((await get(`?seen=${'x'.repeat(1153)}`)).status, 400);
  limited = true; assert.equal((await get()).status, 429); limited = false;
  account = null; result = await get(); assert.equal(result.body.mode, 'guest'); assert(result.body.sections.trending.length);
  account = { userData: structuredClone(profile) }; await hookCheck(); await highlightCheck();
  const fixtures = {};
  for (const [name, userData] of Object.entries({ taste: profile, activity, historyOnly: { songHistory: activity.songHistory }, searchOnly: { searches: activity.searches }, artistOnly: { followedArtists: ['Artist One'] }, empty: {}, private: { ...activity, settings: { privateSession: true } } })) {
    account = { userData }; rotation = 0;
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.body.basis, ['empty', 'private'].includes(name) ? 'popular' : ['taste', 'artistOnly'].includes(name) ? 'taste' : 'activity');
    const seen = discovery.homeDiscoveryIds(response.body.sections);
    const seenPlaylists = discovery.homeDiscoveryPlaylistIds(response.body.sections);
    const refreshed = await get(`?seen=${seen.join(',')}&seenPlaylists=${seenPlaylists.join(',')}`);
    fixtures[name] = { initial: response.body, refreshed: refreshed.body };
  }
  const composed = discovery.composeHomePage({ status: 'authenticated', history: [...pool.slice(0, 20), pool[0]], releases: [pool[2], ...pool.slice(20, 24)], playlists: [{ _id: 'library1', name: 'Mine' }], forYou: { tracks: pool.slice(18, 45), playlists: [{ id: 'PLone', title: 'Same' }] }, explore: { tracks: pool.slice(20, 70), playlists: [{ id: 'PLtwo', title: 'Same' }, { id: 'PLthree', title: 'Different' }] } });
  const entirePage = [...composed.quickItems.filter(t => t.type === 'track'), ...composed.history, ...composed.forYou.tracks, ...composed.explore.tracks];
  assert.equal(new Set(entirePage.map(t => t.id)).size, entirePage.length, 'Whole page including quick access, history, releases and both halves has no repeated IDs');
  assert.equal(new Set(entirePage.map(identities.canonicalSongIdentity)).size, entirePage.length, 'No repeated recordings anywhere on homepage');
  assert.equal(composed.forYou.tracks.length, composed.explore.tracks.length);
  assert.equal(composed.explore.playlists.length, 1, 'Repeated playlist titles are excluded');
  const highlighted = discovery.composeHomePage({ status: 'authenticated', history: pool.slice(0, 4), anniversary: [pool[4], pool[4], pool[5]], weekly: [pool[4], pool[5], pool[40]], forYou: { tracks: pool.slice(4, 35) }, explore: { tracks: pool.slice(10, 70) } });
  assert.equal(highlighted.forYou.tracks.length, 12);
  assert.equal(highlighted.explore.tracks.length, 12);
  assert.equal(highlighted.anniversary.length, 2);
  assert.equal(highlighted.weekly.length, 1);
  const highlightRows = [...highlighted.anniversary, ...highlighted.forYou.mainTracks, ...highlighted.weekly, ...highlighted.explore.mainTracks];
  assert.equal(new Set(highlightRows.map(identities.canonicalSongIdentity)).size, 24, 'Highlights share existing slots and dedupe across both halves');
  assert.equal(discovery.isNewDiscoveryArtist({ title: 'Favorite Artist - Track', channel: 'Favorite Artist - Topic' }, ['Favorite Artist']), false);
  assert(providerQueries.some(q => q.order === 'date' && q.publishedAfter), 'Recent exploration is requested from provider');
  if (process.argv[2]) { fs.mkdirSync(path.dirname(process.argv[2]), { recursive: true }); fs.writeFileSync(process.argv[2], JSON.stringify(fixtures)); }
  console.log('PASS: rotated taste families, recent search priority, private-session signals, artist diversity, unseen priority, recording/row dedupe, sparse fallback, bounded IDs, actual API/cache/feedback/history/rate limits, actual hook refresh/account isolation/private storage');
})().catch(error => { console.error(error); process.exitCode = 1; });
