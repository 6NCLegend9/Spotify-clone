import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { JAM_HEARTBEAT_MS } from "../../src/utils/jam.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = String(process.env.HEYKASA_DESKTOP_SMOKE_URL || "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
  throw new Error("HEYKASA_DESKTOP_SMOKE_URL must be a loopback HTTP origin.");
}

const requireFromDesktop = createRequire(path.join(desktopRoot, "package.json"));
const executablePath = requireFromDesktop("electron");
const app = await electron.launch({
  executablePath,
  args: [desktopRoot],
  cwd: desktopRoot,
  env: {
    ...process.env,
    HEYKASA_DESKTOP_URL: origin,
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  await page.waitForURL((url) => url.origin === origin, { timeout: 30_000 });
  await page.goto(`${origin}/search`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Browse all", exact: true }).waitFor();

  await page.evaluate((heartbeatMs) => {
    const state = {
      intervalTicks: 0,
      animationFrames: 0,
      criticalHeartbeats: 0,
      commands: [],
    };
    const interval = window.setInterval(() => { state.intervalTicks += 1; }, 50);
    const critical = window.setInterval(() => { state.criticalHeartbeats += 1; }, heartbeatMs);
    let frame = 0;
    const animate = () => {
      state.animationFrames += 1;
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    const unsubscribe = window.heykasaDesktop?.playback?.onCommand?.((command) => {
      state.commands.push(command);
    });
    window.__heykasaBackgroundProbe = {
      state,
      cleanup() {
        window.clearInterval(interval);
        window.clearInterval(critical);
        if (frame) window.cancelAnimationFrame(frame);
        unsubscribe?.();
      },
    };
  }, JAM_HEARTBEAT_MS);

  const snapshot = () => page.evaluate(() => ({
    visibilityState: document.visibilityState,
    intervalTicks: window.__heykasaBackgroundProbe?.state?.intervalTicks || 0,
    animationFrames: window.__heykasaBackgroundProbe?.state?.animationFrames || 0,
    criticalHeartbeats: window.__heykasaBackgroundProbe?.state?.criticalHeartbeats || 0,
    commands: [...(window.__heykasaBackgroundProbe?.state?.commands || [])],
  }));

  const start = await snapshot();
  await sleep(1_500);
  const visible = await snapshot();

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.hide();
  });
  await sleep(5_500);

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.webContents?.send("heykasa:playback:command", "play-pause");
  });
  await sleep(300);
  const hidden = await snapshot();

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.show();
  });
  await sleep(500);
  const restored = await snapshot();

  const result = {
    event: "desktop_background_runtime_measurement",
    visible: {
      visibilityState: visible.visibilityState,
      intervalTicks: visible.intervalTicks - start.intervalTicks,
      animationFrames: visible.animationFrames - start.animationFrames,
      criticalHeartbeats: visible.criticalHeartbeats - start.criticalHeartbeats,
    },
    hidden: {
      visibilityState: hidden.visibilityState,
      intervalTicks: hidden.intervalTicks - visible.intervalTicks,
      animationFrames: hidden.animationFrames - visible.animationFrames,
      criticalHeartbeats: hidden.criticalHeartbeats - visible.criticalHeartbeats,
      nativePlaybackCommandDelivered: hidden.commands.includes("play-pause"),
    },
    restored: {
      visibilityState: restored.visibilityState,
      intervalTicks: restored.intervalTicks - hidden.intervalTicks,
      animationFrames: restored.animationFrames - hidden.animationFrames,
    },
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
  assert.equal(
    hidden.visibilityState,
    "hidden",
    "The shared renderer must enter hidden visibility state when the Desktop window is hidden.",
  );
  assert.ok(
    hidden.intervalTicks - visible.intervalTicks <= 15,
    "Nonessential fast renderer timers must be throttled while the Desktop window is hidden.",
  );
  assert.ok(
    hidden.animationFrames - visible.animationFrames <= 5,
    "Animation frames must stop while the Desktop window is hidden.",
  );
  assert.ok(
    hidden.commands.includes("play-pause"),
    "Hidden renderer must still receive explicit native playback commands.",
  );
  assert.ok(
    hidden.criticalHeartbeats - visible.criticalHeartbeats >= 1,
    "A Jam-sized heartbeat interval must still progress while the Desktop window is hidden.",
  );

  await page.evaluate(() => window.__heykasaBackgroundProbe?.cleanup?.());
} finally {
  await app.close();
}
