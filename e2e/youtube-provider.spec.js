import { expect, test } from "@playwright/test";
import { classifyYoutubeProviderFailure } from "../src/utils/youtubeProviderFailure.mjs";

const EMBED_RESTRICTION_CODES = new Set([100, 101, 150]);
const PROVIDER_SMOKE_TRACKS = [
  {
    id: "aqz-KE-bpKQ",
    title: "Big Buck Bunny",
    channel: "Blender Foundation",
    thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
    seedQuery: "Big Buck Bunny",
  },
  {
    id: "jNQXAC9IVRw",
    title: "Me at the zoo",
    channel: "jawed",
    thumbnail: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
    seedQuery: "Me at the zoo",
  },
  {
    id: "M7lc1UVf-VE",
    title: "YouTube IFrame API Demo",
    channel: "YouTube Developers",
    thumbnail: "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
    seedQuery: "YouTube IFrame API Demo",
  },
];

async function probeRawYoutubePlayback(page, videoId) {
  return page.evaluate((candidateId) => new Promise((resolve) => {
    const mount = document.createElement("div");
    mount.id = `youtube-provider-baseline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mount.style.position = "fixed";
    mount.style.left = "12px";
    mount.style.top = "12px";
    mount.style.width = "320px";
    mount.style.height = "180px";
    mount.style.zIndex = "2147483647";
    document.body.appendChild(mount);

    let settled = false;
    let timer = null;
    let player = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      try { player?.destroy?.(); } catch {}
      mount.remove();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finish({ status: "timeout", code: 0, current: 0 });
    }, 15_000);

    const originalFinish = finish;
    const finishWithTimeoutClear = (result) => {
      clearTimeout(timeout);
      originalFinish(result);
    };

    try {
      player = new window.YT.Player(mount.id, {
        host: "https://www.youtube.com",
        videoId: candidateId,
        width: "320",
        height: "180",
        playerVars: {
          autoplay: 0,
          controls: 0,
          enablejsapi: 1,
          mute: 1,
          origin: window.location.origin,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            event.target.mute?.();
            event.target.playVideo?.();
            timer = setInterval(() => {
              const current = Number(event.target.getCurrentTime?.() || 0);
              if (current > 0.5) {
                finishWithTimeoutClear({ status: "played", code: 0, current });
              }
            }, 200);
          },
          onError: (event) => {
            finishWithTimeoutClear({
              status: "provider-error",
              code: Number(event.data) || 0,
              current: Number(event.target?.getCurrentTime?.() || 0),
            });
          },
        },
      });
    } catch (error) {
      finishWithTimeoutClear({
        status: "integration-error",
        code: 0,
        current: 0,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }), videoId);
}

test.describe("real YouTube provider smoke", () => {
  test.skip(process.env.HEYKASA_REAL_YOUTUBE_E2E !== "1", "Real provider smoke runs only in its dedicated workflow.");

  test("creates, plays, and repositions a real cross-origin YouTube iframe", async ({ page }, testInfo) => {
    const providerSignals = {
      requestFailures: [],
      responseStatuses: [],
      playerErrorCodes: [],
      providerApiLoaded: false,
    };
    const recordPlayerErrors = (codes = []) => {
      for (const value of codes) {
        const code = Number(value);
        if (Number.isFinite(code) && !providerSignals.playerErrorCodes.includes(code)) {
          providerSignals.playerErrorCodes.push(code);
        }
      }
    };

    page.on("requestfailed", (request) => {
      const url = request.url();
      if (!/(?:youtube|googlevideo|ytimg)/i.test(url)) return;
      providerSignals.requestFailures.push(`${url} ${request.failure()?.errorText || "request failed"}`);
    });
    page.on("response", (response) => {
      const url = response.url();
      if (!/(?:youtube|googlevideo|ytimg)/i.test(url)) return;
      const status = response.status();
      if (status >= 400) providerSignals.responseStatuses.push({ url, status });
    });

    await page.addInitScript((seeds) => {
      window.__youtubeProviderErrorCodes = [];
      window.addEventListener("heykasa:youtube-provider-error", (event) => {
        const code = Number(event?.detail?.code);
        if (Number.isFinite(code)) window.__youtubeProviderErrorCodes.push(code);
      });

      const storedIndex = Number(localStorage.getItem("heykasa:provider-smoke-index"));
      const index = Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < seeds.length
        ? storedIndex
        : 0;
      const seed = seeds[index];

      localStorage.setItem("persist:settings", JSON.stringify({
        owner: JSON.stringify("account:test-a"),
        audioOnly: "false",
        dataSaver: "false",
        syncedLyrics: "true",
      }));
      localStorage.setItem("heykasa:playback:v1:account%3Atest-a", JSON.stringify({
        version: 1,
        owner: "account:test-a",
        savedAt: Date.now(),
        youtubeVideo: seed,
        youtubeQueue: [seed],
        queueMode: "radio",
        isPlaying: false,
        position: 0,
      }));
    }, PROVIDER_SMOKE_TRACKS);

    await page.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/session") {
        return route.fulfill({
          json: { user: { id: "test-a", name: "Provider Smoke" }, expires: "2099-01-01T00:00:00.000Z" },
        });
      }
      if (pathname === "/api/auth/providers") return route.fulfill({ json: {} });
      if (pathname === "/api/settings") {
        return route.fulfill({ json: { authenticated: true, settings: { audioOnly: false, dataSaver: false } } });
      }
      if (pathname === "/api/favourite") {
        return route.fulfill({ json: { success: true, data: { favourites: [] } } });
      }
      return route.fulfill({
        json: { success: true, authenticated: true, data: [], results: [], genres: [], tree: [], personalGenres: [] },
      });
    });

    try {
      let activeTrack = null;

      for (let index = 0; index < PROVIDER_SMOKE_TRACKS.length; index += 1) {
        const track = PROVIDER_SMOKE_TRACKS[index];
        if (index === 0) {
          await page.goto("/search", { waitUntil: "domcontentloaded" });
        } else {
          await page.evaluate((nextIndex) => {
            localStorage.setItem("heykasa:provider-smoke-index", String(nextIndex));
          }, index);
          await page.reload({ waitUntil: "domcontentloaded" });
        }

        await expect(page.getByTestId("player-dock")).toBeVisible();
        await expect.poll(
          async () => {
            const loaded = await page.evaluate(() => typeof window.YT?.Player === "function");
            providerSignals.providerApiLoaded = providerSignals.providerApiLoaded || loaded;
            return loaded;
          },
          { timeout: 60_000 },
        ).toBe(true);

        const baseline = await probeRawYoutubePlayback(page, track.id);
        console.info("[youtube-provider-baseline]", JSON.stringify({
          videoId: track.id,
          origin: await page.evaluate(() => window.location.origin),
          ...baseline,
        }));
        if (baseline.status === "provider-error" && EMBED_RESTRICTION_CODES.has(Number(baseline.code))) {
          recordPlayerErrors([baseline.code]);
          if (index + 1 < PROVIDER_SMOKE_TRACKS.length) continue;
          throw new Error(
            `Raw YouTube baseline rejected all smoke candidates with provider code ${baseline.code}`,
          );
        }
        if (baseline.status !== "played") {
          throw new Error(
            `Raw YouTube baseline did not prove playback for ${track.id}: ${baseline.status}`,
          );
        }

        const realFrame = page.locator(
          '[data-testid="youtube-decks"] iframe[src*="youtube.com/embed/"], [data-testid="youtube-decks"] iframe[src*="youtube-nocookie.com/embed/"]',
        ).first();
        await expect(realFrame).toBeAttached({ timeout: 60_000 });
        await expect(realFrame).toHaveAttribute("src", new RegExp(track.id));

        const progress = page.getByRole("slider", { name: "Song progress" }).first();
        const before = Number(await progress.inputValue());
        const playButton = page.getByRole("button", { name: "Play", exact: true }).first();
        await expect(playButton).toBeEnabled({ timeout: 30_000 });
        await playButton.click();

        let outcome;
        try {
          const handle = await page.waitForFunction(
            (threshold) => {
              const slider = document.querySelector('input[aria-label="Song progress"]');
              const current = Number(slider?.value || 0);
              const errors = Array.isArray(window.__youtubeProviderErrorCodes)
                ? [...window.__youtubeProviderErrorCodes]
                : [];
              if (current > threshold) return { status: "played", current, errors };
              if (errors.length > 0) return { status: "provider-error", current, errors };
              return false;
            },
            before + 0.5,
            { timeout: 30_000 },
          );
          outcome = await handle.jsonValue();
        } catch (error) {
          const codes = await page.evaluate(
            () => Array.isArray(window.__youtubeProviderErrorCodes)
              ? [...window.__youtubeProviderErrorCodes]
              : [],
          );
          recordPlayerErrors(codes);
          const externallyRestricted = codes.some((code) => EMBED_RESTRICTION_CODES.has(Number(code)));
          if (externallyRestricted && index + 1 < PROVIDER_SMOKE_TRACKS.length) continue;
          throw error;
        }

        recordPlayerErrors(outcome?.errors);
        if (outcome?.status === "provider-error") {
          const externallyRestricted = outcome.errors.some((code) => EMBED_RESTRICTION_CODES.has(Number(code)));
          if (externallyRestricted && index + 1 < PROVIDER_SMOKE_TRACKS.length) continue;
          throw new Error(`YouTube provider rejected playback with code(s): ${outcome.errors.join(", ")}`);
        }

        activeTrack = track;
        console.info("[youtube-provider-smoke] playback verified", JSON.stringify({
          videoId: track.id,
          progress: outcome?.current,
          rejectedCandidates: providerSignals.playerErrorCodes,
        }));
        break;
      }

      if (!activeTrack) {
        throw new Error(
          `All provider smoke candidates were rejected for embedding/playback: ${providerSignals.playerErrorCodes.join(", ")}`,
        );
      }

      await page.keyboard.press("v");
      const theater = page.getByRole("dialog", { name: "Expanded video" });
      await expect(theater).toBeVisible();

      const deck = page.getByTestId("youtube-decks");
      await expect(deck).toHaveAttribute("aria-hidden", "false");
      const box = await deck.boundingBox();
      expect(box).not.toBeNull();
      expect(box.width).toBeGreaterThan(200);
      expect(box.height).toBeGreaterThan(112);
    } catch (error) {
      try {
        recordPlayerErrors(await page.evaluate(
          () => Array.isArray(window.__youtubeProviderErrorCodes)
            ? [...window.__youtubeProviderErrorCodes]
            : [],
        ));
      } catch {
        // The page may already be gone; keep the provider signals collected so far.
      }
      const failureMessage = error instanceof Error ? error.message : String(error);
      const classification = classifyYoutubeProviderFailure({
        ...providerSignals,
        message: failureMessage,
      });
      console.warn("[youtube-provider-smoke]", JSON.stringify({
        classification,
        playerErrorCodes: providerSignals.playerErrorCodes,
        responseStatuses: providerSignals.responseStatuses,
        requestFailures: providerSignals.requestFailures,
        message: failureMessage,
      }));
      testInfo.annotations.push({
        type: "youtube-provider-failure",
        description: classification,
      });
      if (classification === "external-provider") {
        test.skip(true, "All real YouTube smoke candidates were blocked by provider/network availability.");
      }
      throw error;
    }
  });
});
