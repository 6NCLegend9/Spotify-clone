import assert from "node:assert/strict";
import test from "node:test";
import { playNativeAudio, resumeAudioContext } from "../src/utils/nativeAudio.mjs";

test("explicit Play reaches the audio element and a suspended or interrupted context immediately", async () => {
  for (const state of ["suspended", "interrupted"]) {
    const calls = [];
    const context = { state, resume() { calls.push("context"); return Promise.resolve(); } };
    const audio = { paused: false, play() { calls.push("audio"); return Promise.resolve(); } };
    const result = playNativeAudio(audio, () => resumeAudioContext(context));
    assert.deepEqual(calls, ["context", "audio"]);
    await result;
  }
});

test("running/closed contexts and absent elements do not trigger unnecessary resume attempts", async () => {
  for (const state of ["running", "closed"]) {
    await resumeAudioContext({ state, resume() { assert.fail("Context must not resume"); } });
  }
  await playNativeAudio(null, () => assert.fail("Unmounted engine must not resume"));
});

test("autoplay/context failures are propagated once, not silently retried", async () => {
  let attempts = 0;
  await assert.rejects(playNativeAudio({ play() { attempts += 1; return Promise.reject(new DOMException("Blocked", "NotAllowedError")); } }), { name: "NotAllowedError" });
  assert.equal(attempts, 1);
  await assert.rejects(resumeAudioContext({ state: "interrupted", resume() { throw new Error("Unavailable"); } }), /Unavailable/);
});