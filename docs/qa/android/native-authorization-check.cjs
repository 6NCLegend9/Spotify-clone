// Execute production grant helpers and resolve handlers against isolated Mongo
// and worker boundaries. This is authorization proof, not native/audio proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
let clientFetch;
function load(file, mocks = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    Buffer, URL, Date, AbortController, DOMException, setTimeout, clearTimeout,
    fetch: (...args) => clientFetch(...args), process: { env: { NODE_ENV: 'production' } }, console });
  return module.exports;
}
const records = [];
const clone = value => structuredClone(value);
const get = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
function matches(row, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some(part => matches(row, part));
    const actual = get(row, key);
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('$gt' in expected) return actual > expected.$gt;
      if ('$in' in expected) return expected.$in.includes(actual);
      if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
      if ('$elemMatch' in expected) return actual.some(value => matches(value, expected.$elemMatch));
    }
    return expected === null ? actual == null : actual === expected;
  });
}
function update(row, changes) {
  if (changes.$set) Object.assign(row, changes.$set);
  for (const [key, value] of Object.entries(changes.$addToSet || {})) {
    if (!row[key].some(item => JSON.stringify(item) === JSON.stringify(value))) row[key].push(clone(value));
  }
}
let databaseFails = false;
const model = {
  async countDocuments(query) { return records.filter(row => matches(row, query)).length; },
  async create(row) { records.push({ revokedAt: null, ...clone(row) }); },
  findOne(query) { return { lean: async () => clone(records.find(row => matches(row, query)) || null) }; },
  find(query) { return { lean: async () => clone(records.filter(row => matches(row, query))) }; },
  async updateOne(query, changes) {
    const row = records.find(value => matches(value, query));
    if (row) update(row, changes);
    return { matchedCount: row ? 1 : 0 };
  },
  async updateMany(query, changes) { records.filter(row => matches(row, query)).forEach(row => update(row, changes)); },
  findOneAndUpdate(query, changes) { return { lean: async () => {
    const row = records.find(value => matches(value, query)); const before = row ? clone(row) : null;
    if (row) update(row, changes); return before;
  } }; },
};
const receipts = load('src/utils/mediaReceipts.mjs');
const media = load('src/utils/mediaService.mjs');
const grants = load('src/utils/nativePlaybackGrants.js', {
  '@/models/NativePlaybackGrant': { default: model }, '@/utils/dbconnect': { default: async () => { if (databaseFails) throw new Error('private-db-error'); } },
  '@/utils/mediaReceipts.mjs': receipts,
});
const account = 'a'.repeat(24), otherAccount = 'b'.repeat(24), secret = 'synthetic-native-playback-secret-'.repeat(2);
let token = { id: account, sub: account, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 7200 };
let sessionVersion = 1, trusted = true, limited = false, workerFails = false, raceRevoke = false;
const calls = [], checks = [];
let jobCounter = 0;
const route = load('src/app/api/media/resolve/route.js', {
  '@/utils/apiResponseCore.mjs': { readRequestJson: request => request.json(), ApiRouteError: class extends Error {} },
  'next/server': { NextResponse: { json: (body, { status = 200, headers = {} } = {}) => ({ body, status, headers,
    cookies: { values: [], set(...args) { this.values.push(args); } } }) } },
  'next-auth/jwt': { getToken: async () => token }, '@/utils/authToken': { tokenOptions: request => request },
  '@/utils/sessionAuth': { resolveSessionUser: async (identity, options) => {
    checks.push({ identity, options });
    return identity.id === account && identity.sub === account && identity.sessionVersion === sessionVersion ? { id: account } : null;
  } },
  '@/utils/trustedOrigin': { isTrustedRequestOrigin: () => trusted },
  '@/utils/rateLimit': { getClientKey: () => 'fixture', isRateLimited: async () => ({ limited }) },
  '@/utils/mediaReceipts.mjs': receipts, '@/utils/nativePlaybackGrants': grants,
  '@/utils/mediaService.mjs': { ...media, mediaServiceConfig: () => ({ enabled: true, playbackEnabled: true, secret, origin: 'https://delivery.test' }),
    callMediaService: async (_, url, options) => {
      calls.push({ url, ...options });
      if (workerFails) throw new Error('private-worker-secret');
      if (raceRevoke && options.method !== 'DELETE') records.forEach(row => { row.revokedAt = new Date(); });
      const jobId = url === '/v1/jobs' ? (++jobCounter).toString(16).padStart(32, '0') : url.split('/')[3];
      return { jobId, state: 'ready', asset: { url: `https://delivery.test/v1/assets/${jobId}`, expiresAt: Date.now() + 3600_000,
        duration: 120, codec: 'aac', mimeType: 'audio/mp4' } };
    } },
});
function request(body, headers = {}) {
  const value = new Request('https://haykasa.vercel.app/api/media/resolve', { method: 'POST',
    headers: { origin: 'https://haykasa.vercel.app', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  value.nextUrl = new URL(value.url); return value;
}
const post = (body, headers) => route.POST(request(body, headers));
const selection = { videoId: 'abcdefghijk', mode: 'audio', maxHeight: 1080, profile: 'mp4-aac' };
const mint = (extra = {}, headers) => post({ action: 'nativeGrant', videoIds: [selection.videoId], profile: selection.profile, ...extra }, headers);
const auth = issued => ({ authorization: `Bearer ${issued.nativeGrant}` });
(async () => {
  for (const extra of [{ videoIds: [] }, { videoIds: Array(101).fill(selection.videoId) }, { videoIds: ['bad'] }, { profile: 'auto' }]) {
    assert.equal((await mint(extra)).status, 400);
  }
  token = null; assert.equal((await mint()).status, 401);
  token = { id: account, sub: account, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 7200 };
  const web = await post(selection); assert.equal(web.status, 200);
  const issued = await mint({ receipt: web.body.receipt }); assert.equal(issued.status, 200);
  assert.match(issued.body.nativeGrant, /^npr1_[A-Za-z0-9_-]{43}$/);
  assert(issued.body.expiresAt <= Date.now() + 3600_000);
  assert.equal(issued.headers['Cache-Control'], 'private, no-store');
  const [cookieName, cookieValue, cookieOptions] = issued.cookies.values[0];
  assert.equal(cookieOptions.httpOnly, true); assert.equal(cookieOptions.secure, true); assert.equal(cookieOptions.sameSite, 'strict');
  const cookie = { cookie: `${cookieName}=${cookieValue}` };
  assert.equal(grants.verifyNativePlaybackDeviceId(cookieValue.slice(0, -1) + (cookieValue.endsWith('0') ? '1' : '0'), secret), null);
  assert(!JSON.stringify(records).includes(issued.body.nativeGrant), 'Only bearer digests may be stored');
  const headers = auth(issued.body);
  token = null; trusted = false;
  records[0].expiresAt = new Date(Date.now() + 10_000);
  const refreshed = await post({ action: 'refreshNativeGrant' }, headers);
  assert.equal(refreshed.status, 200, 'Native refresh needs no browser cookie or Origin');
  assert(refreshed.body.expiresAt > Date.now() + 59 * 60_000);
  assert.equal(records[0].jobs.length, 0, 'Refreshing preserves the same grant and job ownership');
  trusted = true; token = { id: account, sub: account, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 7200 };
  assert.equal((await post({ action: 'refreshNativeGrant' })).status, 403, 'Browser cookies cannot extend a native bearer');
  token = null; trusted = false;
  const sessionExpiry = records[0].sessionExpiresAt;
  records[0].sessionExpiresAt = new Date(Date.now() + 20_000);
  const bounded = await post({ action: 'refreshNativeGrant' }, headers);
  assert.equal(bounded.status, 200);
  assert(bounded.body.expiresAt <= records[0].sessionExpiresAt.getTime(), 'Refresh stops at original session expiry');
  records[0].sessionExpiresAt = sessionExpiry;
  records[0].expiresAt = new Date(Date.now() + 3600_000);
  const created = await post(selection, headers); assert.equal(created.status, 200, 'Native create needs no browser cookie or Origin');
  assert.equal(records[0].jobs.length, 1, 'Refreshed grant retains ownership of native jobs');
  assert.equal(checks.at(-1).options.fresh, true);
  assert.equal((await post({ action: 'renew', receipt: created.body.receipt }, headers)).status, 200);
  assert.equal((await post({ action: 'poll', receipt: web.body.receipt }, headers)).status, 200, 'Current ready browser receipt can be adopted');
  for (const body of [{ ...selection, videoId: 'ABCDEFGHIJK' }, { ...selection, mode: 'video' }, { ...selection, profile: 'webm-opus' }]) {
    const before = calls.length; assert.equal((await post(body, headers)).status, 403); assert.equal(calls.length, before);
  }
  assert.equal((await mint({}, headers)).status, 403, 'Bearer cannot broaden its own grant');
  assert.equal((await post(selection, { authorization: '' })).status, 401);
  assert.equal((await post(selection, { authorization: 'Basic invalid' })).status, 401);
  const foreign = receipts.signMediaReceipt({ scope: receipts.mediaScopeHash(`account:${otherAccount}:1`, secret), subscriber: 'c'.repeat(64),
    jobId: 'd'.repeat(32), selection, expiresAt: Date.now() + 3600_000 }, secret);
  assert.equal((await post({ action: 'renew', receipt: foreign }, headers)).status, 403);
  sessionVersion = 2; assert.equal((await post(selection, headers)).status, 401); sessionVersion = 1;
  sessionVersion = 2; assert.equal((await post({ action: 'refreshNativeGrant' }, headers)).status, 401); sessionVersion = 1;
  databaseFails = true; const unavailable = await post(selection, headers); assert.equal(unavailable.status, 503);
  assert(!JSON.stringify(unavailable).includes('private-db-error')); databaseFails = false;
  records[0].expiresAt = new Date(Date.now() - 1); assert.equal((await post(selection, headers)).status, 401);
  assert.equal((await post({ action: 'refreshNativeGrant' }, headers)).status, 401, 'Expired bearers cannot revive');
  records[0].expiresAt = new Date(Date.now() + 3600_000);
  assert.equal((await post({ action: 'cancel', receipt: created.body.receipt }, headers)).status, 200);
  assert.equal((await post(selection, headers)).status, 200, 'Cancelling one song keeps queue authorization');
  trusted = true; token = { id: account, sub: account, sessionVersion: 1 };
  const secondDevice = await mint(); assert.equal(secondDevice.status, 200);
  limited = true;
  const revoked = await post({ action: 'revokeNativeGrants' }, cookie); assert.equal(revoked.status, 200);
  limited = false;
  assert.equal((await post(selection, headers)).status, 401);
  assert.equal((await post({ action: 'refreshNativeGrant' }, headers)).status, 401, 'Logout revokes refresh');
  assert.equal((await post(selection, auth(secondDevice.body))).status, 200, 'This-device logout cannot revoke another installation');
  const race = await mint(); raceRevoke = true;
  const raced = await post(selection, auth(race.body)); assert.equal(raced.status, 401);
  assert.equal(calls.at(-1).method, 'DELETE', 'In-flight delivery loses to revocation and is removed before response');
  raceRevoke = false;
  const self = await mint(); await post(selection, auth(self.body)); workerFails = true;
  const selfRevoked = await post({ action: 'revokeNativeGrant' }, auth(self.body)); assert.equal(selfRevoked.status, 200);
  assert.equal(selfRevoked.body.deliveriesCancelled, false, 'Failed worker cleanup cannot be reported as deleted delivery');
  assert.equal((await post(selection, auth(self.body))).status, 401); workerFails = false;
  assert(checks.every(check => check.options?.fresh === true));
  let generation = 0;
  const client = load('src/utils/nativePlaybackAuthorization.mjs', { './accountStorage.mjs': { accountStorageGeneration: () => generation } });
  const browserCalls = [];
  clientFetch = async (url, options) => {
    browserCalls.push({ url, ...options });
    return { ok: true, json: async () => issued.body };
  };
  for (const capability of [{ transportVersion: 0, nativeQueue: 'source-queue-v1' }, { transportVersion: 2, nativeQueue: null }]) {
    await assert.rejects(client.requestNativePlaybackGrant({ ...capability, videoIds: [selection.videoId], profile: selection.profile }), /native_queue_unsupported/);
  }
  assert.equal(browserCalls.length, 0, 'No permission is issued for historical binaries');
  const clientRequest = { transportVersion: 2, nativeQueue: 'source-queue-v1', videoIds: [selection.videoId], profile: selection.profile };
  await client.requestNativePlaybackGrant(clientRequest);
  assert.equal(browserCalls[0].credentials, 'same-origin'); assert.equal(browserCalls[0].redirect, 'error');
  clientFetch = async (url, options) => {
    browserCalls.push({ url, ...options });
    if (JSON.parse(options.body).action === 'nativeGrant') generation++;
    return { ok: true, json: async () => issued.body };
  };
  await assert.rejects(client.requestNativePlaybackGrant(clientRequest), error => error.name === 'AbortError');
  assert.equal(browserCalls.at(-1).headers.Authorization, `Bearer ${issued.body.nativeGrant}`);
  assert.equal(browserCalls.at(-1).credentials, 'omit', 'Retired authorization is revoked without replaying browser cookies');
  const order = [];
  const logout = load('src/utils/signOut.js', {
    'next-auth/react': { signOut: async () => { order.push('signout'); } },
    './accountStorage.mjs': { getActiveAccountOwner: () => `account:${account}`, clearLocalAccountCaches: () => order.push('clear'), setActiveAccountOwner() {} },
    '@/services/http': { invalidateClientCache: () => order.push('cache') },
    './nativePlaybackAuthorization.mjs': { revokeDeviceNativePlaybackGrants: async () => order.push('revoke') },
  });
  await logout.signOutWithPrivacy({ redirect: false });
  assert.equal(order.join(','), 'clear,cache,revoke,signout', 'Local native ownership retires immediately and server revocation retains cookie authentication');
  console.log('PASS native scoped source allowlist, audio/profile bounds, hashed opaque grants, signed installation cookie, fresh session revocation, cookie-free native create/poll/renew/cancel/refresh, session-bounded grant lifetime, no bearer fallback/escalation, per-device logout, expiry, database failures and in-flight revoke cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
