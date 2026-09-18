import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NativeLogger, sanitizeFields } from "../src/nativeLogger.mjs";

test("desktop logger redacts secrets and bounds fields", () => {
  const fields = sanitizeFields({
    state: "ready",
    sessionToken: "do-not-log",
    password: "do-not-log",
    message: "x".repeat(2000),
    nested: { ignored: true },
  });
  assert.equal(fields.state, "ready");
  assert.equal(fields.sessionToken, "[redacted]");
  assert.equal(fields.password, "[redacted]");
  assert.equal(fields.message.length, 1000);
  assert.equal("nested" in fields, false);
});

test("desktop logger persists sanitized JSON diagnostics", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heykasa-desktop-log-"));
  try {
    const logger = new NativeLogger(directory);
    logger.info("desktop_start", { version: "1.0.0", authorization: "secret" });
    logger.error("renderer crash", { reason: "crashed" });
    const tail = logger.tail(10);
    assert.equal(tail.length, 2);
    assert.equal(tail[0].event, "desktop_start");
    assert.equal(tail[0].authorization, "[redacted]");
    assert.equal(tail[1].event, "renderer_crash");
    assert.equal(tail[1].reason, "crashed");
    logger.clear();
    assert.deepEqual(logger.tail(), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
