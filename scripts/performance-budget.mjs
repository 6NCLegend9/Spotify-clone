import { readFile } from "node:fs/promises";
import { aggregateNavigationMetrics, evaluatePerformanceBudget } from "./performance-budget-lib.mjs";

const [reportPath = "artifacts/performance.json", baselinePath = "scripts/performance-baseline.json"] = process.argv.slice(2);
const [report, baseline] = await Promise.all([
  readFile(reportPath, "utf8").then(JSON.parse),
  readFile(baselinePath, "utf8").then(JSON.parse),
]);

const current = aggregateNavigationMetrics(report.navigation);
const result = evaluatePerformanceBudget({ baseline, current });

process.stdout.write(`${JSON.stringify({
  event: "performance_budget",
  ok: result.ok,
  baselineSource: baseline.source,
  current,
  regressions: result.regressions,
}, null, 2)}\n`);

if (!result.ok) process.exitCode = 1;
