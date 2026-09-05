import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_JAM_MS,
  JAM_CODE_ALPHABET,
  JAM_SESSION_KEY,
  isJamCode,
  jamChannelName,
  jamCodeFromPath,
  jamPath,
  makeJamCode,
  normalizeJamCode,
  projectJamPlaybackTime,
  readJamSession,
  shouldExpireEmptyJam,
  writeJamSession,
} from "../src/utils/jam.mjs";

test("jam codes normalize and reject short or messy values", () => {
  assert.equal(normalizeJamCode(" ab-c12 "), "ABC12");
  assert.equal(isJamCode("abc234"), true);
  assert.equal(isJamCode("abc123"), false);
  assert.equal(isJamCode("abc12"), false);
  assert.equal(jamPath("ab c-123"), "/jam/ABC123");
  assert.equal(jamChannelName("ab c-123"), "jam-ABC123");
  assert.equal(jamCodeFromPath("/jam/abc234"), "ABC234");
  assert.equal(jamCodeFromPath("/jam/abc123"), "");
  assert.equal(jamCodeFromPath("/library"), "");
});

test("jam code generation uses the readable alphabet", () => {
  assert.equal(makeJamCode(() => 0), JAM_CODE_ALPHABET[0].repeat(6));
  assert.equal(makeJamCode(() => 0.999999), JAM_CODE_ALPHABET.at(-1).repeat(6));
});

test("only empty host jams expire after ten minutes", () => {
  const now = 1_000_000;
  assert.equal(shouldExpireEmptyJam({
    role: "host",
    startedAt: now - EMPTY_JAM_MS,
    guestJoined: false,
  }, now), true);
  assert.equal(shouldExpireEmptyJam({
    role: "host",
    startedAt: now - EMPTY_JAM_MS - 1,
    guestJoined: true,
  }, now), false);
  assert.equal(shouldExpireEmptyJam({
    role: "guest",
    startedAt: now - EMPTY_JAM_MS - 1,
    guestJoined: false,
  }, now), false);
  assert.equal(shouldExpireEmptyJam({
    role: "host",
    startedAt: 0,
    guestJoined: false,
  }, now), true);
  assert.equal(shouldExpireEmptyJam({
    role: "host",
    startedAt: now - 1_000,
    guestJoined: false,
  }, now), false);
});

test("jam playback projection compensates only for plausible network transit", () => {
  assert.equal(projectJamPlaybackTime(42, true, 10_000, 11_250), 43.25);
  assert.equal(projectJamPlaybackTime(42, false, 10_000, 11_250), 42);
  assert.equal(projectJamPlaybackTime(42, true, 10_000, 20_000), 42);
  assert.equal(projectJamPlaybackTime(42, true, 20_000, 10_000), 42);
  assert.equal(projectJamPlaybackTime(-5, false, 0, 0), 0);
});

test("jam session persistence survives refresh and rejects corrupt values", () => {
  const values = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };

  try {
    writeJamSession({
      code: "abc234",
      role: "host",
      startedAt: 123,
      guestJoined: true,
      participantId: "host-test",
    });
    assert.deepEqual(readJamSession(), {
      code: "ABC234",
      role: "host",
      startedAt: 123,
      guestJoined: true,
      participantId: "host-test",
    });

    values.set(JAM_SESSION_KEY, JSON.stringify({
      code: "ABC234",
      role: "host",
      guestJoined: false,
    }));
    assert.deepEqual(readJamSession(), {
      code: "ABC234",
      role: "host",
      startedAt: 0,
      guestJoined: false,
      participantId: "",
    });

    values.set(JAM_SESSION_KEY, "{bad json");
    assert.equal(readJamSession(), null);

    writeJamSession({ code: "short", role: "host" });
    assert.equal(values.has(JAM_SESSION_KEY), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
