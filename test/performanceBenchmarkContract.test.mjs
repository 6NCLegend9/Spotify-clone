import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("production navigation benchmark uses five isolated contexts per surface", () => {
  const source = readFileSync(path.join(root, "scripts/benchmark-dev.mjs"), "utf8");
  assert.match(source, /const BENCHMARK_SAMPLES_PER_ROUTE = 5;/);
  assert.match(source, /samplesPerRoute:\s*BENCHMARK_SAMPLES_PER_ROUTE/);
  assert.match(source, /isolatedContextPerSample:\s*true/);

  const sampleLoop = source.indexOf("for (let sample = 0; sample < BENCHMARK_SAMPLES_PER_ROUTE; sample += 1)");
  const contextCreation = source.indexOf("await browserInstance.newContext", sampleLoop);
  const navigation = source.indexOf("await page.goto", sampleLoop);
  const contextClose = source.indexOf("await context.close()", navigation);

  assert.ok(sampleLoop >= 0, "benchmark must iterate the shared five-sample count");
  assert.ok(contextCreation > sampleLoop, "each sample must create its own browser context");
  assert.ok(navigation > contextCreation, "navigation must happen inside the isolated sample context");
  assert.ok(contextClose > navigation, "each isolated sample context must be closed");
});
