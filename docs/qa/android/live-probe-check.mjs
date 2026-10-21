// Execute the actual Android diagnostic probe with isolated WindowProxy/DOM
// stand-ins. This checks evidence attribution, not provider or audio availability.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const listeners = new Map();
const frame = (active, src = "https://www.youtube.com/embed/qa") => ({
  active, src, contentWindow: {},
  closest() { return { getAttribute: () => this.active ? "true" : "false" }; },
});
const selected = frame(true);
const preload = frame(false);
const unrelated = frame(false);
let frames = [selected, preload];
const document = {
  readyState: "complete",
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === "[data-testid='youtube-decks'] iframe") return frames;
    if (selector === "iframe") return [...frames, unrelated];
    return [];
  },
};
const window = {
  addEventListener(name, callback) { listeners.set(name, callback); },
  fetch: async () => ({ status: 200, clone: () => ({ json: async () => ({ enabled: false, reason: "service_disabled" }) }) }),
};
vm.runInNewContext(fs.readFileSync(new URL("../../../android/app/src/androidTest/assets/live-playback-probe.js", import.meta.url), "utf8"), {
  window, document, URL, location: { href: "https://haykasa.vercel.app/search/qa" },
  performance: { timeOrigin: 123 }, innerWidth: 390, innerHeight: 844,
});
const snapshot = () => JSON.parse(JSON.stringify(window.qaLivePlayback.snapshot()));
const deliver = (source, event, info, origin = "https://www.youtube.com") => listeners.get("message")({
  source: source.contentWindow, origin, data: JSON.stringify({ event, info }),
});
const playing = { playerState: 1, currentTime: 44, duration: 180, volume: 100, muted: false };

assert.equal(snapshot().activeIframeMatched, false);
deliver(unrelated, "infoDelivery", playing);
deliver(selected, "infoDelivery", playing, "https://attacker.invalid");
assert.equal(snapshot().youtube.state, null, "Non-app frames and untrusted origins cannot prove playback");

deliver(preload, "onReady");
deliver(preload, "infoDelivery", playing);
deliver(preload, "onError", 150);
assert.equal(snapshot().youtube.state, null, "An inactive preload cannot prove the selected song is playing");
assert.deepEqual(snapshot().providerErrors, [], "Inactive preload errors cannot be attributed to the selected song");
assert.deepEqual(snapshot().states, []);

deliver(selected, "onReady");
deliver(selected, "infoDelivery", { playerState: 2, currentTime: 1, duration: 200, volume: 75, muted: false });
deliver(selected, "onError", 153);
assert.deepEqual(snapshot().youtube, { ready: true, state: 2, position: 1, duration: 200, volume: 75, muted: false });
assert.deepEqual(snapshot().providerErrors, [153]);
assert.deepEqual(snapshot().states, [2]);
assert.equal(snapshot().activeIframeMatched, true);

selected.active = false;
preload.active = true;
assert.deepEqual(snapshot().youtube, { ready: true, state: 1, position: 44, duration: 180, volume: 100, muted: false }, "A promoted deck uses its own complete readiness/output state");
assert.deepEqual(snapshot().providerErrors, [150]);
assert.deepEqual(snapshot().states, [1]);

deliver(selected, "infoDelivery", { ...playing, currentTime: 70 });
deliver(selected, "onError", 101);
assert.equal(snapshot().youtube.position, 44, "Outgoing crossfade messages cannot overwrite the selected deck's position");
assert.deepEqual(snapshot().providerErrors, [150]);
assert.equal(listeners.has("heykasa:youtube-provider-error"), false, "Unattributed app-wide error events must not contaminate a selected-deck report");

window.qaLivePlayback.resetAttempt();
assert.equal(snapshot().attempt, 1);
assert.equal(snapshot().activeIframeMatched, false, "A separate user attempt cannot reuse an earlier iframe observation");
assert.equal(snapshot().youtube.state, null);
assert.deepEqual(snapshot().providerErrors, []);
deliver(preload, "onError", 101);
assert.deepEqual(snapshot().providerErrors, [101], "New attempt observes fresh provider events");

preload.active = false;
assert.equal(snapshot().activeIframeMatched, false);
assert.equal(snapshot().youtube.state, null, "No active deck must not reuse the last playing frame's state");
assert.deepEqual(snapshot().providerErrors, []);
frames = [];
assert.equal(snapshot().youtube.position, null, "Destroyed decks must not leave stale evidence of playback");

console.log("PASS: actual live probe isolates active, preload, outgoing, unrelated and destroyed iframe state/error evidence; no live playback is simulated or claimed");
