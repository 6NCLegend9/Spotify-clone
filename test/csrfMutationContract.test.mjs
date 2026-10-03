import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const COOKIE_AUTH_MUTATION_ROUTES = [
  "src/app/api/account/sessions/route.js",
  "src/app/api/deleteAccount/route.js",
  "src/app/api/discord/oauth/route.js",
  "src/app/api/favourite/route.js",
  "src/app/api/followedArtists/route.js",
  "src/app/api/genres/route.js",
  "src/app/api/history/route.js",
  "src/app/api/jam/events/route.js",
  "src/app/api/jam/route.js",
  "src/app/api/language/route.js",
  "src/app/api/notifications/read/route.js",
  "src/app/api/playEvent/route.js",
  "src/app/api/recommendations/route.js",
  "src/app/api/searches/route.js",
  "src/app/api/settings/route.js",
  "src/app/api/tags/route.js",
  "src/app/api/userPlaylists/like/route.js",
  "src/app/api/userPlaylists/route.js",
  "src/app/api/userPlaylists/songs/route.js",
];

test("every cookie-authenticated mutation route enforces the trusted Origin contract", async () => {
  for (const file of COOKIE_AUTH_MUTATION_ROUTES) {
    const source = await read(file);
    assert.match(source, /isTrustedRequestOrigin/, file);
    const mutations = [...source.matchAll(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(([^)]+)\)/g)];
    assert.ok(mutations.length > 0, `${file}: expected an exported mutation method`);
    for (const [, method, rawParameter] of mutations) {
      const parameter = rawParameter.trim().split(/[,:=\s]/, 1)[0];
      const start = source.indexOf(`export async function ${method}`, mutations[0].index);
      const nextExport = source.indexOf("export async function ", start + 1);
      const body = source.slice(start, nextExport < 0 ? source.length : nextExport);
      assert.match(
        body,
        new RegExp(`isTrustedRequestOrigin\\(${parameter}\\)`),
        `${file} ${method}: missing trusted Origin check`,
      );
    }
  }
});

test("shared recommendation feedback mutations enforce trusted Origin once at their common write boundary", async () => {
  const source = await read("src/utils/feedbackRoute.js");
  assert.match(source, /isTrustedRequestOrigin/);
  assert.match(
    source,
    /const write = \(remove\) => async \(request\) => \{[\s\S]*?isTrustedRequestOrigin\(request\)/,
  );
});
