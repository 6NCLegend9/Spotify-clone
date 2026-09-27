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


test("performance baseline is derived from five independent benchmark batches", () => {
  const baseline = JSON.parse(readFileSync(path.join(root, "scripts/performance-baseline.json"), "utf8"));
  assert.equal(Array.isArray(baseline.source?.benchmarkJobIds), true);
  assert.equal(baseline.source.benchmarkJobIds.length, 5);
  assert.equal(new Set(baseline.source.benchmarkJobIds).size, 5);
});

test("CI confirms a first performance-budget failure with a fresh benchmark batch", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /Initial performance budget failed; confirming with a fresh benchmark batch/);
  const firstGate = workflow.indexOf("node scripts/performance-budget.mjs");
  const confirmation = workflow.indexOf("npm run benchmark:production", firstGate + 1);
  const secondGate = workflow.indexOf("node scripts/performance-budget.mjs", firstGate + 1);
  assert.ok(firstGate >= 0, "workflow must run the first performance budget evaluation");
  assert.ok(confirmation > firstGate, "workflow must run a fresh benchmark after the first failed evaluation");
  assert.ok(secondGate > confirmation, "workflow must re-evaluate the fresh benchmark batch");
});
