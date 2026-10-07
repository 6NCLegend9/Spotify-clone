import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mutateDocument } from "../src/utils/documentMutation.mjs";
import * as membership from "../src/utils/followedArtistsList.mjs";
import { ApiRouteError } from "../src/utils/apiResponseCore.mjs";

const source = (await readFile(new URL("../src/app/api/followedArtists/route.js", import.meta.url), "utf8")).replace(/^import[\s\S]*?;\n/gm, "").replace(/export /g, "");
const A = "UCaaaaaaaaaaaaaaaaaaaaaa";
const B = "UCbbbbbbbbbbbbbbbbbbbbbb";
function fixture(initial = {}) {
  let value = { _id: "profile", followedArtists: [], followedArtistsMeta: [], ...initial };
  const model = {
    findById: () => ({ lean: async () => structuredClone(value) }),
    findOneAndUpdate: (filter, update) => ({ lean: async () => {
      const matches = filter.$and.every(c => Object.entries(c).every(([field, check]) => check.$exists === false ? value[field] === undefined : JSON.stringify(value[field]) === JSON.stringify(check.$eq)));
      if (!matches) return null;
      value = { ...value, ...structuredClone(update.$set), __v: (value.__v || 0) + 1 };
      return structuredClone(value);
    } }),
  };
  const deps = {
    ...membership, mutateDocument, UserData: model, ApiRouteError,
    NextResponse: { json: Response.json }, isTrustedRequestOrigin: () => true,
    isRateLimited: async () => ({ limited: false }), allowlistedMediaUrl: () => "",
    getAuthenticatedAccount: async () => {
      const doc = structuredClone(value);
      doc.save = async () => { const { save: _save, ...saved } = doc; value = saved; };
      return { userData: doc, email: "fixture@example.test" };
    },
    readRequestJson: request => request.json(),
    apiError: (code, detail = {}) => Response.json({ code, ...detail }, { status: code === "VALIDATION_ERROR" ? 400 : 500 }),
    handleApiError: error => Response.json({ code: error.code }, { status: error.status || 500 }),
  };
  const names = [...new Set([...Object.keys(deps), "isArtistFollowed", "followedArtistsForDisplay", "updateArtistMembership"])];
  const route = new Function(...names, `${source}\nreturn { POST, PATCH, GET };`)(...names.map(name => deps[name]));
  const post = (name, channelId, followed = true) => route.POST({ json: async () => ({ name, channelId, followed }) });
  return { post, route, read: () => value };
}

test("same-name channel identities coexist and repeated desired follows are idempotent", async () => {
  const storage = fixture();
  for (const id of [A, B, B]) assert.equal((await storage.post("Artist", id)).status, 200);
  assert.deepEqual(storage.read().followedArtistsMeta.map(a => a.channelId), [A, B]);
  await storage.post("Artist", A, false);
  assert.deepEqual(storage.read().followedArtistsMeta.map(a => a.channelId), [B]);
  assert.deepEqual(storage.read().followedArtists, ["Artist"]);
});

test("concurrent artist follows retain both memberships", async () => {
  const storage = fixture();
  await Promise.all([storage.post("Artist A", A), storage.post("Artist B", B)]);
  assert.deepEqual(new Set(storage.read().followedArtistsMeta.map(a => a.channelId)), new Set([A, B]));
});

test("renamed channel follows retain identity and legacy name-only follows can be upgraded", async () => {
  const storage = fixture({ followedArtists: ["Old name", "Legacy"], followedArtistsMeta: [{ name: "Old name", channelId: A, followedAt: "2020-01-01" }] });
  await storage.post("New name", A);
  await storage.post("Legacy", B);
  assert.deepEqual(storage.read().followedArtists, ["New name", "Legacy"]);
  assert.equal(storage.read().followedArtistsMeta.find(a => a.channelId === A).followedAt, "2020-01-01");
});

test("artist capacity rejects new follows without evicting existing memberships", async () => {
  const storage = fixture({ followedArtists: Array.from({ length: 100 }, (_, i) => `Legacy ${i}`) });
  assert.equal((await storage.post("New", A)).status, 400);
  assert.equal(storage.read().followedArtists.length, 100);
  assert.equal(storage.read().followedArtists[0], "Legacy 0");
});

test("invalid identities and desired membership types are rejected", async () => {
  for (const [id, followed] of [["javascript:unsafe", true], [A, "false"]]) {
    const storage = fixture();
    assert.equal((await storage.post("Artist", id, followed)).status, 400);
    assert.deepEqual(storage.read().followedArtists, []);
  }
});

test("release selection preserves distinct channel IDs with the same display name", () => {
  const artists = membership.followedArtistsForReleases({ followedArtists: ["Artist"], followedArtistsMeta: [{ name: "Artist", channelId: A }, { name: "Artist", channelId: B }] });
  assert.deepEqual(artists.map(a => a.channelId), [A, B]);
});
