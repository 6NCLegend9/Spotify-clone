// Synthetic native/PWA identities exercise the production UI, not native shells.
const assert = require("node:assert/strict");
const path = require("node:path");

const windowsAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const androidAgent = "Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 HayKasaAndroid/1.0.2";
const iosAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

module.exports = async function installedContexts({ browser, origin, output }) {
  const results = [];
  const cases = [
    { name: "windows-browser", userAgent: windowsAgent },
    { name: "native-desktop-delayed", userAgent: windowsAgent, desktop: "delayed" },
    { name: "native-desktop-rejected", userAgent: windowsAgent, desktop: "rejected" },
    { name: "native-android-agent", userAgent: androidAgent },
    { name: "native-android-bridge", userAgent: windowsAgent, androidBridge: true },
    { name: "standalone-pwa", userAgent: windowsAgent, standalone: true },
    { name: "ios-standalone-pwa", userAgent: iosAgent, iosStandalone: true },
  ];

  for (const testCase of cases) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 }, userAgent: testCase.userAgent,
      acceptDownloads: true, serviceWorkers: "block", reducedMotion: "reduce",
    });
    const errors = [];
    let page;
    try {
      await context.addInitScript(config => {
        delete Object.getPrototypeOf(navigator).serviceWorker;
        localStorage.setItem("toturialComplete", "true");
        if (config.standalone) {
          const matchMedia = window.matchMedia.bind(window);
          window.matchMedia = query => {
            const media = matchMedia(query);
            if (query === "(display-mode: standalone)") Object.defineProperty(media, "matches", { value: true });
            return media;
          };
        }
        if (config.iosStandalone) Object.defineProperty(navigator, "standalone", { value: true });
        if (config.androidBridge) window.HayKasaAndroidMedia = { postMessage() {} };
        if (config.desktop) {
          const info = { productName: "HayKasa", desktopVersion: "1.0.2", apiVersion: 1, capabilities: ["updaterV1"], platform: "win32", arch: "x64", packaged: true };
          const pending = [];
          let resolved = false;
          window.__qaDesktopInfoCalls = 0;
          window.__qaDesktopUpdateChecks = 0;
          window.__qaResolveDesktopInfo = () => { resolved = true; pending.splice(0).forEach(resolve => resolve(info)); };
          window.heykasaDesktop = {
            getInfo: () => {
              window.__qaDesktopInfoCalls++;
              if (config.desktop === "rejected") return Promise.reject(new Error("Synthetic native status unavailable"));
              return resolved ? Promise.resolve(info) : new Promise(resolve => pending.push(resolve));
            },
            updates: {
              getStatus: async () => ({ state: "up-to-date" }),
              check: async () => { window.__qaDesktopUpdateChecks++; return { state: "up-to-date" }; },
            },
          };
        }

        window.__qaInstallerFlashes = [];
        if (config.name !== "windows-browser") {
          const forbidden = [".app-navbar a[href='/open-desktop']"];
          if (config.desktop) forbidden.push("a[download='HayKasa-Setup-x64.exe']");
          const inspect = node => {
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            if (!node) return;
            for (const selector of forbidden) {
              if ((node.matches?.(selector) || node.querySelector?.(selector)) && !window.__qaInstallerFlashes.includes(selector)) {
                window.__qaInstallerFlashes.push(selector);
              }
            }
          };
          new MutationObserver(records => {
            for (const record of records) {
              inspect(record.target);
              record.addedNodes.forEach(inspect);
            }
          }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
        }
      }, testCase);

      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith("/api/") || url.pathname === "/api/android/download") return route.continue();
        const fixtures = {
          "/api/auth/session": { user: { id: "507f1f77bcf86cd799439013", name: "Installation QA", email: "qa@example.invalid" }, expires: "2099-01-01T00:00:00Z" },
          "/api/settings": { success: true, authenticated: true, settings: { privateSession: false, explicitContent: true }, genres: [] },
          "/api/language": { success: true, authenticated: true, language: ["English"] },
          "/api/genres": { success: true, genres: [], tree: [], personal: [] },
          "/api/userPlaylists": { success: true, data: { playlists: [] } },
          "/api/followedArtists": { success: true, data: [], artists: [] },
          "/api/favourite": { success: true, data: { favourites: [] } },
          "/api/media/resolve": { enabled: false },
          "/api/desktop/manifest": { published: true, latest: "1.0.3", minimum: "1.0.0", desktopApiVersion: 1, downloadUrl: "/fixtures/HayKasa-Setup-x64.exe", sizeBytes: 20971520, signed: true },
          "/api/android/manifest": { available: true, downloadUrl: "/api/android/download", sizeBytes: 5026587, sha256: "a".repeat(64), preview: true, minimumAndroid: "6.0" },
        };
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(fixtures[url.pathname] || { success: true, data: [] }) });
      });

      page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin + "/settings", { waitUntil: "domcontentloaded" });
      const navbar = page.locator(".app-navbar");
      const install = navbar.getByRole("link", { name: "Install app", exact: true });
      const windowsDownload = page.getByRole("link", { name: "Download for Windows", exact: true });
      const androidDownload = page.locator("[data-testid='android-download-card']").getByRole("link", { name: "Download for Android", exact: true });
      await androidDownload.waitFor();
      assert.equal(await androidDownload.getAttribute("href"), "/api/android/download", `${testCase.name}: explicit Settings APK download remains available`);
      const coverage = ["Settings APK download preserved", "no unhandled UI exceptions"];

      if (testCase.name === "windows-browser") {
        await install.waitFor();
        assert.equal(await install.getAttribute("href"), "/open-desktop");
        await windowsDownload.waitFor();
        assert.equal(await windowsDownload.getAttribute("href"), "/fixtures/HayKasa-Setup-x64.exe");
        await navbar.screenshot({ path: path.join(output, "windows-browser-header.png") });
        await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
        await install.waitFor({ state: "detached" });
        assert.equal(await windowsDownload.count(), 1, "appinstalled preserves the explicit Settings Windows download");
        coverage.push("browser Navbar install link", "browser Windows download", "appinstalled hides existing browser-tab install link");
      } else {
        if (testCase.desktop) {
          await page.getByRole("heading", { name: "Desktop app controls", exact: true }).waitFor();
          await page.waitForFunction(() => window.__qaDesktopInfoCalls > 0);
          if (testCase.desktop === "delayed") {
            await page.getByRole("status").filter({ hasText: "Reading desktop app status…" }).waitFor();
            assert.equal(await windowsDownload.count(), 0, "Pending native desktop status never offers the Windows installer");
            assert.equal(await install.count(), 0, "Pending native desktop status never offers Navbar installation");
            await navbar.screenshot({ path: path.join(output, "native-desktop-before-status-header.png") });
            await page.evaluate(() => window.__qaResolveDesktopInfo());
            await page.getByText("HayKasa 1.0.2", { exact: true }).waitFor();
            const checkUpdates = page.getByRole("button", { name: "Check for updates", exact: true });
            await checkUpdates.waitFor();
            await checkUpdates.click();
            await page.waitForFunction(() => window.__qaDesktopUpdateChecks === 1);
            await page.getByText("HayKasa Desktop is up to date.", { exact: true }).waitFor();
            await navbar.screenshot({ path: path.join(output, "native-desktop-after-status-header.png") });
            coverage.push("delayed native status has no installer flash", "installed desktop version", "native updater action preserved");
          } else {
            await page.getByRole("status").filter({ hasText: "Desktop status is unavailable. Close and reopen HayKasa to retry." }).waitFor();
            coverage.push("rejected native status shows recovery message");
          }
          assert.equal(await windowsDownload.count(), 0, `${testCase.name}: native desktop does not offer its installer`);
        }
        assert.equal(await install.count(), 0, `${testCase.name}: generic Navbar installation is absent`);
        assert.deepEqual(await page.evaluate(() => window.__qaInstallerFlashes), [], `${testCase.name}: MutationObserver saw no generic installation flash`);
        coverage.push("generic Navbar install link absent throughout rendering");
      }
      assert.deepEqual(errors, [], `${testCase.name}: no unhandled UI exceptions`);
      results.push({ context: testCase.name, passed: true, coverage });
    } catch (error) {
      await page?.screenshot({ path: path.join(output, `${testCase.name}-failure.png`) }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  return results;
};
