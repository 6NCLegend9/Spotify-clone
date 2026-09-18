import assert from "node:assert/strict";
import test from "node:test";
import {
  AUX_SONG_LIMIT,
  canControlAux,
  consumeAuxSkip,
  createAuxGrant,
  sanitizeAuxState,
} from "../src/utils/jamAux.mjs";

const guest = { participantId: "guest-1", role: "guest", name: "Maya" };

test("aux grants three songs to one guest and then returns", () => {
  assert.equal(createAuxGrant({ participantId: "host-1", role: "host", name: "Host" }), null);
  const grant = createAuxGrant(guest);
  assert.deepEqual(grant, {
    holderId: "guest-1",
    holderName: "Maya",
    remaining: AUX_SONG_LIMIT,
  });
  assert.equal(canControlAux(grant, "guest-1"), true);
  assert.equal(canControlAux(grant, "other"), false);

  const afterOne = consumeAuxSkip(grant, "guest-1");
  const afterTwo = consumeAuxSkip(afterOne, "guest-1");
  const afterThree = consumeAuxSkip(afterTwo, "guest-1");
  assert.equal(afterOne.remaining, 2);
  assert.equal(afterTwo.remaining, 1);
  assert.equal(afterThree, null);
  assert.equal(canControlAux(afterThree, "guest-1"), false);
});

test("a different listener cannot spend someone else's aux", () => {
  const grant = createAuxGrant(guest, 2);
  assert.deepEqual(consumeAuxSkip(grant, "stranger"), grant);
  assert.equal(sanitizeAuxState({ holderId: "guest-1", remaining: 0 }), null);
  assert.equal(sanitizeAuxState({ holderId: "", remaining: 2 }), null);
});
