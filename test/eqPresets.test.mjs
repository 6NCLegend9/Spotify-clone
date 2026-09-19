import assert from "node:assert/strict";
import test from "node:test";
import { EQ_BAND_FREQS, EQ_PRESET_BANDS, bandsForPreset, migrateEqBands } from "../src/utils/eqPresets.js";
test("equalizer exposes six frequency bands", () => {
  assert.deepEqual(EQ_BAND_FREQS, [60, 150, 400, 1000, 2400, 15000]);
  for (const bands of Object.values(EQ_PRESET_BANDS)) {
    assert.equal(bands.length, 6);
    assert.ok(bands.every((gain) => Number.isFinite(gain) && gain >= -12 && gain <= 12));
  }
});
test("legacy five-band curves migrate deterministically", () => {
  const migrated = migrateEqBands([8, 4, 0, -4, -8]);
  assert.equal(migrated.length, 6);
  assert.equal(migrated[0], 8);
  assert.equal(migrated[5], -8);
  assert.deepEqual(migrateEqBands(migrated), migrated);
  assert.deepEqual(bandsForPreset("Custom", [0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0]);
});
