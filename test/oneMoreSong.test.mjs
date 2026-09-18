import assert from "node:assert/strict";
import test from "node:test";
import { pickOneMoreTrack, shouldOfferOneMore } from "../src/utils/oneMoreSong.mjs";

test("one more song only fires after a natural radio complete", () => {
  assert.equal(shouldOfferOneMore({ armed: true, completed: true, radio: true, jamGuest: false }), true);
  assert.equal(shouldOfferOneMore({ armed: true, completed: false, radio: true, jamGuest: false }), false);
  assert.equal(shouldOfferOneMore({ armed: true, completed: true, radio: false, jamGuest: false }), false);
  assert.equal(shouldOfferOneMore({ armed: true, completed: true, radio: true, jamGuest: true }), false);
  assert.equal(shouldOfferOneMore({ armed: false, completed: true, radio: true, jamGuest: false }), false);
});

test("one more suggestion skips the current and queued tracks", () => {
  const next = pickOneMoreTrack(
    [{ id: "current12345" }, { id: "queued123456" }, { id: "related12345" }],
    { currentId: "current12345", queuedIds: ["queued123456"] },
  );
  assert.equal(next.id, "related12345");
  assert.equal(pickOneMoreTrack([{ id: "current12345" }], { currentId: "current12345" }), null);
});
