import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import * as auth from "../src/authFlow.mjs";

const main = fs.readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
const exchangeSource = main.slice(main.indexOf("async function exchangeDesktopAuth("), main.indexOf("async function handleDeepLink("));
const loadSource = main.slice(main.indexOf("async function loadApplication("), main.indexOf("async function enterSafeMode("));

function harness({ navigationFails = false, exchangeFails = false, exchangeHangs = false, delayed = false, cookieDelayed = false } = {}) {
  const attempt = auth.createDesktopAuthAttempt();
  const states = [], cookies = [];
  let offline = 0, signal, deadline, release;
  const gate = new Promise(resolve => { release = resolve; });
  const controller = new AbortController();
  const context = vm.createContext({
    ...auth, URL, Error,
    authAttempt: attempt, runtimeFeature: () => true,
    appUrl: "https://haykasa.vercel.app", logger: { error() {}, warn() {} },
    AbortSignal: { timeout: milliseconds => { deadline = milliseconds; return controller.signal; } },
    setAuthStatus: state => states.push(state), focusMainWindow() {},
    mainWindow: { isDestroyed: () => false, loadURL: async () => { if (navigationFails) throw new Error("network unavailable"); } },
    showOfflineScreen: async () => { offline++; },
    desktopSession: () => ({ cookies: { set: async value => { cookies.push(value); if (cookieDelayed) await gate; }, remove: async () => {} } }),
    net: { fetch: async (_url, options) => {
      signal = options.signal;
      if (delayed) await gate;
      if (exchangeHangs) return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("exchange timed out")), { once: true });
      });
      if (exchangeFails) throw new Error("exchange failed");
      return { ok: true, json: async () => ({ cookieName: "__Secure-next-auth.session-token", sessionToken: "test-session", expiresAt: Date.now() / 1000 + 3600 }) };
    } },
  });
  vm.runInContext(loadSource + exchangeSource, context);
  return { states, cookies, get offline() { return offline; }, get signal() { return signal; }, get deadline() { return deadline; },
    expire: () => controller.abort(),
    release,
    replaceAttempt: () => { context.authAttempt = auth.createDesktopAuthAttempt(); states.push("waiting"); },
    run: () => context.exchangeDesktopAuth(`heykasa://auth?code=${"a".repeat(40)}&state=${attempt.state}`) };
}

test("successful sign-in survives a subsequent network navigation failure", async () => {
  const h = harness({ navigationFails: true });
  assert.equal(await h.run(), true);
  assert.equal(h.cookies.length, 1);
  assert.equal(h.cookies[0].httpOnly, true);
  assert.equal(h.cookies[0].secure, true);
  assert.equal(h.offline, 1);
  assert.equal(h.states.at(-1), "authenticated");
  assert(!h.states.includes("error"));
});

test("exchange requests carry a bounded deadline", async () => {
  const h = harness();
  await h.run();
  assert(h.signal instanceof AbortSignal);
  assert(h.deadline > 0 && h.deadline <= 30000);
});

test("failed exchange never installs a session or claims authentication", async () => {
  const h = harness({ exchangeFails: true });
  assert.equal(await h.run(), false);
  assert.equal(h.cookies.length, 0);
  assert.equal(h.offline, 0);
  assert.equal(h.states.at(-1), "error");
});

test("deadline expiry leaves exchanging state without installing a session", async () => {
  const h = harness({ exchangeHangs: true });
  const pending = h.run();
  h.expire();
  assert.equal(await pending, false);
  assert.equal(h.cookies.length, 0);
  assert.equal(h.states.at(-1), "error");
});

test("a superseded exchange response cannot install the earlier account session", async () => {
  const h = harness({ delayed: true });
  const pending = h.run(); h.replaceAttempt(); h.release();
  assert.equal(await pending, false);
  assert.equal(h.cookies.length, 0);
  assert.equal(h.states.at(-1), "waiting");
});

test("a superseded exchange failure cannot overwrite the new sign-in attempt", async () => {
  const h = harness({ delayed: true, exchangeFails: true });
  const pending = h.run(); h.replaceAttempt(); h.release();
  assert.equal(await pending, false);
  assert.equal(h.states.at(-1), "waiting");
});

test("completion of an accepted cookie write cannot erase a newer sign-in attempt", async () => {
  const h = harness({ cookieDelayed: true });
  const pending = h.run(); await new Promise(setImmediate);
  assert.equal(h.cookies.length, 1, "The earlier session write was already accepted");
  h.replaceAttempt(); h.release();
  assert.equal(await pending, false);
  assert.equal(h.states.at(-1), "waiting");
});
