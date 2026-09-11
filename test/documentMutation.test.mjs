import assert from "node:assert/strict";
import test from "node:test";
import { boundedMembership, dateMapForMembers, mutateDocument } from "../src/utils/documentMutation.mjs";

function fixture(initial) {
  let value = structuredClone(initial);
  let conflicts = 0;
  return {
    model: {
      findById: () => ({ lean: async () => structuredClone(value) }),
      findOneAndUpdate(filter, update) {
        return { lean: async () => {
          const matched = filter.$and.every((condition) => Object.entries(condition).every(([field, check]) =>
            check.$exists === false ? value[field] === undefined : JSON.stringify(value[field]) === JSON.stringify(check.$eq)));
          if (!matched) { conflicts += 1; return null; }
          value = { ...value, ...structuredClone(update.$set), __v: (value.__v || 0) + 1 };
          return structuredClone(value);
        } };
      },
    },
    read: () => value,
    conflicts: () => conflicts,
  };
}

test("concurrent library writes retry rather than overwrite each other", async () => {
  const storage = fixture({ _id: "profile", favourites: [] });
  await Promise.all(["one", "two", "three"].map((id) => mutateDocument(storage.model, "profile", (current) => ({
    favourites: boundedMembership(current.favourites, id, true, 500),
  }))));
  assert.deepEqual(new Set(storage.read().favourites), new Set(["one", "two", "three"]));
  assert.ok(storage.conflicts() > 0);
});

test("concurrent capacity checks allow only one final slot and duplicate desired-state writes are idempotent", async () => {
  const storage = fixture({ _id: "playlist", songs: ["old"] });
  const results = await Promise.allSettled(["one", "two"].map((id) => mutateDocument(storage.model, "playlist", (current) => ({
    songs: boundedMembership(current.songs, id, true, 2),
  }))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(storage.read().songs.length, 2);
  const id = storage.read().songs[1];
  await mutateDocument(storage.model, "playlist", (current) => ({ songs: boundedMembership(current.songs, id, true, 2) }));
  assert.equal(storage.read().songs.length, 2);
  assert.deepEqual(dateMapForMembers([id], { old: "old-date", [id]: "kept-date" }, id), { [id]: "kept-date" });
});

test("persistent conflicts are bounded and cannot silently succeed", async () => {
  let attempts = 0;
  const model = {
    findById: () => ({ lean: async () => ({ _id: "profile", songs: [] }) }),
    findOneAndUpdate: () => ({ lean: async () => { attempts += 1; return null; } }),
  };
  await assert.rejects(mutateDocument(model, "profile", () => ({ songs: ["track"] })), { code: "CONFLICT" });
  assert.equal(attempts, 5);
});