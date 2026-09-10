import { spawn } from "node:child_process";
import { createServer } from "node:net";

const webpack = process.argv.includes("--webpack");
const browser = process.argv.includes("--browser");
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const assigned = probe.address().port;
    probe.close(() => resolve(assigned));
  });
});
const origin = `http://localhost:${port}`;
const started = performance.now();
const server = spawn(process.execPath, [
  "node_modules/next/dist/bin/next", "dev",
  ...(webpack ? [] : ["--turbopack"]), "--port", String(port),
], {
  env: { ...process.env, NEXT_BUILD_DIR: webpack ? ".next-perf-webpack" : ".next-perf-turbo", DISABLE_PWA: "1" },
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
  const results = { compiler: webpack ? "webpack" : "turbopack", startupMs: Math.round(performance.now() - started), requests: [] };
  for (const path of ["/", "/", "/search", "/search", "/api/auth/session", "/api/auth/session"]) {
    const beginning = performance.now();
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(120000) });
    await response.arrayBuffer();
    results.requests.push({ path, status: response.status, ms: Math.round(performance.now() - beginning) });
    if (!response.ok) throw new Error(`Benchmark request ${path} returned ${response.status}`);
  }
  console.log(JSON.stringify(results, null, 2));
  if (browser) {
    const code = await new Promise((resolve, reject) => {
      const runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test"], {
        env: { ...process.env, PLAYWRIGHT_BASE_URL: origin }, stdio: "inherit",
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