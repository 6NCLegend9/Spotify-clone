import assert from "node:assert/strict";
import test from "node:test";

import { isAnalyticsRuntimeEnabled } from "../src/utils/analyticsRuntime.mjs";

test("analytics scripts stay off in development and on localhost", () => {
  assert.equal(isAnalyticsRuntimeEnabled({ nodeEnv: "development", hostname: "haykasa.vercel.app" }), false);
  assert.equal(isAnalyticsRuntimeEnabled({ nodeEnv: "production", hostname: "localhost" }), false);
  assert.equal(isAnalyticsRuntimeEnabled({ nodeEnv: "production", hostname: "127.0.0.1" }), false);
  assert.equal(isAnalyticsRuntimeEnabled({ nodeEnv: "production", hostname: "" }), false);
});

test("analytics scripts load on the production hostname", () => {
  assert.equal(isAnalyticsRuntimeEnabled({ nodeEnv: "production", hostname: "haykasa.vercel.app" }), true);
});
