import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeIpcFrames,
  encodeIpcFrame,
  sanitizeActivity,
} from "../src/discord/ipcClient.mjs";

test("Discord activity sanitizer keeps only bounded safe fields", () => {
  const activity = sanitizeActivity({
    type: 2,
    details: `  ${"Song ".repeat(40)}  `,
    state: "Artist",
    timestamps: { start: 1_700_000_000_000, end: -1 },
    assets: { large_image: "https://example.com/art.jpg", large_text: "Album" },
    buttons: [
      { label: "Open HeyKasa", url: "https://haykasa.vercel.app" },
      { label: "Bad", url: "javascript:alert(1)" },
    ],
    ignored: "secret",
  });

  assert.equal(activity.type, 2);
  assert.equal(activity.details.length <= 128, true);
  assert.equal(activity.state, "Artist");
  assert.equal(activity.timestamps.start, 1_700_000_000);
  assert.equal("end" in activity.timestamps, false);
  assert.deepEqual(activity.buttons, [
    { label: "Open HeyKasa", url: "https://haykasa.vercel.app" },
  ]);
  assert.equal("ignored" in activity, false);
});

test("listen-along secrets replace buttons and keep a party id", () => {
  const activity = sanitizeActivity({
    details: "Song",
    state: "Artist",
    buttons: [{ label: "Open HeyKasa", url: "https://haykasa.vercel.app" }],
    party: { id: "jam-ABC234", size: [2, 50] },
    secrets: { join: "ABC234" },
    instance: true,
  });
  assert.equal("buttons" in activity, false);
  assert.deepEqual(activity.secrets, { join: "ABC234" });
  assert.deepEqual(activity.party.size, [2, 50]);
  assert.equal(activity.instance, true);
});

test("Discord IPC framing round-trips complete frames and preserves partial data", () => {
  const first = encodeIpcFrame(1, { evt: "READY" });
  const second = encodeIpcFrame(3, { ping: true });
  const combined = Buffer.concat([first, second]);
  const split = combined.length - 3;

  const partial = decodeIpcFrames(combined.subarray(0, split));
  assert.equal(partial.frames.length, 1);
  assert.equal(partial.frames[0].payload.evt, "READY");
  assert.equal(partial.rest.length > 0, true);

  const completed = decodeIpcFrames(Buffer.concat([partial.rest, combined.subarray(split)]));
  assert.equal(completed.frames.length, 1);
  assert.equal(completed.frames[0].opcode, 3);
  assert.deepEqual(completed.frames[0].payload, { ping: true });
  assert.equal(completed.rest.length, 0);
});
