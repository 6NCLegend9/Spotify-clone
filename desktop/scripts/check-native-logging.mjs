import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { NativeLogger, sanitizeFields } from "../src/nativeLogger.mjs";

test("native diagnostics preserve numeric network and Windows crash codes", () => {
  assert.deepEqual(sanitizeFields({ errorCode: -6, exitCode: 3221225477 }), { errorCode: -6, exitCode: 3221225477 });
});

test("credential codes and strings remain redacted, including numeric-looking strings", () => {
  for (const value of ["-6", "secret-grant", Infinity, NaN, 1.5, 4294967296, -2147483649]) {
    assert.equal(sanitizeFields({ errorCode: value }).errorCode, "[redacted]");
    assert.equal(sanitizeFields({ exitCode: value }).exitCode, "[redacted]");
  }
  const fields = sanitizeFields({ code: 123456, authorizationCode: "private", sessionToken: "private", description: "private detail" });
  assert.equal(fields.code, "[redacted]");
  assert.equal(fields.authorizationCode, "[redacted]");
  assert.equal(fields.sessionToken, "[redacted]");
  assert.equal(fields.description, "operation_failed");
});

test("numeric diagnostics survive write, reread and startup sanitation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "haykasa-log-codes-"));
  try {
    const logger = new NativeLogger(directory);
    logger.warn("renderer_navigation_failed", { errorCode: -6, code: "private-grant", description: "private-url-or-account" });
    const reopened = new NativeLogger(directory);
    const entry = reopened.tail()[0];
    assert.equal(entry.errorCode, -6);
    assert.equal(entry.code, "[redacted]");
    assert.equal(entry.description, "operation_failed");
    assert(!fs.readFileSync(logger.file, "utf8").includes("private"));
  } finally {
    fs.rmSync(path.join(directory, "logs", "desktop.log"), { force: true });
    fs.rmdirSync(path.join(directory, "logs"));
    fs.rmdirSync(directory);
  }
});
