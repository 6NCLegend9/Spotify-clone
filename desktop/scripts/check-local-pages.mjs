import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { bundledPageResponse, installLocalPages, localPageUrl } from "../src/localPages.mjs";

test("bundled handler returns only the packaged HTML with embedding and cache restrictions", async () => {
  for (const name of ["offline.html", "miniPlayer.html"]) {
    const response = await bundledPageResponse({ url: localPageUrl(name), method: "GET" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-security-policy"), "frame-ancestors 'none'");
    assert.equal(await response.text(), fs.readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8"));
  }
});

test("bundled handler never exposes arbitrary paths, credentials or alternate origins", async () => {
  for (const url of [
    "heykasa-ui://bundled/package.json", "heykasa-ui://bundled/main.mjs",
    "heykasa-ui://bundled/%2e%2e/main.mjs", "heykasa-ui://bundled/%2Foffline.html",
    "heykasa-ui://other/offline.html", "https://bundled/offline.html",
    "heykasa-ui://user@bundled/offline.html", "heykasa-ui://bundled:123/offline.html",
    "heykasa-ui://bundled/offline.html?file=main.mjs", "heykasa-ui://bundled/offline.html#other",
  ]) assert.equal((await bundledPageResponse({ url, method: "GET" })).status, 404, url);
  assert.equal((await bundledPageResponse({ url: localPageUrl("offline.html"), method: "POST" })).status, 405);
  assert.throws(() => localPageUrl("../package.json"), /Unknown/);
});

test("each Electron session registers its local handler once", () => {
  const calls = [];
  const a = { protocol: { handle: (...args) => calls.push(args) } };
  const b = { protocol: { handle: (...args) => calls.push(args) } };
  installLocalPages(a); installLocalPages(a); installLocalPages(b);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], bundledPageResponse);
});

test("failed offline recovery cannot recursively navigate or race another recovery", async () => {
  const source = fs.readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
  const from = source.indexOf("async function showOfflineScreen(");
  const to = source.indexOf("async function loadApplication(", from);
  assert(from >= 0 && to > from);
  const offlineWindows = new WeakSet();
  const context = vm.createContext({ offlineWindows, localPageUrl, logger: { error() {} } });
  vm.runInContext(source.slice(from, to), context);
  let calls = 0;
  const window = { isDestroyed: () => false, loadURL: async url => {
    assert.equal(url, localPageUrl("offline.html"));
    if (++calls > 2) throw new Error("unbounded navigation");
    await context.showOfflineScreen(window);
    throw new Error("local renderer failed");
  } };
  await Promise.all([context.showOfflineScreen(window), context.showOfflineScreen(window)]);
  assert.equal(calls, 1);
  offlineWindows.delete(window); // A later successful remote load resets the guard.
  await context.showOfflineScreen(window);
  assert.equal(calls, 2);
});
