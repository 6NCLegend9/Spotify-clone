import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const source = fs.readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
const start = source.indexOf("function registerProtocol(");
const end = source.indexOf("function registerSingleInstance(", start);
assert(start >= 0 && end > start);

function register(channel, defaultApp = false) {
  const calls = [];
  const context = vm.createContext({
    DESKTOP_BUILD_CHANNEL: channel, PROTOCOL: "heykasa", path,
    process: { defaultApp, execPath: "electron.exe", argv: ["electron.exe", "desktop"] },
    app: { setAsDefaultProtocolClient: (...args) => calls.push(args) },
  });
  vm.runInContext(`${source.slice(start, end)}; registerProtocol();`, context);
  return calls;
}

test("launching an internal QA build leaves the installed login handler alone", () => {
  assert.deepEqual(register("internal"), []);
  assert.deepEqual(register("internal", true), []);
});

test("stable and beta packaged apps retain login callback registration", () => {
  for (const channel of ["stable", "beta"]) {
    assert.deepEqual(register(channel), [["heykasa"]]);
  }
});

test("development registration retains executable and app entry point", () => {
  const calls = register("stable", true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "heykasa");
  assert.equal(calls[0][1], "electron.exe");
  assert.deepEqual(Array.from(calls[0][2]), [path.resolve("desktop")]);
});

test("internal builds do not advertise or initiate browser callback authentication", () => {
  const from = source.indexOf("function runtimeFeature(");
  const to = source.indexOf("function hideMiniPlayer(", from);
  assert(from >= 0 && to > from);
  const context = vm.createContext({
    DESKTOP_BUILD_CHANNEL: "internal", safeMode: false,
    policyFeature: () => true, policy: null,
    DESKTOP_CAPABILITIES: ["authV1", "updaterV1"],
    CAPABILITY_POLICY: { authV1: "auth", updaterV1: "updater" },
  });
  vm.runInContext(source.slice(from, to), context);
  assert.equal(context.runtimeFeature("auth"), false);
  assert.deepEqual(Array.from(context.effectiveCapabilities()), ["updaterV1"]);
  assert.match(context.featureDisabledMessage("auth"), /internal/i);
  context.DESKTOP_BUILD_CHANNEL = "stable";
  assert.equal(context.runtimeFeature("auth"), true);
});
