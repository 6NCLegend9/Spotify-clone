import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiRouteError,
  apiErrorStatus,
  buildApiErrorEnvelope,
  readRequestJson,
} from "../src/utils/apiResponseCore.mjs";

test("API errors use a stable public envelope", () => {
  assert.equal(apiErrorStatus("RATE_LIMITED"), 429);
  assert.deepEqual(
    buildApiErrorEnvelope("NOT_FOUND", {
      message: "Playlist not found.",
      details: { resource: "playlist" },
    }),
    {
      success: false,
      code: "NOT_FOUND",
      title: "Not found",
      message: "Playlist not found.",
      error: "Playlist not found.",
      data: null,
      details: { resource: "playlist" },
    },
  );
});

test("readRequestJson rejects malformed JSON with a public validation error", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{broken",
  });

  await assert.rejects(
    readRequestJson(request),
    (error) => (
      error instanceof ApiRouteError
      && error.code === "VALIDATION_ERROR"
      && error.status === 400
      && error.publicMessage === "The request body must be valid JSON."
    ),
  );
});
