import assert from "node:assert/strict";
import test from "node:test";
import { likedOnThisDay } from "../src/utils/thisDayOnKasa.mjs";

test("this day on Kasa keeps past-year likes for the local calendar day", () => {
  const now = new Date(2026, 8, 18, 21, 0, 0);
  const liked = likedOnThisDay({
    abcdefghijk: new Date(2024, 8, 18, 8, 0, 0),
    lmnopqrstuv: "2025-09-18T12:00:00",
    sameyearid1: new Date(2026, 8, 18),
    otherdayid1: new Date(2024, 8, 17),
    "bad id": new Date(2024, 8, 18),
  }, now);
  assert.deepEqual(liked.map((item) => item.id), ["lmnopqrstuv", "abcdefghijk"]);
  assert.equal(liked[0].year, 2025);
  assert.equal(liked[1].year, 2024);
});

test("this day on Kasa accepts a Map and drops invalid dates", () => {
  const now = new Date(2026, 0, 1);
  const liked = likedOnThisDay(new Map([
    ["abcdefghijk", "not-a-date"],
    ["lmnopqrstuv", new Date(2022, 0, 1)],
  ]), now);
  assert.deepEqual(liked.map((item) => item.id), ["lmnopqrstuv"]);
});
