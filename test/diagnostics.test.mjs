import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticRecord, diagnosticRoute } from "../src/utils/diagnostics.mjs";

test("diagnostics never retain query strings, credentials, titles, account data or free-form errors", () => {
  const record = diagnosticRecord("request", {
    route: "/api/youtube-search?q=private-song&token=secret", durationMs: 12.9, status: 200,
    email: "private@example.test", title: "private-title", message: "secret password", code: "arbitrary-personal-data",
  }, 1000);
  assert.deepEqual(record, { event: "request", at: "1970-01-01T00:00:01.000Z", route: "/api/youtube-search", durationMs: 13, status: 200 });
  assert.equal(diagnosticRoute("/api/account/private-user-id?token=secret"), "/api/account/:action");
  assert.equal(diagnosticRoute("/search/private-query"), "other");
  assert.equal(diagnosticRoute("/api/unknown-private-id"), "other");
});