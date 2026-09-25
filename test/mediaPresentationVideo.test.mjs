import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveInitialMediaVideoMode,
  resolveMediaVideoModeAfterCapabilityChange,
  shouldExposeLiveVideoViewport,
} from "../src/components/MusicPlayer/mediaPresentationState.mjs";

test("video-capable playback defaults to video when the user has no saved media preference", () => {
  assert.equal(resolveInitialMediaVideoMode(null, true), true);
  assert.equal(resolveInitialMediaVideoMode(undefined, true), true);
  assert.equal(resolveInitialMediaVideoMode("", true), true);
});

test("an explicit saved media preference still wins", () => {
  assert.equal(resolveInitialMediaVideoMode("video", true), true);
  assert.equal(resolveInitialMediaVideoMode("audio", true), false);
  assert.equal(resolveInitialMediaVideoMode("video", false), false);
});


test("video preference is restored after a temporary video capability loss", () => {
  assert.equal(resolveMediaVideoModeAfterCapabilityChange("video", true), true);
  assert.equal(resolveMediaVideoModeAfterCapabilityChange("audio", true), false);
  assert.equal(resolveMediaVideoModeAfterCapabilityChange("video", false), false);
});

test("mobile video stays hidden while the sheet geometry is moving", () => {
  assert.equal(shouldExposeLiveVideoViewport({
    showingVideo: true,
    mobile: true,
    entering: true,
    closing: false,
    dragY: 0,
  }), false);
  assert.equal(shouldExposeLiveVideoViewport({
    showingVideo: true,
    mobile: true,
    entering: false,
    closing: true,
    dragY: 0,
  }), false);
  assert.equal(shouldExposeLiveVideoViewport({
    showingVideo: true,
    mobile: true,
    entering: false,
    closing: false,
    dragY: 24,
  }), false);
});

test("stable mobile and desktop video expose the live iframe", () => {
  assert.equal(shouldExposeLiveVideoViewport({
    showingVideo: true,
    mobile: true,
    entering: false,
    closing: false,
    dragY: 0,
  }), true);
  assert.equal(shouldExposeLiveVideoViewport({
    showingVideo: true,
    mobile: false,
    entering: true,
    closing: false,
    dragY: 0,
  }), true);
  assert.equal(shouldExposeLiveVideoViewport({
    showingVideo: false,
    mobile: false,
    entering: false,
    closing: false,
    dragY: 0,
  }), false);
});
