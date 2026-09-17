import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeIpcFrames,
  discordIpcPaths,
  encodeIpcFrame,
  isAllowedWebOrigin,
  sanitizeActivity,
} from "../desktop-bridge/discord-bridge.mjs";

test("encodes and decodes Discord IPC frames", () => {
  const encoded = encodeIpcFrame(1, { cmd: "SET_ACTIVITY", nonce: "abc" });
  const decoded = decodeIpcFrames(encoded);
  assert.equal(decoded.frames.length, 1);
  assert.equal(decoded.frames[0].opcode, 1);
  assert.equal(decoded.frames[0].payload.cmd, "SET_ACTIVITY");
  assert.equal(decoded.frames[0].payload.nonce, "abc");
  assert.equal(decoded.rest.length, 0);
});

test("uses Discord named pipes on Windows", () => {
  const paths = discordIpcPaths({}, "win32");
  assert.equal(paths.length, 10);
  assert.equal(paths[0], "\\\\?\\pipe\\discord-ipc-0");
  assert.equal(paths[9], "\\\\?\\pipe\\discord-ipc-9");
});

test("sanitizes bridge activity and converts millisecond timestamps to seconds", () => {
  const activity = sanitizeActivity({
    type: 0,
    details: "  Example Song  ",
    state: "Example Artist",
    timestamps: { start: 1_700_000_000_000, end: 1_700_000_200_000 },
    assets: { large_image: "https://cdn.example/art.jpg", large_text: "HeyKasa" },
    buttons: [{ label: "Listen on HeyKasa", url: "https://haykasa.vercel.app" }],
  });
  assert.equal(activity.details, "Example Song");
  assert.equal(activity.timestamps.start, 1_700_000_000);
  assert.equal(activity.timestamps.end, 1_700_000_200);
  assert.equal(activity.buttons[0].url, "https://haykasa.vercel.app");
});

test("only allows the HeyKasa production origin and explicit local dev origins", () => {
  assert.equal(isAllowedWebOrigin("https://haykasa.vercel.app"), true);
  assert.equal(isAllowedWebOrigin("http://localhost:3003"), true);
  assert.equal(isAllowedWebOrigin("https://evil.example"), false);
});
