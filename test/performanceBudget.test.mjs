import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateNavigationMetrics,
  evaluateBenchmarkMethodology,
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
    longTasksMs: 20,
    sampleCount: 3,
    validSampleCounts: {
      usableMs: 3,
      scriptBytes: 3,
      longTasksMs: 3,
    },
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


test("a single noisy long-task sample cannot fail an otherwise stable route", () => {
  const aggregated = aggregateNavigationMetrics([
    { path: "/search", width: 1440, usableMs: 1434, scriptBytes: 491800, longTasks: 921 },
    { path: "/search", width: 1440, usableMs: 453, scriptBytes: 491800, longTasks: 0 },
    { path: "/search", width: 1440, usableMs: 355, scriptBytes: 474187, longTasks: 55 },
  ]);
  assert.deepEqual(aggregated["/search@1440"], {
    usableMs: 453,
    scriptBytes: 491800,
    longTasksMs: 55,
    sampleCount: 3,
    validSampleCounts: {
      usableMs: 3,
      scriptBytes: 3,
      longTasksMs: 3,
    },
  });
});

test("performance budget fails closed when required metrics are missing", () => {
  const baseline = {
    minimumSamplesPerSurface: 3,
    relativeTolerance: 0.3,
    absoluteFloors: { usableMs: 100, scriptBytes: 50000, longTasksMs: 150 },
    metrics: {
      "/search@390": { usableMs: 343, scriptBytes: 489712, longTasksMs: 53 },
    },
  };
  const current = aggregateNavigationMetrics([
    { path: "/search", width: 390, usableMs: 300, scriptBytes: 480000, longTasks: 20 },
    { path: "/search", width: 390, usableMs: 320, scriptBytes: undefined, longTasks: 30 },
    { path: "/search", width: 390, usableMs: 340, scriptBytes: NaN, longTasks: 40 },
  ]);
  const result = evaluatePerformanceBudget({ baseline, current });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.regressions.map((item) => item.metric),
    ["scriptBytesSampleCount"],
  );
});


test("performance budget fails closed when a surface has too few samples", () => {
  const baseline = {
    minimumSamplesPerSurface: 5,
    relativeTolerance: 0.3,
    absoluteFloors: { usableMs: 100, scriptBytes: 50000, longTasksMs: 150 },
    metrics: {
      "/search@1440": { usableMs: 500, scriptBytes: 490000, longTasksMs: 50 },
    },
  };
  const result = evaluatePerformanceBudget({
    baseline,
    current: {
      "/search@1440": {
        usableMs: 500,
        scriptBytes: 490000,
        longTasksMs: 50,
        sampleCount: 3,
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.regressions[0].metric, "sampleCount");
  assert.equal(result.regressions[0].minimum, 5);
});


test("performance gate rejects a baseline captured with a different benchmark methodology", () => {
  const baseline = {
    methodology: {
      samplesPerRoute: 5,
      isolatedContextPerSample: true,
      httpCacheEnabled: false,
      serviceWorkersEnabled: false,
      syntheticAPIs: true,
    },
  };
  const mismatch = evaluateBenchmarkMethodology({
    baseline,
    report: {
      environment: {
        samplesPerRoute: 3,
        isolatedContextPerSample: false,
        httpCacheEnabled: false,
        serviceWorkersEnabled: false,
        syntheticAPIs: true,
      },
    },
  });
  assert.equal(mismatch.ok, false);
  assert.deepEqual(mismatch.mismatches.map((item) => item.key).sort(), [
    "isolatedContextPerSample",
    "samplesPerRoute",
  ]);

  const match = evaluateBenchmarkMethodology({
    baseline,
    report: {
      environment: {
        ...baseline.methodology,
      },
    },
  });
  assert.equal(match.ok, true);
  assert.deepEqual(match.mismatches, []);
});
