import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderTransport } from '../src/utils/providerTransport.mjs';
import { createProviderCache, providerCacheKey } from '../src/utils/providerCachePolicy.mjs';
import { diagnosticRecord } from '../src/utils/diagnostics.mjs';
const url = 'https://provider.test/search?key=secret';
const good = () => ({ ok: true, status: 200, data: { items: [{ snippet: { title: 'Song' } }] } });
function memoryCache() {
  const entries = new Map();
  return (load, key) => async () => {
    const id = JSON.stringify(key);
    if (entries.has(id)) return entries.get(id);
    const value = await load(); entries.set(id, value); return value;
  };
}

test('transient GET failures retry once and recover', async () => {
  let calls = 0; const reports = [];
  const fetch = createProviderTransport({ fetchImpl: async () => new Response('', { status: ++calls === 1 ? 503 : 200 }), random: () => 0, report: x => reports.push(x) });
  assert.equal((await fetch(url)).status, 200); assert.equal(calls, 2);
  assert.equal(reports[0].attempts, 2); assert.equal(reports[0].code, 'OK');
});
test('POST, forbidden and not-found responses are never automatically retried', async () => {
  for (const [method, status] of [['POST', 503], ['GET', 403], ['GET', 404]]) {
    let calls = 0; const fetch = createProviderTransport({ fetchImpl: async () => { calls++; return new Response('', { status }); } });
    assert.equal((await fetch(url, { method })).status, status); assert.equal(calls, 1);
  }
});
test('long Retry-After returns immediately without an early retry', async () => {
  let calls = 0;
  const fetch = createProviderTransport({ fetchImpl: async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '120' } }); } });
  assert.equal((await fetch(url)).status, 429); assert.equal(calls, 1);
});
test('circuit opens, permits one recovery probe and closes after success', async () => {
  let time = 1000, calls = 0, recover = false, release;
  const fetch = createProviderTransport({ now: () => time, threshold: 1, cooldownMs: 20, fetchImpl: async () => { calls++; if (recover) { await new Promise(r => { release = r; }); return new Response('ok'); } return new Response('', { status: 503 }); } });
  await fetch(url, { method: 'POST' });
  await assert.rejects(fetch(url), { code: 'CIRCUIT_OPEN' }); assert.equal(calls, 1);
  time += 21; recover = true;
  const probe = fetch(url); await assert.rejects(fetch(url), { code: 'CIRCUIT_OPEN' });
  release(); assert.equal((await probe).status, 200);
});
test('caller cancellation is preserved and does not count as provider failure', async () => {
  const controller = new AbortController(); let calls = 0;
  const fetch = createProviderTransport({ threshold: 1, fetchImpl: async (_input, { signal }) => {
    calls++; if (calls > 1) return new Response('ok');
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const result = fetch(url, { signal: controller.signal }); controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal((await fetch(url)).status, 200);
});
test('one deadline bounds requests and opens a failing circuit', async () => {
  const fetch = createProviderTransport({ threshold: 1, timeoutMs: 20, fetchImpl: async (_input, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  await assert.rejects(fetch(url), { name: 'TimeoutError' });
  await assert.rejects(fetch(url), { code: 'CIRCUIT_OPEN' });
});
test('cache keys isolate filters, official-only policy and API configuration', () => {
  const key = providerCacheKey('search', { q: 'private words', type: 'video' });
  assert.match(key, /^[a-f0-9]{64}$/); assert.ok(!key.includes('private'));
  assert.equal(key, providerCacheKey('search', { type: 'video', q: 'private words' }));
  assert.notEqual(key, providerCacheKey('search', { q: 'private words', type: 'playlist' }));
  assert.notEqual(key, providerCacheKey('search', { q: 'private words', type: 'video' }, { requireOfficial: true }));
  assert.notEqual(key, providerCacheKey('search', { q: 'private words', type: 'video' }, {}, true));
  for (const options of [{ headers: { authorization: 'secret' } }, { cache: 'no-store' }, { signal: new AbortController().signal }]) assert.equal(providerCacheKey('search', {}, options), null);
  assert.equal(providerCacheKey('playlistItems', {}), null);
});
test('shared cache reuses success across instances and coalesces concurrent reads', async () => {
  const store = memoryCache(), first = createProviderCache(store), second = createProviderCache(store); let calls = 0;
  const load = async () => { calls++; return good(); };
  await Promise.all([first('same', load), first('same', load)]);
  await second('same', load); assert.equal(calls, 1);
});
test('failures, empty results and synthetic placeholders never poison cache', async () => {
  const cache = createProviderCache(memoryCache()); let calls = 0;
  for (const value of [{ ok: false, status: 502 }, { ok: true, data: { items: [] } }, { ok: true, data: { items: [{ snippet: { title: '' } }] } }]) {
    assert.equal(await cache('key', async () => { calls++; return value; }), value);
  }
  await cache('key', async () => { calls++; return good(); });
  assert.equal(calls, 4);
});
test('cache outage falls back to provider without duplicating a completed read', async () => {
  let calls = 0;
  const cache = createProviderCache(() => async () => { throw new Error('cache unavailable'); });
  assert.equal((await cache('key', async () => { calls++; return good(); })).ok, true); assert.equal(calls, 1);
  const failedWrite = createProviderCache(load => async () => { await load(); throw new Error('write failed'); });
  await failedWrite('key', async () => { calls++; return good(); }); assert.equal(calls, 2);
});
test('diagnostics allow bounded metrics while excluding search text and secrets', () => {
  const record = diagnosticRecord('provider', { cache: 'hit', attempts: 2, code: 'CIRCUIT_OPEN', query: 'private', url, authorization: 'secret' });
  assert.equal(record.cache, 'hit'); assert.equal(record.attempts, 2); assert.equal(record.code, 'CIRCUIT_OPEN');
  assert.ok(!JSON.stringify(record).includes('secret')); assert.ok(!JSON.stringify(record).includes('private'));
});

test('overlapping requests keep their own diagnostic request IDs', async () => {
  const { withProviderRequest, reportProvider } = await import('../src/utils/providerRequestContext.mjs');
  const original = console.info, setting = process.env.SERVER_DIAGNOSTICS, records = [];
  process.env.SERVER_DIAGNOSTICS = '1'; console.info = value => records.push(JSON.parse(value));
  const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
  try {
    await Promise.all([
      withProviderRequest(first, async () => { await new Promise(resolve => setTimeout(resolve, 5)); reportProvider({ cache: 'miss' }); }),
      withProviderRequest(second, async () => { reportProvider({ cache: 'hit' }); }),
    ]);
    assert.equal(records.find(x => x.cache === 'miss').requestId, first);
    assert.equal(records.find(x => x.cache === 'hit').requestId, second);
  } finally { console.info = original; if (setting === undefined) delete process.env.SERVER_DIAGNOSTICS; else process.env.SERVER_DIAGNOSTICS = setting; }
});
