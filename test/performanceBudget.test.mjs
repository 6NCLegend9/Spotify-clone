import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateNavigationMetrics,
  evaluatePerformanceBudget,
  median,
} from "../scripts/performance-budget-lib.mjs";

test("median is stable for odd and even samples", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test("aggregates route metrics by path and viewport", () => {
  const aggregated = aggregateNavigationMetrics([
    { path: "/search", width: 390, usableMs: 300, scriptBytes: 480000, longTasks: 20 },
    { path: "/search", width: 390, usableMs: 360, scriptBytes: 490000, longTasks: 0 },
    { path: "/search", width: 390, usableMs: 330, scriptBytes: 485000, longTasks: 40 },
  ]);
  assert.deepEqual(aggregated["/search@390"], {
    usableMs: 330,
    scriptBytes: 485000,
    longTasksMs: 40,
  });
});

test("small benchmark noise stays inside budget", () => {
  const baseline = {
    relativeTolerance: 0.3,
    absoluteFloors: { usableMs: 100, scriptBytes: 50000, longTasksMs: 100 },
    metrics: {
      "/search@390": { usableMs: 343, scriptBytes: 489712, longTasksMs: 53 },
    },
  };
  const result = evaluatePerformanceBudget({
    baseline,
    current: {
      "/search@390": { usableMs: 390, scriptBytes: 520000, longTasksMs: 80 },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.regressions, []);
});

test("material usable-time and script regressions fail", () => {
  const baseline = {
    relativeTolerance: 0.3,
    absoluteFloors: { usableMs: 100, scriptBytes: 50000, longTasksMs: 100 },
    metrics: {
      "/search@1440": { usableMs: 511, scriptBytes: 489712, longTasksMs: 535 },
    },
  };
  const result = evaluatePerformanceBudget({
    baseline,
    current: {
      "/search@1440": { usableMs: 900, scriptBytes: 700000, longTasksMs: 550 },
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.regressions.map((item) => item.metric).sort(), ["scriptBytes", "usableMs"]);
});

test("long-task regression from a zero baseline still uses an absolute noise floor", () => {
  const baseline = {
    relativeTolerance: 0.3,
    absoluteFloors: { usableMs: 100, scriptBytes: 50000, longTasksMs: 150 },
    metrics: {
      "/library@1440": { usableMs: 313, scriptBytes: 502213, longTasksMs: 0 },
    },
  };
  const pass = evaluatePerformanceBudget({
    baseline,
    current: { "/library@1440": { usableMs: 320, scriptBytes: 500000, longTasksMs: 120 } },
  });
  assert.equal(pass.ok, true);

  const fail = evaluatePerformanceBudget({
    baseline,
    current: { "/library@1440": { usableMs: 320, scriptBytes: 500000, longTasksMs: 220 } },
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.regressions[0].metric, "longTasksMs");
});
