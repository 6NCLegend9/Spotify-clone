import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveUpdateChannel,
  normalizeStoredUpdateChannel,
  rendererSelectableUpdateChannel,
} from "../src/updateChannel.mjs";

test("stored desktop channel can preserve controlled internal builds", () => {
  assert.equal(normalizeStoredUpdateChannel("stable"), "stable");
  assert.equal(normalizeStoredUpdateChannel("beta"), "beta");
  assert.equal(normalizeStoredUpdateChannel("internal"), "internal");
  assert.equal(normalizeStoredUpdateChannel("unknown"), "stable");
});

test("packaged web renderer cannot opt into unsigned internal updates unless this is an internal build", () => {
  assert.equal(rendererSelectableUpdateChannel("stable", { isPackaged: true, buildChannel: "stable" }), "stable");
  assert.equal(rendererSelectableUpdateChannel("beta", { isPackaged: true, buildChannel: "stable" }), "beta");
  assert.equal(rendererSelectableUpdateChannel("internal", { isPackaged: true, buildChannel: "stable" }), "");
  assert.equal(rendererSelectableUpdateChannel("internal", { isPackaged: true, buildChannel: "beta" }), "");
  assert.equal(rendererSelectableUpdateChannel("internal", { isPackaged: true, buildChannel: "internal" }), "internal");
});

test("unpackaged development may explicitly select internal channel", () => {
  assert.equal(rendererSelectableUpdateChannel("internal", { isPackaged: false }), "internal");
  assert.equal(rendererSelectableUpdateChannel("garbage", { isPackaged: false }), "");
});


test("packaged clients constrain persisted internal channel to their immutable build channel", () => {
  assert.equal(effectiveUpdateChannel("internal", { isPackaged: true, buildChannel: "stable" }), "stable");
  assert.equal(effectiveUpdateChannel("internal", { isPackaged: true, buildChannel: "beta" }), "beta");
  assert.equal(effectiveUpdateChannel("internal", { isPackaged: true, buildChannel: "internal" }), "internal");
  assert.equal(effectiveUpdateChannel("beta", { isPackaged: true, buildChannel: "stable" }), "beta");
  assert.equal(effectiveUpdateChannel("internal", { isPackaged: false, buildChannel: "stable" }), "internal");
});
