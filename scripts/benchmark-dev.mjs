import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const webpack = process.argv.includes("--webpack");
const browser = process.argv.includes("--browser");
const production = process.argv.includes("--production");
const buildDirectory = production ? process.env.NEXT_BUILD_DIR || ".next" : webpack ? ".next-perf-webpack" : ".next-perf-turbo";
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const assigned = probe.address().port;
    probe.close(() => resolve(assigned));
  });
});
const origin = `http://127.0.0.1:${port}`;
const started = performance.now();
const server = spawn(process.execPath, [
  "node_modules/next/dist/bin/next", production ? "start" : "dev",
  ...(production || webpack ? [] : ["--turbopack"]), "--hostname", "127.0.0.1", "--port", String(port),
], {
  env: { ...process.env, NEXT_BUILD_DIR: buildDirectory, DISABLE_PWA: production ? "0" : "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let stopping = false;
let output = "";
server.on("exit", (code, signal) => {
  if (!stopping) console.error(`Development server exited: code=${code}, signal=${signal}`);
});
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Development server did not become ready in 90 seconds")), 90000);
  const onOutput = (chunk) => {
    const text = chunk.toString();
    output = (output + text).slice(-16000);
    process.stdout.write(text);
    if (output.includes("Ready in")) {
      clearTimeout(timer);
      resolve();
    }
  };
  server.stdout.on("data", onOutput);
  server.stderr.on("data", onOutput);
  server.once("error", (error) => { clearTimeout(timer); reject(error); });
  server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited before readiness: ${code}`)); });
});

try {
  await ready;
  const results = { mode: production ? "production" : "development", compiler: production || webpack ? "webpack" : "turbopack", startupMs: Math.round(performance.now() - started), requests: [] };
  for (const path of ["/", "/", "/search", "/search", "/api/auth/session", "/api/auth/session"]) {
    const beginning = performance.now();
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(120000) });
    await response.arrayBuffer();
    results.requests.push({ path, status: response.status, ms: Math.round(performance.now() - beginning) });
    if (!response.ok) throw new Error(`Benchmark request ${path} returned ${response.status}`);
  }
  console.log(JSON.stringify(results, null, 2));
  if (production) {
    const { chromium } = await import("@playwright/test");
    const browserInstance = await chromium.launch();
    results.navigation = [];
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const context = await browserInstance.newContext({ viewport, serviceWorkers: "block" });
        await context.addInitScript(() => {
          delete Navigator.prototype.serviceWorker;
          window.__performanceProbe = { lcp: null, cls: 0, longTasks: 0 };
          for (const type of ["largest-contentful-paint", "layout-shift", "longtask"]) {
            try {
              new PerformanceObserver((list) => list.getEntries().forEach((entry) => {
                if (type === "largest-contentful-paint") window.__performanceProbe.lcp = entry.startTime;
                if (type === "layout-shift" && !entry.hadRecentInput) window.__performanceProbe.cls += entry.value;
                if (type === "longtask") window.__performanceProbe.longTasks += entry.duration;
              })).observe({ type, buffered: true });
            } catch {}
          }
        });
        await context.route("**/api/**", (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path === "/api/auth/session") return route.fulfill({ json: {} });
          if (path === "/api/recommendations") return route.fulfill({ json: { sections: {}, mode: "guest" } });
          if (path === "/api/settings") return route.fulfill({ json: { authenticated: false, settings: null } });
          if (path === "/api/language") return route.fulfill({ json: { authenticated: false, language: null } });
          return route.fulfill({ json: { success: true, data: [], genres: [], tree: [], personalGenres: [] } });
        });
        const page = await context.newPage();
        for (const path of ["/search", "/library"]) {
          for (let sample = 0; sample < 3; sample += 1) {
            const start = performance.now();
            const response = await page.goto(`${origin}${path}`, { waitUntil: "load" });
            if (!response?.ok()) throw new Error(`Production navigation ${path} failed`);
            await page.getByRole("heading", { name: path === "/search" ? "Browse all" : "Your Library", exact: true }).waitFor();
            await page.getByRole("combobox", { name: "Search songs, artists, playlists, and genres", exact: true }).waitFor();
            const usableMs = Math.round(performance.now() - start);
            const metrics = await page.evaluate(() => {
              const navigation = performance.getEntriesByType("navigation")[0];
              const scripts = performance.getEntriesByType("resource").filter((entry) => entry.initiatorType === "script");
              return { ttfbMs: Math.round(navigation.responseStart - navigation.requestStart),
                domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
                scriptBytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
                scriptRequests: scripts.length, ...window.__performanceProbe };
            });
            results.navigation.push({ path, width: viewport.width, sample: sample + 1,
              load: sample ? "repeat-route" : "first-route", httpCache: "disabled-by-routing", usableMs, ...metrics });
          }
        }
        await context.close();
      }
    } finally { await browserInstance.close(); }
    results.buildId = (await readFile(join(buildDirectory, "BUILD_ID"), "utf8")).trim();
    results.commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    results.dirtyWorktree = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
    results.environment = { node: process.version, platform: process.platform, syntheticAPIs: true, samplesPerRoute: 3,
      httpCacheEnabled: false, serviceWorkersEnabled: false, webVitalsSample: "at-visible-shell-not-final-page-lifetime" };
    const appManifest = JSON.parse(await readFile(join(buildDirectory, "app-build-manifest.json"), "utf8"));
    const paths = [...new Set(Object.values(appManifest.pages).flat())];
    results.uncompressedAppAssetsBytes = (await Promise.all(paths.map(async (path) => (await readFile(join(buildDirectory, path))).length))).reduce((sum, bytes) => sum + bytes, 0);
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/performance.json", JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ report: "artifacts/performance.json", buildId: results.buildId, navigation: results.navigation }, null, 2));
  }
  if (browser) {
    const code = await new Promise((resolve, reject) => {
      const runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test"], {
        env: { ...process.env, PLAYWRIGHT_BASE_URL: origin, PLAYWRIGHT_PWA: production ? "1" : "0" }, stdio: "inherit",
      });
      runner.once("error", reject);
      runner.once("exit", resolve);
    });
    if (code !== 0) throw new Error(`Browser suite exited with code ${code}`);
  }
  if (server.exitCode !== null || server.signalCode !== null) throw new Error("Development server exited during verification");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  stopping = true;
  if (server.exitCode === null && server.signalCode === null) {
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const cleanup = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
        cleanup.once("error", resolve);
        cleanup.once("exit", resolve);
      });
    } else {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
  }
}