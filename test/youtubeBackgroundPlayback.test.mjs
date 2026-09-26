import assert from "node:assert/strict";
import test from "node:test";
import { shouldDeferYoutubeResume } from "../src/utils/youtubeResumePolicy.mjs";

test("explicit media-key play may resume YouTube while the page is hidden", () => {
  assert.equal(shouldDeferYoutubeResume({ hidden: true, explicitUserAction: true }), false);
});

test("automatic resume remains deferred while the page is hidden", () => {
  assert.equal(shouldDeferYoutubeResume({ hidden: true, explicitUserAction: false }), true);
  assert.equal(shouldDeferYoutubeResume({ hidden: false, explicitUserAction: false }), false);
});
