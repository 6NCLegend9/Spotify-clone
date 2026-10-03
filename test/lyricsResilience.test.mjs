import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("lyrics provider outages tell generic GET clients not to retry immediately", async () => {
  const source = await readFile(path.join(root, "src/app/api/lyrics/route.js"), "utf8");
  assert.match(source, /Retry-After/);
  assert.match(source, /new ApiRouteError\(code,[\s\S]*headers:/);
});
