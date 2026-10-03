import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => readFile(path.join(root, relative), "utf8");

test("production PWA uses Serwist without the retired next-pwa dependency", async () => {
  const pkg = JSON.parse(await source("package.json"));
  assert.equal(pkg.dependencies?.["@ducanh2912/next-pwa"], undefined);
  assert.match(pkg.dependencies?.["@serwist/next"] || "", /^\^?9\.5\.12$/);
  assert.match(pkg.devDependencies?.serwist || "", /^\^?9\.5\.12$/);
});

test("Serwist build keeps the existing service-worker lifecycle contract", async () => {
  const config = await source("next.config.js");
  assert.match(config, /@serwist\/next/);
  assert.match(config, /swSrc:\s*["']src\/sw\.js["']/);
  assert.match(config, /swDest:\s*["']public\/sw\.js["']/);
  assert.match(config, /disable:\s*disablePwa/);
  assert.doesNotMatch(config, /@ducanh2912\/next-pwa/);

  const worker = await source("src/sw.js");
  assert.match(worker, /precacheEntries:\s*self\.__SW_MANIFEST/);
  assert.match(worker, /skipWaiting:\s*true/);
  assert.match(worker, /clientsClaim:\s*true/);
  assert.match(worker, /cleanupOutdatedCaches:\s*true/);
  assert.match(worker, /serwist\.addEventListeners\(\)/);
});

test("Serwist never caches account or authentication routes and preserves bounded asset caches", async () => {
  const worker = await source("src/sw.js");
  assert.match(worker, /new NetworkOnly\(/);
  assert.match(worker, /url\.pathname\.startsWith\(["']\/api\/["']\)/);
  assert.match(worker, /login\|signup\|resend-verification\|reset-password\|verify-email/);

  assert.match(worker, /new CacheFirst\([\s\S]*cacheName:\s*["']static-resources["']/);
  assert.match(worker, /maxEntries:\s*96/);
  assert.match(worker, /maxAgeSeconds:\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60/);

  assert.match(worker, /new StaleWhileRevalidate\([\s\S]*cacheName:\s*["']image-resources["']/);
  assert.match(worker, /maxEntries:\s*128/);
  assert.match(worker, /maxAgeSeconds:\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
  assert.match(worker, /new CacheableResponsePlugin\(\{\s*statuses:\s*\[0,\s*200\]/);
});



test("Serwist build tooling pins the patched Browserslist release", async () => {
  const pkg = JSON.parse(await source("package.json"));
  assert.equal(pkg.overrides?.["@serwist/next"]?.browserslist, "4.28.7");

  const lock = JSON.parse(await source("package-lock.json"));
  assert.equal(lock.packages?.["node_modules/@serwist/next/node_modules/browserslist"]?.version, "4.28.7");
});
