export function median(values) {
  const numbers = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!numbers.length) return 0;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2
    ? numbers[middle]
    : (numbers[middle - 1] + numbers[middle]) / 2;
}

export function aggregateNavigationMetrics(navigation) {
  const groups = new Map();
  for (const sample of Array.isArray(navigation) ? navigation : []) {
    const path = String(sample?.path || "").trim();
    const width = Number(sample?.width);
    if (!path || !Number.isFinite(width)) continue;
    const key = `${path}@${width}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  }

  const result = {};
  for (const [key, samples] of groups) {
    result[key] = {
      usableMs: median(samples.map((sample) => sample.usableMs)),
      scriptBytes: median(samples.map((sample) => sample.scriptBytes)),
      longTasksMs: Math.max(0, ...samples.map((sample) => Number(sample.longTasks) || 0)),
    };
  }
  return result;
}

function thresholdFor(baselineValue, relativeTolerance, absoluteFloor) {
  const baseline = Math.max(0, Number(baselineValue) || 0);
  const relative = baseline * Math.max(0, Number(relativeTolerance) || 0);
  const absolute = Math.max(0, Number(absoluteFloor) || 0);
  return baseline + Math.max(relative, absolute);
}

export function evaluatePerformanceBudget({ baseline, current }) {
  const relativeTolerance = Number(baseline?.relativeTolerance) || 0;
  const absoluteFloors = baseline?.absoluteFloors || {};
  const regressions = [];

  for (const [surface, expected] of Object.entries(baseline?.metrics || {})) {
    const observed = current?.[surface];
    if (!observed) {
      regressions.push({
        surface,
        metric: "missing",
        baseline: expected,
        current: null,
        threshold: null,
      });
      continue;
    }

    for (const metric of ["usableMs", "scriptBytes", "longTasksMs"]) {
      const baselineValue = Number(expected?.[metric]) || 0;
      const currentValue = Number(observed?.[metric]) || 0;
      const threshold = thresholdFor(
        baselineValue,
        relativeTolerance,
        absoluteFloors?.[metric],
      );
      if (currentValue > threshold) {
        regressions.push({
          surface,
          metric,
          baseline: baselineValue,
          current: currentValue,
          threshold: Math.round(threshold),
        });
      }
    }
  }

  return {
    ok: regressions.length === 0,
    regressions,
  };
}
