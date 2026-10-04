import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSongIdentity, sameRadioSongFamily } from "../src/utils/songIdentity.mjs";

test("non-Latin alternate uploads keep a canonical song identity", () => {
  const original = {
    id: "HEBREW00001",
    title: "נועה קירל - פנתרה (Official Audio)",
    channel: "נועה קירל - Topic",
  };
  const mirror = {
    id: "HEBREW00002",
    title: "נועה קירל - פנתרה Lyrics",
    channel: "Mirror Upload",
  };

  assert.notEqual(canonicalSongIdentity(original), "");
  assert.equal(sameRadioSongFamily(original, mirror), true);
});

test("Unicode normalization still keeps unrelated artists distinct", () => {
  const first = {
    id: "KOREAN00001",
    title: "아이유 - 밤편지",
    channel: "Label One",
  };
  const second = {
    id: "KOREAN00002",
    title: "태연 - 밤편지",
    channel: "Label Two",
  };

  assert.notEqual(canonicalSongIdentity(first), canonicalSongIdentity(second));
  assert.equal(sameRadioSongFamily(first, second), false);
});
