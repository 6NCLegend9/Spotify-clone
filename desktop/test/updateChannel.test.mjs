import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStoredUpdateChannel,
  rendererSelectableUpdateChannel,
} from "../src/updateChannel.mjs";

test("stored desktop channel can preserve controlled internal builds", () => {
  assert.equal(normalizeStoredUpdateChannel("stable"), "stable");
  assert.equal(normalizeStoredUpdateChannel("beta"), "beta");
  assert.equal(normalizeStoredUpdateChannel("internal"), "internal");
  assert.equal(normalizeStoredUpdateChannel("unknown"), "stable");
});

test("packaged web renderer cannot opt into unsigned internal updates", () => {
  assert.equal(rendererSelectableUpdateChannel("stable", { isPackaged: true }), "stable");
  assert.equal(rendererSelectableUpdateChannel("beta", { isPackaged: true }), "beta");
  assert.equal(rendererSelectableUpdateChannel("internal", { isPackaged: true }), "");
});

test("unpackaged development may explicitly select internal channel", () => {
  assert.equal(rendererSelectableUpdateChannel("internal", { isPackaged: false }), "internal");
  assert.equal(rendererSelectableUpdateChannel("garbage", { isPackaged: false }), "");
});
