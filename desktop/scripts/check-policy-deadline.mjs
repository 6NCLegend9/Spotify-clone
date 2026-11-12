import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import test from "node:test";
import vm from "node:vm";
import { DesktopPolicy, effectiveUpdateRolloutPercent } from "../src/policy.mjs";

const requestTimeoutMs = 150;
const disabled = {
  formatVersion: 1, maintenance: false, updateRolloutPercent: 0,
  features: { auth: false, discord: false, updater: false },
};
const enabled = { ...disabled, updateRolloutPercent: 100, features: { auth: true, discord: true, updater: true } };
const expired = Symbol("test deadline expired");

async function bounded(promise, ms = 1500) {
  let timer;
  try {
    const value = await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(expired), ms); })]);
    assert.notEqual(value, expired, "policy must settle without waiting for the server");
    return value;
  } finally { clearTimeout(timer); }
}

async function localServer(run) {
  const requests = [];
  let mode = "headers";
  const server = http.createServer((request, response) => {
    const entry = { mode, closed: false };
    requests.push(entry);
    response.on("close", () => { entry.closed = true; });
    if (mode === "headers") return;
    response.setHeader("Content-Type", "application/json");
    if (mode === "body") {
      response.writeHead(200);
      response.write('{"formatVersion":');
      return;
    }
    if (mode === "failure") { response.writeHead(503); response.end("unavailable"); return; }
    if (mode === "invalid-json") { response.end("{"); return; }
    response.end(JSON.stringify(mode === "invalid-policy" ? { formatVersion: 99 } : mode === "disabled" ? disabled : enabled));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/policy`;
  try {
    await run({ url, requests, setMode: value => { mode = value; } });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function waitUntil(predicate) {
  await bounded((async () => {
    while (!predicate()) await new Promise(resolve => setTimeout(resolve, 5));
  })());
}

for (const mode of ["headers", "body"]) {
  test(`deadline covers hanging HTTP ${mode} and cancels the actual request`, async () => {
    await localServer(async ({ url, requests, setMode }) => {
      setMode(mode);
      let signal;
      const policy = new DesktopPolicy({ url, requestTimeoutMs, fetchImpl: (target, options) => {
        signal = options.signal;
        return fetch(target, options);
      } });
      try {
        const result = await bounded(policy.refresh());
        assert.equal(result.updatedAt, 0);
        assert.equal(effectiveUpdateRolloutPercent(result), 0, "unverified policy cannot enable update rollout");
        assert(signal instanceof AbortSignal, "Electron net.fetch must receive a cancellation signal");
        assert.equal(signal.aborted, true);
        await waitUntil(() => requests[0]?.closed);
        setMode("enabled");
        assert.equal((await bounded(policy.refresh())).updateRolloutPercent, 100, "a timed-out refresh must not pin future refreshes");
      } finally { policy.dispose(); }
    });
  });
}

test("concurrent refreshes share one deadline and retain a previously disabled policy", async () => {
  await localServer(async ({ url, requests, setMode }) => {
    const changes = [];
    const policy = new DesktopPolicy({ url, requestTimeoutMs, onChange: value => changes.push(value) });
    try {
      setMode("disabled");
      const before = await bounded(policy.refresh());
      setMode("body");
      const results = await bounded(Promise.all([policy.refresh(), policy.refresh(), policy.refresh()]));
      assert.equal(requests.length, 2, "concurrent refreshes must reuse the active request");
      assert(results.every(value => value.updatedAt === before.updatedAt));
      for (const feature of ["auth", "discord", "updater"]) assert.equal(policy.feature(feature), false);
      assert.equal(changes.length, 1, "a timeout never republishes defaults");
      setMode("enabled");
      await bounded(policy.refresh());
      assert.equal(policy.feature("auth"), true);
      assert.equal(changes.length, 2);
    } finally { policy.dispose(); }
  });
});

test("failed, malformed and incompatible responses preserve the last valid policy, then recover", async () => {
  await localServer(async ({ url, setMode }) => {
    const changes = [];
    const policy = new DesktopPolicy({ url, requestTimeoutMs, onChange: value => changes.push(value) });
    try {
      setMode("disabled");
      const before = await bounded(policy.refresh());
      for (const mode of ["failure", "invalid-json", "invalid-policy"]) {
        setMode(mode);
        assert.deepEqual(await bounded(policy.refresh()), before, mode);
        assert.equal(policy.feature("auth"), false, mode);
      }
      assert.equal(changes.length, 1);
      setMode("enabled");
      const recovered = await bounded(policy.refresh());
      assert.equal(recovered.features.updater, true);
      assert.equal(recovered.updateRolloutPercent, 100);
      assert.equal(changes.length, 2);
    } finally { policy.dispose(); }
  });
});

for (const mode of ["headers", "body"]) {
  test(`disposal cancels hanging ${mode}, settles waiters and prevents late work`, async () => {
    await localServer(async ({ url, requests, setMode }) => {
      setMode(mode);
      let signal;
      const changes = [];
      const policy = new DesktopPolicy({ url, requestTimeoutMs: 30_000, onChange: value => changes.push(value), fetchImpl: (target, options) => {
        signal = options.signal;
        return fetch(target, options);
      } });
      const pending = policy.refresh();
      try {
        await waitUntil(() => requests.length === 1);
        policy.dispose();
        assert.equal((await bounded(pending)).updatedAt, 0);
        assert.equal(signal.aborted, true);
        await waitUntil(() => requests[0].closed);
        await bounded(policy.refresh());
        policy.start();
        assert.equal(policy.timer, null);
        assert.equal(requests.length, 1, "disposed policy cannot restart network work");
        assert.deepEqual(changes, []);
      } finally { policy.dispose(); }
    });
  });
}

test("a fetch/body implementation ignoring AbortSignal cannot stall startup or apply a late policy", async () => {
  let finishBody;
  let calls = 0;
  const changes = [];
  const policy = new DesktopPolicy({
    url: "https://policy.invalid/fixture", requestTimeoutMs, onChange: value => changes.push(value),
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) };
    },
  });
  try {
    assert.equal((await bounded(policy.refresh())).updatedAt, 0);
    policy.fetchImpl = async () => ({ ok: true, json: async () => disabled });
    const current = await bounded(policy.refresh());
    finishBody(enabled);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(policy.snapshot(), current);
    assert.equal(policy.feature("updater"), false);
    assert.equal(calls, 1);
    assert.equal(changes.length, 1);
  } finally { policy.dispose(); }
});

// Run the actual main-process startup sequence from policy creation through
// desktop_ready with the real policy class and local HTTP. Electron/window/IPC
// primitives are controlled; this proves continuation, not full EXE rendering.
const mainSource = fs.readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
const startup = mainSource.slice(mainSource.indexOf("    policy = new DesktopPolicy({"), mainSource.indexOf('    powerMonitor.on("resume"'));
assert(startup.includes("await policy.refresh()"));
assert(startup.includes("await createMainWindow()"));

for (const mode of ["headers", "body", "disabled"]) {
  test(`actual desktop startup reaches window with ${mode} policy response`, async () => {
    await localServer(async ({ url, setMode }) => {
      setMode(mode);
      const observed = { windows: 0, updaterStarts: 0, ready: false };
      const context = vm.createContext({
        DesktopPolicy: class extends DesktopPolicy {
          constructor(options) { super({ ...options, requestTimeoutMs }); }
        },
        URL, appUrl: url, net: { fetch }, applyPolicy: () => {}, effectiveUpdateRolloutPercent,
        DesktopUpdater: class { start() { observed.updaterStarts++; } },
        app: {}, store: {}, safeMode: false, sendUpdateStatus: () => {}, registerIpcHandlers: () => {},
        createMainWindow: async () => { observed.windows++; }, createTray: () => {},
        logger: { info: event => { if (event === "desktop_ready") observed.ready = true; } },
      });
      vm.runInContext("let policy, updater, startupCompleted; const runtimeFeature = name => policy.feature(name);", context);
      try {
        const pending = vm.runInContext(`(async () => { ${startup} })()`, context);
        // The failing baseline can resume only after localServer closes its
        // socket; clean up that late continuation's interval too.
        await bounded(pending.finally(() => vm.runInContext("policy?.dispose()", context)));
        assert.equal(observed.windows, 1);
        assert.equal(observed.ready, true);
        if (mode === "disabled") assert.equal(observed.updaterStarts, 0, "valid disabled policy must remain authoritative before window opens");
      } finally { vm.runInContext("policy?.dispose()", context); }
    });
  });
}
