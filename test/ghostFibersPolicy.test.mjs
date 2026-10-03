import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(root, "src/utils/ghostFibersPolicy.mjs");

test("GhostFibers mobile workload stays capped after prop updates", async () => {
  assert.equal(existsSync(policyPath), true, "GhostFibers workload policy must be centralized");
  if (!existsSync(policyPath)) return;

  const { resolveGhostFibersWorkload } = await import(pathToFileURL(policyPath).href);
  assert.deepEqual(
    resolveGhostFibersWorkload({
      isPhone: true,
      hardwareConcurrency: 8,
      dpr: 1,
      fps: 45,
      layers: 4,
    }),
    { dpr: 0.5, fps: 24, layers: 2 },
  );

  assert.deepEqual(
    resolveGhostFibersWorkload({
      isPhone: false,
      hardwareConcurrency: 4,
      dpr: 1,
      fps: 60,
      layers: 6,
    }),
    { dpr: 0.6, fps: 28, layers: 4 },
  );

  assert.deepEqual(
    resolveGhostFibersWorkload({
      isPhone: false,
      hardwareConcurrency: 8,
      dpr: 2,
      fps: 60,
      layers: 8,
    }),
    { dpr: 0.9, fps: 42, layers: 4 },
  );
});

test("GhostFibers applies the same workload policy during initialization and prop updates", () => {
  const source = readFileSync(path.join(root, "src/components/ReactBits/GhostFibers.jsx"), "utf8");
  assert.match(source, /resolveGhostFibersWorkload/);
  assert.doesNotMatch(source, /context\.setFps\(fps\)/);
  assert.doesNotMatch(source, /isMobile \? 3 : 10/);
});
