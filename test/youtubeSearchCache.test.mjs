import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { placeAnchoredMenu } from "../src/utils/anchoredMenu.mjs";

register("./support/youtube-search-route-loader.mjs", import.meta.url);
const { GET } = await import("../src/app/api/youtube-search/route.js");

test("youtube search CDN cache matches the 15-minute shared metadata TTL", async () => {
  const response = await GET(new Request("http://localhost/api/youtube-search?q=Adele+Hello&type=video"));
  assert.equal(response.status, 200);
  const cache = response.headers.get("cache-control");
  assert.match(cache, /s-maxage=900\b/);
  assert.doesNotMatch(cache, /s-maxage=3600/);
  assert.doesNotMatch(cache, /stale-while-revalidate=86400/);
});

test("anchored menus sit below the trigger and flip above when they would overflow", () => {
  const below = placeAnchoredMenu({
    trigger: { top: 40, right: 280, bottom: 84 },
    menuHeight: 160,
    menuWidth: 240,
    viewportWidth: 800,
    viewportHeight: 600,
  });
  assert.equal(below.top, 88);
  assert.equal(below.left, 40);

  const flipped = placeAnchoredMenu({
    trigger: { top: 500, right: 280, bottom: 544 },
    menuHeight: 160,
    menuWidth: 240,
    viewportWidth: 800,
    viewportHeight: 600,
  });
  assert.equal(flipped.top, 336);
  assert.ok(flipped.top + 160 <= 600);
});
