import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = String(process.env.HEYKASA_DESKTOP_SMOKE_URL || "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
  throw new Error("HEYKASA_DESKTOP_SMOKE_URL must be a loopback HTTP origin.");
}

const requireFromDesktop = createRequire(path.join(desktopRoot, "package.json"));
const executablePath = requireFromDesktop("electron");
const errors = [];
const startedAt = performance.now();

const app = await electron.launch({
  executablePath,
  args: [desktopRoot],
  cwd: desktopRoot,
  env: {
    ...process.env,
    HEYKASA_DESKTOP_URL: origin,
  },
});

try {
  await app.context().route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const headers = { "Cache-Control": "private, no-store" };
    if (pathname === "/api/auth/session") return route.fulfill({ headers, json: {} });
    if (pathname === "/api/recommendations") {
      return route.fulfill({ headers, json: { sections: {}, mode: "guest" } });
    }
    if (pathname === "/api/settings") {
      return route.fulfill({ headers, json: { authenticated: false, settings: null } });
    }
    if (pathname === "/api/language") {
      return route.fulfill({ headers, json: { authenticated: false, language: null } });
    }
    return route.fulfill({
      headers,
      json: { success: true, data: [], genres: [], tree: [], personalGenres: [] },
    });
  });

  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.waitForURL((url) => url.origin === origin, { timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");

  const bridge = await page.evaluate(() => ({
    hasDesktop: typeof window.heykasaDesktop?.getInfo === "function",
    hasNodeRequire: typeof window.require !== "undefined",
  }));
  assert.equal(bridge.hasDesktop, true, "Electron preload bridge should be available.");
  assert.equal(bridge.hasNodeRequire, false, "Renderer must not expose Node require.");

  await page.goto(`${origin}/search`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Browse all", exact: true }).waitFor();
  await page.getByRole("combobox", {
    name: "Search songs, artists, playlists, and genres",
    exact: true,
  }).waitFor();

  const info = await page.evaluate(() => window.heykasaDesktop.getInfo());
  assert.ok(Number.isInteger(info.apiVersion) && info.apiVersion >= 1);
  assert.ok(Array.isArray(info.capabilities));

  if (errors.length) {
    throw new Error(`Electron renderer reported errors:\n${errors.join("\n")}`);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    usableMs: Math.round(performance.now() - startedAt),
    url: page.url(),
    apiVersion: info.apiVersion,
    capabilities: info.capabilities,
  }) + "\n");
} finally {
  await app.close();
}
