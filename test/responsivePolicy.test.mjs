import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(root, "src/utils/responsivePolicy.mjs");

async function policy() {
  assert.equal(existsSync(policyPath), true, "src/utils/responsivePolicy.mjs must own responsive semantics");
  return import(pathToFileURL(policyPath).href + `?t=${Date.now()}`);
}

test("responsive policy classifies portrait phone, rotated phone, tablet, and desktop", async () => {
  const {
    PHONE_PORTRAIT_QUERY,
    PHONE_LANDSCAPE_QUERY,
    PHONE_QUERY,
    COMPACT_TOUCH_QUERY,
    DESKTOP_QUERY,
    responsiveLayoutForViewport,
  } = await policy();

  assert.equal(PHONE_PORTRAIT_QUERY, "(max-width: 767px)");
  assert.equal(PHONE_LANDSCAPE_QUERY, "(orientation: landscape) and (max-height: 540px) and (max-width: 1100px)");
  assert.match(PHONE_QUERY, /max-width: 767px/);
  assert.match(COMPACT_TOUCH_QUERY, /pointer: coarse/);
  assert.match(DESKTOP_QUERY, /pointer: fine/);

  assert.deepEqual(
    responsiveLayoutForViewport({ width: 390, height: 844, pointer: "coarse" }),
    { phone: true, compactTouch: true, desktop: false },
  );
  assert.deepEqual(
    responsiveLayoutForViewport({ width: 844, height: 390, pointer: "coarse" }),
    { phone: true, compactTouch: true, desktop: false },
  );
  assert.deepEqual(
    responsiveLayoutForViewport({ width: 1024, height: 768, pointer: "coarse" }),
    { phone: false, compactTouch: true, desktop: false },
  );
  assert.deepEqual(
    responsiveLayoutForViewport({ width: 1440, height: 900, pointer: "fine" }),
    { phone: false, compactTouch: false, desktop: true },
  );
});

test("responsive policy changes classification across resize and orientation transitions", async () => {
  const { responsiveLayoutForViewport } = await policy();
  const portrait = responsiveLayoutForViewport({ width: 390, height: 844, pointer: "coarse" });
  const landscape = responsiveLayoutForViewport({ width: 844, height: 390, pointer: "coarse" });
  const tablet = responsiveLayoutForViewport({ width: 1024, height: 768, pointer: "coarse" });
  const desktop = responsiveLayoutForViewport({ width: 1440, height: 900, pointer: "fine" });

  assert.equal(portrait.phone, true);
  assert.equal(landscape.phone, true);
  assert.equal(tablet.phone, false);
  assert.equal(tablet.compactTouch, true);
  assert.equal(desktop.desktop, true);
});

test("initial media query matching uses the client matcher immediately and fails closed without one", async () => {
  const { initialMediaQueryMatch, PHONE_QUERY } = await policy();
  const calls = [];
  const matchMedia = (query) => {
    calls.push(query);
    return { matches: query === PHONE_QUERY };
  };

  assert.equal(initialMediaQueryMatch(PHONE_QUERY, matchMedia), true);
  assert.deepEqual(calls, [PHONE_QUERY]);
  assert.equal(initialMediaQueryMatch(PHONE_QUERY), false);
  assert.equal(initialMediaQueryMatch(PHONE_QUERY, () => { throw new Error("unsupported"); }), false);
});

test("responsive consumers do not own duplicate semantic breakpoint literals", async () => {
  const hook = readFileSync(path.join(root, "src/hooks/useMediaQuery.js"), "utf8");
  const appShell = readFileSync(path.join(root, "src/components/Layout/AppShell.jsx"), "utf8");
  const searchbar = readFileSync(path.join(root, "src/components/Searchbar.jsx"), "utf8");
  const mediaPresentation = readFileSync(path.join(root, "src/components/MusicPlayer/MediaPresentation.tsx"), "utf8");

  assert.match(hook, /initialMediaQueryMatch/);
  assert.doesNotMatch(appShell, /max-width:\s*767px/);
  assert.doesNotMatch(searchbar, /max-width:\s*767px/);
  assert.doesNotMatch(mediaPresentation, /max-width:\s*1180px/);
});
