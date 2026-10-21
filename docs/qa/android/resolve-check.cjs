const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../../src/components/MusicPlayer/media/resolveMediaAsset.mjs'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(fetch) {
  const timers = new Map(); let next = 0;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, AbortController, AbortSignal: {}, DOMException, fetch, navigator: {}, window: {}, Date, setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) });
  return { ...module.exports, timers };
}
const ready = { state: 'ready', receipt: 'synthetic', asset: { url: 'https://example.invalid/audio', duration: 120 } };
const response = value => ({ ok: true, json: async () => value });
(async () => {
  const success = harness(async (_url, options) => { assert(!options.signal.aborted); return response(ready); });
  assert.equal((await success.resolveMediaAsset({ videoId: 'synthetic01' })).state, 'ready');
  assert.equal(success.timers.size, 0);
  const controller = new AbortController(); controller.abort(new Error('Already cancelled'));
  const early = harness(async (_url, options) => { if (options.signal.aborted) throw options.signal.reason; return response(ready); });
  await assert.rejects(early.resolveMediaAsset({}, { signal: controller.signal }), /Already cancelled/);
  assert.equal(early.timers.size, 0);
  const waitingFetch = (_url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  const active = new AbortController(); const cancelled = harness(waitingFetch);
  const request = cancelled.resolveMediaAsset({}, { signal: active.signal }); active.abort(new Error('User cancelled'));
  await assert.rejects(request, /User cancelled/); assert.equal(cancelled.timers.size, 0);
  const timed = harness(waitingFetch); const timeout = timed.resolveMediaAsset({});
  const deadline = [...timed.timers.values()].find(t => t.ms === 270000); assert(deadline); deadline.fn();
  await assert.rejects(timeout, error => error.name === 'TimeoutError'); assert.equal(timed.timers.size, 0);
  const calls = []; const parent = new AbortController();
  const pending = harness(async (_url, options) => { calls.push(options.method); return response({ state: 'pending', receipt: 'synthetic-pending' }); });
  await assert.rejects(pending.resolveMediaAsset({}, { signal: parent.signal, onPending: () => parent.abort(new Error('Cancelled pending job')) }), /Cancelled pending job/);
  assert(calls.includes('DELETE')); assert.equal(pending.timers.size, 0);
  console.log('PASS: resolver without AbortSignal.any/timeout, ready response, already-aborted request, in-flight cancellation, preparation deadline, pending job cancellation and timer cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
