import { readFile } from "node:fs/promises";
import { aggregateNavigationMetrics, evaluateBenchmarkMethodology, evaluatePerformanceBudget } from "./performance-budget-lib.mjs";

const [reportPath = "artifacts/performance.json", baselinePath = "scripts/performance-baseline.json"] = process.argv.slice(2);
const [report, baseline] = await Promise.all([
  readFile(reportPath, "utf8").then(JSON.parse),
  readFile(baselinePath, "utf8").then(JSON.parse),
]);

const methodology = evaluateBenchmarkMethodology({ baseline, report });
const current = aggregateNavigationMetrics(report.navigation);
const result = methodology.ok
  ? evaluatePerformanceBudget({ baseline, current })
  : { ok: false, regressions: [] };

process.stdout.write(`${JSON.stringify({
  event: "performance_budget",
  ok: methodology.ok && result.ok,
  baselineSource: baseline.source,
  methodology,
  current,
  regressions: result.regressions,
}, null, 2)}\n`);

if (!methodology.ok || !result.ok) process.exitCode = 1;
