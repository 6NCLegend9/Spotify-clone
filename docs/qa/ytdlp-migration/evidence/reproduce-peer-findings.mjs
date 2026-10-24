// Reproduces existing defects at application baseline fbaae39. This deliberately
// asserts the reported BAD states; it is not a passing regression test for fixes.
// Run in an isolated Node 22+ process. No network, database or native device.
import assert from "node:assert/strict";

const root = new URL("../../../../", import.meta.url);
const commands = [];
const bridge = { postMessage(raw) { commands.push(JSON.parse(raw)); } };
globalThis.location = { origin: "https://haykasa.vercel.app" };
globalThis.window = { HayKasaAndroidMedia: bridge };
globalThis.document = {
  createElement() {
    const node = new EventTarget();
    node.remove = () => {};
    node.removeAttribute = () => {};
    return node;
  },
};

const { createAndroidAudioElement } = await import(new URL(
  "src/components/MusicPlayer/media/androidAudioElement.mjs", root,
));
const media = createAndroidAudioElement("Peer review fixture");
media.src = `https://haykasa.vercel.app/v1/assets/${"0".repeat(32)}`;
media.load();
const load = commands.findLast(command => command.action === "load");
const playResult = media.play().then(
  () => ({ state: "resolved" }),
  error => ({ state: "rejected", name: error.name }),
);
media.pause();
const playOutcome = await playResult;
const pausedAfterPause = media.paused;
bridge.onmessage({ data: JSON.stringify({
  id: load.id, event: "playing", position: 0, duration: 180,
}) });
const pausedAfterDelayedPlaying = media.paused;
media.remove();
assert.equal(playOutcome.name, "AbortError");
assert.equal(pausedAfterPause, true);
assert.equal(pausedAfterDelayedPlaying, false);

const { sanitizeSavedQueue } = await import(new URL("src/utils/jamRooms.mjs", root));
const { normalizePlaybackSnapshot } = await import(new URL("src/utils/playbackSnapshot.mjs", root));
const queue = ["occurrence-1", "occurrence-2"].map(queueEntryId => ({
  id: "abcdefghijk", title: "Fixture", channel: "QA", queueEntryId,
}));
const saved = sanitizeSavedQueue(queue);
const snapshot = normalizePlaybackSnapshot({ youtubeQueue: queue, youtubeVideo: queue[0] });
assert.equal(saved.length, 1);
assert.equal(saved[0].queueEntryId, undefined);
assert.equal(snapshot.youtubeQueue.length, 2);

console.log(JSON.stringify({
  scope: "Isolated actual-module reproductions; synthetic DOM/native bridge; no external requests, fixes or physical-device output.",
  adapter: { playOutcome, pausedAfterPause, pausedAfterDelayedPlaying },
  jam: {
    inputOccurrences: queue.length,
    savedOccurrences: saved.length,
    savedOccurrenceIdentityPresent: saved[0].queueEntryId !== undefined,
    snapshotOccurrences: snapshot.youtubeQueue.length,
  },
}, null, 2));
