import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { watchYoutubeIframeApi } from "../../../src/utils/youtubeIframeApi.mjs";

const API_URL = "https://www.youtube.com/iframe_api";
const deadlineMs = 20;
const waitPastDeadline = () => sleep(deadlineMs * 3);
const failures = [];
let passed = 0;

function fixture({ alreadyReady = false, existingScript = false, previousReady } = {}) {
  const originals = new Map(["window", "document", "setTimeout", "clearTimeout"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timers = new Set();
  const scripts = [];
  const appended = [];
  const cleanups = [];
  const state = { ready: 0, errors: 0 };

  class Script extends EventTarget {
    src = "";
    removed = false;
    errorListeners = new Set();
    addEventListener(name, callback, options) {
      if (name === "error") this.errorListeners.add(callback);
      super.addEventListener(name, callback, options);
    }
    removeEventListener(name, callback, options) {
      if (name === "error") this.errorListeners.delete(callback);
      super.removeEventListener(name, callback, options);
    }
    remove() { this.removed = true; }
  }

  const stale = existingScript ? new Script() : null;
  if (stale) { stale.src = API_URL; scripts.push(stale); }
  globalThis.window = { onYouTubeIframeAPIReady: previousReady, ...(alreadyReady ? { YT: { Player() {} } } : {}) };
  globalThis.document = {
    querySelector(selector) {
      assert.equal(selector, `script[src="${API_URL}"]`);
      return scripts.find(script => !script.removed && script.src === API_URL) || null;
    },
    createElement(tag) { assert.equal(tag, "script"); return new Script(); },
    head: { appendChild(script) { scripts.push(script); appended.push(script); return script; } },
  };
  globalThis.setTimeout = (callback, delay, ...args) => {
    const timer = nativeSetTimeout(() => { timers.delete(timer); callback(...args); }, delay);
    timers.add(timer);
    return timer;
  };
  globalThis.clearTimeout = timer => { timers.delete(timer); nativeClearTimeout(timer); };

  return {
    state, timers, scripts, appended, stale,
    watch(options = {}) {
      const cleanup = watchYoutubeIframeApi({ onReady: () => state.ready++, onError: () => state.errors++, timeoutMs: deadlineMs, ...options });
      cleanups.push(cleanup);
      return cleanup;
    },
    dispose() {
      try {
        for (const cleanup of cleanups.reverse()) cleanup();
        assert.equal(timers.size, 0, "Cleanup must cancel every SDK deadline");
        for (const script of scripts) assert.equal(script.errorListeners.size, 0, "Cleanup must remove SDK error listeners");
      } finally {
        for (const timer of timers) nativeClearTimeout(timer);
        for (const [name, descriptor] of originals) {
          if (descriptor) Object.defineProperty(globalThis, name, descriptor);
          else delete globalThis[name];
        }
      }
    },
  };
}

async function test(name, options, action) {
  const local = fixture(options);
  try { await action(local); passed++; }
  catch (error) { failures.push({ name, error }); }
  finally {
    try { local.dispose(); }
    catch (error) { failures.push({ name: `${name}: cleanup`, error }); }
  }
}

await test("already available SDK", { alreadyReady: true }, async ({ watch, state, appended, timers }) => {
  const previous = window.onYouTubeIframeAPIReady;
  watch();
  assert.equal(state.ready, 1);
  assert.equal(state.errors, 0);
  assert.equal(appended.length, 0);
  assert.equal(timers.size, 0);
  assert.equal(window.onYouTubeIframeAPIReady, previous);
});

await test("missing SDK creates one HTTPS script", {}, async ({ watch, state, appended, timers }) => {
  watch();
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, API_URL);
  assert.equal(new URL(appended[0].src).protocol, "https:");
  assert.equal(appended[0].errorListeners.size, 1);
  assert.equal(timers.size, 1);
  window.YT = { Player() {} };
  window.onYouTubeIframeAPIReady();
  assert.deepEqual(state, { ready: 1, errors: 0 });
  assert.equal(timers.size, 0);
  await waitPastDeadline();
  assert.deepEqual(state, { ready: 1, errors: 0 });
});

await test("reuse an existing pending script", { existingScript: true }, async ({ watch, stale, appended, state }) => {
  watch();
  assert.equal(stale.removed, false);
  assert.equal(appended.length, 0);
  assert.equal(stale.errorListeners.size, 1);
  window.onYouTubeIframeAPIReady();
  assert.deepEqual(state, { ready: 1, errors: 0 });
});

await test("script errors settle only once", {}, async ({ watch, appended, state, timers }) => {
  watch();
  const ready = window.onYouTubeIframeAPIReady;
  appended[0].dispatchEvent(new Event("error"));
  appended[0].dispatchEvent(new Event("error"));
  ready();
  assert.deepEqual(state, { ready: 0, errors: 1 });
  assert.equal(timers.size, 0);
  await waitPastDeadline();
  assert.deepEqual(state, { ready: 0, errors: 1 });
});

await test("a blocked request reaches one deadline", {}, async ({ watch, appended, state, timers }) => {
  watch();
  const ready = window.onYouTubeIframeAPIReady;
  await waitPastDeadline();
  assert.deepEqual(state, { ready: 0, errors: 1 });
  assert.equal(timers.size, 0);
  appended[0].dispatchEvent(new Event("error"));
  ready();
  await waitPastDeadline();
  assert.deepEqual(state, { ready: 0, errors: 1 });
});

await test("manual retry replaces a stale script", { existingScript: true }, async ({ watch, stale, appended, state }) => {
  watch({ retry: true });
  assert.equal(stale.removed, true);
  assert.equal(stale.errorListeners.size, 0);
  assert.equal(appended.length, 1);
  assert.notEqual(appended[0], stale);
  assert.equal(appended[0].src, API_URL);
  stale.dispatchEvent(new Event("error"));
  assert.deepEqual(state, { ready: 0, errors: 0 });
  window.onYouTubeIframeAPIReady();
  assert.deepEqual(state, { ready: 1, errors: 0 });
});

let previousCalls = 0;
const previous = () => previousCalls++;
await test("readiness preserves the previous callback once", { previousReady: previous }, async ({ watch, state }) => {
  previousCalls = 0;
  const cleanup = watch();
  const ready = window.onYouTubeIframeAPIReady;
  ready();
  ready();
  assert.equal(previousCalls, 1);
  assert.deepEqual(state, { ready: 1, errors: 0 });
  cleanup();
  assert.equal(window.onYouTubeIframeAPIReady, previous);
  ready();
  assert.equal(previousCalls, 1, "Late SDK callbacks must not re-enter a previous watcher");
});

await test("cleanup restores callbacks and ignores late events", { previousReady: previous }, async ({ watch, appended, state, timers }) => {
  previousCalls = 0;
  const cleanup = watch();
  const lateReady = window.onYouTubeIframeAPIReady;
  cleanup();
  cleanup();
  assert.equal(window.onYouTubeIframeAPIReady, previous);
  assert.equal(appended[0].errorListeners.size, 0);
  assert.equal(timers.size, 0);
  appended[0].dispatchEvent(new Event("error"));
  lateReady();
  await waitPastDeadline();
  assert.deepEqual(state, { ready: 0, errors: 0 });
  assert.equal(previousCalls, 0);
});

await test("failed watchers ignore late previous callbacks", { previousReady: previous }, async ({ watch, appended, state }) => {
  previousCalls = 0;
  watch();
  const lateReady = window.onYouTubeIframeAPIReady;
  appended[0].dispatchEvent(new Event("error"));
  lateReady();
  lateReady();
  assert.equal(previousCalls, 0);
  assert.deepEqual(state, { ready: 0, errors: 1 });
});

await test("another callback cannot prevent SDK readiness", { previousReady: () => { throw new Error("Unrelated callback failed"); } }, async ({ watch, state, timers }) => {
  watch();
  assert.doesNotThrow(() => window.onYouTubeIframeAPIReady());
  assert.equal(timers.size, 0);
  assert.deepEqual(state, { ready: 1, errors: 0 });
  await waitPastDeadline();
  assert.deepEqual(state, { ready: 1, errors: 0 });
});

await test("cleanup retains a newer global callback", {}, async ({ watch, state, appended }) => {
  const cleanup = watch();
  const newer = () => {};
  window.onYouTubeIframeAPIReady = newer;
  cleanup();
  assert.equal(window.onYouTubeIframeAPIReady, newer);
  assert.equal(appended[0].errorListeners.size, 0);
  assert.deepEqual(state, { ready: 0, errors: 0 });
});

if (failures.length) {
  for (const { name, error } of failures) console.error(`FAIL: ${name}\n${error.stack}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${passed} production YouTube iframe SDK lifecycle checks (HTTPS loading, reuse/retry, errors/deadlines, readiness, cleanup and late callbacks)`);
}
