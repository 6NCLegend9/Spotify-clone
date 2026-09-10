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

test("allowPrimitive accepts valid JSON values but still rejects malformed JSON", async () => {
  const requestFor = (body) => new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  for (const value of [null, false, 0, "track", ["track"]]) {
    assert.deepEqual(
      await readRequestJson(requestFor(JSON.stringify(value)), { allowPrimitive: true }),
      value,
    );
    await assert.rejects(readRequestJson(requestFor(JSON.stringify(value))), { status: 400 });
  }
  await assert.rejects(
    readRequestJson(requestFor("{broken"), { allowPrimitive: true }),
    { name: "ApiRouteError", code: "VALIDATION_ERROR", status: 400 },
  );
});
