const { test, expect } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const hook = readFileSync(resolve(__dirname, "../src/hooks/useAudioEq.js"), "utf8")
  .replace(/^import .*;\n/gm, "").replace("export default ", "");
const presets = readFileSync(resolve(__dirname, "../src/utils/eqPresets.js"), "utf8").replace(/export /g, "");

for (const [label, left, right, expected] of [["left only", 0.25, 0, 0.125], ["right only", 0, 0.25, 0.125], ["balanced", 0.25, 0.25, 0.25], ["mute", 0, 0, 0], ["opposite phase", 0.25, -0.25, 0]]) {
  test(`native mono averages both PCM inputs: ${label}`, async ({ page }) => {
    const peaks = await page.evaluate(async ({ hook, presets, left, right }) => {
      const render = async monoAudio => {
      const context = new OfflineAudioContext(2, 4800, 48000);
      const source = context.createBufferSource();
      const buffer = context.createBuffer(2, 4800, 48000);
      buffer.getChannelData(0).fill(left);
      buffer.getChannelData(1).fill(right);
      source.buffer = buffer;
      context.createMediaElementSource = () => source;
      window.AudioContext = function () { return context; };
      const effects = [];
      const graphRef = { current: null };
      const audio = { paused: true, addEventListener() {}, removeEventListener() {} };
      const runEqHook = new Function("useRef", "useEffect", "useCallback", "resumeAudioContext", `${presets}\n${hook}\nreturn useAudioEq;`)(
        () => graphRef, fn => effects.push(fn), fn => fn, async () => {},
      );
      runEqHook({ current: audio }, { bands: [0, 0, 0, 0, 0, 0], normalization: "normal", monoAudio });
      effects[0](); effects[1]();
      source.start();
      const rendered = await context.startRendering();
      return [0, 1].map(channel => Array.from(rendered.getChannelData(channel)));
      };
      const stereo = await render(false);
      const mono = await render(true);
      const errors = mono.map(channel => Math.max(...channel.map((sample, index) => Math.abs(sample - (stereo[0][index] + stereo[1][index]) / 2))));
      return { errors, peaks: mono.map(channel => Math.max(...channel.map(Math.abs))) };
    }, { hook, presets, left, right });
    expect(peaks.errors[0]).toBeLessThan(0.00001);
    expect(peaks.errors[1]).toBeLessThan(0.00001);
    if (expected > 0) expect(peaks.peaks[0]).toBeGreaterThan(0);
    else expect(peaks.peaks[0]).toBeLessThan(0.00001);
  });
}

const CHANNEL = "UCaaaaaaaaaaaaaaaaaaaaaa";
async function fixture(page, overrides = {}) {
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (overrides[path]) return overrides[path](route);
    if (path === "/api/auth/session") return route.fulfill({ json: { user: { id: "pr24-user", name: "Listener" }, expires: "2099-01-01T00:00:00.000Z" } });
    if (path === "/api/settings") return route.fulfill({ json: { authenticated: true, settings: {} } });
    if (path === "/api/language") return route.fulfill({ json: { authenticated: true, language: [] } });
    return route.fulfill({ json: { success: true, data: [], artists: [], results: [], tracks: [], genres: [], tree: [], personalGenres: [], sections: {} } });
  });
}

