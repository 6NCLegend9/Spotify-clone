import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Arcade queue picker uses occurrence identity instead of collapsing duplicate video ids", async () => {
  const picker = await read("src/components/Arcade/ArcadeSongPicker.jsx");
  assert.match(picker, /queueWithoutCurrentOccurrence/);
  assert.match(picker, /key=\{track\.queueEntryId \|\| track\.id\}/);
  assert.doesNotMatch(picker, /queue\.filter\(\(item\) => item\.id !== current\.id\)/);
});
