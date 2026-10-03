import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveGhostFiberWorkload } from "../src/utils/backgroundWorkload.mjs";

test("mobile GhostFibers keeps one workload budget across init and prop updates", () => {
  assert.deepEqual(
    resolveGhostFiberWorkload({
      isPhone: true,
      hardwareConcurrency: 8,
      dpr: 1,
      fps: 45,
      layers: 4,
    }),
    { dpr: 0.5, fps: 24, layers: 2 },
  );
});

test("low-end desktop caps DPR and FPS without pretending to be phone layout", () => {
  assert.deepEqual(
    resolveGhostFiberWorkload({
      isPhone: false,
      hardwareConcurrency: 4,
      dpr: 1,
      fps: 60,
      layers: 8,
    }),
    { dpr: 0.6, fps: 28, layers: 4 },
  );
});

test("normal desktop bounds visual workload and rejects invalid values", () => {
  assert.deepEqual(
    resolveGhostFiberWorkload({
      isPhone: false,
      hardwareConcurrency: 12,
      dpr: 2,
      fps: 120,
      layers: 0,
    }),
    { dpr: 0.9, fps: 42, layers: 1 },
  );
});


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("GhostFibers consumes the shared workload policy in both lifecycle phases", () => {
  const source = readFileSync(path.join(root, "src/components/ReactBits/GhostFibers.jsx"), "utf8");
  const uses = source.match(/resolveGhostFiberWorkload\(/g) || [];
  assert.ok(uses.length >= 2, "init and prop-update effects must share the same workload resolver");
  assert.doesNotMatch(source, /context\.setFps\(fps\)/);
  assert.doesNotMatch(source, /isMobile \? 3 : 10/);
});