test("artist follow uses channel membership and sends an explicit desired state", async ({ page }) => {
  let body;
  await fixture(page, {
    "/api/youtube-channel": route => route.fulfill({ json: { artist: { id: CHANNEL, title: "Shared name" }, tracks: [] } }),
    "/api/followedArtists": route => {
      if (route.request().method() === "POST") {
        body = route.request().postDataJSON();
        return route.fulfill({ json: { success: true, data: ["Shared name"], artists: [{ name: "Shared name", channelId: CHANNEL }] } });
      }
      return route.fulfill({ json: { success: true, data: ["Shared name"], artists: [{ name: "Shared name", channelId: "UCbbbbbbbbbbbbbbbbbbbbbb" }, ...(body ? [{ name: "Shared name", channelId: CHANNEL }] : [])] } });
    },
  });
  await page.goto(`/artist/${CHANNEL}`, { waitUntil: "domcontentloaded" });
  const follow = page.getByRole("button", { name: "Follow", exact: true });
  await expect(follow).toBeEnabled();
  await follow.click();
  await expect.poll(() => body?.followed).toBe(true);
  expect(body.channelId).toBe(CHANNEL);
  await expect(page.getByRole("button", { name: "Following", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("unavailable track keeps artist navigation readable and playback disabled", async ({ page }) => {
  await fixture(page, {
    "/api/favourite": route => route.fulfill({ json: { success: true, data: { favourites: ["abcdefghijk"] } } }),
    "/api/youtube-videos": route => route.fulfill({ json: { tracks: [{ id: "abcdefghijk", title: "Unavailable track", channel: "Artist", channelId: CHANNEL, unavailable: true, unavailableReason: "Video unavailable" }] } }),
  });
  await page.goto("/library/liked", { waitUntil: "domcontentloaded" });
  const row = page.locator('.playlist-track-row[data-unavailable="true"]');
  const link = row.getByRole("link", { name: "Artist", exact: true });
  await expect(link).toBeVisible();
  await expect(row.getByRole("button", { name: "Unavailable track unavailable", exact: true })).toBeDisabled();
  const readAppearance = () => link.evaluate(element => {
    let opacity = 1;
    for (let current = element; current; current = current.parentElement) opacity *= Number(getComputedStyle(current).opacity);
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const fg = rgb(getComputedStyle(element).color);
    const bg = rgb(getComputedStyle(document.body).backgroundColor);
    const luminance = color => color.map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    return { opacity, contrast: (Math.max(luminance(fg), luminance(bg)) + 0.05) / (Math.min(luminance(fg), luminance(bg)) + 0.05) };
  });
  // Page entry motion fades the entire route; measure the settled link styling.
  await expect.poll(async () => (await readAppearance()).opacity).toBe(1);
  const appearance = await readAppearance();
  expect(appearance.opacity).toBe(1);
  expect(appearance.contrast).toBeGreaterThanOrEqual(4.5);
  await link.focus();
  await expect(link).toBeFocused();
  await expect(row.getByRole("button", { name: "Remove Unavailable track from Liked Songs", exact: true })).toBeEnabled();
});

test("switching accounts during a follow save restores the new account's controls", async ({ page }) => {
  let account = "account-a";
  let started = false;
  let newAccountRead = false;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await fixture(page, {
    "/api/auth/session": route => route.fulfill({ json: { user: { id: account, name: account }, expires: "2099-01-01T00:00:00.000Z" } }),
    "/api/youtube-search": route => route.fulfill({ json: { results: [{ id: CHANNEL, title: "Artist", thumbnail: "" }] } }),
    "/api/followedArtists": async route => {
      if (route.request().method() === "POST") {
        started = true;
        await pending;
        return route.fulfill({ json: { success: true, data: ["Artist"], artists: [{ name: "Artist", channelId: CHANNEL }] } });
      }
      if (account === "account-b") newAccountRead = true;
      return route.fulfill({ json: { success: true, data: [], artists: [] } });
    },
  });
  try {
    await page.goto("/search/Artist?type=channel", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Follow", exact: true }).click();
    await expect.poll(() => started).toBe(true);
    account = "account-b";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "getSession" }, timestamp: Date.now() }),
    })));
    await expect.poll(() => newAccountRead).toBe(true);
    await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeEnabled({ timeout: 5000 });
    const completed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/followedArtists" && response.request().method() === "POST");
    release();
    await (await completed).finished();
    await expect(page.getByRole("button", { name: "Follow", exact: true })).toHaveAttribute("aria-pressed", "false");
  } finally { release(); }
});
